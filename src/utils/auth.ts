import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { toDateStr } from './planPayments';

/**
 * Verificar si el usuario actual es admin
 */
/**
 * Usuario con sesión iniciada, leído de la sesión guardada en el móvil.
 * supabase.auth.getUser() hace una petición al servidor cada vez (~100 ms en
 * el mejor caso, segundos en los picos) solo para devolver lo mismo. Para
 * saber "quién soy" basta la sesión local: cada consulta posterior viaja con
 * el token y la RLS lo valida igualmente en la base de datos.
 */
export async function getCurrentUser(): Promise<User | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user ?? null;
}

// El rol se pide una vez por sesión: varias pantallas lo preguntan al abrir y
// cada consulta era un viaje más. Solo es para la interfaz: lo que de verdad
// decide qué puede hacer cada uno es la RLS de la base de datos.
const roleCache = new Map<string, Promise<'user' | 'admin' | null>>();

function fetchRole(userId: string): Promise<'user' | 'admin' | null> {
  const cached = roleCache.get(userId);
  if (cached) return cached;
  const pending = (async () => {
    const { data, error } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw error;
    return (data?.role as 'user' | 'admin' | undefined) || null;
  })();
  roleCache.set(userId, pending);
  // Un error no se queda guardado: la siguiente vez se vuelve a preguntar
  pending.catch(() => roleCache.delete(userId));
  return pending;
}

/** Al cerrar sesión o cambiar de cuenta. */
export function clearRoleCache(): void {
  roleCache.clear();
}

export async function isUserAdmin(): Promise<boolean> {
  try {
    const user = await getCurrentUser();
    if (!user) return false;
    return (await fetchRole(user.id)) === 'admin';
  } catch (error) {
    console.error('Error in isUserAdmin:', error);
    return false;
  }
}

/**
 * Obtener el rol del usuario actual
 */
export async function getUserRole(): Promise<'user' | 'admin' | null> {
  try {
    const user = await getCurrentUser();
    if (!user) return null;
    return await fetchRole(user.id);
  } catch (error) {
    console.error('Error in getUserRole:', error);
    return null;
  }
}

/**
 * Verificar si el usuario tiene un plan activo
 */
export async function hasActivePlan(): Promise<boolean> {
  try {
    const user = await getCurrentUser();
    
    if (!user) return false;

    // toDateStr usa año/mes/día LOCALES — toISOString() convierte a UTC
    // antes de recortar la fecha, lo que en España puede devolver el día
    // anterior y descuadrar el rango de vigencia del plan.
    const today = toDateStr(new Date());

    const { data, error } = await supabase
      .from('user_memberships')
      .select('id')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .lte('start_date', today)
      .gte('end_date', today)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Error checking membership:', error);
      return false;
    }

    return !!data;
  } catch (error) {
    console.error('Error in hasActivePlan:', error);
    return false;
  }
}

/**
 * Obtener plan activo del usuario
 */
export async function getActivePlan(): Promise<any | null> {
  try {
    const user = await getCurrentUser();
    
    if (!user) return null;

    // toDateStr usa año/mes/día LOCALES — toISOString() convierte a UTC
    // antes de recortar la fecha, lo que en España puede devolver el día
    // anterior y descuadrar el rango de vigencia del plan.
    const today = toDateStr(new Date());

    const { data, error } = await supabase
      .from('user_memberships')
      .select(`
        *,
        membership_plans (*)
      `)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .lte('start_date', today)
      .gte('end_date', today)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Error getting active plan:', error);
      return null;
    }

    return data || null;
  } catch (error) {
    console.error('Error in getActivePlan:', error);
    return null;
  }
}