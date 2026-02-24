FROM python:3.12-slim

WORKDIR /app

# Instalar dependências de sistema para lxml e SSL
RUN apt-get update && apt-get install -y --no-install-recommends \
    libxml2-dev libxslt1-dev libssl-dev ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Criar tmpfs para certificados temporários
RUN mkdir -p /tmp/certs && chmod 700 /tmp/certs

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py .

# Apenas porta 8080 interna — proxy reverso expõe 80/443
EXPOSE 8080

# Variáveis de ambiente padrão
ENV TMPDIR=/tmp/certs
ENV SEFAZ_TIMEOUT=30

CMD ["gunicorn", "--bind", "0.0.0.0:8080", "--workers", "2", "--timeout", "60", "app:app"]
