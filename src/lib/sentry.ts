import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

// Sin DSN (no configurado en .env / secretos de EAS), todas las funciones
// son no-ops silenciosos — así el resto de la app puede llamarlas siempre
// sin comprobar si Sentry está activo.
export function initSentry() {
  if (!dsn) {
    if (__DEV__) console.log('[Sentry] EXPO_PUBLIC_SENTRY_DSN no configurado — desactivado');
    return;
  }
  Sentry.init({
    dsn,
    environment: __DEV__ ? 'development' : 'production',
    release: `gym-app@${Constants.expoConfig?.version ?? 'unknown'}`,
    debug: __DEV__,
    tracesSampleRate: __DEV__ ? 1.0 : 0.2,
  });
}

export function captureError(error: Error, context?: Record<string, any>) {
  if (!dsn) {
    if (__DEV__) console.error('[Sentry:off]', error, context);
    return;
  }
  Sentry.captureException(error, context ? { extra: context } : undefined);
}

export function captureMessage(message: string, level: Sentry.SeverityLevel = 'info') {
  if (!dsn) return;
  Sentry.captureMessage(message, level);
}

export function addBreadcrumb(message: string, data?: Record<string, any>) {
  if (!dsn) return;
  Sentry.addBreadcrumb({ message, data, timestamp: Date.now() / 1000 });
}

export function identifyUser(userId: string, email?: string, name?: string) {
  if (!dsn) return;
  Sentry.setUser({ id: userId, email, username: name });
}

export function clearUser() {
  if (!dsn) return;
  Sentry.setUser(null);
}
