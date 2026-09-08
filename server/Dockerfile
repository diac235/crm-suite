# ---- Compilación ----------------------------------------------------------
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY server/package.json ./server/
COPY web/package.json ./web/
RUN npm ci --workspace=server --include-workspace-root

COPY server ./server
RUN npm run build --workspace=server

# ---- Ejecución ------------------------------------------------------------
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY server/package.json ./server/
RUN npm ci --omit=dev --workspace=server --include-workspace-root && npm cache clean --force

COPY --from=build /app/server/dist ./server/dist
COPY server/drizzle ./server/drizzle

RUN addgroup -S crm && adduser -S crm -G crm && mkdir -p /data/uploads && chown -R crm:crm /data
USER crm

WORKDIR /app/server
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s   CMD node -e "fetch('http://127.0.0.1:4000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/index.js"]
