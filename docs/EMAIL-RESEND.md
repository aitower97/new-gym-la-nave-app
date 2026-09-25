# Migrar el email a Resend

## Qué manda emails hoy

**Solo Supabase Auth.** La app no tiene código transaccional propio: los dos
únicos envíos salen de estas llamadas, y ambos entregan un **código OTP de 8
dígitos**, no un enlace.

| Flujo | Dónde | Plantilla |
|---|---|---|
| Confirmar cuenta al registrarse | `EmailVerificationScreen.tsx` → `auth.resend({ type: 'signup' })` | `confirmation.html` |
| Recuperar contraseña | `ForgotPasswordScreen.tsx` → `resetPasswordForEmail()` | `recovery.html` |

Que sean códigos y no enlaces importa: significa que `site_url` sigue
apuntando a `http://localhost:3000` **sin romper nada**, porque nadie pulsa un
enlace. No lo "arregles" sin antes comprobar que ningún flujo pasa a usar
`{{ .ConfirmationURL }}`.

Proveedor actual: **Gmail SMTP** (`smtp.gmail.com:587`, cuenta
`lanavesc.notifications@gmail.com`).

## Por eso el cambio a Resend casi no lleva código

Migrar es cambiar la configuración SMTP de Supabase Auth y el DNS del dominio.
**Ni una línea de la app cambia.** Lo único que se ha escrito es infraestructura
para que esa configuración deje de vivir solo en el dashboard:

- `supabase/email-templates/` — las plantillas, ahora en git y revisables.
- `scripts/apply-auth-email-config.js` — las empuja junto con el SMTP y los
  asuntos. Sin `--apply` solo enseña el diff.

## Pasos

### 1. Dominio en Resend

