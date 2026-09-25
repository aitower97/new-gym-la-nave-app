/**
 * Lógica pura del panel de notificaciones (AdminNotificationsScreen): qué
 * significa cada regla automática y a quién le llega un envío. Sin imports de
 * react-native ni de supabase, para poder testearla con Jest.
 */

export type TriggerKind =
  | 'manual' | 'inactivity' | 'payment_due' | 'payment_blocked' | 'birthday' | 'signup_anniversary' | 'bono_expiring'
  | 'no_plan_assigned' | 'no_booking_template' | 'no_avatar' | 'no_workout_logs' | 'quota_low';

/** Nombre corto del tipo de regla, para etiquetas. */
export const TRIGGER_LABELS: Record<TriggerKind, string> = {
  payment_due: 'Cuota pendiente',
  payment_blocked: 'Reservas bloqueadas por impago',
  inactivity: 'Inactividad',
  signup_anniversary: 'Aniversario de alta',
  birthday: 'Cumpleaños',
  bono_expiring: 'Bono a punto de caducar',
  no_plan_assigned: 'Sin plan asignado',
  no_booking_template: 'Sin plantilla de reservas',
  no_avatar: 'Sin foto de perfil',
  no_workout_logs: 'Sin registrar entrenamientos',
  quota_low: 'Cupo casi agotado',
  manual: 'Manual',
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Cuándo se envía una regla, en lenguaje llano. Es lo que el admin necesita
 * leer para entender qué hace cada una sin abrirla.
 */
export function describeTrigger(kind: TriggerKind, offsetDays: number | null): string {
  const n = offsetDays ?? 0;
  switch (kind) {
    case 'inactivity': return `Tras ${plural(n, 'día', 'días')} sin venir a clase`;
    case 'payment_due': return 'Cuando empieza un periodo con la cuota sin pagar';
    case 'payment_blocked': return `El día ${n} del periodo si sigue sin pagar (se le bloquean las reservas)`;
    case 'birthday': return n === 0 ? 'El día de su cumpleaños' : `${plural(n, 'día', 'días')} antes de su cumpleaños`;
    case 'signup_anniversary': return `A los ${plural(n, 'día', 'días')} de darse de alta`;
    case 'bono_expiring': return `${plural(n, 'día', 'días')} antes de que caduque su bono`;
    case 'no_plan_assigned': return `Si a los ${plural(n, 'día', 'días')} de alta sigue sin plan`;
    case 'no_booking_template': return `Si a los ${plural(n, 'día', 'días')} de tener plan no tiene plantilla`;
    case 'no_avatar': return `Si a los ${plural(n, 'día', 'días')} de alta no ha puesto foto`;
    case 'no_workout_logs': return `Tras ${plural(n, 'día', 'días')} sin registrar un entreno`;
    case 'quota_low': return n === 1 ? 'Cuando le queda 1 clase o ninguna' : `Cuando le quedan ${n} clases o menos`;
    case 'manual': return 'Solo cuando la envías tú';
  }
}

/** ¿Se envía como mucho una vez por socio? Para decírselo al admin. */
export function isOneShot(kind: TriggerKind): boolean {
  return kind === 'signup_anniversary' || kind === 'no_plan_assigned'
    || kind === 'no_booking_template' || kind === 'no_avatar';
}

/** Qué pide el campo numérico de cada tipo, en el formulario. */
export const OFFSET_FIELD: Partial<Record<TriggerKind, { label: string; unit: string }>> = {
  inactivity: { label: 'Días sin venir a clase', unit: 'días' },
  payment_blocked: { label: 'Día del periodo en que se bloquean las reservas', unit: 'día' },
  signup_anniversary: { label: 'Días desde que se dio de alta', unit: 'días' },
  birthday: { label: 'Días de antelación (0 = el mismo día)', unit: 'días' },
  bono_expiring: { label: 'Días antes de que caduque', unit: 'días' },
  no_plan_assigned: { label: 'Días desde el alta sin plan', unit: 'días' },
  no_booking_template: { label: 'Días con plan pero sin plantilla', unit: 'días' },
  no_avatar: { label: 'Días desde el alta sin foto', unit: 'días' },
  no_workout_logs: { label: 'Días sin registrar un entreno', unit: 'días' },
  quota_low: { label: 'Avisar cuando queden como mucho', unit: 'clases' },
};

/**
 * Tipos que el admin puede crear él mismo: condición fija (de una lista) más
 * un número, nunca texto libre ejecutado contra la base de datos.
 * payment_due/payment_blocked se quedan fuera: van acoplados al ciclo de
 * facturación real y ya existen de serie.
 */
export const CREATABLE_EVENT_TYPES: { kind: TriggerKind; label: string; hint: string; defaultOffset: number }[] = [
  { kind: 'inactivity', label: 'Inactividad', hint: 'Lleva tiempo sin venir a clase', defaultOffset: 15 },
  { kind: 'birthday', label: 'Cumpleaños', hint: 'Se repite cada año', defaultOffset: 0 },
  { kind: 'bono_expiring', label: 'Bono a punto de caducar', hint: 'Solo socios con bono', defaultOffset: 3 },
  { kind: 'quota_low', label: 'Cupo casi agotado', hint: 'Le quedan pocas clases en su plan o bono', defaultOffset: 2 },
  { kind: 'signup_anniversary', label: 'Aniversario de alta', hint: 'Una sola vez por socio', defaultOffset: 365 },
  { kind: 'no_plan_assigned', label: 'Sin plan asignado', hint: 'Se registró pero nadie le ha dado un plan', defaultOffset: 3 },
  { kind: 'no_booking_template', label: 'Sin plantilla de reservas', hint: 'Tiene plan pero no rutina semanal fija', defaultOffset: 7 },
  { kind: 'no_workout_logs', label: 'Sin registrar entrenamientos', hint: 'Lleva tiempo sin apuntar un entreno', defaultOffset: 30 },
  { kind: 'no_avatar', label: 'Sin foto de perfil', hint: 'Ya hay un aviso parecido dentro de la app', defaultOffset: 7 },
];

/** Devuelve un mensaje de error o null si el número vale para ese tipo. */
export function validateOffset(kind: TriggerKind, value: string): string | null {
  const n = Number(value);
  if (value.trim() === '' || !Number.isInteger(n)) return 'Introduce un número entero.';
  if (kind === 'birthday') return n < 0 ? 'No puede ser negativo.' : null;
  if (n <= 0) return 'Tiene que ser mayor que 0.';
  if (kind === 'payment_blocked' && n > 28) return 'Tiene que ser un día entre 1 y 28.';
  return null;
}

export interface InactivityCandidate {
  id: string;
  plan_assigned_at: string | null;
  created_at: string;
}

/**
 * Socios que llevan al menos `days` días sin venir. Mismo criterio que la
 * regla automática de inactividad en la base: si nunca ha venido, cuenta
 * desde que se le asignó el plan, o desde el alta.
 */
export function filterInactive(
  users: InactivityCandidate[],
  lastAttendance: Map<string, string>,
  days: number,
  now: number = Date.now(),
): string[] {
  const cutoff = now - days * 86_400_000;
  return users
    .filter((u) => {
      const ref = lastAttendance.get(u.id) ?? u.plan_assigned_at ?? u.created_at;
      return new Date(ref).getTime() < cutoff;
    })
    .map((u) => u.id);
}
