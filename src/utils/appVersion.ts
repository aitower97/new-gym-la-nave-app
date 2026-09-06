import { supabase } from '../lib/supabase';

const LATEST_VERSION_KEY = 'latest_app_version';

// es.lanave.app (Android, app.json) / 6768556827 (ascAppId de eas.json, iOS).
export const ANDROID_STORE_URL = 'https://play.google.com/store/apps/details?id=es.lanave.app';
export const IOS_STORE_URL = 'https://apps.apple.com/app/id6768556827';
const IOS_LOOKUP_URL = 'https://itunes.apple.com/lookup?id=6768556827';

/**
 * Android no tiene un equivalente público y gratuito a la API de Apple para
 * saber la versión publicada — se mantiene a mano en app_settings, sin
 * pantalla de admin (lo actualiza el developer tras publicar en Play).
 */
export async function getLatestAndroidVersion(): Promise<string> {
  const { data, error } = await supabase.from('app_settings').select('value').eq('key', LATEST_VERSION_KEY).maybeSingle();
  if (error) throw error;
  return data?.value || '0.0.0';
}

/** API pública de Apple — versión real publicada ahora mismo en el App Store, sin mantenimiento manual. */
export async function getLatestIosVersion(): Promise<string | null> {
  try {
    const res = await fetch(IOS_LOOKUP_URL);
    const json = await res.json();
    return json?.results?.[0]?.version || null;
  } catch {
    return null; // sin red o Apple caído: no se muestra el aviso, no se rompe la app
  }
}

/** "1.9.1" < "1.10.0" numéricamente por tramo, no lexicográficamente ("1.9" no es < "1.10" como texto). */
export function isVersionBelow(current: string, latest: string): boolean {
  const c = current.split('.').map(Number);
  const l = latest.split('.').map(Number);
  const len = Math.max(c.length, l.length);
  for (let i = 0; i < len; i++) {
    const cv = c[i] || 0;
    const lv = l[i] || 0;
    if (cv < lv) return true;
    if (cv > lv) return false;
  }
  return false;
}
