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

export function useRefreshOnReturn(navigation: Nav, refresh: () => void): void {
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    // El primer foco es la propia apertura
    let firstFocus = true;
    let pending = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const run = () => {
      if (!pending) return;
      pending = false;
      clearTimeout(timer);
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
  }, [navigation]);
}