1. Crea la cuenta en [resend.com](https://resend.com).
2. **Domains → Add Domain** con el dominio que te pase el dueño.
3. Resend genera los registros DNS. **Pásaselos tal cual**, son tres tipos:
   - **MX** en un subdominio de envío (`send.tudominio.es`), para rebotes.
   - **TXT SPF**, que autoriza a Resend a enviar en tu nombre.
   - **TXT DKIM**, que firma los mensajes.
4. Añade también un **DMARC** si no existe. Empieza en modo observación para no
   tirar correo legítimo mientras se estabiliza:
   ```
   _dmarc.tudominio.es  TXT  "v=DMARC1; p=none; rua=mailto:dmarc@tudominio.es"
   ```
5. Espera a que Resend marque el dominio como **Verified**. Puede tardar desde
   minutos hasta unas horas según el proveedor de DNS.

> Sin dominio verificado, Resend solo deja enviar desde `onboarding@resend.dev`.
> Sirve para una prueba rápida, no para producción.

### 2. API key

**API Keys → Create API Key**, permiso de envío. Empieza por `re_`. Se muestra
una sola vez.

### 3. Aplicar la configuración

```bash
export SUPABASE_ACCESS_TOKEN=sbp_...          # PAT de Supabase
export RESEND_API_KEY=re_...
export MAIL_FROM="no-reply@tudominio.es"      # tiene que ser del dominio verificado
export MAIL_FROM_NAME="La Nave Strength Center"

node scripts/apply-auth-email-config.js           # diff, no escribe
node scripts/apply-auth-email-config.js --apply   # aplica y verifica
```

El script no imprime nunca la API key, y tras el `PATCH` vuelve a leer la
configuración para confirmar que quedó grabada en vez de fiarse del 200.

Además del SMTP aplica tres correcciones detectadas al revisar:

| Ajuste | Antes | Después | Por qué |
|---|---|---|---|
| `mailer_otp_exp` | 3600 (60 min) | 900 (15 min) | Las plantillas ya prometían 15 minutos: el email mentía. Y una ventana corta para un OTP es mejor |
| `mailer_subjects_confirmation` | "Confirm your email address" | "Confirma tu cuenta en La Nave" | El cuerpo estaba en español y el asunto en inglés |
| `mailer_subjects_recovery` | "Reset your password" | "Recupera tu contraseña de La Nave" | Igual |

### 4. Probar de verdad, con los dos flujos

No te fíes de que el dashboard diga que el SMTP es válido.

1. Regístrate con un email real que no esté en la base → debe llegar el correo
   de confirmación, **con código de 8 dígitos**, y el código debe funcionar.
2. Pide recuperar contraseña de ese usuario → mismo chequeo.
3. Mira **Resend → Logs**: ahí se ve si el mensaje salió, rebotó o lo marcaron
   como spam.
4. Comprueba que llega a **bandeja de entrada y no a spam**. Con SPF, DKIM y
   DMARC bien puestos debería, pero un dominio recién estrenado sin historial
   de envío a veces empieza en spam.

### 5. Solo cuando lo anterior funcione

Revoca la contraseña de aplicación de Gmail en la cuenta de Google y da de baja
`lanavesc.notifications@gmail.com` como remitente. No antes: si hay que volver
atrás, ese es el camino de vuelta.

## Cosas que conviene saber

- **Límites.** El plan gratuito de Resend cubre de sobra este volumen (unas
  decenas de correos al mes para ~54 socios). Confirma las cifras vigentes al
  crear la cuenta.
- **Supabase tiene su propio límite**, aparte del de Resend:
  `rate_limit_email_sent = 30` por hora y `smtp_max_frequency = 60` segundos
  entre correos al mismo usuario. Si algún día hacéis un alta masiva de socios,
  eso es lo que os frenará, no Resend.
- **Editar plantillas**: hazlo en `supabase/email-templates/` y lánzalas con el
  script. Si las tocas en el dashboard, el repo deja de reflejar la realidad y
  volvemos al problema que esto resuelve.
- **Puerto**: por defecto 465 (TLS). Si tu red lo bloquea, `SMTP_PORT=587`
  (STARTTLS) también funciona con Resend.
- **Proxy corporativo**: Node no usa el almacén de certificados de Windows, así
  que detrás de un proxy TLS el script muere con `fetch failed`. Se resuelve con
  `NODE_EXTRA_CA_CERTS=C:\ruta\raiz.pem`. Nunca con
  `NODE_TLS_REJECT_UNAUTHORIZED=0`: este script envía la API key.

## Email manual del admin (`send-email`) — implementado, falta configurar secretos

El admin ya puede mandar un email a los socios seleccionados desde el panel de
notificaciones (`AdminNotificationsScreen.tsx` → toggle "Enviar también por
email"), como complemento a la notificación in-app/push, no un sustituto.

- Edge function: `supabase/functions/send-email/index.ts`, **ya desplegada**.
  Verifica que quien llama es admin (mismo patrón que `create-user`/
  `delete-user`: JWT propio + chequeo de `user_roles` con cliente
  service-role) y resuelve los emails de los destinatarios en el servidor
  desde `profiles` — el cliente solo manda `userIds`, nunca direcciones.
- Interpola `{{nombre}}`/`{{apodo}}` por destinatario antes de mandar.
- Envía con `Reply-To: lanavesc@gmail.com` (secret opcional `MAIL_REPLY_TO`
  para cambiarlo). El remitente es `info@` (no `no-reply@`: a estos correos
  sí se espera respuesta), pero `info@` **no es un buzón real**: el MX raíz
  del dominio apunta a la recepción de Resend
  (`inbound-smtp.eu-west-1.amazonaws.com`), que nadie lee. El `Reply-To` es
  lo que hace que las respuestas lleguen a alguien. Lo que se escriba
  directamente a `info@` sin pulsar "Responder" sigue perdiéndose.
  Los correos de Auth (códigos OTP) sí deben seguir saliendo de `no-reply@`. Si algún día se monta un buzón real
  (`info@entrenoenlanave.es` con Zoho u Hostinger), cambiará el MX y bastará
  con apuntar `MAIL_REPLY_TO` a esa dirección.

**Pendiente, antes de que funcione de verdad**: la función lee
`RESEND_API_KEY`, `MAIL_FROM` y `MAIL_FROM_NAME` de `Deno.env` — son secretos
de Edge Functions, **no** hay forma de ponerlos por MCP, hay que hacerlo desde
la CLI o el dashboard:

```bash
supabase secrets set RESEND_API_KEY=re_...           # rota la key si ya se compartió por chat/otro canal
supabase secrets set MAIL_FROM="info@entrenoenlanave.es"   # no no-reply@: sí queremos respuestas
supabase secrets set MAIL_FROM_NAME="La Nave Strength Center"
```

O desde el dashboard: **Project Settings → Edge Functions → Secrets**. Si el
SMTP de Auth (arriba en este documento) ya tiene una `RESEND_API_KEY`
configurada como variable de entorno del script, puede reutilizarse el mismo
valor aquí — son sistemas distintos (SMTP de Auth vs. Resend API directa desde
esta función), pero puede ser la misma cuenta/key de Resend.

Sin estos tres secretos, la función responde 500 con
`"RESEND_API_KEY no configurado en los secretos del proyecto"` — no hace falta
volver a desplegarla una vez se configuren, los lee en caliente en cada
invocación.

## Otros emails que hoy no existen

Confirmación de reserva o aviso de clase cancelada **no se mandan por email
hoy** — van solo por push (`payment-reminders` y `smart-action`). Añadirlos es
trabajo aparte: seguirían el mismo patrón que `send-email`.
