/**
 * waitlistMoveModel.ts — Lógica pura del "te hemos cambiado" de la lista de
 * espera (sin Supabase, para poder testearla).
 *
 * Si se libera plaza y el primero de la cola ya tenía otra clase ese día, la
 * base le cambia directamente y apunta el cambio en waitlist_moves. La app le
 * pregunta después: mantener, volver o (si le caben) quedarse con las dos.
 * Volver solo funciona si su clase anterior sigue teniendo sitio.
 */

export type MoveAction = 'keep' | 'back' | 'both';

export interface PendingMove {
  id: string;
  toClassName: string;
  /** "YYYY-MM-DD" */
  toClassDate: string;
  /** "HH:MM:SS" */
  toClassTime: string;
  /** "HH:MM:SS" */
  fromClassTime: string;
  /** Clases suyas ese día, contando la nueva */
  sameDayCount: number;
  maxPerDay: number;
}

export interface MoveOption {
  action: MoveAction;
  label: string;
  primary: boolean;
}

const hhmm = (t: string) => t.slice(0, 5);

export function moveOptions(move: PendingMove): MoveOption[] {
  const options: MoveOption[] = [
    { action: 'keep', label: 'Mantener', primary: true },
    { action: 'back', label: `Volver a las ${hhmm(move.fromClassTime)}`, primary: false },
  ];
  // Las dos solo si le caben por el máximo diario
  if (move.sameDayCount < move.maxPerDay) {
    options.push({ action: 'both', label: 'Quedarme las dos', primary: false });
  }
  return options;
}

/** "Jueves 2 oct · 18:00" */
export function moveClassLine(move: Pick<PendingMove, 'toClassDate' | 'toClassTime'>): string {
  const d = new Date(`${move.toClassDate}T00:00:00`)
    .toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' })
    .replace(',', '').replace('.', '');
  return `${d.charAt(0).toUpperCase()}${d.slice(1)} · ${hhmm(move.toClassTime)}`;
}

/** Aviso tras contestar, o null si no hace falta decir nada. */
export function moveResultMessage(result: string, move: Pick<PendingMove, 'fromClassTime'>): { title: string; message: string } | null {
  const from = hhmm(move.fromClassTime);
  switch (result) {
    case 'kept':
      return null;
    case 'back':
      return { title: 'Hecho', message: `Vuelves a la de las ${from}.` };
    case 'both':
      return null;
    case 'full':
      return { title: 'Sin plaza', message: `La de las ${from} ya está completa.` };
    case 'not_allowed':
      return { title: 'No se puede', message: 'Tu plan no lo permite.' };
    case 'closed':
      return { title: 'Ya no se puede', message: `La de las ${from} ya ha empezado.` };
    default:
      return { title: 'Error', message: 'Inténtalo de nuevo.' };
  }
}
