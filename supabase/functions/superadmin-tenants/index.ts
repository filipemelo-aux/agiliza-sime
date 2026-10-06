import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";
import { syncCertificateToFocus } from "../_shared/focusCertificate.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const digits = (v?: string | null) => (v || "").replace(/\D/g, "");

const TenantSchema = z.object({
  id: z.string().uuid().optional(),
  razao_social: z.string().trim().min(2).max(200),
  nome_fantasia: z.string().trim().max(200).optional().nullable(),
  cnpj: z.string().trim().min(14).max(18),
  ie: z.string().trim().max(30).optional().nullable(),
  rntrc: z.string().trim().max(20).optional().nullable(),
  logradouro: z.string().max(200).optional().nullable(),
  numero: z.string().max(20).optional().nullable(),
  complemento: z.string().max(100).optional().nullable(),
  bairro: z.string().max(100).optional().nullable(),
  municipio: z.string().max(100).optional().nullable(),
  uf: z.string().max(2).optional().nullable(),
  cep: z.string().max(10).optional().nullable(),
  codigo_municipio: z.string().max(10).optional().nullable(),
  telefone: z.string().max(30).optional().nullable(),
  email: z.string().max(200).optional().nullable(),
  logo_url: z.string().max(500_000).optional().nullable(),
  focus_environment: z.enum(["production", "homologation"]),
  nfe_sync_enabled: z.boolean().optional(),
  nfe_sync_start_hour: z.number().int().min(0).max(23).optional(),
  nfe_sync_interval_hours: z.number().int().min(1).max(24).optional(),
});

