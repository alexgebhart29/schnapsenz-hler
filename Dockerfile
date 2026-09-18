# syntax=docker/dockerfile:1

# ---------- App (PWA) bauen ----------
FROM node:24-alpine AS client

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig*.json vite.config.ts index.html ./
COPY public ./public
COPY src ./src
RUN npm run build

# ---------- Server bauen ----------
FROM node:24-alpine AS server

WORKDIR /srv
COPY server/package.json server/package-lock.json ./
RUN npm ci

COPY server/tsconfig.json ./
COPY server/src ./src
RUN npm run build

# ---------- Laufzeit ----------
FROM node:24-alpine AS runtime

ENV NODE_ENV=production \
    PORT=8080 \
    DATA_DIR=/data \
    STATIC_DIR=/srv/static

WORKDIR /srv

# Nur Produktionsabhängigkeiten (SQLite steckt in Node selbst).
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=server /srv/dist ./dist
COPY --from=client /app/dist ./static

RUN mkdir -p /data && chown -R node:node /data /srv

USER node
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget --quiet --spider http://127.0.0.1:8080/api/status || exit 1

CMD ["node", "dist/index.js"]
