import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

type SmtpConfigInput = {
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  from_email?: string;
  from_name?: string;
  use_tls?: boolean;
  use_stored_password?: boolean;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify user is authenticated
    const userClient = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { to, subject, html, cc, bcc, smtpConfig } = await req.json() as {
      to?: string;
      subject?: string;
      html?: string;
      cc?: string;
      bcc?: string;
      smtpConfig?: SmtpConfigInput;
    };

    if (!to || !subject || !html) {
      return new Response(
        JSON.stringify({ error: "Campos obrigatórios: to, subject, html" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch SMTP settings using service role (bypasses RLS)
    const adminClient = createClient(supabaseUrl, supabaseKey);
    const { data: roleRows, error: roleError } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .in("role", ["admin", "moderator"])
      .limit(1);

    if (roleError || !roleRows?.length) {
      return new Response(JSON.stringify({ error: "Sem permissão para enviar e-mails" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let smtp: {
      host: string;
      port: number;
      username: string;
      password_encrypted: string;
      from_email: string;
      from_name: string;
      use_tls: boolean;
    } | null = null;

    if (smtpConfig) {
      const host = smtpConfig.host?.trim() || "";
      const username = smtpConfig.username?.trim() || "";
      const from_email = smtpConfig.from_email?.trim() || "";
      const from_name = smtpConfig.from_name?.trim() || "";
      const parsedPort = Number(smtpConfig.port);

      if (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
        return new Response(JSON.stringify({ error: "Porta SMTP inválida" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let password = smtpConfig.password?.trim() || "";

      if (!password && smtpConfig.use_stored_password) {
        const { data: existing, error: existingError } = await adminClient
          .from("smtp_settings")
          .select("password_encrypted")
          .limit(1)
          .maybeSingle();

        if (existingError || !existing?.password_encrypted) {
          return new Response(JSON.stringify({ error: "Senha SMTP não encontrada para teste" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        password = existing.password_encrypted;
      }

      if (!host || !username || !from_email || !password) {
        return new Response(JSON.stringify({ error: "Configuração SMTP incompleta para teste" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      smtp = {
        host,
        port: parsedPort,
        username,
        password_encrypted: password,
        from_email,
        from_name,
        use_tls: smtpConfig.use_tls ?? true,
      };
    } else {
      const { data: storedSmtp, error: smtpError } = await adminClient
        .from("smtp_settings")
        .select("*")
        .limit(1)
        .maybeSingle();

      if (smtpError || !storedSmtp) {
        return new Response(
          JSON.stringify({ error: "Configurações SMTP não encontradas. Configure em Configurações > E-mail." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      smtp = storedSmtp;
    }

    const client = new SMTPClient({
      connection: {
        hostname: smtp.host,
        port: smtp.port,
        tls: smtp.use_tls,
        auth: {
          username: smtp.username,
          password: smtp.password_encrypted,
        },
      },
    });

    await client.send({
      from: smtp.from_name
        ? `${smtp.from_name} <${smtp.from_email}>`
        : smtp.from_email,
      to,
      cc: cc || undefined,
      bcc: bcc || undefined,
      subject,
      content: "auto",
      html,
    });

    await client.close();

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("SMTP send error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Erro ao enviar e-mail" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
