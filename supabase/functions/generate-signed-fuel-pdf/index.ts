// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";
import {
  securityMiddleware,
  secureJson,
  secureError,
  corsHeaders,
} from "../_shared/security.ts";

/**
 * Gera PDF de Ordem de Abastecimento assinado digitalmente com certificado A1.
 *
 * Fluxo:
 * 1. Busca dados da ordem e do estabelecimento
 * 2. Busca certificado PFX + descriptografa senha
 * 3. Envia ao microserviço Python para gerar PDF + assinar
 * 4. Armazena PDF assinado no storage
 * 5. Retorna URL de download
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

// ── Fetch certificate ───────────────────────────────────────────

async function fetchCertificate(supabase: any, establishmentId: string) {
  let certPath: string | null = null;
  let encryptedPassword: string | null = null;

  // Via establishment_certificates
  const { data: link } = await supabase
    .from("establishment_certificates")
    .select("certificate_id")
    .eq("establishment_id", establishmentId)
    .limit(1)
    .maybeSingle();

  if (link?.certificate_id) {
    const { data: cert } = await supabase
      .from("fiscal_certificates")
      .select("caminho_storage, senha_criptografada, nome")
      .eq("id", link.certificate_id)
      .eq("ativo", true)
      .single();

    if (cert) {
      certPath = cert.caminho_storage;
      encryptedPassword = cert.senha_criptografada;
      console.log(`[pdf-sign] Certificado: "${cert.nome}"`);
    }
  }

  // Fallback: fiscal_settings
  if (!certPath) {
    const { data: settings } = await supabase
      .from("fiscal_settings")
      .select("certificado_a1_path, senha_certificado_encrypted")
      .limit(1)
      .maybeSingle();

    if (settings?.certificado_a1_path) {
      certPath = settings.certificado_a1_path;
      encryptedPassword = settings.senha_certificado_encrypted;
    }
  }

  if (!certPath || !encryptedPassword) {
    throw new Error("Certificado A1 não encontrado. Vincule um certificado ao estabelecimento.");
  }

  // Download PFX
  const { data: certBlob, error: dlErr } = await supabase.storage
    .from("fiscal-certificates")
    .download(certPath);

  if (dlErr || !certBlob) throw new Error("Erro ao baixar certificado A1");

  const pfxBuffer = await certBlob.arrayBuffer();
  const pfxBase64 = base64Encode(new Uint8Array(pfxBuffer));

  let password: string;
  try {
    password = await decryptPassword(encryptedPassword);
  } catch {
    throw new Error("Erro ao descriptografar senha do certificado");
  }

  return { pfxBase64, password };
}

// ── Handler ─────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const security = await securityMiddleware(req, "generate-signed-fuel-pdf", {
    maxBodySize: 50_000,
  });

  if (!security.ok) return security.response!;

  try {
    const body = security.body! as Record<string, any>;
    const { order_id } = body;

    if (!order_id) {
      return secureError("order_id é obrigatório", 400);
    }

    const supabase = security.client!;

    // 1. Buscar ordem
    const { data: order, error: orderErr } = await supabase
      .from("fuel_orders")
      .select("*")
      .eq("id", order_id)
      .single();

    if (orderErr || !order) {
      return secureError("Ordem não encontrada", 404);
    }

    // 2. Buscar estabelecimento
    const { data: est } = await supabase
      .from("fiscal_establishments")
      .select("id, razao_social, cnpj, nome_fantasia, type")
      .eq("id", order.establishment_id)
      .single();

    if (!est) {
      return secureError("Estabelecimento não encontrado", 404);
    }

    // 3. Buscar certificado
    const cert = await fetchCertificate(supabase, order.establishment_id);

    // 4. Montar dados da ordem para o microserviço
    const createdAt = new Date(order.created_at);
    const orderData = {
      order_number: order.order_number,
      razao_social: est.razao_social,
      cnpj: est.cnpj,
      establishment_type: est.type,
      requester_name: order.requester_name,
      supplier_name: order.supplier_name,
      vehicle_plate: order.vehicle_plate,
      fuel_type: order.fuel_type,
      fill_mode: order.fill_mode,
      liters: order.liters,
      notes: order.notes || "",
      status: order.status,
      created_at: `${String(createdAt.getDate()).padStart(2, "0")}/${String(createdAt.getMonth() + 1).padStart(2, "0")}/${createdAt.getFullYear()} ${String(createdAt.getHours()).padStart(2, "0")}:${String(createdAt.getMinutes()).padStart(2, "0")}`,
    };

    // 5. Chamar microserviço Python
    const signerUrl = Deno.env.get("XML_SIGNER_URL");
    if (!signerUrl) {
      return secureError("Microserviço de assinatura não configurado (XML_SIGNER_URL)", 500);
    }

    // Extrair base do domínio (remover qualquer path como /cte/emit/sign)
    const urlObj = new URL(signerUrl);
    const pdfUrl = `${urlObj.origin}/pdf/fuel-order`;
    const signerApiKey = Deno.env.get("XML_SIGNER_API_KEY") || "";

    console.log(`[pdf-sign] Chamando ${pdfUrl} para ordem #${order.order_number}`);

    const response = await fetch(pdfUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(signerApiKey ? { "X-API-Key": signerApiKey } : {}),
      },
      body: JSON.stringify({
        order_data: orderData,
        pfx_base64: cert.pfxBase64,
        password: cert.password,
      }),
    });

    // Limpar dados sensíveis
    cert.password = "";
    cert.pfxBase64 = "";

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[pdf-sign] Microserviço retornou ${response.status}: ${errorText}`);
      return secureError(`Erro ao gerar PDF assinado: ${errorText}`, 500);
    }

    const result = await response.json();
    if (!result.success || !result.pdf_base64) {
      return secureError(result.error || "Resposta inválida do microserviço", 500);
    }

    // 6. Armazenar PDF no storage
    const pdfBytes = Uint8Array.from(atob(result.pdf_base64), (c) => c.charCodeAt(0));
    const storagePath = `ordem-${order.order_number}-assinada.pdf`;

    const { error: uploadErr } = await supabase.storage
      .from("fuel-order-pdfs")
      .upload(storagePath, pdfBytes, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (uploadErr) {
      console.error(`[pdf-sign] Upload error: ${uploadErr.message}`);
      // Retornar o PDF diretamente se o upload falhar
      return new Response(
        JSON.stringify({
          success: true,
          pdf_base64: result.pdf_base64,
          storage_error: uploadErr.message,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 7. Gerar URL temporária de download (1 hora)
    const { data: signedUrl } = await supabase.storage
      .from("fuel-order-pdfs")
      .createSignedUrl(storagePath, 3600);

    console.log(`[pdf-sign] ✓ Ordem #${order.order_number} assinada e armazenada`);

    return secureJson({
      success: true,
      pdf_url: signedUrl?.signedUrl || null,
      pdf_base64: result.pdf_base64,
      storage_path: storagePath,
    });
  } catch (error: any) {
    console.error("[pdf-sign] Error:", error.message);
    return secureError(error.message);
  }
});
