import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Cliente con permisos admin (bypassa RLS)
const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface Template {
  id: string;
  user_id: string;
  day_of_week: number;
  class_time: string;
  class_type: string;
}

interface ClassMatch {
  id: string;
  class_date: string;
  class_time: string;
  class_type: string;
  max_spots: number;
}

type BillingPeriod = 'daily' | 'monthly' | 'quarterly' | 'yearly' | 'once';

// Misma lógica que src/utils/planPayments.ts — no se puede importar directamente
// entre el bundle de la app y una Edge Function Deno, así que se duplica aquí.
function getCurrentPeriodStart(billingPeriod: BillingPeriod, d: Date): Date {
  if (billingPeriod === 'yearly') return new Date(d.getFullYear(), 0, 1);
  if (billingPeriod === 'quarterly') return new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1);
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function getPreviousPeriodStart(billingPeriod: BillingPeriod, periodStart: Date): Date {
  if (billingPeriod === 'yearly') return new Date(periodStart.getFullYear() - 1, 0, 1);
  if (billingPeriod === 'quarterly') return new Date(periodStart.getFullYear(), periodStart.getMonth() - 3, 1);
  return new Date(periodStart.getFullYear(), periodStart.getMonth() - 1, 1);
}

function isGraceExpired(periodStart: Date, d: Date): boolean {
  const graceEnd = new Date(periodStart.getFullYear(), periodStart.getMonth(), 5);
  return d >= graceEnd;
}

const pad = (n: number) => String(n).padStart(2, '0');
const toDateStr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function getPeriodMonths(billingPeriod: BillingPeriod): number {
  if (billingPeriod === 'yearly') return 12;
  if (billingPeriod === 'quarterly') return 3;
  return 1; // monthly, daily
}

function getPeriodEnd(billingPeriod: BillingPeriod, periodStart: Date): Date {
  return new Date(periodStart.getFullYear(), periodStart.getMonth() + getPeriodMonths(billingPeriod), 1);
}

/** Ventana de vigencia de un bono (billing_period 'once'): plan_assigned_at + validity_days, no anclada al calendario. */
function getBonoWindow(planAssignedAt: Date, validityDays: number): { start: Date; end: Date } {
  const start = new Date(planAssignedAt.getFullYear(), planAssignedAt.getMonth(), planAssignedAt.getDate());
  const end = new Date(start);
  end.setDate(end.getDate() + validityDays);
  return { start, end };
}

/**
 * Cupo restante de clases del usuario en el periodo de facturación actual de
 * su plan. null = sin límite (classes_per_month == null). Misma lógica que
 * src/utils/planEnforcement.ts / can_user_book — duplicada aquí porque esta
 * Edge Function corre con service role e inserta bookings saltándose RLS
 * (y por tanto can_user_book), así que sin esto la reserva por plantilla
 * podía superar el límite de clases del plan sin que nada lo frenara.
 */
