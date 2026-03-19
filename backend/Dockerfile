FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# ── Google credentials ─────────────────────────────────────────────────────────
# DO NOT copy credentials into the image.
# Two supported modes at runtime:
#
#   A) JSON key file — mount the file and point the env var at it:
#        docker run \
#          -v ./vertex-key.json:/creds/sa.json:ro \
#          -e GOOGLE_APPLICATION_CREDENTIALS=/creds/sa.json \
#          ...
#
#   B) Inline JSON string — set GCS_CREDENTIALS_JSON in the environment:
#        docker run \
#          -e GCS_CREDENTIALS_JSON="$(cat vertex-key.json)" \
#          ...
#
#   C) Attached service account (Cloud Run / GKE) — no config needed.
#
# GOOGLE_APPLICATION_CREDENTIALS defaults to empty so ADC kicks in on GCP infra.
ENV GOOGLE_APPLICATION_CREDENTIALS=""

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
