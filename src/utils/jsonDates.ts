/**
 * JSON que conserva las fechas. JSON.stringify convierte un Date en texto y
 * JSON.parse lo deja como texto: un `.getTime()` sobre él rompe (pasó con el
 * cupo del menú en 1.23.0). Aquí cada Date se guarda marcado y vuelve como Date.
 */

const MARK = '__date';

export function stringifyWithDates(value: unknown): string {
  return JSON.stringify(value, function (this: Record<string, unknown>, key, v) {
    // `v` ya viene convertido por Date.toJSON; el original está en this[key]
    const original = this[key];
    return original instanceof Date ? { [MARK]: original.getTime() } : v;
  });
}

export function parseWithDates<T = unknown>(raw: string): T {
  return JSON.parse(raw, (_key, v) =>
    v && typeof v === 'object' && Object.keys(v).length === 1 && typeof v[MARK] === 'number'
      ? new Date(v[MARK])
      : v,
  ) as T;
}
