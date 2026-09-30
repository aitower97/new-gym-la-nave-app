jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(), setItem: jest.fn() }));

import { pickWhatsNew } from '../utils/whatsNew';
import { ReleaseNote } from '../content/releaseNotes';

const notes: ReleaseNote[] = [
  { id: 'n2', date: '2026-10-01', member: ['Socio A'], admin: ['Admin A'] },
  { id: 'n1', date: '2026-09-01', member: ['Viejo'], admin: [] },
];
const antiguo = new Date('2026-01-01T10:00:00');

describe('pickWhatsNew', () => {
  it('el socio ve solo lo suyo, sin título', () => {
    expect(pickWhatsNew(notes, null, false, antiguo)?.sections).toEqual([{ title: null, items: ['Socio A'] }]);
  });

  it('el admin ve lo suyo y lo de los socios', () => {
    expect(pickWhatsNew(notes, 'n1', true, antiguo)?.sections.map((s) => s.title)).toEqual(['Para ti', 'Para los socios']);
  });

  it('no se repite si ya se vio', () => {
    expect(pickWhatsNew(notes, 'n2', false, antiguo)).toBeNull();
  });

  it('una cuenta nueva no ve novedades', () => {
    expect(pickWhatsNew(notes, null, false, new Date('2026-10-02T09:00:00'))).toBeNull();
  });

  it('sin nada para su rol, nada', () => {
    const soloAdmin: ReleaseNote[] = [{ id: 'x', date: '2026-10-01', member: [], admin: ['A'] }];
    expect(pickWhatsNew(soloAdmin, null, false, antiguo)).toBeNull();
  });
});
