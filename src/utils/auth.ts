import { supabase } from '../lib/supabase';
import { toDateStr } from './planPayments';

/**
 * Verificar si el usuario actual es admin
 */
export async function isUserAdmin(): Promise<boolean> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
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
    const { data: { user } } = await supabase.auth.getUser();
    
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
    const { data: { user } } = await supabase.auth.getUser();
    
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
    const { data: { user } } = await supabase.auth.getUser();
    
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