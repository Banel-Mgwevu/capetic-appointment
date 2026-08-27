# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Stage 1: install dependencies and build both workspaces
# ---------------------------------------------------------------------------
FROM node:20-bookworm-slim AS build
WORKDIR /app

# Copy manifests first so dependency installation is cached across code changes.
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci

COPY . .
RUN npm run build \
 && npm prune --omit=dev

# ---------------------------------------------------------------------------
# Stage 2: minimal runtime image
# ---------------------------------------------------------------------------
FROM node:20-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    DATABASE_PATH=/app/data/appointments.db \
    STATIC_DIR=/app/client/dist \
    LOG_LEVEL=info
WORKDIR /app

# Production node_modules (including the compiled better-sqlite3 binary) and build output only.
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/server/package.json ./server/
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/client/dist ./client/dist

# Run as the unprivileged user that ships with the image; the SQLite file lives on a volume.
RUN mkdir -p /app/data && chown -R node:node /app
USER node
VOLUME ["/app/data"]

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/dist/index.js"]
