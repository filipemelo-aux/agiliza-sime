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
 * SEFAZ Proxy — Delega operações fiscais ao microserviço Docker
 *
 * Responsabilidades:
 * - Autenticação e rate limiting
 * - Buscar certificado PFX do storage + descriptografar senha
 * - Determinar ambiente/UF do estabelecimento
 * - Chamar o microserviço Docker (que faz assinatura + SOAP/mTLS)
 * - Retornar resultado estruturado
 *
 * O microserviço Docker é responsável por:
 * - Assinatura XMLDSig real
 * - Montagem envelope SOAP
 * - Comunicação mTLS com SEFAZ
 * - Parsing da resposta XML
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
  if (!ivB64 || !ctB64) {
    // Fallback: password may be stored in plain text (legacy)
    console.warn("[SEFAZ Proxy] Password not encrypted, using as plain text. Please re-encrypt.");
    return encrypted;
  }
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
      }
    }

    const { data: est } = await supabaseClient
      .from("fiscal_establishments")
      .select("cnpj")
      .eq("id", establishmentId)
      .single();
    if (est) certCnpj = est.cnpj;
  }

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

  const { data: certBlob, error: downloadError } = await supabaseClient.storage
    .from("fiscal-certificates")
    .download(certPath);

  if (downloadError || !certBlob) {
    throw new Error("Erro ao baixar certificado A1 do storage");
  }

  const pfxBuffer = await certBlob.arrayBuffer();
  const pfxBase64 = base64Encode(new Uint8Array(pfxBuffer));

  let password: string;
  try {
    password = await decryptPassword(encryptedPassword);
  } catch (decryptErr: any) {
    console.error("[SEFAZ Proxy] Falha ao descriptografar senha:", {
      error: decryptErr.message,
      certPath,
      encryptedPasswordLength: encryptedPassword?.length,
      encryptedPasswordPreview: encryptedPassword?.substring(0, 20) + "...",
      hasColon: encryptedPassword?.includes(":"),
    });
    throw new Error(`Erro ao descriptografar senha do certificado: ${decryptErr.message}`);
  }

  return { pfxBase64, password, cnpj: certCnpj };
}

// ── Chamar microserviço Docker ──────────────────────────────────

async function callFiscalService(
  endpoint: string,
  body: Record<string, unknown>
): Promise<any> {
  const baseUrl = Deno.env.get("XML_SIGNER_URL");
  if (!baseUrl) throw new Error("XML_SIGNER_URL not configured");

  // XML_SIGNER_URL pode ser https://sime.fsm.app.br/sign — extrair base
  const url = new URL(endpoint, baseUrl.replace(/\/sign$/, "/"));
  const apiKey = Deno.env.get("XML_SIGNER_API_KEY") || "";

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { "X-API-Key": apiKey } : {}),
    },
    body: JSON.stringify(body),
  });

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    const text = await response.text();
    console.error(`[SEFAZ Proxy] Microserviço retornou content-type inesperado: ${contentType}. Status: ${response.status}. Body preview: ${text.substring(0, 200)}`);
    throw new Error(`Microserviço fiscal indisponível (HTTP ${response.status}). Verifique se o servidor Docker está online.`);
  }

  const result = await response.json();

  if (!response.ok && !result.success) {
    throw new Error(result.error || `Microserviço retornou HTTP ${response.status}`);
  }

  return result;
}

// ── Action → Docker endpoint mapping ────────────────────────────

interface ActionConfig {
  dockerEndpoint: string;
  requiresXml: boolean;
  requiresChave: boolean;
  requiresProtocolo: boolean;
  requiresJustificativa: boolean;
}

const ACTION_MAP: Record<string, ActionConfig> = {
  autorizar_cte: {
    dockerEndpoint: "/cte/emit",
    requiresXml: true,
    requiresChave: false,
    requiresProtocolo: false,
    requiresJustificativa: false,
  },
  consultar_cte: {
    dockerEndpoint: "/cte/consult",
    requiresXml: false,
    requiresChave: true,
    requiresProtocolo: false,
    requiresJustificativa: false,
  },
  cancelar_cte: {
    dockerEndpoint: "/cte/cancel",
    requiresXml: false,
    requiresChave: true,
    requiresProtocolo: true,
    requiresJustificativa: true,
  },
  cce_cte: {
    dockerEndpoint: "/cte/cce",
    requiresXml: false,
    requiresChave: true,
    requiresProtocolo: false,
    requiresJustificativa: false,
  },
  autorizar_mdfe: {
    dockerEndpoint: "/mdfe/emit",
    requiresXml: true,
    requiresChave: false,
    requiresProtocolo: false,
    requiresJustificativa: false,
  },
  consultar_mdfe: {
    dockerEndpoint: "/mdfe/consult",
    requiresXml: false,
    requiresChave: true,
    requiresProtocolo: false,
    requiresJustificativa: false,
  },
  cancelar_mdfe: {
    dockerEndpoint: "/mdfe/cancel",
    requiresXml: false,
    requiresChave: true,
    requiresProtocolo: true,
    requiresJustificativa: true,
  },
  encerrar_mdfe: {
    dockerEndpoint: "/mdfe/close",
    requiresXml: false,
    requiresChave: true,
    requiresProtocolo: true,
    requiresJustificativa: false,
  },
};

