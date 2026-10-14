import { resolveSentryEnvironment } from '../lib/sentryEnvironment';

describe('resolveSentryEnvironment', () => {
  it('modo desarrollo: siempre development, aunque haya canal', () => {
    expect(resolveSentryEnvironment(true, 'production')).toBe('development');
    expect(resolveSentryEnvironment(true, null)).toBe('development');
  });

  it('build de tienda: production', () => {
    expect(resolveSentryEnvironment(false, 'production')).toBe('production');
  });

  it('APK interno: preview, separado de las tiendas', () => {
    expect(resolveSentryEnvironment(false, 'preview')).toBe('preview');
  });

  it('dev client compilado: development', () => {
    expect(resolveSentryEnvironment(false, 'development')).toBe('development');
  });

  it('sin canal (builds anteriores a la 1.18.0) o vacío: production', () => {
    expect(resolveSentryEnvironment(false, null)).toBe('production');
    expect(resolveSentryEnvironment(false, undefined)).toBe('production');
    expect(resolveSentryEnvironment(false, '  ')).toBe('production');
  });

  it('normaliza mayúsculas y espacios', () => {
    expect(resolveSentryEnvironment(false, ' Preview ')).toBe('preview');
  });
});
