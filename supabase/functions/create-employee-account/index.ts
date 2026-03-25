import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Não autorizado");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) throw new Error("Não autorizado");

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: callerRoles } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id);

    const isAdmin = callerRoles?.some((r: any) => r.role === "admin");
    const isModerator = callerRoles?.some((r: any) => r.role === "moderator");
    if (!isAdmin && !isModerator) {
      throw new Error("Sem permissão");
    }

    const { email, full_name, profile_id, password, role } = await req.json();
    if (!email || !full_name) {
      throw new Error("email e full_name são obrigatórios");
    }

    // Determine password
    const finalPassword = password || (() => {
      const firstLetter = full_name.trim().charAt(0).toUpperCase();
      const randomDigits = String(Math.floor(Math.random() * 100000)).padStart(5, "0");
      return firstLetter + randomDigits;
    })();

    if (finalPassword.length < 6) {
      throw new Error("Senha deve ter pelo menos 6 caracteres");
    }

    // Determine role
    let assignRole = role || "moderator";
    const validRoles = ["user", "moderator", "operador"];
    if (!validRoles.includes(assignRole)) assignRole = "moderator";

    // Create auth user
    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password: finalPassword,
      email_confirm: true,
      user_metadata: password ? { must_change_password: true } : {},
    });

    if (createError) {
      if (createError.message?.includes("already been registered")) {
        throw new Error("Este e-mail já possui uma conta no sistema. Verifique se o colaborador já tem acesso.");
      }
      throw createError;
    }

    const authUserId = newUser.user.id;

    // Assign role
    const { error: roleError } = await adminClient.from("user_roles").insert({
      user_id: authUserId,
      role: assignRole,
    });
    if (roleError) throw new Error("Erro ao atribuir papel: " + roleError.message);

    // Link profile if profile_id provided
    if (profile_id) {
      const { error: profileError } = await adminClient
        .from("profiles")
        .update({ user_id: authUserId })
        .eq("id", profile_id);
      if (profileError) throw new Error("Erro ao vincular perfil: " + profileError.message);
    }

    return new Response(
      JSON.stringify({ success: true, auth_user_id: authUserId, generated_password: finalPassword }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
