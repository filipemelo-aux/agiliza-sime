import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

interface NormalizedTx {
  externalId: string;
  data: string; // yyyy-MM-dd
  descricao: string;
  valor: number; // sempre positivo
  tipo: "entrada" | "saida";
  /** Detalhes adicionais do Open Finance (quando o banco fornece) */
  detalhes?: {
    categoria?: string | null;
    tipoOperacao?: string | null;
    formaPagamento?: string | null;
    situacao?: string | null;
    contraparte?: string | null;
    documentoContraparte?: string | null;
    banco?: string | null;
    agencia?: string | null;
    conta?: string | null;
    codigoAutenticacao?: string | null;
    numeroReferencia?: string | null;
    motivo?: string | null;
    boleto?: string | null;
    estabelecimento?: string | null;
    cnpjEstabelecimento?: string | null;
    cnaeEstabelecimento?: string | null;
    saldoApos?: number | null;
    idProvedor?: string | null;
  };
}

/** Corrige textos UTF-8 que chegaram interpretados como latin-1 (ex.: "DÃ‰B."). */
function fixMojibake(input: string): string {
  if (!/[ÃÂ][\u0080-\u00BF\u2000-\u206F]/.test(input)) return input;
  try {
    const bytes = Uint8Array.from([...input].map((c) => c.charCodeAt(0) & 0xff));
    const decoded = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    return decoded.includes("\uFFFD") ? input : decoded;
  } catch {
    return input;
  }
}

// ---------- Cliente MCP (Streamable HTTP) ----------
class McpClient {
  private sessionId: string | null = null;
  private nextId = 1;
  constructor(private url: string, private apiKey: string | null = null) {}

  private async rpc(body: Record<string, unknown>): Promise<Response> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      // Exigido pela spec MCP Streamable HTTP — sem isso o servidor responde 406
      Accept: "application/json, text/event-stream",
    };
    if (this.apiKey) headers["Authorization"] = `Bearer ${this.apiKey}`;
    if (this.sessionId) headers["mcp-session-id"] = this.sessionId;
    return await fetch(this.url, { method: "POST", headers, body: JSON.stringify(body) });
  }

  private static parseBody(text: string): any {
    for (const line of text.split("\n")) {
      if (line.startsWith("data: ")) {
        try {
          return JSON.parse(line.slice(6));
        } catch { /* continua */ }
      }
    }
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  async initialize(): Promise<void> {
    const res = await this.rpc({
      jsonrpc: "2.0",
      id: this.nextId++,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "agiliza-open-finance", version: "1.0.0" },
      },
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Falha ao iniciar sessão Open Finance (${res.status}): ${text.slice(0, 200)}`);
    this.sessionId = res.headers.get("mcp-session-id");
    const parsed = McpClient.parseBody(text);
    if (parsed?.error) throw new Error(parsed.error.message || "Erro na inicialização");
    await this.rpc({ jsonrpc: "2.0", method: "notifications/initialized" });
  }

  async callTool(name: string, args: Record<string, unknown> = {}): Promise<any> {
    const res = await this.rpc({
      jsonrpc: "2.0",
      id: this.nextId++,
      method: "tools/call",
      params: { name, arguments: args },
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Erro na chamada ${name} (${res.status}): ${text.slice(0, 200)}`);
    const parsed = McpClient.parseBody(text);
    if (!parsed) throw new Error(`Resposta inválida da API em ${name}`);
    if (parsed.error) throw new Error(parsed.error.message || `Erro em ${name}`);
    const content = parsed.result?.content;
    const textPart = Array.isArray(content) ? content.find((c: any) => c?.type === "text")?.text : null;
    if (typeof textPart === "string") {
      try {
        return JSON.parse(textPart);
      } catch {
        return { raw: textPart };
      }
    }
    return parsed.result ?? {};
  }
}

/** Raízes de CNPJ (8 dígitos) do titular da conta — preenchidas a cada sincronização. */
let HOLDER_ROOTS = new Set<string>(["23662751"]);
let HOLDER_NAMES: string[] = ["SIME TRANSPORTE"];

