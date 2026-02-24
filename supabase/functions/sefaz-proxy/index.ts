// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Proxy de Comunicação com SEFAZ (Webservices SOAP)
 *
 * Responsabilidade:
 * 1. Receber requisição do frontend (JSON)
 * 2. Montar envelope SOAP (XML)
 * 3. Enviar requisição HTTPS com mTLS (autenticação mútua via certificado A1)
 * 4. Processar resposta XML da SEFAZ
 * 5. Retornar JSON simplificado para o frontend
 *
 * Segurança:
 * - A comunicação direta com a SEFAZ ocorre SOMENTE aqui (servidor)
 * - O certificado A1 é usado para estabelecer o túnel seguro (mTLS)
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { action, signed_xml, chave_acesso, protocolo, justificativa, document_id } = await req.json();

    if (!action) {
      throw new Error("Parâmetro 'action' é obrigatório");
    }

    // 1. Configurar cliente Supabase
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // 2. Buscar configurações (ambiente, URLs da SEFAZ, certificado para mTLS)
    const { data: fiscalSettings } = await supabaseClient
      .from("fiscal_settings")
      .select("*")
      .limit(1)
      .single();

    if (!fiscalSettings) {
      throw new Error("Configurações fiscais não encontradas");
    }

    const ambiente = fiscalSettings.ambiente; // homologacao ou producao
    const uf = fiscalSettings.uf_emissao;

    console.log(`[SEFAZ Proxy] Ação: ${action}, Ambiente: ${ambiente}, UF: ${uf}`);

    // =================================================================================
    // LÓGICA DE COMUNICAÇÃO SOAP (Placeholder)
    //
    // Em produção:
    // 1. Determinar URL do webservice baseada na UF e Ambiente (tabela de URLs SEFAZ)
    // 2. Montar envelope SOAP com cabeçalho <nfeCabecMsg>
    // 3. Fazer fetch() com agent HTTPS configurado com o certificado PFX (mTLS)
    // 4. Parsear retorno XML
    // =================================================================================

    // SIMULAÇÃO DE RESPOSTAS DA SEFAZ
    // Simula atraso de rede e respostas de sucesso/erro para testes
    
    // Simular delay de rede (1-2 segundos)
    await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 1000));

    // Lógica simulada baseada na ação
    let responseData: any = {
      success: false,
      status: "erro_simulado",
    };

    const mockChave = chave_acesso || `35${new Date().getFullYear()}${Math.floor(Math.random() * 1000000000000000000000000000000000)}`;
    const mockProtocolo = protocolo || `135${Date.now()}`;

    switch (action) {
      case "autorizar_cte":
      case "autorizar_mdfe":
        // 90% de chance de sucesso na simulação
        if (Math.random() > 0.1) {
          responseData = {
            success: true,
            status: "autorizado",
            chave_acesso: mockChave,
            protocolo: mockProtocolo,
            data_autorizacao: new Date().toISOString(),
            xml_autorizado: signed_xml, // Na real seria o XML completo com protocolo
            raw_response: "<retorno>Autorizado o uso do CT-e</retorno>",
          };
        } else {
          responseData = {
            success: false,
            status: "rejeitado",
            motivo_rejeicao: "Rejeição 999: Erro simulado na SEFAZ (ambiente de testes)",
            raw_response: "<retorno>Rejeição 999</retorno>",
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
          protocolo: `135${Date.now()}`, // Protocolo de cancelamento
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
        throw new Error(`Ação '${action}' não suportada pelo proxy simulado`);
    }

    return new Response(JSON.stringify(responseData), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error: any) {
    console.error("[SEFAZ Proxy Error]", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
