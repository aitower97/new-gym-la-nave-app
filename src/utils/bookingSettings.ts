import { supabase } from '../lib/supabase';

const CUTOFF_KEY = 'booking_cutoff_hours';
export const DEFAULT_CUTOFF_HOURS = 48;

/** Antelación mínima (en horas) para poder reservar una clase. Configurable por el admin. */
export async function getBookingCutoffHours(): Promise<number> {
  const { data } = await supabase.from('app_settings').select('value').eq('key', CUTOFF_KEY).maybeSingle();
  const n = data ? parseInt(data.value, 10) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_CUTOFF_HOURS;
}

export async function setBookingCutoffHours(hours: number, adminId: string): Promise<void> {
  const { error } = await supabase
    .from('app_settings')
    .upsert({ key: CUTOFF_KEY, value: String(hours), updated_by: adminId, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) throw error;
}

const FREE_TRIAL_KEY = 'free_trial_enabled';

/**
 * ¿El gimnasio ofrece la clase de prueba gratuita? Quien no tiene plan puede
 * reservar UNA clase sin que el admin le asigne nada.
 *
 * Ante la duda se responde que no: si la consulta falla, es preferible pedir
 * un plan a regalar clases por un fallo de red.
 */
export async function isFreeTrialEnabled(): Promise<boolean> {
  const { data } = await supabase.from('app_settings').select('value').eq('key', FREE_TRIAL_KEY).maybeSingle();
  return data?.value === 'true';
}

export async function setFreeTrialEnabled(enabled: boolean, adminId: string): Promise<void> {
  const { error } = await supabase
    .from('app_settings')
    .upsert({ key: FREE_TRIAL_KEY, value: enabled ? 'true' : 'false', updated_by: adminId, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) throw error;
}

export function getClassDateTime(classDate: string, classTime: string): Date {
  return new Date(`${classDate}T${classTime}`);
}

/** Momento exacto en que la clase deja de estar bloqueada (classDateTime - cutoffHours). */
export function getUnlockDate(classDate: string, classTime: string, cutoffHours: number): Date {
  return new Date(getClassDateTime(classDate, classTime).getTime() - cutoffHours * 3_600_000);
}

export function isWithinCutoff(classDate: string, classTime: string, cutoffHours: number, now = new Date()): boolean {
  return now < getUnlockDate(classDate, classTime, cutoffHours);
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** "2d 04:23:11" / "04:23:11" — cuenta atrás en vivo (con segundos) para el overlay de la card bloqueada. */
export function formatUnlockCountdown(unlockDate: Date, now = new Date()): string {
  const ms = unlockDate.getTime() - now.getTime();
  if (ms <= 0) return '00:00:00';
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const clock = `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`;
  return days > 0 ? `${days}d ${clock}` : clock;
}
