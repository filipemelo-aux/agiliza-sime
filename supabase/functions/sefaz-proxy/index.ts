// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { getSefazUrl, getTpAmb, UF_CODIGO_IBGE, type SefazAmbiente } from "./sefazEndpoints.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Proxy de Comunicação com SEFAZ (Webservices SOAP)
 *
 * Fluxo:
 * 1. Receber requisição JSON (action + signed_xml + establishment_id)
 * 2. Buscar config do estabelecimento (ambiente, UF)
 * 3. Resolver endpoint SEFAZ correto (UF × ambiente)
 * 4. Buscar certificado vinculado para mTLS
 * 5. Montar envelope SOAP
 * 6. Enviar HTTPS com mTLS
 * 7. Retornar JSON simplificado
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      action,
      signed_xml,
      chave_acesso,
      protocolo,
      justificativa,
      document_id,
      establishment_id,
    } = await req.json();

    if (!action) {
      throw new Error("Parâmetro 'action' é obrigatório");
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // ── Determinar ambiente e UF do estabelecimento ─────────────────────
    let ambiente: SefazAmbiente = "homologacao";
    let uf = "SP";

    if (establishment_id) {
      const { data: est } = await supabaseClient
        .from("fiscal_establishments")
        .select("ambiente, endereco_uf, cnpj")
        .eq("id", establishment_id)
        .single();

      if (est) {
        ambiente = (est.ambiente as SefazAmbiente) || "homologacao";
        uf = est.endereco_uf || "SP";
        console.log(
          `[SEFAZ] Establishment ${establishment_id} | CNPJ: ${est.cnpj} | Ambiente: ${ambiente} | UF: ${uf}`
        );
      }
    } else {
      // Fallback: fiscal_settings
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

    // ── Resolve SEFAZ endpoint ──────────────────────────────────────────
    const sefazUrl = getSefazUrl(uf, ambiente, action);
    const tpAmb = getTpAmb(ambiente);
    const cUF = UF_CODIGO_IBGE[uf.toUpperCase()] || "35";

    console.log(
      `[SEFAZ Proxy] Ação: ${action} | Ambiente: ${ambiente} (tpAmb=${tpAmb}) | UF: ${uf} (cUF=${cUF}) | URL: ${sefazUrl}`
    );

    // =====================================================================
    // COMUNICAÇÃO SOAP (Placeholder — simulação)
    //
    // Em produção:
    // 1. Buscar certificado do establishment via establishment_certificates
    // 2. Montar envelope SOAP com o XML assinado
    // 3. fetch(sefazUrl) com mTLS (certificado PFX)
    // 4. Parsear retorno XML
    //
    // O endpoint correto já está resolvido em sefazUrl acima.
    // =====================================================================

    // Simular delay de rede
    await new Promise((resolve) => setTimeout(resolve, 800 + Math.random() * 1200));

    let responseData: any = { success: false, status: "erro_simulado" };

    const mockChave =
      chave_acesso ||
      `${cUF}${new Date().getFullYear()}${String(Math.random()).slice(2, 36).padEnd(34, "0")}`;
    const mockProtocolo = protocolo || `${cUF.slice(0,1)}35${Date.now()}`;

    switch (action) {
      case "autorizar_cte":
      case "autorizar_mdfe":
        if (Math.random() > 0.1) {
          responseData = {
            success: true,
            status: "autorizado",
            chave_acesso: mockChave,
            protocolo: mockProtocolo,
            data_autorizacao: new Date().toISOString(),
            xml_autorizado: signed_xml,
            sefaz_url: sefazUrl,
            ambiente,
            tpAmb,
            cUF,
            raw_response: `<retorno><cStat>100</cStat><xMotivo>Autorizado o uso do ${action.includes("cte") ? "CT-e" : "MDF-e"}</xMotivo></retorno>`,
          };
        } else {
          responseData = {
            success: false,
            status: "rejeitado",
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
          protocolo: `${cUF.slice(0,1)}35${Date.now()}`,
          data_autorizacao: new Date().toISOString(),
          sefaz_url: sefazUrl,
          ambiente,
        };
        break;

      default:
        throw new Error(`Ação '${action}' não suportada`);
    }

    return new Response(JSON.stringify(responseData), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: any) {
    console.error("[SEFAZ Proxy Error]", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
