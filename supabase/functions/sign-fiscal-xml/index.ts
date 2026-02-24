// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Assinatura Digital de Documentos Fiscais (CT-e / MDF-e)
 *
 * Fluxo:
 * 1. Receber XML + document_type + document_id + establishment_id
 * 2. Buscar certificado vinculado ao estabelecimento (establishment_certificates → fiscal_certificates)
 * 3. Baixar .pfx do Storage (bucket fiscal-certificates)
 * 4. Assinar digitalmente o XML (XMLDSig)
 * 5. Retornar XML assinado
 *
 * Segurança:
 * - Certificado A1 NUNCA sai desta edge function
 * - Senha descriptografada apenas em memória
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { xml, document_type, document_id, establishment_id } = await req.json();

    if (!xml || !document_type || !document_id) {
      throw new Error("Parâmetros obrigatórios: xml, document_type, document_id");
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // ── Buscar certificado ──────────────────────────────────────────────
    let certPath: string | null = null;
    let certPassword: string | null = null;
    let certCnpj = "";

    if (establishment_id) {
      // 1. Buscar vínculo establishment → certificate
      const { data: link, error: linkErr } = await supabaseClient
        .from("establishment_certificates")
        .select("certificate_id")
        .eq("establishment_id", establishment_id)
        .limit(1)
        .maybeSingle();

      if (linkErr) {
        console.warn("Erro ao buscar vínculo certificado:", linkErr.message);
      }

      if (link?.certificate_id) {
        // 2. Buscar dados do certificado
        const { data: cert, error: certErr } = await supabaseClient
          .from("fiscal_certificates")
          .select("caminho_storage, senha_criptografada, nome")
          .eq("id", link.certificate_id)
          .eq("ativo", true)
          .single();

        if (certErr) {
          console.warn("Erro ao buscar certificado:", certErr.message);
        }

        if (cert) {
          certPath = cert.caminho_storage;
          certPassword = cert.senha_criptografada;
          console.log(`Usando certificado "${cert.nome}" para establishment ${establishment_id}`);
        }
      }

      // 3. Buscar CNPJ do estabelecimento
      const { data: est } = await supabaseClient
        .from("fiscal_establishments")
        .select("cnpj")
        .eq("id", establishment_id)
        .single();

      if (est) certCnpj = est.cnpj;
    }

    // Fallback: buscar do fiscal_settings (compatibilidade)
    if (!certPath) {
      const { data: settings } = await supabaseClient
        .from("fiscal_settings")
        .select("certificado_a1_path, senha_certificado_encrypted, cnpj")
        .limit(1)
        .maybeSingle();

      if (settings?.certificado_a1_path) {
        certPath = settings.certificado_a1_path;
        certPassword = settings.senha_certificado_encrypted;
        if (!certCnpj) certCnpj = settings.cnpj;
      }
    }

    if (!certPath) {
      throw new Error(
        "Certificado A1 não encontrado. Vincule um certificado ao estabelecimento."
      );
    }

    // ── Baixar PFX do Storage ───────────────────────────────────────────
    const { data: certBlob, error: downloadError } = await supabaseClient.storage
      .from("fiscal-certificates")
      .download(certPath);

    if (downloadError || !certBlob) {
      throw new Error("Erro ao baixar certificado A1 do storage");
    }

    const pfxBuffer = await certBlob.arrayBuffer();

    console.log(
      `Assinando XML ${document_type} ${document_id} | CNPJ emitente: ${certCnpj} | PFX: ${certPath} (${pfxBuffer.byteLength} bytes)`
    );

    // =====================================================================
    // LÓGICA DE ASSINATURA (Placeholder para desenvolvimento)
    //
    // Em produção, usar biblioteca compatível com Deno para XMLDSig:
    // 1. Parsear PFX com a senha
    // 2. Extrair chave privada + certificado X.509
    // 3. Calcular hash SHA-256 do nodo <infCte> ou <infMDFe>
    // 4. Assinar hash com RSA-SHA256
    // 5. Montar <Signature> conforme padrão SEFAZ
    // 6. Inserir no XML antes do fechamento da tag raiz
    // =====================================================================

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

    let signedXml = xml;
    if (document_type === "cte") {
      signedXml = xml.replace("</CTe>", `${signaturePlaceholder}</CTe>`);
    } else if (document_type === "mdfe") {
      signedXml = xml.replace("</MDFe>", `${signaturePlaceholder}</MDFe>`);
    }

    return new Response(
      JSON.stringify({
        signed_xml: signedXml,
        digest_value: `SIM_DIGEST_${timestampHash}`,
        signature_value: `SIM_SIG_${timestampHash}`,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error("[sign-fiscal-xml Error]", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
