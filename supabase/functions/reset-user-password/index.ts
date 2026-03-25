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

    // Verify caller is admin
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
    if (!isAdmin) {
      throw new Error("Apenas administradores podem resetar senhas");
    }

    const { target_user_id, full_name, custom_password } = await req.json();
    if (!target_user_id || !full_name) {
      throw new Error("target_user_id e full_name são obrigatórios");
    }

    // Use custom password if provided, otherwise generate: first letter uppercase + 5 random digits
    let newPassword: string;
    if (custom_password && custom_password.length >= 6) {
      newPassword = custom_password;
    } else {
      const firstLetter = full_name.trim().charAt(0).toUpperCase();
      const randomDigits = String(Math.floor(Math.random() * 100000)).padStart(5, "0");
      newPassword = firstLetter + randomDigits;
    }

    // Update user password and set metadata flag
    const { error } = await adminClient.auth.admin.updateUserById(target_user_id, {
      password: newPassword,
      user_metadata: { must_change_password: true },
    });

    if (error) throw error;

    return new Response(
      JSON.stringify({ success: true, new_password: newPassword }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
