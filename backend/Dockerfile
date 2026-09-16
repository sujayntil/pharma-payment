FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
RUN mkdir -p uploads

EXPOSE 8000

# Render (and most PaaS platforms) inject a $PORT env var and expect the
# process to listen on it; docker-compose doesn't set one, so this falls
# back to 8000 for local dev, matching the "8000:8000" mapping there.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
