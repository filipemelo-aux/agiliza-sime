import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { z } from 'npm:zod@3'
import { endpointDebitos, endpointIpvaComplementar, documentoObrigatorio } from './normalize.ts'
import { documentoDoProprietario } from './proprietario.ts'
import { consolidarResultados, podeQuitarAusente, validarCadastroConsulta } from './resultado.ts'
import { consultarFonte } from './transporte.ts'

const GATEWAY = 'https://connector-gateway.lovable.dev/udc_infosimples'
const Body = z.object({
  vehicle_id: z.string().uuid(),
  uf: z.string().trim().toUpperCase().regex(/^(AC|AL|AM|AP|BA|CE|DF|ES|GO|MA|MG|MS|MT|PA|PB|PE|PI|PR|RJ|RN|RO|RR|RS|SC|SE|SP|TO)$/),
  documento: z.string().max(20).optional(),
  login_cpf: z.string().max(20).optional(),
  login_senha: z.string().max(200).optional(),
  chassi: z.string().max(30).optional(),
  // Somente no modo automático (chamada interna com a chave de serviço)
  acting_user_id: z.string().uuid().optional(),
  tenant_id: z.string().uuid().optional(),
})
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const auth = req.headers.get('Authorization')
    if (!auth) return json({ error: 'Não autenticado' }, 401)
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const url = Deno.env.get('SUPABASE_URL'), anon = Deno.env.get('SUPABASE_ANON_KEY')
    if (!serviceKey || !url || !anon) return json({ error: 'Serviço indisponível' }, 500)
    const interno = auth === `Bearer ${serviceKey}`
    const sb = interno
      ? createClient(url, serviceKey)
      : createClient(url, anon, { global: { headers: { Authorization: auth } } })
    const p = Body.safeParse(await req.json())
    if (!p.success) return json({ error: p.error.flatten().fieldErrors }, 400)
    let u: { user: { id: string | null } }
    if (interno) {
      if (!p.data.tenant_id) return json({ error: 'tenant_id obrigatório' }, 400)
      u = { user: { id: p.data.acting_user_id ?? null } }
    } else {
      const { data } = await sb.auth.getUser()
      if (!data?.user) return json({ error: 'Não autenticado' }, 401)
      u = { user: { id: data.user.id } }
    }
    // RLS garante que o veículo é do tenant do usuário; no modo interno filtramos pelo tenant
    let vq = sb.from('vehicles').select('plate, renavam, chassis, owner_id').eq('id', p.data.vehicle_id)
    if (interno && p.data.tenant_id) vq = vq.eq('tenant_id', p.data.tenant_id)
    const { data: v } = await vq.maybeSingle()
    if (!v) return json({ error: 'Veículo não encontrado' }, 404)
    const novoChassi = (p.data.chassi || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
    if (novoChassi && novoChassi !== v.chassis) {
      const { error: upErr } = await sb.from('vehicles').update({ chassis: novoChassi }).eq('id', p.data.vehicle_id)
      if (upErr) return json({ error: 'Não foi possível salvar o chassi: ' + upErr.message }, 400)
      v.chassis = novoChassi
    }
    const uf = p.data.uf.toUpperCase()
    // Dedicated debt endpoints do not require chassis.
    const endpoint = endpointDebitos(uf) ?? 'detran/restricoes'
    const soPlacaRenavam = endpoint !== 'detran/restricoes'
    const faltam = [!v.renavam && 'RENAVAM', !soPlacaRenavam && !v.chassis && 'chassi'].filter(Boolean)
    if (faltam.length) return json({ error: `Falta no cadastro do veículo: ${faltam.join(' e ')}.`, missing: faltam }, 400)

    const lov = Deno.env.get('LOVABLE_API_KEY'), key = Deno.env.get('UDC_INFOSIMPLES_API_KEY')
    if (!lov || !key) return json({ error: 'Conexão InfoSimples não configurada' }, 500)
    const base = { placa: v.plate.replace(/[^A-Z0-9]/gi, ''), renavam: String(v.renavam).replace(/\D/g, ''), timeout: uf === 'MA' ? '55' : '50' }
    const form = new URLSearchParams(soPlacaRenavam ? base : { ...base, uf, chassi: v.chassis })
    let documentoCadastro = ''
    if (v.owner_id && (!soPlacaRenavam || uf === 'TO')) {
      const { data: owners, error: ownerError } = await sb.from('profiles').select('id, user_id, cnpj').or(`id.eq.${v.owner_id},user_id.eq.${v.owner_id}`)
      if (ownerError) return json({ error: 'Não foi possível ler o cadastro do proprietário: ' + ownerError.message }, 400)
      documentoCadastro = documentoDoProprietario(v.owner_id, owners ?? [])
    }
    const doc = (documentoCadastro || p.data.documento || '').replace(/\D/g, '')
    const erroCadastro = validarCadastroConsulta(uf, base.placa.toUpperCase(), base.renavam, doc)
    if (erroCadastro) return json({ error: erroCadastro }, 400)
    if (documentoObrigatorio(uf) && !doc) return json({ error: 'O Detran-TO exige CPF ou CNPJ do proprietário. Informe o documento antes de consultar.' }, 400)
    if (doc && (!soPlacaRenavam || uf === 'TO')) {
      if (doc.length !== 11 && doc.length !== 14) return json({ error: 'Informe CPF com 11 dígitos ou CNPJ com 14 dígitos do proprietário.' }, 400)
      form.set(doc.length > 11 ? 'cnpj' : 'cpf', doc)
    }
    if (p.data.login_cpf && !soPlacaRenavam) form.set('login_cpf', p.data.login_cpf.replace(/\D/g, ''))
    if (p.data.login_senha && !soPlacaRenavam) form.set('login_senha', p.data.login_senha)

    const chamar = (ep: string, body: URLSearchParams, repetir = false) => consultarFonte(ep, () =>
      fetch(`${GATEWAY}/api/v2/consultas/${ep}`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${lov}`, 'X-Connection-Api-Key': key, 'Content-Type': 'application/x-www-form-urlencoded' },
          body, signal: AbortSignal.timeout(70000),
        }), [lov, key, serviceKey, p.data.login_senha ?? ''], repetir)
    const epIpva = endpointIpvaComplementar(uf)
    const formIpva = new URLSearchParams({ ...base, timeout: '35', ...(doc ? { [doc.length > 11 ? 'cnpj' : 'cpf']: doc } : {}) })
    // MA/TO: cada clique faz uma tentativa por fonte, sem repetição automática.
    const resultados = await Promise.all([chamar(endpoint, form, uf !== 'MA' && uf !== 'TO'), ...(epIpva ? [chamar(epIpva, formIpva)] : [])])
    const hoje = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
    const resumo = consolidarResultados(uf, resultados, hoje)
    for (const fonte of resumo.fontes) console.info(JSON.stringify({ evento: 'consulta_frota', uf, ...fonte }))
    const importacao = { status: resumo.status, fontes: resumo.fontes, gravados: 0, quitados: 0, debitos: resumo.debitos, aviso: resumo.aviso }
    const salvarHistorico = () => sb.from('vehicle_debt_consultas').insert({ vehicle_id: p.data.vehicle_id, uf, endpoint, response: resumo.response, importacao: soPlacaRenavam || resumo.status === 'falha' ? importacao : null, price: resumo.price, created_by: u.user.id, ...(interno ? { tenant_id: p.data.tenant_id } : {}) })
    if (resumo.status === 'falha') {
      const { error: historyError } = await salvarHistorico()
      return json({ ok: false, error: `${resumo.aviso ?? 'Consulta não concluída.'}${historyError ? ' Não foi possível guardar a tentativa no histórico.' : ''}`, importacao, history_saved: !historyError, price: resumo.price }, 200)
    }
    if (soPlacaRenavam) {
      const debitos = resumo.debitos
      const { data: atuais, error: e1 } = await sb.from('veiculo_documentos')
        .select('id, observacoes, status_pagamento').eq('veiculo_id', p.data.vehicle_id).like('observacoes', '%[detran:%')
      if (e1) return json({ error: 'Consulta feita, mas não foi possível ler os documentos: ' + e1.message }, 200)
      const tag = (c: string) => `[detran:${c}]`
      for (const d of debitos) {
        const row = {
          veiculo_id: p.data.vehicle_id, tipo_documento: d.tipo, ano_exercicio: d.ano, valor_total: d.valor,
          data_vencimento: d.vencimento, status_pagamento: d.vencimento < hoje ? 'Vencido' : 'A Vencer',
          observacoes: `${d.descricao} ${tag(d.chave)}`,
        }
        const ex = (atuais ?? []).find((a: any) => String(a.observacoes ?? '').includes(tag(d.chave)))
        const { error } = ex
          ? await sb.from('veiculo_documentos').update(row).eq('id', ex.id)
          : await sb.from('veiculo_documentos').insert({ ...row, created_by: u.user.id, ...(interno ? { tenant_id: p.data.tenant_id } : {}) })
        if (error) return json({ error: `Consulta feita, mas falhou ao gravar ${d.tipo} ${d.ano}: ${error.message}` }, 200)
        importacao.gravados++
      }
      const chaves = new Set(debitos.map((d) => tag(d.chave)))
      const elegiveis = (atuais ?? []).filter(a => podeQuitarAusente(uf, String(a.observacoes ?? ''), resumo.status))
      for (const a of elegiveis) {
        const m = String((a as any).observacoes ?? '').match(/\[detran:[^\]]+\]/)
        if (m && !chaves.has(m[0]) && (a as any).status_pagamento !== 'Pago') {
          const { error } = await sb.from('veiculo_documentos').update({ status_pagamento: 'Pago' }).eq('id', (a as any).id)
          if (!error) importacao.quitados++
        }
      }
    }
    const { error: historyError } = await salvarHistorico()
    if (historyError) return json({ error: 'Débitos consultados, mas não foi possível guardar os detalhes: ' + historyError.message }, 200)
    return json({ ok: true, parcial: resumo.status === 'parcial', aviso: resumo.aviso, importacao: soPlacaRenavam ? importacao : null, data: resumo.response, price: resumo.price, receipt: resumo.receipt, history_saved: true })
  } catch (e) {
    console.error(e); return json({ error: String((e as Error).message ?? e) }, 500)
  }
})
