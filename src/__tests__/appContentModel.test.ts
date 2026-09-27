import {
  DEFAULT_APP_CONTENT,
  MENU_CARDS_KEY,
  WELCOME_SLIDES_KEY,
  mergeAppContent,
  toAppContentRows,
} from '../utils/appContentModel';

describe('mergeAppContent', () => {
  it('sin nada guardado, todo lo original', () => {
    expect(mergeAppContent([])).toEqual(DEFAULT_APP_CONTENT);
    expect(mergeAppContent(null)).toEqual(DEFAULT_APP_CONTENT);
  });

  it('usa lo guardado y rellena lo que falte con lo original', () => {
    const c = mergeAppContent([
      { key: WELCOME_SLIDES_KEY, value: [{ title: '  Nuevo título ', subtitle: '' }] },
      { key: MENU_CARDS_KEY, value: { reservar: { title: 'Reserva ya', image_url: 'https://x.supabase.co/img.jpg' } } },
    ]);
    expect(c.welcomeSlides[0].title).toBe('Nuevo título');
    expect(c.welcomeSlides[0].subtitle).toBe(DEFAULT_APP_CONTENT.welcomeSlides[0].subtitle);
    expect(c.welcomeSlides[1]).toEqual(DEFAULT_APP_CONTENT.welcomeSlides[1]);
    expect(c.menuCards.reservar.title).toBe('Reserva ya');
    expect(c.menuCards.reservar.subtitle).toBe(DEFAULT_APP_CONTENT.menuCards.reservar.subtitle);
    expect(c.menuCards.reservar.imageUrl).toBe('https://x.supabase.co/img.jpg');
    expect(c.menuCards.perfil).toEqual(DEFAULT_APP_CONTENT.menuCards.perfil);
  });

  it('descarta datos raros: tipos malos, textos demasiado largos, URLs no https', () => {
    const c = mergeAppContent([
      { key: WELCOME_SLIDES_KEY, value: 'no es una lista' },
      { key: MENU_CARDS_KEY, value: { misclases: { title: 'x'.repeat(200), subtitle: 42, image_url: 'http://inseguro/img.jpg' } } },
    ]);
    expect(c.welcomeSlides).toEqual(DEFAULT_APP_CONTENT.welcomeSlides);
    expect(c.menuCards.misclases).toEqual(DEFAULT_APP_CONTENT.menuCards.misclases);
  });
});

describe('toAppContentRows', () => {
  it('ida y vuelta sin perder nada', () => {
    const edited = mergeAppContent([]);
    edited.welcomeSlides[2].title = 'Cambiado';
    edited.menuCards.progreso.imageUrl = 'https://x.supabase.co/p.png';
    expect(mergeAppContent(toAppContentRows(edited))).toEqual(edited);
  });
});
