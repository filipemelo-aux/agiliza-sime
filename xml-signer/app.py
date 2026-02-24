"""
Microserviço de Assinatura Digital XML (XMLDSig)
Assina documentos fiscais CT-e e MDF-e com certificado A1 (.pfx)

Contrato: docs/xml-signer-microservice.md
"""

import base64
import os
import logging

from flask import Flask, request, jsonify
from cryptography.hazmat.primitives.serialization import pkcs12
from lxml import etree
from signxml import XMLSigner, methods

app = Flask(__name__)
API_KEY = os.environ.get("API_KEY", "")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

NAMESPACES = {
    "cte": "http://www.portalfiscal.inf.br/cte",
    "mdfe": "http://www.portalfiscal.inf.br/mdfe",
    "ds": "http://www.w3.org/2000/09/xmldsig#",
}


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"}), 200


@app.route("/sign", methods=["POST"])
def sign():
    # Auth
    if API_KEY and request.headers.get("X-API-Key") != API_KEY:
        return jsonify({"error": "Unauthorized"}), 401

    try:
        data = request.json
        if not data:
            return jsonify({"error": "Request body is required"}), 400

        # Validate required fields
        for field in ("xml", "pfx_base64", "password", "document_type", "document_id"):
            if not data.get(field):
                return jsonify({"error": f"Campo obrigatório ausente: {field}"}), 400

        xml_str = data["xml"]
        pfx_bytes = base64.b64decode(data["pfx_base64"])
        password = data["password"].encode()
        doc_type = data["document_type"]
        doc_id = data["document_id"]

        logger.info(f"Signing {doc_type} document: {doc_id}")

        # Extract private key and certificate from PFX
        private_key, certificate, additional_certs = pkcs12.load_key_and_certificates(
            pfx_bytes, password
        )

        if not private_key or not certificate:
            return jsonify({"error": "Certificado inválido ou senha incorreta"}), 400

        # Parse XML
        root = etree.fromstring(xml_str.encode("utf-8"))

        # Find the node to sign (infCte or infMDFe)
        if doc_type == "cte":
            sign_node = root.find(".//cte:infCte", NAMESPACES)
        elif doc_type == "mdfe":
            sign_node = root.find(".//mdfe:infMDFe", NAMESPACES)
        else:
            return jsonify({"error": f"document_type inválido: {doc_type}"}), 400

        if sign_node is None:
            return jsonify({
                "error": f"Nó {'infCte' if doc_type == 'cte' else 'infMDFe'} não encontrado no XML"
            }), 400

        # Get the Id attribute for reference URI
        node_id = sign_node.attrib.get("Id", "")
        if not node_id:
            return jsonify({"error": "Atributo Id não encontrado no nó a ser assinado"}), 400

        reference_uri = f"#{node_id}"

        # Sign using XMLDSig (enveloped signature)
        signer = XMLSigner(
            method=methods.enveloped,
            signature_algorithm="rsa-sha256",
            digest_algorithm="sha256",
            c14n_algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315",
        )

        signed_root = signer.sign(
            root,
            key=private_key,
            cert=[certificate],
            reference_uri=reference_uri,
        )

        signed_xml = etree.tostring(
            signed_root, xml_declaration=True, encoding="unicode"
        )

        # Extract digest and signature values
        digest_el = signed_root.find(".//ds:DigestValue", NAMESPACES)
        sig_val_el = signed_root.find(".//ds:SignatureValue", NAMESPACES)

        result = {
            "signed_xml": signed_xml,
            "digest_value": digest_el.text if digest_el is not None else "",
            "signature_value": sig_val_el.text if sig_val_el is not None else "",
        }

        logger.info(f"Successfully signed {doc_type} document: {doc_id}")
        return jsonify(result), 200

    except Exception as e:
        logger.error(f"Signing error: {str(e)}")
        return jsonify({"error": f"Erro ao assinar: {str(e)}"}), 500


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8080, debug=False)
