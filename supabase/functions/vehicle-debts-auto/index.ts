import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { createClient } from 'npm:@supabase/supabase-js@2'

// Consulta automática semanal de débitos da frota própria, chamada de hora em hora pelo agendador.
// No dia configurado por empresa, cada execução consulta um lote de placas ainda não consultadas hoje,
// até cobrir toda a frota; ao final grava o resumo (inclui multas novas).
const UFS = ['MA', 'PA', 'TO', 'GO']
const LOTE = 6
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const url = Deno.env.get('SUPABASE_URL')!, key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const svc = createClient(url, key)
  const agora = new Date()
  const hoje = agora.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
  const dia = new Date(hoje + 'T12:00:00Z').getUTCDay()
  const hora = Number(agora.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo', hour: 'numeric', hourCycle: 'h23' }))
  if (hora < 6) return json({ skipped: 'antes das 6h' })
  const inicioDia = new Date(hoje + 'T03:00:00Z').toISOString()

  const { data: cfgs, error } = await svc.from('fleet_debt_auto_config').select('*').eq('enabled', true).eq('weekday', dia)
  if (error) return json({ error: error.message }, 500)
  const report: unknown[] = []
  for (const c of cfgs ?? []) {
    if (c.last_run_date === hoje) continue
    const { data: veics } = await svc.from('vehicles').select('id, plate, owner_id')
      .eq('tenant_id', c.tenant_id).eq('fleet_type', 'propria').eq('is_active', true).not('renavam', 'is', null)
    const ownerIds = [...new Set((veics ?? []).map((v) => v.owner_id).filter(Boolean))]
    const { data: donos } = ownerIds.length
      ? await svc.from('profiles').select('id, user_id, address_state').or(`id.in.(${ownerIds.join(',')}),user_id.in.(${ownerIds.join(',')})`)
      : { data: [] as any[] }
    const ufDe = (o: string | null) => String((donos ?? []).find((d: any) => d.id === o || d.user_id === o)?.address_state ?? '').trim().toUpperCase()
    const elegiveis = (veics ?? []).map((v) => ({ ...v, uf: ufDe(v.owner_id) })).filter((v) => UFS.includes(v.uf))
    const { data: feitas } = elegiveis.length
      ? await svc.from('vehicle_debt_consultas').select('vehicle_id').in('vehicle_id', elegiveis.map((v) => v.id)).gte('created_at', inicioDia)
      : { data: [] as any[] }
    const prev = (c.last_run_summary as any)?.data === hoje ? (c.last_run_summary as any) : { data: hoje, consultadas: 0, falhas: [] as string[], novas_multas: [] as string[], tentadas: [] as string[] }
    const ja = new Set([...(feitas ?? []).map((f: any) => f.vehicle_id), ...(prev.tentadas ?? [])])
    const pendentes = elegiveis.filter((v) => !ja.has(v.id))
    const lote = pendentes.slice(0, LOTE)

    await Promise.all(lote.map(async (v) => {
      const tags = async () => {
        const { data } = await svc.from('veiculo_documentos').select('observacoes').eq('veiculo_id', v.id).eq('tipo_documento', 'Multa').like('observacoes', '%[detran:%')
        return new Set((data ?? []).map((d: any) => String(d.observacoes).match(/\[detran:[^\]]+\]/)?.[0]).filter(Boolean))
      }
      const antes = await tags()
      try {
        const r = await fetch(`${url}/functions/v1/vehicle-debts-sync`, {
          method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ vehicle_id: v.id, uf: v.uf, tenant_id: c.tenant_id, acting_user_id: c.acting_user_id ?? undefined }),
        })
        const out = await r.json().catch(() => ({}))
        if (!r.ok || out.error) { prev.falhas.push(`${v.plate}: ${typeof out.error === 'string' ? out.error : 'falha'}`); return }
        prev.consultadas++
        const depois = await tags()
        const novas = [...depois].filter((t) => !antes.has(t)).length
        if (novas) prev.novas_multas.push(`${v.plate} (${novas})`)
      } catch (e) { prev.falhas.push(`${v.plate}: ${(e as Error).message}`) }
      finally { prev.tentadas.push(v.id) }
    }))
    const terminou = pendentes.length <= LOTE
    await svc.from('fleet_debt_auto_config').update({ last_run_summary: { ...prev, total: elegiveis.length, concluida: terminou }, ...(terminou ? { last_run_date: hoje } : {}) }).eq('tenant_id', c.tenant_id)
    report.push({ tenant: c.tenant_id, lote: lote.length, restantes: pendentes.length - lote.length })
  }
  return json({ ok: true, report })
})
