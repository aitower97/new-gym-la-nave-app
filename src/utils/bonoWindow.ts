/**
 * Ventana de validez de un bono (billing_period 'once'): no está anclada al
 * calendario como los planes recurrentes, sino a la fecha en la que se le
 * asignó ese bono al socio (profiles.plan_assigned_at) + validity_days del
 * plan. Pasado ese fin, el bono caduca y las clases no usadas se pierden.
 *
 * En su propio módulo, sin depender de supabase/react-native, para poder
 * testearlo sin mockear nada — jest.config.js corre en Node puro y no
 * transforma node_modules, así que cualquier módulo que importe
 * '../lib/supabase' (y con él expo-secure-store/react-native) rompe el test
 * suite al cargarlo.
 */
export function getBonoWindow(planAssignedAt: Date | string, validityDays: number): { start: Date; end: Date } {
  const raw = typeof planAssignedAt === 'string' ? new Date(planAssignedAt) : planAssignedAt;
  // Fecha en UTC, no local: plan_assigned_at se guarda con hora real de alta y
  // el backend (quota_period_start, sesión de Postgres en UTC) lo trunca a
  // fecha con plan_assigned_at::date, en UTC. Si aquí se usara getFullYear()/
  // getMonth()/getDate() (hora local), una asignación de noche (p. ej. 22:00
  // UTC, ya día siguiente en España) calcularía un period_start distinto al
  // que usa el backend para guardar los ajustes de plan_adjustments — el
  // ajuste quedaría guardado bajo una fecha y buscado bajo otra, invisible
  // para el cupo aunque exista en la tabla. España siempre va por delante de
  // UTC (+1/+2), así que la medianoche UTC cae siempre dentro del mismo día
  // local — construir en UTC y leer con los métodos locales de toDateStr
  // (planPayments.ts) da la fecha correcta sin necesidad de tocar toDateStr.
  const start = new Date(Date.UTC(raw.getUTCFullYear(), raw.getUTCMonth(), raw.getUTCDate()));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + validityDays);
  return { start, end };
}
