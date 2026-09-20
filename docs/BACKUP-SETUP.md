# Puesta en marcha del backup — pendiente

> **Estado a 2026-09-19.** El workflow está escrito y revisado, pero **nunca se
> ha ejecutado** y los secrets del destino externo no existen todavía. Hasta
> que se complete la Fase 1, **La Nave no tiene ningún backup**: Supabase free
> tier no incluye copias automáticas ni PITR.
>
> Retomar desde la Fase 1. Cada fase deja algo funcionando por sí sola.

---

## Se hace a la vez que el login social

[`LOGIN-SOCIAL.md`](LOGIN-SOCIAL.md) también está pendiente para esta semana y
**exige una build nueva** (módulos nativos). Conviene agrupar: el backup no
necesita build, pero si vas a estar con las manos en el proyecto, hazlos
seguidos y gastas una sola recompilación.

## Fase 1 — Poner el backup a funcionar

### 1.1 Crear el bucket externo

Decidido: **Cloudflare R2 o Backblaze B2** (10 GB gratis los dos). Se
descartó Google Drive por dos motivos concretos:

- Las *service accounts* no tienen cuota en Drive: fallan con
  `storageQuotaExceeded`. Solo sirven contra una unidad compartida, y eso
  requiere Google Workspace — la cuenta del gimnasio es `@gmail.com`.
- La alternativa (rclone + refresh token OAuth) caduca **cada 7 días** si la
  pantalla de consentimiento de Google Cloud se queda en modo *Testing*.

Crea un bucket **privado** y genera una credencial con permiso de escritura
solo sobre ese bucket.

### 1.2 Secrets en GitHub

`Settings → Secrets and variables → Actions`.

**Nuevos** (los cinco):

| Secret | R2 | B2 |
|---|---|---|
| `BACKUP_S3_ENDPOINT` | `https://<account_id>.r2.cloudflarestorage.com` | `https://s3.<region>.backblazeb2.com` |
| `BACKUP_S3_BUCKET` | nombre del bucket | nombre del bucket |
| `BACKUP_S3_ACCESS_KEY_ID` | Access Key ID | keyID |
| `BACKUP_S3_SECRET_ACCESS_KEY` | Secret Access Key | applicationKey |
| `BACKUP_S3_REGION` | `auto` | p. ej. `eu-central-003` |

**Comprobar que ya existen:**

| Secret | Ojo con |
|---|---|
| `SUPABASE_DB_URL` | Tiene que ser la cadena del **session pooler (puerto 5432)**. La conexión directa (`db.<ref>.supabase.co`) es IPv6 y los runners de GitHub son solo IPv4. El transaction pooler (6543) tampoco vale: `pg_dump` necesita sesión. |
| `SUPABASE_SERVICE_ROLE_KEY` | Para descargar los ficheros de Storage |
| `BACKUP_PASSPHRASE` | Cifrado simétrico AES256 de los volcados |

**Opcional:** `BACKUP_ALERT_WEBHOOK` — sin él, un backup fallido solo deja un
error en la pestaña de Actions.

> ⚠️ **Guarda `BACKUP_PASSPHRASE` fuera de GitHub**, en el gestor de
> contraseñas del gimnasio. La copia externa existe justamente para el
> escenario «se pierde el acceso a la cuenta de GitHub»; si la llave vive solo
> ahí, se pierde con ella y los backups no sirven de nada.

### 1.3 Llevar el workflow a `main`

Todo está commiteado y subido en la rama
**`chore/backup-y-hardening-seguridad`**, pero eso no basta: los `schedule` de
GitHub Actions **solo se ejecutan desde la rama por defecto**, y el
`workflow_dispatch` ni siquiera aparece en la pestaña Actions hasta que el
fichero está en `main`.

Así que mientras no se mergee, **el backup no corre ni se puede lanzar a
mano**.

Las migraciones que lleva la rama **ya están aplicadas en producción**; sus
ficheros solo documentan lo hecho, con los nombres alineados a las versiones
registradas en `supabase_migrations.schema_migrations`.

### 1.4 Lanzarlo a mano antes de fiarse del cron

`Actions → Backup BD → Run workflow`.

El workflow verifica solo: que el volcado no está truncado, que contiene las
tablas esperadas y datos en `auth.users`, que el cifrado se puede deshacer, y
que el número de ficheros de Storage descargados cuadra con los que hay. Si
algo falla, lo dice.

Comprobar después: artifact `db-backup-<STAMP>` con los dos `.gpg`, y los
mismos ficheros en `s3://<bucket>/la-nave/<año>/<mes>/`.

---

## Fase 2 — Baseline de migraciones

**No empezar hasta que la Fase 1 esté verde.** El motivo del orden: el volcado
que produce el backup *es* el baseline, ya verificado. Cortarlo de un
`pg_dump` hecho a mano que nadie ha probado a restaurar es asumir un riesgo
gratis.

### Por qué hace falta

`supabase/migrations/` es un registro histórico, **no reproducible**: 51
ficheros y solo 21 registrados; varios marcados `⚠️ OBSOLETA — NO EJECUTAR` y
literalmente inejecutables (`20260620_rls_policies.sql` usa
`CREATE POLICY IF NOT EXISTS`, que no es sintaxis válida de Postgres). Los 49
antiguos están trackeados en git, así que borrarlos **no pierde el porqué**:
queda en el historial.

