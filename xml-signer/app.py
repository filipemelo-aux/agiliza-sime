"""
Microserviço Fiscal Completo — Assinatura XMLDSig + SOAP/mTLS com SEFAZ

Endpoints:
  POST /sign          — Assinar XML (mantido para compatibilidade)
  POST /cte/emit      — Assinar + enviar CT-e para SEFAZ
  POST /cte/consult   — Consultar CT-e na SEFAZ
  POST /cte/cancel    — Cancelar CT-e
  POST /cte/cce       — Carta de Correção CT-e
  POST /mdfe/emit     — Assinar + enviar MDF-e para SEFAZ
  POST /mdfe/consult  — Consultar MDF-e na SEFAZ
  POST /mdfe/cancel   — Cancelar MDF-e
  POST /mdfe/close    — Encerrar MDF-e
  GET  /health        — Health check
"""

import base64
import glob
import io
import os
import logging
import tempfile
import time
from datetime import datetime
from pathlib import Path

from flask import Flask, request, jsonify
from cryptography.hazmat.primitives.serialization import pkcs12, Encoding, PrivateFormat, NoEncryption
from cryptography.x509 import load_pem_x509_certificate
from lxml import etree
from signxml import XMLSigner, methods
import requests as http_requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

app = Flask(__name__)
API_KEY = os.environ.get("API_KEY", "")
DEFAULT_TIMEOUT = int(os.environ.get("SEFAZ_TIMEOUT", "30"))

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

NAMESPACES = {
    "cte": "http://www.portalfiscal.inf.br/cte",
    "mdfe": "http://www.portalfiscal.inf.br/mdfe",
    "ds": "http://www.w3.org/2000/09/xmldsig#",
    "soap": "http://www.w3.org/2003/05/soap-envelope",
}

# ── SEFAZ Endpoints por UF ───────────────────────────────────────

SEFAZ_ENDPOINTS = {
    "homologacao": {
        "SVRS": {
            "cteAutorizacao": "https://cte-homologacao.svrs.rs.gov.br/ws/cterecepcao/CTeRecepcao.asmx",
            "cteConsulta": "https://cte-homologacao.svrs.rs.gov.br/ws/cteconsulta/CTeConsulta.asmx",
            "cteEvento": "https://cte-homologacao.svrs.rs.gov.br/ws/cterecepcaoevento/CTeRecepcaoEvento.asmx",
            "cteStatus": "https://cte-homologacao.svrs.rs.gov.br/ws/ctestatusservico/CTeStatusServico.asmx",
            "mdfeAutorizacao": "https://mdfe-homologacao.svrs.rs.gov.br/ws/MDFeRecepcaoSinc/MDFeRecepcaoSinc.asmx",
            "mdfeConsulta": "https://mdfe-homologacao.svrs.rs.gov.br/ws/MDFeConsulta/MDFeConsulta.asmx",
            "mdfeEvento": "https://mdfe-homologacao.svrs.rs.gov.br/ws/MDFeRecepcaoEvento/MDFeRecepcaoEvento.asmx",
        },
        "SP": {
            "cteAutorizacao": "https://homologacao.nfe.fazenda.sp.gov.br/cteWEB/services/CTeRecepcao.asmx",
            "cteConsulta": "https://homologacao.nfe.fazenda.sp.gov.br/cteWEB/services/CTeConsulta.asmx",
            "cteEvento": "https://homologacao.nfe.fazenda.sp.gov.br/cteWEB/services/CTeRecepcaoEvento.asmx",
            "cteStatus": "https://homologacao.nfe.fazenda.sp.gov.br/cteWEB/services/CTeStatusServico.asmx",
        },
        "MG": {
            "cteAutorizacao": "https://hcte.fazenda.mg.gov.br/cte/services/CTeRecepcao.asmx",
            "cteConsulta": "https://hcte.fazenda.mg.gov.br/cte/services/CTeConsulta.asmx",
            "cteEvento": "https://hcte.fazenda.mg.gov.br/cte/services/CTeRecepcaoEvento.asmx",
            "cteStatus": "https://hcte.fazenda.mg.gov.br/cte/services/CTeStatusServico.asmx",
        },
        "MT": {
            "cteAutorizacao": "https://homologacao.sefaz.mt.gov.br/ctews/services/CTeRecepcao.asmx",
            "cteConsulta": "https://homologacao.sefaz.mt.gov.br/ctews/services/CTeConsulta.asmx",
            "cteEvento": "https://homologacao.sefaz.mt.gov.br/ctews/services/CTeRecepcaoEvento.asmx",
            "cteStatus": "https://homologacao.sefaz.mt.gov.br/ctews/services/CTeStatusServico.asmx",
        },
        "MS": {
            "cteAutorizacao": "https://homologacao.cte.ms.gov.br/services/CTeRecepcao.asmx",
            "cteConsulta": "https://homologacao.cte.ms.gov.br/services/CTeConsulta.asmx",
            "cteEvento": "https://homologacao.cte.ms.gov.br/services/CTeRecepcaoEvento.asmx",
            "cteStatus": "https://homologacao.cte.ms.gov.br/services/CTeStatusServico.asmx",
        },
        "PR": {
            "cteAutorizacao": "https://homologacao.cte.fazenda.pr.gov.br/cte/CTeRecepcao.asmx",
            "cteConsulta": "https://homologacao.cte.fazenda.pr.gov.br/cte/CTeConsulta.asmx",
            "cteEvento": "https://homologacao.cte.fazenda.pr.gov.br/cte/CTeRecepcaoEvento.asmx",
            "cteStatus": "https://homologacao.cte.fazenda.pr.gov.br/cte/CTeStatusServico.asmx",
        },
    },
    "producao": {
        "SVRS": {
            "cteAutorizacao": "https://cte.svrs.rs.gov.br/ws/cterecepcao/CTeRecepcao.asmx",
            "cteConsulta": "https://cte.svrs.rs.gov.br/ws/cteconsulta/CTeConsulta.asmx",
            "cteEvento": "https://cte.svrs.rs.gov.br/ws/cterecepcaoevento/CTeRecepcaoEvento.asmx",
            "cteStatus": "https://cte.svrs.rs.gov.br/ws/ctestatusservico/CTeStatusServico.asmx",
            "mdfeAutorizacao": "https://mdfe.svrs.rs.gov.br/ws/MDFeRecepcaoSinc/MDFeRecepcaoSinc.asmx",
            "mdfeConsulta": "https://mdfe.svrs.rs.gov.br/ws/MDFeConsulta/MDFeConsulta.asmx",
            "mdfeEvento": "https://mdfe.svrs.rs.gov.br/ws/MDFeRecepcaoEvento/MDFeRecepcaoEvento.asmx",
        },
        "SP": {
            "cteAutorizacao": "https://nfe.fazenda.sp.gov.br/cteWEB/services/CTeRecepcao.asmx",
            "cteConsulta": "https://nfe.fazenda.sp.gov.br/cteWEB/services/CTeConsulta.asmx",
            "cteEvento": "https://nfe.fazenda.sp.gov.br/cteWEB/services/CTeRecepcaoEvento.asmx",
            "cteStatus": "https://nfe.fazenda.sp.gov.br/cteWEB/services/CTeStatusServico.asmx",
        },
        "MG": {
            "cteAutorizacao": "https://cte.fazenda.mg.gov.br/cte/services/CTeRecepcao.asmx",
            "cteConsulta": "https://cte.fazenda.mg.gov.br/cte/services/CTeConsulta.asmx",
            "cteEvento": "https://cte.fazenda.mg.gov.br/cte/services/CTeRecepcaoEvento.asmx",
            "cteStatus": "https://cte.fazenda.mg.gov.br/cte/services/CTeStatusServico.asmx",
        },
        "MT": {
            "cteAutorizacao": "https://cte.sefaz.mt.gov.br/ctews/services/CTeRecepcao.asmx",
            "cteConsulta": "https://cte.sefaz.mt.gov.br/ctews/services/CTeConsulta.asmx",
            "cteEvento": "https://cte.sefaz.mt.gov.br/ctews/services/CTeRecepcaoEvento.asmx",
            "cteStatus": "https://cte.sefaz.mt.gov.br/ctews/services/CTeStatusServico.asmx",
        },
        "MS": {
            "cteAutorizacao": "https://producao.cte.ms.gov.br/services/CTeRecepcao.asmx",
            "cteConsulta": "https://producao.cte.ms.gov.br/services/CTeConsulta.asmx",
            "cteEvento": "https://producao.cte.ms.gov.br/services/CTeRecepcaoEvento.asmx",
            "cteStatus": "https://producao.cte.ms.gov.br/services/CTeStatusServico.asmx",
        },
        "PR": {
            "cteAutorizacao": "https://cte.fazenda.pr.gov.br/cte/CTeRecepcao.asmx",
            "cteConsulta": "https://cte.fazenda.pr.gov.br/cte/CTeConsulta.asmx",
            "cteEvento": "https://cte.fazenda.pr.gov.br/cte/CTeRecepcaoEvento.asmx",
            "cteStatus": "https://cte.fazenda.pr.gov.br/cte/CTeStatusServico.asmx",
        },
    },
}

