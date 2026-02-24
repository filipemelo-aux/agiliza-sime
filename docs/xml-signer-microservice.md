# Microserviço de Assinatura Digital XML (XMLDSig)

## Contrato da API

O edge function `sign-fiscal-xml` delega a assinatura criptográfica real
a um microserviço externo via HTTP POST.

### Endpoint

```
POST /sign
Content-Type: application/json
X-API-Key: <chave-opcional>
```

### Request Body

```json
{
  "xml": "<CTe>...</CTe>",
  "pfx_base64": "MIIKYQIBAzCCCi...",
  "password": "senha-do-certificado",
  "document_type": "cte",
  "document_id": "uuid-do-documento"
}
```

| Campo | Tipo | Descrição |
|---|---|---|
| `xml` | string | XML do documento fiscal (CT-e ou MDF-e) |
| `pfx_base64` | string | Certificado A1 (.pfx) codificado em base64 |
| `password` | string | Senha do certificado (já descriptografada) |
| `document_type` | string | `"cte"` ou `"mdfe"` |
| `document_id` | string | UUID do documento (usado como URI da Reference) |

### Response Body (200 OK)

```json
{
  "signed_xml": "<CTe>...<Signature>...</Signature></CTe>",
  "digest_value": "abc123...",
  "signature_value": "xyz789..."
}
```

### Requisitos da Assinatura

1. **Padrão XMLDSig** (XML Digital Signature)
2. **Canonicalization**: `http://www.w3.org/TR/2001/REC-xml-c14n-20010315` (Canonical XML 1.0)
3. **Nó assinado**: `infCte` (CT-e) ou `infMDFe` (MDF-e) — a tag com `Id="CTe..."` ou `Id="MDFe..."`
4. **Algoritmo de digest**: SHA-256 (`http://www.w3.org/2001/04/xmlenc#sha256`)
5. **Algoritmo de assinatura**: RSA-SHA256 (`http://www.w3.org/2001/04/xmldsig-more#rsa-sha256`)
6. **Transforms**:
   - Enveloped Signature (`http://www.w3.org/2000/09/xmldsig#enveloped-signature`)
   - C14N (`http://www.w3.org/TR/2001/REC-xml-c14n-20010315`)
7. **KeyInfo**: Incluir `X509Certificate` com o certificado PEM extraído do PFX
8. **Inserção**: A `<Signature>` deve ser inserida antes do fechamento de `</CTe>` ou `</MDFe>`

### Exemplo Docker (Python + signxml)

```dockerfile
FROM python:3.12-slim

WORKDIR /app
RUN pip install flask signxml cryptography lxml

COPY app.py .

EXPOSE 8080
CMD ["python", "app.py"]
```

```python
# app.py
import base64
import os
from flask import Flask, request, jsonify
from cryptography.hazmat.primitives.serialization import pkcs12
from lxml import etree
from signxml import XMLSigner, methods

app = Flask(__name__)
API_KEY = os.environ.get("API_KEY", "")

@app.route("/sign", methods=["POST"])
def sign():
    # Auth
    if API_KEY and request.headers.get("X-API-Key") != API_KEY:
        return jsonify({"error": "Unauthorized"}), 401

    data = request.json
    xml_str = data["xml"]
    pfx_bytes = base64.b64decode(data["pfx_base64"])
    password = data["password"].encode()
    doc_type = data["document_type"]

    # Extrair chave privada e certificado do PFX
    private_key, certificate, _ = pkcs12.load_key_and_certificates(
        pfx_bytes, password
    )

    # Parse XML
    root = etree.fromstring(xml_str.encode())

    # Encontrar nó a assinar (infCte ou infMDFe)
    ns = {"cte": "http://www.portalfiscal.inf.br/cte",
          "mdfe": "http://www.portalfiscal.inf.br/mdfe"}
    
    if doc_type == "cte":
        sign_node = root.find(".//cte:infCte", ns) or root
    else:
        sign_node = root.find(".//mdfe:infMDFe", ns) or root

    # Assinar
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
        reference_uri="#" + sign_node.attrib.get("Id", ""),
    )

    signed_xml = etree.tostring(signed_root, xml_declaration=True, encoding="unicode")

    # Extrair digest e signature values
    sig_ns = {"ds": "http://www.w3.org/2000/09/xmldsig#"}
    digest = signed_root.find(".//ds:DigestValue", sig_ns)
    sig_val = signed_root.find(".//ds:SignatureValue", sig_ns)

    return jsonify({
        "signed_xml": signed_xml,
        "digest_value": digest.text if digest is not None else "",
        "signature_value": sig_val.text if sig_val is not None else "",
    })

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8080)
```

### Variáveis de Ambiente

Configurar no Lovable Cloud (secrets):

| Secret | Descrição |
|---|---|
| `XML_SIGNER_URL` | URL completa do microserviço (ex: `https://signer.meudominio.com/sign`) |
| `XML_SIGNER_API_KEY` | Chave de autenticação do microserviço (opcional) |

### Segurança

- O PFX e a senha **nunca são armazenados** no microserviço — são passados por request
- Use HTTPS obrigatoriamente em produção
- O microserviço deve ser stateless (sem persistência)
- Rate limit já é aplicado na edge function antes de chamar o serviço
- Recomendado rodar em rede privada (VPC) com a edge function

### Comportamento Fallback

Se `XML_SIGNER_URL` **não estiver configurado**, a edge function usa assinatura placeholder
(valores `PLACEHOLDER_DIGEST_*` / `PLACEHOLDER_SIG_*`). Útil para desenvolvimento e homologação
onde a SEFAZ aceita qualquer assinatura (ambiente de teste).
