# Arquitectura

## 1. Visión general

Aplicación de tres capas con separación estricta de responsabilidades:

```
Navegador (React + Vite)
        │  HTTPS · JSON · JWT en cabecera Authorization
        ▼
API REST (Express + TypeScript)
   middlewares → módulos → servicios
        │  SQL parametrizado (Drizzle ORM)
        ▼
PostgreSQL 16          Sistema de archivos (adjuntos)
```

El frontend nunca habla con la base de datos y el backend no contiene HTML: cada capa puede
sustituirse o escalarse por separado.

---

## 2. Backend

### 2.1 Composición

`src/index.ts` arranca el proceso: verifica la conexión a la base, prepara el almacenamiento,
crea la aplicación de Express, levanta el servidor y registra el apagado ordenado (SIGTERM /
SIGINT) además del planificador de tareas periódicas.

`src/app.ts` compone la aplicación en un orden deliberado:

1. `helmet` (CSP, HSTS, anti-sniffing)
2. `cors` con lista blanca
3. `compression`
4. Identificador de petición y registro HTTP
5. Analizadores de JSON y cookies (límite de 1 MB)
6. `/api/health`
7. Limitador global + enrutador de la API
8. Manejador de rutas inexistentes y manejador central de errores

### 2.2 Estructura por módulo

Cada módulo de negocio expone tres archivos:

| Archivo | Responsabilidad |
|---------|-----------------|
| `<módulo>.schema.ts` | Esquemas Zod de entrada y tipos derivados |
| `<módulo>.controller.ts` | Consultas, reglas de negocio y respuesta HTTP |
| `<módulo>.routes.ts` | Rutas, permisos requeridos y validación |

Lo transversal vive en `services/` (auditoría, notificaciones, exportación, PDF, historial,
configuración, almacenamiento) y en `core/` (errores, paginación, catálogo de permisos,
aritmética monetaria, secuencias, alcance por cartera).

### 2.3 Contrato de la API

Respuesta correcta:

```json
{ "success": true, "data": { } }
```

Listados paginados:

```json
{ "success": true, "data": [], "meta": { "page": 1, "pageSize": 25, "total": 0, "totalPages": 1 } }
```

Error:

```json
{ "success": false, "error": { "code": "VALIDACION", "message": "…", "details": [] } }
```

Los códigos de error son legibles (`NO_ENCONTRADO`, `SIN_PERMISO`, `CONFLICTO`,
`VALIDACION`, `DUPLICADO`, `INTEGRIDAD_REFERENCIAL`) para que la interfaz reaccione sin
depender del texto.

### 2.4 Manejo de errores

Toda ruta asíncrona se envuelve en `asyncHandler`, de modo que ninguna promesa rechazada
queda sin capturar. El manejador central traduce:

- `AppError` y derivados → su propio código y estado
- `ZodError` → 422 con la lista de campos
- Errores de PostgreSQL (`23505`, `23503`, `23502`, `22P02`) → mensajes de negocio
- Cualquier otro → 500 con mensaje genérico; el detalle solo va al registro del servidor

---

## 3. Base de datos

31 tablas normalizadas. Decisiones destacadas:

- **Baja lógica** (`deleted_at`) en las entidades de negocio: la trazabilidad histórica se
  conserva y la auditoría sigue teniendo sentido.
- **Índice único parcial** en `clients.tax_id` limitado a los registros no eliminados, para
  impedir duplicados sin bloquear la reutilización tras una baja.
- **Importes en `numeric(14,2)`**: sin errores de coma flotante. Los cálculos se hacen en
  centavos con enteros (`core/money.ts`) y se persisten como cadena decimal.
- **Historial inmutable** de movimientos del pipeline en `opportunity_stage_history`.
- **Secuencias de negocio** en la tabla `counters` mediante
  `INSERT … ON CONFLICT DO UPDATE … RETURNING`, atómico frente a concurrencia.
- **Enumeraciones de PostgreSQL** para estados: el motor rechaza valores no válidos.
- **Índices** en claves foráneas, campos de estado, fechas de filtrado y columnas de búsqueda.
- **`ON DELETE` explícito** en cada relación: `cascade` para lo dependiente,
  `set null` para lo opcional y `restrict` donde borrar rompería el histórico.

### Migraciones

