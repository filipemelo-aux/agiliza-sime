FROM python:3.12-slim

WORKDIR /app

# Instalar dependências de sistema para lxml e SSL
RUN apt-get update && apt-get install -y --no-install-recommends \
    libxml2-dev libxslt1-dev libssl-dev ca-certificates curl wget \
    && rm -rf /var/lib/apt/lists/*

# Baixar e instalar certificados raiz ICP-Brasil (necessários para SEFAZ)
RUN mkdir -p /usr/local/share/ca-certificates/icp-brasil && \
    wget -q -O /tmp/ACcompactado.zip "https://acraiz.icpbrasil.gov.br/credenciadas/CertificadosAC-ICP-Brasil/ACcompactado.zip" && \
    apt-get update && apt-get install -y --no-install-recommends unzip && \
    cd /tmp && unzip -o ACcompactado.zip -d /tmp/icp-brasil/ || true && \
    find /tmp/icp-brasil/ -name "*.crt" -exec cp {} /usr/local/share/ca-certificates/icp-brasil/ \; || true && \
    find /tmp/icp-brasil/ -name "*.pem" -exec sh -c 'cp "$1" /usr/local/share/ca-certificates/icp-brasil/$(basename "$1" .pem).crt' _ {} \; || true && \
    update-ca-certificates && \
    rm -rf /tmp/ACcompactado.zip /tmp/icp-brasil/ && \
    apt-get purge -y unzip && apt-get autoremove -y && \
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