### Pasos

1. Descargar el artifact y descifrar → ahí está el esquema real.
2. De ahí sale `supabase/migrations/00000000000000_baseline.sql`.
3. Añadirle a mano lo que un dump de `public`/`auth`/`storage` **no trae**
   (ver tabla abajo).
4. Borrar los 49 ficheros antiguos.
5. `npx supabase migration repair --status applied 00000000000000`.
6. A partir de ahí, una migración por cambio, con el CLI.

### Lo que el baseline TIENE que incluir a mano

Comprobado contra la base el 2026-09-19:

| Elemento | Si falta |
|---|---|
| Trigger `auth.users → on_auth_user_created` | **Los registros nuevos no crean perfil.** Silencioso |
| Cron `payment-reminders-daily` (09:00) | Sin recordatorios de pago |
| Cron `apply-weekly-templates` (Dom 23:00) | Sin plantillas semanales |
| Buckets `avatars` (**público**) y `public_brand` (**privado**) | Fotos rotas; restaurarlos con la visibilidad cambiada es un fallo de seguridad |
| 3 políticas RLS de `storage.objects` | Nadie puede subir ni borrar su avatar |
| Extensiones: `pgcrypto`, `uuid-ossp` (`extensions`), `pg_cron`, `pg_net` (`public`) | Fallan funciones y cron |

Los **cron jobs no son esquema**: son filas en `cron.job`. Ni siquiera un dump
de `public`+`auth`+`storage` los trae. Hay que escribirlos como
`cron.schedule(...)`.

---

## Herramientas en el ordenador personal

El servidor es **PostgreSQL 17.6**, así que cualquier cliente tiene que ser
**17.6 o superior**: un `pg_dump` más antiguo se niega a volcar un servidor más
nuevo.

| Para qué | Herramienta | Cómo |
|---|---|---|
| Descifrar el artifact (Fase 1 y 2) | **gpg** | Git for Windows ya lo trae (`C:\Program Files\Git\usr\bin\gpg.exe`). En macOS/Linux: `brew install gnupg` / `apt install gnupg` |
| `migration repair`, `db push` (Fase 2) | **Supabase CLI** | `npx supabase login` y `npx supabase link --project-ref llkcidbbadjgrrquexqd`. **No necesita Docker**: habla directamente con la base remota |
| Simulacro de restauración | **psql + pg_dump 17** | Ver abajo |

### Instalar psql y pg_dump 17 en Windows

La vía menos invasiva, sin servidor ni permisos de administrador: el zip de
binarios de [enterprisedb.com/download-postgresql-binaries](https://www.enterprisedb.com/download-postgresql-binaries)
(Windows x86-64, versión 17.x). Descomprimir en `C:\pg17` y añadir al PATH:

```powershell
[Environment]::SetEnvironmentVariable('Path',
  [Environment]::GetEnvironmentVariable('Path','User') + ';C:\pg17\pgsql\bin', 'User')
```

Alternativas: `winget install PostgreSQL.PostgreSQL.17` o
`choco install postgresql17` (ambas instalan también el servidor; el
instalador de EDB permite desmarcarlo y quedarse solo con *Command Line
Tools*).

**Después de tocar el PATH, cierra la terminal entera.** Los cambios de
entorno solo los heredan los procesos nuevos; una terminal ya abierta sigue
con el PATH viejo.

Verificar antes de fiarse:

```bash
pg_dump --version   # >= 17.6
```

Si hay otro Postgres viejo instalado (los arrastran pgAdmin y otras
herramientas), puede ganar en el PATH y los volcados fallarán con un error de
*server version mismatch*.

---

## Contexto que conviene no perder

- **Procedimiento de restauración completo:** [`RESTORE.md`](RESTORE.md).
- **Simulacro trimestral:** está en `RESTORE.md` y es la parte que de verdad
  valida todo esto. Un backup que nunca se ha restaurado no es un backup.
- El workflow copia **todos** los buckets de Storage, no una lista fija: si se
  crea uno nuevo entra solo, sin tocar el fichero.
- `AWS_REQUEST_CHECKSUM_CALCULATION=when_required` está puesto a propósito en
  el paso de subida: desde la v2.23 el CLI de AWS manda cabeceras
  `x-amz-checksum-*` que algunos backends compatibles con S3 rechazan con un
  400. Es la causa típica de que la primera subida a R2 o B2 falle sin motivo
  aparente.
- **Protección contra contraseñas filtradas (HaveIBeenPwned): descartada**, es
  de plan Pro. Lo que **sí** está disponible en free tier y sigue pendiente es
  subir `password_min_length` a 8 y exigir caracteres en
  `Authentication → Providers → Email`. Hoy el servidor acepta contraseñas de
  6 caracteres sin requisitos, mientras que el Zod de la app exige 8 más
  mayúscula, minúscula, número y símbolo: quien llame directo a
  `/auth/v1/signup` con la anon key se salta esa validación.
