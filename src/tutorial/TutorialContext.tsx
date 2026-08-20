import { StackActions } from '@react-navigation/native';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { supabase } from '../lib/supabase';
import { navigationRef } from '../navigation/navigationRef';
import { TutorialStep, USER_TUTORIAL_STEPS } from './tutorialSteps';

export interface SpotlightRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface TutorialContextValue {
  isActive: boolean;
  isReady: boolean;
  currentStep: TutorialStep | null;
  stepIndex: number;
  totalSteps: number;
  spotlightRect: SpotlightRect | null;
  /** steps: qué recorrido lanzar (usuario, admin...). Por defecto el de usuario. */
  start: (steps?: TutorialStep[]) => void;
  next: () => void;
  skip: () => void;
  registerTarget: (id: string, ref: React.RefObject<View | null>) => void;
  unregisterTarget: (id: string) => void;
  /** Cómo hacer visible un target que puede quedar fuera de la pantalla
   * dentro de una lista con scroll (p. ej. "scrollea hasta el final"),
   * disparado justo antes de medirlo. */
  registerScrollAction: (id: string, action: () => void) => void;
  unregisterScrollAction: (id: string) => void;
  /** Marca si una pantalla ha terminado de cargar sus datos — permite al
   * motor distinguir "el target aún puede aparecer" (sigue cargando) de
   * "el target genuinamente no existe" (ya cargó y no está), para no
   * esperar el timeout completo en el segundo caso. */
  setScreenLoaded: (screen: string, loaded: boolean) => void;
}

const TutorialContext = createContext<TutorialContextValue | null>(null);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function measure(view: View): Promise<SpotlightRect | null> {
  return new Promise((resolve) => {
    try {
      view.measureInWindow((x, y, width, height) => {
        // [x,y,width,height].every(Number.isFinite) también descarta
        // undefined (una vista desmontada puede llamar al callback sin
        // argumentos) — "width <= 0" por sí solo deja pasar NaN/undefined.
        if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) resolve(null);
        else resolve({ x, y, width, height });
      });
    } catch {
      resolve(null);
    }
  });
}

async function markTutorialSeen() {
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user?.id;
  if (!userId) return;
  await supabase.from('profiles').update({ has_seen_tutorial: true }).eq('id', userId);
}

