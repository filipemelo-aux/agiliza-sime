// Converte respostas da InfoSimples em débitos por tipo/ano para veiculo_documentos.
export type Debito = { tipo: 'IPVA' | 'Licenciamento' | 'Multa'; ano: number; valor: number; vencimento: string; chave: string; descricao: string }

const br = (s?: string | null) => { const m = String(s ?? '').match(/(\d{2})\/(\d{2})\/(\d{4})/); return m ? `${m[3]}-${m[2]}-${m[1]}` : null }
const num = (v: unknown) => { const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(/[^\d,-]/g, '').replace(',', '.')); return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0 }
const r2 = (n: number) => Math.round(n * 100) / 100

/** Endpoint InfoSimples que traz débitos para a UF (null = só restrições, sem débitos). */
export function endpointDebitos(uf: string): string | null {
  if (uf === 'MA') return 'detran/ma/licenciamento'
  if (uf === 'PA') return 'detran/pa/veiculo'
  if (uf === 'TO') return 'detran/to/veiculo'
  if (uf === 'GO') return 'sefaz/go/ipva' // Detran-GO exige gov.br; SEFAZ-GO só placa+RENAVAM
  return null
}

/** Consulta complementar de IPVA (o Detran da UF não traz o imposto). */
export function endpointIpvaComplementar(uf: string): string | null {
  return uf === 'TO' ? 'sefaz/to/ipva' : null
}

/** SEFAZ-TO: guias de IPVA em aberto (pagamentos[]), agrupadas por exercício; cota única prevalece sobre parcelas. */
export function normalizarSefazTO(item: any, hoje: string): Debito[] {
  const anoHoje = Number(hoje.slice(0, 4))
  const grupos = new Map<number, { unica: any[]; outras: any[] }>()
  const lista = [...(item?.pagamentos ?? []), ...(item?.debitos ?? []), ...(item?.parcelas ?? [])]
  for (const p of lista) {
    const txt = Object.values(p ?? {}).filter((x) => typeof x === 'string').join(' ')
    if (/\bPAG[AO]\b|QUITAD|CANCELAD/i.test(String(p?.situacao ?? p?.status ?? ''))) continue
    const valor = num(p?.normalizado_valor ?? p?.valor_atualizado ?? p?.valor)
    if (valor <= 0) continue
    const venc = br(p?.vencimento ?? p?.data_vencimento)
    const ano = Number(p?.exercicio ?? p?.ano) || Number(txt.match(/(?:EXERC[IÍ]CIO|IPVA)\D{0,5}(20\d{2})/i)?.[1]) || Number(venc?.slice(0, 4)) || anoHoje
    const g = grupos.get(ano) ?? { unica: [], outras: [] }
    ;(/[UÚ]NICA/i.test(txt) ? g.unica : g.outras).push({ valor, venc: venc ?? `${ano}-12-31`, linha: p?.linha_digitavel })
    grupos.set(ano, g)
  }
  const out: Debito[] = []
  for (const [ano, g] of grupos) {
    const usar = g.unica.length ? [g.unica.sort((a, b) => a.venc.localeCompare(b.venc))[0]] : g.outras
    const valor = r2(usar.reduce((s, x) => s + x.valor, 0))
    const venc = usar.map((x) => x.venc).sort()[0]
    const linha = usar[0]?.linha ? ` — linha ${usar[0].linha}` : ''
    out.push({ tipo: 'IPVA', ano, valor, vencimento: venc, chave: `IPVA-SEFAZTO-${ano}`,
      descricao: `IPVA ${ano} (SEFAZ-TO${g.unica.length ? ', cota única' : `, ${usar.length} guia(s)`})${linha}`.slice(0, 300) })
  }
  return out
}

