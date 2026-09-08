# ---- Compilación ----------------------------------------------------------
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY server/package.json ./server/
COPY web/package.json ./web/
RUN npm ci --workspace=web --include-workspace-root

COPY web ./web
RUN npm run build --workspace=web

# ---- Servidor estático ----------------------------------------------------
FROM nginx:1.27-alpine
COPY --from=build /app/web/dist /usr/share/nginx/html
COPY web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
