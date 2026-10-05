import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";

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
});

const SaveSchema = z.object({
  action: z.literal("save"),
  tenant: TenantSchema,
  secrets: z.object({
    focus_nfe_token_production: z.string().max(500).optional().nullable(),
    focus_nfe_token_homologation: z.string().max(500).optional().nullable(),
    certificate_password: z.string().max(200).optional().nullable(),
  }).optional(),
  certificate: z.object({ file_name: z.string().max(200), base64: z.string().max(20_000_000) }).optional().nullable(),
  admin: z.object({
    full_name: z.string().trim().min(2).max(200),
    email: z.string().trim().email().max(200),
    password: z.string().min(8).max(100),
  }).optional().nullable(),
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
      const { data: secrets } = await admin.from("tenant_secrets").select("tenant_id, focus_nfe_token_production, focus_nfe_token_homologation, certificate_password");
      const { data: certs } = await admin.from("tenant_certificates").select("tenant_id, file_name, valid_until, is_active").eq("is_active", true);
      return json({
        tenants: (tenants || []).map((t: any) => {
          const s = secrets?.find((x: any) => x.tenant_id === t.id);
          return {
            ...t,
            users_count: members?.filter((m: any) => m.tenant_id === t.id).length || 0,
            has_token_production: !!s?.focus_nfe_token_production,
            has_token_homologation: !!s?.focus_nfe_token_homologation,
            has_certificate_password: !!s?.certificate_password,
            certificate: certs?.find((c: any) => c.tenant_id === t.id) || null,
          };
        }),
      });
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
      const { tenant, secrets, certificate, admin: firstAdmin } = p.data;
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
      }

      if (secrets) {
        const patch: Record<string, unknown> = { tenant_id: tenantId, updated_at: new Date().toISOString() };
        for (const k of ["focus_nfe_token_production", "focus_nfe_token_homologation", "certificate_password"] as const) {
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
