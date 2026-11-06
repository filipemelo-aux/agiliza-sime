import { supabase } from "@/integrations/supabase/client";
import { gerarRemessaSicoob, nomeArquivoRemessa, validarTitulo, type CobrancaConfig, type TituloRemessa } from "./cnab240Sicoob";

type Draft = Omit<TituloRemessa, "nossoNumero" | "nossoNumeroDv"> & { contaReceberId: string };

/**
 * Gera a remessa CNAB 240 das parcelas em aberto das faturas informadas.
 * Valida tudo antes de reservar números, para que um erro de cadastro não consuma nosso número nem NSA.
 */
export async function gerarRemessaCnab(faturaIds: string[]): Promise<{ arquivo: string; titulos: number; nsa: number }> {
  const { data: faturas, error: fErr } = await supabase
    .from("faturas_recebimento").select("id, numero, cliente_id, empresa_id, data_emissao").in("id", faturaIds);
  if (fErr) throw fErr;
  if (!faturas?.length) throw new Error("Nenhuma fatura selecionada.");

  const { data: configs, error: cErr } = await supabase.from("cobranca_configs").select("*").eq("ativo", true);
  if (cErr) throw cErr;
  if (!configs?.length) throw new Error("Nenhuma conta de cobrança (boleto) configurada para a empresa.");
  const empresas = new Set(faturas.map((f) => f.empresa_id ?? ""));
  const pick = (emp: string) => configs.find((c) => c.empresa_id === emp) ?? configs.find((c) => !c.empresa_id) ?? (configs.length === 1 ? configs[0] : null);
  const cfgs = new Set([...empresas].map((e) => pick(e)?.id));
  if (cfgs.has(undefined)) throw new Error("Há fatura de empresa sem conta de cobrança configurada.");
  if (cfgs.size > 1) throw new Error("Selecione faturas de uma única conta de cobrança por remessa.");
  const cfg = configs.find((c) => c.id === [...cfgs][0])!;

  const { data: contas, error: crErr } = await supabase
    .from("contas_receber").select("id, fatura_id, data_vencimento, valor, valor_recebido, status")
    .in("fatura_id", faturaIds).order("data_vencimento");
  if (crErr) throw crErr;
  const abertas = (contas ?? []).filter((c) => c.status !== "recebido" && Number(c.valor) - Number(c.valor_recebido ?? 0) > 0.004);
  if (!abertas.length) throw new Error("As faturas selecionadas não têm parcelas em aberto.");

  const clienteIds = [...new Set(faturas.map((f) => f.cliente_id))];
  const { data: clientes, error: pErr } = await supabase.from("profiles")
    .select("id, full_name, razao_social, cnpj, address_street, address_number, address_complement, address_neighborhood, address_city, address_state, address_zip")
    .in("id", clienteIds);
  if (pErr) throw pErr;

  const drafts: Draft[] = [];
  const problemas: string[] = [];
  for (const f of faturas.sort((a, b) => a.numero - b.numero)) {
    const cli = clientes?.find((c) => c.id === f.cliente_id);
    const parcelas = (contas ?? []).filter((c) => c.fatura_id === f.id);
    for (const c of abertas.filter((x) => x.fatura_id === f.id)) {
      const endereco = [cli?.address_street, cli?.address_number].filter(Boolean).join(", ");
      const d: Draft = {
        contaReceberId: c.id,
        parcela: parcelas.findIndex((p) => p.id === c.id) + 1,
        numeroDocumento: String(f.numero),
        usoEmpresa: String(f.numero),
        vencimento: c.data_vencimento,
        emissao: String(f.data_emissao).slice(0, 10),
        valor: Math.round((Number(c.valor) - Number(c.valor_recebido ?? 0)) * 100) / 100,
        pagador: {
          documento: cli?.cnpj ?? "",
          nome: cli?.razao_social || cli?.full_name || "",
          endereco,
          bairro: cli?.address_neighborhood ?? "",
          cep: cli?.address_zip ?? "",
          cidade: cli?.address_city ?? "",
          uf: cli?.address_state ?? "",
        },
      };
      const e = validarTitulo({ ...d, nossoNumero: 1, nossoNumeroDv: 0 });
      if (e.length) problemas.push(`Fatura ${f.numero} (${d.pagador.nome || "cliente"}): falta ${e.join(", ")}`);
      drafts.push(d);
    }
  }
  if (problemas.length) throw new Error(`Corrija o cadastro antes de gerar a remessa:\n${problemas.join("\n")}`);

  const { data: res, error: rErr } = await supabase.rpc("reservar_remessa_cnab", {
    _config_id: cfg.id, _conta_receber_ids: drafts.map((d) => d.contaReceberId),
  });
  if (rErr) throw rErr;
  const r = res as { nsa: number; titulos: { conta_receber_id: string; nosso_numero: number; dv: number }[] };
  const titulos: TituloRemessa[] = drafts.map(({ contaReceberId, ...d }) => {
    const t = r.titulos.find((x) => x.conta_receber_id === contaReceberId)!;
    return { ...d, nossoNumero: Number(t.nosso_numero), nossoNumeroDv: Number(t.dv) };
  });

  const agora = new Date();
  const conteudo = gerarRemessaSicoob(cfg as unknown as CobrancaConfig, titulos, r.nsa, agora);
  const nome = nomeArquivoRemessa(agora, r.nsa % 100 || 1);
  const blob = new Blob([conteudo], { type: "text/plain;charset=iso-8859-1" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return { arquivo: nome, titulos: titulos.length, nsa: r.nsa };
}
