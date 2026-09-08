# Publicar el CRM con Firebase Hosting + Cloud Run + Cloud SQL

Guía escrita para **Windows / PowerShell**. Tiempo estimado: una hora.

## 0. Qué vamos a montar

```
Navegador
   │
   ▼
Firebase Hosting  ──►  /api/**  ──►  Cloud Run (contenedor del backend)
   (interfaz React)                        │
                                           ▼
                                  Cloud SQL · PostgreSQL 16
```

Interfaz y API quedan bajo el **mismo dominio**, así que la cookie de sesión funciona sin
ajustes y no hay que tocar CORS.

> **Firebase por sí solo no alcanza.** Hosting sirve la interfaz, pero la API necesita
> Cloud Run y la base necesita Cloud SQL. Ambos requieren el plan **Blaze** (pago por uso,
> con tarjeta). Firestore no sirve: es NoSQL y este CRM depende de SQL.

---

## 1. Preparativos

1. Cree un proyecto en <https://console.firebase.google.com> y anote su **ID de proyecto**
2. En la consola, abra *Configuración → Uso y facturación* y **cambie al plan Blaze**
3. Instale las dos herramientas de línea de comandos:

```powershell
npm install -g firebase-tools
```

Para `gcloud`, descargue e instale: <https://cloud.google.com/sdk/docs/install-sdk#windows>

4. Cierre y reabra PowerShell, y autentíquese:

```powershell
firebase login
gcloud auth login
```

5. Guarde el ID del proyecto en una variable (la usaremos en todos los comandos):

```powershell
$PROYECTO = "pegue-aqui-su-id-de-proyecto"
gcloud config set project $PROYECTO
```

6. Habilite los servicios necesarios (tarda 1-2 minutos):

```powershell
gcloud services enable run.googleapis.com sqladmin.googleapis.com `
  artifactregistry.googleapis.com cloudbuild.googleapis.com secretmanager.googleapis.com
```

---

## 2. Base de datos en Cloud SQL

```powershell
gcloud sql instances create crm-db `
  --database-version=POSTGRES_16 `
  --tier=db-f1-micro `
  --region=us-central1 `
  --storage-size=10GB `
  --storage-auto-increase
```

> Tarda entre 5 y 10 minutos. Si reclama por la edición, agregue `--edition=ENTERPRISE`.

```powershell
gcloud sql databases create crm_db --instance=crm-db
gcloud sql users create crm_user --instance=crm-db --password="UNA_CLAVE_MUY_FUERTE"
```

Obtenga el nombre de conexión (formato `proyecto:region:instancia`):

```powershell
$CONEXION = gcloud sql instances describe crm-db --format="value(connectionName)"
echo $CONEXION
```

---

## 3. Secretos

Genere dos secretos distintos:

```powershell
$JWT_A = node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
$JWT_R = node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
$BD    = "postgresql://crm_user:UNA_CLAVE_MUY_FUERTE@localhost/crm_db?host=/cloudsql/$CONEXION"
```

> Si la contraseña de `crm_user` contiene `@`, `:`, `/` o `#`, codifíquela
> (`@` → `%40`, `:` → `%3A`, `/` → `%2F`, `#` → `%23`).

Guárdelos en Secret Manager:

```powershell
$BD    | gcloud secrets create CRM_DATABASE_URL --data-file=-
$JWT_A | gcloud secrets create CRM_JWT_ACCESS  --data-file=-
$JWT_R | gcloud secrets create CRM_JWT_REFRESH --data-file=-
```

Autorice a Cloud Run a leerlos:

```powershell
$NUMERO = gcloud projects describe $PROYECTO --format="value(projectNumber)"
gcloud projects add-iam-policy-binding $PROYECTO `
  --member="serviceAccount:$NUMERO-compute@developer.gserviceaccount.com" `
  --role="roles/secretmanager.secretAccessor"
```

---

## 4. Desplegar la API en Cloud Run

Ejecute desde la **carpeta raíz del proyecto** (donde está el `Dockerfile`):

