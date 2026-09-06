import { supabase } from '../lib/supabase';

export type BillingPeriod = 'daily' | 'monthly' | 'quarterly' | 'yearly';

export interface PaymentStatus {
  /** Planes 'daily' no tienen cuota periódica, no aplica el bloqueo. */
  applies: boolean;
  periodStart: string | null;
  paid: boolean;
  /** true si han pasado 5+ días desde periodStart sin pago registrado. */
  graceExpired: boolean;
  /** Periodo anterior sin pagar que anula el margen de gracia de este periodo (si aplica). */
  arrearsPeriodStart: string | null;
}

const pad = (n: number) => String(n).padStart(2, '0');
export const toDateStr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** Inversa de toDateStr: construye la fecha en local, sin pasar por UTC. */
export const parseDateStr = (s: string): Date => {
  const [y, m, day] = s.split('-').map(Number);
  return new Date(y, m - 1, day);
};

/**
 * Los periodos de cuota están anclados al calendario (día 1 del mes, trimestre
 * o año), no a la fecha de alta del usuario ni a la del último pago.
 */
export function getCurrentPeriodStart(billingPeriod: BillingPeriod, d = new Date()): Date {
  if (billingPeriod === 'yearly') return new Date(d.getFullYear(), 0, 1);
  if (billingPeriod === 'quarterly') return new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1);
  return new Date(d.getFullYear(), d.getMonth(), 1); // monthly
}

/** El día 5 del periodo (mismo mes/año que periodStart) es el límite de gracia. */
export function isGraceExpired(periodStart: Date, d = new Date()): boolean {
  const graceEnd = new Date(periodStart.getFullYear(), periodStart.getMonth(), 5);
  return d >= graceEnd;
}

/** Periodo inmediatamente anterior al indicado, según el tipo de facturación. */
export function getPreviousPeriodStart(billingPeriod: BillingPeriod, periodStart: Date): Date {
  if (billingPeriod === 'yearly') return new Date(periodStart.getFullYear() - 1, 0, 1);
  if (billingPeriod === 'quarterly') return new Date(periodStart.getFullYear(), periodStart.getMonth() - 3, 1);
  return new Date(periodStart.getFullYear(), periodStart.getMonth() - 1, 1); // monthly
}

/**
 * @param memberSince Fecha de alta del usuario (profiles.created_at). Si ya era
 * socio en el periodo anterior y ese periodo sigue sin pago registrado, no hay
 * margen de gracia este periodo: se bloquea desde el día 1.
 */
export async function getPaymentStatus(
  userId: string,
  billingPeriod: BillingPeriod,
  d = new Date(),
  memberSince?: string | Date | null
): Promise<PaymentStatus> {
  if (billingPeriod === 'daily') {
    return { applies: false, periodStart: null, paid: true, graceExpired: false, arrearsPeriodStart: null };
  }

  const periodStart = getCurrentPeriodStart(billingPeriod, d);
  const periodStartStr = toDateStr(periodStart);

  const { data } = await supabase
    .from('plan_payments')
    .select('id')
    .eq('user_id', userId)
    .eq('period_start', periodStartStr)
    .maybeSingle();

  const paid = !!data;
  let graceExpired = !paid && isGraceExpired(periodStart, d);
  let arrearsPeriodStart: string | null = null;

  if (!paid && !graceExpired && memberSince) {
    const since = typeof memberSince === 'string' ? new Date(memberSince) : memberSince;
    // Solo la fecha, sin hora: created_at lleva hora de alta real, y comparado
    // tal cual contra la medianoche de prevStart excluía a quien se hubiera
    // dado de alta el día 1 del periodo anterior en cualquier hora que no
    // fuera exactamente las 00:00.
    const sinceDateOnly = new Date(since.getFullYear(), since.getMonth(), since.getDate());
    const prevStart = getPreviousPeriodStart(billingPeriod, periodStart);
    if (sinceDateOnly <= prevStart) {
      const { data: prevPayment } = await supabase
        .from('plan_payments')
        .select('id')
        .eq('user_id', userId)
        .eq('period_start', toDateStr(prevStart))
        .maybeSingle();
      if (!prevPayment) {
        graceExpired = true;
        arrearsPeriodStart = toDateStr(prevStart);
      }
    }
  }

  return {
    applies: true,
    periodStart: periodStartStr,
    paid,
    graceExpired,
    arrearsPeriodStart,
  };
}

export async function markPaymentReceived(userId: string, billingPeriod: BillingPeriod, adminId: string, d = new Date()): Promise<void> {
  const periodStartStr = toDateStr(getCurrentPeriodStart(billingPeriod, d));
  const { error } = await supabase
    .from('plan_payments')
    .upsert({ user_id: userId, period_start: periodStartStr, marked_by: adminId, paid_at: new Date().toISOString() }, { onConflict: 'user_id,period_start' });
  if (error) throw error;
}

/** Deshace un pago marcado por error (mismo periodo actual). */
export async function revertPaymentReceived(userId: string, billingPeriod: BillingPeriod, d = new Date()): Promise<void> {
  const periodStartStr = toDateStr(getCurrentPeriodStart(billingPeriod, d));
  const { error } = await supabase
    .from('plan_payments')
    .delete()
    .eq('user_id', userId)
    .eq('period_start', periodStartStr);
  if (error) throw error;
}
