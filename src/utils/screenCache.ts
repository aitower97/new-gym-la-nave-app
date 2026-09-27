/**
 * Caché de pantallas para "enseñar lo último y refrescar por detrás"
 * (stale-while-revalidate). Al volver a una pantalla, sus datos salen al
 * instante desde aquí y la carga de red solo los actualiza, sin ruedecita.
 *
 * Vive en memoria mientras la app está abierta. No se guarda en disco a
 * propósito: varias pantallas de admin llevan datos personales de socios
 * (email, teléfono, pagos) y AsyncStorage no va cifrado.
 */

const store = new Map<string, unknown>();

export function getCached<T>(key: string): T | undefined {
  return store.get(key) as T | undefined;
}

export function setCached<T>(key: string, value: T): void {
  store.set(key, value);
}

/** Al cerrar sesión: que el siguiente usuario del móvil no vea datos del anterior. */
export function clearScreenCache(): void {
  store.clear();
}
