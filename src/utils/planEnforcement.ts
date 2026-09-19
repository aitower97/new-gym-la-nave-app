import { supabase } from '../lib/supabase';
import { getPaymentStatus, getCurrentPeriodStart, getPeriodEnd, getPeriodMonths, getBonoWindow, toDateStr, BillingPeriod } from './planPayments';
import { getBookingCutoffHours, getUnlockDate, isFreeTrialEnabled, isWithinCutoff } from './bookingSettings';

export interface BookingCheck {
  allowed: boolean;
  reason?: string;
  /** La reserva sale de la clase de prueba gratuita, no de un plan. */
  freeTrial?: boolean;
}

export interface ClassQuotaStatus {
  used: number;
  /** classes_per_month × meses del periodo (recurrentes) o total fijo del bono. */
  total: number;
  remaining: number;
  periodEnd: Date;
}

interface QuotaWindow {
  periodStart: Date;
  periodEnd: Date;
  total: number;
  expired: boolean;
}

/**
 * Ventana de cupo del plan: para planes recurrentes (mensual/trimestral/
 * anual/daily) está anclada al calendario, igual que siempre. Para bonos
 * (billing_period 'once') está anclada a cuándo se le asignó el bono al
 * socio (plan_assigned_at) + su validity_days — null si el bono no tiene
 * fecha de asignación registrada (dato incompleto, se trata como sin cupo).
 */
function resolveQuotaWindow(
  billingPeriod: BillingPeriod,
  classesPerMonth: number,
  validityDays: number | null,
  planAssignedAt: string | null,
  now = new Date()
): QuotaWindow | null {
  if (billingPeriod === 'once') {
    if (!planAssignedAt || validityDays == null) return null;
    const { start, end } = getBonoWindow(planAssignedAt, validityDays);
    return { periodStart: start, periodEnd: end, total: classesPerMonth, expired: now >= end };
  }
  const periodStart = getCurrentPeriodStart(billingPeriod, now);
  const periodEnd = getPeriodEnd(billingPeriod, periodStart);
  return { periodStart, periodEnd, total: classesPerMonth * getPeriodMonths(billingPeriod), expired: false };
}

/**
 * ¿Ha caducado ya un bono (billing_period 'once')? null si no es un bono o
 * si falta el dato de asignación — en ambos casos no hay caducidad que
 * comprobar aquí. Independiente de classes_per_month: un bono "ilimitado"
 * (sin tope de clases) sigue caducando por fecha igual que uno con límite.
 */
function isBonoExpired(
  billingPeriod: BillingPeriod,
  validityDays: number | null,
  planAssignedAt: string | null,
  now = new Date()
): boolean | null {
  if (billingPeriod !== 'once') return null;
  if (!planAssignedAt || validityDays == null) return null;
  const { end } = getBonoWindow(planAssignedAt, validityDays);
  return now >= end;
}

export interface TemplateFitCheck {
  mismatched: boolean;
  demand: number;
  totalLabel: string;
}

/**
 * ¿Encaja el ritmo semanal de una plantilla de reservas fijas dentro del
 * cupo de un plan? Usada en dos sitios (AdminEditUserScreen al asignar/
 * cambiar el plan de un socio con plantilla ya existente, y
 * AdminUserTemplatesScreen al guardar una plantilla para un socio que ya
 * tiene plan) — centralizada aquí para que ambos avisos usen exactamente el
 * mismo cálculo y no se desincronicen.
 */
export function estimateTemplateFit(
  weeklyCount: number,
  plan: { billing_period: BillingPeriod; classes_per_month: number | null; validity_days?: number | null }
): TemplateFitCheck {
  if (plan.classes_per_month == null || weeklyCount === 0) {
    return { mismatched: false, demand: 0, totalLabel: '' };
  }

  if (plan.billing_period === 'once') {
    if (plan.validity_days == null) return { mismatched: false, demand: 0, totalLabel: '' };
    const demand = Math.round(weeklyCount * (plan.validity_days / 7));
    return {
      mismatched: demand > plan.classes_per_month,
      demand,
      totalLabel: `${plan.classes_per_month} en los ${plan.validity_days} días de validez del bono`,
    };
  }

  // Mes estándar de 4 semanas, no el promedio real (52/12 ≈ 4.33): un plan
  // de 8 clases/mes debe encajar exactamente con una plantilla de 2/semana
  // (2×4=8), que es como un admin razona esto — con 4.33 esas mismas 2/semana
  // salían a 9 y disparaban el aviso sin motivo.
  const demand = weeklyCount * 4;
  return { mismatched: demand > plan.classes_per_month, demand, totalLabel: `${plan.classes_per_month} al mes` };
}

