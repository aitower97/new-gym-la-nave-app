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

export async function isUserAdmin(): Promise<boolean> {
  try {
    const user = await getCurrentUser();
    
    if (!user) return false;

    const { data, error } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) {
      console.error('Error checking role:', error);
      return false;
    }

    return data?.role === 'admin';
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

    const { data, error } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) {
      console.error('Error getting role:', error);
      return null;
    }

    return data?.role || null;
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