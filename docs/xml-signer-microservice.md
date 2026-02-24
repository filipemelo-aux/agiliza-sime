# Microserviço Fiscal Completo (xml-signer v2.0)

## Visão Geral

Microserviço Docker que centraliza **assinatura XMLDSig + comunicação SOAP/mTLS com SEFAZ**.

A Edge Function `sefaz-proxy` delega toda a operação fiscal para este serviço:
1. Busca certificado PFX do storage
2. Envia PFX + XML + UF/ambiente para o microserviço
3. O microserviço assina, monta SOAP, envia via mTLS, e retorna JSON estruturado

## Endpoints

| Método | Rota | Descrição |
|---|---|---|
| GET | `/health` | Health check + lista de capabilities |
| POST | `/sign` | Apenas assinar XML (compatibilidade) |
| POST | `/cte/emit` | Assinar + enviar CT-e para SEFAZ |
| POST | `/cte/consult` | Consultar situação CT-e |
| POST | `/cte/cancel` | Cancelar CT-e |
| POST | `/cte/cce` | Carta de Correção CT-e |
| POST | `/mdfe/emit` | Assinar + enviar MDF-e para SEFAZ |
| POST | `/mdfe/consult` | Consultar MDF-e |
| POST | `/mdfe/cancel` | Cancelar MDF-e |
| POST | `/mdfe/close` | Encerrar MDF-e |

## Autenticação

Header `X-API-Key` com valor do secret `XML_SIGNER_API_KEY`.

## Request Body — `/cte/emit`

```json
{
  "xml": "<CTe>...</CTe>",
  "pfx_base64": "MIIKYQIBAzCCCi...",
  "password": "senha-do-certificado",
  "uf": "SP",
  "ambiente": "homologacao",
  "document_id": "uuid",
  "timeout": 30
}
```

## Request Body — `/cte/cancel`

```json
{
  "chave_acesso": "35...",
  "protocolo": "135...",
  "justificativa": "Erro na emissão do documento fiscal",
  "cnpj": "12345678000199",
  "pfx_base64": "...",
  "password": "...",
  "uf": "SP",
  "ambiente": "homologacao"
}
```

## Request Body — `/cte/cce`

```json
{
  "chave_acesso": "35...",
  "correcoes": "<grupoAlterado>...</grupoAlterado>",
  "cnpj": "12345678000199",
  "pfx_base64": "...",
  "password": "...",
  "uf": "SP",
  "ambiente": "homologacao",
  "seq": 1
}
```

## Response (todos os endpoints)

```json
{
  "success": true,
  "cStat": "100",
  "xMotivo": "Autorizado o uso do CT-e",
  "chave_acesso": "35...",
  "protocolo": "135...",
  "data_autorizacao": "2026-02-24T10:00:00-03:00",
  "xml_autorizado": "<protCTe>...</protCTe>",
  "signed_xml": "<CTe>...<Signature>...</Signature></CTe>",
  "digest_value": "...",
  "signature_value": "...",
  "sefaz_url": "https://..."
}
```

## Arquitetura de Segurança

- **Certificado**: PFX recebido por request, extraído em PEM em memória (`/tmp/certs/`)
- **Cleanup**: Arquivos temporários removidos imediatamente após uso
- **mTLS**: `requests.post(cert=(cert.pem, key.pem), verify=True)`
- **Nenhum** certificado persiste em disco
- **Porta 8080** interna — proxy reverso expõe 80/443

## Deploy

```bash
docker build -t fiscal-service ./xml-signer
docker run -p 8080:8080 -e API_KEY=your_key -e SEFAZ_TIMEOUT=30 fiscal-service
```

## Secrets (Lovable Cloud)

| Secret | Descrição |
|---|---|
| `XML_SIGNER_URL` | URL base do microserviço (ex: `https://sime.fsm.app.br`) |
| `XML_SIGNER_API_KEY` | Chave de autenticação |
| `CERTIFICATE_ENCRYPTION_KEY` | Chave AES-256-GCM para descriptografar senhas |

## Fluxo Completo

```
Frontend → fiscal_queue (DB) → fiscal-queue-worker (Edge)
    → sefaz-proxy (Edge) → busca cert do storage
    → chama Docker /cte/emit com PFX + XML + UF
    → Docker: assina XML → monta SOAP → mTLS com SEFAZ
    → Docker retorna JSON → sefaz-proxy retorna → worker atualiza DB
```
