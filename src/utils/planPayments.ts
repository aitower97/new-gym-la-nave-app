import { supabase } from '../lib/supabase';

export type BillingPeriod = 'daily' | 'monthly' | 'quarterly' | 'yearly';

export interface PaymentStatus {
  /** Planes 'daily' no tienen cuota periódica, no aplica el bloqueo. */
  applies: boolean;
  periodStart: string | null;
  paid: boolean;
  /** true si han pasado 5+ días desde periodStart sin pago registrado. */
  graceExpired: boolean;
}

const pad = (n: number) => String(n).padStart(2, '0');
export const toDateStr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

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

export async function getPaymentStatus(userId: string, billingPeriod: BillingPeriod, d = new Date()): Promise<PaymentStatus> {
  if (billingPeriod === 'daily') {
    return { applies: false, periodStart: null, paid: true, graceExpired: false };
  }

  const periodStart = getCurrentPeriodStart(billingPeriod, d);
  const periodStartStr = toDateStr(periodStart);

  const { data } = await supabase
    .from('plan_payments')
    .select('id')
    .eq('user_id', userId)
    .eq('period_start', periodStartStr)
    .maybeSingle();

  return {
    applies: true,
    periodStart: periodStartStr,
    paid: !!data,
    graceExpired: !data && isGraceExpired(periodStart, d),
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
