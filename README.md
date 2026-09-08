# CRM Suite

CRM empresarial completo para la gestión comercial: clientes, prospectos, oportunidades,
cotizaciones, ventas, actividades, tareas, documentos, reportes, auditoría y configuración.

Construido para operar en una empresa real y para crecer: la arquitectura está preparada
para incorporar más adelante facturación, inventario, integraciones (WhatsApp, correo, ERP),
automatizaciones y multiempresa.

---

## 1. Tecnologías

| Capa | Tecnología |
|------|------------|
| Base de datos | PostgreSQL 16 |
| ORM / migraciones | Drizzle ORM + drizzle-kit (migraciones SQL versionadas) |
| Backend | Node.js 20+, TypeScript, Express 4 |
| Validación | Zod (entrada y configuración de entorno) |
| Autenticación | JWT de acceso + refresh token rotativo en cookie `httpOnly` |
| Contraseñas | bcrypt (coste configurable) |
| Seguridad | Helmet, CORS con lista blanca, rate limiting, validación de archivos |
| Documentos | PDFKit (cotizaciones), ExcelJS (exportaciones) |
| Registro | Pino con redacción de datos sensibles |
| Frontend | React 18, TypeScript, Vite, Tailwind CSS |
| Estado de datos | TanStack Query |
| Formularios | React Hook Form + Zod |
| Gráficos | Recharts con paleta validada para daltonismo |
| Pruebas | Vitest + Supertest (integración sobre PostgreSQL real) |

**¿Por qué Drizzle y no Prisma?** Drizzle es TypeScript puro: no descarga binarios en la
instalación, genera migraciones SQL legibles y versionables, y permite controlar índices y
consultas complejas sin renunciar al tipado.

---

## 2. Estructura del proyecto

```
crm/
├── server/                     API REST
│   ├── drizzle/                Migraciones SQL generadas y versionadas
│   ├── src/
│   │   ├── config/             Entorno validado y logger
│   │   ├── core/               Errores, paginación, permisos, dinero, secuencias
│   │   ├── db/                 Cliente, esquema, migraciones y seed
│   │   ├── middlewares/        Autenticación, validación, errores, subidas, límites
│   │   ├── modules/<módulo>/   schema.ts · controller.ts · routes.ts
│   │   ├── services/           Auditoría, notificaciones, PDF, Excel, historial…
│   │   ├── app.ts              Composición de Express
│   │   └── index.ts            Arranque y apagado ordenado
│   └── tests/                  Pruebas de integración
├── web/                        Interfaz React
│   └── src/
│       ├── components/         Componentes de interfaz reutilizables
│       ├── features/           Formularios y paneles por dominio
│       ├── hooks/              Autenticación, catálogos, estado de tablas
│       ├── layouts/            Estructura con navegación lateral
│       ├── lib/                Cliente HTTP, formatos, paleta de gráficos
│       └── pages/              Una página por módulo
└── docs/                       Arquitectura, respaldos y despliegue
```

---

## 3. Requisitos

- Node.js 20 o superior
- PostgreSQL 16 (o 14+)
- npm 10 o superior

---

## 4. Instalación

### 4.1 Instalación rápida en Windows

1. **Instale Node.js 20 o superior** — <https://nodejs.org> (opción *LTS*, instalador `.msi`).
2. **Instale PostgreSQL 16** — <https://www.postgresql.org/download/windows/>
   Durante la instalación anote la contraseña del usuario `postgres` y deje el puerto `5432`.
3. **Cree la base de datos.** Abra *SQL Shell (psql)* desde el menú Inicio, acepte los valores
   por defecto, escriba la contraseña de `postgres` y ejecute:

   ```sql
   CREATE ROLE crm_user WITH LOGIN PASSWORD 'una-clave-segura';
   CREATE DATABASE crm_db OWNER crm_user;
   \q
   ```

4. **Abra PowerShell en la carpeta del proyecto** (clic derecho en la carpeta →
   *Abrir en Terminal*) y ejecute:

   ```powershell
   npm install
   npm run configurar     # asistente: pide los datos y genera server/.env con los secretos
   npm run db:migrate     # crea las tablas
   npm run db:seed        # permisos, roles, catálogos y usuario administrador
   npm run dev            # levanta API e interfaz
   ```