```powershell
gcloud run deploy crm-api `
  --source . `
  --region us-central1 `
  --allow-unauthenticated `
  --add-cloudsql-instances $CONEXION `
  --set-env-vars "NODE_ENV=production,CORS_ORIGIN=https://$PROYECTO.web.app,APP_URL=https://$PROYECTO.web.app,RUN_MIGRATIONS_ON_START=true,RUN_SEED_ON_START=true,SEED_DEMO_DATA=true,SEED_ADMIN_EMAIL=admin@suempresa.com,SEED_ADMIN_PASSWORD=UnaClaveInicialFuerte*2026" `
  --set-secrets "DATABASE_URL=CRM_DATABASE_URL:latest,JWT_ACCESS_SECRET=CRM_JWT_ACCESS:latest,JWT_REFRESH_SECRET=CRM_JWT_REFRESH:latest"
```

La primera vez tarda entre 5 y 8 minutos (compila la imagen en Cloud Build).

`RUN_MIGRATIONS_ON_START` y `RUN_SEED_ON_START` hacen que el contenedor **cree las tablas y
cargue los datos iniciales durante el arranque**, evitando tener que conectarse a la base
desde su equipo. Ambas operaciones son idempotentes.

Compruebe que responde:

```powershell
$API = gcloud run services describe crm-api --region us-central1 --format="value(status.url)"
curl.exe "$API/api/health"
```

Debe devolver `{"success":true,"data":{"status":"ok",...}}`.

---

## 5. Desplegar la interfaz en Firebase Hosting

```powershell
Copy-Item .firebaserc.example .firebaserc
```

Abra `.firebaserc` y reemplace el texto por su ID de proyecto. Luego:

```powershell
npm run build --workspace=web
firebase deploy --only hosting
```

`firebase.json` ya viene configurado: envía `/api/**` a Cloud Run y el resto a `index.html`.

**Su CRM queda en `https://SU-PROYECTO.web.app`** — ese es el enlace para compartir.

---

## 6. Cerrar el despliegue

Una vez que verificó que entra y ve los datos, **desactive el seed automático** para que no
se vuelva a ejecutar en cada reinicio:

```powershell
gcloud run services update crm-api --region us-central1 `
  --update-env-vars "RUN_SEED_ON_START=false,SEED_DEMO_DATA=false"
```

Deje `RUN_MIGRATIONS_ON_START=true`: así, cuando actualice el sistema, las migraciones
nuevas se aplican solas.

---

## 7. Verificación

- [ ] `https://SU-PROYECTO.web.app/api/health` responde `ok`
- [ ] Puede iniciar sesión y el sistema exige cambiar la contraseña inicial
- [ ] El dashboard muestra los datos de ejemplo
- [ ] El PDF de una cotización se descarga correctamente
- [ ] `RUN_SEED_ON_START` quedó en `false`

---

## 8. Advertencias para una prueba pública

**Cualquiera con el enlace llega a la pantalla de acceso.** Antes de compartirlo:

1. Use una `SEED_ADMIN_PASSWORD` que **no** sea la del ejemplo del proyecto
2. Cree un usuario por cada persona que vaya a probar, con rol *Usuario*, en lugar de
   compartir la cuenta de administrador
3. No cargue información real de clientes en un entorno de prueba
4. **Los documentos adjuntos se pierden al reiniciar el contenedor**: Cloud Run tiene disco
   efímero. Para una prueba es aceptable; para producción hay que montar un bucket de Cloud
   Storage y apuntar `STORAGE_DIR` a ese punto de montaje

---

## 9. Costo y cómo apagarlo

| Servicio | Costo |
|---|---|
| Firebase Hosting | Sin costo en la práctica para este uso |
| Cloud Run | Escala a cero: solo paga cuando alguien lo usa |
| Cloud SQL `db-f1-micro` | **Corre 24/7 y es el rubro dominante** |

Al terminar la prueba, **elimine la instancia de Cloud SQL** para dejar de pagar:

```powershell
gcloud sql instances delete crm-db
gcloud run services delete crm-api --region us-central1
```

Si más adelante quiere algo permanente y barato, `docs/DESPLIEGUE.md` cubre el despliegue en
un VPS propio, y Cloud Run funciona igual con un PostgreSQL gratuito de Neon en lugar de
Cloud SQL: solo cambia el valor de `CRM_DATABASE_URL`.
