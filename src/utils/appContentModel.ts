/**
 * Contenido editable desde el admin sin publicar versión (tabla app_content).
 * Lógica pura: valores originales y mezcla con lo guardado. La carga y el
 * caché están en appContent.ts.
 *
 * Regla: cualquier campo vacío, ausente o con formato raro se queda con el
 * valor original. Así un dato mal guardado nunca deja la portada en blanco.
 */

export type MenuCardKey = 'reservar' | 'misclases' | 'progreso' | 'perfil';

export const MENU_CARD_KEYS: MenuCardKey[] = ['reservar', 'misclases', 'progreso', 'perfil'];

export interface WelcomeSlideText {
  title: string;
  subtitle: string;
}

export interface MenuCardContent {
  title: string;
  subtitle: string;
  /** null = la imagen original que va dentro de la app */
  imageUrl: string | null;
}

export interface AppContent {
  welcomeSlides: WelcomeSlideText[];
  menuCards: Record<MenuCardKey, MenuCardContent>;
}

/** Filas de app_content tal cual llegan de la base de datos. */
export interface AppContentRow {
  key: string;
  value: unknown;
}

export const WELCOME_SLIDES_KEY = 'welcome_slides';
export const MENU_CARDS_KEY = 'menu_cards';

/** Longitudes máximas: por encima, los textos no caben en su sitio. */
export const CONTENT_LIMITS = {
  slideTitle: 40,
  slideSubtitle: 120,
  cardTitle: 30,
  cardSubtitle: 50,
};

export const DEFAULT_APP_CONTENT: AppContent = {
  welcomeSlides: [
    { title: 'Entrena sin\ncomplicaciones', subtitle: 'Reserva tu clase favorita en segundos desde cualquier lugar.' },
    { title: 'Plantillas\nautomáticas', subtitle: 'Configura tu semana una vez. El sistema reserva por ti cada semana.' },
    { title: 'Siempre\nal día', subtitle: 'Notificaciones en tiempo real. Nunca te pierdas una clase.' },
  ],
  menuCards: {
    reservar: { title: 'Reservar Clases', subtitle: 'Encuentra tu próximo entrenamiento', imageUrl: null },
    misclases: { title: 'Mis Clases', subtitle: 'Ver calendario de reservas', imageUrl: null },
    progreso: { title: 'Progreso y Ejercicios', subtitle: 'Estadísticas y calculadora %1RM', imageUrl: null },
    perfil: { title: 'Mi Perfil', subtitle: 'Edita tu información personal', imageUrl: null },
  },
};

export const MENU_CARD_LABELS: Record<MenuCardKey, string> = {
  reservar: 'Reservar clases',
  misclases: 'Mis clases',
  progreso: 'Progreso',
  perfil: 'Mi perfil',
};

function text(value: unknown, fallback: string, max: number): string {
  if (typeof value !== 'string') return fallback;
  const t = value.trim();
  return t.length > 0 && t.length <= max ? t : fallback;
}

function imageUrl(value: unknown): string | null {
  return typeof value === 'string' && value.startsWith('https://') ? value : null;
}

/** Lo guardado encima de lo original, campo a campo. */
export function mergeAppContent(rows: AppContentRow[] | null | undefined): AppContent {
  const byKey = new Map((rows || []).map(r => [r.key, r.value]));
  const d = DEFAULT_APP_CONTENT;

  const slidesRaw = byKey.get(WELCOME_SLIDES_KEY);
  const slides = Array.isArray(slidesRaw) ? slidesRaw : [];
  const welcomeSlides = d.welcomeSlides.map((def, i) => {
    const s = (slides[i] ?? {}) as Record<string, unknown>;
    return {
      title: text(s.title, def.title, CONTENT_LIMITS.slideTitle),
      subtitle: text(s.subtitle, def.subtitle, CONTENT_LIMITS.slideSubtitle),
    };
  });

  const cardsRaw = (byKey.get(MENU_CARDS_KEY) ?? {}) as Record<string, Record<string, unknown> | undefined>;
  const menuCards = {} as Record<MenuCardKey, MenuCardContent>;
  for (const key of MENU_CARD_KEYS) {
    const c = cardsRaw?.[key] ?? {};
    menuCards[key] = {
      title: text(c.title, d.menuCards[key].title, CONTENT_LIMITS.cardTitle),
      subtitle: text(c.subtitle, d.menuCards[key].subtitle, CONTENT_LIMITS.cardSubtitle),
      imageUrl: imageUrl(c.image_url),
    };
  }

  return { welcomeSlides, menuCards };
}

/** Del contenido editado a las filas que se guardan en app_content. */
export function toAppContentRows(content: AppContent): AppContentRow[] {
  const cards: Record<string, { title: string; subtitle: string; image_url: string | null }> = {};
  for (const key of MENU_CARD_KEYS) {
    const c = content.menuCards[key];
    cards[key] = { title: c.title.trim(), subtitle: c.subtitle.trim(), image_url: c.imageUrl };
  }
  return [
    { key: WELCOME_SLIDES_KEY, value: content.welcomeSlides.map(s => ({ title: s.title.trim(), subtitle: s.subtitle.trim() })) },
    { key: MENU_CARDS_KEY, value: cards },
  ];
}
