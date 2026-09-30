/**
 * releaseNotes.ts — Lo que sale en "Novedades" tras una actualización.
 *
 * La más reciente, ARRIBA. Cada entrada se enseña una vez por móvil (se
 * recuerda su id). El socio ve `member`; el admin ve `admin` y después
 * `member`. Quien se dio de alta después de `date` no la ve: para él no es
 * nuevo.
 *
 * Frases cortas, una idea por línea, sin explicar el cómo.
 */

export interface ReleaseNote {
  /** Único y estable; se guarda como "vista" en el móvil */
  id: string;
  /** "YYYY-MM-DD" */
  date: string;
  member: string[];
  admin: string[];
}

export const RELEASE_NOTES: ReleaseNote[] = [
  {
    id: '2026-10-01',
    date: '2026-10-01',
    member: [
      'Entra con Google o Apple',
      'Hasta 2 clases el mismo día',
      'Lista de espera: varias a la vez, y mantener o volver a tu hora',
      'RPE con medios (7,5) y rangos (7/8)',
    ],
    admin: [
      'Bajas y cambios de clase, en cada clase',
      'Fecha de nacimiento en la ficha del socio',
      'Textos e imágenes de la app, editables',
      'Máximo de clases por día, en ajustes de reserva',
      'Las plantillas se aplican cada noche',
    ],
  },
];
