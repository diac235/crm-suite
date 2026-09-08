# Respaldo y restauración

La totalidad de la información de negocio vive en PostgreSQL. Los archivos adjuntos
(documentos y logos) viven en el sistema de archivos, bajo la ruta indicada por
`STORAGE_DIR` (por defecto `server/storage/uploads`).

**Un respaldo completo son dos piezas: la base de datos y el directorio de archivos.**

---

## 1. Respaldo de la base de datos

### Respaldo completo (formato comprimido, recomendado)

```bash
pg_dump   --format=custom   --no-owner --no-privileges   --file="/respaldos/crm_$(date +%Y%m%d_%H%M%S).dump"   "postgresql://crm_user:CLAVE@localhost:5432/crm_db"
```

### Respaldo en SQL plano (legible, útil para migrar de servidor)

```bash
pg_dump --no-owner --no-privileges   "postgresql://crm_user:CLAVE@localhost:5432/crm_db"   | gzip > "/respaldos/crm_$(date +%Y%m%d).sql.gz"
```

### Solo el esquema o solo los datos

```bash
pg_dump --schema-only ... > esquema.sql
pg_dump --data-only   ... > datos.sql
```

---

## 2. Respaldo de los archivos adjuntos

```bash
tar -czf "/respaldos/archivos_$(date +%Y%m%d).tar.gz" -C server storage/uploads
```

---

## 3. Restauración

### Base de datos (desde `--format=custom`)

```bash
# 1. Crear la base vacía
createdb -O crm_user crm_db

# 2. Restaurar
pg_restore   --no-owner --no-privileges   --dbname="postgresql://crm_user:CLAVE@localhost:5432/crm_db"   /respaldos/crm_20260819_020000.dump
```

### Base de datos (desde SQL plano)

```bash
gunzip -c /respaldos/crm_20260819.sql.gz | psql "postgresql://crm_user:CLAVE@localhost:5432/crm_db"
```

### Archivos adjuntos

```bash
tar -xzf /respaldos/archivos_20260819.tar.gz -C server
```

### Después de restaurar

```bash
npm run db:migrate     # aplica migraciones más nuevas que el respaldo
```

No es necesario volver a ejecutar el seed: el respaldo ya contiene usuarios, roles y catálogos.
Si el respaldo es de una versión anterior del sistema, ejecutar `npm run db:seed` es seguro
(es idempotente) y añade los permisos nuevos que se hayan incorporado.

---

## 4. Respaldo automático diario

`/etc/cron.d/crm-backup`:

```cron
# Respaldo diario a las 02:15, con retención de 30 días
15 2 * * * postgres /usr/local/bin/crm-backup.sh >> /var/log/crm-backup.log 2>&1
```

`/usr/local/bin/crm-backup.sh`:

```bash
#!/bin/bash
set -euo pipefail

DESTINO=/respaldos
RETENCION_DIAS=30
FECHA=$(date +%Y%m%d_%H%M%S)
mkdir -p "$DESTINO"

# Base de datos
pg_dump --format=custom --no-owner --no-privileges   --file="$DESTINO/crm_$FECHA.dump" "$DATABASE_URL"

# Archivos adjuntos
tar -czf "$DESTINO/archivos_$FECHA.tar.gz" -C /opt/crm/server storage/uploads

# Verificación: un respaldo que no se puede leer no es un respaldo
pg_restore --list "$DESTINO/crm_$FECHA.dump" > /dev/null

# Retención
find "$DESTINO" -name 'crm_*.dump' -mtime +$RETENCION_DIAS -delete
find "$DESTINO" -name 'archivos_*.tar.gz' -mtime +$RETENCION_DIAS -delete

echo "Respaldo correcto: $FECHA"
```

```bash
chmod +x /usr/local/bin/crm-backup.sh
```

---

## 5. Recomendaciones

1. **Pruebe la restauración periódicamente** en un servidor de pruebas. Un respaldo nunca
   verificado no ofrece garantías.
2. **Guarde una copia fuera del servidor** (almacenamiento de objetos u otra máquina).
3. **Cifre los respaldos** si contienen datos personales:
   `gpg --symmetric --cipher-algo AES256 crm_20260819.dump`
4. **Antes de cada actualización** del sistema, tome un respaldo manual.
5. **Vigile el espacio en disco** del destino de respaldos.
