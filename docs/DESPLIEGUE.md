# Despliegue en producción

## 1. Preparación del servidor

```bash
sudo apt update
sudo apt install -y nodejs npm postgresql-16 nginx
sudo useradd --system --create-home --shell /bin/bash crm
```

## 2. Base de datos

```bash
sudo -u postgres psql <<'SQL'
CREATE ROLE crm_user WITH LOGIN PASSWORD 'CLAVE_FUERTE_AQUI';
CREATE DATABASE crm_db OWNER crm_user;
SQL
```

## 3. Código y variables de entorno

```bash
sudo -u crm git clone <repositorio> /opt/crm
cd /opt/crm
sudo -u crm npm ci
sudo -u crm cp server/.env.example server/.env
```

Edite `/opt/crm/server/.env`:

```ini
NODE_ENV=production
PORT=4000
CORS_ORIGIN=https://crm.suempresa.com
APP_URL=https://crm.suempresa.com
DATABASE_URL=postgresql://crm_user:CLAVE_FUERTE_AQUI@localhost:5432/crm_db
JWT_ACCESS_SECRET=<openssl rand -base64 48>
JWT_REFRESH_SECRET=<openssl rand -base64 48>
BCRYPT_ROUNDS=12
STORAGE_DIR=/var/lib/crm/uploads
MAX_UPLOAD_MB=15
SEED_ADMIN_EMAIL=admin@suempresa.com
SEED_ADMIN_PASSWORD=<contraseña inicial fuerte>
SEED_DEMO_DATA=false
LOG_LEVEL=info
```

```bash
sudo mkdir -p /var/lib/crm/uploads && sudo chown -R crm:crm /var/lib/crm
sudo -u crm npm run build
sudo -u crm npm run db:migrate
sudo -u crm npm run db:seed
```

> `JWT_ACCESS_SECRET` y `JWT_REFRESH_SECRET` deben ser distintos entre sí y tener al menos
> 32 caracteres; el sistema se niega a arrancar si no cumplen ese mínimo.

## 4. Servicio systemd

`/etc/systemd/system/crm-api.service`:

```ini
[Unit]
Description=CRM Suite API
After=network.target postgresql.service

[Service]
Type=simple
User=crm
WorkingDirectory=/opt/crm/server
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production

# Endurecimiento
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/crm

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now crm-api
sudo systemctl status crm-api
```

## 5. Nginx

`/etc/nginx/sites-available/crm`:

```nginx
server {
    listen 80;
    server_name crm.suempresa.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name crm.suempresa.com;

    ssl_certificate     /etc/letsencrypt/live/crm.suempresa.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/crm.suempresa.com/privkey.pem;

    # Interfaz compilada
    root /opt/crm/web/dist;
    index index.html;

    client_max_body_size 20m;

    location /api/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }

    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Enrutamiento del lado del cliente
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/crm /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d crm.suempresa.com
```

## 6. Alternativa con Docker

```bash
cp server/.env.example server/.env   # edite los valores
docker compose up -d --build
docker compose exec api npm run db:migrate:prod
docker compose exec api npm run db:seed:prod
```

## 7. Actualizaciones

```bash
cd /opt/crm
sudo -u crm git pull
sudo -u crm npm ci
sudo -u crm npm run build
sudo -u crm npm run db:migrate
sudo systemctl restart crm-api
```

Tome siempre un respaldo antes de actualizar (`docs/BACKUP.md`).

## 8. Verificación posterior al despliegue

```bash
curl -s https://crm.suempresa.com/api/health
sudo journalctl -u crm-api -n 50 --no-pager
```

Y en la interfaz: iniciar sesión, cambiar la contraseña inicial, revisar el dashboard,
crear un cliente de prueba y descargar el PDF de una cotización.