5. Abra <http://localhost:5173> e ingrese con el usuario que indicó en el asistente.

Para detener el sistema: `Ctrl + C` en la terminal.

> Si `npm` no se reconoce, cierre y vuelva a abrir PowerShell después de instalar Node.js.
> Si falla la conexión a la base, revise que el servicio *postgresql-x64-16* esté iniciado
> en *Servicios* de Windows.

### 4.2 Instalación paso a paso (cualquier sistema)

```bash
# 1. Dependencias (monorepo con workspaces)
npm install

# 2. Base de datos
createdb crm_db
psql -c "CREATE ROLE crm_user WITH LOGIN PASSWORD 'una-clave-segura';"
psql -c "GRANT ALL PRIVILEGES ON DATABASE crm_db TO crm_user;"

# 3. Variables de entorno del backend
npm run configurar
#    El asistente crea server/.env, genera los secretos JWT y arma la cadena de conexión.
#    Si prefiere hacerlo a mano: cp server/.env.example server/.env y edite DATABASE_URL
#    y los dos secretos. Genere cada secreto con:
#    node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"

# 4. Variables de entorno del frontend (opcional en desarrollo)
cp web/.env.example web/.env

# 5. Migraciones
npm run db:migrate

# 6. Datos iniciales (permisos, roles, catálogos y usuario administrador)
npm run db:seed
```

### Usuario administrador inicial

Se crea con los valores de `server/.env`:

| Variable | Valor por defecto |
|----------|-------------------|
| `SEED_ADMIN_EMAIL` | `admin@crm.local` |
| `SEED_ADMIN_PASSWORD` | `Admin*2026Seguro` |

El usuario se crea con **cambio de contraseña obligatorio**: en el primer ingreso el sistema
lo lleva a su perfil y no le permite operar hasta que la actualice.

> Cambie `SEED_ADMIN_EMAIL` y `SEED_ADMIN_PASSWORD` antes de ejecutar el seed en producción.

### Datos de ejemplo (opcional)

Con `SEED_DEMO_DATA=true` el seed carga clientes, contactos, prospectos, oportunidades,
cotizaciones, ventas, actividades y tareas de ejemplo para validar el sistema.
Solo se cargan si la base no tiene clientes todavía. **Manténgalo en `false` en producción.**

---

## 5. Ejecución

### Desarrollo

```bash
npm run dev            # API en http://localhost:4000 y web en http://localhost:5173
```

O por separado:

```bash
npm run dev --workspace=server
npm run dev --workspace=web
```

El servidor de desarrollo de Vite hace de proxy de `/api` hacia el backend, por lo que
no hay problemas de CORS ni de cookies entre orígenes.

### Producción

```bash
npm run build                       # compila backend y frontend
NODE_ENV=production npm start --workspace=server
```

Sirva `web/dist` con Nginx (recomendado) o desde el propio backend con
`SERVE_STATIC=true`. Consulte `docs/DESPLIEGUE.md`.

---

## 6. Comandos disponibles

| Comando | Descripción |
|---------|-------------|
| `npm run configurar` | Asistente que crea `server/.env` y genera los secretos |
| `npm run dev` | Backend y frontend en modo desarrollo (multiplataforma) |
| `npm run compartir` | Modo demostración: compila y sirve todo desde un solo puerto |
| `npm run build` | Compila ambos proyectos |
| `npm test` | Pruebas de integración del backend |
| `npm run db:migrate` | Aplica las migraciones pendientes |
| `npm run db:seed` | Carga permisos, roles, catálogos y administrador |
| `npm run db:generate --workspace=server` | Genera una migración tras cambiar el esquema |
| `npm run db:migrate:prod --workspace=server` | Migraciones usando el código compilado (imágenes sin dependencias de desarrollo) |
| `npm run db:seed:prod --workspace=server` | Seed usando el código compilado |
| `npm run typecheck --workspace=server` | Verificación de tipos del backend |

---

## 7. Módulos incluidos

