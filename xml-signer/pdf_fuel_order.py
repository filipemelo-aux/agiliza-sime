"""
Geração e assinatura digital de Ordem de Abastecimento em PDF.

Usa reportlab para gerar o PDF e pyHanko para assinar com certificado A1 ICP-Brasil.
"""

import io
import base64
import logging
from datetime import datetime

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor, white
from reportlab.pdfgen import canvas as pdf_canvas

logger = logging.getLogger(__name__)

# ── Cores do tema SIME ──────────────────────────────────────────

BRAND_BLUE = HexColor("#2B4C7E")
BRAND_GOLD = HexColor("#F5C518")
LIGHT_BG = HexColor("#f0f4f8")
BORDER_CLR = HexColor("#e8ecf0")
TEXT_DARK = HexColor("#333333")
TEXT_LIGHT = HexColor("#666666")
TEXT_MUTED = HexColor("#888888")
GOLD_BG = HexColor("#FFF8E1")
GOLD_TEXT = HexColor("#D4930A")

FUEL_LABELS = {
    "gasolina": "Gasolina",
    "diesel": "Diesel",
    "diesel_s10": "Diesel S10",
}


# ── Helpers de desenho ──────────────────────────────────────────

def _section_title(c, x, y, w, title):
    """Desenha título de seção com sublinhado."""
    c.setFont("Helvetica-Bold", 10)
    c.setFillColor(BRAND_BLUE)
    c.drawString(x + 5 * mm, y - 7 * mm, title.upper())
    c.setStrokeColor(BORDER_CLR)
    c.setLineWidth(1.5)
    c.line(x + 5 * mm, y - 9 * mm, x + w - 5 * mm, y - 9 * mm)


def _info_row(c, x, w, y, label, value, bold=False):
    """Desenha uma linha label: value."""
    c.setFont("Helvetica", 8)
    c.setFillColor(TEXT_LIGHT)
    c.drawString(x + 5 * mm, y, label)
    c.setFont("Helvetica-Bold" if bold else "Helvetica", 9)
    c.setFillColor(TEXT_DARK)
    # Truncar valor se muito longo
    max_w = w - 15 * mm
    while c.stringWidth(str(value), c._fontname, c._fontsize) > max_w and len(str(value)) > 3:
        value = str(value)[:-1]
    c.drawRightString(x + w - 5 * mm, y, str(value))


def _draw_section(c, margin_left, content_width, y, title, rows):
    """Desenha seção com título e linhas key-value. Retorna novo y."""
    row_height = 7.5 * mm
    section_h = 12 * mm + len(rows) * row_height
    
    c.setFillColor(white)
    c.setStrokeColor(BORDER_CLR)
    c.setLineWidth(0.5)
    c.roundRect(margin_left, y - section_h, content_width, section_h, 3 * mm, fill=1, stroke=1)
    
    _section_title(c, margin_left, y, content_width, title)
    
    row_y = y - 15 * mm
    for i, (label, value) in enumerate(rows):
        _info_row(c, margin_left, content_width, row_y, label, value, bold=(i == len(rows) - 1))
        if i < len(rows) - 1:
            c.setStrokeColor(HexColor("#f0f2f5"))
            c.setLineWidth(0.3)
            c.line(margin_left + 5 * mm, row_y - 2.5 * mm, margin_left + content_width - 5 * mm, row_y - 2.5 * mm)
        row_y -= row_height
    
    return y - section_h - 4 * mm


# ── Geração do PDF ──────────────────────────────────────────────

