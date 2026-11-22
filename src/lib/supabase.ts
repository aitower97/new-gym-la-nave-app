import { createClient } from '@supabase/supabase-js';
import { secureStorage } from './secureStorage';
import { isWriteRequest, markDataChanged } from '../utils/dataVersion';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Sin estas variables, createClient() lanza un escueto "supabaseUrl is
 * required." al importar este módulo — antes de que React monte nada, así que
 * ni el ErrorBoundary ni Sentry (que se inicializa en App.tsx) llegan a verlo.
 * El síntoma es una pantalla negra sin un solo mensaje.
 *
 * Esto no evita el fallo, pero lo convierte en algo que se puede leer y
 * arreglar. Ojo con los dos sitios: son independientes y fallan por separado.
 */
const faltantes = [
  !supabaseUrl && 'EXPO_PUBLIC_SUPABASE_URL',
  !supabaseAnonKey && 'EXPO_PUBLIC_SUPABASE_ANON_KEY',
].filter(Boolean);

if (faltantes.length > 0) {
  throw new Error(
    `[supabase] Faltan variables de entorno: ${faltantes.join(', ')}.\n` +
      '· En desarrollo local: defínelas en .env y reinicia el servidor ' +
      '(npx expo start --clear).\n' +
      '· En una build de EAS: .env NO se sube (está en .gitignore), así que ' +
      'tienen que estar en el bloque "env" del perfil correspondiente de ' +
      'eas.json, o como environment variables del proyecto en expo.dev.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: secureStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
  global: {
    // Cada escritura sube el contador de cambios: así las pantallas saben si
    // al volver a ellas hay algo nuevo que recargar (ver dataVersion.ts)
    fetch: (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (isWriteRequest(url, init?.method)) markDataChanged();
      return fetch(input, init);
    },
  },
});