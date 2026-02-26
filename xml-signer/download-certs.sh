#!/bin/bash
# =============================================================================
# Script para baixar certificados ICP-Brasil (Raiz, SERPRO, ITI, ACs)
# necessários para comunicação mTLS com SEFAZ
#
# Uso: chmod +x download-certs.sh && ./download-certs.sh
# Os certificados serão salvos em ./certs/
# =============================================================================

set -e

CERT_DIR="$(dirname "$0")/certs"
mkdir -p "$CERT_DIR"

echo "📥 Baixando certificados ICP-Brasil para $CERT_DIR ..."

# ── 1. Cadeia completa ICP-Brasil (ZIP oficial do ITI) ──────────────
echo ""
echo "=== Cadeia Completa ICP-Brasil (ITI) ==="
ZIP_URL="https://acraiz.icpbrasil.gov.br/credenciadas/CertificadosAC-ICP-Brasil/ACcompactado.zip"
ZIP_FILE="/tmp/ACcompactado.zip"
EXTRACT_DIR="/tmp/icp-brasil-extract"

echo "  Baixando $ZIP_URL ..."
curl -sL -o "$ZIP_FILE" "$ZIP_URL" || wget -q -O "$ZIP_FILE" "$ZIP_URL"

rm -rf "$EXTRACT_DIR"
mkdir -p "$EXTRACT_DIR"
unzip -o -q "$ZIP_FILE" -d "$EXTRACT_DIR"

# Converter todos os certificados para PEM
cert_count=0
find "$EXTRACT_DIR" -type f \( -iname "*.crt" -o -iname "*.pem" -o -iname "*.cer" \) | while read cert; do
  basename_noext=$(basename "${cert%.*}")
  target="$CERT_DIR/${basename_noext}.crt"
  
  if grep -q "BEGIN CERTIFICATE" "$cert" 2>/dev/null; then
    cp "$cert" "$target"
  else
    # Tentar converter de DER para PEM
    openssl x509 -inform DER -in "$cert" -out "$target" 2>/dev/null || \
    openssl x509 -inform PEM -in "$cert" -out "$target" 2>/dev/null || \
    echo "  ⚠ Não foi possível converter: $cert"
  fi
done

echo "  ✅ Certificados ICP-Brasil extraídos"

# ── 2. Certificados Raiz ICP-Brasil (download direto) ───────────────
echo ""
echo "=== Certificados Raiz ICP-Brasil ==="

# AC Raiz v10 (vigente)
echo "  Baixando AC Raiz ICP-Brasil v10..."
curl -sL "https://acraiz.icpbrasil.gov.br/credenciadas/RAIZ/ICP-Brasilv10.crt" -o "/tmp/icpbrasil-v10.crt"
openssl x509 -inform DER -in "/tmp/icpbrasil-v10.crt" -out "$CERT_DIR/ICP-Brasil-v10.crt" 2>/dev/null || \
cp "/tmp/icpbrasil-v10.crt" "$CERT_DIR/ICP-Brasil-v10.crt"

# AC Raiz v5
echo "  Baixando AC Raiz ICP-Brasil v5..."
curl -sL "https://acraiz.icpbrasil.gov.br/credenciadas/RAIZ/ICP-Brasilv5.crt" -o "/tmp/icpbrasil-v5.crt"
openssl x509 -inform DER -in "/tmp/icpbrasil-v5.crt" -out "$CERT_DIR/ICP-Brasil-v5.crt" 2>/dev/null || \
cp "/tmp/icpbrasil-v5.crt" "$CERT_DIR/ICP-Brasil-v5.crt"

# AC Raiz v2
echo "  Baixando AC Raiz ICP-Brasil v2..."
curl -sL "https://acraiz.icpbrasil.gov.br/credenciadas/RAIZ/ICP-Brasilv2.crt" -o "/tmp/icpbrasil-v2.crt"
openssl x509 -inform DER -in "/tmp/icpbrasil-v2.crt" -out "$CERT_DIR/ICP-Brasil-v2.crt" 2>/dev/null || \
cp "/tmp/icpbrasil-v2.crt" "$CERT_DIR/ICP-Brasil-v2.crt"

echo "  ✅ Raízes v2, v5, v10"

# ── 3. AC SERPRO ─────────────────────────────────────────────────────
echo ""
echo "=== Certificados SERPRO ==="

# SERPRO RFB v4
echo "  Baixando AC SERPRO RFB v4..."
curl -sL "https://acraiz.icpbrasil.gov.br/credenciadas/SERPRO/v4/p/AC_SERPRO_RFB_v4.crt" -o "/tmp/serpro-rfb-v4.crt"
openssl x509 -inform DER -in "/tmp/serpro-rfb-v4.crt" -out "$CERT_DIR/AC-SERPRO-RFB-v4.crt" 2>/dev/null || \
cp "/tmp/serpro-rfb-v4.crt" "$CERT_DIR/AC-SERPRO-RFB-v4.crt"

# SERPRO Final v6
echo "  Baixando AC SERPRO Final v6..."
curl -sL "https://acraiz.icpbrasil.gov.br/credenciadas/SERPRO/v6/p/AC_SERPRO_SSLv1.crt" -o "/tmp/serpro-ssl-v1.crt"
openssl x509 -inform DER -in "/tmp/serpro-ssl-v1.crt" -out "$CERT_DIR/AC-SERPRO-SSL-v1.crt" 2>/dev/null || \
cp "/tmp/serpro-ssl-v1.crt" "$CERT_DIR/AC-SERPRO-SSL-v1.crt"

echo "  ✅ SERPRO RFB v4, SSL v1"

# ── 4. Limpar temporários ───────────────────────────────────────────
rm -rf "$ZIP_FILE" "$EXTRACT_DIR" /tmp/icpbrasil-*.crt /tmp/serpro-*.crt

# ── 5. Resumo ────────────────────────────────────────────────────────
echo ""
TOTAL=$(find "$CERT_DIR" -name "*.crt" | wc -l)
echo "============================================"
echo "✅ Total: $TOTAL certificados em $CERT_DIR"
echo "============================================"
echo ""
echo "Agora faça o rebuild do Docker:"
echo "  docker build --no-cache -t fiscal-service ./xml-signer"
echo ""
