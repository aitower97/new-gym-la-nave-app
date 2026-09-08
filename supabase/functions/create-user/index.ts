import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CreateUserBody {
  email: string;
  password: string;
  full_name: string;
  role?: 'user' | 'admin';
  plan_id?: string | null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    // 1. Identificar al llamante con SU PROPIO token — igual que delete-user.
    //    Nunca crear un usuario a partir de un body sin verificar antes que
    //    quien llama es admin.
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

    // 2. Cliente admin: SERVICE_ROLE_KEY bypasea RLS y crea el usuario sin
    //    pasar por auth.signUp() del propio cliente — signUp() en un cliente
    //    con sesión ya iniciada (el del admin) reemplazaría esa sesión por la
    //    del usuario recién creado, dejando al admin fuera de su propia
    //    cuenta en su dispositivo. admin.auth.admin.createUser() crea el
    //    usuario en el servidor sin tocar ninguna sesión de cliente.
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: callerRole } = await admin
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();
    if (callerRole?.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'No autorizado para crear usuarios' }), {
        status: 403,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    const body: CreateUserBody = await req.json();
    if (!body.email?.trim() || !body.password || !body.full_name?.trim()) {
      return new Response(JSON.stringify({ error: 'Faltan campos obligatorios' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // 3. Crear el usuario en Auth, con el email ya confirmado (lo da de alta
    //    un admin, no hay flujo de verificación propio para altas manuales).
    const { data: authData, error: createAuthError } = await admin.auth.admin.createUser({
      email: body.email.trim(),
      password: body.password,
      email_confirm: true,
      user_metadata: { full_name: body.full_name.trim() },
    });
    if (createAuthError || !authData.user) {
      throw createAuthError ?? new Error('No se pudo crear el usuario');
    }

    // 4. La fila de profiles ya la crea sola el trigger on_auth_user_created
    //    (handle_new_user, dispara al insertar en auth.users) con
    //    id/email/full_name — aquí solo faltan los campos que ese trigger no
    //    conoce: rol y plan asignado. Un INSERT propio chocaría con el
    //    ON CONFLICT (id) DO NOTHING del trigger (no lanza error, pero no
    //    aplicaría rol/plan porque ya existe la fila).
    const { error: profileError } = await admin
      .from('profiles')
      .update({
        role: body.role ?? 'user',
        plan_id: body.plan_id ?? null,
        plan_assigned_at: body.plan_id ? new Date().toISOString() : null,
      })
      .eq('id', authData.user.id);
    if (profileError) {
      // El usuario de Auth ya se creó — si esto falla, deshacer para no
      // dejar una cuenta huérfana sin rol/plan correctos.
      await admin.auth.admin.deleteUser(authData.user.id);
      throw profileError;
    }

    return new Response(JSON.stringify({ success: true, userId: authData.user.id }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('create-user error:', error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
});
