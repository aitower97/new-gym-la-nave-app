import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Caché de pantallas para "enseñar lo último y refrescar por detrás"
 * (stale-while-revalidate). Al volver a una pantalla, sus datos salen al
 * instante desde aquí y la carga de red solo los actualiza, sin ruedecita.
 *
 * Vive en memoria y, para que la app abra ya con contenido, una parte se
 * guarda también en el móvil: solo lo del socio (su menú y las reservas de
 * los próximos días, que es lo que ve cualquiera en la app: apodo y foto de
 * los apuntados). Lo del admin NUNCA va a disco: lleva datos personales de
 * socios (email, teléfono, pagos) y AsyncStorage no va cifrado.
 */

const store = new Map<string, unknown>();

const DISK_KEY = 'screenCache.v1';

function goesToDisk(key: string): boolean {
  if (key.startsWith('menu:')) return true;
  return key.startsWith('reservas:') && !key.startsWith('reservas:admin');
}

export function getCached<T>(key: string): T | undefined {
  return store.get(key) as T | undefined;
}

export function setCached<T>(key: string, value: T): void {
  store.set(key, value);
  if (goesToDisk(key)) schedulePersist();
}

let persistTimer: ReturnType<typeof setTimeout> | undefined;

/** Escribe en el móvil como mucho una vez por segundo (varias pantallas guardan a la vez). */
function schedulePersist(): void {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    // Solo días de ayer en adelante: lo pasado no se vuelve a mirar al abrir
    const ayer = new Date();
    ayer.setDate(ayer.getDate() - 1);
    const desde = `${ayer.getFullYear()}-${String(ayer.getMonth() + 1).padStart(2, '0')}-${String(ayer.getDate()).padStart(2, '0')}`;
    const entries: [string, unknown][] = [];
    for (const [key, value] of store) {
      if (!goesToDisk(key)) continue;
      const fecha = key.startsWith('reservas:') ? key.slice(key.lastIndexOf(':') + 1) : null;
      if (fecha && fecha < desde) continue;
      entries.push([key, value]);
    }
    AsyncStorage.setItem(DISK_KEY, JSON.stringify(entries)).catch(() => {});
  }, 1000);
}

/**
 * Al abrir la app, antes de pintar: recupera lo guardado. Nunca tarda más
 * de 300 ms (si el móvil va lento, se abre sin caché, como antes).
 */
export async function hydrateScreenCache(): Promise<void> {
  const read = AsyncStorage.getItem(DISK_KEY)
    .then((raw) => {
      if (!raw) return;
      for (const [key, value] of JSON.parse(raw) as [string, unknown][]) {
        if (!store.has(key) && goesToDisk(key)) store.set(key, value);
      }
    })
    .catch(() => {});
  await Promise.race([read, new Promise((resolve) => setTimeout(resolve, 300))]);
}

/** Al cerrar sesión: que el siguiente usuario del móvil no vea datos del anterior. */
export function clearScreenCache(): void {
  store.clear();
  clearTimeout(persistTimer);
  AsyncStorage.removeItem(DISK_KEY).catch(() => {});
}
