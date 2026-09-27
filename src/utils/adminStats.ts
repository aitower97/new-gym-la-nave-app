import { supabase } from '../lib/supabase';
import { BillingPeriod, getCurrentPeriodStart, getPaymentBlockGraceDays, isGraceExpired, toDateStr } from './planPayments';

export interface DashboardStats {
  classesToday: number;
  totalBookings: number;
  totalUsers: number;
  occupancyRate: number;
  /** Socios (no admins) sin ningún plan asignado — necesitan que se les dé de alta. */
  membersWithoutPlan: number;
  /** Socios con plan pero sin plantilla semanal (booking_templates) configurada. */
  membersWithoutTemplate: number;
  /**
   * Socios con un plan de facturación recurrente (monthly/quarterly/yearly —
   * los bonos "once" y "daily" no tienen cuota periódica) cuya cuota de este
   * periodo no está registrada como pagada y ya pasó el margen de gracia.
   * No replica el matiz de "impagos arrastrados" que sí mira
   * planPayments.getPaymentStatus por usuario — es un recuento agregado
   * para el resumen, no la fuente de verdad para bloquear reservas.
   */
  membersWithPendingPayment: number;
}

/**
 * Obtener estadísticas del dashboard admin
 */
export async function getDashboardStats(): Promise<DashboardStats> {
  try {
    // toDateStr usa año/mes/día LOCALES — new Date().toISOString() convierte
    // a UTC antes de recortar la fecha, lo que en España (UTC+1/+2) puede
    // devolver el día ANTERIOR (p. ej. de madrugada), descuadrando "hoy" con
    // clases/reservas reales de ese día.
    const now = new Date();
    const today = toDateStr(now);
    const recurringPeriods: BillingPeriod[] = ['monthly', 'quarterly', 'yearly'];
    const periodStartByBilling = new Map(
      recurringPeriods.map((bp) => [bp, toDateStr(getCurrentPeriodStart(bp, now))])
    );
    const relevantPeriodStarts = Array.from(new Set(periodStartByBilling.values()));

    // Una sola tanda en paralelo (antes eran 8 peticiones en fila). Las clases
    // de hoy con sus reservas dan a la vez el nº de clases, el de reservas y
    // la ocupación; los perfiles dan el total, los sin plan y los con plan.
    const [classesRes, profilesRes, plansRes, templatesRes, paymentsRes, graceDays] = await Promise.all([
      supabase.from('classes').select('id, max_spots, bookings (id)').eq('class_date', today),
      supabase.from('profiles').select('id, role, plan_id, template_not_required'),
      supabase.from('membership_plans').select('id, billing_period'),
      supabase.from('booking_templates').select('user_id').eq('is_active', true),
      supabase.from('plan_payments').select('user_id, period_start').in('period_start', relevantPeriodStarts),
      getPaymentBlockGraceDays(),
    ]);

    if (classesRes.error) throw classesRes.error;
    if (profilesRes.error) throw profilesRes.error;
    if (plansRes.error) throw plansRes.error;
    if (templatesRes.error) throw templatesRes.error;
    if (paymentsRes.error) throw paymentsRes.error;

    // Clases, reservas y ocupación de hoy
    const todayClasses = (classesRes.data || []) as any[];
    let totalCapacity = 0;
    let totalBooked = 0;
    todayClasses.forEach((cls) => {
      totalCapacity += cls.max_spots;
      totalBooked += cls.bookings?.length || 0;
    });
    const occupancyRate = totalCapacity > 0 ? Math.round((totalBooked / totalCapacity) * 100) : 0;

    // Socios (excluye admins): sin plan es un dato accionable para el admin
    const profiles = (profilesRes.data || []) as any[];
    const members = profiles.filter((p) => p.role !== 'admin');
    const membersWithoutPlan = members.filter((m) => !m.plan_id).length;
    const membersWithPlan = members.filter((m) => !!m.plan_id);

    // De los socios CON plan: cuántos no tienen plantilla semanal (y no están
    // marcados como "no la necesita" — ej. usuarios de sala) y cuántos tienen
    // la cuota de este periodo sin pagar pasado el margen de gracia.
    const templatedUserIds = new Set((templatesRes.data || []).map((r: any) => r.user_id));
    const membersWithoutTemplate = membersWithPlan.filter(
      (m) => !m.template_not_required && !templatedUserIds.has(m.id)
    ).length;

    const billingByPlanId = new Map((plansRes.data || []).map((p: any) => [p.id, p.billing_period as BillingPeriod]));
    const graceExpiredByBilling = new Map(
      recurringPeriods.map((bp) => [bp, isGraceExpired(getCurrentPeriodStart(bp, now), now, graceDays)])
    );
    const paidSet = new Set((paymentsRes.data || []).map((p: any) => `${p.user_id}:${p.period_start}`));
    const membersWithPendingPayment = membersWithPlan.filter((m) => {
      const billing = billingByPlanId.get(m.plan_id);
      if (!billing || billing === 'daily' || billing === 'once') return false;
      if (!graceExpiredByBilling.get(billing)) return false;
      return !paidSet.has(`${m.id}:${periodStartByBilling.get(billing)}`);
    }).length;

    return {
      classesToday: todayClasses.length,
      totalBookings: totalBooked,
      totalUsers: profiles.length,
      occupancyRate,
      membersWithoutPlan,
      membersWithoutTemplate,
      membersWithPendingPayment,
    };
  } catch (error) {
    console.error('Error getting dashboard stats:', error);
    return {
      classesToday: 0,
      totalBookings: 0,
      totalUsers: 0,
      occupancyRate: 0,
      membersWithoutPlan: 0,
      membersWithoutTemplate: 0,
      membersWithPendingPayment: 0,
    };
  }
}

/**
 * Obtener próximas clases de hoy
 */
export async function getTodayUpcomingClasses() {
  try {
    // toDateStr usa año/mes/día LOCALES — new Date().toISOString() convierte
    // a UTC antes de recortar la fecha, lo que en España (UTC+1/+2) puede
    // devolver el día ANTERIOR (p. ej. de madrugada), descuadrando "hoy" con
    // clases/reservas reales de ese día.
    const today = toDateStr(new Date());
    const now = new Date();
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:00`;

    const { data, error } = await supabase
      .from('classes')
      .select(`
        id,
        name,
        class_time,
        max_spots,
        bookings (id)
      `)
      .eq('class_date', today)
      .gte('class_time', currentTime)
      .order('class_time')
      .limit(3);

    if (error) throw error;

    return data || [];
  } catch (error) {
    console.error('Error getting upcoming classes:', error);
    return [];
  }
}