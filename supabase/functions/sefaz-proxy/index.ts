// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

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
 * 3. Buscar certificado vinculado para mTLS
 * 4. Montar envelope SOAP
 * 5. Enviar HTTPS com mTLS
 * 6. Retornar JSON simplificado
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
        console.log(
          `[SEFAZ] Establishment ${establishment_id} | CNPJ: ${est.cnpj} | ${ambiente} | UF: ${uf}`
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
        ambiente = settings.ambiente;
        uf = settings.uf_emissao;
      }
    }

    console.log(`[SEFAZ Proxy] Ação: ${action}, Ambiente: ${ambiente}, UF: ${uf}`);

    // =====================================================================
    // COMUNICAÇÃO SOAP (Placeholder)
    //
    // Em produção:
    // 1. Buscar certificado do establishment via establishment_certificates
    // 2. Determinar URL do webservice (tabela UF × ambiente)
    // 3. Montar envelope SOAP
    // 4. fetch() com mTLS (certificado PFX)
    // 5. Parsear retorno XML
    // =====================================================================

    // Simular delay de rede
    await new Promise((resolve) => setTimeout(resolve, 800 + Math.random() * 1200));

    let responseData: any = { success: false, status: "erro_simulado" };

    const mockChave =
      chave_acesso ||
      `35${new Date().getFullYear()}${String(Math.random()).slice(2, 36).padEnd(34, "0")}`;
    const mockProtocolo = protocolo || `135${Date.now()}`;

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
            raw_response: `<retorno>Autorizado o uso do ${action.includes("cte") ? "CT-e" : "MDF-e"}</retorno>`,
          };
        } else {
          responseData = {
            success: false,
            status: "rejeitado",
            motivo_rejeicao:
              "Rejeição 999: Erro simulado na SEFAZ (ambiente de testes)",
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
        };
        break;

      case "cancelar_cte":
      case "cancelar_mdfe":
        responseData = {
          success: true,
          status: "cancelado",
          protocolo: `135${Date.now()}`,
          data_autorizacao: new Date().toISOString(),
        };
        break;

      case "encerrar_mdfe":
        responseData = {
          success: true,
          status: "encerrado",
          protocolo: `135${Date.now()}`,
          data_autorizacao: new Date().toISOString(),
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
