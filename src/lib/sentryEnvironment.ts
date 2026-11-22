/**
 * Entorno con el que Sentry etiqueta cada evento, para separar lo que pasa en
 * las tiendas de las pruebas.
 *
 * - `development`: la app corriendo en modo desarrollo (Metro, emulador).
 * - Si no, el canal de EAS con el que se compiló la app: `development`,
 *   `preview` (APK interno) o `production` (tiendas). El canal viaja dentro
 *   de la build, así que no hace falta ninguna variable en eas.json.
 * - Builds anteriores a la 1.18.0 (sin canal) y cualquier otro caso: `production`.
 */
export function resolveSentryEnvironment(isDev: boolean, channel: string | null | undefined): string {
  if (isDev) return 'development';
  const c = (channel ?? '').trim().toLowerCase();
  return c || 'production';
}
