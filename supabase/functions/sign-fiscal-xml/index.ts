// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import {
  securityMiddleware,
  secureJson,
  secureError,
  corsHeaders,
  sanitizeXml,
  logSecurityEvent,
  VALIDATION_SCHEMAS,
} from "../_shared/security.ts";

/**
 * Assinatura Digital de Documentos Fiscais (CT-e / MDF-e)
 *
 * Security:
 * - Rate limiting (DB-backed)
 * - Payload validation (schema)
 * - XML XXE protection
 * - Certificate password never logged
 * - Security headers (Helmet)
 */

// ── Decryption (matches certificate-manager encryption) ──────

async function getEncryptionKey(): Promise<CryptoKey> {
  const secret = Deno.env.get("CERTIFICATE_ENCRYPTION_KEY");
  if (!secret) {
    throw new Error("CERTIFICATE_ENCRYPTION_KEY not configured");
  }
  const encoded = new TextEncoder().encode(secret);
  const hash = await crypto.subtle.digest("SHA-256", encoded);
  return crypto.subtle.importKey("raw", hash, { name: "AES-GCM" }, false, [
    "decrypt",
  ]);
}

async function decryptPassword(encrypted: string): Promise<string> {
  const key = await getEncryptionKey();
  const [ivB64, ctB64] = encrypted.split(":");

  if (!ivB64 || !ctB64) {
    throw new Error("Invalid encrypted password format");
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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Security middleware: rate limit + payload validation
  const security = await securityMiddleware(req, "sign-fiscal-xml", {
    validateSchema: VALIDATION_SCHEMAS.sign_xml,
    maxBodySize: 600_000,
  });

  if (!security.ok) return security.response!;

  try {
    const body = security.body!;
    const { xml, document_type, document_id, establishment_id } = body as Record<string, any>;

    // Sanitize XML (XXE protection)
    let cleanXml: string;
    try {
      cleanXml = sanitizeXml(xml);
    } catch (e: any) {
      await logSecurityEvent(security.client, {
        event_type: "xxe_blocked",
        source_ip: security.clientIp,
        function_name: "sign-fiscal-xml",
        details: { document_type, document_id, error: e.message },
      });
      return secureError(e.message, 400);
    }

    const supabaseClient = security.client;

    // ── Buscar certificado ──────────────────────────────────────
    let certPath: string | null = null;
    let encryptedPassword: string | null = null;
    let certCnpj = "";

    if (establishment_id) {
      const { data: link } = await supabaseClient
        .from("establishment_certificates")
        .select("certificate_id")
        .eq("establishment_id", establishment_id)
        .limit(1)
        .maybeSingle();

      if (link?.certificate_id) {
        const { data: cert } = await supabaseClient
          .from("fiscal_certificates")
          .select("caminho_storage, senha_criptografada, nome")
          .eq("id", link.certificate_id)
          .eq("ativo", true)
          .single();

        if (cert) {
          certPath = cert.caminho_storage;
          encryptedPassword = cert.senha_criptografada;
          console.log(`[sign-fiscal-xml] Using certificate: "${cert.nome}"`);
        }
      }

      const { data: est } = await supabaseClient
        .from("fiscal_establishments")
        .select("cnpj")
        .eq("id", establishment_id)
        .single();

      if (est) certCnpj = est.cnpj;
    }

    // Fallback: fiscal_settings
    if (!certPath) {
      const { data: settings } = await supabaseClient
        .from("fiscal_settings")
        .select("certificado_a1_path, senha_certificado_encrypted, cnpj")
        .limit(1)
        .maybeSingle();

      if (settings?.certificado_a1_path) {
        certPath = settings.certificado_a1_path;
        encryptedPassword = settings.senha_certificado_encrypted;
        if (!certCnpj) certCnpj = settings.cnpj;
      }
    }

    if (!certPath || !encryptedPassword) {
      throw new Error(
        "Certificado A1 não encontrado. Vincule um certificado ao estabelecimento."
      );
    }

    // ── Baixar PFX do Storage ───────────────────────────────────
    const { data: certBlob, error: downloadError } = await supabaseClient.storage
      .from("fiscal-certificates")
      .download(certPath);

    if (downloadError || !certBlob) {
      throw new Error("Erro ao baixar certificado A1 do storage");
    }

    const pfxBuffer = await certBlob.arrayBuffer();

    // ── Decrypt password in memory ──────────────────────────────
    let certPassword: string;
    try {
      certPassword = await decryptPassword(encryptedPassword);
    } catch {
      throw new Error("Erro ao descriptografar senha do certificado");
    }

    console.log(
      `[sign-fiscal-xml] Signing ${document_type} ${document_id} | CNPJ: ${certCnpj} | PFX size: ${pfxBuffer.byteLength} bytes`
    );

    // ── Signature placeholder ───────────────────────────────────
    const timestampHash = Date.now().toString(36);

    const signaturePlaceholder = `
    <Signature xmlns="http://www.w3.org/2000/09/xmldsig#">
      <SignedInfo>
        <CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>
        <SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"/>
        <Reference URI="#${document_id}">
          <Transforms>
            <Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/>
            <Transform Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>
          </Transforms>
          <DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>
          <DigestValue>SIM_DIGEST_${timestampHash}</DigestValue>
        </Reference>
      </SignedInfo>
      <SignatureValue>SIM_SIG_${timestampHash}</SignatureValue>
      <KeyInfo>
        <X509Data>
          <X509Certificate>SIM_CERT_${certCnpj}</X509Certificate>
        </X509Data>
      </KeyInfo>
    </Signature>`;

    let signedXml = cleanXml;
    if (document_type === "cte") {
      signedXml = cleanXml.replace("</CTe>", `${signaturePlaceholder}</CTe>`);
    } else if (document_type === "mdfe") {
      signedXml = cleanXml.replace("</MDFe>", `${signaturePlaceholder}</MDFe>`);
    }

    // Clear password from memory
    certPassword = "";

    return secureJson({
      signed_xml: signedXml,
      digest_value: `SIM_DIGEST_${timestampHash}`,
      signature_value: `SIM_SIG_${timestampHash}`,
    });
  } catch (error: any) {
    console.error("[sign-fiscal-xml] Error:", error.message);
    return secureError(error.message);
  }
});
