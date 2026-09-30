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
  /** Plantillas con fechas: null = sin inicio / sin fin ("Siempre") */
  valid_from: string | null;
  valid_until: string | null;
}

/**
 * Un socio puede tener varias plantillas con fechas. Para cada día manda la
 * que empieza más tarde de las que lo cubren (en empate, la que acaba antes).
 * Misma regla que src/utils/templatePeriods.ts (effectivePeriod): si cambia
 * allí, cámbiala aquí.
 */
const periodKeyOf = (t: { valid_from: string | null; valid_until: string | null }) =>
  `${t.valid_from ?? ''}|${t.valid_until ?? ''}`;

function effectivePeriodKey(periods: { valid_from: string | null; valid_until: string | null }[], dateStr: string): string | null {
  let best: { valid_from: string | null; valid_until: string | null } | null = null;
  for (const p of periods) {
    if ((p.valid_from && p.valid_from > dateStr) || (p.valid_until && dateStr > p.valid_until)) continue;
    if (!best) { best = p; continue; }
    const pf = p.valid_from ?? '', bf = best.valid_from ?? '';
    if (pf > bf || (pf === bf && (p.valid_until ?? '9999-12-31') < (best.valid_until ?? '9999-12-31'))) best = p;
  }
  return best ? periodKeyOf(best) : null;
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

/**
 * "Ahora" con la fecha y hora de España. Deno corre en UTC y el cron salta el
 * domingo a las 23:00 UTC, que en España ya es lunes: sin esto, "hoy" y el
 * periodo de pago se calculaban con el día anterior.
 */
function madridNow(): Date {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Madrid' }));
}

/**
 * Todas las filas de (class_id, user_id) de una tabla para esas clases, por
 * páginas: la API corta en 1000 filas y con un recorte silencioso se contaba
 * mal el aforo.
 */
async function fetchPairs(table: string, classIds: string[]): Promise<{ class_id: string; user_id: string }[]> {
  const PAGE = 1000;
  const out: { class_id: string; user_id: string }[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from(table)
      .select('class_id, user_id')
      .in('class_id', classIds)
      .order('class_id')
      .order('user_id')
      .range(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...((data || []) as { class_id: string; user_id: string }[]));
    if (!data || data.length < PAGE) return out;
  }
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
  // Solo debe disparar esto el cron diario, nunca un cliente cualquiera —
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

  // dry_run: calcula qué reservaría sin crear nada. days: horizonte (14 por defecto).
  let dryRun = false;
  let horizonDays = 14;
  try {
    const body = await req.json();
    dryRun = body?.dry_run === true;
    if (Number.isInteger(body?.days) && body.days > 0 && body.days <= 60) horizonDays = body.days;
  } catch { /* sin cuerpo: valores por defecto */ }

  try {
    console.log(`🚀 Applying templates (next ${horizonDays} days${dryRun ? ', DRY RUN' : ''})...`);

    // 1. Rango: de hoy (España) a hoy + horizonte. Corre cada noche, así que
    // las plantillas se aplican días antes de que se abran las reservas
    // (48 h antes de cada clase) y el socio fijo no se queda sin su plaza.
    // Antes era semanal (lunes 00:00) y las clases de lunes y martes ya
    // estaban abiertas desde el fin de semana.
    const today = madridNow();
    const from = new Date(today);
    from.setHours(0, 0, 0, 0);
    const to = new Date(from);
    to.setDate(from.getDate() + horizonDays);

    const startDate = toDateStr(from);
    const endDate = toDateStr(to);

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
    // automáticamente, aunque tengan plantilla.
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

    // Cupo restante por usuario Y periodo de la clase (null = sin límite): una
    // semana puede cruzar de mes, y las clases de octubre van contra el cupo
    // de octubre, no el de septiembre. Se calcula al necesitarlo y se
    // descuenta en memoria según se encolan reservas.
    const remainingQuota = new Map<string, number | null>();
    const quotaFor = async (userId: string, classDate: string): Promise<{ key: string; value: number | null }> => {
      const key = `${userId}|${classDate.slice(0, 7)}`;
      if (!remainingQuota.has(key)) {
        remainingQuota.set(key, await getRemainingQuota(supabase, userId, new Date(`${classDate}T12:00:00`)));
      }
      return { key, value: remainingQuota.get(key)! };
    };
    let skippedQuota = 0;

    // 3. Clases del rango que aún no han empezado
    const { data: allClasses, error: classesError } = await supabase
      .from('classes')
      .select('id, class_date, class_time, class_type, max_spots')
      .gte('class_date', startDate)
      .lte('class_date', endDate);

    if (classesError) throw classesError;

    const nowMadridMs = today.getTime();
    const classes = (allClasses || []).filter(
      (c: ClassMatch) => new Date(`${c.class_date}T${c.class_time}`).getTime() > nowMadridMs
    );

    if (classes.length === 0) {
      console.log('⚠️ No classes found in range');
      return new Response(
        JSON.stringify({ message: 'No classes in range', applied: 0 }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    }

    console.log(`🏋️ Found ${classes.length} classes in range`);

    // Reservas y bajas de esas clases, de una vez (antes era una consulta por
    // pareja plantilla×clase).
    const classIds = classes.map((c: ClassMatch) => c.id);
    const [rangeBookings, rangeCancellations] = await Promise.all([
      fetchPairs('bookings', classIds),
      fetchPairs('booking_cancellations', classIds),
    ]);
    const booked = new Set((rangeBookings || []).map((b: any) => `${b.user_id}|${b.class_id}`));
    // Baja puntual: si el socio se borró de ESA clase (o se cambió de ella),
    // no se le vuelve a apuntar a esa; las demás semanas, sí.
    const cancelled = new Set((rangeCancellations || []).map((b: any) => `${b.user_id}|${b.class_id}`));
    const occupancy = new Map<string, number>();
    (rangeBookings || []).forEach((b: any) => occupancy.set(b.class_id, (occupancy.get(b.class_id) || 0) + 1));
    let skippedCancelled = 0;

    // 4. Matchear plantillas con clases
    const bookingsToCreate: Array<{
      user_id: string;
      class_id: string;
      template_id: string;
    }> = [];

    // Plantillas (periodos) distintas de cada socio, para saber cuál manda cada día
    const periodsByUser = new Map<string, Map<string, Template>>();
    for (const t of templates as Template[]) {
      if (!periodsByUser.has(t.user_id)) periodsByUser.set(t.user_id, new Map());
      periodsByUser.get(t.user_id)!.set(periodKeyOf(t), t);
    }
    const effectiveCache = new Map<string, string | null>();
    const effectiveFor = (userId: string, dateStr: string) => {
      const k = `${userId}|${dateStr}`;
      if (!effectiveCache.has(k)) {
        effectiveCache.set(k, effectivePeriodKey(Array.from(periodsByUser.get(userId)!.values()), dateStr));
      }
      return effectiveCache.get(k);
    };

    for (const template of templates as Template[]) {
      if (blockedUserIds.has(template.user_id)) continue;
      const templatePeriod = periodKeyOf(template);
      for (const classItem of classes as ClassMatch[]) {
        const classDate = new Date(classItem.class_date + 'T00:00:00');
        const classDayOfWeek = classDate.getDay();

        // Match: mismo día de semana + misma hora + mismo tipo, y que esta
        // plantilla sea la que manda ese día
        if (
          effectiveFor(template.user_id, classItem.class_date) === templatePeriod &&
          classDayOfWeek === template.day_of_week &&
          classItem.class_time === template.class_time &&
          classItem.class_type === template.class_type
        ) {
          const pairKey = `${template.user_id}|${classItem.id}`;
          if (cancelled.has(pairKey) && !booked.has(pairKey)) {
            skippedCancelled++;
            continue;
          }

          if (!booked.has(pairKey)) {
            // Cupo de clases del plan: si ya está a 0 este periodo, la
            // plantilla no debe seguir reservando de forma silenciosa.
            const { key: quotaKey, value: quota } = await quotaFor(template.user_id, classItem.class_date);
            if (quota !== null && quota !== undefined && quota <= 0) {
              skippedQuota++;
              console.log(`🚫 Usuario ${template.user_id} sin cupo restante, se omite clase ${classItem.id}`);
              continue;
            }

            // Aforo: lo que hay en la base + lo ya encolado en esta pasada
            if ((occupancy.get(classItem.id) || 0) < classItem.max_spots) {
              bookingsToCreate.push({
                user_id: template.user_id,
                class_id: classItem.id,
                template_id: template.id,
              });
              occupancy.set(classItem.id, (occupancy.get(classItem.id) || 0) + 1);
              booked.add(pairKey);
              if (quota !== null && quota !== undefined) {
                remainingQuota.set(quotaKey, quota - 1);
              }
            } else {
              console.log(`⚠️ Class ${classItem.id} is full, skipping`);
            }
          }
        }
      }
    }

    console.log(`✅ ${bookingsToCreate.length} bookings to create`);

    // 5. Crear bookings (en dry_run, solo se devuelve qué se crearía)
    if (bookingsToCreate.length > 0 && !dryRun) {
      // ignoreDuplicates: si alguien se apuntó a mano entre la lectura y
      // esta escritura, su fila ya existe (UNIQUE class_id+user_id) y no debe
      // tumbar el lote entero.
      const { error: insertError } = await supabase
        .from('bookings')
        .upsert(
          bookingsToCreate.map((b) => ({
            user_id: b.user_id,
            class_id: b.class_id,
          })),
          { onConflict: 'class_id,user_id', ignoreDuplicates: true }
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
        dry_run: dryRun,
        applied: dryRun ? 0 : bookingsToCreate.length,
        would_apply: bookingsToCreate.length,
        would_apply_detail: dryRun ? bookingsToCreate : undefined,
        skipped_cancelled_by_member: skippedCancelled,
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