# UFs que têm endpoints próprios; demais usam SVRS
UFS_COM_ENDPOINT_PROPRIO = {"SP", "MG", "MT", "MS", "PR"}

UF_CODIGO_IBGE = {
    "AC": "12", "AL": "27", "AM": "13", "AP": "16", "BA": "29", "CE": "23",
    "DF": "53", "ES": "32", "GO": "52", "MA": "21", "MG": "31", "MS": "50",
    "MT": "51", "PA": "15", "PB": "25", "PE": "26", "PI": "22", "PR": "41",
    "RJ": "33", "RN": "24", "RO": "11", "RR": "14", "RS": "43", "SC": "42",
    "SE": "28", "SP": "35", "TO": "17",
}


def get_sefaz_url(uf: str, ambiente: str, service_key: str) -> str:
    """Resolve URL do webservice SEFAZ para UF/ambiente/serviço."""
    uf = uf.upper()
    amb = ambiente if ambiente in ("homologacao", "producao") else "homologacao"
    region = uf if uf in UFS_COM_ENDPOINT_PROPRIO else "SVRS"
    endpoints = SEFAZ_ENDPOINTS.get(amb, {}).get(region, {})
    url = endpoints.get(service_key)
    if not url:
        # Fallback: SVRS
        url = SEFAZ_ENDPOINTS.get(amb, {}).get("SVRS", {}).get(service_key)
    if not url:
        raise ValueError(f"Endpoint não encontrado: {service_key} para UF={uf} ambiente={amb}")
    return url


# ── Certificado: extrair PEM em memória ──────────────────────────

class InMemoryCert:
    """Extrai cert.pem e key.pem do PFX em memória para uso com requests/mTLS."""

    def __init__(self, pfx_bytes: bytes, password: bytes):
        self.private_key, self.certificate, self.additional_certs = (
            pkcs12.load_key_and_certificates(pfx_bytes, password)
        )
        if not self.private_key or not self.certificate:
            raise ValueError("Certificado inválido ou senha incorreta")

        # Gerar PEM em memória
        self._key_pem = self.private_key.private_bytes(
            Encoding.PEM, PrivateFormat.TraditionalOpenSSL, NoEncryption()
        )
        self._cert_pem = self.certificate.public_bytes(Encoding.PEM)

        # Criar arquivos temporários (em memória via tmpfs quando disponível)
        self._cert_file = tempfile.NamedTemporaryFile(suffix=".pem", delete=False)
        self._key_file = tempfile.NamedTemporaryFile(suffix=".pem", delete=False)
        self._cert_file.write(self._cert_pem)
        self._cert_file.flush()
        self._key_file.write(self._key_pem)
        self._key_file.flush()

    @property
    def cert_tuple(self):
        """Retorna (cert_path, key_path) para requests.post(cert=...)"""
        return (self._cert_file.name, self._key_file.name)

    def cleanup(self):
        """Remove arquivos temporários da memória."""
        try:
            os.unlink(self._cert_file.name)
        except OSError:
            pass
        try:
            os.unlink(self._key_file.name)
        except OSError:
            pass

    def __del__(self):
        self.cleanup()