export function TutorialProvider({ children }: { children: React.ReactNode }) {
  const stepsRef = useRef<TutorialStep[]>(USER_TUTORIAL_STEPS);
  const registry = useRef(new Map<string, React.RefObject<View | null>>());
  const scrollActions = useRef(new Map<string, () => void>());
  const screenLoaded = useRef(new Map<string, boolean>());
  const epochRef = useRef(0);

  const [isActive, setIsActive] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [totalSteps, setTotalSteps] = useState(stepsRef.current.length);
  const [spotlightRect, setSpotlightRect] = useState<SpotlightRect | null>(null);

  const registerTarget = useCallback((id: string, ref: React.RefObject<View | null>) => {
    registry.current.set(id, ref);
  }, []);

  const unregisterTarget = useCallback((id: string) => {
    registry.current.delete(id);
  }, []);

  const registerScrollAction = useCallback((id: string, action: () => void) => {
    scrollActions.current.set(id, action);
  }, []);

  const unregisterScrollAction = useCallback((id: string) => {
    scrollActions.current.delete(id);
  }, []);

  const setScreenLoaded = useCallback((screen: string, loaded: boolean) => {
    screenLoaded.current.set(screen, loaded);
  }, []);

  const finish = useCallback(() => {
    epochRef.current += 1;
    setIsActive(false);
    setIsReady(false);
    setSpotlightRect(null);
    markTutorialSeen();
  }, []);

  const goToStepIndex = useCallback(async (index: number) => {
    if (index >= stepsRef.current.length) { finish(); return; }

    const epoch = ++epochRef.current;
    const step = stepsRef.current[index];
    setStepIndex(index);
    setIsReady(false);
    setSpotlightRect(null);

    const currentRoute = navigationRef.isReady() ? navigationRef.getCurrentRoute()?.name : undefined;
    if (currentRoute !== step.screen && navigationRef.isReady()) {
      // Se limpia cualquier "cargada" residual de una visita anterior a esta
      // pantalla (p. ej. el usuario ya había entrado a Workout fuera del
      // tutorial, o en un intento previo) — si no, el bucle de espera de
      // abajo vería `screenLoaded` en `true` desde el instante 0, ANTES de
      // que la navegación real termine y el nuevo target pueda registrarse,
      // y saltaría el paso casi al momento aunque el target sí exista.
      screenLoaded.current.set(step.screen, false);
      const rootState = navigationRef.getRootState();
      // MainMenu (usuario) o AdminDashboard (admin) son las únicas pantallas
      // que SIEMPRE llevan {email, name} reales (vienen del login) — se usan
      // como base para cualquier pantalla nueva que el tour visite por
      // primera vez y que también los necesite.
      const homeParams = rootState?.routes.find((r) => r.name === 'MainMenu' || r.name === 'AdminDashboard')?.params as object | undefined;
      const existingRoute = rootState?.routes.find((r) => r.name === step.screen);
      const params = {
        ...(homeParams ?? {}),
        ...(existingRoute?.params as object ?? {}),
        ...(step.params ?? {}),
      };

      const dispatchNav = () => {
        if (existingRoute) {
          // React Navigation v7: navigate() ya NO reutiliza una pantalla que ya
          // existe en la pila salvo que sea la actual — crea una instancia
          // nueva (remonta el componente entero, perdiendo su estado). Para
          // volver a una pantalla que ya visitamos (p. ej. MainMenu tras pasar
          // por Reservation) hay que usar popTo explícitamente.
          navigationRef.dispatch(StackActions.popTo(step.screen as never, params as never));
        } else {
          (navigationRef.navigate as (name: string, params?: object) => void)(step.screen, params);
        }
      };
      dispatchNav();

      // Defensivo: si el dispatch anterior coincide con una transición de
      // navegación que aún estaba en curso en ese mismo instante (p. ej. el
      // usuario venía de tocar "Siguiente" justo cuando otra animación de
      // navegación se estaba asentando), React Navigation puede ignorarlo en
      // silencio y la pantalla se queda en la anterior para siempre — el
      // target de este paso nunca llegaría a existir. Se comprueba tras un
      // instante y, si la ruta sigue sin cambiar, se reintenta una vez.
      await sleep(400);
      if (epoch !== epochRef.current) return;
      if (navigationRef.getCurrentRoute()?.name !== step.screen) {
        dispatchNav();
      }
    }

    if (step.targetId === null) {
      // Da tiempo a que termine la transición de navegación antes de mostrar
      // la tarjeta centrada, para que no aparezca sobre la pantalla anterior.
      await sleep(currentRoute !== step.screen ? 350 : 0);
      if (epoch !== epochRef.current) return;
      setIsReady(true);
      return;
    }

    // Algunos targets son "opcionales" según el estado del usuario (p. ej. la
    // tarjeta de ejercicio o "Guardar" no existen si aún no tiene entreno
    // asignado) — pero el timeout tiene que cubrir con margen la navegación
    // real + la carga de datos de la pantalla destino (en Android, más lenta
    // que en iOS, esa cadena puede superar los 2-3s), o si no, pasos que SÍ
    // existen se saltan en silencio por pura lentitud, no porque no apliquen.
    // El botón "Saltar tutorial" ya está siempre visible durante la espera.
    const deadline = Date.now() + 4500;
    // Si la pantalla destino ya avisó que terminó de cargar sus datos (p.
    // ej. WorkoutScreen tras su fetch) y el target sigue sin existir, es
    // que genuinamente no aplica (sin entreno asignado hoy, etc.) — se da
    // un margen corto para animaciones de entrada en vez de agotar los
    // 4.5s completos con un spinner vacío que el usuario percibe como que
    // el tutorial se ha quedado colgado.
    const SCREEN_LOADED_GRACE = 900;
    let refFoundAt = 0;
    let loadedSkipAt = 0;
    let scrollFired = false;
    while (Date.now() < deadline) {
      if (epoch !== epochRef.current) return;
      const ref = registry.current.get(step.targetId);
      if (ref?.current) {
        if (!refFoundAt) refFoundAt = Date.now();
        // Si el target vive dentro de una lista con scroll y puede quedar
        // fuera de la parte visible (p. ej. "Guardar entrenamiento", al
        // final de la pantalla), la pantalla puede registrar cómo hacerlo
        // visible — se dispara una sola vez, en cuanto el ref existe.
        if (!scrollFired) {
          scrollFired = true;
          scrollActions.current.get(step.targetId)?.();
        }
        // Los targets entran con FadeInDown (hasta ~500ms con delay+duración):
        // si medimos nada más montarse, capturamos una posición intermedia de
        // la animación, no la final — esperamos a que se asiente antes de fiarnos.
        if (Date.now() - refFoundAt < 550) {
          await sleep(60);
          continue;
        }
        const rect = await measure(ref.current);
        if (epoch !== epochRef.current) return;
        if (rect) {
          setSpotlightRect(rect);
          setIsReady(true);
          // Re-mide varias veces más durante el segundo siguiente: si una
          // animación de entrada o un contenido cercano que aún cargaba
          // desplaza al target justo tras la primera medida, esto converge
          // a la posición final en vez de dejar el recuadro descolocado.
          const targetIdForRecheck = step.targetId!;
          for (const delayMs of [250, 500, 900]) {
            setTimeout(async () => {
              if (epoch !== epochRef.current) return;
              const freshRef = registry.current.get(targetIdForRecheck)?.current;
              if (!freshRef) return;
              const freshRect = await measure(freshRef);
              if (epoch !== epochRef.current || !freshRect) return;
              setSpotlightRect((prev) => (
                prev && prev.x === freshRect.x && prev.y === freshRect.y
                  && prev.width === freshRect.width && prev.height === freshRect.height
                  ? prev
                  : freshRect
              ));
            }, delayMs);
          }
          return;
        }
      } else if (screenLoaded.current.get(step.screen) === true) {
        if (!loadedSkipAt) loadedSkipAt = Date.now();
        else if (Date.now() - loadedSkipAt > SCREEN_LOADED_GRACE) break;
      }
      await sleep(150);
    }

    // El target nunca apareció (pantalla distinta, dato no cargado...):
    // saltamos el paso en vez de dejar el tutorial colgado.
    if (epoch === epochRef.current) goToStepIndex(index + 1);
  }, [finish]);

  const start = useCallback((steps: TutorialStep[] = USER_TUTORIAL_STEPS) => {
    stepsRef.current = steps;
    setTotalSteps(steps.length);
    setIsActive(true);
    goToStepIndex(0);
  }, [goToStepIndex]);

  const next = useCallback(() => {
    goToStepIndex(stepIndex + 1);
  }, [goToStepIndex, stepIndex]);

  const skip = useCallback(() => {
    finish();
  }, [finish]);

  const currentStep = isActive ? stepsRef.current[stepIndex] ?? null : null;

  const value = useMemo<TutorialContextValue>(() => ({
    isActive, isReady, currentStep, stepIndex, totalSteps,
    spotlightRect, start, next, skip, registerTarget, unregisterTarget,
    registerScrollAction, unregisterScrollAction, setScreenLoaded,
  }), [isActive, isReady, currentStep, stepIndex, totalSteps, spotlightRect, start, next, skip, registerTarget, unregisterTarget, registerScrollAction, unregisterScrollAction, setScreenLoaded]);

  return <TutorialContext.Provider value={value}>{children}</TutorialContext.Provider>;
}

