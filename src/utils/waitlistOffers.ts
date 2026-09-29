/**
 * waitlistOffers.ts — Ofertas de plaza de la lista de espera (datos).
 *
 * La base crea, guarda y caduca las ofertas (fill_waitlist_vacancy y el cron
 * waitlist-offers-minutely); la app solo las lee y las contesta con
 * respond_waitlist_offer. La lógica pura (botones, reloj, textos) está en
 * waitlistOfferModel.ts.
 */

import { supabase } from '../lib/supabase';
import { getMaxClassesPerDay } from './bookingSettings';
import { OfferAction, PendingOffer } from './waitlistOfferModel';

/** La oferta pendiente del socio (la más antigua), o null. */
export async function fetchMyPendingOffer(userId: string): Promise<PendingOffer | null> {
  const { data: offers, error } = await supabase
    .from('waitlist_offers')
    .select('id, class_id, starts_at, expires_at, classes(name, class_date, class_time)')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())
    .order('created_at')
    .limit(1);
  if (error || !offers || offers.length === 0) return null;

  const row: any = offers[0];
  const cls = Array.isArray(row.classes) ? row.classes[0] : row.classes;
  if (!cls) return null;

  // Sus otras clases de ese día que aún no han empezado (desde cuál se cambiaría)
  const [{ data: sameDay }, maxPerDay] = await Promise.all([
    supabase
      .from('bookings')
      .select('id, class_id, classes!inner(name, class_date, class_time)')
      .eq('user_id', userId)
      .eq('classes.class_date', cls.class_date),
    getMaxClassesPerDay(),
  ]);
  const now = Date.now();
  const otherClasses = ((sameDay || []) as any[])
    .map((b) => ({ b, c: Array.isArray(b.classes) ? b.classes[0] : b.classes }))
    .filter(({ b, c }) => b.class_id !== row.class_id && new Date(`${c.class_date}T${c.class_time}`).getTime() > now)
    .sort((x, y) => x.c.class_time.localeCompare(y.c.class_time))
    .map(({ b, c }) => ({ bookingId: b.id as string, name: c.name as string, time: c.class_time as string }));

  return {
    id: row.id,
    classId: row.class_id,
    className: cls.name,
    classDate: cls.class_date,
    classTime: cls.class_time,
    startsAt: new Date(row.starts_at),
    expiresAt: new Date(row.expires_at),
    otherClasses,
    maxPerDay,
  };
}

/** Contesta a la oferta. Devuelve el código de respond_waitlist_offer. */
export async function respondToOffer(offerId: string, action: OfferAction, bookingId?: string): Promise<string> {
  const { data, error } = await supabase.rpc('respond_waitlist_offer', {
    p_offer_id: offerId,
    p_action: action,
    p_booking_id: bookingId ?? null,
  });
  if (error) throw error;
  return String(data);
}

/** Plazas guardadas (ofertas pendientes) por clase. Cuentan como ocupadas. */
export async function getHeldSpots(classIds: string[]): Promise<Record<string, number>> {
  if (classIds.length === 0) return {};
  const { data } = await supabase.rpc('class_held_spots', { p_class_ids: classIds });
  const out: Record<string, number> = {};
  ((data || []) as any[]).forEach((r) => { out[r.class_id] = r.held; });
  return out;
}

/** Solo admin (RLS): a quién se le está ofreciendo plaza y hasta cuándo, por clase. */
export async function getPendingOffersByClass(classIds: string[]): Promise<Record<string, Record<string, string>>> {
  if (classIds.length === 0) return {};
  const { data } = await supabase
    .from('waitlist_offers')
    .select('class_id, user_id, expires_at')
    .eq('status', 'pending')
    .in('class_id', classIds);
  const out: Record<string, Record<string, string>> = {};
  ((data || []) as any[]).forEach((o) => { (out[o.class_id] ||= {})[o.user_id] = o.expires_at; });
  return out;
}

// Aviso entre el modal (a nivel de app) y las pantallas abiertas: al
// contestar una oferta cambian reservas y colas, y Reservar debe recargar.
type Listener = () => void;
const listeners = new Set<Listener>();

export function onWaitlistOfferResolved(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function emitWaitlistOfferResolved(): void {
  listeners.forEach((l) => l());
}