# ── Assinatura XMLDSig ───────────────────────────────────────────

def sign_xml(xml_str: str, cert: InMemoryCert, doc_type: str, doc_id: str) -> dict:
    """Assina XML usando XMLDSig (enveloped signature)."""
    root = etree.fromstring(xml_str.encode("utf-8"))

    if doc_type == "cte":
        sign_node = root.find(".//cte:infCte", NAMESPACES)
    elif doc_type == "mdfe":
        sign_node = root.find(".//mdfe:infMDFe", NAMESPACES)
    else:
        raise ValueError(f"document_type inválido: {doc_type}")

    if sign_node is None:
        raise ValueError(f"Nó {'infCte' if doc_type == 'cte' else 'infMDFe'} não encontrado no XML")

    node_id = sign_node.attrib.get("Id", "")
    if not node_id:
        raise ValueError("Atributo Id não encontrado no nó a ser assinado")

    signer = XMLSigner(
        method=methods.enveloped,
        signature_algorithm="rsa-sha256",
        digest_algorithm="sha256",
        c14n_algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315",
    )

    signed_root = signer.sign(
        root,
        key=cert.private_key,
        cert=[cert.certificate],
        reference_uri=f"#{node_id}",
    )

    signed_xml_body = etree.tostring(signed_root, encoding="unicode")
    signed_xml = '<?xml version="1.0" encoding="UTF-8"?>\n' + signed_xml_body

    digest_el = signed_root.find(".//ds:DigestValue", NAMESPACES)
    sig_val_el = signed_root.find(".//ds:SignatureValue", NAMESPACES)

    return {
        "signed_xml": signed_xml,
        "signed_root": signed_root,
        "digest_value": digest_el.text if digest_el is not None else "",
        "signature_value": sig_val_el.text if sig_val_el is not None else "",
    }


# ── Validação XSD CT-e 4.00 ──────────────────────────────────────

XSD_DIR = Path(os.environ.get("XSD_DIR", "/app/xsd"))
_xsd_cache: dict[str, etree.XMLSchema] = {}


def _load_xsd(schema_name: str) -> etree.XMLSchema | None:
    """Carrega e cacheia schema XSD do diretório de schemas."""
    if schema_name in _xsd_cache:
        return _xsd_cache[schema_name]

    xsd_path = XSD_DIR / schema_name
    if not xsd_path.exists():
        logger.warning(f"[XSD] Schema não encontrado: {xsd_path}")
        return None

    try:
        with open(xsd_path, "rb") as f:
            xsd_doc = etree.parse(f)
        schema = etree.XMLSchema(xsd_doc)
        _xsd_cache[schema_name] = schema
        logger.info(f"[XSD] Schema carregado: {schema_name}")
        return schema
    except Exception as e:
        logger.error(f"[XSD] Erro ao carregar {schema_name}: {e}")
        return None


def validate_cte_xsd(xml_str: str) -> list[str]:
    """
    Valida XML do CT-e contra o schema XSD oficial 4.00.
    Retorna lista de erros (vazia = válido).
    Se o XSD não estiver disponível, retorna vazia (skip gracioso).
    """
    schema = _load_xsd("cte_v4.00.xsd")
    if schema is None:
        # Tentar schema alternativo (enviCTe wrapper)
        schema = _load_xsd("enviCTe_v4.00.xsd")
    if schema is None:
        # XSD não disponível — skip gracioso (não bloqueia emissão)
        logger.info("[XSD] Nenhum schema XSD disponível — validação ignorada")
        return []

    try:
        doc = etree.fromstring(xml_str.encode("utf-8"))
        if schema.validate(doc):
            return []

        errors = []
        for err in schema.error_log:
            # Formatar erro de forma legível
            line_info = f"linha {err.line}" if err.line else ""
            errors.append(f"{err.message} {line_info}".strip())

        # Limitar a 10 erros para não sobrecarregar a resposta
        return errors[:10]
    except etree.XMLSyntaxError as e:
        return [f"XML malformado: {str(e)}"]


def validate_mdfe_xsd(xml_str: str) -> list[str]:
    """Valida XML do MDF-e contra schema XSD 3.00."""
    schema = _load_xsd("mdfe_v3.00.xsd")
    if schema is None:
        return []

    try:
        doc = etree.fromstring(xml_str.encode("utf-8"))
        if schema.validate(doc):
            return []
        return [err.message for err in schema.error_log][:10]
    except etree.XMLSyntaxError as e:
        return [f"XML malformado: {str(e)}"]




def build_soap_envelope(xml_content: str, soap_action: str) -> str:
    """Monta envelope SOAP 1.2 para envio à SEFAZ."""
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope"
                 xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                 xmlns:xsd="http://www.w3.org/2001/XMLSchema">
  <soap12:Header/>
  <soap12:Body>
    {xml_content}
  </soap12:Body>
</soap12:Envelope>"""


def build_cte_lote_xml(signed_xml: str, id_lote: str, versao: str = "4.00") -> str:
    """Monta o XML de lote para envio CT-e (enviCTe)."""
    return f"""<enviCTe xmlns="http://www.portalfiscal.inf.br/cte" versao="{versao}">
  <idLote>{id_lote}</idLote>
  {signed_xml}
