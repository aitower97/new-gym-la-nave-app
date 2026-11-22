/**
 * Lee TODAS las filas de una consulta, por páginas.
 *
 * PostgREST corta cada respuesta en 1.000 filas sin avisar: el historial de
 * un socio constante pasa de eso en uno o dos años y su progreso perdería
 * datos en silencio. La consulta debe ir ordenada de forma estable (acabar
 * en .order('id')), o una fila podría salir en dos páginas o en ninguna.
 */
export async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  pageSize = 1000,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await page(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < pageSize) return rows;
  }
}
