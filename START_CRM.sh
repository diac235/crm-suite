#!/bin/bash

# ===================================
# CRM SUITE - Script de Inicio
# ===================================
# Ejecuta el CRM Suite completo (Backend + Frontend)
#
# Uso: ./START_CRM.sh
# o:   bash START_CRM.sh
# ===================================

set -e

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}"
echo "╔════════════════════════════════════════════╗"
echo "║      🚀 CRM SUITE - INICIANDO...           ║"
echo "║     Backend API + Frontend React           ║"
echo "╚════════════════════════════════════════════╝"
echo -e "${NC}"

# Obtener la ruta del directorio actual
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

echo -e "${YELLOW}📁 Directorio: ${SCRIPT_DIR}${NC}"

# Verificar que exista el directorio de servidor
if [ ! -d "$SCRIPT_DIR/server" ]; then
    echo -e "${RED}❌ Error: No se encontró la carpeta 'server'${NC}"
    echo -e "${RED}   Asegúrate de ejecutar este script desde la raíz del CRM${NC}"
    exit 1
fi

# Verificar que exista el directorio web
if [ ! -d "$SCRIPT_DIR/web" ]; then
    echo -e "${RED}❌ Error: No se encontró la carpeta 'web'${NC}"
    exit 1
fi

# Verificar Node.js
echo -e "${YELLOW}🔍 Verificando Node.js...${NC}"
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Error: Node.js no está instalado${NC}"
    echo -e "${RED}   Descargalo desde: https://nodejs.org/${NC}"
    exit 1
fi

NODE_VERSION=$(node -v)
echo -e "${GREEN}✅ Node.js ${NODE_VERSION} encontrado${NC}"

# Verificar npm
if ! command -v npm &> /dev/null; then
    echo -e "${RED}❌ Error: npm no está instalado${NC}"
    exit 1
fi

NPM_VERSION=$(npm -v)
echo -e "${GREEN}✅ npm ${NPM_VERSION} encontrado${NC}"

# Verificar PostgreSQL
echo -e "${YELLOW}🔍 Verificando PostgreSQL...${NC}"
if ! command -v psql &> /dev/null; then
    echo -e "${YELLOW}⚠️  PostgreSQL no está en el PATH${NC}"
    echo -e "${YELLOW}   Asegúrate de tener PostgreSQL instalado y ejecutándose${NC}"
    echo -e "${YELLOW}   Continuando de todas formas...${NC}"
else
    PG_VERSION=$(psql --version)
    echo -e "${GREEN}✅ ${PG_VERSION}${NC}"
fi

# Verificar archivo .env
echo -e "${YELLOW}🔍 Verificando configuración (.env)...${NC}"
if [ ! -f "$SCRIPT_DIR/server/.env" ]; then
    echo -e "${RED}❌ Error: Archivo .env no encontrado${NC}"
    echo -e "${YELLOW}📝 Creando archivo .env de ejemplo...${NC}"

    cat > "$SCRIPT_DIR/server/.env" << 'EOF'
# Base de Datos
DATABASE_URL=postgresql://crm_user:tu_contraseña_segura@localhost:5432/crm_suite

# API
NODE_ENV=development
PORT=3000

# JWT
JWT_SECRET=tu_clave_jwt_muy_larga_y_segura_aqui_12345
JWT_REFRESH_SECRET=tu_clave_refresh_muy_larga_y_segura_12345
JWT_EXPIRE=15m
JWT_REFRESH_EXPIRE=30d

# Admin Seed
SEED_ADMIN_EMAIL=admin@crmsuite.com
SEED_ADMIN_PASSWORD=Admin123!

# Frontend
VITE_API_URL=http://localhost:3000
EOF

    echo -e "${YELLOW}📝 Archivo .env creado en: $SCRIPT_DIR/server/.env${NC}"
    echo -e "${YELLOW}⚠️  IMPORTANTE: Edita el archivo .env con tus credenciales de BD${NC}"
    echo -e "${YELLOW}   nano $SCRIPT_DIR/server/.env${NC}"
    read -p "Presiona Enter cuando hayas configurado .env..."
fi

echo -e "${GREEN}✅ Configuración encontrada${NC}"

# Instalar dependencias si no existen
if [ ! -d "$SCRIPT_DIR/node_modules" ]; then
    echo -e "${YELLOW}📦 Instalando dependencias (esto puede tomar 1-2 minutos)...${NC}"
    cd "$SCRIPT_DIR"
    npm install
    echo -e "${GREEN}✅ Dependencias instaladas${NC}"
else
    echo -e "${GREEN}✅ Dependencias ya instaladas${NC}"
fi

# Ofrecer migrar base de datos
echo ""
echo -e "${YELLOW}🗄️  ¿Deseas migrar la base de datos? (recomendado la primera vez)${NC}"
read -p "   Escribe 's' para sí, 'n' para no: " -n 1 -r
echo
if [[ $REPLY =~ ^[Ss]$ ]]; then
    echo -e "${YELLOW}⏳ Migrando base de datos...${NC}"
    cd "$SCRIPT_DIR"
    npm run db:migrate

    echo -e "${YELLOW}⏳ Sembrando datos iniciales...${NC}"
    npm run db:seed

    echo -e "${GREEN}✅ Base de datos lista${NC}"
fi

# Limpiar pantalla
clear

# Iniciar el CRM
echo -e "${BLUE}"
echo "╔════════════════════════════════════════════╗"
echo "║    ✅ CRM SUITE INICIANDO...               ║"
echo "║                                            ║"
echo "║  🔵 Backend API:  http://localhost:3000   ║"
echo "║  🟠 Frontend Web: http://localhost:5173   ║"
echo "║                                            ║"
echo "║  📧 Email: admin@crmsuite.com             ║"
echo "║  🔐 Pass:  Admin123!                      ║"
echo "║                                            ║"
echo "║  Presiona Ctrl+C para detener              ║"
echo "╚════════════════════════════════════════════╝"
echo -e "${NC}"

cd "$SCRIPT_DIR"
npm run dev