export function documentoObrigatorio(uf: string): boolean {
  return uf === 'TO'
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
  if (uf === 'TO') {
    // TO supplies decimal-dot amounts as well as normalized numbers.
    const valorTO = (v: unknown) => {
      if (typeof v === 'number') return r2(v)
      const text = String(v ?? '').replace(/[^\d,.-]/g, '')
      const parsed = Number(text.includes(',') ? text.replace(/\./g, '').replace(',', '.') : text)
      return Number.isFinite(parsed) ? r2(parsed) : 0
    }
    const tributos = new Map<string, Debito>()
    for (const d of item?.debitos ?? []) {
      const desc = String(d?.descricao ?? '')
      const texto = desc.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      if (/MULTA|INFRA|AUTUA/i.test(texto) && !/IPVA|LICENCIAMENTO/i.test(texto)) continue
      const tipo = /IPVA/i.test(texto) ? 'IPVA' : /LICENCIAMENTO|LICENC|CRLV|DPVAT|SEGURO OBRIGATORIO/i.test(texto) ? 'Licenciamento' : null
      if (!tipo) continue // Preserve unknown debts in saved details, never guess their category.
      const valor = valorTO(d.normalizado_valor_atual ?? d.valor_atual)
      if (valor <= 0) continue
      const data = br(d.normalizado_data_vencimento ?? d.data_vencimento)
      const ano = Number(texto.match(/\b(20\d{2})\b/)?.[1] ?? data?.slice(0, 4))
      if (!ano) continue
      const vencimento = data ?? `${ano}-12-31`
      const chave = `${tipo === 'IPVA' ? 'IPVA' : 'LIC'}-${ano}`
      const anterior = tributos.get(chave)
      tributos.set(chave, { tipo, ano, chave, valor: r2((anterior?.valor ?? 0) + valor),
        vencimento: anterior && anterior.vencimento < vencimento ? anterior.vencimento : vencimento,
        descricao: anterior ? `${anterior.descricao}; ${desc}`.slice(0, 300) : desc.slice(0, 300) })
    }
    out.push(...tributos.values())
    for (const f of [...(item?.multas ?? []), ...(item?.infracoes_em_autuacao ?? [])]) {
      const numero = String(f?.numero_autuacao ?? '').trim()
      if (!numero || /\bPAG[AO]|QUITAD|CANCELAD/i.test(numero)) continue
      // The same auto can appear both as a fine and as a pending notification.
      const auto = numero.split(/\s+Renainf:|\s+Em aberto/i)[0].trim()
      multa(auto, valorTO(f.normalizado_valor ?? f.valor), br(f.normalizado_data) ?? br(f.descricao), String(f.descricao ?? 'Multa Detran-TO'))
    }
  }
  if (uf === 'GO') {
    // SEFAZ-GO: guias por processo/exercício (a resposta pode repetir a mesma guia).
    const vistas = new Set<string>(); const porAno = new Map<number, { valor: number; procs: string[] }>()
    for (const g of item?.guias ?? []) {
      const ano = Number(g?.exercicio); const v = num(g?.normalizado_valor ?? g?.valor)
      if (!ano || v <= 0) continue
      const k = `${g?.numero_processo ?? ''}|${ano}|${v}`
      if (vistas.has(k)) continue
      vistas.add(k)
      const cur = porAno.get(ano) ?? { valor: 0, procs: [] }
      porAno.set(ano, { valor: r2(cur.valor + v), procs: [...cur.procs, String(g?.numero_processo ?? '').trim()].filter(Boolean) })
    }
    for (const [ano, x] of porAno) out.push({ tipo: 'IPVA', ano, valor: x.valor, vencimento: `${ano}-12-31` < hoje ? `${ano}-12-31` : hoje, chave: `IPVA-SEFAZGO-${ano}`,
      descricao: `IPVA ${ano} (SEFAZ-GO)${x.procs.length ? ` — processo ${x.procs.join(', ')}` : ''}`.slice(0, 300) })
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
      // Fines in the debitos list start with 'dd/mm/yyyy-UF:' (e.g. '...NÃO ESTEJA LICENCIADO') — never licensing
      if (/^\s*\d{2}\/\d{2}\/\d{4}\s*-\s*UF:/i.test(desc) || /-N\d{6,}-/.test(desc)) continue
      // Only explicit licensing items; traffic fines (e.g. "01/07/2025-UF:TO-...-TRANSITAR...") come via penalidades.
      if (!/LICENCIAMENTO|LICENC|CRLV|DPVAT|SEGURO OBRIGAT|TAXA/i.test(desc)) continue
      const v = num(d?.normalizado_valor_atual ?? d?.valor_atual); if (v <= 0) continue
      const venc = br(d?.vencimento) ?? hoje; const ano = Number(venc.slice(0, 4))
      const cur = lic.get(ano) ?? { valor: 0, venc, desc: [] }
      lic.set(ano, { valor: r2(cur.valor + v), venc: cur.venc < venc ? cur.venc : venc, desc: [...cur.desc, desc] })
    }
    for (const [ano, x] of lic) out.push({ tipo: 'Licenciamento', ano, valor: x.valor, vencimento: x.venc, chave: `LIC-${ano}`, descricao: `Licenciamento ${ano}: ${x.desc.join('; ')}`.slice(0, 300) })
    // SEFAZ-MA: IPVA não pago vira "Auto de Infração" (lançamento de ofício) por ano — é IPVA, não multa de trânsito
    const sefaz = new Map<number, { valor: number; venc: string; docs: string[] }>()
    for (const s of item?.outros_debitos_sefaz ?? []) {
      const ano = Number(s?.ano); const v = num(s?.normalizado_saldo_devedor ?? s?.saldo_devedor ?? s?.normalizado_valor_principal ?? s?.valor_principal)
      if (!ano || v <= 0) continue
      const venc = br(s?.data_vencimento) ?? `${ano}-12-31`
      const cur = sefaz.get(ano) ?? { valor: 0, venc, docs: [] }
      sefaz.set(ano, { valor: r2(cur.valor + v), venc: cur.venc < venc ? cur.venc : venc, docs: [...cur.docs, `${/HONOR/i.test(String(s?.tipo)) ? 'Honorários' : (s?.tipo ?? 'Auto de Infração')} ${s?.numero_documento ?? ''} R$ ${v.toFixed(2).replace('.', ',')}`.trim()] })
    }
    for (const [ano, x] of sefaz) out.push({ tipo: 'IPVA', ano, valor: x.valor, vencimento: x.venc, chave: `IPVA-SEFAZ-${ano}`, descricao: `IPVA ${ano} — SEFAZ-MA: ${x.docs.join('; ')}`.slice(0, 300) })
    // Autuações (notificações ainda sem auto de penalidade)
    for (const d of item?.debitos_autuacao ?? []) {
      const v = num(d?.normalizado_valor_atual ?? d?.valor_atual ?? d?.normalizado_valor_nominal); if (v <= 0) continue
      const venc = br(d?.vencimento) ?? hoje; const desc = String(d?.descricao ?? 'Autuação')
      const auto = (desc.match(/[A-Z]{0,3}\d{6,}/)?.[0]) ?? `${venc}-${desc.replace(/\W+/g, '').slice(0, 30)}`
      multa(auto, v, venc, desc)
    }
    // Penalidades bring only the nominal value; the matching entry in debitos has valor_atual (nominal + juros + multa).
    const atualDoAuto = (auto: string) => {
      const id = auto.match(/N\d{6,}/)?.[0] ?? auto.slice(0, 40)
      const d = (item?.debitos ?? []).find((x: any) => id && String(x?.descricao ?? '').includes(id))
      return d ? num(d?.normalizado_valor_atual ?? d?.valor_atual) : 0
    }
    for (const f of [...(item?.penalidades_multas ?? []), ...(item?.infracoes_autuacao ?? [])]) {
      const auto = String(f?.auto ?? '').trim()
      const nominal = num(f?.normalizado_valor ?? f?.valor)
      multa(auto, Math.max(nominal, atualDoAuto(auto)), br(f?.local_complemento), `${f?.descricao ?? ''}`)
    }
  }
  return out
}
