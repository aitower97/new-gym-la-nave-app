/**
 * popupGate.ts — Un pop-up global a la vez ("Novedades", "Estás dentro").
 *
 * En iOS, dos Modal presentándose a la vez pueden hacer que uno no salga. El
 * que llega segundo espera a que el primero se cierre (whenFree).
 */

let current: string | null = null;
let waiters: Array<() => void> = [];

/** Ejecuta fn cuando no haya ningún pop-up abierto (ya mismo si no lo hay). */
export function whenFree(fn: () => void): void {
  if (!current) fn();
  else waiters.push(fn);
}

/** Reserva el turno para `name`. false si hay otro abierto. */
export function tryOpenPopup(name: string): boolean {
  if (current && current !== name) return false;
  current = name;
  return true;
}

/** Libera el turno y da paso al siguiente que esperaba. */
export function closePopup(name: string): void {
  if (current !== name) return;
  current = null;
  const pending = waiters;
  waiters = [];
  // Tras la animación de cierre del Modal anterior
  setTimeout(() => pending.forEach((fn) => fn()), 400);
}
