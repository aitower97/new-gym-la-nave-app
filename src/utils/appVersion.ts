import { Platform } from 'react-native';
import { supabase } from '../lib/supabase';
import { AppVersionConfig } from './appVersionCompare';

export type { AppVersionConfig } from './appVersionCompare';
export { isVersionBelow, shouldBlockForUpdate } from './appVersionCompare';

/**
 * Config de versión mínima/última de la plataforma actual, desde
 * app_versions. null si no hay fila para esta plataforma o si Supabase no
 * responde — quien llama debe tratar null como "no bloquear", nunca como
 * "bloquear por precaución" (ver shouldBlockForUpdate en appVersionCompare.ts).
 */
// Los dos avisos de actualización la piden al abrir: una sola consulta para
// los dos (se vuelve a pedir en el siguiente arranque)
let versionConfigPromise: Promise<AppVersionConfig | null> | null = null;

export function getAppVersionConfig(): Promise<AppVersionConfig | null> {
  versionConfigPromise ??= fetchAppVersionConfig();
  return versionConfigPromise;
}

async function fetchAppVersionConfig(): Promise<AppVersionConfig | null> {
  try {
    const { data, error } = await supabase
      .from('app_versions')
      .select('minimum_version, latest_version, store_url')
      .eq('platform', Platform.OS)
      .maybeSingle();
    if (error || !data) return null;
    return data;
  } catch {
    return null; // sin red o Supabase caído: no se bloquea, no se rompe la app
  }
}
