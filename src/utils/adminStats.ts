import { supabase } from '../lib/supabase';
import { BillingPeriod, getCurrentPeriodStart, isGraceExpired, toDateStr } from './planPayments';

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
    const today = toDateStr(new Date());

    // 1. Contar clases de hoy
    const { count: classesToday, error: classesError } = await supabase
      .from('classes')
      .select('*', { count: 'exact', head: true })
      .eq('class_date', today);

    if (classesError) throw classesError;

    // 2. Contar reservas de hoy
    const { count: totalBookings, error: bookingsError } = await supabase
      .from('bookings')
      .select('*, classes!inner(*)', { count: 'exact', head: true })
      .eq('classes.class_date', today);

    if (bookingsError) throw bookingsError;

    // 3. Contar usuarios totales
    const { count: totalUsers, error: usersError } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true });

    if (usersError) throw usersError;

    // 3b. Socios sin plan asignado (excluye admins) — dato accionable para
    // el admin, a diferencia de un simple saludo.
    const { count: membersWithoutPlan, error: noPlanError } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .neq('role', 'admin')
      .is('plan_id', null);

    if (noPlanError) throw noPlanError;

    // 3c. De los socios CON plan: cuántos no tienen plantilla semanal (y no
    // están marcados como "no la necesita" — ej. usuarios de sala) y cuántos
    // tienen la cuota de este periodo sin pagar.
    const { data: membersWithPlan, error: membersWithPlanError } = await supabase
      .from('profiles')
      .select('id, plan_id, template_not_required')
      .neq('role', 'admin')
      .not('plan_id', 'is', null);

    if (membersWithPlanError) throw membersWithPlanError;

    let membersWithoutTemplate = 0;
    let membersWithPendingPayment = 0;
    const memberIds = (membersWithPlan || []).map((m) => m.id);

    if (memberIds.length > 0) {
      const [{ data: allPlans, error: plansError }, { data: templatedRows, error: templatesError }] = await Promise.all([
        supabase.from('membership_plans').select('id, billing_period'),
        supabase.from('booking_templates').select('user_id').eq('is_active', true).in('user_id', memberIds),
      ]);

      if (plansError) throw plansError;
      if (templatesError) throw templatesError;

      const billingByPlanId = new Map((allPlans || []).map((p: any) => [p.id, p.billing_period as BillingPeriod]));
      const templatedUserIds = new Set((templatedRows || []).map((r: any) => r.user_id));

      membersWithoutTemplate = (membersWithPlan || []).filter(
        (m: any) => !m.template_not_required && !templatedUserIds.has(m.id)
      ).length;

      const now = new Date();
      const recurringPeriods: BillingPeriod[] = ['monthly', 'quarterly', 'yearly'];
      const periodStartByBilling = new Map(
        recurringPeriods.map((bp) => [bp, toDateStr(getCurrentPeriodStart(bp, now))])
      );
      const graceExpiredByBilling = new Map(
        recurringPeriods.map((bp) => [bp, isGraceExpired(getCurrentPeriodStart(bp, now), now)])
      );
      const relevantPeriodStarts = Array.from(new Set(periodStartByBilling.values()));

      const { data: paymentsThisPeriod, error: paymentsError } = await supabase
        .from('plan_payments')
        .select('user_id, period_start')
        .in('user_id', memberIds)
        .in('period_start', relevantPeriodStarts);

      if (paymentsError) throw paymentsError;

      const paidSet = new Set((paymentsThisPeriod || []).map((p: any) => `${p.user_id}:${p.period_start}`));

      membersWithPendingPayment = (membersWithPlan || []).filter((m: any) => {
        const billing = billingByPlanId.get(m.plan_id);
        if (!billing || billing === 'daily' || billing === 'once') return false;
        if (!graceExpiredByBilling.get(billing)) return false;
        const periodStart = periodStartByBilling.get(billing);
        return !paidSet.has(`${m.id}:${periodStart}`);
      }).length;
    }

    // 4. Calcular tasa de ocupación promedio de hoy
    let occupancyRate = 0;

    if (classesToday && classesToday > 0) {
      // Obtener clases con sus capacidades
      const { data: classesData, error: classesDataError } = await supabase
        .from('classes')
        .select(`
          id,
          max_spots,
          bookings (id)
        `)
        .eq('class_date', today);

      if (!classesDataError && classesData) {
        let totalCapacity = 0;
        let totalBooked = 0;

        classesData.forEach((cls: any) => {
          totalCapacity += cls.max_spots;
          totalBooked += cls.bookings?.length || 0;
        });

        occupancyRate = totalCapacity > 0 
          ? Math.round((totalBooked / totalCapacity) * 100) 
          : 0;
      }
    }

    return {
      classesToday: classesToday || 0,
      totalBookings: totalBookings || 0,
      totalUsers: totalUsers || 0,
      occupancyRate,
      membersWithoutPlan: membersWithoutPlan || 0,
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