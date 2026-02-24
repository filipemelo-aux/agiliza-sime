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
import { getSefazUrl, getTpAmb, UF_CODIGO_IBGE, getDefaultSvcMode, isSefazOfflineError, type SefazAmbiente, type ContingencyMode } from "./sefazEndpoints.ts";

/**
 * Proxy de Comunicação com SEFAZ (Webservices SOAP)
 * 
 * Security:
 * - Rate limiting (DB-backed)
 * - Payload validation & sanitization
 * - Security headers (Helmet)
 * - XML XXE protection
 * - Audit logging
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Security middleware: rate limit + payload validation
  const security = await securityMiddleware(req, "sefaz-proxy", {
    validateSchema: VALIDATION_SCHEMAS.sefaz_proxy,
    maxBodySize: 600_000, // 600KB max (XML can be large)
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
      contingency_mode: requestedContingency,
    } = body as Record<string, any>;

    if (!action) {
      throw new Error("Parâmetro 'action' é obrigatório");
    }

    // Validate action is in allowed list
    const allowedActions = [
      "autorizar_cte", "consultar_cte", "cancelar_cte", "status_cte",
      "autorizar_mdfe", "consultar_mdfe", "cancelar_mdfe", "encerrar_mdfe",
      "status_mdfe", "distribuicao_mdfe",
    ];
    if (!allowedActions.includes(action)) {
      await logSecurityEvent(security.client, {
        event_type: "invalid_action",
        source_ip: security.clientIp,
        function_name: "sefaz-proxy",
        details: { action },
      });
      throw new Error(`Ação '${action}' não suportada`);
    }

    // Sanitize XML if present (XXE protection)
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

    // ── Determinar ambiente e UF do estabelecimento ─────────────
    let ambiente: SefazAmbiente = "homologacao";
    let uf = "SP";
    let contingencyMode: ContingencyMode = requestedContingency || "normal";

    if (establishment_id) {
      const { data: est } = await supabaseClient
        .from("fiscal_establishments")
        .select("ambiente, endereco_uf, cnpj, contingency_mode")
        .eq("id", establishment_id)
        .single();

      if (est) {
        ambiente = (est.ambiente as SefazAmbiente) || "homologacao";
        uf = est.endereco_uf || "SP";
        if (!requestedContingency && est.contingency_mode && est.contingency_mode !== "normal") {
          contingencyMode = est.contingency_mode as ContingencyMode;
        }
        console.log(
          `[SEFAZ] Establishment ${establishment_id} | CNPJ: ${est.cnpj} | Ambiente: ${ambiente} | UF: ${uf} | Contingência: ${contingencyMode}`
        );
      }
    } else {
      const { data: settings } = await supabaseClient
        .from("fiscal_settings")
        .select("ambiente, uf_emissao")
        .limit(1)
        .maybeSingle();

      if (settings) {
        ambiente = settings.ambiente as SefazAmbiente;
        uf = settings.uf_emissao;
      }
    }

    // ── Resolve SEFAZ endpoint ──────────────────────────────────
    const sefazUrl = getSefazUrl(uf, ambiente, action, contingencyMode);
    const tpAmb = getTpAmb(ambiente);
    const cUF = UF_CODIGO_IBGE[uf.toUpperCase()] || "35";

    console.log(
      `[SEFAZ Proxy] Ação: ${action} | Ambiente: ${ambiente} (tpAmb=${tpAmb}) | UF: ${uf} (cUF=${cUF}) | Contingência: ${contingencyMode} | URL: ${sefazUrl}`
    );

    // Simular delay de rede
    await new Promise((resolve) => setTimeout(resolve, 800 + Math.random() * 1200));

    let responseData: any = { success: false, status: "erro_simulado" };

    const mockChave =
      chave_acesso ||
      `${cUF}${new Date().getFullYear()}${String(Math.random()).slice(2, 36).padEnd(34, "0")}`;
    const mockProtocolo = protocolo || `${cUF.slice(0,1)}35${Date.now()}`;
    const docLabel = action.includes("cte") ? "CT-e" : "MDF-e";

    switch (action) {
      case "autorizar_cte":
      case "autorizar_mdfe":
        if (Math.random() > 0.1) {
          responseData = {
            success: true,
            status: "autorizado",
            cStat: "100",
            xMotivo: `Autorizado o uso do ${docLabel}`,
            chave_acesso: mockChave,
            protocolo: mockProtocolo,
            data_autorizacao: new Date().toISOString(),
            xml_autorizado: cleanXml,
            sefaz_url: sefazUrl,
            ambiente,
            tpAmb,
            cUF,
          };
        } else {
          responseData = {
            success: false,
            status: "rejeitado",
            cStat: "999",
            xMotivo: "Erro simulado na SEFAZ (ambiente de testes)",
            motivo_rejeicao: "Rejeição 999: Erro simulado na SEFAZ (ambiente de testes)",
            sefaz_url: sefazUrl,
            ambiente,
            tpAmb,
            cUF,
          };
        }
        break;

      case "consultar_cte":
      case "consultar_mdfe":
        responseData = {
          success: true,
          status: "autorizado",
          cStat: "100",
          xMotivo: `${docLabel} localizado`,
          chave_acesso: mockChave,
          protocolo: mockProtocolo,
          data_autorizacao: new Date().toISOString(),
          sefaz_url: sefazUrl,
          ambiente,
        };
        break;

      case "cancelar_cte":
      case "cancelar_mdfe":
        responseData = {
          success: true,
          status: "cancelado",
          cStat: "135",
          xMotivo: `Evento registrado e vinculado a ${docLabel}`,
          protocolo: `${cUF.slice(0,1)}35${Date.now()}`,
          data_autorizacao: new Date().toISOString(),
          sefaz_url: sefazUrl,
          ambiente,
        };
        break;

      case "encerrar_mdfe":
        responseData = {
          success: true,
          status: "encerrado",
          cStat: "135",
          xMotivo: "Evento registrado e vinculado a MDF-e",
          protocolo: `${cUF.slice(0,1)}35${Date.now()}`,
          data_autorizacao: new Date().toISOString(),
          sefaz_url: sefazUrl,
          ambiente,
        };
        break;

      default:
        throw new Error(`Ação '${action}' não suportada`);
    }

    responseData.contingency_mode = contingencyMode;

    return secureJson(responseData);
  } catch (error: any) {
    console.error("[SEFAZ Proxy Error]", error.message);
    return secureError(error.message);
  }
});