async function getRemainingQuota(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  now: Date
): Promise<number | null> {
  const { data: profile } = await supabase.from('profiles').select('plan_id, plan_assigned_at').eq('id', userId).single();
  if (!profile?.plan_id) return 0;

  const { data: plan } = await supabase
    .from('membership_plans')
    .select('classes_per_month, is_active, billing_period, validity_days')
    .eq('id', profile.plan_id)
    .single();
  if (!plan || !plan.is_active) return 0;
  if (plan.classes_per_month == null) return null;

  const billingPeriod = plan.billing_period as BillingPeriod;

  let periodStart: Date;
  let periodEnd: Date;
  let total: number;

  if (billingPeriod === 'once') {
    if (!profile.plan_assigned_at || plan.validity_days == null) return 0;
    const window = getBonoWindow(new Date(profile.plan_assigned_at), plan.validity_days);
    if (now >= window.end) return 0; // bono caducado
    periodStart = window.start;
    periodEnd = window.end;
    total = plan.classes_per_month;
  } else {
    periodStart = getCurrentPeriodStart(billingPeriod, now);
    periodEnd = getPeriodEnd(billingPeriod, periodStart);
    total = plan.classes_per_month * getPeriodMonths(billingPeriod);
  }

  const { count } = await supabase
    .from('bookings')
    .select('*, classes!inner(class_date)', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('classes.class_date', toDateStr(periodStart))
    .lt('classes.class_date', toDateStr(periodEnd));

  return Math.max(0, total - (count ?? 0));
}

/**
 * Un usuario con la cuota bloqueada (o sin plan activo) no debe seguir
 * reservándose solo por tener una plantilla activa — igual que no podría
 * reservar a mano (src/utils/planEnforcement.ts). En cuanto se registre el
 * pago, la siguiente pasada semanal vuelve a reservarle con normalidad, sin
 * lógica especial de "reanudar": simplemente deja de estar bloqueado.
 */
async function isUserBlockedForBooking(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  now: Date
): Promise<boolean> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('plan_id, created_at, plan_assigned_at')
    .eq('id', userId)
    .single();
  if (!profile?.plan_id) return true;

  const { data: plan } = await supabase
    .from('membership_plans')
    .select('is_active, billing_period, validity_days')
    .eq('id', profile.plan_id)
    .single();
  if (!plan || !plan.is_active) return true;

  const billingPeriod = plan.billing_period as BillingPeriod;
  if (billingPeriod === 'daily') return false;

  if (billingPeriod === 'once') {
    // Bono: sin cuota periódica, pero caducado si ya pasó su ventana de
    // vigencia — un bono caducado no debe seguir generando reservas.
    if (!profile.plan_assigned_at || plan.validity_days == null) return true;
    const window = getBonoWindow(new Date(profile.plan_assigned_at), plan.validity_days);
    return now >= window.end;
  }

  const periodStart = getCurrentPeriodStart(billingPeriod, now);
  const { data: payment } = await supabase
    .from('plan_payments')
    .select('id')
    .eq('user_id', userId)
    .eq('period_start', toDateStr(periodStart))
    .maybeSingle();
  if (payment) return false;

  if (isGraceExpired(periodStart, now)) return true;

  // Dentro del margen de este periodo, pero comprueba si arrastra el anterior sin pagar.
  // Solo fecha, sin hora: created_at lleva la hora real de alta, y comparado
  // tal cual contra la medianoche de prevStart excluía a quien se diera de
  // alta el día 1 del periodo anterior salvo a las 00:00 en punto.
  const memberSince = profile.created_at ? new Date(profile.created_at) : null;
  const memberSinceDateOnly = memberSince ? new Date(memberSince.getFullYear(), memberSince.getMonth(), memberSince.getDate()) : null;
  const prevStart = getPreviousPeriodStart(billingPeriod, periodStart);
  if (memberSinceDateOnly && memberSinceDateOnly <= prevStart) {
    const { data: prevPayment } = await supabase
      .from('plan_payments')
      .select('id')
      .eq('user_id', userId)
      .eq('period_start', toDateStr(prevStart))
      .maybeSingle();
    if (!prevPayment) return true;
  }

  return false;
}

