FROM python:3.12-slim

WORKDIR /app

# Instalar dependências de sistema para lxml e SSL
RUN apt-get update && apt-get install -y --no-install-recommends \
    libxml2-dev libxslt1-dev libssl-dev ca-certificates curl \
    && update-ca-certificates \
    && rm -rf /var/lib/apt/lists/*

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
