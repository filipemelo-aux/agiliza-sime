FROM python:3.12-slim

WORKDIR /app

# Instalar dependências de sistema para lxml e SSL
RUN apt-get update && apt-get install -y --no-install-recommends \
    libxml2-dev libxslt1-dev libssl-dev ca-certificates curl wget \
    && rm -rf /var/lib/apt/lists/*

# Baixar e instalar certificados raiz ICP-Brasil (necessários para SEFAZ)
RUN mkdir -p /usr/local/share/ca-certificates/icp-brasil && \
    wget -q -O /tmp/ACcompactado.zip "https://acraiz.icpbrasil.gov.br/credenciadas/CertificadosAC-ICP-Brasil/ACcompactado.zip" && \
    apt-get update && apt-get install -y --no-install-recommends unzip openssl && \
    cd /tmp && unzip -o ACcompactado.zip -d /tmp/icp-brasil && \
    cert_count=$(find /tmp/icp-brasil/ -type f \( -iname "*.crt" -o -iname "*.pem" -o -iname "*.cer" \) | wc -l) && \
    [ "$cert_count" -gt 0 ] && \
    find /tmp/icp-brasil/ -type f \( -iname "*.crt" -o -iname "*.pem" -o -iname "*.cer" \) -print0 | \
    while IFS= read -r -d '' cert; do \
      target="/usr/local/share/ca-certificates/icp-brasil/$(basename "${cert%.*}").crt"; \
      if grep -q "BEGIN CERTIFICATE" "$cert" 2>/dev/null; then \
        cp "$cert" "$target"; \
      else \
        openssl x509 -inform DER -in "$cert" -out "$target"; \
      fi; \
    done && \
    update-ca-certificates && \
    rm -rf /tmp/ACcompactado.zip /tmp/icp-brasil/ && \
    apt-get purge -y unzip openssl && apt-get autoremove -y && \
    rm -rf /var/lib/apt/lists/*

# Criar tmpfs para certificados temporários
RUN mkdir -p /tmp/certs && chmod 700 /tmp/certs

# Diretório para schemas XSD (montar volume ou copiar na build)
RUN mkdir -p /app/xsd

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py .

# Copiar schemas XSD se existirem
COPY xsd/ /app/xsd/ 2>/dev/null || true

# Apenas porta 8080 interna — proxy reverso expõe 80/443
EXPOSE 8080

# Variáveis de ambiente padrão
ENV TMPDIR=/tmp/certs
ENV SEFAZ_TIMEOUT=30
ENV XSD_DIR=/app/xsd
ENV REQUESTS_CA_BUNDLE=/etc/ssl/certs/ca-certificates.crt

CMD ["gunicorn", "--bind", "0.0.0.0:8080", "--workers", "2", "--timeout", "60", "app:app"]
