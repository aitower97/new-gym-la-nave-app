/**
 * waitlistOfferModel.ts — Lógica pura de las ofertas de la lista de espera
 * (sin Supabase, para poder testearla).
 *
 * Cuando se libera una plaza y el primero de la cola ya tiene otra clase ese
 * día, la base de datos le GUARDA la plaza unos minutos (waitlist_offers) y
 * él decide: cambiarse, quedarse con las dos o seguir como está. De noche el
 * reloj está parado (starts_at en el futuro). Ver
 * supabase/migrations/20260929120000_waitlist_offers.sql.
 */

export type OfferAction = 'move' | 'both' | 'decline';

export interface OfferOtherClass {
  bookingId: string;
  name: string;
  /** "HH:MM:SS" */
  time: string;
}

export interface PendingOffer {
  id: string;
  classId: string;
  className: string;
  /** "YYYY-MM-DD" */
  classDate: string;
  /** "HH:MM:SS" */
  classTime: string;
  startsAt: Date;
  expiresAt: Date;
  /** Sus otras clases de ese día que aún no han empezado */
  otherClasses: OfferOtherClass[];
  maxPerDay: number;
}

export interface OfferOption {
  action: OfferAction;
  bookingId?: string;
  label: string;
  primary: boolean;
}

const hhmm = (t: string) => t.slice(0, 5);
const pad2 = (n: number) => String(n).padStart(2, '0');

/** Botones de la oferta, en el orden en que se muestran. */
export function offerOptions(offer: PendingOffer): OfferOption[] {
  const options: OfferOption[] = [];
  if (offer.otherClasses.length === 0) {
    // Ya no tiene otra clase ese día (la canceló mientras tanto): solo entrar
    options.push({ action: 'move', label: `Entrar en la de las ${hhmm(offer.classTime)}`, primary: true });
  } else {
    offer.otherClasses.forEach((c) => {
      options.push({
        action: 'move',
        bookingId: c.bookingId,
        label: `Cambiarme desde la de las ${hhmm(c.time)}`,
        primary: true,
      });
    });
    // Quedarse con las dos solo si le caben por el máximo diario
    if (offer.otherClasses.length < offer.maxPerDay) {
      options.push({ action: 'both', label: 'Quedarme con las dos', primary: false });
    }
  }
  options.push({ action: 'decline', label: 'No, sigo como estoy', primary: false });
  return options;
}

export type OfferClock =
  | { phase: 'waiting'; label: string }
  | { phase: 'running'; label: string; secondsLeft: number }
  | { phase: 'expired'; label: string };

/**
 * Estado del reloj de la oferta.
 * - waiting: de noche; el tiempo empieza a contar a las HH:MM
 * - running: "14:05" (minutos:segundos que quedan)
 * - expired
 */
export function offerClock(offer: Pick<PendingOffer, 'startsAt' | 'expiresAt'>, now = new Date()): OfferClock {
  const left = Math.floor((offer.expiresAt.getTime() - now.getTime()) / 1000);
  if (left <= 0) return { phase: 'expired', label: 'Se acabó el tiempo' };
  if (offer.startsAt.getTime() > now.getTime()) {
    const s = offer.startsAt;
    return { phase: 'waiting', label: `El tiempo empieza a contar a las ${pad2(s.getHours())}:${pad2(s.getMinutes())}` };
  }
  const h = Math.floor(left / 3600);
  const m = Math.floor((left % 3600) / 60);
  const sec = left % 60;
  const label = h > 0 ? `${h}:${pad2(m)}:${pad2(sec)}` : `${pad2(m)}:${pad2(sec)}`;
  return { phase: 'running', label, secondsLeft: left };
}

/** Texto tras contestar (lo que devuelve respond_waitlist_offer). */
export function offerResultMessage(result: string, offer: Pick<PendingOffer, 'className' | 'classTime'>): { title: string; message: string } {
  const clase = `${offer.className} a las ${hhmm(offer.classTime)}`;
  switch (result) {
    case 'move':
      return { title: '¡Dentro!', message: `Ya tienes plaza en ${clase}. Tu otra clase ha quedado libre para otra persona.` };
    case 'both':
      return { title: '¡Dentro!', message: `Ya tienes plaza en ${clase} y mantienes tu otra clase.` };
    case 'declined':
      return { title: 'Perfecto', message: 'Sigues como estabas y mantienes tu puesto en la lista de espera. La plaza pasa al siguiente.' };
    case 'expired':
      return { title: 'Se acabó el tiempo', message: 'La plaza ha pasado al siguiente de la lista. Sigues en la lista de espera.' };
    case 'closed':
      return { title: 'Oferta cerrada', message: 'Esta plaza ya no está disponible.' };
    case 'not_allowed':
      return { title: 'No se puede', message: 'Tu plan no te permite esta opción (cupo, pago o máximo de clases por día). Prueba otra o habla con el gimnasio.' };
    default:
      return { title: 'Error', message: 'No se pudo completar. Inténtalo de nuevo.' };
  }
}
