import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';

/**
 * Inicializar Sentry para error tracking y crash reporting
 */
export function initSentry() {
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
  
  if (!dsn) {
    console.warn('⚠️ Sentry DSN no configurado');
    return;
  }

  Sentry.init({
    dsn,
    debug: __DEV__, // Solo logs en desarrollo
    environment: __DEV__ ? 'development' : 'production',
    tracesSampleRate: 1.0, // 100% de transacciones en desarrollo
    
    // Información del release
    release: Constants.expoConfig?.version || '1.0.0',
    dist: Constants.expoConfig?.ios?.buildNumber || 
          Constants.expoConfig?.android?.versionCode?.toString() || 
          '1',

    // Contexto adicional
    beforeSend(event, hint) {
      // Filtrar errores de desarrollo que no queremos trackear
      if (__DEV__) {
        console.log('📤 Enviando error a Sentry:', event);
      }
      return event;
    },

    // Integrations
    integrations: [
    Sentry.reactNavigationIntegration(),
    ],
  });
}

/**
 * Capturar error manualmente
 */
export function captureError(error: Error, context?: Record<string, any>) {
  if (context) {
    Sentry.setContext('error_context', context);
  }
  Sentry.captureException(error);
}

/**
 * Capturar mensaje informativo
 */
export function captureMessage(message: string, level: Sentry.SeverityLevel = 'info') {
  Sentry.captureMessage(message, level);
}

/**
 * Añadir breadcrumb (rastro de navegación)
 */
export function addBreadcrumb(message: string, data?: Record<string, any>) {
  Sentry.addBreadcrumb({
    message,
    data,
    level: 'info',
  });
}

/**
 * Identificar usuario (para contexto en errores)
 */
export function identifyUser(userId: string, email?: string, name?: string) {
  Sentry.setUser({
    id: userId,
    email,
    username: name,
  });
}

/**
 * Limpiar usuario al logout
 */
export function clearUser() {
  Sentry.setUser(null);
}