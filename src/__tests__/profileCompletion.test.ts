import { isApplePrivateRelay, needsProfileCompletion, suggestedFullName } from '../utils/profileCompletion';

describe('needsProfileCompletion', () => {
  it('pide el alta a un socio sin consentimiento registrado', () => {
    expect(needsProfileCompletion({ user_metadata: { full_name: 'Ana' } }, false)).toBe(true);
    expect(needsProfileCompletion({ user_metadata: null }, false)).toBe(true);
  });

  it('no la pide si ya aceptó', () => {
    expect(needsProfileCompletion({ user_metadata: { accepted_terms_at: '2026-09-25T10:00:00Z' } }, false)).toBe(false);
  });

  it('nunca a los admins ni sin usuario', () => {
    expect(needsProfileCompletion({ user_metadata: {} }, true)).toBe(false);
    expect(needsProfileCompletion(null, false)).toBe(false);
  });
});

describe('isApplePrivateRelay', () => {
  it('detecta el correo oculto de Apple', () => {
    expect(isApplePrivateRelay('abc123@privaterelay.appleid.com')).toBe(true);
    expect(isApplePrivateRelay('ABC@PrivateRelay.AppleID.com')).toBe(true);
  });

  it('no confunde un correo normal', () => {
    expect(isApplePrivateRelay('ana@gmail.com')).toBe(false);
    expect(isApplePrivateRelay(null)).toBe(false);
  });
});

describe('suggestedFullName', () => {
  it('prefiere el nombre del token y si no, el que dio Apple', () => {
    expect(suggestedFullName({ user_metadata: { full_name: 'Ana Pérez' } }, 'Otro')).toBe('Ana Pérez');
    expect(suggestedFullName({ user_metadata: { name: 'Luis' } })).toBe('Luis');
    expect(suggestedFullName({ user_metadata: {} }, ' Marta Gil ')).toBe('Marta Gil');
    expect(suggestedFullName(null)).toBe('');
  });
});