const SaveSchema = z.object({
  action: z.literal("save"),
  tenant: TenantSchema,
  secrets: z.object({
    focus_nfe_token_production: z.string().max(500).optional().nullable(),
    focus_nfe_token_homologation: z.string().max(500).optional().nullable(),
    focus_nfe_token_master: z.string().max(500).optional().nullable(),
    certificate_password: z.string().max(200).optional().nullable(),
  }).optional(),
  certificate: z.object({ file_name: z.string().max(200), base64: z.string().max(20_000_000) }).optional().nullable(),
  admin: z.object({
    full_name: z.string().trim().min(2).max(200),
    email: z.string().trim().email().max(200),
    password: z.string().min(8).max(100),
  }).optional().nullable(),
  matriz_numeracao: z.object({
    ultimo_numero_cte: z.number().int().min(0).max(999999999).optional().nullable(),
    ultimo_numero_cte_servico: z.number().int().min(0).max(999999999).optional().nullable(),
    ultimo_numero_mdfe: z.number().int().min(0).max(999999999).optional().nullable(),
  }).optional(),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "Não autorizado" }, 401);
    const caller = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: { user } } = await caller.auth.getUser();
    if (!user) return json({ error: "Não autorizado" }, 401);
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", user.id);
    if (!roles?.some((r: any) => r.role === "superadmin")) return json({ error: "Acesso restrito ao SuperAdmin" }, 403);

    const body = await req.json();

    if (body.action === "list") {
      const { data: tenants, error } = await admin.from("tenants").select("*").order("razao_social");
      if (error) throw error;
      const { data: members } = await admin.from("tenant_members").select("tenant_id");
      const { data: fcerts } = await admin.from("fiscal_certificates").select("tenant_id, nome, ativo, senha_criptografada, created_at").order("created_at", { ascending: false });
      let { data: secrets } = await admin.from("tenant_secrets").select("tenant_id, focus_nfe_token_production, focus_nfe_token_homologation, focus_nfe_token_master, certificate_password");
      // Adota os tokens já em uso (padrão do servidor) para a empresa que já emite com certificado próprio
      const envProd = Deno.env.get("FOCUS_NFE_TOKEN_PRODUCAO") || null;
      const envHom = Deno.env.get("FOCUS_NFE_TOKEN_HOMOLOGACAO") || null;
      const owners = [...new Set((fcerts || []).map((c: any) => c.tenant_id).filter(Boolean))];
      let changed = false;
      for (const tid of owners) {
        const s = secrets?.find((x: any) => x.tenant_id === tid);
        if (!s?.focus_nfe_token_production && !s?.focus_nfe_token_homologation && (envProd || envHom)) {
          await admin.from("tenant_secrets").upsert({ tenant_id: tid, focus_nfe_token_production: envProd, focus_nfe_token_homologation: envHom, certificate_password: s?.certificate_password ?? null }, { onConflict: "tenant_id" });
          changed = true;
        }
      }
      if (changed) ({ data: secrets } = await admin.from("tenant_secrets").select("tenant_id, focus_nfe_token_production, focus_nfe_token_homologation, focus_nfe_token_master, certificate_password"));
      const { data: certs } = await admin.from("tenant_certificates").select("tenant_id, file_name, valid_until, is_active").eq("is_active", true);
      const { data: branches } = await admin.from("fiscal_establishments")
        .select("id,tenant_id,type,cnpj,razao_social,nome_fantasia,inscricao_estadual,rntrc,endereco_logradouro,endereco_numero,endereco_bairro,endereco_municipio,endereco_uf,endereco_cep,codigo_municipio_ibge,ambiente,serie_cte,serie_mdfe,active,ultimo_numero_cte,ultimo_numero_mdfe,ultimo_numero_cte_servico")
        .eq("type", "filial").order("razao_social");
      const { data: bsec } = await admin.from("establishment_secrets").select("establishment_id,focus_nfe_token_production,focus_nfe_token_homologation");
      const { data: blinks } = await admin.from("establishment_certificates").select("establishment_id,certificate_id");
      const { data: mlinks } = await admin.from("fiscal_establishments").select("id,tenant_id").eq("type", "matriz");
      return json({
        branches: (branches || []).map((b: any) => {
          const x = (bsec || []).find((r: any) => r.establishment_id === b.id);
          const link = (blinks || []).find((l: any) => l.establishment_id === b.id);
          const m = (mlinks || []).find((r: any) => r.tenant_id === b.tenant_id);
          const mLink = m ? (blinks || []).find((l: any) => l.establishment_id === m.id) : null;
          const cert = link ? (fcerts as any[] || []).find(() => false) : null;
          return {
            ...b, has_token_production: !!x?.focus_nfe_token_production, has_token_homologation: !!x?.focus_nfe_token_homologation,
            has_certificate: !!link, same_certificate_as_matriz: !!link && !!mLink && link.certificate_id === mLink.certificate_id, _c: cert,
          };
        }),
        tenants: (tenants || []).map((t: any) => {
          const s = secrets?.find((x: any) => x.tenant_id === t.id);
          const fc = (fcerts || []).find((c: any) => c.tenant_id === t.id && c.ativo) || (fcerts || []).find((c: any) => c.tenant_id === t.id);
          return {
            ...t,
            users_count: members?.filter((m: any) => m.tenant_id === t.id).length || 0,
            has_token_production: !!s?.focus_nfe_token_production,
            has_token_homologation: !!s?.focus_nfe_token_homologation,
            has_master_token: !!s?.focus_nfe_token_master || !!Deno.env.get("FOCUS_NFE_TOKEN_MASTER"),
            has_certificate_password: !!s?.certificate_password || !!fc?.senha_criptografada,
            certificate: certs?.find((c: any) => c.tenant_id === t.id) || (fc ? { file_name: fc.nome, valid_until: null } : null),
            server_token_production: !!envProd,
            server_token_homologation: !!envHom,
          };
        }),
      });
    }

    if (body.action === "list_establishments") {
      const p = z.object({ tenant_id: z.string().uuid() }).safeParse(body);
      if (!p.success) return json({ error: "Dados inválidos" }, 400);
      const { data, error } = await admin.from("fiscal_establishments")
        .select("id,type,cnpj,razao_social,nome_fantasia,inscricao_estadual,rntrc,endereco_logradouro,endereco_numero,endereco_bairro,endereco_municipio,endereco_uf,endereco_cep,codigo_municipio_ibge,ambiente,serie_cte,serie_mdfe,active,ultimo_numero_cte,ultimo_numero_mdfe,ultimo_numero_cte_servico")
        .eq("tenant_id", p.data.tenant_id).order("type").order("razao_social");
      if (error) throw error;
      const { data: es } = await admin.from("establishment_secrets").select("establishment_id,focus_nfe_token_production,focus_nfe_token_homologation").eq("tenant_id", p.data.tenant_id);
      const { data: ts } = await admin.from("tenant_secrets").select("focus_nfe_token_master").eq("tenant_id", p.data.tenant_id).maybeSingle();
      const { data: fc } = await admin.from("fiscal_certificates").select("id,nome,ativo,created_at,cnpj,titular,valid_until,focus_sync_status,focus_sync_message,focus_synced_at").eq("tenant_id", p.data.tenant_id).order("created_at", { ascending: false });
      const { data: links } = await admin.from("establishment_certificates").select("certificate_id,establishment_id").eq("tenant_id", p.data.tenant_id);
      return json({
        has_master_token: !!(ts?.focus_nfe_token_master || Deno.env.get("FOCUS_NFE_TOKEN_MASTER")),
        establishments: (data || []).map((e: any) => {
          const x = (es || []).find((r: any) => r.establishment_id === e.id);
          return { ...e, has_token_production: !!x?.focus_nfe_token_production, has_token_homologation: !!x?.focus_nfe_token_homologation };
        }),
        certificates: (fc || []).map((c: any) => ({ ...c, establishment_ids: (links || []).filter((l: any) => l.certificate_id === c.id).map((l: any) => l.establishment_id) })),
      });
    }

    if (body.action === "set_certificate_links") {
      const p = z.object({ tenant_id: z.string().uuid(), certificate_id: z.string().uuid(), establishment_ids: z.array(z.string().uuid()).max(100) }).safeParse(body);
      if (!p.success) return json({ error: "Dados inválidos" }, 400);
      const { tenant_id, certificate_id, establishment_ids } = p.data;
      const { data: c } = await admin.from("fiscal_certificates").select("id").eq("id", certificate_id).eq("tenant_id", tenant_id).maybeSingle();
      if (!c) return json({ error: "Certificado não encontrado" }, 404);
      const { data: ests } = await admin.from("fiscal_establishments").select("id").eq("tenant_id", tenant_id).in("id", establishment_ids.length ? establishment_ids : ["00000000-0000-0000-0000-000000000000"]);
      const valid = (ests || []).map((e: any) => e.id);
      await admin.from("establishment_certificates").delete().eq("certificate_id", certificate_id);
      if (valid.length) {
        // cada estabelecimento usa um único certificado
        await admin.from("establishment_certificates").delete().in("establishment_id", valid);
        const { error } = await admin.from("establishment_certificates").insert(valid.map((id: string) => ({ certificate_id, establishment_id: id, tenant_id })));
        if (error) throw error;
      }
      return json({ success: true });
    }

    if (body.action === "save_establishment") {
      const p = z.object({
        tenant_id: z.string().uuid(),
        establishment: z.object({
          id: z.string().uuid().optional().nullable(),
          type: z.enum(["matriz", "filial"]),
          cnpj: z.string().trim().min(14).max(18),
          razao_social: z.string().trim().min(2).max(200),
          nome_fantasia: z.string().max(200).optional().nullable(),
          inscricao_estadual: z.string().max(30).optional().nullable(),
          rntrc: z.string().max(20).optional().nullable(),
          endereco_logradouro: z.string().max(200).optional().nullable(),
          endereco_numero: z.string().max(20).optional().nullable(),
          endereco_bairro: z.string().max(100).optional().nullable(),
          endereco_municipio: z.string().max(100).optional().nullable(),
          endereco_uf: z.string().max(2).optional().nullable(),
          endereco_cep: z.string().max(10).optional().nullable(),
          codigo_municipio_ibge: z.string().max(10).optional().nullable(),
          ambiente: z.enum(["producao", "homologacao"]),
          serie_cte: z.number().int().min(0).max(999).optional().nullable(),
          serie_mdfe: z.number().int().min(0).max(999).optional().nullable(),
          active: z.boolean().optional(),
          ultimo_numero_cte: z.number().int().min(0).max(999999999).optional().nullable(),
          ultimo_numero_mdfe: z.number().int().min(0).max(999999999).optional().nullable(),
          ultimo_numero_cte_servico: z.number().int().min(0).max(999999999).optional().nullable(),
        }),
        tokens: z.object({
          focus_nfe_token_production: z.string().trim().max(500).optional().nullable(),
          focus_nfe_token_homologation: z.string().trim().max(500).optional().nullable(),
        }).optional(),
        certificate_mode: z.enum(["keep", "matriz", "new"]).optional(),
        certificate: z.object({ file_name: z.string().max(200), base64: z.string().max(20_000_000), password: z.string().min(1).max(200) }).optional().nullable(),
      }).safeParse(body);
      if (!p.success) return json({ error: "Dados inválidos", details: p.error.flatten().fieldErrors }, 400);
      const { tenant_id, establishment: e, tokens, certificate_mode, certificate } = p.data;
      const saveTokens = async (estId: string) => {
        if (!tokens) return;
        const patch: Record<string, unknown> = { establishment_id: estId, tenant_id };
        let any = false;
        for (const k of ["focus_nfe_token_production", "focus_nfe_token_homologation"] as const) {
          if (tokens[k] !== undefined && tokens[k] !== "") { patch[k] = tokens[k] || null; any = true; }
        }
        if (any) { const { error } = await admin.from("establishment_secrets").upsert(patch, { onConflict: "establishment_id" }); if (error) throw error; }
      };
      const applyCert = async (estId: string): Promise<{ ok: boolean; message: string } | null> => {
        if (!certificate_mode || certificate_mode === "keep") return null;
        if (certificate_mode === "matriz") {
          const { data: m } = await admin.from("fiscal_establishments").select("id").eq("tenant_id", tenant_id).eq("type", "matriz").maybeSingle();
          const { data: ml } = m ? await admin.from("establishment_certificates").select("certificate_id").eq("establishment_id", m.id).limit(1).maybeSingle() : { data: null };
          if (!ml) return { ok: false, message: "A matriz não tem certificado vinculado" };
          await admin.from("establishment_certificates").delete().eq("establishment_id", estId);
          const { error } = await admin.from("establishment_certificates").insert({ certificate_id: ml.certificate_id, establishment_id: estId, tenant_id });
          if (error) throw error;
          return await syncCertificateToFocus(admin, ml.certificate_id);
        }
        if (!certificate) throw new Error("Envie o arquivo do certificado e a senha");
        const bin = Uint8Array.from(atob(certificate.base64), (c) => c.charCodeAt(0));
        const info = parsePfx(bin.buffer, certificate.password);
        if (info.validUntil.getTime() < Date.now()) throw new Error(`Certificado vencido em ${info.validUntil.toLocaleDateString("pt-BR")}`);
        if (info.cnpj && info.cnpj.slice(0, 8) !== digits(e.cnpj).slice(0, 8)) throw new Error(`Este certificado é do CNPJ ${info.cnpj}, que não pertence a esta empresa`);
        const path = `certificates/${crypto.randomUUID()}_${certificate.file_name.replace(/[^a-zA-Z0-9._-]/g, "")}`;
        const { error: upErr } = await admin.storage.from("fiscal-certificates").upload(path, bin, { contentType: "application/x-pkcs12", upsert: false });
        if (upErr) throw new Error("Erro ao armazenar certificado");
        const { data: cert, error: insErr } = await admin.from("fiscal_certificates").insert({
          nome: certificate.file_name, caminho_storage: path, senha_criptografada: await encryptCertPassword(certificate.password),
          tenant_id, cnpj: info.cnpj, titular: info.titular, valid_until: info.validUntil.toISOString(), focus_sync_status: "pendente",
        }).select("id").single();
        if (insErr) { await admin.storage.from("fiscal-certificates").remove([path]); throw new Error("Erro ao salvar certificado"); }
        await admin.from("establishment_certificates").delete().eq("establishment_id", estId);
        const { error } = await admin.from("establishment_certificates").insert({ certificate_id: cert.id, establishment_id: estId, tenant_id });
        if (error) throw error;
        return await syncCertificateToFocus(admin, cert.id);
      };
      const { data: t } = await admin.from("tenants").select("cnpj").eq("id", tenant_id).single();
      if (!t) return json({ error: "Empresa não encontrada" }, 404);
      const cnpj = digits(e.cnpj);
      if (cnpj.length !== 14) return json({ error: "CNPJ inválido" }, 400);
      if (cnpj.slice(0, 8) !== digits(t.cnpj).slice(0, 8)) return json({ error: "A filial precisa ter a mesma raiz de CNPJ (8 primeiros dígitos) da empresa matriz" }, 400);
      if (e.type === "matriz") {
        const { data: m } = await admin.from("fiscal_establishments").select("id").eq("tenant_id", tenant_id).eq("type", "matriz");
        if (m?.some((x: any) => x.id !== e.id)) return json({ error: "Esta empresa já possui uma matriz" }, 400);
      }
      const { data: dup } = await admin.from("fiscal_establishments").select("id").eq("tenant_id", tenant_id).eq("cnpj", cnpj);
      if (dup?.some((x: any) => x.id !== e.id)) return json({ error: "Já existe um estabelecimento com este CNPJ" }, 400);
      const { id, ...rest } = e;
      const row = { ...rest, cnpj, endereco_cep: digits(e.endereco_cep) || null, endereco_uf: e.endereco_uf?.toUpperCase() || null, tenant_id };
      let estId = id;
      if (id) {
        const { error } = await admin.from("fiscal_establishments").update(row).eq("id", id).eq("tenant_id", tenant_id);
        if (error) throw error;
      } else {
        const { data, error } = await admin.from("fiscal_establishments").insert(row).select("id").single();
        if (error) throw error;
        estId = data.id;
      }
      await saveTokens(estId!);
      const focus = await applyCert(estId!);
      return json({ success: true, id: estId, focus });
    }

    if (body.action === "set_master_token") {
      const p = z.object({ tenant_id: z.string().uuid(), token: z.string().trim().max(500).nullable() }).safeParse(body);
      if (!p.success) return json({ error: "Dados inválidos" }, 400);
      const { error } = await admin.from("tenant_secrets").upsert({ tenant_id: p.data.tenant_id, focus_nfe_token_master: p.data.token || null }, { onConflict: "tenant_id" });
      if (error) throw error;
      return json({ success: true });
    }

    if (body.action === "sync_certificate") {
      const p = z.object({ tenant_id: z.string().uuid(), certificate_id: z.string().uuid() }).safeParse(body);
      if (!p.success) return json({ error: "Dados inválidos" }, 400);
      const { data: c } = await admin.from("fiscal_certificates").select("id").eq("id", p.data.certificate_id).eq("tenant_id", p.data.tenant_id).maybeSingle();
      if (!c) return json({ error: "Certificado não encontrado" }, 404);
      return json(await syncCertificateToFocus(admin, c.id));
    }

    if (body.action === "test_focus_token") {
      const p = z.object({ tenant_id: z.string().uuid(), establishment_id: z.string().uuid(), ambiente: z.enum(["producao", "homologacao"]) }).safeParse(body);
      if (!p.success) return json({ error: "Dados inválidos" }, 400);
      const { data: est } = await admin.from("fiscal_establishments").select("id").eq("id", p.data.establishment_id).eq("tenant_id", p.data.tenant_id).maybeSingle();
      if (!est) return json({ error: "Estabelecimento não encontrado" }, 404);
      const { data: sec } = await admin.from("establishment_secrets").select("focus_nfe_token_production,focus_nfe_token_homologation").eq("establishment_id", est.id).maybeSingle();
      const prod = p.data.ambiente === "producao";
      const token = prod ? sec?.focus_nfe_token_production : sec?.focus_nfe_token_homologation;
      if (!token) return json({ ok: false, message: "Token não informado para este ambiente" });
      const base = prod ? "https://api.focusnfe.com.br" : "https://homologacao.focusnfe.com.br";
      const r = await fetch(`${base}/v2/cte/teste-conexao-agiliza`, { headers: { Authorization: "Basic " + btoa(token + ":") } });
      await r.text();
      if (r.status === 401 || r.status === 403) return json({ ok: false, message: "Token recusado pela Focus" });
      return json({ ok: true, message: "Token aceito pela Focus" });
    }

    if (body.action === "homologation_test") {
      const p = z.object({ tenant_id: z.string().uuid(), establishment_id: z.string().uuid() }).safeParse(body);
      if (!p.success) return json({ error: "Dados inválidos" }, 400);
      const { data: est } = await admin.from("fiscal_establishments").select("id,cnpj,inscricao_estadual,codigo_municipio_ibge,endereco_uf").eq("id", p.data.establishment_id).eq("tenant_id", p.data.tenant_id).maybeSingle();
      if (!est) return json({ error: "Estabelecimento não encontrado" }, 404);
      const steps: { label: string; ok: boolean; message: string }[] = [];
      const add = (label: string, ok: boolean, message: string) => steps.push({ label, ok, message });

      const faltando = [!est.cnpj && "CNPJ", !est.inscricao_estadual && "IE", !est.codigo_municipio_ibge && "Cód. IBGE", !est.endereco_uf && "UF"].filter(Boolean);
      add("Dados cadastrais", faltando.length === 0, faltando.length ? `Faltando: ${faltando.join(", ")}` : "CNPJ, IE, município e UF preenchidos");

      const { data: sec } = await admin.from("establishment_secrets").select("focus_nfe_token_homologation").eq("establishment_id", est.id).maybeSingle();
      const { data: tsec } = await admin.from("tenant_secrets").select("focus_nfe_token_homologation,focus_nfe_token_master").eq("tenant_id", p.data.tenant_id).maybeSingle();
      const token = sec?.focus_nfe_token_homologation || tsec?.focus_nfe_token_homologation;
      if (!token) add("Token de homologação", false, "Nenhum token de homologação informado");
      else {
        try {
          const r = await fetch("https://homologacao.focusnfe.com.br/v2/cte/teste-conexao-agiliza", { headers: { Authorization: "Basic " + btoa(token + ":") } });
          await r.text();
          const ok = r.status !== 401 && r.status !== 403;
          add("Token de homologação", ok, ok ? `Aceito pela Focus${sec?.focus_nfe_token_homologation ? "" : " (token da empresa)"}` : "Token recusado pela Focus");
        } catch { add("Token de homologação", false, "Sem comunicação com a Focus"); }
      }

      const { data: links } = await admin.from("establishment_certificates").select("certificate_id").eq("establishment_id", est.id);
      const ids = (links || []).map((l: any) => l.certificate_id);
      const { data: certs } = ids.length ? await admin.from("fiscal_certificates").select("*").in("id", ids) : { data: [] as any[] };
      const cert = ((certs || []) as any[]).find((c) => c.active !== false && c.ativo !== false);
      if (!cert) add("Certificado A1", false, "Nenhum certificado ativo vinculado");
      else {
        const vence = cert.valid_until ? new Date(cert.valid_until) : null;
        const ok = !vence || vence > new Date();
        add("Certificado A1", ok, `${cert.titular || cert.nome || "Certificado"}${vence ? ` — válido até ${vence.toLocaleDateString("pt-BR")}` : ""}${ok ? "" : " (VENCIDO)"}`);
      }

      const master = tsec?.focus_nfe_token_master;
      if (!master) add("Empresa na Focus", false, "Token principal não informado — não foi possível conferir");
      else {
        try {
          const r = await fetch(`https://api.focusnfe.com.br/v2/empresas?cnpj=${String(est.cnpj).replace(/\D/g, "")}`, { headers: { Authorization: "Basic " + btoa(master + ":") } });
          const j = await r.json().catch(() => null);
          const emp = Array.isArray(j) ? j[0] : null;
          if (!r.ok) add("Empresa na Focus", false, r.status === 401 ? "Token principal recusado" : `Focus respondeu ${r.status}`);
          else if (!emp) add("Empresa na Focus", false, "CNPJ não encontrado na conta Focus");
          else {
            const cte = emp.habilita_cte !== false;
            const certFocus = emp.certificado_valido_ate ? ` — certificado na Focus até ${new Date(emp.certificado_valido_ate).toLocaleDateString("pt-BR")}` : " — sem certificado na Focus";
            add("Empresa na Focus", cte && !!emp.certificado_valido_ate, `${cte ? "CT-e habilitado" : "CT-e NÃO habilitado"}${certFocus}`);
          }
        } catch { add("Empresa na Focus", false, "Sem comunicação com a Focus"); }
      }

      return json({ ok: steps.every((s) => s.ok), steps });
    }

    if (body.action === "set_status") {
      const p = z.object({ id: z.string().uuid(), status: z.enum(["active", "suspended"]) }).safeParse(body);
      if (!p.success) return json({ error: "Dados inválidos" }, 400);
      const { error } = await admin.from("tenants").update({ status: p.data.status }).eq("id", p.data.id);
      if (error) throw error;
      return json({ success: true });
    }

    if (body.action === "save") {
      const p = SaveSchema.safeParse(body);
      if (!p.success) return json({ error: "Dados inválidos", details: p.error.flatten().fieldErrors }, 400);
      const { tenant, secrets, certificate, admin: firstAdmin, matriz_numeracao } = p.data;
      const row = { ...tenant, cnpj: digits(tenant.cnpj), cep: digits(tenant.cep) || null };
      const isNew = !tenant.id;
      let tenantId = tenant.id;

      if (isNew) {
        delete (row as any).id;
        const { data, error } = await admin.from("tenants").insert(row).select("id").single();
        if (error) throw new Error(error.code === "23505" ? "Já existe uma empresa com este CNPJ" : error.message);
        tenantId = data.id;
        const { error: estErr } = await admin.from("fiscal_establishments").insert({
          tenant_id: tenantId, type: "matriz", cnpj: row.cnpj, razao_social: row.razao_social,
          nome_fantasia: row.nome_fantasia, inscricao_estadual: row.ie, rntrc: row.rntrc,
          endereco_logradouro: row.logradouro, endereco_numero: row.numero, endereco_bairro: row.bairro,
          endereco_municipio: row.municipio, endereco_uf: row.uf, endereco_cep: row.cep,
          codigo_municipio_ibge: row.codigo_municipio,
          ambiente: row.focus_environment === "production" ? "producao" : "homologacao",
        });
        if (estErr) throw new Error("Erro ao criar estabelecimento matriz: " + estErr.message);
      } else {
        const { id: _id, ...upd } = row as any;
        const { error } = await admin.from("tenants").update(upd).eq("id", tenantId);
        if (error) throw error;
        // Matriz fiscal espelha os dados cadastrais da empresa
        const { error: mErr } = await admin.from("fiscal_establishments").update({
          cnpj: row.cnpj, razao_social: row.razao_social, nome_fantasia: row.nome_fantasia, inscricao_estadual: row.ie, rntrc: row.rntrc,
          endereco_logradouro: row.logradouro, endereco_numero: row.numero, endereco_bairro: row.bairro,
          endereco_municipio: row.municipio, endereco_uf: row.uf, endereco_cep: row.cep, codigo_municipio_ibge: row.codigo_municipio,
          ambiente: row.focus_environment === "production" ? "producao" : "homologacao",
        }).eq("tenant_id", tenantId).eq("type", "matriz");
        if (mErr) throw new Error("Erro ao atualizar a matriz: " + mErr.message);
      }

      if (matriz_numeracao) {
        const nums: Record<string, number> = {};
        for (const k of ["ultimo_numero_cte", "ultimo_numero_cte_servico", "ultimo_numero_mdfe"] as const) {
          const v = matriz_numeracao[k];
          if (v !== undefined && v !== null) nums[k] = v;
        }
        if (Object.keys(nums).length > 0) {
          const { error: nErr } = await admin.from("fiscal_establishments").update(nums).eq("tenant_id", tenantId).eq("type", "matriz");
          if (nErr) throw new Error("Erro ao atualizar a numeração da matriz: " + nErr.message);
        }
      }

      if (secrets) {
        const patch: Record<string, unknown> = { tenant_id: tenantId, updated_at: new Date().toISOString() };
        for (const k of ["focus_nfe_token_production", "focus_nfe_token_homologation", "focus_nfe_token_master", "certificate_password"] as const) {
          if (secrets[k]) patch[k] = secrets[k];
        }
        if (Object.keys(patch).length > 2) {
          const { error } = await admin.from("tenant_secrets").upsert(patch, { onConflict: "tenant_id" });
          if (error) throw error;
        }
      }

      if (certificate) {
        const bin = Uint8Array.from(atob(certificate.base64), (c) => c.charCodeAt(0));
        const path = `${tenantId}/${Date.now()}.pfx`;
        const { error: upErr } = await admin.storage.from("tenant-certificates").upload(path, bin, { contentType: "application/x-pkcs12" });
        if (upErr) throw upErr;
        await admin.from("tenant_certificates").update({ is_active: false }).eq("tenant_id", tenantId);
        await admin.from("tenant_certificates").insert({ tenant_id: tenantId, storage_path: path, file_name: certificate.file_name, is_active: true });
      }

      if (firstAdmin) {
        const email = firstAdmin.email.toLowerCase();
        const { data: created, error: cErr } = await admin.auth.admin.createUser({
          email, password: firstAdmin.password, email_confirm: true, user_metadata: { must_change_password: true },
        });
        if (cErr) throw new Error("Erro ao criar administrador: " + cErr.message);
        const uid = created.user.id;
        await admin.from("tenant_members").insert({ tenant_id: tenantId, user_id: uid });
        await admin.from("user_roles").insert({ user_id: uid, role: "admin" });
        await admin.from("profiles").insert({ user_id: uid, full_name: firstAdmin.full_name, email, category: "Colaborador", person_type: "fisica", tenant_id: tenantId });
      }

      return json({ success: true, id: tenantId });
    }

    return json({ error: "Ação inválida" }, 400);
  } catch (e: any) {
    console.error(e);
    return json({ error: e?.message || "Erro interno" }, 500);
  }
});
