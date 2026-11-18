import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { z } from 'npm:zod@3'
import { endpointDebitos, documentoObrigatorio, normalizar, type Debito } from './normalize.ts'

const GATEWAY = 'https://connector-gateway.lovable.dev/udc_infosimples'
const Body = z.object({
  vehicle_id: z.string().uuid(),
  uf: z.string().length(2),
  documento: z.string().max(20).optional(),
  login_cpf: z.string().max(20).optional(),
  login_senha: z.string().max(200).optional(),
  chassi: z.string().max(30).optional(),
})
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const auth = req.headers.get('Authorization')
    if (!auth) return json({ error: 'Não autenticado' }, 401)
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } })
    const { data: u } = await sb.auth.getUser()
    if (!u?.user) return json({ error: 'Não autenticado' }, 401)
    const p = Body.safeParse(await req.json())
    if (!p.success) return json({ error: p.error.flatten().fieldErrors }, 400)
    // RLS garante que o veículo é do tenant do usuário
    const { data: v } = await sb.from('vehicles').select('plate, renavam, chassis').eq('id', p.data.vehicle_id).maybeSingle()
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
    const base = { placa: v.plate.replace(/[^A-Z0-9]/gi, ''), renavam: String(v.renavam).replace(/\D/g, ''), timeout: '50' }
    const form = new URLSearchParams(soPlacaRenavam ? base : { ...base, uf, chassi: v.chassis })
    const doc = (p.data.documento || '').replace(/\D/g, '')
    if (documentoObrigatorio(uf) && !doc) return json({ error: 'O Detran-TO exige CPF ou CNPJ do proprietário. Informe o documento antes de consultar.' }, 400)
    if (doc && (!soPlacaRenavam || uf === 'TO')) {
      if (doc.length !== 11 && doc.length !== 14) return json({ error: 'Informe CPF com 11 dígitos ou CNPJ com 14 dígitos do proprietário.' }, 400)
      form.set(doc.length > 11 ? 'cnpj' : 'cpf', doc)
    }
    if (p.data.login_cpf && !soPlacaRenavam) form.set('login_cpf', p.data.login_cpf.replace(/\D/g, ''))
    if (p.data.login_senha && !soPlacaRenavam) form.set('login_senha', p.data.login_senha)

    const r = await fetch(`${GATEWAY}/api/v2/consultas/${endpoint}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${lov}`, 'X-Connection-Api-Key': key, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
    })
    const text = await r.text()
    if (!r.ok) { console.error(`InfoSimples [${r.status}]: ${text}`); 
      const lento = r.status === 502 || r.status === 504 || text.includes('timeout')
      return json({ error: lento ? `O site do Detran-${uf} demorou demais para responder (instabilidade do Detran). Tente novamente em alguns minutos.` : `Falha na InfoSimples (${r.status})`, status: r.status, details: text }, 200) }
    const out = JSON.parse(text)
    if (out.code !== 200) return json({ error: out.code_message || 'Consulta não concluída', code: out.code, errors: out.errors ?? [] }, 200)
    let importacao: { gravados: number; quitados: number; debitos: Debito[] } | null = null
    if (soPlacaRenavam) {
      const hoje = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
      const debitos = (out.data ?? []).flatMap((it: unknown) => normalizar(uf, it, hoje))
      const { data: atuais, error: e1 } = await sb.from('veiculo_documentos')
        .select('id, observacoes, status_pagamento').eq('veiculo_id', p.data.vehicle_id).like('observacoes', '%[detran:%')
      if (e1) return json({ error: 'Consulta feita, mas não foi possível ler os documentos: ' + e1.message }, 200)
      const tag = (c: string) => `[detran:${c}]`
      let gravados = 0, quitados = 0
      for (const d of debitos) {
        const row = {
          veiculo_id: p.data.vehicle_id, tipo_documento: d.tipo, ano_exercicio: d.ano, valor_total: d.valor,
          data_vencimento: d.vencimento, status_pagamento: d.vencimento < hoje ? 'Vencido' : 'A Vencer',
          observacoes: `${d.descricao} ${tag(d.chave)}`,
        }
        const ex = (atuais ?? []).find((a: any) => String(a.observacoes ?? '').includes(tag(d.chave)))
        const { error } = ex
          ? await sb.from('veiculo_documentos').update(row).eq('id', ex.id)
          : await sb.from('veiculo_documentos').insert({ ...row, created_by: u.user.id })
        if (error) return json({ error: `Consulta feita, mas falhou ao gravar ${d.tipo} ${d.ano}: ${error.message}` }, 200)
        gravados++
      }
      // Débitos importados antes que o Detran não lista mais foram quitados
      const chaves = new Set(debitos.map((d) => tag(d.chave)))
      // TO can omit unsupported debt descriptions: absence alone is not proof of payment.
      for (const a of uf === 'TO' ? [] : atuais ?? []) {
        const m = String((a as any).observacoes ?? '').match(/\[detran:[^\]]+\]/)
        if (m && !chaves.has(m[0]) && (a as any).status_pagamento !== 'Pago') {
          const { error } = await sb.from('veiculo_documentos').update({ status_pagamento: 'Pago' }).eq('id', (a as any).id)
          if (!error) quitados++
        }
      }
      importacao = { gravados, quitados, debitos }
    }
    const { error: historyError } = await sb.from('vehicle_debt_consultas').insert({ vehicle_id: p.data.vehicle_id, uf, endpoint, response: out.data ?? [], importacao, price: out.header?.price ?? null, created_by: u.user.id })
    if (historyError) return json({ error: 'Débitos consultados, mas não foi possível guardar os detalhes: ' + historyError.message }, 200)
    return json({ ok: true, importacao, data: out.data ?? [], price: out.header?.price ?? null, receipt: out.site_receipts ?? [] })
  } catch (e) {
    console.error(e); return json({ error: String((e as Error).message ?? e) }, 500)
  }
})
