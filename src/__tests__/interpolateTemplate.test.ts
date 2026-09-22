import { hasPlaceholder, interpolateTemplate } from '../utils/interpolateTemplate';

describe('hasPlaceholder', () => {
  it('detecta cualquiera de los 3 placeholders soportados', () => {
    expect(hasPlaceholder('Hola {{nombre}}')).toBe(true);
    expect(hasPlaceholder('Ey {{apodo}}!')).toBe(true);
    expect(hasPlaceholder('Tu plan {{plan}} caduca')).toBe(true);
  });

  it('devuelve false para texto sin placeholders', () => {
    expect(hasPlaceholder('Clase cancelada el lunes')).toBe(false);
  });

  it('no confunde llaves sueltas o un placeholder no soportado con uno real', () => {
    expect(hasPlaceholder('{clase} y {{otro}}')).toBe(false);
  });
});

describe('interpolateTemplate', () => {
  it('sustituye los 3 placeholders', () => {
    const out = interpolateTemplate('Hola {{nombre}} ({{apodo}}), tu plan {{plan}} caduca', {
      nombre: 'Fernando', apodo: 'fer', plan: 'Bono de 10',
    });
    expect(out).toBe('Hola Fernando (fer), tu plan Bono de 10 caduca');
  });

  it('sustituye por vacío cuando falta un valor, sin dejar el placeholder literal', () => {
    const out = interpolateTemplate('Hola {{nombre}}, tu plan {{plan}}', { nombre: 'Fernando' });
    expect(out).toBe('Hola Fernando, tu plan ');
  });

  it('no toca el texto si no hay placeholders', () => {
    const out = interpolateTemplate('Clase cancelada el lunes', { nombre: 'Fernando' });
    expect(out).toBe('Clase cancelada el lunes');
  });

  it('sustituye varias apariciones del mismo placeholder', () => {
    const out = interpolateTemplate('{{nombre}}, sí, {{nombre}}, te hablo a ti', { nombre: 'Fernando' });
    expect(out).toBe('Fernando, sí, Fernando, te hablo a ti');
  });
});
