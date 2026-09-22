import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type BillingPeriod = 'daily' | 'monthly' | 'quarterly' | 'yearly' | 'once';

// Misma lógica de periodos que src/utils/planPayments.ts — no se puede
// importar directamente entre el bundle de la app y una Edge Function Deno.
function getCurrentPeriodStart(billingPeriod: BillingPeriod, d: Date): Date {
  if (billingPeriod === 'yearly') return new Date(d.getFullYear(), 0, 1);
  if (billingPeriod === 'quarterly') return new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1);
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function sameCalendarDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

const pad = (n: number) => String(n).padStart(2, '0');
const toDateStr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

async function sendPush(admin: any, userIds: string[], title: string, body: string, data: Record<string, string>) {
  if (userIds.length === 0) return;
  const { data: tokens } = await admin.from('push_tokens').select('token').in('user_id', userIds);
  if (!tokens || tokens.length === 0) return;
  const messages = tokens.map((t: { token: string }) => ({ to: t.token, sound: 'default', title, body, data }));
  try {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(messages),
    });
  } catch (e) {
    console.error('Error enviando push:', e);
  }
}

async function sendEmail(to: string, subject: string, html: string) {
  const apiKey = Deno.env.get('MAILGUN_API_KEY');
  const domain = Deno.env.get('MAILGUN_DOMAIN');
  if (!apiKey || !domain) return; // sin proveedor configurado todavía, se omite en silencio
  const from = Deno.env.get('MAILGUN_FROM_EMAIL') || `La Nave Strength Center <postmaster@${domain}>`;

  const form = new URLSearchParams();
  form.set('from', from);
  form.set('to', to);
  form.set('subject', subject);
  form.set('html', html);

  try {
    const res = await fetch(`https://api.mailgun.net/v3/${domain}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${btoa(`api:${apiKey}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    });
    if (!res.ok) console.error('Error Mailgun:', await res.text());
  } catch (e) {
    console.error('Error enviando email:', e);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  // Solo debe disparar esto el cron diario, nunca un cliente cualquiera —
  // verify_jwt de la plataforma solo exige un JWT válido, y la anon key
  // (pública, va embebida en la app) cuenta como uno. Sin este secreto
  // compartido, cualquiera podría forzar el envío de avisos/emails a demanda.
  const cronSecret = Deno.env.get('CRON_SECRET');
  if (!cronSecret || req.headers.get('x-cron-secret') !== cronSecret) {
    return new Response(JSON.stringify({ error: 'No autorizado' }), {
      status: 401,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  try {
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const today = new Date();
    const todayStartOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    const { data: users, error: usersError } = await admin
      .from('profiles')
      .select('id, full_name, username, email, plan_id, membership_plans!inner(name, billing_period, is_active)')
      .not('plan_id', 'is', null)
      .eq('membership_plans.is_active', true)
      .neq('membership_plans.billing_period', 'daily')
      .neq('membership_plans.billing_period', 'once');

    if (usersError) throw usersError;

    // Título/mensaje/umbral editables por el admin en el panel de
    // notificaciones (notification_templates). Si la plantilla no existe
    // todavía (antes de la migración, o fallo puntual de lectura), se usa el
    // texto/umbral de siempre — nunca se deja de avisar por esto.
    const DEFAULT_DUE = {
      title: 'Cuota pendiente',
      message: 'Tu cuota de "{{plan}}" de este periodo aún no está registrada. Tienes hasta el día 5 para renovarla antes de perder acceso a las reservas.',
    };
    const DEFAULT_BLOCKED = {
      title: 'Reservas bloqueadas',
      message: 'No se ha registrado el pago de tu cuota de "{{plan}}" y ya no puedes reservar clases. Ponte al día con tu entrenador.',
    };
    const DEFAULT_GRACE_DAYS = 5;

    const { data: templates } = await admin
      .from('notification_templates')
      .select('id, key, offset_days, enabled, title, message, icon_key')
      .in('key', ['payment_due', 'payment_blocked']);

    const templateByKey = Object.fromEntries((templates || []).map((t: any) => [t.key, t]));
    const dueTemplate = templateByKey['payment_due'];
    const blockedTemplate = templateByKey['payment_blocked'];
    const graceDays = blockedTemplate?.offset_days ?? DEFAULT_GRACE_DAYS;

    let reminders = 0;
    let blocks = 0;

    for (const user of users || []) {
      const plan = (user as any).membership_plans;
      const billingPeriod: BillingPeriod = plan.billing_period;
      const periodStart = getCurrentPeriodStart(billingPeriod, today);
      const blockDay = new Date(periodStart.getFullYear(), periodStart.getMonth(), graceDays);

      const isReminderDay = sameCalendarDay(today, periodStart);
      const isBlockedDay = sameCalendarDay(today, blockDay);
      if (!isReminderDay && !isBlockedDay) continue;

      const { data: payment } = await admin
        .from('plan_payments')
        .select('id')
        .eq('user_id', user.id)
        .eq('period_start', toDateStr(periodStart))
        .maybeSingle();
      if (payment) continue; // ya pagado, nada que avisar

      const type = isBlockedDay ? 'payment_blocked' : 'payment_due';
      const template = isBlockedDay ? blockedTemplate : dueTemplate;
      if (template && template.enabled === false) continue; // el admin lo ha desactivado

      // Evita duplicados si la función se ejecuta más de una vez el mismo día.
      const { data: existing } = await admin
        .from('notifications')
        .select('id')
        .eq('user_id', user.id)
        .eq('type', type)
        .gte('created_at', todayStartOfDay.toISOString())
        .maybeSingle();
      if (existing) continue;

      const fallback = isBlockedDay ? DEFAULT_BLOCKED : DEFAULT_DUE;
      const interpolate = (text: string) => text
        .replace(/\{\{nombre\}\}/g, user.full_name || '')
        .replace(/\{\{apodo\}\}/g, (user as any).username || user.full_name || '')
        .replace(/\{\{plan\}\}/g, plan.name || '');
      const title = interpolate(template?.title || fallback.title);
      const message = interpolate(template?.message || fallback.message);

      const { error: notifError } = await admin.from('notifications').insert({
        user_id: user.id, type, title, message, template_id: template?.id ?? null, icon_key: template?.icon_key ?? 'credit-card',
      });
      if (notifError) console.error('Error creando notificación:', notifError);

      await sendPush(admin, [user.id], title, message, { type });

      if (user.email) {
        await sendEmail(
          user.email,
          title,
          `<p>Hola ${user.full_name || ''},</p><p>${message}</p>`
        );
      }

      if (isBlockedDay) blocks++; else reminders++;
    }

    return new Response(JSON.stringify({ success: true, reminders, blocks }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('payment-reminders error:', error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
});