`drizzle-kit generate` produce SQL versionado en `server/drizzle/`. Se aplican con
`npm run db:migrate`, que usa el migrador oficial y registra lo aplicado.
El esquema nunca se modifica a mano en producción.

---

## 4. Autenticación y autorización

### Sesiones

1. `POST /api/auth/login` valida credenciales con bcrypt.
2. Se emite un **access token** JWT de vida corta (15 minutos por defecto) que viaja en la
   cabecera `Authorization`, y un **refresh token** almacenado como cookie `httpOnly`,
   `SameSite=Strict`, `Secure` en producción y con `path=/api/auth`.
3. De la sesión solo se guarda el **hash SHA-256** del refresh token.
4. Cada renovación **rota** el token y revoca el anterior.
5. Si se presenta un token ya rotado fuera de la ventana de gracia, se revoca toda la familia
   de sesiones del usuario (detección de robo). Dentro de la ventana, y solo si existe la
   sesión sucesora, se tolera: son dos pestañas renovando a la vez.

Como la API se autentica por cabecera y no por cookie, no existe superficie de CSRF en los
endpoints de negocio; el único endpoint con cookie es `/api/auth/refresh`, protegido con
`SameSite=Strict`.

### Permisos

El catálogo vive en `core/permissions.ts` con el formato `modulo.accion` (74 permisos).
Los roles se relacionan con permisos en `role_permissions`. En **cada petición** se releen
el estado del usuario y sus permisos desde la base: desactivar una cuenta o quitar un permiso
surte efecto de inmediato, sin esperar a que caduque el token.

Sobre los permisos existe un **alcance por cartera**: quien no tiene permisos de
administración sobre un módulo solo ve los registros de los que es responsable, incluidos los
satélites (contactos, documentos y notas se filtran por el propietario del registro padre).

Para añadir un rol nuevo basta con crearlo desde la interfaz y marcar sus permisos; no hay
roles codificados en el programa salvo `superadmin`, que siempre los tiene todos.

---

## 5. Frontend

- **Enrutamiento** con React Router y carga diferida por página.
- **Estado del servidor** con TanStack Query: caché, revalidación e invalidación por clave.
- **Estado de sesión** en un contexto que guarda el access token **solo en memoria** (nunca
  en `localStorage`, para reducir el impacto de un XSS). La sesión se recupera al cargar la
  página mediante la cookie de refresco.
- **Formularios** con React Hook Form + Zod, replicando las reglas del backend para dar
  retroalimentación inmediata; la validación autoritativa sigue siendo la del servidor.
- **Componentes** propios (tabla, paginación, modal, confirmación, distintivos, tarjetas)
  para mantener una sola manera de hacer cada cosa.
- **Gráficos** con una paleta verificada con un validador de accesibilidad (banda de
  luminosidad, croma mínimo, separación para daltonismo y contraste); las magnitudes usan un
  solo tono y toda serie lleva etiqueta o tooltip, nunca se distingue solo por color.

---

## 6. Preparado para crecer

| Necesidad futura | Camino previsto |
|------------------|-----------------|
| Multiempresa | Añadir `organization_id` a las tablas de negocio y un filtro en el middleware de autenticación; el alcance por cartera ya centraliza ese punto |
| Facturación / inventario | Nuevos módulos siguiendo el patrón schema/controller/routes; `sales` y `products` ya son su base |
| WhatsApp / correo | Servicio de integración que registre actividades mediante `services/` |
| Automatizaciones | `services/scheduler.service.ts` ya ejecuta trabajos periódicos; se puede extraer a un proceso trabajador |
| App móvil | La API REST es independiente de la interfaz; basta con emitir tokens para otro cliente |
| Integración con ERP | Endpoints REST versionables bajo `/api` |

---

## 7. Rendimiento

- Consultas con `JOIN` en lugar de N+1; los contadores por fila se resuelven con subconsultas
  correlacionadas indexadas.
- Paginación obligatoria (máximo 200 registros por página; 10 000 en exportaciones).
- Ordenamiento contra lista blanca de columnas: sin identificadores dinámicos en el SQL.
- Configuración cacheada en memoria por 60 segundos e invalidada al guardar.
- Frontend dividido en fragmentos (`vendor`, `charts`, `query`) y una página por fragmento.
- Índices en todas las columnas usadas en filtros, ordenamientos y búsquedas.
