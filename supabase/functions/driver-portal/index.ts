import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

const onlyDigits = (s: unknown) => String(s ?? "").replace(/\D/g, "");
export const driverEmail = (cpf: string) => `${cpf}@motorista.agiliza.app`;

function validCpf(c: string) {
  if (!/^\d{11}$/.test(c) || /^(\d)\1{10}$/.test(c)) return false;
  const dv = (n: number) => {
    let s = 0;
    for (let i = 0; i < n; i++) s += Number(c[i]) * (n + 1 - i);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(c[9]) && dv(10) === Number(c[10]);
}

const NATUREZAS = ["Alimentação", "Pedágio", "Borracharia", "Hospedagem", "Lavagem", "Peças", "Outros"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const loadBranding = async (tenantId: string) => {
      const { data: t } = await admin.from("tenants")
        .select("razao_social, nome_fantasia, cnpj, logo_url").eq("id", tenantId).maybeSingle();
      if (!t) return null;
      return {
        nome: String(t.nome_fantasia || t.razao_social || "").toUpperCase(),
        logo_url: t.logo_url || null,
        cnpj: String(t.cnpj || "").replace(/\D/g, ""),
      };
    };
    const auth = req.headers.get("Authorization") || "";
    const pre = await req.clone().json().catch(() => ({}));
    // ---------- Login do motorista somente com CPF ----------
    if (pre.action === "login") {
      const cpf = onlyDigits(pre.cpf);
      if (!validCpf(cpf)) return json({ error: "CPF inválido" }, 400);
      const { data: acc } = await admin.from("driver_portal_access").select("auth_user_id").eq("cpf", cpf).eq("ativo", true).maybeSingle();
      if (!acc) return json({ error: "CPF sem acesso liberado ao portal" }, 403);
      const { data: link, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: driverEmail(cpf) });
      if (error) throw error;
      return json({ token_hash: link.properties.hashed_token });
    }
    // ---------- Marca da empresa na tela de entrada ----------
    if (pre.action === "branding") {
      const cpf = onlyDigits(pre.cpf);
      if (!validCpf(cpf)) return json({ error: "CPF inválido" }, 400);
      const { data: acc } = await admin.from("driver_portal_access").select("tenant_id").eq("cpf", cpf).eq("ativo", true).maybeSingle();
      if (!acc) return json({ ok: false });
      return json({ ok: true, empresa: await loadBranding(acc.tenant_id) });
    }
    const caller = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: { user } } = await caller.auth.getUser();
    if (!user) return json({ error: "Não autorizado" }, 401);
    const body = await req.json().catch(() => ({}));
    const action = body.action;

    // ---------- Equipe: liberar / redefinir acesso do motorista ----------
    if (action === "grant" || action === "revoke") {
      const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", user.id);
      if (!roles?.some((r: any) => ["admin", "superadmin"].includes(r.role))) return json({ error: "Sem permissão" }, 403);
      const { data: tid } = await caller.rpc("current_tenant_id");
      const { data: prof } = await admin.from("profiles").select("id, tenant_id, full_name").eq("id", body.profile_id).maybeSingle();
      if (!prof || prof.tenant_id !== tid) return json({ error: "Motorista não encontrado" }, 404);

      if (action === "revoke") {
        const { data: acc } = await admin.from("driver_portal_access").select("*").eq("profile_id", prof.id).maybeSingle();
        if (acc) {
          await admin.from("driver_portal_access").update({ ativo: false }).eq("id", acc.id);
          await admin.auth.admin.updateUserById(acc.auth_user_id, { ban_duration: "876000h" });
        }
        return json({ ok: true });
      }

      const cpf = onlyDigits(body.cpf);
      const senha = crypto.randomUUID() + crypto.randomUUID();
      if (!validCpf(cpf)) return json({ error: "CPF inválido" }, 400);

      const { data: other } = await admin.from("driver_portal_access").select("profile_id").eq("cpf", cpf).maybeSingle();
      if (other && other.profile_id !== prof.id) return json({ error: "Este CPF já está liberado para outro motorista" }, 409);
      const { data: acc } = await admin.from("driver_portal_access").select("*").eq("profile_id", prof.id).maybeSingle();

      let authId = acc?.auth_user_id as string | undefined;
      if (authId) {
        const { error } = await admin.auth.admin.updateUserById(authId, {
          email: driverEmail(cpf), password: senha, email_confirm: true, ban_duration: "none",
        });
        if (error) throw error;
      } else {
        const { data, error } = await admin.auth.admin.createUser({
          email: driverEmail(cpf), password: senha, email_confirm: true,
          user_metadata: { driver_portal: true, full_name: prof.full_name },
        });
        if (error) throw error;
        authId = data.user.id;
      }
      const { error: upErr } = await admin.from("driver_portal_access").upsert(
        { profile_id: prof.id, tenant_id: prof.tenant_id, auth_user_id: authId, cpf, ativo: true },
        { onConflict: "profile_id" },
      );
      if (upErr) throw upErr;
      return json({ ok: true });
    }

    // ---------- Motorista ----------
    const { data: acc } = await admin.from("driver_portal_access").select("*").eq("auth_user_id", user.id).eq("ativo", true).maybeSingle();
    if (!acc) return json({ error: "Acesso ao portal não liberado" }, 403);
    const { data: prof } = await admin.from("profiles").select("id, full_name").eq("id", acc.profile_id).single();

    const loadVehicle = async () => {
      const { data: asg } = await admin.from("vehicle_assignments").select("vehicle_id").eq("tenant_id", acc.tenant_id).eq("driver_profile_id", acc.profile_id).limit(1);
      const vid = asg?.[0]?.vehicle_id;
      if (!vid) return null;
      const { data: v } = await admin.from("vehicles").select("id, plate").eq("id", vid).eq("is_active", true).maybeSingle();
      return v || null;
    };

    if (action === "context") {
      const vehicle = await loadVehicle();
      const { data: recent } = await admin.from("expenses")
        .select("id, descricao, valor_total, data_emissao, veiculo_placa, portal_status, status")
        .eq("reembolso_colaborador_id", acc.profile_id).eq("is_reembolso", true).is("deleted_at", null)
        .not("portal_status", "is", null).order("created_at", { ascending: false }).limit(10);
      return json({ nome: prof?.full_name, naturezas: NATUREZAS, vehicle, recentes: recent || [], empresa: await loadBranding(acc.tenant_id) });
    }

    if (action === "reembolso") {
      const valor = Number(body.valor);
      const data = String(body.data || "");
      const natureza = String(body.natureza || "");
      const obs = String(body.observacao || "").slice(0, 500);
      if (!(valor > 0) || valor > 100000) return json({ error: "Valor inválido" }, 400);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return json({ error: "Data inválida" }, 400);
      if (!NATUREZAS.includes(natureza)) return json({ error: "Natureza inválida" }, 400);
      if (!body.foto_base64) return json({ error: "Envie a foto do comprovante" }, 400);
      const veiculo = await loadVehicle();
      if (!veiculo) return json({ error: "Você não está vinculado a nenhum caminhão. Procure o escritório." }, 400);

      const { data: matriz } = await admin.from("fiscal_establishments").select("id").eq("tenant_id", acc.tenant_id).eq("type", "matriz").limit(1).maybeSingle();
      if (!matriz) return json({ error: "Empresa matriz não configurada" }, 500);

      const bytes = Uint8Array.from(atob(String(body.foto_base64)), (c) => c.charCodeAt(0));
      if (bytes.length > 8 * 1024 * 1024) return json({ error: "Foto muito grande" }, 400);
      const path = `${acc.tenant_id}/${acc.profile_id}/${crypto.randomUUID()}.jpg`;
      const { error: upErr } = await admin.storage.from("driver-portal").upload(path, bytes, { contentType: "image/jpeg" });
      if (upErr) throw upErr;

      const { error } = await admin.from("expenses").insert({
        tenant_id: acc.tenant_id,
        empresa_id: matriz.id,
        descricao: `Reembolso motorista — ${natureza}${obs ? `: ${obs}` : ""}`,
        tipo_despesa: natureza === "Pedágio" ? "pedagio" : "outros",
        centro_custo: "frota_propria",
        valor_total: Math.round(valor * 100) / 100,
        data_emissao: data,
        data_competencia: data,
        data_vencimento: data,
        status: "pendente",
        origem: "manual",
        observacoes: obs || null,
        veiculo_id: veiculo.id,
        veiculo_placa: veiculo.plate,
        motorista_id: acc.profile_id,
        is_reembolso: true,
        reembolso_colaborador_id: acc.profile_id,
        reembolso_colaborador_nome: prof?.full_name,
        portal_status: "em_analise",
        portal_anexo_path: path,
        created_by: user.id,
      });
      if (error) {
        await admin.storage.from("driver-portal").remove([path]);
        throw error;
      }
      return json({ ok: true });
    }

    return json({ error: "Ação inválida" }, 400);
  } catch (e) {
    const msg = (e as Error).message || "Erro";
    if (/weak|easy to guess|pwned/i.test(msg)) return json({ error: "Senha fraca ou muito comum. Escolha outra (evite sequências e datas)." }, 400);
    return json({ error: msg }, 500);
  }
});
