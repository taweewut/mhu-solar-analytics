# Mhu Solar Analytics on a NAS (Synology Container Manager / any Docker host).
#   target "web"    — Caddy serving the built dashboard + the live data folder, behind a secret-link cookie
#   target "poller" — the Python fetchers on a 15-minute loop (SolisCloud, weather, monthly Huawei reports)
# Build context = the repo root:  docker compose -f deploy/nas/docker-compose.yml build

FROM node:20-alpine AS frontend
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json frontend/
RUN cd frontend && npm ci --no-audit --no-fund
COPY frontend frontend
COPY sample_data sample_data
RUN cd frontend && npm run build

FROM caddy:2-alpine AS web
COPY --from=frontend /app/frontend/dist /srv/dist
COPY deploy/nas/Caddyfile /etc/caddy/Caddyfile

FROM python:3.12-slim AS poller
ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 TZ=Asia/Bangkok
RUN apt-get update && apt-get install -y --no-install-recommends tzdata && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY pyproject.toml README.md ./
COPY src src
# The package + what solar_pipeline (Gmail → Huawei report) needs, if it's mounted at /pipeline.
RUN pip install . google-api-python-client google-auth-oauthlib
COPY deploy/nas/poll.sh /app/poll.sh
CMD ["/bin/sh", "/app/poll.sh"]
