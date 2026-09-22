export type AppVersionConfig = {
  minimum_version: string;
  latest_version: string;
  store_url: string;
};

/** "1.9.1" < "1.10.0" numéricamente por tramo, no lexicográficamente ("1.9" no es < "1.10" como texto). */
export function isVersionBelow(current: string, minimum: string): boolean {
  const c = current.split('.').map(Number);
  const m = minimum.split('.').map(Number);
  const len = Math.max(c.length, m.length);
  for (let i = 0; i < len; i++) {
    const cv = c[i] || 0;
    const mv = m[i] || 0;
    if (cv < mv) return true;
    if (cv > mv) return false;
  }
  return false;
}

/**
 * Decisión pura de bloqueo, en su propio módulo (sin Platform/Supabase) para
 * poder testearla sin mockear nada — jest.config.js corre en Node puro y no
 * transforma node_modules, así que cualquier import de 'react-native' rompe
 * el test suite al cargar el módulo. config null (fallo de red, sin fila
 * para la plataforma) siempre es "no bloquear".
 */
export function shouldBlockForUpdate(installedVersion: string, config: AppVersionConfig | null): boolean {
  if (!config) return false;
  return isVersionBelow(installedVersion, config.minimum_version);
}