- **Dashboard**: 20 indicadores con comparación contra el período anterior, gráficos y
  listas de trabajo (reuniones próximas, tareas vencidas, seguimientos pendientes).
  Filtros por hoy, semana, mes, trimestre, año y rango personalizado.
- **Clientes**: ficha completa, control de duplicados por identificación, archivar/reactivar,
  exportación y **línea de tiempo** con toda la relación comercial.
- **Contactos**: múltiples por cliente, contacto principal único, exportación.
- **Prospectos**: estados, temperatura, fuentes, seguimientos y **conversión a cliente**
  conservando actividades, tareas, notas, documentos y oportunidades.
- **Oportunidades**: pipeline Kanban con arrastre entre etapas e historial inmutable de
  movimientos, valor ponderado y motivos de pérdida obligatorios.
- **Cotizaciones**: detalle con productos, descuentos e impuestos, cálculo en centavos,
  máquina de estados, **PDF profesional** y conversión a venta.
- **Ventas**: registro, estados y control de cobro.
- **Productos**: catálogo con impuestos; los productos usados se desactivan en vez de borrarse.
- **Actividades y calendario**: llamadas, reuniones, correos, visitas y WhatsApp, con vistas
  de día, semana y mes que combinan actividades y tareas.
- **Tareas**: prioridades, vencimientos, comentarios y alertas.
- **Documentos**: adjuntos validados por tipo, tamaño y firma binaria.
- **Reportes**: ventas, oportunidades, clientes y actividades, exportables a Excel.
- **Usuarios, roles y equipos**: permisos granulares configurables por módulo y acción.
- **Configuración**: empresa, moneda, impuestos, etapas del pipeline, tipos de actividad,
  sectores y fuentes de prospectos, todo almacenado en base de datos.
- **Auditoría**: quién, cuándo, qué, desde qué IP y con qué datos anteriores y nuevos.
- **Búsqueda global**: resultados categorizados con atajo `Ctrl/Cmd + K`.

---

## 8. Seguridad

- Contraseñas con bcrypt; nunca se almacenan ni se registran en texto plano.
- Política de contraseñas: 10+ caracteres con mayúscula, minúscula, número y símbolo.
- Bloqueo temporal de la cuenta tras varios intentos fallidos (configurable).
- Access token de vida corta + refresh token rotativo en cookie `httpOnly`, `SameSite=Strict`
  y `Secure` en producción, con detección de reutilización de tokens.
- Permisos revalidados contra la base de datos en cada petición: revocar un rol es inmediato.
- Alcance por cartera: un ejecutivo solo ve sus clientes, prospectos, oportunidades,
  cotizaciones, contactos, documentos y notas.
- Consultas siempre parametrizadas (sin concatenación de entrada de usuario).
- Validación de entrada con Zod en `body`, `query` y `params`.
- Helmet con CSP, CORS con lista blanca y rate limiting por tipo de operación.
- Subidas: lista blanca de MIME, límite de tamaño, nombre generado por el servidor,
  verificación de firma binaria y protección contra recorridos de ruta.
- Exportaciones CSV protegidas contra inyección de fórmulas.
- Los errores 500 nunca exponen detalles internos al cliente.

Detalle completo en `docs/ARQUITECTURA.md`.

---

## 9. Respaldos

Procedimientos de respaldo y restauración en **`docs/BACKUP.md`**.

## 10. Despliegue

- Enlace temporal para una demostración (10 minutos, sin costo):
  **`docs/COMPARTIR-PRUEBA.md`**
- Servidor propio o VPS (Nginx, systemd, Docker): **`docs/DESPLIEGUE.md`**
- Publicación en internet con Firebase Hosting + Cloud Run + Cloud SQL:
  **`docs/DESPLIEGUE-FIREBASE.md`**

---

## 11. Pruebas

```bash
# Requiere una base de datos de pruebas: createdb crm_test
npm test
```

Las pruebas se ejecutan contra PostgreSQL real: recrean el esquema, aplican las migraciones
y validan autenticación, control de acceso por rol y cartera, y el flujo comercial completo
(cliente → prospecto → conversión → oportunidad → cotización → PDF → venta).
