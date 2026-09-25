import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RequestBody {
  userIds?: string[];
  subject?: string;
  html?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    // 1. Identificar al llamante con SU PROPIO token — igual que create-user/
    //    delete-user, nunca fiarse de un userId/rol que mande el body.
    const authHeader = req.headers.get('Authorization') ?? '';
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'No autorizado' }), {
        status: 401,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // 2. Solo un admin puede mandar un email masivo a socios.
    const { data: callerRole } = await admin.from('user_roles').select('role').eq('user_id', user.id).single();
    if (callerRole?.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Solo un admin puede enviar emails' }), {
        status: 403,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    const body: RequestBody = await req.json();
    const userIds = body.userIds || [];
    const subject = (body.subject || '').trim();
    const html = body.html || '';

    if (userIds.length === 0 || !subject || !html) {
      return new Response(JSON.stringify({ error: 'Faltan destinatarios, asunto o mensaje' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // 3. Los emails se resuelven aquí con el cliente admin, no se aceptan del
    //    body — así el admin solo puede mandar a userIds reales, nunca a una
    //    dirección arbitraria colada en la petición.
    const { data: profiles, error: profilesError } = await admin
      .from('profiles')
      .select('id, email, full_name, username, plan_id')
      .in('id', userIds);
    if (profilesError) throw profilesError;

    // {{plan}} se admite igual que en la notificación in-app
    // (src/utils/interpolateTemplate.ts); sin esto llegaba literal al email.
    const { data: plans } = await admin.from('membership_plans').select('id, name');
    const planNameById = new Map((plans || []).map((pl) => [pl.id, pl.name as string]));
    // Nombre y apodo los escribe el propio socio: insertados tal cual en el
    // HTML permitirían colar enlaces en un correo firmado por el gimnasio.
    const escapeHtml = (s: string) =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const interpolate = (
      text: string,
      p: { full_name: string | null; username: string | null; plan_id: string | null },
      asHtml: boolean,
    ) => {
      // Sustitución con función, no con string: un apodo con "$&" o "$1" se
      // interpretaría como patrón de reemplazo y saldría deformado.
      const safe = (v: string) => () => (asHtml ? escapeHtml(v) : v);
      return text
        .replace(/\{\{nombre\}\}/g, safe(p.full_name || ''))
        .replace(/\{\{apodo\}\}/g, safe(p.username || p.full_name || ''))
        .replace(/\{\{plan\}\}/g, safe((p.plan_id && planNameById.get(p.plan_id)) || ''));
    };

    const resendKey = Deno.env.get('RESEND_API_KEY');
    if (!resendKey) {
      return new Response(JSON.stringify({ error: 'RESEND_API_KEY no configurado en los secretos del proyecto' }), {
        status: 500,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }
    const mailFrom = Deno.env.get('MAIL_FROM') || 'no-reply@entrenoenlanave.es';
    const mailFromName = Deno.env.get('MAIL_FROM_NAME') || 'La Nave Strength Center';
    // El remitente (info@) no es un buzón real: el MX del dominio apunta a la
    // recepción de Resend, que nadie lee. Sin esto, un socio que pulse
    // "Responder" escribe al vacío.
    const mailReplyTo = Deno.env.get('MAIL_REPLY_TO') || 'lanavesc@gmail.com';

    let sent = 0;
    let failed = 0;

    for (const p of profiles || []) {
      if (!p.email) { failed++; continue; }

      const personalizedHtml = interpolate(html, p, true);

      try {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: `${mailFromName} <${mailFrom}>`,
            reply_to: mailReplyTo,
            to: p.email,
            subject: interpolate(subject, p, false),
            html: personalizedHtml,
          }),
        });
        if (res.ok) {
          sent++;
        } else {
          failed++;
          console.error('Resend error:', await res.text());
        }
      } catch (e) {
        failed++;
        console.error('Error enviando a', p.email, e);
      }
    }

    return new Response(JSON.stringify({ success: true, sent, failed }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('send-email error:', error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
});
