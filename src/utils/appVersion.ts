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
export async function getAppVersionConfig(): Promise<AppVersionConfig | null> {
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