const onlyDigits = (v: unknown) => String(v ?? "").replace(/\D/g, "");
function isHolderDoc(doc: unknown): boolean {
  const d = onlyDigits(doc);
  return d.length === 14 && HOLDER_ROOTS.has(d.slice(0, 8));
}
function isHolderName(name: unknown): boolean {
  const n = String(name ?? "").toUpperCase();
  return !!n && HOLDER_NAMES.some((h) => h && n.includes(h));
}

/** Adaptador: transação bruta da API -> tipagem padrão de conciliação. */
export function adaptTransaction(row: Record<string, any>): NormalizedTx | null {
  const amount = Number(String(row.amount ?? row.valor ?? "").replace(/[^\d.,-]/g, "").replace(",", "."));
  const rawDate = String(row.date ?? row.data ?? "");
  if (!rawDate || !Number.isFinite(amount)) return null;
  const data = rawDate.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return null;

  const typeHint = String(row.type ?? "").toUpperCase();
  const tipo: "entrada" | "saida" =
    typeHint === "CREDIT" ? "entrada" : typeHint === "DEBIT" ? "saida" : amount >= 0 ? "entrada" : "saida";

  const pd = (row.paymentData ?? {}) as Record<string, any>;
  const toParty = (p: unknown): Record<string, any> | null =>
    !p ? null : typeof p === "string" ? { name: p } : (p as Record<string, any>);
  const partyDoc = (p: Record<string, any> | null) =>
    p?.documentNumber?.value ?? p?.documentNumber ?? p?.document ?? p?.cpfCnpj ?? p?.taxId ?? null;
  // O lado "nosso" (titular) nunca é favorecido. Escolhe o lado esperado e, se for o titular, tenta o outro.
  const primary = toParty(tipo === "saida" ? pd.receiver : pd.payer);
  const secondary = toParty(tipo === "saida" ? pd.payer : pd.receiver);
  const descRaw = fixMojibake([row.descriptionRaw ?? row.description ?? row.descricao ?? "", row.operationTypeAdditionalInfo ?? ""].filter(Boolean).join(" | "));
  const descMentionsHolder = isHolderName(descRaw) || isHolderDoc(descRaw.match(/[\d][\d.\-/\s]{12,}\d/)?.[0]);
  const isHolderParty = (p: Record<string, any> | null) =>
    !!p && (isHolderDoc(partyDoc(p)) || isHolderName(p.name));
  // Transferência entre contas próprias: só aceita o titular se a descrição também o mencionar.
  const pick = (p: Record<string, any> | null) => (p && (!isHolderParty(p) || descMentionsHolder) ? p : null);
  const contraparte = pick(primary) ?? (isHolderParty(secondary) ? null : secondary);

  const merchant = (row.merchantInfo ?? row.merchant ?? null) as Record<string, any> | null;
  const clean = (v: unknown) => {
    const t = v === null || v === undefined ? "" : fixMojibake(String(v)).trim();
    return t ? t : null;
  };

  // Fallback: Sicoob (e outros) embutem favorecido/pagador na descrição: "...|@NOME|@DOC|@msg" ou "...|NOME|DOC|"
  // ou "DÉB.TRANSF.CONTAS DIF.TITULARIDADE - FAV.: NOME" / "CRÉD.TRANSF.CONTAS - REM.: NOME" / "NOME: X".
  const descParts = descRaw.split(/\|@?/).slice(1).map((p) => p.replace(/^(CPF\s*CNPJ|CPF|CNPJ)\s*:?\s*/i, "").trim()).filter(Boolean);
  const isDoc = (p: string) => /^[\d*.\-/\s]+$/.test(p) && (p.includes("*") || p.replace(/\D/g, "").length >= 11);
  const markerMatch = descRaw.match(/\b(FAV(?:ORECIDO)?|BENEF(?:ICIARIO)?|REM|REMET(?:ENTE)?|PAG(?:ADOR)?|NOME)\b\.?\s*[:\-]\s*([^|]+)/i);
  let markerNome: string | null = null;
  let markerDoc: string | null = null;
  if (markerMatch) {
    let rest = markerMatch[2].trim();
    const docM = rest.match(/([\d*][\d*.\-/\s]{9,})$/);
    if (docM && isDoc(docM[1].trim())) {
      markerDoc = docM[1].trim();
      rest = rest.slice(0, docM.index).replace(/[\s\-–]+$/, "").trim();
    }
    if (rest && /[a-zA-ZÀ-ÿ]{3}/.test(rest)) markerNome = rest;
  }
  const GENERIC = /^(PAGAMENTO|RECEBIMENTO|DEVOLU[CÇ][AÃ]O)\s+PIX$|^PIX\b|^TRANSF/i;
  // Compras com cartão de débito: "COMPRA MASTERCARD MAESTRO - LOJA CIDADE BRA"
  const cardM = descRaw.match(/^COMPRA\s+(?:MASTERCARD|VISA|ELO|MAESTRO|CART[AÃ]O)[^-]*-\s*(.+?)(?:\s+[A-ZÀ-Ÿ]+\s+BRA)?\s*$/i);
  const nomeDesc = markerNome
    ?? descParts.find((p) => !isDoc(p) && /[a-zA-ZÀ-ÿ]{3}/.test(p) && !GENERIC.test(p))
    ?? (cardM ? cardM[1].replace(/^MP \*/i, "").trim() : null);
  const docDesc = markerDoc ?? descParts.find(isDoc) ?? null;

  const merchantName = merchant?.businessName ?? merchant?.name;
  const detalhes = {
    categoria: clean(row.category),
    tipoOperacao: clean(row.operationType),
    formaPagamento: clean(pd.paymentMethod),
    situacao: clean(row.status),
    contraparte: clean(contraparte?.name ?? contraparte?.legalName ?? contraparte?.fullName ?? (isHolderName(merchantName) ? null : merchantName) ?? nomeDesc),
    documentoContraparte: clean(partyDoc(contraparte) ?? (isHolderDoc(merchant?.cnpj) ? null : merchant?.cnpj) ?? docDesc),

    banco: clean(contraparte?.routingNumber ?? contraparte?.routingNumberISPB),
    agencia: clean(contraparte?.branchNumber),
    conta: clean(contraparte?.accountNumber),
    codigoAutenticacao: clean(pd.authenticationCode),
    numeroReferencia: clean(pd.referenceNumber),
    motivo: clean(pd.reason),
    boleto: clean(pd.boletoMetadata?.digitableLine ?? pd.boletoMetadata?.barcode),
    estabelecimento: clean(merchant?.businessName ?? merchant?.name),
    cnpjEstabelecimento: clean(merchant?.cnpj),
    cnaeEstabelecimento: clean(merchant?.cnae),
    saldoApos: Number.isFinite(Number(row.balance)) && row.balance !== null ? Number(row.balance) : null,
    idProvedor: clean(row.providerId),
  };
  const temDetalhe = Object.values(detalhes).some((v) => v !== null && v !== undefined);

  return {
    externalId: String(row.id ?? row.transactionId ?? `${data}-${Math.round(Math.abs(amount) * 100)}`),
    data,
    descricao: fixMojibake(String(row.description ?? row.descricao ?? "Lançamento Open Finance")).trim(),
    valor: Math.abs(amount),
    tipo,
    ...(temDetalhe ? { detalhes } : {}),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Não autenticado" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "Não autenticado" }, 401);

    {
      const roleClient = createClient(supabaseUrl, serviceKey);
      const { data: rs } = await roleClient.from("user_roles").select("role").eq("user_id", userData.user.id);
      const rl = (rs || []).map((r: any) => r.role);
      if (!rl.some((r: string) => ["admin", "moderator", "operador", "consultor"].includes(r))) {
        return json({ error: "Sem permissão para sincronizar (acesso somente consulta)" }, 403);
      }
    }

    const apiUrl = Deno.env.get("OPEN_FINANCE_API_URL");
    if (!apiUrl) return json({ error: "Integração Open Finance não configurada" }, 500);

    let body: any = {};
    try {
      body = await req.json();
    } catch { /* sem corpo */ }

    const today = new Date();
    const defaultFrom = new Date(today.getTime() - 90 * 86400000);
    const from = typeof body?.from === "string" ? body.from : defaultFrom.toISOString().slice(0, 10);
    const to = typeof body?.to === "string" ? body.to : today.toISOString().slice(0, 10);

    // Aceita URL completa MCP (chave embutida) ou chave sk_live_… (API REST do Banco MCP)
    const cfg = apiUrl.trim();
    const REST_PATHS: Record<string, string> = {
      openfinance_list_accounts: "accounts/list",
      openfinance_list_transactions: "transactions/list",
      openfinance_list_connections: "connections/list",
      openfinance_force_sync: "connections/sync",
      openfinance_get_item_status: "connections/status",
    };
    const mcp: { callTool: (n: string, a?: Record<string, unknown>) => Promise<any> } = /^https?:\/\//i.test(cfg)
      ? await (async () => { const c = new McpClient(cfg); await c.initialize(); return c; })()
      : {
          callTool: async (name, args = {}) => {
            const res = await fetch(`https://api.mcp.ai/api/openfinance/${REST_PATHS[name] ?? name}`, {
              method: "POST",
              headers: { Authorization: `Bearer ${cfg}`, "Content-Type": "application/json", Accept: "application/json" },
              body: JSON.stringify(args),
            });
            const text = await res.text();
            let parsed: any = null;
            try { parsed = JSON.parse(text); } catch { /* texto */ }
            if (!res.ok && !parsed) throw new Error(`Erro na chamada ${name} (${res.status}): ${text.slice(0, 200)}`);
            if (parsed?.ok === false || (parsed?.error && !parsed?.result)) {
              const msg = typeof parsed.error === "string" ? parsed.error : parsed.error?.message;
              throw new Error(msg || parsed.message || `Erro em ${name}`);
            }
            return parsed?.result ?? parsed ?? {};
          },
        };

    const pickArray = (res: any): Record<string, any>[] => {
      if (!res) return [];
      for (const k of ["results", "accounts", "data", "items"]) {
        if (Array.isArray(res[k])) return res[k];
      }
      if (Array.isArray(res)) return res;
      return [];
    };

    const billingError = (res: any): string | null => {
      if (res && typeof res === "object" && (res.is_billing_notice || res.status === "trial_limit_reached")) {
        return String(res.message || "Limite do plano Open Finance atingido.");
      }
      return null;
    };

    let accountsRes = await mcp.callTool("openfinance_list_accounts", {});
    let accounts = pickArray(accountsRes);
    if (accounts.length === 0 && !billingError(accountsRes)) {
      accountsRes = await mcp.callTool("openfinance_list_accounts", { type: "BANK" });
      accounts = pickArray(accountsRes);
    }
    if (body?.debug) {
      return json({ debug: true, accountsRes });
    }

    const billing = billingError(accountsRes);
    if (billing) {
      return json({ error: billing, billing: true, checkoutUrls: accountsRes?.checkout_urls ?? null }, 402);
    }
    if (accounts.length === 0) {
      return json({
        error: "Nenhuma conta bancária conectada no Open Finance",
        detalhe: JSON.stringify(accountsRes).slice(0, 500),
      }, 400);
    }

    // Conciliação bancária deve considerar SOMENTE conta corrente/poupança.
    // Cartão de crédito é tratado exclusivamente no módulo de Cartão de Crédito.
    const isCreditCardAccount = (acc: Record<string, any>): boolean => {
      const blob = [acc.type, acc.subtype, acc.product, acc.category, acc.name, acc.description]
        .filter(Boolean)
        .join(" ")
        .toUpperCase();
      return /CREDIT_?CARD|CREDITCARD|CARTAO|CARTÃO|\bCARD\b|CREDITO ROTATIVO/.test(blob);
    };
    const bankAccounts = accounts.filter((a) => !isCreditCardAccount(a));
    const cartoesIgnorados = accounts.length - bankAccounts.length;
    if (bankAccounts.length === 0) {
      return json({
        error: "Nenhuma conta corrente conectada no Open Finance (apenas cartões de crédito foram encontrados).",
      }, 400);
    }
    accounts = bankAccounts;

    const bankName = fixMojibake(String(accountsRes?.bank ?? accounts[0]?.bank ?? accounts[0]?.name ?? "Open Finance"));
    const accountLabel = String(accounts[0]?.number ?? accounts[0]?.account ?? "");



    const raw: Record<string, any>[] = [];
    for (const acc of accounts) {
      const accountId = String(acc.account_id ?? acc.id);
      let page = 1;
      let totalPages = 1;
      while (page <= totalPages && page <= 20) {
        const res = await mcp.callTool("openfinance_list_transactions", {
          account_id: accountId,
          from,
          to,
          page,
          page_size: 200,
          detail: body?.detailMode ?? "raw",
        });
        const results = (res?.results ?? []) as Record<string, any>[];
        // Segurança extra: descarta linhas marcadas como cartão de crédito pela API
        const somenteConta = results.filter((r) => {
          const blob = [r.accountType, r.account_type, r.productType, r.cardNumber, r.card_number, r.creditCardMetadata]
            .filter(Boolean)
            .join(" ")
            .toUpperCase();
          return !/CREDIT_?CARD|CREDITCARD|CARTAO|CARTÃO|\bCARD\b/.test(blob);
        });
        raw.push(...somenteConta);
        totalPages = Number(res?.totalPages ?? 1) || 1;
        if (results.length === 0) break;
        page++;
      }
    }


    const admin = createClient(supabaseUrl, serviceKey);

    // Titular da conta: todas as raízes de CNPJ dos estabelecimentos da empresa
    {
      const { data: est } = await admin.from("fiscal_establishments").select("cnpj, razao_social");
      const roots = new Set<string>(["23662751"]);
      const names = new Set<string>(["SIME TRANSPORTE"]);
      (est ?? []).forEach((e: any) => {
        const d = onlyDigits(e.cnpj);
        if (d.length === 14) roots.add(d.slice(0, 8));
        const n = String(e.razao_social ?? "").toUpperCase().split(" - ")[0].replace(/\s+LTDA.*$/, "").trim();
        if (n.length >= 5) names.add(n);
      });
      HOLDER_ROOTS = roots;
      HOLDER_NAMES = [...names];
    }

    const transactions = raw
      .map(adaptTransaction)
      .filter((t): t is NormalizedTx => t !== null);

    // Favorecido só com CPF/CNPJ (inclusive mascarado "***.133.132-**"): busca o nome no cadastro de pessoas
    const semNome = transactions.filter((t) => t.detalhes && !t.detalhes.contraparte && t.detalhes.documentoContraparte);
    if (semNome.length) {
      const { data: pessoas } = await admin.from("profiles").select("full_name, razao_social, cnpj").not("cnpj", "is", null).limit(10000);
      const lista = (pessoas ?? []).map((p: any) => ({ nome: p.razao_social || p.full_name, doc: onlyDigits(p.cnpj) })).filter((p) => p.nome && p.doc);
      for (const t of semNome) {
        const raw = String(t.detalhes!.documentoContraparte);
        let cand: typeof lista = [];
        if (raw.includes("*")) {
          // CPF mascarado: dígitos visíveis nas posições 4-9
          const m = raw.match(/\*{3}\.?(\d{3})\.?(\d{3})-?\*{2}/);
          if (m) cand = lista.filter((p) => p.doc.length === 11 && p.doc.slice(3, 9) === m[1] + m[2]);
        } else {
          const d = onlyDigits(raw);
          cand = lista.filter((p) => p.doc === d);
        }
        const nomes = [...new Set(cand.map((c) => c.nome))];
        if (nomes.length === 1) t.detalhes!.contraparte = nomes[0];
      }
    }

    // Deduplicação pelo ID único da API contra o que já foi gravado
    const ids = transactions.map((t) => t.externalId);
    const known = new Set<string>();
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200);
      if (!chunk.length) continue;
      const { data } = await admin.from("bank_reconciliation_items").select("fitid").in("fitid", chunk);
      (data ?? []).forEach((r: { fitid: string | null }) => r.fitid && known.add(r.fitid));
    }

    const seen = new Set<string>();
    const forcarTodos = body?.ignoreDedup === true;
    const novos = transactions.filter((t) => {
      if ((!forcarTodos && known.has(t.externalId)) || seen.has(t.externalId)) return false;
      seen.add(t.externalId);
      return true;
    });

    return json({
      fetchedAt: new Date().toISOString(),
      bankName,
      accountLabel,
      periodo: { from, to },
      total: transactions.length,
      duplicados: transactions.length - novos.length,
      novos: novos.length,
      cartoesIgnorados,
      transactions: novos,

    });
  } catch (err) {
    console.error("open-finance-sync:", err);
    return json({ error: err instanceof Error ? err.message : "Erro inesperado" }, 500);
  }
});
