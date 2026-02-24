// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { crypto } from "https://deno.land/std@0.177.0/crypto/mod.ts";
import * as base64 from "https://deno.land/std@0.177.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Função de Assinatura Digital de Documentos Fiscais (CT-e / MDF-e)
 *
 * Responsabilidade:
 * 1. Receber XML não assinado + ID do documento
 * 2. Buscar Certificado A1 do banco de dados (armazenado de forma segura)
 * 3. Assinar digitalmente o XML (padrão XMLDSig)
 * 4. Retornar XML assinado
 *
 * Segurança:
 * - O certificado A1 NUNCA sai desta edge function
 * - A senha do certificado é descriptografada apenas em memória durante a execução
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { xml, document_type, document_id } = await req.json();

    if (!xml || !document_type || !document_id) {
      throw new Error("Parâmetros inválidos: xml, document_type e document_id são obrigatórios");
    }

    // 1. Inicializar cliente Supabase (Service Role para acessar configs fiscais protegidas)
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // 2. Buscar configurações fiscais (certificado)
    const { data: fiscalSettings, error: settingsError } = await supabaseClient
      .from("fiscal_settings")
      .select("certificado_a1_path, senha_certificado_encrypted, cnpj")
      .limit(1)
      .single();

    if (settingsError || !fiscalSettings) {
      throw new Error("Configurações fiscais não encontradas ou erro ao buscar");
    }

    if (!fiscalSettings.certificado_a1_path) {
      throw new Error("Certificado A1 não configurado nas configurações fiscais");
    }

    // 3. Baixar arquivo do certificado do Storage
    const { data: certBlob, error: downloadError } = await supabaseClient.storage
      .from("fiscal-certificates") // Bucket privado
      .download(fiscalSettings.certificado_a1_path);

    if (downloadError || !certBlob) {
      throw new Error("Erro ao baixar certificado A1 do storage");
    }

    // Converter blob para array buffer
    const pfxBuffer = await certBlob.arrayBuffer();
    
    // TODO: Descriptografar senha do certificado (simulado aqui)
    const certPassword = fiscalSettings.senha_certificado_encrypted; // Deveria descriptografar

    console.log(`Assinando XML ${document_type} ${document_id} com certificado CNPJ ${fiscalSettings.cnpj}`);

    // =================================================================================
    // LÓGICA DE ASSINATURA (Placeholder)
    //
    // Em produção, usaríamos uma biblioteca compatível com Deno para XMLDSig
    // Como 'node-forge' ou similar via esm.sh
    //
    // Exemplo de fluxo real:
    // 1. Parsear PFX
    // 2. Extrair chave privada e certificado público
    // 3. Calcular hash SHA-1 do nodo <infCte> ou <infMDFe>
    // 4. Assinar hash com RSA-SHA1
    // 5. Montar estrutura <Signature> conforme padrão SEFAZ
    // 6. Inserir <Signature> no XML antes de </CTe> ou </MDFe>
    // =================================================================================

    // SIMULAÇÃO DA ASSINATURA PARA DESENVOLVIMENTO
    // Adiciona uma tag de assinatura fictícia para testes de fluxo
    const signaturePlaceholder = `
    <Signature xmlns="http://www.w3.org/2000/09/xmldsig#">
      <SignedInfo>
        <CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>
        <SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"/>
        <Reference URI="#${document_id}">
          <Transforms>
            <Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/>
            <Transform Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>
          </Transforms>
          <DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"/>
          <DigestValue>SIMULATED_HASH_${Date.now()}</DigestValue>
        </Reference>
      </SignedInfo>
      <SignatureValue>SIMULATED_SIGNATURE_${Date.now()}</SignatureValue>
      <KeyInfo>
        <X509Data>
          <X509Certificate>SIMULATED_CERTIFICATE_DATA</X509Certificate>
        </X509Data>
      </KeyInfo>
    </Signature>`;

    // Inserir assinatura antes do fechamento da tag raiz
    let signedXml = "";
    if (document_type === "cte") {
      signedXml = xml.replace("</CTe>", `${signaturePlaceholder}</CTe>`);
    } else if (document_type === "mdfe") {
      signedXml = xml.replace("</MDFe>", `${signaturePlaceholder}</MDFe>`);
    } else {
      signedXml = xml; // Fallback
    }

    return new Response(
      JSON.stringify({
        signed_xml: signedXml,
        digest_value: `SIMULATED_HASH_${Date.now()}`,
        signature_value: `SIMULATED_SIGNATURE_${Date.now()}`,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
