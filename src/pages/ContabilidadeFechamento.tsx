import { useEffect, useState } from "react";
import JSZip from "jszip";
import * as XLSX from "xlsx";
import { Download } from "lucide-react";
import { AdminLayout } from "@/components/AdminLayout";
import { PageTitle } from "@/components/PageTitle";
import { SearchFilterCard, FilterField } from "@/components/ui/search-filter-card";
import { AccountingAccountsFilter, type AccountingAccountOption } from "@/components/financial/AccountingAccountsFilter";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { MonthPicker } from "@/components/MonthPicker";
import { ProcessingOverlay } from "@/components/ui/processing-overlay";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/lib/notice";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { competenciaRange, payableStatus, payableBalance, groupCtesByAgenciaCst, normalizeCst, includesAccountingAccount, accountingAgency, accountingCteServiceType, splitAccountingContracts } from "@/lib/contabilidadeExport";

const sb = supabase as any;
const br = (d: unknown) => (d ? String(d).slice(0, 10).split("-").reverse().join("/") : "");
const mesAtual = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }).slice(0, 7);

function sheet(rows: Record<string, unknown>[]) {
  const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Aviso: "Sem registros na competência" }]);
  const keys = Object.keys(rows[0] ?? { Aviso: "" });
  ws["!cols"] = keys.map((k) => ({ wch: Math.min(50, Math.max(k.length + 2, ...rows.slice(0, 200).map((r) => String(r[k] ?? "").length + 1))) }));
  return ws;
}
function book(sheets: Record<string, Record<string, unknown>[]>) {
  const wb = XLSX.utils.book_new();
  for (const [n, r] of Object.entries(sheets)) XLSX.utils.book_append_sheet(wb, sheet(r), n.slice(0, 31));
  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

export default function ContabilidadeFechamento() {
  const { user, loading: authLoading, supportTenantId } = useAuth();
  const [ym, setYm] = useState(mesAtual());
  const [busy, setBusy] = useState(false);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [resumo, setResumo] = useState<string>("");
  const [accounts, setAccounts] = useState<AccountingAccountOption[]>([]);
  const [selectedAccounts, setSelectedAccounts] = useState<string[] | null>(null);
  const [accountsReady, setAccountsReady] = useState(false);
  const nome = `Fechamento_Contabil_${ym.slice(5)}_${ym.slice(0, 4)}.zip`;

  useEffect(() => {
    if (authLoading || !user) return;
    let alive = true;
    setAccountsReady(false); setBlob(null); setSelectedAccounts(null);
    fetchAllRows<AccountingAccountOption>((a, b) => sb.from("chart_of_accounts").select("id, codigo, nome").order("codigo").order("id").range(a, b))
      .then(({ data }) => { if (alive) { setAccounts(data || []); setAccountsReady(true); } })
      .catch((e) => { if (alive) toast.error("Falha ao carregar planos de contas", { description: e.message }); });
    return () => { alive = false; };
  }, [authLoading, user?.id, supportTenantId]);

  const gerar = async () => {
    if (busy || authLoading || !user || !accountsReady) return;
    setBusy(true); setBlob(null);
    try {
      const { ini, fim, from, to } = competenciaRange(ym);
      const ests = (await fetchAllRows<any>((a, b) => sb.from("fiscal_establishments").select("id, type, endereco_uf").order("id").range(a, b))).data || [];
      const agencia = (id: string) => accountingAgency(ests.find((x: any) => x.id === id));

      // Contas a pagar: parcelas quando existirem, senão a despesa inteira
      const exps = (await fetchAllRows<any>((a, b) => sb.from("expenses").select("id, descricao, favorecido_nome, fornecedor_cnpj, documento_fiscal_numero, data_emissao, data_vencimento, data_pagamento, valor_total, valor_pago, forma_pagamento, centro_custo, empresa_id, plano_contas_id").is("deleted_at", null).range(a, b))).data || [];
      const inst = (await fetchAllRows<any>((a, b) => sb.from("expense_installments").select("expense_id, numero_parcela, total_parcelas, data_vencimento, valor, status").range(a, b))).data || [];
      const plano = accounts;
      const conta = (id: string) => { const p = plano.find((x: any) => x.id === id); return p ? `${p.codigo} ${p.nome}` : ""; };
      const byExp = new Map<string, any[]>();
      inst.forEach((i: any) => byExp.set(i.expense_id, [...(byExp.get(i.expense_id) || []), i]));
      const abertas: any[] = [], pagas: any[] = [];
      for (const e of exps) {
        if (!includesAccountingAccount(e.plano_contas_id, selectedAccounts)) continue;
        const parts = byExp.get(e.id);
        const linhas = parts?.length
          ? (() => { let resto = Number(e.valor_pago || 0); return parts.sort((a, b) => a.numero_parcela - b.numero_parcela).map((p) => { const pago = Math.min(Number(p.valor), Math.max(0, resto)); resto -= pago; return { parcela: `${p.numero_parcela}/${p.total_parcelas}`, venc: p.data_vencimento, total: Number(p.valor), pago: p.status === "pago" ? Number(p.valor) : pago }; }); })()
          : [{ parcela: "Única", venc: e.data_vencimento, total: Number(e.valor_total), pago: Number(e.valor_pago || 0) }];
        for (const l of linhas) {
          const base = { Agência: agencia(e.empresa_id), Favorecido: e.favorecido_nome, "CNPJ/CPF": e.fornecedor_cnpj, Documento: e.documento_fiscal_numero, Descrição: e.descricao, "Conta contábil": conta(e.plano_contas_id), "Centro de custo": e.centro_custo, Parcela: l.parcela, Emissão: br(e.data_emissao), Vencimento: br(l.venc), Valor: l.total };
          const saldo = payableBalance(l.total, l.pago);
          const st = payableStatus(l.total, l.pago, l.venc, fim);
          if (saldo > 0 && String(l.venc).slice(0, 10) <= fim) abertas.push({ ...base, Pago: l.pago, "Saldo a pagar": saldo, Status: st });
          if (l.pago > 0 && e.data_pagamento && e.data_pagamento.slice(0, 10) >= ini && e.data_pagamento.slice(0, 10) <= fim)
            pagas.push({ ...base, "Valor pago": l.pago, "Data pagamento": br(e.data_pagamento), "Forma pagamento": e.forma_pagamento });
        }
      }

      // CT-es emitidos (autorizados) da competência
      const ctes = (await fetchAllRows<any>((a, b) => sb.from("ctes").select("numero, serie, tp_serv, chave_acesso, data_emissao, status, establishment_id, tomador_nome, tomador_cnpj, uf_origem, uf_destino, cfop, cst_icms, valor_frete, base_calculo_icms, aliquota_icms, valor_icms, xml_autorizado").gte("data_emissao", from).lte("data_emissao", to).in("status", ["autorizado", "encerrado"]).order("numero").order("id").range(a, b))).data || [];
      const cteRows = ctes.map((c: any) => ({ Agência: agencia(c.establishment_id), Número: c.numero, Série: c.serie, "Tipo de serviço": accountingCteServiceType(c.tp_serv), Emissão: br(c.data_emissao), Chave: c.chave_acesso, Tomador: c.tomador_nome, "CNPJ tomador": c.tomador_cnpj, Origem: c.uf_origem, Destino: c.uf_destino, CFOP: c.cfop, CST: normalizeCst(c.cst_icms), "Valor frete": Number(c.valor_frete || 0), "Base ICMS": Number(c.base_calculo_icms || 0), "Alíq. %": Number(c.aliquota_icms || 0), ICMS: Number(c.valor_icms || 0) }));
      const resumoCte = groupCtesByAgenciaCst(ctes.map((c: any) => ({ ...c, agencia: agencia(c.establishment_id) }))).map((g) => ({ Agência: g.agencia, CST: g.cst, Quantidade: g.quantidade, "Valor frete": g.frete, "Base ICMS": g.base, ICMS: g.icms }));

      // NF-es recebidas como destinatário
      const nfes = (await fetchAllRows<any>((a, b) => sb.from("nfes_recebidas").select("numero, serie, chave, data_emissao, emitente_nome, emitente_cnpj, destinatario_cnpj, valor, situacao, ator, establishment_id").eq("ator", "destinatario").gte("data_emissao", from).lte("data_emissao", to).order("data_emissao").range(a, b))).data || [];
      const nfeRows = nfes.map((n: any) => ({ Agência: agencia(n.establishment_id), Número: n.numero, Série: n.serie, Emissão: br(n.data_emissao), Emitente: n.emitente_nome, "CNPJ emitente": n.emitente_cnpj, "CNPJ destinatário": n.destinatario_cnpj, Chave: n.chave, Valor: Number(n.valor || 0), Situação: n.situacao }));

      const contracts = (await fetchAllRows<any>((a, b) => sb.from("freight_contracts").select("numero, data_contrato, contratado_nome, contratado_documento, contratado_tipo, motorista_nome, motorista_cpf, placa_veiculo, municipio_origem, uf_origem, municipio_destino, uf_destino, natureza_carga, peso_kg, valor_tonelada, valor_total, establishment_id, cte:ctes!freight_contracts_cte_id_fkey(numero, serie), payable:expenses!freight_contracts_expense_id_fkey(status, data_pagamento)").gte("data_contrato", ini).lte("data_contrato", fim).order("data_contrato").order("id").range(a, b))).data || [];
      const separated = splitAccountingContracts(contracts);
      const contractRows = (rows: any[]) => rows.map((c) => ({ Agência: agencia(c.establishment_id), "Número contrato": c.numero, "Data contrato": br(c.data_contrato), "Tipo contratado": c.contratado_tipo, Contratado: c.contratado_nome, "CPF/CNPJ contratado": c.contratado_documento, "Número CT-e": c.cte?.numero, "Série CT-e": c.cte?.serie, Motorista: c.motorista_nome, "CPF motorista": c.motorista_cpf, Placa: c.placa_veiculo, Origem: c.municipio_origem, "UF origem": c.uf_origem, Destino: c.municipio_destino, "UF destino": c.uf_destino, Carga: c.natureza_carga, "Peso (kg)": Number(c.peso_kg || 0), "Valor por tonelada": Number(c.valor_tonelada || 0), "Valor contrato": Number(c.valor_total || 0), "Status conta a pagar": c.payable?.status, "Data pagamento": br(c.payable?.data_pagamento) }));

      const zip = new JSZip();
      zip.file(`Contas_a_Pagar_${ym}.xlsx`, book({ "Em aberto": abertas, Pagas: pagas }));
      zip.file(`CTes_Emitidos_${ym}.xlsx`, book({ "Resumo Agência x CST": resumoCte, "CT-es": cteRows }));
      zip.file(`NFes_Destinatario_${ym}.xlsx`, book({ "NF-es": nfeRows }));
      zip.file(`Contratos_de_Frete_${ym}.xlsx`, book({ "Contratos PJ": contractRows(separated.PJ), "Contratos PF": contractRows(separated.PF) }));
      const xmls = zip.folder("XML_CTes");
      if (!xmls) throw new Error("Não foi possível criar a pasta dos XMLs");
      let nx = 0;
      for (const c of ctes) if (c.xml_autorizado) { xmls.file(`${c.chave_acesso || c.numero}.xml`, c.xml_autorizado); nx++; }
      setBlob(await zip.generateAsync({ type: "blob", compression: "DEFLATE" }));
      setResumo(`${abertas.length} contas em aberto, ${pagas.length} pagas, ${ctes.length} CT-es (${nx} XMLs), ${nfes.length} NF-es, ${separated.PJ.length} contratos PJ e ${separated.PF.length} contratos PF.`);
    } catch (e: any) {
      toast.error("Falha ao gerar o pacote contábil", { description: e.message });
    } finally { setBusy(false); }
  };

  const baixar = () => {
    if (!blob) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = nome;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 30000);
  };

  return (
    <AdminLayout>
      <PageTitle>Fechamento Contábil</PageTitle>
      <div className="container mx-auto px-4 py-3 md:px-6 space-y-3">
        <SearchFilterCard>
          <FilterField label="Competência" className="sm:mr-auto">
            <MonthPicker className="w-[190px] text-xs" value={ym} onChange={(v) => { setYm(v); setBlob(null); }} />
          </FilterField>
          <FilterField label="Planos de contas — Contas a Pagar" className="w-full sm:w-[360px]">
            <AccountingAccountsFilter options={accounts} value={selectedAccounts} onChange={(v) => { setSelectedAccounts(v); setBlob(null); }} disabled={busy || !accountsReady} />
          </FilterField>
        </SearchFilterCard>
        <div className="flex flex-wrap items-center gap-3">
              <Button className="h-10" onClick={gerar} disabled={busy || !ym || !accountsReady || authLoading}>Gerar pacote</Button>
              {blob && <Button className="h-10 gap-2" variant="secondary" onClick={baixar}><Download className="h-4 w-4" /> Baixar {nome}</Button>}
        </div>
        {resumo && blob && <p className="text-xs text-muted-foreground">{resumo}</p>}
      </div>
      <ProcessingOverlay open={busy} label="Gerando pacote contábil..." />
    </AdminLayout>
  );
}
