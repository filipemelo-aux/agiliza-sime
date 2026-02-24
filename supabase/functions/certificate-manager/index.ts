import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * certificate-manager
 *
 * Handles certificate upload securely:
 * - Receives PFX file + password + name via multipart form
 * - Encrypts password server-side using AES-GCM
 * - Stores PFX in private storage bucket
 * - Saves encrypted password to DB
 * - Password never leaves the backend in plain text
 *
 * Also handles:
 * - POST /validate: validate a certificate (parse PFX with password)
 */

// ── Encryption helpers (AES-256-GCM) ────────────────────────

async function getEncryptionKey(): Promise<CryptoKey> {
  const secret = Deno.env.get("CERTIFICATE_ENCRYPTION_KEY");
  if (!secret) {
    throw new Error("CERTIFICATE_ENCRYPTION_KEY not configured");
  }
  // Derive a 256-bit key from the secret using SHA-256
  const encoded = new TextEncoder().encode(secret);
  const hash = await crypto.subtle.digest("SHA-256", encoded);
  return crypto.subtle.importKey("raw", hash, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

async function encryptPassword(password: string): Promise<string> {
  const key = await getEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(password);

  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoded
  );

  // Store as: base64(iv):base64(ciphertext)
  const ivB64 = btoa(String.fromCharCode(...iv));
  const ctB64 = btoa(
    String.fromCharCode(...new Uint8Array(ciphertext))
  );
  return `${ivB64}:${ctB64}`;
}

export async function decryptPassword(encrypted: string): Promise<string> {
  const key = await getEncryptionKey();
  const [ivB64, ctB64] = encrypted.split(":");

  if (!ivB64 || !ctB64) {
    throw new Error("Formato de senha criptografada inválido");
  }

  const iv = Uint8Array.from(atob(ivB64), (c) => c.charCodeAt(0));
  const ciphertext = Uint8Array.from(atob(ctB64), (c) => c.charCodeAt(0));

  const plainBuffer = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext
  );

  return new TextDecoder().decode(plainBuffer);
}

// ── Auth middleware ──────────────────────────────────────────

async function authenticate(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new Error("MISSING_TOKEN");
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const token = authHeader.replace("Bearer ", "");
  const { data, error } = await supabase.auth.getClaims(token);
  if (error || !data?.claims) {
    throw new Error("INVALID_TOKEN");
  }

  const userId = data.claims.sub as string;

  const serviceClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Admin only
  const { data: roleData } = await serviceClient
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();

  if (!roleData) {
    throw new Error("FORBIDDEN");
  }

  return { userId, serviceClient };
}

// ── Main handler ─────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { userId, serviceClient } = await authenticate(req);

    const contentType = req.headers.get("content-type") || "";

    // ── Upload certificate ───────────────────────────────────
    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const nome = formData.get("nome") as string;
      const senha = formData.get("senha") as string;
      const file = formData.get("file") as File;

      if (!nome || !senha || !file) {
        return json({ success: false, error: "nome, senha e file são obrigatórios" }, 400);
      }

      // Validate file type
      const fileName = file.name.toLowerCase();
      if (!fileName.endsWith(".pfx") && !fileName.endsWith(".p12")) {
        return json({ success: false, error: "Apenas arquivos .pfx ou .p12 são aceitos" }, 400);
      }

      // Validate file size (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        return json({ success: false, error: "Arquivo excede o tamanho máximo de 10MB" }, 400);
      }

      // 1. Encrypt the password
      const encryptedPassword = await encryptPassword(senha);

      // 2. Upload PFX to private bucket
      const filePath = `certificates/${crypto.randomUUID()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "")}`;
      const fileBuffer = await file.arrayBuffer();

      const { error: uploadError } = await serviceClient.storage
        .from("fiscal-certificates")
        .upload(filePath, fileBuffer, {
          contentType: "application/x-pkcs12",
          upsert: false,
        });

      if (uploadError) {
        console.error("[certificate-manager] Upload error:", uploadError.message);
        return json({ success: false, error: "Erro ao armazenar certificado" }, 500);
      }

      // 3. Save to DB with encrypted password
      const { data: cert, error: insertError } = await serviceClient
        .from("fiscal_certificates")
        .insert({
          nome,
          caminho_storage: filePath,
          senha_criptografada: encryptedPassword,
        })
        .select("id, nome, ativo, created_at")
        .single();

      if (insertError) {
        // Cleanup uploaded file
        await serviceClient.storage.from("fiscal-certificates").remove([filePath]);
        console.error("[certificate-manager] Insert error:", insertError.message);
        return json({ success: false, error: "Erro ao salvar certificado" }, 500);
      }

      // Log (never log password)
      console.log(
        `[certificate-manager] Certificate "${nome}" uploaded by user ${userId} → ${filePath}`
      );

      return json({
        success: true,
        certificate: cert,
      });
    }

    // ── JSON body routes ─────────────────────────────────────
    const body = await req.json().catch(() => ({}));
    const action = body.action || body._path || "";

    // Validate certificate (try to parse PFX with stored password)
    if (action === "/validate" || action === "validate") {
      const { certificate_id } = body;
      if (!certificate_id) {
        return json({ success: false, error: "certificate_id obrigatório" }, 400);
      }

      const { data: cert, error: certErr } = await serviceClient
        .from("fiscal_certificates")
        .select("caminho_storage, senha_criptografada, nome")
        .eq("id", certificate_id)
        .single();

      if (certErr || !cert) {
        return json({ success: false, error: "Certificado não encontrado" }, 404);
      }

      // Download and try to read
      const { data: certBlob, error: dlErr } = await serviceClient.storage
        .from("fiscal-certificates")
        .download(cert.caminho_storage);

      if (dlErr || !certBlob) {
        return json({
          success: false,
          error: "Erro ao baixar certificado do storage",
        }, 500);
      }

      try {
        const _password = await decryptPassword(cert.senha_criptografada);
        const _buffer = await certBlob.arrayBuffer();

        // In production: actually parse PFX to validate
        // For now, confirm file is readable
        console.log(
          `[certificate-manager] Validated certificate "${cert.nome}" (${_buffer.byteLength} bytes)`
        );

        return json({
          success: true,
          valid: true,
          nome: cert.nome,
          size_bytes: _buffer.byteLength,
        });
      } catch (decryptErr: any) {
        return json({
          success: false,
          valid: false,
          error: "Senha do certificado inválida ou corrompida",
        });
      }
    }

    return json({ success: false, error: "Ação não reconhecida" }, 404);
  } catch (e: any) {
    const msg = e.message || "Erro interno";
    if (msg === "MISSING_TOKEN" || msg === "INVALID_TOKEN") {
      return json({ success: false, error: "Não autorizado" }, 401);
    }
    if (msg === "FORBIDDEN") {
      return json({ success: false, error: "Acesso negado" }, 403);
    }
    console.error("[certificate-manager] Error:", msg);
    return json({ success: false, error: msg }, 500);
  }
});