Deno.serve(async (req) => {
  // Solo debe disparar esto el cron semanal, nunca un cliente cualquiera —
  // verify_jwt de la plataforma solo exige un JWT válido, y la anon key
  // (pública, va embebida en la app) cuenta como uno. Sin este secreto
  // compartido, cualquiera podría forzar reservas automáticas a demanda.
  const cronSecret = Deno.env.get('CRON_SECRET');
  if (!cronSecret || req.headers.get('x-cron-secret') !== cronSecret) {
    return new Response(JSON.stringify({ error: 'No autorizado' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    console.log('🚀 Starting weekly template application...');

    // 1. Obtener fechas de la próxima semana (lunes a domingo)
    const today = new Date();
    const nextMonday = new Date(today);
    nextMonday.setDate(today.getDate() + ((1 + 7 - today.getDay()) % 7 || 7));
    nextMonday.setHours(0, 0, 0, 0);

    const nextSunday = new Date(nextMonday);
    nextSunday.setDate(nextMonday.getDate() + 6);
    nextSunday.setHours(23, 59, 59, 999);

    const startDate = nextMonday.toISOString().split('T')[0];
    const endDate = nextSunday.toISOString().split('T')[0];

    console.log(`📅 Date range: ${startDate} to ${endDate}`);

    // 2. Cargar todas las plantillas activas
    const { data: templates, error: templatesError } = await supabase
      .from('booking_templates')
      .select('*')
      .eq('is_active', true);

    if (templatesError) throw templatesError;

    if (!templates || templates.length === 0) {
      console.log('⚠️ No active templates found');
      return new Response(
        JSON.stringify({ message: 'No active templates', applied: 0 }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📋 Found ${templates.length} active templates`);

    // Usuarios con la cuota bloqueada (o sin plan activo) no se reservan
    // automáticamente esta semana, aunque tengan plantilla.
    const uniqueUserIds = Array.from(new Set((templates as Template[]).map((t) => t.user_id)));
    const blockedUserIds = new Set<string>();
    for (const userId of uniqueUserIds) {
      if (await isUserBlockedForBooking(supabase, userId, today)) {
        blockedUserIds.add(userId);
      }
    }
    if (blockedUserIds.size > 0) {
      console.log(`🚫 ${blockedUserIds.size} usuario(s) con reserva por plantilla omitida por cuota bloqueada`);
    }

    // Cupo de clases restante por usuario (null = sin límite). Se descuenta
    // en memoria según se van encolando reservas más abajo, para no superar
    // el límite del plan aunque varias plantillas/clases coincidan en la
    // misma pasada.
    const remainingQuota = new Map<string, number | null>();
    for (const userId of uniqueUserIds) {
      if (blockedUserIds.has(userId)) continue;
      remainingQuota.set(userId, await getRemainingQuota(supabase, userId, today));
    }
    let skippedQuota = 0;

    // 3. Cargar clases de la próxima semana
    const { data: classes, error: classesError } = await supabase
      .from('classes')
      .select('id, class_date, class_time, class_type, max_spots')
      .gte('class_date', startDate)
      .lte('class_date', endDate);

    if (classesError) throw classesError;

    if (!classes || classes.length === 0) {
      console.log('⚠️ No classes found for next week');
      return new Response(
        JSON.stringify({ message: 'No classes next week', applied: 0 }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    }

    console.log(`🏋️ Found ${classes.length} classes next week`);

    // 4. Matchear plantillas con clases
    const bookingsToCreate: Array<{
      user_id: string;
      class_id: string;
      template_id: string;
    }> = [];

    for (const template of templates as Template[]) {
      if (blockedUserIds.has(template.user_id)) continue;
      for (const classItem of classes as ClassMatch[]) {
        const classDate = new Date(classItem.class_date + 'T00:00:00');
        const classDayOfWeek = classDate.getDay();

        // Match: mismo día de semana + misma hora + mismo tipo
        if (
          classDayOfWeek === template.day_of_week &&
          classItem.class_time === template.class_time &&
          classItem.class_type === template.class_type
        ) {
          // Verificar que el usuario no esté ya reservado
          const { data: existingBooking } = await supabase
            .from('bookings')
            .select('id')
            .eq('user_id', template.user_id)
            .eq('class_id', classItem.id)
            .single();

          if (!existingBooking) {
            // Cupo de clases del plan: si ya está a 0 este periodo, la
            // plantilla no debe seguir reservando de forma silenciosa.
            const quota = remainingQuota.get(template.user_id);
            if (quota !== null && quota !== undefined && quota <= 0) {
              skippedQuota++;
              console.log(`🚫 Usuario ${template.user_id} sin cupo restante, se omite clase ${classItem.id}`);
              continue;
            }

            // Verificar que la clase no esté llena
            const { count: currentBookings } = await supabase
              .from('bookings')
              .select('*', { count: 'exact', head: true })
              .eq('class_id', classItem.id);

            if ((currentBookings || 0) < classItem.max_spots) {
              bookingsToCreate.push({
                user_id: template.user_id,
                class_id: classItem.id,
                template_id: template.id,
              });
              if (quota !== null && quota !== undefined) {
                remainingQuota.set(template.user_id, quota - 1);
              }
            } else {
              console.log(`⚠️ Class ${classItem.id} is full, skipping`);
            }
          }
        }
      }
    }

    console.log(`✅ ${bookingsToCreate.length} bookings to create`);

    // 5. Crear bookings
    if (bookingsToCreate.length > 0) {
      const { error: insertError } = await supabase
        .from('bookings')
        .insert(
          bookingsToCreate.map((b) => ({
            user_id: b.user_id,
            class_id: b.class_id,
          }))
        );

      if (insertError) throw insertError;

      // Deliberadamente sin notificación in-app ni push: la reserva por
      // plantilla es un proceso silencioso, el usuario ya sabe que tiene
      // plantilla activa y la ve reflejada en "Mis Clases" sin necesidad de
      // avisarle cada semana.
    }

    return new Response(
      JSON.stringify({
        success: true,
        applied: bookingsToCreate.length,
        skipped_blocked_users: blockedUserIds.size,
        skipped_quota_exceeded: skippedQuota,
        templates_checked: templates.length,
        classes_checked: classes.length,
        date_range: { start: startDate, end: endDate },
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('❌ Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});