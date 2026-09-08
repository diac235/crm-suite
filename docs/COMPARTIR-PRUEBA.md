# Compartir el CRM para una prueba (enlace temporal)

Genera un enlace público con HTTPS que apunta a su computador. Sin cuenta, sin tarjeta y
sin infraestructura: sirve para que otras personas prueben el sistema durante unas horas o
días. Se prepara en unos 10 minutos.

## Cómo funciona

```
Quien prueba  ──►  https://algo-al-azar.trycloudflare.com  ──►  su computador  ──►  CRM
```

En este modo, un **único proceso sirve la interfaz compilada y la API en el mismo puerto**,
igual que en producción. Por eso basta con exponer un solo puerto.

> **Limitación:** el enlace funciona mientras su computador esté encendido y las dos
> terminales abiertas. Si necesita algo permanente, vea `docs/DESPLIEGUE.md` (servidor
> propio) o `docs/DESPLIEGUE-FIREBASE.md` (Google Cloud).

---

## 1. Instalar cloudflared (una sola vez)

En PowerShell:

```powershell
winget install --id Cloudflare.cloudflared
```

Cierre y vuelva a abrir PowerShell, y compruebe:

```powershell
cloudflared --version
```

> Si no tiene `winget`, descargue `cloudflared-windows-amd64.exe` desde
> <https://github.com/cloudflare/cloudflared/releases>, renómbrelo a `cloudflared.exe` y
> déjelo en la carpeta del proyecto. En ese caso, más adelante escriba `.\cloudflared.exe`
> en lugar de `cloudflared`.

---

## 2. Arrancar el CRM en modo demostración

En la carpeta del proyecto:

```powershell
npm run compartir
```

Compila la interfaz y levanta todo en `http://localhost:4000`. **Deje esta terminal abierta.**

Compruebe en su navegador que <http://localhost:4000> funciona antes de continuar.

---

## 3. Crear el enlace público

Abra una **segunda** terminal (sin cerrar la primera), vaya a la misma carpeta y ejecute:

```powershell
cloudflared tunnel --url http://localhost:4000
```

Entre las líneas de texto aparecerá un recuadro con la dirección:

```
+----------------------------------------------------------+
|  https://palabras-al-azar.trycloudflare.com               |
+----------------------------------------------------------+
```

**Ese es el enlace para compartir.** Ábralo usted primero para verificar que carga.

---

## 4. Antes de compartirlo

1. **Cambie la contraseña del administrador.** Cualquiera con el enlace llega a la pantalla
   de acceso.
2. **Cree un usuario por cada persona** que vaya a probar, con rol *Usuario*, en
   *Usuarios → Nuevo usuario*. Así no comparte la cuenta de administrador y además verá en
   la auditoría quién hizo cada cosa.
3. **No cargue información real de clientes** en una prueba.
4. Avise que el enlace es temporal.

---

## 5. Detener la prueba

`Ctrl + C` en ambas terminales. El enlace deja de funcionar de inmediato.

Cada vez que reinicie el túnel, la dirección **cambia**: tendrá que compartir la nueva.

---

## 6. Problemas frecuentes

| Síntoma | Causa y solución |
|---|---|
| `cloudflared` no se reconoce | Cierre y reabra PowerShell tras instalarlo |
| El enlace muestra error 502 | El CRM no está corriendo: revise la primera terminal |
| Entra pero no puede iniciar sesión | Use el enlace `https://…` del túnel, no `http://localhost` |
| Va lento al abrir | Normal: el tráfico pasa por Cloudflare y llega hasta su equipo |
| Se cerró la sesión sola | Se reinició el servidor. Vuelva a iniciar sesión |

---

## 7. Volver al modo desarrollo

El modo demostración usa la versión compilada: **los cambios en el código no se reflejan**.
Para seguir trabajando, detenga todo y ejecute:

```powershell
npm run dev
```
