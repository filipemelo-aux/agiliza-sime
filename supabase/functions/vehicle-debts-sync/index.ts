import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { z } from 'npm:zod@3'

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
    // MA não está na consulta unificada: usa a API própria do Detran-MA (só placa + RENAVAM)
    const isMA = uf === 'MA'
    const faltam = [!v.renavam && 'RENAVAM', !isMA && !v.chassis && 'chassi'].filter(Boolean)
    if (faltam.length) return json({ error: `Falta no cadastro do veículo: ${faltam.join(' e ')}.`, missing: faltam }, 400)

    const lov = Deno.env.get('LOVABLE_API_KEY'), key = Deno.env.get('UDC_INFOSIMPLES_API_KEY')
    if (!lov || !key) return json({ error: 'Conexão InfoSimples não configurada' }, 500)
    const base = { placa: v.plate.replace(/[^A-Z0-9]/gi, ''), renavam: String(v.renavam).replace(/\D/g, ''), timeout: '50' }
    const form = new URLSearchParams(isMA ? base : { ...base, uf, chassi: v.chassis })
    const doc = (p.data.documento || '').replace(/\D/g, '')
    if (doc && !isMA) form.set(doc.length > 11 ? 'cnpj' : 'cpf', doc)
    if (p.data.login_cpf) form.set('login_cpf', p.data.login_cpf.replace(/\D/g, ''))
    if (p.data.login_senha) form.set('login_senha', p.data.login_senha)

    const r = await fetch(`${GATEWAY}/api/v2/consultas/${isMA ? 'detran/ma/licenciamento' : 'detran/restricoes'}`, {
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
    return json({ ok: true, data: out.data ?? [], price: out.header?.price ?? null, receipt: out.site_receipts ?? [] })
  } catch (e) {
    console.error(e); return json({ error: String((e as Error).message ?? e) }, 500)
  }
})