// ── Handler principal ───────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const security = await securityMiddleware(req, "sefaz-proxy", {
    validateSchema: VALIDATION_SCHEMAS.sefaz_proxy,
    maxBodySize: 600_000,
  });

  if (!security.ok) return security.response!;

  try {
    const body = security.body!;
    const {
      action,
      signed_xml,
      chave_acesso,
      protocolo,
      justificativa,
      document_id,
      establishment_id,
      correcoes,
      codigo_municipio,
    } = body as Record<string, any>;

    if (!action) throw new Error("Parâmetro 'action' é obrigatório");

    const config = ACTION_MAP[action];
    if (!config) {
      await logSecurityEvent(security.client, {
        event_type: "invalid_action",
        source_ip: security.clientIp,
        function_name: "sefaz-proxy",
        details: { action },
      });
      throw new Error(`Ação '${action}' não suportada`);
    }

    // Sanitize XML if present
    let cleanXml = signed_xml;
    if (signed_xml && typeof signed_xml === "string") {
      try {
        cleanXml = sanitizeXml(signed_xml);
      } catch (e: any) {
        await logSecurityEvent(security.client, {
          event_type: "xxe_blocked",
          source_ip: security.clientIp,
          function_name: "sefaz-proxy",
          details: { action, error: e.message },
        });
        return secureError(e.message, 400);
      }
    }

    const supabaseClient = security.client;

    // ── Determinar ambiente e UF ────────────────────────────
    let ambiente = "homologacao";
    let uf = "SP";

    if (establishment_id) {
      const { data: est } = await supabaseClient
        .from("fiscal_establishments")
        .select("ambiente, endereco_uf, cnpj")
        .eq("id", establishment_id)
        .single();

      if (est) {
        ambiente = est.ambiente || "homologacao";
        uf = est.endereco_uf || "SP";
      }
    } else {
      const { data: settings } = await supabaseClient
        .from("fiscal_settings")
        .select("ambiente, uf_emissao")
        .limit(1)
        .maybeSingle();
      if (settings) {
        ambiente = settings.ambiente;
        uf = settings.uf_emissao;
      }
    }

    // ── Buscar certificado ──────────────────────────────────
    const cert = await fetchCertificate(supabaseClient, establishment_id);

    console.log(
      `[SEFAZ Proxy] Action: ${action} | Ambiente: ${ambiente} | UF: ${uf} | CNPJ: ${cert.cnpj}`
    );

    // ── Montar payload para o microserviço Docker ───────────
    const dockerPayload: Record<string, any> = {
      pfx_base64: cert.pfxBase64,
      password: cert.password,
      uf,
      ambiente,
    };

    if (config.requiresXml) {
      dockerPayload.xml = cleanXml;
      dockerPayload.document_id = document_id;
    }
    if (config.requiresChave) {
      dockerPayload.chave_acesso = chave_acesso;
    }
    if (config.requiresProtocolo) {
      dockerPayload.protocolo = protocolo;
    }
    if (config.requiresJustificativa) {
      dockerPayload.justificativa = justificativa;
    }
    if (action === "cce_cte") {
      dockerPayload.correcoes = correcoes;
    }
    if (action === "encerrar_mdfe") {
      dockerPayload.codigo_municipio = codigo_municipio;
    }
    dockerPayload.cnpj = cert.cnpj;

    // ── Chamar microserviço ─────────────────────────────────
    const result = await callFiscalService(config.dockerEndpoint, dockerPayload);

    // Limpar dados sensíveis
    cert.password = "";
    cert.pfxBase64 = "";

    // Normalizar resposta
    const response: Record<string, any> = {
      success: result.success ?? false,
      status: result.success ? (result.cStat === "135" ? "cancelado" : "autorizado") : "rejeitado",
      cStat: result.cStat || "",
      xMotivo: result.xMotivo || "",
      chave_acesso: result.chave_acesso || chave_acesso || "",
      protocolo: result.protocolo || "",
      data_autorizacao: result.data_autorizacao || "",
      xml_autorizado: result.xml_autorizado || "",
      signed_xml: result.signed_xml || "",
      motivo_rejeicao: result.motivo_rejeicao || "",
      sefaz_url: result.sefaz_url || "",
      ambiente,
      tpAmb: ambiente === "producao" ? "1" : "2",
      cUF: result.cUF || "",
    };

    return secureJson(response);
  } catch (error: any) {
    console.error("[SEFAZ Proxy Error]", error.message);
    return secureError(error.message);
  }
});
