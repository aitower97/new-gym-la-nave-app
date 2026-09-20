/**
 * planPrice.ts — Cómo se escribe el precio de un plan.
 *
 * Existe para que la regla del precio 0 viva en un solo sitio: un plan
 * gratuito (la clase de prueba) se muestra como "Gratis", no como "0.00 EUR",
 * que se lee como un dato mal cargado.
 */

/** Precio de un plan tal y como debe mostrarse al usuario. */
export function formatPlanPrice(
  price: number | string | null | undefined,
  currency: string = 'EUR',
  decimals: number = 2
): string {
  // Un precio ausente o ilegible no se inventa: se dice que no se sabe, en
  // vez de pintar un 0 que se confundiría con "gratis" y regalaría el plan.
  //
  // Se descartan antes de convertir porque Number(null) y Number('') valen 0,
  // no NaN: sin esto, un precio nulo acabaría mostrándose como "Gratis".
  if (price === null || price === undefined) return '—';
  if (typeof price === 'string' && price.trim() === '') return '—';

  const n = Number(price);
  if (!Number.isFinite(n)) return '—';

  if (n <= 0) return 'Gratis';

  // "60€" pero "60.00 EUR": un símbolo va pegado a la cifra y un código de
  // divisa separado. Sin esto, las fichas compactas del panel de admin
  // ganaban un espacio que antes no tenían.
  const esSimbolo = /^[^\w\s]$/u.test(currency);
  return esSimbolo ? `${n.toFixed(decimals)}${currency}` : `${n.toFixed(decimals)} ${currency}`;
}