def generate_fuel_order_pdf(order: dict) -> tuple[bytes, tuple]:
    """
    Gera PDF da Ordem de Abastecimento.
    
    Retorna (pdf_bytes, sig_box) onde sig_box é (x1, y1, x2, y2)
    com as coordenadas do campo de assinatura do Solicitante.
    """
    buf = io.BytesIO()
    width, height = A4
    c = pdf_canvas.Canvas(buf, pagesize=A4)
    
    ml = 20 * mm  # margin left
    mr = width - 20 * mm
    cw = mr - ml  # content width
    y = height - 15 * mm
    
    # ── HEADER ──
    hdr_h = 20 * mm
    c.setStrokeColor(BRAND_BLUE)
    c.setLineWidth(3)
    c.line(ml, y, ml, y - hdr_h)
    c.setFillColor(white)
    c.setStrokeColor(BORDER_CLR)
    c.setLineWidth(0.5)
    c.roundRect(ml, y - hdr_h, cw, hdr_h, 3 * mm, fill=1, stroke=1)
    
    # Brand
    c.setFont("Helvetica-Bold", 16)
    c.setFillColor(BRAND_BLUE)
    c.drawString(ml + 6 * mm, y - 9 * mm, "SIME")
    sime_w = c.stringWidth("SIME ", "Helvetica-Bold", 16)
    c.setFillColor(BRAND_GOLD)
    c.drawString(ml + 6 * mm + sime_w, y - 9 * mm, "TRANSPORTES")
    
    razao = order.get("razao_social", "")
    cnpj = order.get("cnpj", "")
    c.setFont("Helvetica", 7)
    c.setFillColor(TEXT_LIGHT)
    c.drawString(ml + 6 * mm, y - 14 * mm, razao)
    c.drawString(ml + 6 * mm, y - 18 * mm, f"CNPJ: {cnpj}")
    
    y -= hdr_h + 4 * mm
    
    # ── DIVIDER ──
    c.setStrokeColor(BRAND_BLUE)
    c.setLineWidth(2.5)
    c.line(ml, y, mr, y)
    y -= 7 * mm
    
    # ── TITLE ──
    order_num = order.get("order_number", "")
    title = f"ORDEM DE ABASTECIMENTO Nº {order_num}"
    c.setFont("Helvetica-Bold", 14)
    c.setFillColor(BRAND_BLUE)
    tw = c.stringWidth(title, "Helvetica-Bold", 14)
    c.drawString(ml + (cw - tw) / 2, y, title)
    y -= 10 * mm
    
    # ── META BOXES ──
    box_w = (cw - 4 * mm) / 2
    box_h = 15 * mm
    created_at = order.get("created_at", "")
    status = order.get("status", "pendente").upper()
    
    for i, (label, value) in enumerate([("Data de Emissão", created_at), ("Status", status)]):
        bx = ml + i * (box_w + 4 * mm)
        c.setFillColor(LIGHT_BG)
        c.roundRect(bx, y - box_h, box_w, box_h, 3 * mm, fill=1, stroke=0)
        c.setStrokeColor(BORDER_CLR)
        c.setLineWidth(0.5)
        c.roundRect(bx, y - box_h, box_w, box_h, 3 * mm, fill=0, stroke=1)
        
        c.setFont("Helvetica-Bold", 7)
        c.setFillColor(TEXT_MUTED)
        c.drawString(bx + 4 * mm, y - 5 * mm, label.upper())
        
        c.setFont("Helvetica-Bold", 11)
        c.setFillColor(BRAND_BLUE)
        c.drawString(bx + 4 * mm, y - 12 * mm, value)
    
    y -= box_h + 6 * mm
    
    # ── SOLICITANTE ──
    est_type = order.get("establishment_type", "matriz")
    est_label = "Matriz" if est_type == "matriz" else "Filial"
    requester = order.get("requester_name", "Usuário")
    
    y = _draw_section(c, ml, cw, y, "Solicitante", [
        ("Empresa", f"{razao} ({est_label})"),
        ("Solicitante", requester),
    ])
    
    # ── FORNECEDOR ──
    y = _draw_section(c, ml, cw, y, "Fornecedor", [
        ("Nome / Razão Social", order.get("supplier_name", "")),
    ])
    
    # ── DADOS DO ABASTECIMENTO ──
    vehicle_plate = order.get("vehicle_plate", "")
    fuel_type = FUEL_LABELS.get(order.get("fuel_type", ""), order.get("fuel_type", ""))
    fill_mode = order.get("fill_mode", "completar")
    liters = order.get("liters")
    qty = "Completar Tanque" if fill_mode == "completar" else f"{liters} Litros"
    
    fuel_rows_h = 12 * mm + 2 * 7.5 * mm + 14 * mm
    c.setFillColor(white)
    c.setStrokeColor(BORDER_CLR)
    c.setLineWidth(0.5)
    c.roundRect(ml, y - fuel_rows_h, cw, fuel_rows_h, 3 * mm, fill=1, stroke=1)
    
    _section_title(c, ml, y, cw, "Dados do Abastecimento")
    
    row_y = y - 15 * mm
    for label, value in [("Veículo (Placa)", vehicle_plate), ("Tipo de Combustível", fuel_type)]:
        _info_row(c, ml, cw, row_y, label, value)
        row_y -= 7.5 * mm
    
    # Destaque de quantidade
    qty_h = 10 * mm
    c.setFillColor(GOLD_BG)
    c.roundRect(ml + 4 * mm, row_y - qty_h + 4 * mm, cw - 8 * mm, qty_h, 2 * mm, fill=1, stroke=0)
    c.setFont("Helvetica-Bold", 8)
    c.setFillColor(TEXT_LIGHT)
    c.drawString(ml + 8 * mm, row_y - 2 * mm, "Quantidade")
    c.setFont("Helvetica-Bold", 12)
    c.setFillColor(GOLD_TEXT)
    c.drawRightString(mr - 8 * mm, row_y - 2 * mm, qty)
    
    y -= fuel_rows_h + 4 * mm
    
    # ── OBSERVAÇÕES ──
    notes = order.get("notes", "")
    if notes:
        y = _draw_section(c, ml, cw, y, "Observações", [
            ("", notes[:120]),
        ])
    
    # ── ASSINATURAS ──
    y -= 20 * mm
    sig_w = cw / 3 - 4 * mm
    sig_labels = ["Solicitante", "Fornecedor", "Motorista"]
    
    sig_box = None
    for i, sig_label in enumerate(sig_labels):
        sx = ml + i * (sig_w + 6 * mm)
        c.setStrokeColor(TEXT_LIGHT)
        c.setLineWidth(0.5)
        c.line(sx, y, sx + sig_w, y)
        c.setFont("Helvetica", 8)
        c.setFillColor(TEXT_LIGHT)
        lw = c.stringWidth(sig_label, "Helvetica", 8)
        c.drawString(sx + (sig_w - lw) / 2, y - 5 * mm, sig_label)
        
        # Guardar coordenadas do campo Solicitante para assinatura digital
        if i == 0:
            sig_box = (sx, y - 6 * mm, sx + sig_w, y + 18 * mm)
    
    y -= 18 * mm
    
    # ── FOOTER ──
    footer_h = 12 * mm
    c.setFillColor(BRAND_BLUE)
    c.roundRect(ml, y - footer_h, cw, footer_h, 3 * mm, fill=1, stroke=0)
    now_str = datetime.now().strftime("%d/%m/%Y %H:%M")
    c.setFont("Helvetica", 7)
    c.setFillColor(white)
    ft1 = f"SIME TRANSPORTES — {razao} — CNPJ: {cnpj}"
    ft2 = f"Documento gerado em {now_str}"
    c.drawCentredString(ml + cw / 2, y - 5 * mm, ft1)
    c.drawCentredString(ml + cw / 2, y - 9 * mm, ft2)
    
    c.save()
    pdf_bytes = buf.getvalue()
    buf.close()
    
    return pdf_bytes, sig_box


