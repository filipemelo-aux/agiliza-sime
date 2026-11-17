// Converte respostas da InfoSimples em débitos por tipo/ano para veiculo_documentos.
export type Debito = { tipo: 'IPVA' | 'Licenciamento' | 'Multa'; ano: number; valor: number; vencimento: string; chave: string; descricao: string }

const br = (s?: string | null) => { const m = String(s ?? '').match(/(\d{2})\/(\d{2})\/(\d{4})/); return m ? `${m[3]}-${m[2]}-${m[1]}` : null }
const num = (v: unknown) => { const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(/[^\d,-]/g, '').replace(',', '.')); return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0 }
const r2 = (n: number) => Math.round(n * 100) / 100

/** Endpoint InfoSimples que traz débitos para a UF (null = só restrições, sem débitos). */
export function endpointDebitos(uf: string): string | null {
  if (uf === 'MA') return 'detran/ma/licenciamento'
  if (uf === 'PA') return 'detran/pa/veiculo'
  return null
}

export function normalizar(uf: string, item: any, hoje: string): Debito[] {
  const out: Debito[] = []
  const anoHoje = Number(hoje.slice(0, 4))
  const multa = (auto: string, valor: number, data: string | null, desc: string) => {
    if (!auto || valor <= 0) return
    if (out.some((d) => d.chave === `MULTA-${auto}`)) return
    const venc = data ?? hoje
    out.push({ tipo: 'Multa', ano: Number(venc.slice(0, 4)), valor, vencimento: venc, chave: `MULTA-${auto}`, descricao: `Auto ${auto} — ${desc}`.slice(0, 300) })
  }
  if (uf === 'PA') {
    const ipva = num(item?.normalizado_valor_ipva ?? item?.valor_ipva)
    if (ipva > 0) {
      const lic = Number(item?.ano_licenciamento) || anoHoje - 1
      const ano = Math.min(lic + 1, anoHoje)
      out.push({ tipo: 'IPVA', ano, valor: ipva, vencimento: hoje, chave: `IPVA-${ano}`, descricao: `IPVA ${ano} (Detran-PA)` })
    }
    for (const f of item?.infracoes ?? []) {
      if (f?.status && !/PAGAR|ABERT|VENC/i.test(f.status)) continue
      multa(String(f.auto_infracao ?? '').trim(), num(f.normalizado_valor ?? f.valor), br(f.data_hora), `${f.descricao ?? ''} (${f.municipio ?? ''})`)
    }
  }
  if (uf === 'MA') {
    const porAno = new Map<number, { valor: number; venc: string }>()
    for (const p of item?.ipva ?? []) {
      const ano = Number(p?.ano); const v = num(p?.normalizado_saldo_devedor ?? p?.saldo_devedor)
      if (!ano || v <= 0) continue
      const venc = br(p?.data_vencimento) ?? `${ano}-12-31`
      const cur = porAno.get(ano)
      porAno.set(ano, { valor: r2((cur?.valor ?? 0) + v), venc: cur && cur.venc < venc ? cur.venc : venc })
    }
    for (const [ano, x] of porAno) out.push({ tipo: 'IPVA', ano, valor: x.valor, vencimento: x.venc, chave: `IPVA-${ano}`, descricao: `IPVA ${ano} (Detran-MA)` })
    const lic = new Map<number, { valor: number; venc: string; desc: string[] }>()
    for (const d of item?.debitos ?? []) {
      const desc = String(d?.descricao ?? '')
      if (/IPVA|MULTA|INFRA|AUTUA/i.test(desc)) continue
      const v = num(d?.normalizado_valor_atual ?? d?.valor_atual); if (v <= 0) continue
      const venc = br(d?.vencimento) ?? hoje; const ano = Number(venc.slice(0, 4))
      const cur = lic.get(ano) ?? { valor: 0, venc, desc: [] }
      lic.set(ano, { valor: r2(cur.valor + v), venc: cur.venc < venc ? cur.venc : venc, desc: [...cur.desc, desc] })
    }
    for (const [ano, x] of lic) out.push({ tipo: 'Licenciamento', ano, valor: x.valor, vencimento: x.venc, chave: `LIC-${ano}`, descricao: `Licenciamento ${ano}: ${x.desc.join('; ')}`.slice(0, 300) })
    for (const f of [...(item?.penalidades_multas ?? []), ...(item?.infracoes_autuacao ?? [])]) {
      multa(String(f?.auto ?? '').trim(), num(f?.normalizado_valor ?? f?.valor), br(f?.local_complemento), `${f?.descricao ?? ''}`)
    }
  }
  return out
}
