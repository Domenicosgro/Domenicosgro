# ── Stage 1: Frontend bauen ───────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

# Build-Tools für better-sqlite3 (native Modul)
RUN apk add --no-cache python3 make g++

COPY package*.json .npmrc ./
RUN npm ci

COPY . .
# WASM-Datei für den IFC-Viewer im Build zugänglich machen
RUN cp node_modules/web-ifc/web-ifc.wasm public/web-ifc.wasm
RUN npm run build


# ── Stage 2: Produktions-Image ────────────────────────────────────────────────
FROM node:20-alpine
WORKDIR /app

LABEL org.opencontainers.image.title="Komplizen Protokolle" \
      org.opencontainers.image.description="Besprechungsprotokoll-Tool für Bauprojekte" \
      org.opencontainers.image.source="https://github.com/domenicosgro/domenicosgro"

# Build-Tools zum Kompilieren von better-sqlite3
RUN apk add --no-cache python3 make g++

# Nur Server-Abhängigkeiten installieren (kein Electron, keine Dev-Tools)
COPY server/package.json ./package.json
RUN npm install --omit=dev && \
    apk del python3 make g++ && \
    rm -rf /root/.npm /tmp/npm-*

COPY server/ ./server/
COPY --from=builder /app/dist ./dist/

# Datenhaltungsverzeichnisse
RUN mkdir -p /data /logs

EXPOSE 3000

ENV PORT=3000
ENV HOST=0.0.0.0
ENV DB_PATH=/data
ENV LOG_PATH=/logs

VOLUME ["/data", "/logs"]

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

CMD ["node", "server/index.js"]
