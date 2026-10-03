/**
 * useScreenTransition: los hooks se ejecutan con un React mínimo (estado,
 * refs y efectos que corren al momento) y una navegación falsa que emite
 * focus / transitionEnd como la native-stack.
 */

let effectCleanups: (() => void)[] = [];
let stateSlots: unknown[] = [];
let slot = 0;
let rerender: () => void = () => {};

jest.mock('react', () => ({
  useState: (init: unknown) => {
    const i = slot++;
    if (!(i in stateSlots)) stateSlots[i] = typeof init === 'function' ? (init as () => unknown)() : init;
    return [stateSlots[i], (v: unknown) => { stateSlots[i] = v; rerender(); }];
  },
  useRef: (init: unknown) => {
    const i = slot++;
    if (!(i in stateSlots)) stateSlots[i] = { current: init };
    return stateSlots[i];
  },
  // Sin comparar dependencias: basta con que el efecto se monte una vez por render
  useEffect: (fn: () => void | (() => void)) => {
    const cleanup = fn();
    if (cleanup) effectCleanups.push(cleanup);
  },
}));

import { useRefreshOnReturn, useTransitionDone } from '../hooks/useScreenTransition';

function fakeNavigation() {
  const listeners: Record<string, Set<(e: any) => void>> = {};
  return {
    addListener(event: string, cb: (e: any) => void) {
      (listeners[event] ||= new Set()).add(cb);
      return () => listeners[event].delete(cb);
    },
    emit(event: string, data?: unknown) {
      listeners[event]?.forEach((cb) => cb({ data }));
    },
  };
}

function render<T>(hook: () => T): { current: () => T } {
  let value: T;
  const run = () => {
    effectCleanups.forEach((c) => c());
    effectCleanups = [];
    slot = 0;
    value = hook();
  };
  rerender = run;
  run();
  return { current: () => value };
}

beforeEach(() => {
  jest.useFakeTimers();
  effectCleanups = [];
  stateSlots = [];
});

afterEach(() => {
  effectCleanups.forEach((c) => c());
  jest.useRealTimers();
});

describe('useTransitionDone', () => {
  it('false mientras entra; true al acabar la animación', () => {
    const nav = fakeNavigation();
    const result = render(() => useTransitionDone(nav));
    expect(result.current()).toBe(false);
    nav.emit('transitionEnd', { closing: false });
    expect(result.current()).toBe(true);
  });

  it('ignora el fin de animación de cierre', () => {
    const nav = fakeNavigation();
    const result = render(() => useTransitionDone(nav));
    nav.emit('transitionEnd', { closing: true });
    expect(result.current()).toBe(false);
  });

  it('si no llega el aviso, se da por terminada a los 600 ms', () => {
    const nav = fakeNavigation();
    const result = render(() => useTransitionDone(nav));
    jest.advanceTimersByTime(599);
    expect(result.current()).toBe(false);
    jest.advanceTimersByTime(1);
    expect(result.current()).toBe(true);
  });
});

describe('useRefreshOnReturn', () => {
  it('no recarga al abrir la pantalla', () => {
    const nav = fakeNavigation();
    const refresh = jest.fn();
    render(() => useRefreshOnReturn(nav, refresh));
    nav.emit('focus');
    nav.emit('transitionEnd', { closing: false });
    jest.advanceTimersByTime(2000);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('al volver, recarga una vez y solo cuando acaba la animación', () => {
    const nav = fakeNavigation();
    const refresh = jest.fn();
    render(() => useRefreshOnReturn(nav, refresh));
    nav.emit('focus'); // apertura
    nav.emit('focus'); // vuelta
    expect(refresh).not.toHaveBeenCalled();
    nav.emit('transitionEnd', { closing: false });
    expect(refresh).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(2000); // el respaldo no repite
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('si no llega el fin de animación, recarga a los 600 ms', () => {
    const nav = fakeNavigation();
    const refresh = jest.fn();
    render(() => useRefreshOnReturn(nav, refresh));
    nav.emit('focus');
    nav.emit('focus');
    jest.advanceTimersByTime(600);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('usa la última versión de la función (no una cerrada con estado viejo)', () => {
    const nav = fakeNavigation();
    const first = jest.fn();
    const second = jest.fn();
    let current = first;
    const result = render(() => useRefreshOnReturn(nav, current));
    current = second;
    rerender();
    void result;
    nav.emit('focus');
    nav.emit('focus');
    nav.emit('transitionEnd', { closing: false });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
