# Shared image for both the flower-server and institution-node containers —
# docker-compose picks the entrypoint via `command:`.
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# server.py exposes both the gRPC port (8080) and the dashboard API (8000);
# client.py doesn't listen on anything, it only dials out to the server.
EXPOSE 8080 8000