export function useTutorial() {
  const ctx = useContext(TutorialContext);
  if (!ctx) throw new Error('useTutorial debe usarse dentro de TutorialProvider');
  return ctx;
}

export function useTutorialTarget(id: string) {
  const { registerTarget, unregisterTarget } = useTutorial();
  const ref = useRef<View>(null);

  useEffect(() => {
    registerTarget(id, ref);
    return () => unregisterTarget(id);
  }, [id, registerTarget, unregisterTarget]);

  return ref;
}

/**
 * Registra cómo hacer visible un target que puede quedar fuera de la parte
 * visible de la pantalla (dentro de un ScrollView) antes de resaltarlo — p.
 * ej. `() => scrollRef.current?.scrollToEnd({ animated: true })`.
 */
export function useTutorialScrollAction(id: string, action: () => void) {
  const { registerScrollAction, unregisterScrollAction } = useTutorial();
  const actionRef = useRef(action);
  actionRef.current = action;

  useEffect(() => {
    const stable = () => actionRef.current();
    registerScrollAction(id, stable);
    return () => unregisterScrollAction(id);
  }, [id, registerScrollAction, unregisterScrollAction]);
}

/**
 * Avisa al motor del tutorial de si una pantalla ha terminado de cargar sus
 * datos — p. ej. `useTutorialScreenLoaded('Workout', !loading)`. Permite
 * distinguir "el target puede tardar en aparecer" de "ya cargó y el target
 * genuinamente no existe" (sin entreno asignado hoy, etc.), para no esperar
 * el timeout completo en el segundo caso.
 */
export function useTutorialScreenLoaded(screen: string, loaded: boolean) {
  const { setScreenLoaded } = useTutorial();
  useEffect(() => {
    setScreenLoaded(screen, loaded);
  }, [screen, loaded, setScreenLoaded]);
}