</enviCTe>"""


def build_consulta_xml(chave_acesso: str, tp_amb: str, doc_type: str = "cte") -> str:
    """Monta XML de consulta de situação."""
    if doc_type == "cte":
        return f"""<consSitCTe xmlns="http://www.portalfiscal.inf.br/cte" versao="4.00">
  <tpAmb>{tp_amb}</tpAmb>
  <xServ>CONSULTAR</xServ>
  <chCTe>{chave_acesso}</chCTe>
</consSitCTe>"""
    else:
        return f"""<consSitMDFe xmlns="http://www.portalfiscal.inf.br/mdfe" versao="3.00">
  <tpAmb>{tp_amb}</tpAmb>
  <xServ>CONSULTAR</xServ>
  <chMDFe>{chave_acesso}</chMDFe>
</consSitMDFe>"""


def build_cancel_event_xml(
    chave_acesso: str, protocolo: str, justificativa: str,
    tp_amb: str, cnpj: str, doc_type: str = "cte", seq: int = 1
) -> str:
    """Monta XML de evento de cancelamento."""
    dt = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S-03:00")
    cuf = chave_acesso[:2]
    tp_evento = "110111"
    desc_evento = "Cancelamento"
    ns = "http://www.portalfiscal.inf.br/cte" if doc_type == "cte" else "http://www.portalfiscal.inf.br/mdfe"
    ch_tag = "chCTe" if doc_type == "cte" else "chMDFe"

    return f"""<eventoCTe xmlns="{ns}" versao="4.00">
  <infEvento Id="ID{tp_evento}{chave_acesso}{seq:02d}">
    <cOrgao>{cuf}</cOrgao>
    <tpAmb>{tp_amb}</tpAmb>
    <CNPJ>{cnpj}</CNPJ>
    <{ch_tag}>{chave_acesso}</{ch_tag}>
    <dhEvento>{dt}</dhEvento>
    <tpEvento>{tp_evento}</tpEvento>
    <nSeqEvento>{seq}</nSeqEvento>
    <detEvento versaoEvento="4.00">
      <evCancCTe>
        <descEvento>{desc_evento}</descEvento>
        <nProt>{protocolo}</nProt>
        <xJust>{justificativa}</xJust>
      </evCancCTe>
    </detEvento>
  </infEvento>
</eventoCTe>"""


def build_cce_event_xml(
    chave_acesso: str, correcoes: str, tp_amb: str, cnpj: str, seq: int = 1
) -> str:
    """Monta XML de Carta de Correção Eletrônica (CC-e) para CT-e."""
    dt = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S-03:00")
    cuf = chave_acesso[:2]
    tp_evento = "110110"
    ns = "http://www.portalfiscal.inf.br/cte"

    return f"""<eventoCTe xmlns="{ns}" versao="4.00">
  <infEvento Id="ID{tp_evento}{chave_acesso}{seq:02d}">
    <cOrgao>{cuf}</cOrgao>
    <tpAmb>{tp_amb}</tpAmb>
    <CNPJ>{cnpj}</CNPJ>
    <chCTe>{chave_acesso}</chCTe>
    <dhEvento>{dt}</dhEvento>
    <tpEvento>{tp_evento}</tpEvento>
    <nSeqEvento>{seq}</nSeqEvento>
    <detEvento versaoEvento="4.00">
      <evCCeCTe>
        <descEvento>Carta de Correcao</descEvento>
        <infCorrecao>
          {correcoes}
        </infCorrecao>
      </evCCeCTe>
    </detEvento>
  </infEvento>
