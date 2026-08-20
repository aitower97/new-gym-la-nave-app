import { supabase } from '../lib/supabase';

export interface TodayWorkoutAccess {
  hasBookingToday: boolean;
  unlockTime: string | null; // "HH:MM:SS" de la clase reservada más temprana de hoy
  isUnlocked: boolean;
}

const nowTimeStr = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

/**
 * La sesión de hoy solo se desbloquea a la hora de la clase reservada más
 * temprana del usuario ese día — evita que se pueda ver el WOD con antelación.
 * Sin ninguna clase reservada hoy, se considera bloqueada (no hay hora con la
 * que comparar).
 */
export async function getTodayWorkoutAccess(userId: string, dateStr: string): Promise<TodayWorkoutAccess> {
  const { data } = await supabase
    .from('bookings')
    .select('classes!inner(class_time, class_date)')
    .eq('user_id', userId)
    .eq('classes.class_date', dateStr);

  const times = (data || [])
    .map((b: any) => b.classes?.class_time as string | undefined)
    .filter((t): t is string => !!t)
    .sort();

  if (times.length === 0) {
    return { hasBookingToday: false, unlockTime: null, isUnlocked: false };
  }

  const unlockTime = times[0];
  return { hasBookingToday: true, unlockTime, isUnlocked: nowTimeStr() >= unlockTime };
}

export function formatUnlockTime(time: string): string {
  return time.slice(0, 5);
}
