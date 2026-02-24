// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";
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
 * Fluxo:
 * 1. Busca certificado PFX do storage + descriptografa senha
 * 2. Envia XML + PFX (base64) + senha ao microserviço de assinatura
 * 3. Retorna XML assinado com XMLDSig real
 *
 * Se XML_SIGNER_URL não estiver configurado, usa placeholder (dev/homologação)
 */

// ── Decryption ──────────────────────────────────────────────────

async function getEncryptionKey(): Promise<CryptoKey> {
  const secret = Deno.env.get("CERTIFICATE_ENCRYPTION_KEY");
  if (!secret) throw new Error("CERTIFICATE_ENCRYPTION_KEY not configured");
  const encoded = new TextEncoder().encode(secret);
  const hash = await crypto.subtle.digest("SHA-256", encoded);
  return crypto.subtle.importKey("raw", hash, { name: "AES-GCM" }, false, ["decrypt"]);
}

async function decryptPassword(encrypted: string): Promise<string> {
  const key = await getEncryptionKey();
  const [ivB64, ctB64] = encrypted.split(":");
  if (!ivB64 || !ctB64) throw new Error("Invalid encrypted password format");

  const iv = Uint8Array.from(atob(ivB64), (c) => c.charCodeAt(0));
  const ciphertext = Uint8Array.from(atob(ctB64), (c) => c.charCodeAt(0));
  const plainBuffer = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return new TextDecoder().decode(plainBuffer);
}

// ── Buscar certificado ──────────────────────────────────────────

interface CertificateInfo {
  pfxBase64: string;
  password: string;
  cnpj: string;
}

async function fetchCertificate(
  supabaseClient: any,
  establishmentId?: string
): Promise<CertificateInfo> {
  let certPath: string | null = null;
  let encryptedPassword: string | null = null;
  let certCnpj = "";

  // Tentar via establishment_certificates
  if (establishmentId) {
    const { data: link } = await supabaseClient
      .from("establishment_certificates")
      .select("certificate_id")
      .eq("establishment_id", establishmentId)
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
        console.log(`[sign] Using certificate: "${cert.nome}"`);
      }
    }

    const { data: est } = await supabaseClient
      .from("fiscal_establishments")
      .select("cnpj")
      .eq("id", establishmentId)
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
    throw new Error("Certificado A1 não encontrado. Vincule um certificado ao estabelecimento.");
  }

  // Download PFX
  const { data: certBlob, error: downloadError } = await supabaseClient.storage
    .from("fiscal-certificates")
    .download(certPath);

  if (downloadError || !certBlob) {
    throw new Error("Erro ao baixar certificado A1 do storage");
  }

  const pfxBuffer = await certBlob.arrayBuffer();
  const pfxBase64 = base64Encode(new Uint8Array(pfxBuffer));

  // Decrypt password
  let password: string;
  try {
    password = await decryptPassword(encryptedPassword);
  } catch {
    throw new Error("Erro ao descriptografar senha do certificado");
  }

  return { pfxBase64, password, cnpj: certCnpj };
}

// ── Assinar via microserviço externo ────────────────────────────

interface SignResult {
  signed_xml: string;
  digest_value: string;
  signature_value: string;
}

async function signViaExternalService(
  xml: string,
  pfxBase64: string,
  password: string,
  documentType: string,
  documentId: string
): Promise<SignResult> {
  const signerUrl = Deno.env.get("XML_SIGNER_URL");
  if (!signerUrl) {
    throw new Error("XML_SIGNER_URL_NOT_SET");
  }

  const signerApiKey = Deno.env.get("XML_SIGNER_API_KEY") || "";

  const response = await fetch(signerUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(signerApiKey ? { "X-API-Key": signerApiKey } : {}),
    },
    body: JSON.stringify({
      xml,
      pfx_base64: pfxBase64,
      password,
      document_type: documentType,
      document_id: documentId,
    }),
  });

  // Limpar senha da memória
  password = "";

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Microserviço de assinatura retornou ${response.status}: ${errorText}`);
  }

  const result = await response.json();

  if (!result.signed_xml) {
    throw new Error("Resposta inválida do microserviço de assinatura");
  }

  return {
    signed_xml: result.signed_xml,
    digest_value: result.digest_value || "",
    signature_value: result.signature_value || "",
  };
}

// ── Placeholder (dev/homologação) ───────────────────────────────

function signPlaceholder(
  cleanXml: string,
  documentType: string,
  documentId: string,
  certCnpj: string
): SignResult {
  const timestampHash = Date.now().toString(36);

  const signaturePlaceholder = `
    <Signature xmlns="http://www.w3.org/2000/09/xmldsig#">
      <SignedInfo>
        <CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>
        <SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"/>
        <Reference URI="#${documentId}">
          <Transforms>
            <Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/>
            <Transform Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>
          </Transforms>
          <DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>
          <DigestValue>PLACEHOLDER_DIGEST_${timestampHash}</DigestValue>
        </Reference>
      </SignedInfo>
      <SignatureValue>PLACEHOLDER_SIG_${timestampHash}</SignatureValue>
      <KeyInfo>
        <X509Data>
          <X509Certificate>PLACEHOLDER_CERT_${certCnpj}</X509Certificate>
        </X509Data>
      </KeyInfo>
    </Signature>`;

  let signedXml = cleanXml;
  if (documentType === "cte") {
    signedXml = cleanXml.replace("</CTe>", `${signaturePlaceholder}</CTe>`);
  } else if (documentType === "mdfe") {
    signedXml = cleanXml.replace("</MDFe>", `${signaturePlaceholder}</MDFe>`);
  }

  return {
    signed_xml: signedXml,
    digest_value: `PLACEHOLDER_DIGEST_${timestampHash}`,
    signature_value: `PLACEHOLDER_SIG_${timestampHash}`,
  };
}

// ── Handler principal ───────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

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

    // Buscar certificado
    const cert = await fetchCertificate(security.client, establishment_id);

    console.log(
      `[sign] ${document_type} ${document_id} | CNPJ: ${cert.cnpj} | PFX: ${Math.round(cert.pfxBase64.length * 0.75 / 1024)}KB`
    );

    // Tentar microserviço externo, fallback para placeholder
    let result: SignResult;
    try {
      result = await signViaExternalService(
        cleanXml,
        cert.pfxBase64,
        cert.password,
        document_type,
        document_id
      );
      console.log(`[sign] ✓ Assinatura real via microserviço`);
    } catch (err: any) {
      if (err.message === "XML_SIGNER_URL_NOT_SET") {
        console.warn(`[sign] ⚠ XML_SIGNER_URL não configurado — usando placeholder`);
        result = signPlaceholder(cleanXml, document_type, document_id, cert.cnpj);
      } else {
        throw err;
      }
    }

    // Limpar dados sensíveis
    cert.password = "";
    cert.pfxBase64 = "";

    return secureJson(result);
  } catch (error: any) {
    console.error("[sign] Error:", error.message);
    return secureError(error.message);
  }
});