# ── Assinatura digital do PDF ───────────────────────────────────

def sign_fuel_order_pdf(
    pdf_bytes: bytes,
    pfx_bytes: bytes,
    password: str,
    signer_name: str = "",
    sig_box: tuple = None,
) -> bytes:
    """
    Assina PDF com certificado A1 ICP-Brasil usando pyHanko.
    
    Args:
        pdf_bytes: PDF não assinado
        pfx_bytes: Bytes do arquivo PFX/P12
        password: Senha do certificado
        signer_name: Nome do assinante (exibido na assinatura visível)
        sig_box: (x1, y1, x2, y2) coordenadas do campo de assinatura
    
    Returns:
        Bytes do PDF assinado
    """
    from pyhanko.sign import signers as pyhanko_signers
    from pyhanko.sign.fields import SigFieldSpec
    from pyhanko.pdf_utils.incremental_writer import IncrementalPdfFileWriter
    
    # Posição padrão se não fornecida
    if not sig_box:
        sig_box = (56, 170, 220, 220)
    
    # Carregar PKCS12
    pfx_io = io.BytesIO(pfx_bytes)
    signer = pyhanko_signers.SimpleSigner.load_pkcs12(
        pfx_file=pfx_io,
        passphrase=password.encode("utf-8") if password else None,
    )
    
    # Abrir PDF para escrita incremental
    pdf_io = io.BytesIO(pdf_bytes)
    w = IncrementalPdfFileWriter(pdf_io)
    
    # Definir campo de assinatura visível
    field_spec = SigFieldSpec(
        sig_field_name="Assinatura_Solicitante",
        on_page=0,
        box=sig_box,
    )
    
    # Metadados da assinatura
    meta = pyhanko_signers.PdfSignatureMetadata(
        field_name="Assinatura_Solicitante",
        md_algorithm="sha256",
        reason="Ordem de Abastecimento — Solicitante",
        name=signer_name or "Solicitante",
        location="SIME Transportes",
    )
    
    # Assinar
    pdf_signer = pyhanko_signers.PdfSigner(
        meta,
        signer=signer,
        new_field_spec=field_spec,
    )
    
    output = io.BytesIO()
    pdf_signer.sign_pdf(w, output=output)
    
    signed_bytes = output.getvalue()
    logger.info(f"[PDF] Assinado: {len(signed_bytes)} bytes, campo em {sig_box}")
    
    return signed_bytes


def generate_and_sign_fuel_order(order: dict, pfx_bytes: bytes, password: str) -> bytes:
    """
    Pipeline completo: gera PDF + assina com certificado A1.
    
    Args:
        order: Dados da ordem (inclui razao_social, cnpj, etc.)
        pfx_bytes: Bytes do arquivo PFX/P12
        password: Senha do certificado
    
    Returns:
        Bytes do PDF assinado
    """
    logger.info(f"[PDF] Gerando ordem #{order.get('order_number', '?')}")
    
    # 1. Gerar PDF
    pdf_bytes, sig_box = generate_fuel_order_pdf(order)
    logger.info(f"[PDF] Gerado: {len(pdf_bytes)} bytes")
    
    # 2. Assinar
    signer_name = order.get("requester_name", "Solicitante")
    signed_pdf = sign_fuel_order_pdf(pdf_bytes, pfx_bytes, password, signer_name, sig_box)
    
    return signed_pdf
