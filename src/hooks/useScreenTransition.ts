/**
 * useScreenTransition.ts — No cargar trabajo pesado mientras una pantalla
 * entra deslizándose.
 *
 * Con el caché de pantallas (screenCache) una lista entera (socios, clases
 * del mes...) se pintaba en el mismo instante del toque: el hilo de JS se
 * ocupaba cientos de ms antes de que empezara la animación y el cambio de
 * pantalla se notaba lento y a tirones. Igual al volver atrás: la recarga
 * "por detrás" repintaba la pantalla en mitad de la animación.
 *
 * - useTransitionDone: false mientras la pantalla entra; luego true. Hasta
 *   entonces se enseña el skeleton (ligero) y después el contenido.
 * - useRefreshOnReturn: recarga al volver a la pantalla (no al abrirla, que
 *   ya carga la propia pantalla), cuando ha terminado la animación de vuelta.
 */

import { useEffect, useRef, useState } from 'react';
import { getDataVersion } from '../utils/dataVersion';

// Si no llega el aviso de fin de animación (web, pantalla sin animación), no esperar más
const FALLBACK_MS = 600;

type Nav = { addListener: (event: any, callback: (e: any) => void) => () => void };

export function useTransitionDone(navigation: Nav): boolean {
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (done) return;
    const finish = () => setDone(true);
    const timer = setTimeout(finish, FALLBACK_MS);
    const unsubscribe = navigation.addListener('transitionEnd', (e) => {
      if (!e?.data?.closing) finish();
    });
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, [navigation, done]);

  return done;
}

/**
 * skipIfFreshMs: no recargar al volver si la app no ha cambiado nada desde la
 * última carga y esta tiene menos de esos ms. Para pantallas que se visitan
 * a menudo (el menú): volver a ellas no cuesta ningún viaje.
 */
export function useRefreshOnReturn(navigation: Nav, refresh: () => void, opts?: { skipIfFreshMs?: number }): void {
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  const skipMs = opts?.skipIfFreshMs ?? 0;

  useEffect(() => {
    // El primer foco es la propia apertura
    let firstFocus = true;
    let pending = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    // La apertura de la pantalla cuenta como la primera carga
    let lastAt = Date.now();
    let lastVersion = getDataVersion();

    const run = () => {
      if (!pending) return;
      pending = false;
      clearTimeout(timer);
      if (skipMs > 0 && getDataVersion() === lastVersion && Date.now() - lastAt < skipMs) return;
      lastAt = Date.now();
      lastVersion = getDataVersion();
      refreshRef.current();
    };

    const unsubFocus = navigation.addListener('focus', () => {
      if (firstFocus) { firstFocus = false; return; }
      pending = true;
      clearTimeout(timer);
      timer = setTimeout(run, FALLBACK_MS);
    });
    const unsubEnd = navigation.addListener('transitionEnd', (e) => {
      if (!e?.data?.closing) run();
    });

    return () => {
      clearTimeout(timer);
      unsubFocus();
      unsubEnd();
    };
  }, [navigation, skipMs]);
}
