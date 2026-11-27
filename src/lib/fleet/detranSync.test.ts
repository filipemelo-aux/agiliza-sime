// Exercita o mesmo handler publicado, com transporte e persistência isolados: nenhuma chamada paga.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import ts from 'typescript'
import { z } from 'zod'
import { describe, it, expect, vi } from 'vitest'
import { endpointDebitos, endpointIpvaComplementar, documentoObrigatorio } from '../../../supabase/functions/vehicle-debts-sync/normalize'
import { documentoDoProprietario } from '../../../supabase/functions/vehicle-debts-sync/proprietario'
import { consolidarResultados, podeQuitarAusente, validarCadastroConsulta } from '../../../supabase/functions/vehicle-debts-sync/resultado'
import { consultarFonte } from '../../../supabase/functions/vehicle-debts-sync/transporte'

async function executar(uf: string, respostas: Record<string, unknown>, renavam = '12345678901') {
  const documentos: Record<string, unknown>[] = [{ id: 'antigo', observacoes: '[detran:MULTA-ANTIGA]', status_pagamento: 'Vencido', valor_total: 100 }]
  const historico: Record<string, unknown>[] = []
  const pagamentos: unknown[] = []
  const sb = {
    auth: { getUser: async () => ({ data: { user: { id: 'usuario' } } }) },
    from: (tabela: string) => {
      let operacao = 'select'; let row: Record<string, unknown> = {}; let id = ''
      const query = {
        select: () => query, like: () => query, or: () => query,
        eq: (campo: string, valor: string) => { if (campo === 'id') id = valor; return query },
        maybeSingle: async () => ({ data: { plate: 'ABC1D23', renavam, chassis: null, owner_id: 'dono' } }),
        insert: (valor: Record<string, unknown>) => { row = valor; operacao = 'insert'; return query },
        update: (valor: Record<string, unknown>) => { row = valor; operacao = 'update'; return query },
        then: (sucesso: (v: unknown) => unknown) => {
          if (operacao === 'insert') (tabela === 'vehicle_debt_consultas' ? historico : documentos).push(row)
          if (operacao === 'update') { if (row.status_pagamento === 'Pago') pagamentos.push(row); Object.assign(documentos.find(d => d.id === id) ?? {}, row) }
          return Promise.resolve(sucesso({ error: null, data: tabela === 'profiles' ? [{ id: 'dono', user_id: null, cnpj: '12345678000199' }] : documentos }))
        },
      }
      return query
    },
  }
  const fetchMock = vi.fn(async (url: string) => {
    const ep = url.split('/api/v2/consultas/')[1]
    const resposta = respostas[ep]
    if (resposta instanceof Error) throw resposta
    if (!resposta) throw new Error(`Consulta inesperada: ${ep}`)
    return new Response(JSON.stringify(resposta), { status: 200 })
  })
  let handler: ((req: Request) => Promise<Response>) | undefined
  const deno = { env: { get: (nome: string) => ({ SUPABASE_SERVICE_ROLE_KEY: 'service-test', SUPABASE_URL: 'http://teste.local', SUPABASE_ANON_KEY: 'anon-test', LOVABLE_API_KEY: 'lov-test', UDC_INFOSIMPLES_API_KEY: 'info-test' } as Record<string, string>)[nome] }, serve: (h: typeof handler) => { handler = h } }
  const original = readFileSync(resolve(process.cwd(), 'supabase/functions/vehicle-debts-sync/index.ts'), 'utf8').replace(/^import .*\n/gm, '')
  const source = ts.transpileModule(original, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.None } }).outputText
  const carregar = new Function('createClient', 'z', 'corsHeaders', 'Deno', 'fetch', 'AbortSignal', 'endpointDebitos', 'endpointIpvaComplementar', 'documentoObrigatorio', 'documentoDoProprietario', 'consolidarResultados', 'podeQuitarAusente', 'validarCadastroConsulta', 'consultarFonte', source)
  carregar(() => sb, z, {}, deno, fetchMock, { timeout: () => undefined }, endpointDebitos, endpointIpvaComplementar, documentoObrigatorio, documentoDoProprietario, consolidarResultados, podeQuitarAusente, validarCadastroConsulta, consultarFonte)
  if (!handler) throw new Error('Handler não registrado')
  const response = await handler(new Request('http://teste.local', { method: 'POST', headers: { Authorization: 'Bearer usuario-test', 'Content-Type': 'application/json' }, body: JSON.stringify({ vehicle_id: '11111111-1111-4111-8111-111111111111', uf }) }))
  return { response, body: await response.json(), documentos, historico, pagamentos, fetchMock }
}

describe('Handler de consulta e gravação de histórico', () => {
  it('TO grava e devolve IPVA SEFAZ mesmo com falha de rede no Detran; preserva a multa antiga', async () => {
    const r = await executar('TO', { 'detran/to/veiculo': new Error('Conexão perdida'), 'sefaz/to/ipva': { code: 200, data: [{ pagamentos: [{ descricao: 'IPVA 2026 COTA ÚNICA', valor: 'R$ 1.500,00', vencimento: '20/03/2026' }] }] } })
    expect(r.body).toMatchObject({ ok: true, parcial: true, importacao: { status: 'parcial', gravados: 1, quitados: 0 } })
    expect(r.documentos[0]).toMatchObject({ status_pagamento: 'Vencido', valor_total: 100 })
    expect(r.documentos[1]).toMatchObject({ tipo_documento: 'IPVA', valor_total: 1500 })
    expect(r.historico).toHaveLength(1); expect(r.historico[0].importacao).toMatchObject({ status: 'parcial', gravados: 1 })
    expect(r.pagamentos).toEqual([]); expect(r.fetchMock).toHaveBeenCalledTimes(2)
  })
  it('MA bloqueado grava a tentativa no histórico e não altera documentos', async () => {
    const r = await executar('MA', { 'detran/ma/licenciamento': { code: 613, errors: ['Servidor bloqueou'] } })
    expect(r.body).toMatchObject({ ok: false, history_saved: true, importacao: { status: 'falha', gravados: 0 } })
    expect(r.documentos).toHaveLength(1); expect(r.historico).toHaveLength(1)
    expect(r.pagamentos).toEqual([]); expect(r.fetchMock).toHaveBeenCalledTimes(1)
  })
  it('MA cadastrado com RENAVAM incompleto é barrado antes do serviço pago', async () => {
    const r = await executar('MA', {}, '123')
    expect(r.response.status).toBe(400); expect(r.fetchMock).not.toHaveBeenCalled(); expect(r.historico).toEqual([])
  })
})