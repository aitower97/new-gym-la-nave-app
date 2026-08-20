import { supabase } from '../lib/supabase';
import { getPaymentStatus, BillingPeriod } from './planPayments';

export interface BookingCheck {
  allowed: boolean;
  reason?: string;
}

function monthRange(d = new Date()): { start: string; end: string } {
  const pad = (n: number) => String(n).padStart(2, '0');
  const start = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`;
  const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  const end = `${next.getFullYear()}-${pad(next.getMonth() + 1)}-01`;
  return { start, end };
}

/**
 * Reservar debe respetar el plan del usuario: sin plan asignado no se puede
 * reservar, y si el plan tiene un límite mensual, no se puede superar.
 */
export async function checkBookingAllowed(userId: string): Promise<BookingCheck> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('plan_id')
    .eq('id', userId)
    .single();

  if (!profile?.plan_id) {
    return { allowed: false, reason: 'Necesitas tener un plan asignado para reservar clases. Habla con tu entrenador.' };
  }

  const { data: plan } = await supabase
    .from('membership_plans')
    .select('name, classes_per_month, is_active, billing_period')
    .eq('id', profile.plan_id)
    .single();

  if (!plan || !plan.is_active) {
    return { allowed: false, reason: 'Tu plan ya no está activo. Habla con tu entrenador.' };
  }

  const payment = await getPaymentStatus(userId, plan.billing_period as BillingPeriod);
  if (payment.applies && payment.graceExpired) {
    return {
      allowed: false,
      reason: `No has renovado tu cuota de este periodo (plan "${plan.name}"). Ponte al día con tu entrenador para poder reservar.`,
    };
  }

  if (plan.classes_per_month == null) {
    return { allowed: true }; // sin límite
  }

  const { start, end } = monthRange();
  const { count } = await supabase
    .from('bookings')
    .select('*, classes!inner(class_date)', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('classes.class_date', start)
    .lt('classes.class_date', end);

  if ((count ?? 0) >= plan.classes_per_month) {
    return {
      allowed: false,
      reason: `Has alcanzado el límite de tu plan "${plan.name}": ${plan.classes_per_month} clase${plan.classes_per_month !== 1 ? 's' : ''} al mes.`,
    };
  }

  return { allowed: true };
}
