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

    // Check caller roles
    const { data: callerRoles } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id);

    const isAdmin = callerRoles?.some((r: any) => r.role === "admin");
    const isModerator = callerRoles?.some((r: any) => r.role === "moderator");

    if (!isAdmin && !isModerator) {
      throw new Error("Sem permissão para excluir usuários");
    }

    const { userId } = await req.json();
    if (!userId) throw new Error("userId é obrigatório");

    if (userId === caller.id) {
      throw new Error("Você não pode excluir sua própria conta");
    }

    // Check target roles
    const { data: targetRoles } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);

    const targetIsAdmin = targetRoles?.some((r: any) => r.role === "admin");
    const targetIsModerator = targetRoles?.some((r: any) => r.role === "moderator");

    // Admin can't be deleted
    if (targetIsAdmin) {
      throw new Error("Não é possível excluir um administrador");
    }

    // Moderator can only delete "user" (not other moderators)
    if (isModerator && !isAdmin && targetIsModerator) {
      throw new Error("Moderadores não podem excluir outros moderadores");
    }

    // Clean up related data
    await adminClient.from("user_roles").delete().eq("user_id", userId);
    await adminClient.from("profiles").delete().eq("user_id", userId);
    await adminClient.from("driver_documents").delete().eq("user_id", userId);
    await adminClient.from("driver_services").delete().eq("user_id", userId);
    
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId);
    if (deleteError) throw deleteError;

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
