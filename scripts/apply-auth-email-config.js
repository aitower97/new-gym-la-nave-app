#!/usr/bin/env node
/**
 * Aplica la configuración de email de Supabase Auth (SMTP de Resend, asuntos y
 * plantillas) vía Management API.
 *
 * Existe porque esa configuración vive solo en el dashboard: no está en git,
 * nadie la revisa y nadie se entera si cambia. Con esto las plantillas viven en
 * supabase/email-templates/ y este script las empuja.
 *
 * Uso:
 *   node scripts/apply-auth-email-config.js            # solo muestra el diff
 *   node scripts/apply-auth-email-config.js --apply    # lo aplica
 *
 * Variables de entorno:
 *   SUPABASE_ACCESS_TOKEN  (obligatoria)  PAT de supabase.com/dashboard/account/tokens
 *   RESEND_API_KEY         (obligatoria con --apply)  clave `re_...` de Resend
 *   MAIL_FROM              (obligatoria con --apply)  p.ej. no-reply@tudominio.es
 *   MAIL_FROM_NAME         (opcional)     por defecto "La Nave Strength Center"
 *   SUPABASE_PROJECT_REF   (opcional)     por defecto el proyecto de producción
 *   SMTP_PORT              (opcional)     por defecto 465
 */

const fs = require('fs');
const path = require('path');

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || 'llkcidbbadjgrrquexqd';
const API = `https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`;
const PLANTILLAS = path.join(__dirname, '..', 'supabase', 'email-templates');

const apply = process.argv.includes('--apply');

// Claves que no se imprimen nunca, ni en el diff.
const SECRETAS = new Set(['smtp_pass']);

function leer(fichero) {
  return fs.readFileSync(path.join(PLANTILLAS, fichero), 'utf8');
}

function fallar(mensaje) {
  console.error(`\n  ERROR: ${mensaje}\n`);
  process.exit(1);
}

/**
 * Node no usa el almacén de certificados de Windows, así que detrás de un proxy
 * TLS corporativo toda llamada muere con un escueto "fetch failed". Se traduce
 * a algo accionable.
 */
async function pedir(url, opciones) {
  try {
    return await fetch(url, opciones);
  } catch (e) {
    const codigo = e.cause && e.cause.code;
    if (codigo === 'SELF_SIGNED_CERT_IN_CHAIN' || codigo === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE') {
      fallar(
        'TLS rechazado: hay un proxy corporativo interceptando la conexión.\n' +
          '  Exporta el certificado raíz de tu empresa y apunta a él:\n' +
          '    NODE_EXTRA_CA_CERTS=C:\\ruta\\raiz-empresa.pem node scripts/apply-auth-email-config.js\n' +
          '  No uses NODE_TLS_REJECT_UNAUTHORIZED=0: este script envía la API key de Resend.'
      );
    }
    fallar(`No se pudo conectar con la Management API: ${e.message}${codigo ? ` (${codigo})` : ''}`);
  }
}

async function main() {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) fallar('Falta SUPABASE_ACCESS_TOKEN.');

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const res = await pedir(API, { headers });
  if (!res.ok) fallar(`No se pudo leer la configuración (HTTP ${res.status}): ${await res.text()}`);
  const actual = await res.json();

  const deseado = {
    // SMTP de Resend. El usuario es literalmente "resend"; la contraseña es la
    // API key. El remitente tiene que estar en el dominio verificado en Resend,
    // o los envíos se rechazan.
    smtp_host: 'smtp.resend.com',
    smtp_port: Number(process.env.SMTP_PORT || 465),
    smtp_user: 'resend',
    smtp_admin_email: process.env.MAIL_FROM,
    smtp_sender_name: process.env.MAIL_FROM_NAME || 'La Nave Strength Center',

    // Las plantillas prometen "expira en 15 minutos" y la config decía 3600s
    // (60 min). Se alinea a 900s: además de cumplir lo que dice el email, una
    // ventana más corta para un OTP de 8 dígitos es mejor.
    mailer_otp_exp: 900,

    // El cuerpo estaba en español pero los asuntos eran los de fábrica, en
    // inglés. Es lo primero que se ve en la bandeja de entrada.
    mailer_subjects_confirmation: 'Confirma tu cuenta en La Nave',
    mailer_subjects_recovery: 'Recupera tu contraseña de La Nave',

    mailer_templates_confirmation_content: leer('confirmation.html'),
    mailer_templates_recovery_content: leer('recovery.html'),
  };

  if (apply) {
    const key = process.env.RESEND_API_KEY;
    if (!key) fallar('Falta RESEND_API_KEY.');
    if (!key.startsWith('re_')) fallar('RESEND_API_KEY no parece una clave de Resend (debe empezar por "re_").');
    if (!deseado.smtp_admin_email) fallar('Falta MAIL_FROM (remitente, debe estar en el dominio verificado en Resend).');
    deseado.smtp_pass = key;
  }

  console.log(`\nProyecto: ${PROJECT_REF}\n`);
  let cambios = 0;
  for (const [k, v] of Object.entries(deseado)) {
    if (SECRETAS.has(k)) {
      console.log(`  ~ ${k}: (oculto)`);
      cambios++;
      continue;
    }
    const antes = actual[k];
    const igual = String(antes) === String(v);
    if (igual) {
      console.log(`  = ${k}`);
    } else {
      cambios++;
      const fmt = (x) =>
        typeof x === 'string' && x.length > 60 ? `<${x.length} bytes>` : JSON.stringify(x);
      console.log(`  ~ ${k}: ${fmt(antes)}  ->  ${fmt(v)}`);
    }
  }

  if (!apply) {
    console.log(`\n${cambios} cambio(s) pendiente(s). Relanza con --apply para aplicarlos.\n`);
    return;
  }

  const patch = await pedir(API, { method: "PATCH", headers, body: JSON.stringify(deseado) });
  if (!patch.ok) fallar(`El PATCH falló (HTTP ${patch.status}): ${await patch.text()}`);

  // Releer para confirmar que quedó grabado, en vez de fiarse del 200.
  const verif = await (await pedir(API, { headers })).json();
  console.log('\nAplicado. Verificación:');
  for (const k of ['smtp_host', 'smtp_port', 'smtp_user', 'smtp_admin_email', 'mailer_otp_exp']) {
    console.log(`  ${k} = ${verif[k]}`);
  }
  console.log('');
}

main().catch((e) => fallar(e.message));