/** Cuenta las reservas del usuario dentro de la ventana de cupo (periodo o bono) de su plan. */
async function countBookingsInPeriod(userId: string, periodStart: Date, periodEnd: Date): Promise<number> {
  const { count } = await supabase
    .from('bookings')
    .select('*, classes!inner(class_date)', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('classes.class_date', toDateStr(periodStart))
    .lt('classes.class_date', toDateStr(periodEnd));
  return count ?? 0;
}

/**
 * Cupo de clases del usuario para el "contador" de su plan (MainMenuScreen).
 * null si no tiene plan, el plan no está activo, no tiene límite de clases
 * (classes_per_month == null → ilimitado, no hay nada que contar), o es un
 * bono sin fecha de asignación registrada.
 */
export async function getClassQuotaStatus(userId: string): Promise<ClassQuotaStatus | null> {
  const { data: profile } = await supabase.from('profiles').select('plan_id, plan_assigned_at').eq('id', userId).single();
  if (!profile?.plan_id) return null;

  const { data: plan } = await supabase
    .from('membership_plans')
    .select('classes_per_month, is_active, billing_period, validity_days')
    .eq('id', profile.plan_id)
    .single();

  if (!plan || !plan.is_active || plan.classes_per_month == null) return null;

  const billingPeriod = plan.billing_period as BillingPeriod;
  const window = resolveQuotaWindow(billingPeriod, plan.classes_per_month, plan.validity_days, profile.plan_assigned_at);
  if (!window) return null;

  const used = await countBookingsInPeriod(userId, window.periodStart, window.periodEnd);
  const remaining = window.expired ? 0 : Math.max(0, window.total - used);

  return { used, total: window.total, remaining, periodEnd: window.periodEnd };
}

/** Lo mínimo que hace falta de un socio para calcular su cupo. */
export interface QuotaUserInput {
  id: string;
  plan_id: string | null;
  plan_assigned_at: string | null;
}

/** Lo mínimo que hace falta de un plan para calcular el cupo de sus socios. */
export interface QuotaPlanInput {
  id: string;
  classes_per_month: number | null;
  is_active: boolean;
  billing_period: BillingPeriod;
  validity_days: number | null;
}

/**
 * Cupo de muchos socios a la vez, para el panel de admin.
 *
 * Existe en vez de llamar a getClassQuotaStatus en bucle porque esa hace tres
 * consultas por socio: con 54 socios serían más de 150 viajes a la base. Aquí
 * se traen todas las reservas de una vez y se cuenta en memoria, que es el
 * mismo patrón que ya usa AdminUsersScreen con los pagos.
 *
 * Solo devuelve entrada para quien tiene cupo que contar: sin plan, plan
 * inactivo, plan ilimitado (classes_per_month == null) o bono sin fecha de
 * asignación quedan fuera del mapa.
 */
export async function getClassQuotaStatusBulk(
  users: QuotaUserInput[],
  plans: QuotaPlanInput[]
): Promise<Map<string, ClassQuotaStatus>> {
  const resultado = new Map<string, ClassQuotaStatus>();
  const planMap = new Map(plans.map(p => [p.id, p]));

  const ventanas = new Map<string, { periodStart: Date; periodEnd: Date; total: number; expired: boolean }>();
  for (const u of users) {
    if (!u.plan_id) continue;
    const plan = planMap.get(u.plan_id);
    if (!plan || !plan.is_active || plan.classes_per_month == null) continue;

    const ventana = resolveQuotaWindow(plan.billing_period, plan.classes_per_month, plan.validity_days, u.plan_assigned_at);
    if (ventana) ventanas.set(u.id, ventana);
  }

  if (ventanas.size === 0) return resultado;

  // Una sola consulta para todos. No se filtra por fecha: cada socio tiene su
  // propia ventana y acotar por el rango global no ahorraría casi nada con
  // estos volúmenes, a cambio de un filtro más que puede equivocarse.
  const { data } = await supabase
    .from('bookings')
    .select('user_id, classes!inner(class_date)')
    .in('user_id', Array.from(ventanas.keys()));

  const porSocio = new Map<string, string[]>();
  for (const fila of (data || []) as any[]) {
    // PostgREST devuelve la relación como objeto o como array según el caso.
    const clase = Array.isArray(fila.classes) ? fila.classes[0] : fila.classes;
    if (!clase?.class_date) continue;
    const lista = porSocio.get(fila.user_id) || [];
    lista.push(clase.class_date);
    porSocio.set(fila.user_id, lista);
  }

  for (const [userId, ventana] of ventanas) {
    const desde = toDateStr(ventana.periodStart);
    const hasta = toDateStr(ventana.periodEnd);
    const used = (porSocio.get(userId) || []).filter(d => d >= desde && d < hasta).length;
    const remaining = ventana.expired ? 0 : Math.max(0, ventana.total - used);
    resultado.set(userId, { used, total: ventana.total, remaining, periodEnd: ventana.periodEnd });
  }

  return resultado;
}

/**
 * Reservar debe respetar el plan del usuario: sin plan asignado no se puede
 * reservar, y si el plan tiene un límite, no se puede superar el cupo de su
 * ventana de vigencia — el periodo de facturación del plan (recurrentes) o
 * la validez del bono desde que se le asignó (billing_period 'once').
 */
export async function checkBookingAllowed(userId: string, classDate?: string, classTime?: string): Promise<BookingCheck> {
  if (classDate && classTime) {
    const cutoffHours = await getBookingCutoffHours();
    if (isWithinCutoff(classDate, classTime, cutoffHours)) {
      const unlockDate = getUnlockDate(classDate, classTime, cutoffHours);
      const unlockLabel = unlockDate.toLocaleString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
      return {
        allowed: false,
        reason: `Las reservas de esta clase se abren ${cutoffHours}h antes de empezar. Podrás reservarla a partir del ${unlockLabel}.`,
      };
    }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('plan_id, created_at, plan_assigned_at, free_trial_used_at')
    .eq('id', userId)
    .single();

  // Sin plan: queda la clase de prueba gratuita, si el gimnasio la tiene
  // activada y no la ha gastado. Es la misma regla que aplica can_user_book
  // en la base de datos; esto solo la adelanta para dar un mensaje decente en
  // vez de dejar que falle la política RLS con un error críptico.
  if (!profile?.plan_id) {
    if (!(await isFreeTrialEnabled())) {
      return { allowed: false, reason: 'Necesitas tener un plan asignado para reservar clases. Habla con tu entrenador.' };
    }
    if (profile?.free_trial_used_at) {
      return {
        allowed: false,
        reason: 'Ya has usado tu clase de prueba gratuita. Habla con tu entrenador para elegir un plan y seguir entrenando.',
      };
    }
    return { allowed: true, freeTrial: true };
  }

  const { data: plan } = await supabase
    .from('membership_plans')
    .select('name, classes_per_month, is_active, billing_period, validity_days')
    .eq('id', profile.plan_id)
    .single();

  if (!plan || !plan.is_active) {
    return { allowed: false, reason: 'Tu plan ya no está activo. Habla con tu entrenador.' };
  }

  const billingPeriod = plan.billing_period as BillingPeriod;

  const payment = await getPaymentStatus(userId, billingPeriod, new Date(), profile.created_at);
  if (payment.applies && payment.graceExpired) {
    return {
      allowed: false,
      reason: `No has renovado tu cuota de este periodo (plan "${plan.name}"). Ponte al día con tu entrenador para poder reservar.`,
    };
  }

  // Un bono caducado bloquea reservar aunque no tenga límite de clases: el
  // tope (classes_per_month) y la caducidad (validity_days) son
  // independientes — "ilimitado" solo significa sin tope de clases, no que
  // nunca caduque. Se comprueba ANTES del atajo de "sin límite" de abajo,
  // que si no se saltaba esta comprobación por completo para esos bonos.
  if (billingPeriod === 'once') {
    const expired = isBonoExpired(billingPeriod, plan.validity_days, profile.plan_assigned_at);
    if (expired == null) {
      return { allowed: false, reason: `Tu bono "${plan.name}" no tiene fecha de asignación registrada. Habla con tu entrenador.` };
    }
    if (expired) {
      return { allowed: false, reason: `Tu bono "${plan.name}" ha caducado. Habla con tu entrenador para renovarlo.` };
    }
  }

  if (plan.classes_per_month == null) {
    return { allowed: true }; // sin límite de clases
  }

  const window = resolveQuotaWindow(billingPeriod, plan.classes_per_month, plan.validity_days, profile.plan_assigned_at);
  if (!window) {
    return { allowed: false, reason: `Tu bono "${plan.name}" no tiene fecha de asignación registrada. Habla con tu entrenador.` };
  }

  const used = await countBookingsInPeriod(userId, window.periodStart, window.periodEnd);

  if (used >= window.total) {
    return {
      allowed: false,
      reason: `Has alcanzado el límite de tu plan "${plan.name}": ${window.total} clase${window.total !== 1 ? 's' : ''} este periodo.`,
    };
  }

  return { allowed: true };
}