</eventoCTe>"""


# ── Comunicação mTLS com SEFAZ ───────────────────────────────────

def create_session_with_retry(retries: int = 2) -> http_requests.Session:
    """Cria sessão HTTP com retry automático em erros temporários."""
    session = http_requests.Session()
    retry_strategy = Retry(
        total=retries,
        backoff_factor=1,
        status_forcelist=[502, 503, 504],
        allowed_methods=["POST"],
    )
    adapter = HTTPAdapter(max_retries=retry_strategy)
    session.mount("https://", adapter)
    return session


def send_to_sefaz(
    url: str, soap_xml: str, cert: InMemoryCert,
    soap_action: str, timeout: int = None
) -> etree._Element:
    """Envia envelope SOAP para SEFAZ com mTLS."""
    timeout = timeout or DEFAULT_TIMEOUT
    envelope = build_soap_envelope(soap_xml, soap_action)

    headers = {
        "Content-Type": "application/soap+xml; charset=utf-8",
        "SOAPAction": soap_action,
    }

    session = create_session_with_retry()
    try:
        logger.info(f"[SEFAZ] POST {url} | SOAPAction: {soap_action}")
        start = time.time()
        response = session.post(
            url,
            data=envelope.encode("utf-8"),
            headers=headers,
            cert=cert.cert_tuple,
            verify=True,
            timeout=timeout,
        )
        elapsed = int((time.time() - start) * 1000)
        logger.info(f"[SEFAZ] Response {response.status_code} in {elapsed}ms")

        if response.status_code != 200:
            raise Exception(f"SEFAZ retornou HTTP {response.status_code}: {response.text[:500]}")

        # Parse SOAP response
        resp_root = etree.fromstring(response.content)
        body = resp_root.find(".//{http://www.w3.org/2003/05/soap-envelope}Body")
        if body is None:
            body = resp_root  # fallback
        return body
    finally:
        session.close()


def extract_sefaz_response(body: etree._Element, doc_type: str = "cte") -> dict:
    """
    Extrai campos relevantes da resposta SEFAZ com tratamento explícito de cStat.

    Códigos tratados:
      - 100: Autorizado o uso do CT-e/MDF-e
      - 101: Cancelamento homologado
      - 103: Lote recebido com sucesso (assíncrono — precisa consultar recibo)
      - 104: Lote processado (contém protCTe/protMDFe dentro)
      - 105: Lote em processamento (aguardar e consultar novamente)
      - 135: Evento registrado e vinculado
      - 150: Autorizado o uso (com observação)
      - 204: Duplicidade de CT-e (já existe com mesma chave)
      - 206-999: Códigos de rejeição
    """
    result = {
        "success": False,
        "cStat": "",
        "cStat_lote": "",
        "xMotivo": "",
        "xMotivo_lote": "",
        "chave_acesso": "",
        "protocolo": "",
        "nRec": "",
        "data_autorizacao": "",
        "xml_autorizado": "",
        "status_detail": "",
    }

    # Primeiro pass: extrair cStat do retorno do lote (retEnviCTe / retConsReciCTe)
    lote_cstat = ""
    lote_xmotivo = ""
    prot_cstat = ""
    prot_xmotivo = ""

    for elem in body.iter():
        tag = etree.QName(elem).localname if isinstance(elem.tag, str) else ""
        text = (elem.text or "").strip()

        # cStat pode aparecer no nível do lote E no nível do protocolo
        if tag == "cStat" and text:
            parent_tag = ""
            if elem.getparent() is not None:
                parent_tag = etree.QName(elem.getparent()).localname if isinstance(elem.getparent().tag, str) else ""

            if parent_tag in ("retEnviCTe", "retConsReciCTe", "retEnviMDFe", "retCTe", "retMDFe"):
                lote_cstat = text
            elif parent_tag in ("infProt", "protCTe", "protMDFe", "infEvento", "retEvento"):
                prot_cstat = text
            elif not lote_cstat:
                # Fallback: primeiro cStat encontrado
                lote_cstat = text

        elif tag == "xMotivo" and text:
            parent_tag = ""
            if elem.getparent() is not None:
                parent_tag = etree.QName(elem.getparent()).localname if isinstance(elem.getparent().tag, str) else ""

            if parent_tag in ("retEnviCTe", "retConsReciCTe", "retEnviMDFe", "retCTe", "retMDFe"):
                lote_xmotivo = text
            elif parent_tag in ("infProt", "protCTe", "protMDFe", "infEvento", "retEvento"):
                prot_xmotivo = text
            elif not lote_xmotivo:
                lote_xmotivo = text

        elif tag in ("chCTe", "chMDFe") and text:
            result["chave_acesso"] = text
        elif tag == "nProt" and text:
            result["protocolo"] = text
        elif tag == "nRec" and text:
            result["nRec"] = text
        elif tag == "dhRecbto" and text:
            result["data_autorizacao"] = text
        elif tag in ("protCTe", "protMDFe"):
            result["xml_autorizado"] = etree.tostring(elem, encoding="unicode")

    # Usar cStat do protocolo se disponível, senão do lote
    final_cstat = prot_cstat or lote_cstat
    final_xmotivo = prot_xmotivo or lote_xmotivo

    result["cStat"] = final_cstat
    result["xMotivo"] = final_xmotivo
    result["cStat_lote"] = lote_cstat
    result["xMotivo_lote"] = lote_xmotivo

    # ── Tratamento explícito por código ──────────────────────
    cstat = final_cstat

    # Códigos de sucesso definitivo
    if cstat in ("100", "150"):
        result["success"] = True
        result["status_detail"] = "autorizado"

    elif cstat == "101":
        result["success"] = True
        result["status_detail"] = "cancelamento_homologado"

    elif cstat == "135":
        result["success"] = True
        result["status_detail"] = "evento_registrado"

    # Lote recebido — processamento assíncrono
    elif cstat == "103":
        result["success"] = True
        result["status_detail"] = "lote_recebido"
        result["xMotivo"] = f"Lote recebido com sucesso. nRec={result['nRec']}. Consultar recibo."

    # Lote processado — verificar protocolo individual
    elif cstat == "104":
        # Se temos protocolo individual, verificar seu cStat
        if prot_cstat in ("100", "150"):
            result["success"] = True
            result["status_detail"] = "autorizado"
        elif prot_cstat == "204":
            result["success"] = True  # Duplicidade não é erro fatal
            result["status_detail"] = "duplicidade"
            result["xMotivo"] = f"Duplicidade de CT-e: {prot_xmotivo}"
        elif prot_cstat:
            result["success"] = False
            result["status_detail"] = "rejeitado"
            result["motivo_rejeicao"] = f"Rejeição {prot_cstat}: {prot_xmotivo}"
        else:
            # 104 sem protocolo individual — tratar como sucesso parcial
            result["success"] = True
            result["status_detail"] = "lote_processado"

    # Lote em processamento — precisa aguardar
    elif cstat == "105":
        result["success"] = False
        result["status_detail"] = "em_processamento"
        result["xMotivo"] = f"Lote em processamento. nRec={result['nRec']}. Aguardar e consultar."

    # Duplicidade direta (sem ser dentro de 104)
    elif cstat == "204":
        result["success"] = True
        result["status_detail"] = "duplicidade"
        result["xMotivo"] = f"Duplicidade: {final_xmotivo}"

    # Erros de serviço (temporários — retry)
    elif cstat in ("108", "109", "999"):
        result["success"] = False
        result["status_detail"] = "servico_indisponivel"
        result["motivo_rejeicao"] = f"Serviço indisponível ({cstat}): {final_xmotivo}"

    # Rejeições genéricas (200-999 exceto os tratados acima)
    elif cstat and int(cstat) >= 200:
        result["success"] = False
        result["status_detail"] = "rejeitado"
        result["motivo_rejeicao"] = f"Rejeição {cstat}: {final_xmotivo}"

    # Código desconhecido
    elif cstat:
        result["success"] = False
        result["status_detail"] = "desconhecido"
        result["motivo_rejeicao"] = f"Código {cstat}: {final_xmotivo}"

    return result


# ── Autenticação ─────────────────────────────────────────────────

def check_auth():
    if API_KEY and request.headers.get("X-API-Key") != API_KEY:
        return jsonify({"error": "Unauthorized"}), 401
    return None


def parse_cert_from_request(data: dict) -> InMemoryCert:
    """Extrai e valida certificado do request body."""
    for field in ("pfx_base64", "password"):
        if not data.get(field):
            raise ValueError(f"Campo obrigatório ausente: {field}")
    pfx_bytes = base64.b64decode(data["pfx_base64"])
    password = data["password"].encode()
    return InMemoryCert(pfx_bytes, password)


def get_tp_amb(ambiente: str) -> str:
    return "1" if ambiente == "producao" else "2"


# ── Endpoints ────────────────────────────────────────────────────

@app.route("/health", methods=["GET"])
def health():
    # Verificar XSDs disponíveis
    xsd_files = list(XSD_DIR.glob("*.xsd")) if XSD_DIR.exists() else []
    xsd_names = [f.name for f in xsd_files]
    return jsonify({
        "status": "ok",
        "version": "2.1.0",
        "xsd_available": len(xsd_files) > 0,
        "xsd_schemas": xsd_names,
        "capabilities": [
            "sign", "cte/emit", "cte/consult", "cte/cancel", "cte/cce",
            "mdfe/emit", "mdfe/consult", "mdfe/cancel", "mdfe/close",
        ],
    }), 200


@app.route("/sign", methods=["POST"])
def sign_endpoint():
    """Apenas assinar XML (compatibilidade retroativa)."""
    auth_err = check_auth()
    if auth_err:
        return auth_err

    try:
        data = request.json
        if not data:
            return jsonify({"error": "Request body is required"}), 400

        for field in ("xml", "pfx_base64", "password", "document_type", "document_id"):
            if not data.get(field):
                return jsonify({"error": f"Campo obrigatório ausente: {field}"}), 400

        cert = parse_cert_from_request(data)
        try:
            result = sign_xml(data["xml"], cert, data["document_type"], data["document_id"])
            logger.info(f"Signed {data['document_type']} document: {data['document_id']}")
            return jsonify({
                "signed_xml": result["signed_xml"],
                "digest_value": result["digest_value"],
                "signature_value": result["signature_value"],
            }), 200
        finally:
            cert.cleanup()

    except Exception as e:
        logger.error(f"Signing error: {str(e)}")
        return jsonify({"error": f"Erro ao assinar: {str(e)}"}), 500


@app.route("/cte/emit", methods=["POST"])
def cte_emit():
    """Assinar CT-e + enviar para SEFAZ via SOAP/mTLS."""
    auth_err = check_auth()
    if auth_err:
        return auth_err

    cert = None
    try:
        data = request.json
        if not data:
            return jsonify({"error": "Request body is required"}), 400

        for field in ("xml", "pfx_base64", "password", "uf", "ambiente"):
            if not data.get(field):
                return jsonify({"error": f"Campo obrigatório ausente: {field}"}), 400

        cert = parse_cert_from_request(data)
        doc_id = data.get("document_id", "CTe_unknown")

        # 0. Validar XML contra XSD (se disponível)
        skip_xsd = data.get("skip_xsd_validation", False)
        if not skip_xsd:
            xsd_errors = validate_cte_xsd(data["xml"])
            if xsd_errors:
                logger.warning(f"[CTE EMIT] XSD validation failed: {xsd_errors}")
                return jsonify({
                    "success": False,
                    "error": "Validação XSD falhou",
                    "xsd_errors": xsd_errors,
                    "status_detail": "xsd_invalido",
                }), 400

        # 1. Assinar XML
        logger.info(f"[CTE EMIT] Assinando CT-e {doc_id}")
        sign_result = sign_xml(data["xml"], cert, "cte", doc_id)

        # 2. Montar lote
        id_lote = str(int(time.time()))[-15:]
        lote_xml = build_cte_lote_xml(sign_result["signed_xml"], id_lote)

        # 3. Resolver endpoint SEFAZ
        url = get_sefaz_url(data["uf"], data["ambiente"], "cteAutorizacao")
        tp_amb = get_tp_amb(data["ambiente"])

        # 4. Enviar via mTLS
        logger.info(f"[CTE EMIT] Enviando lote {id_lote} para {url}")
        soap_body = send_to_sefaz(
            url, lote_xml, cert,
            soap_action="http://www.portalfiscal.inf.br/cte/wsdl/CTeRecepcaoSinc/cteRecepcaoLote",
            timeout=data.get("timeout", DEFAULT_TIMEOUT),
        )

        # 5. Extrair resposta
        result = extract_sefaz_response(soap_body, "cte")
        result["signed_xml"] = sign_result["signed_xml"]
        result["digest_value"] = sign_result["digest_value"]
        result["signature_value"] = sign_result["signature_value"]
        result["sefaz_url"] = url
        result["ambiente"] = data["ambiente"]
        result["tpAmb"] = tp_amb
        result["id_lote"] = id_lote

        logger.info(f"[CTE EMIT] Resultado: cStat={result['cStat']} | {result['xMotivo']}")
        return jsonify(result), 200

    except Exception as e:
        logger.error(f"[CTE EMIT] Error: {str(e)}")
        return jsonify({"error": str(e), "success": False}), 500
    finally:
        if cert:
            cert.cleanup()


@app.route("/cte/consult", methods=["POST"])
def cte_consult():
    """Consultar situação de CT-e na SEFAZ."""
    auth_err = check_auth()
    if auth_err:
        return auth_err

    cert = None
    try:
        data = request.json
        for field in ("chave_acesso", "pfx_base64", "password", "uf", "ambiente"):
            if not data.get(field):
                return jsonify({"error": f"Campo obrigatório ausente: {field}"}), 400

        cert = parse_cert_from_request(data)
        tp_amb = get_tp_amb(data["ambiente"])
        consulta_xml = build_consulta_xml(data["chave_acesso"], tp_amb, "cte")
        url = get_sefaz_url(data["uf"], data["ambiente"], "cteConsulta")

        soap_body = send_to_sefaz(
            url, consulta_xml, cert,
            soap_action="http://www.portalfiscal.inf.br/cte/wsdl/CTeConsultaSinc/cteConsultaCT",
            timeout=data.get("timeout", DEFAULT_TIMEOUT),
        )

        result = extract_sefaz_response(soap_body, "cte")
        result["sefaz_url"] = url
        return jsonify(result), 200

    except Exception as e:
        logger.error(f"[CTE CONSULT] Error: {str(e)}")
        return jsonify({"error": str(e), "success": False}), 500
    finally:
        if cert:
            cert.cleanup()


@app.route("/cte/cancel", methods=["POST"])
def cte_cancel():
    """Cancelar CT-e na SEFAZ."""
    auth_err = check_auth()
    if auth_err:
        return auth_err

    cert = None
    try:
        data = request.json
        for field in ("chave_acesso", "protocolo", "justificativa", "cnpj",
                       "pfx_base64", "password", "uf", "ambiente"):
            if not data.get(field):
                return jsonify({"error": f"Campo obrigatório ausente: {field}"}), 400

        if len(data["justificativa"]) < 15:
            return jsonify({"error": "Justificativa deve ter no mínimo 15 caracteres"}), 400

        cert = parse_cert_from_request(data)
        tp_amb = get_tp_amb(data["ambiente"])
        seq = data.get("seq", 1)

        event_xml = build_cancel_event_xml(
            data["chave_acesso"], data["protocolo"], data["justificativa"],
            tp_amb, data["cnpj"], "cte", seq,
        )

        # Assinar o evento
        sign_result = sign_xml(event_xml, cert, "cte", f"ID110111{data['chave_acesso']}{seq:02d}")

        url = get_sefaz_url(data["uf"], data["ambiente"], "cteEvento")
        soap_body = send_to_sefaz(
            url, sign_result["signed_xml"], cert,
            soap_action="http://www.portalfiscal.inf.br/cte/wsdl/CTeRecepcaoEvento/cteRecepcaoEvento",
            timeout=data.get("timeout", DEFAULT_TIMEOUT),
        )

        result = extract_sefaz_response(soap_body, "cte")
        result["sefaz_url"] = url
        return jsonify(result), 200

    except Exception as e:
        logger.error(f"[CTE CANCEL] Error: {str(e)}")
        return jsonify({"error": str(e), "success": False}), 500
    finally:
        if cert:
            cert.cleanup()


@app.route("/cte/cce", methods=["POST"])
def cte_cce():
    """Carta de Correção Eletrônica (CC-e) para CT-e."""
    auth_err = check_auth()
    if auth_err:
        return auth_err

    cert = None
    try:
        data = request.json
        for field in ("chave_acesso", "correcoes", "cnpj",
                       "pfx_base64", "password", "uf", "ambiente"):
            if not data.get(field):
                return jsonify({"error": f"Campo obrigatório ausente: {field}"}), 400

        cert = parse_cert_from_request(data)
        tp_amb = get_tp_amb(data["ambiente"])
        seq = data.get("seq", 1)

        # correcoes: string XML com tags <infCorrecao>
        event_xml = build_cce_event_xml(
            data["chave_acesso"], data["correcoes"], tp_amb, data["cnpj"], seq,
        )

        # Assinar o evento
        sign_result = sign_xml(event_xml, cert, "cte", f"ID110110{data['chave_acesso']}{seq:02d}")

        url = get_sefaz_url(data["uf"], data["ambiente"], "cteEvento")
        soap_body = send_to_sefaz(
            url, sign_result["signed_xml"], cert,
            soap_action="http://www.portalfiscal.inf.br/cte/wsdl/CTeRecepcaoEvento/cteRecepcaoEvento",
            timeout=data.get("timeout", DEFAULT_TIMEOUT),
        )

        result = extract_sefaz_response(soap_body, "cte")
        result["sefaz_url"] = url
        return jsonify(result), 200

    except Exception as e:
        logger.error(f"[CTE CCe] Error: {str(e)}")
        return jsonify({"error": str(e), "success": False}), 500
    finally:
        if cert:
            cert.cleanup()


@app.route("/mdfe/emit", methods=["POST"])
def mdfe_emit():
    """Assinar MDF-e + enviar para SEFAZ via SOAP/mTLS."""
    auth_err = check_auth()
    if auth_err:
        return auth_err

    cert = None
    try:
        data = request.json
        for field in ("xml", "pfx_base64", "password", "uf", "ambiente"):
            if not data.get(field):
                return jsonify({"error": f"Campo obrigatório ausente: {field}"}), 400

        cert = parse_cert_from_request(data)
        doc_id = data.get("document_id", "MDFe_unknown")

        # 1. Assinar
        sign_result = sign_xml(data["xml"], cert, "mdfe", doc_id)

        # 2. Resolver endpoint (MDF-e usa recepção síncrona)
        url = get_sefaz_url(data["uf"], data["ambiente"], "mdfeAutorizacao")

        # 3. Enviar via mTLS
        soap_body = send_to_sefaz(
            url, sign_result["signed_xml"], cert,
            soap_action="http://www.portalfiscal.inf.br/mdfe/wsdl/MDFeRecepcaoSinc/mdfeRecepcao",
            timeout=data.get("timeout", DEFAULT_TIMEOUT),
        )

        result = extract_sefaz_response(soap_body, "mdfe")
        result["signed_xml"] = sign_result["signed_xml"]
        result["digest_value"] = sign_result["digest_value"]
        result["signature_value"] = sign_result["signature_value"]
        result["sefaz_url"] = url
        result["ambiente"] = data["ambiente"]

        return jsonify(result), 200

    except Exception as e:
        logger.error(f"[MDFE EMIT] Error: {str(e)}")
        return jsonify({"error": str(e), "success": False}), 500
    finally:
        if cert:
            cert.cleanup()


@app.route("/mdfe/consult", methods=["POST"])
def mdfe_consult():
    """Consultar MDF-e na SEFAZ."""
    auth_err = check_auth()
    if auth_err:
        return auth_err

    cert = None
    try:
        data = request.json
        for field in ("chave_acesso", "pfx_base64", "password", "uf", "ambiente"):
            if not data.get(field):
                return jsonify({"error": f"Campo obrigatório ausente: {field}"}), 400

        cert = parse_cert_from_request(data)
        tp_amb = get_tp_amb(data["ambiente"])
        consulta_xml = build_consulta_xml(data["chave_acesso"], tp_amb, "mdfe")
        url = get_sefaz_url(data["uf"], data["ambiente"], "mdfeConsulta")

        soap_body = send_to_sefaz(
            url, consulta_xml, cert,
            soap_action="http://www.portalfiscal.inf.br/mdfe/wsdl/MDFeConsulta/mdfeConsultaMDF",
            timeout=data.get("timeout", DEFAULT_TIMEOUT),
        )

        result = extract_sefaz_response(soap_body, "mdfe")
        result["sefaz_url"] = url
        return jsonify(result), 200

    except Exception as e:
        logger.error(f"[MDFE CONSULT] Error: {str(e)}")
        return jsonify({"error": str(e), "success": False}), 500
    finally:
        if cert:
            cert.cleanup()


@app.route("/mdfe/cancel", methods=["POST"])
def mdfe_cancel():
    """Cancelar MDF-e na SEFAZ."""
    auth_err = check_auth()
    if auth_err:
        return auth_err

    cert = None
    try:
        data = request.json
        for field in ("chave_acesso", "protocolo", "justificativa", "cnpj",
                       "pfx_base64", "password", "uf", "ambiente"):
            if not data.get(field):
                return jsonify({"error": f"Campo obrigatório ausente: {field}"}), 400

        cert = parse_cert_from_request(data)
        tp_amb = get_tp_amb(data["ambiente"])

        event_xml = build_cancel_event_xml(
            data["chave_acesso"], data["protocolo"], data["justificativa"],
            tp_amb, data["cnpj"], "mdfe",
        )

        sign_result = sign_xml(event_xml, cert, "mdfe", f"ID110111{data['chave_acesso']}01")

        url = get_sefaz_url(data["uf"], data["ambiente"], "mdfeEvento")
        soap_body = send_to_sefaz(
            url, sign_result["signed_xml"], cert,
            soap_action="http://www.portalfiscal.inf.br/mdfe/wsdl/MDFeRecepcaoEvento/mdfeRecepcaoEvento",
            timeout=data.get("timeout", DEFAULT_TIMEOUT),
        )

        result = extract_sefaz_response(soap_body, "mdfe")
        result["sefaz_url"] = url
        return jsonify(result), 200

    except Exception as e:
        logger.error(f"[MDFE CANCEL] Error: {str(e)}")
        return jsonify({"error": str(e), "success": False}), 500
    finally:
        if cert:
            cert.cleanup()


@app.route("/mdfe/close", methods=["POST"])
def mdfe_close():
    """Encerrar MDF-e na SEFAZ."""
    auth_err = check_auth()
    if auth_err:
        return auth_err

    cert = None
    try:
        data = request.json
        for field in ("chave_acesso", "protocolo", "cnpj", "codigo_municipio",
                       "pfx_base64", "password", "uf", "ambiente"):
            if not data.get(field):
                return jsonify({"error": f"Campo obrigatório ausente: {field}"}), 400

        cert = parse_cert_from_request(data)
        tp_amb = get_tp_amb(data["ambiente"])
        dt = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S-03:00")
        cuf = data["chave_acesso"][:2]

        event_xml = f"""<eventoMDFe xmlns="http://www.portalfiscal.inf.br/mdfe" versao="3.00">
  <infEvento Id="ID110112{data['chave_acesso']}01">
    <cOrgao>{cuf}</cOrgao>
    <tpAmb>{tp_amb}</tpAmb>
    <CNPJ>{data['cnpj']}</CNPJ>
    <chMDFe>{data['chave_acesso']}</chMDFe>
    <dhEvento>{dt}</dhEvento>
    <tpEvento>110112</tpEvento>
    <nSeqEvento>1</nSeqEvento>
    <detEvento versaoEvento="3.00">
      <evEncMDFe>
        <descEvento>Encerramento</descEvento>
        <nProt>{data['protocolo']}</nProt>
        <dtEnc>{dt[:10]}</dtEnc>
        <cUF>{cuf}</cUF>
        <cMun>{data['codigo_municipio']}</cMun>
      </evEncMDFe>
    </detEvento>
  </infEvento>
</eventoMDFe>"""

        sign_result = sign_xml(event_xml, cert, "mdfe", f"ID110112{data['chave_acesso']}01")

        url = get_sefaz_url(data["uf"], data["ambiente"], "mdfeEvento")
        soap_body = send_to_sefaz(
            url, sign_result["signed_xml"], cert,
            soap_action="http://www.portalfiscal.inf.br/mdfe/wsdl/MDFeRecepcaoEvento/mdfeRecepcaoEvento",
            timeout=data.get("timeout", DEFAULT_TIMEOUT),
        )

        result = extract_sefaz_response(soap_body, "mdfe")
        result["sefaz_url"] = url
        return jsonify(result), 200

    except Exception as e:
        logger.error(f"[MDFE CLOSE] Error: {str(e)}")
        return jsonify({"error": str(e), "success": False}), 500
    finally:
        if cert:
            cert.cleanup()


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8080, debug=False)
