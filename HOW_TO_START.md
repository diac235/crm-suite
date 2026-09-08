# 🚀 CÓMO INICIAR CRM SUITE

## Opción 1: Script Automático (RECOMENDADO) ⭐

### En Windows
1. **Doble-click** en `START_CRM.bat`
2. Sigue las instrucciones en pantalla
3. Listo, el CRM se abre automáticamente

### En Mac/Linux
```bash
# Abre terminal en la carpeta del CRM
cd /home/claude/crm

# Ejecuta el script
./START_CRM.sh

# O también:
bash START_CRM.sh
```

---

## ¿Qué hace el script automático?

✅ Verifica Node.js y npm  
✅ Verifica PostgreSQL  
✅ Verifica configuración (.env)  
✅ Instala dependencias si faltan  
✅ Pregunta si quieres migrar BD  
✅ **Inicia Backend + Frontend automáticamente**  
✅ Abre las direcciones en tu navegador  

---

## Opción 2: Manual (Si algo falla)

### Paso 1: Terminal
```bash
cd /home/claude/crm
npm install
npm run db:migrate && npm run db:seed
npm run dev
```

### Paso 2: Navegador
Abre: `http://localhost:5173`

### Paso 3: Login
- Email: `admin@crmsuite.com`
- Password: `Admin123!`

---

## Acceso Rápido en Escritorio

### En Windows: Crear Acceso Directo
1. Haz clic derecho en `START_CRM.bat`
2. Selecciona "Enviar a" → "Escritorio (crear acceso directo)"
3. Renómbralo a `CRM` (opcional)
4. ¡Listo! Ahora puedes ejecutar desde el escritorio

### En Mac/Linux: Crear Alias
```bash
# Abre terminal
cd ~/Desktop

# Crea un script
cat > CRM.sh << 'EOF'
#!/bin/bash
cd /home/claude/crm
./START_CRM.sh
EOF

chmod +x CRM.sh
```

---

## ⚠️ Requisitos Previos

Asegúrate de tener:
- ✅ Node.js v20+ instalado
- ✅ PostgreSQL instalado y ejecutándose
- ✅ Archivo `.env` configurado (ver abajo)

Si algo no está instalado, el script te lo dirá y te guiará.

---

## 📝 Configurar .env

El archivo `.env` debe estar en: `/home/claude/crm/server/.env`

```env
# Base de Datos (IMPORTANTE)
DATABASE_URL=postgresql://crm_user:tu_contraseña@localhost:5432/crm_suite

# API
NODE_ENV=development
PORT=3000

# JWT
JWT_SECRET=una_clave_secreta_muy_larga_aqui
JWT_REFRESH_SECRET=otra_clave_secreta_muy_larga_aqui
JWT_EXPIRE=15m
JWT_REFRESH_EXPIRE=30d

# Admin Seed
SEED_ADMIN_EMAIL=admin@crmsuite.com
SEED_ADMIN_PASSWORD=Admin123!

# Frontend
VITE_API_URL=http://localhost:3000
```

---

## 🌐 Acceso Después de Iniciar

Una vez que ves esto en terminal:

```
✅ Backend API:  http://localhost:3000
✅ Frontend Web: http://localhost:5173
```

### Abre tu navegador en:
- **Desarrollo:** http://localhost:5173
- **API directa:** http://localhost:3000

### Login:
- Email: `admin@crmsuite.com`
- Password: `Admin123!`

---

## 🐛 Solucionar Problemas

### El script dice "Node.js no encontrado"
```bash
# Instala Node.js desde: https://nodejs.org/
# Luego reinicia la terminal
```

### Error "PostgreSQL no encontrado"
```bash
# Asegúrate de que PostgreSQL está ejecutándose
# En Windows: Services > PostgreSQL
# En Mac: brew services start postgresql
# En Linux: sudo systemctl start postgresql
```

### Error "Cannot connect to database"
```bash
# Verificar credenciales en .env
# Crear la base de datos:
psql -U postgres -c "CREATE DATABASE crm_suite;"
```

### Puerto 3000 ya está en uso
```bash
# Cambiar puerto en .env
PORT=3001

# O matar el proceso:
kill $(lsof -t -i:3000)
```

---

## ✨ Eso es todo

Una vez que el CRM esté ejecutándose:

1. ✅ Ve a http://localhost:5173
2. ✅ Login con admin@crmsuite.com / Admin123!
3. ✅ ¡Comienza a usar el CRM!

---

## 📚 Más Información

- Ver manual de usuario: `/docs/CRM_USER_MANUAL.docx`
- Ver seguridad: `/docs/SECURITY.md`
- Ver API: `/docs/2FA_API_EXAMPLES.md`

---

**¿Necesitas ayuda?**  
Email: support@crmsuite.com  
Tel: +1-800-CRMSUITE
