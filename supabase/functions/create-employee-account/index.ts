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
    const isModerator = callerRoles?.some((r: any) => r.role === "moderator");
    if (!isAdmin && !isModerator) {
      throw new Error("Sem permissão");
    }

    const { email, full_name, profile_id } = await req.json();
    if (!email || !full_name) {
      throw new Error("email e full_name são obrigatórios");
    }

    // Generate password: first letter uppercase + 5 random digits
    const firstLetter = full_name.trim().charAt(0).toUpperCase();
    const randomDigits = String(Math.floor(Math.random() * 100000)).padStart(5, "0");
    const newPassword = firstLetter + randomDigits;

    // Create auth user
    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password: newPassword,
      email_confirm: true,
      user_metadata: { must_change_password: true },
    });

    if (createError) throw createError;

    const authUserId = newUser.user.id;

    // Assign 'user' role
    await adminClient.from("user_roles").insert({
      user_id: authUserId,
      role: "user",
    });

    // Update profile to link auth user_id if profile_id provided
    if (profile_id) {
      await adminClient.from("profiles").update({ user_id: authUserId }).eq("id", profile_id);
    }

    return new Response(
      JSON.stringify({ success: true, auth_user_id: authUserId, generated_password: newPassword }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
