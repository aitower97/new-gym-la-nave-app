# Restaurar la base de datos

Procedimiento para recuperar La Nave desde un backup del workflow
[`db-backup.yml`](../.github/workflows/db-backup.yml).

Un backup que nunca se ha restaurado no es un backup. Haz el simulacro del
final de este documento al menos una vez al trimestre, contra un proyecto de
Supabase de usar y tirar.

> ⚠️ **A 2026-09-19 el workflow todavía no se ha ejecutado nunca** y faltan los
> secrets del destino externo, así que **no hay ningún backup del que
> restaurar**. Los pasos pendientes están en
> [`BACKUP-SETUP.md`](BACKUP-SETUP.md).

## Qué hay en cada backup

Cada ejecución produce dos ficheros, los dos cifrados con AES256 y la misma
passphrase (secret `BACKUP_PASSPHRASE`):

| Fichero | Contenido |
|---|---|
| `backup-<STAMP>.sql.gz.gpg` | Volcado de los esquemas `public`, `auth` y `storage` |
| `storage-<STAMP>.tar.gz.gpg` | Ficheros de **todos** los buckets de Storage |

Lo que **no** entra: logs de auditoría, refresh tokens y sesiones de `auth`
(se excluyen a propósito; tras un restore todo el mundo vuelve a iniciar
sesión), y la tabla `public.keepalive_ping`.

## Dónde están

1. **GitHub Actions → workflow "Backup BD" → artifact `db-backup-<STAMP>`.**
   Los últimos 90 días. Es la vía rápida.
2. **Bucket S3 externo**, en `s3://<BACKUP_S3_BUCKET>/la-nave/<año>/<mes>/`.
   Es la copia que sigue existiendo si se pierde el acceso a GitHub.

## La carpeta de migraciones NO reconstruye la base

`supabase/migrations/` es un registro histórico, no un histórico reproducible.
No ejecutes `supabase db push` contra un proyecto vacío esperando la base de
datos de vuelta: **no funciona**.

- De los 51 ficheros, solo 21 están registrados en
  `supabase_migrations.schema_migrations`. El resto son anteriores a que el
  proyecto empezara a usar el CLI.
- Varios están marcados `⚠️ OBSOLETA — NO EJECUTAR` en su cabecera y son
  literalmente inejecutables: `20260620_rls_policies.sql` usa
  `CREATE POLICY IF NOT EXISTS`, que no es sintaxis válida de Postgres.
- Los nombres de los ficheros antiguos (`20260620_…`) no coinciden con las
  versiones registradas, y cuatro comparten el mismo prefijo de fecha.

**La fuente de verdad para recuperar es el volcado cifrado**, que lleva el
esquema completo además de los datos. Las migraciones sirven para leer por qué
algo está como está, y para los cambios incrementales de aquí en adelante.

## Restauración

### 1. Descifrar

```bash
gpg --decrypt --output backup.sql.gz backup-<STAMP>.sql.gz.gpg
gunzip backup.sql
```

Pedirá la passphrase (`BACKUP_PASSPHRASE`). Si no la tienes a mano fuera de
los secrets de GitHub, **el backup no sirve de nada**: guárdala en el gestor
de contraseñas del gimnasio, no solo en GitHub.

### 2. Preparar el proyecto destino

Si el proyecto original se ha perdido, crea uno nuevo en Supabase. Apunta la
nueva `project-ref`: hay que cambiarla después en varios sitios (paso 5).

El volcado **no** trae `DROP` previos, así que el destino tiene que estar
limpio. Sobre un proyecto con datos, los `CREATE TABLE` fallarán.

### 3. Cargar el volcado

Usa la cadena del *session pooler* (puerto 5432), no la conexión directa:

```bash
psql "postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres" \
  -v ON_ERROR_STOP=1 -f backup.sql
```

Verás errores en objetos que Supabase ya gestiona (roles, extensiones,
algunos triggers de `auth`). Son esperables y por eso conviene revisar la
salida en vez de confiar en el código de retorno. Lo que **no** puede fallar:
`CREATE TABLE` y `COPY` de las tablas de `public` y de `auth.users`.

Comprobación rápida:

```sql
SELECT count(*) FROM auth.users;
SELECT count(*) FROM public.profiles;
SELECT count(*) FROM public.bookings;
```

### 4. Restaurar los ficheros de Storage

```bash
gpg --decrypt --output storage.tar.gz storage-<STAMP>.tar.gz.gpg
tar xzf storage.tar.gz          # deja ./storage/<bucket>/<ruta original>
```

El tar trae una carpeta por bucket. Hay que recrear cada bucket en el
proyecto destino **con la misma visibilidad que tenía** (`avatars` es público,
`public_brand` es privado) y subir su contenido respetando las rutas
`<userId>/<fichero>`. Con la CLI de Supabase, bucket a bucket:

```bash
supabase storage cp -r ./storage/avatars      ss:///avatars      --experimental
supabase storage cp -r ./storage/public_brand ss:///public_brand --experimental
```

Las políticas RLS de `storage.objects` (subir/editar/borrar el avatar propio)
vienen en el volcado SQL, no hay que recrearlas a mano.

Las rutas tienen que coincidir exactamente: `profiles.avatar_url` guarda la
URL pública completa, así que si cambian, las fotos salen rotas.

### 5. Si la project-ref ha cambiado

Hay que actualizar, como mínimo:

- `.env` y los secrets de EAS: `EXPO_PUBLIC_SUPABASE_URL`,
  `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- Secrets del repo: `SUPABASE_DB_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- `--project-ref` en `.mcp.json`
- `SUPABASE_URL` en `supabase-keepalive.yml` y en `db-backup.yml`
- Redesplegar las edge functions de `supabase/functions/`
- Rehacer la configuración de Auth que no vive en la BD: plantillas de email,
  URLs de redirect, proveedores.

Y ojo: `profiles.avatar_url` contiene la ref antigua incrustada en la URL.
Hay que reescribirla:

```sql
UPDATE public.profiles
SET avatar_url = replace(avatar_url, '<ref-antigua>', '<ref-nueva>')
WHERE avatar_url LIKE '%<ref-antigua>%';
```

## Simulacro trimestral

1. Crea un proyecto Supabase temporal.
2. Baja el último artifact y haz los pasos 1–4 contra ese proyecto.
3. Apunta la app a él cambiando `.env` y comprueba: login, listado de clases,
   reservar una clase, y que se ve una foto de perfil.
4. Borra el proyecto temporal.

Si algo falla, arréglalo en el workflow **ese día**. Es el único momento en el
que descubrirlo sale gratis.

## Secrets que necesita el workflow

| Secret | Para qué |
|---|---|
| `SUPABASE_DB_URL` | Cadena del session pooler (puerto 5432) |
| `SUPABASE_SERVICE_ROLE_KEY` | Descargar los ficheros del bucket |
| `BACKUP_PASSPHRASE` | Cifrado simétrico de los volcados |
| `BACKUP_S3_ENDPOINT` | Endpoint S3 (R2 / B2 / AWS) |
| `BACKUP_S3_BUCKET` | Bucket destino de la copia externa |
| `BACKUP_S3_ACCESS_KEY_ID` | Credencial del bucket |
| `BACKUP_S3_SECRET_ACCESS_KEY` | Credencial del bucket |
| `BACKUP_S3_REGION` | Región (`auto` en Cloudflare R2) |
| `BACKUP_ALERT_WEBHOOK` | Aviso si el backup falla (opcional) |
