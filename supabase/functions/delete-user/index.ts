import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Tablas con columna user_id que referencian al usuario (orden irrelevante:
// no hay dependencias entre ellas, todas cuelgan directamente de auth.users)
const USER_OWNED_TABLES = [
  'bookings',
  'workout_notes',
  'workout_logs',
  'push_tokens',
  'notifications',
  'user_memberships',
  'user_roles',
];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    // 1. Identificar al llamante con SU PROPIO token — nunca confiar en un
    //    userId enviado en el body, o cualquiera podría borrar a otro usuario.
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

    // 2. Cliente admin: SERVICE_ROLE_KEY bypasea RLS por completo.
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // 3. Borrar avatar de Storage (carpeta = user.id, ver ProfileScreen.tsx)
    const { data: files, error: listError } = await admin.storage
      .from('avatars')
      .list(user.id);

    if (listError) {
      console.error('Error listando avatares:', listError.message);
    } else if (files && files.length > 0) {
      const paths = files.map((f) => `${user.id}/${f.name}`);
      const { error: removeError } = await admin.storage.from('avatars').remove(paths);
      if (removeError) console.error('Error borrando avatares:', removeError.message);
    }

    // 4. Borrar filas de todas las tablas dependientes
    for (const table of USER_OWNED_TABLES) {
      const { error } = await admin.from(table).delete().eq('user_id', user.id);
      if (error) {
        console.error(`Error borrando de ${table}:`, error.message);
      }
    }

    // 5. Borrar el perfil (PK = user.id, no user_id)
    const { error: profileError } = await admin.from('profiles').delete().eq('id', user.id);
    if (profileError) {
      console.error('Error borrando profile:', profileError.message);
    }

    // 6. Borrar el usuario de Auth — sin esto no hay derecho al olvido real:
    //    el email y el hash de contraseña seguirían existiendo en auth.users.
    const { error: deleteAuthError } = await admin.auth.admin.deleteUser(user.id);
    if (deleteAuthError) {
      throw deleteAuthError;
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('delete-user error:', error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
});
