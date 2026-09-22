import { isVersionBelow, shouldBlockForUpdate } from '../utils/appVersionCompare';

// ─── isVersionBelow ───────────────────────────────────────────────────

describe('isVersionBelow', () => {
  it('detects an inferior version', () => {
    expect(isVersionBelow('1.4.0', '1.5.0')).toBe(true);
  });

  it('detects an equal version as not below', () => {
    expect(isVersionBelow('1.5.0', '1.5.0')).toBe(false);
  });

  it('detects a superior version as not below', () => {
    expect(isVersionBelow('1.6.0', '1.5.0')).toBe(false);
  });

  it('compares numerically per segment, not lexicographically (1.9.0 vs 1.10.0)', () => {
    expect(isVersionBelow('1.9.0', '1.10.0')).toBe(true);
    expect(isVersionBelow('1.10.0', '1.9.0')).toBe(false);
  });

  it('handles a major version bump', () => {
    expect(isVersionBelow('1.9.9', '2.0.0')).toBe(true);
    expect(isVersionBelow('2.0.0', '1.9.9')).toBe(false);
  });

  it('treats missing trailing segments as zero', () => {
    expect(isVersionBelow('1.0', '1.0.1')).toBe(true);
    expect(isVersionBelow('1.0.0', '1.0')).toBe(false);
  });
});

// ─── shouldBlockForUpdate ─────────────────────────────────────────────

describe('shouldBlockForUpdate', () => {
  it('blocks when the installed version is below minimum_version', () => {
    expect(shouldBlockForUpdate('1.4.0', {
      minimum_version: '1.5.0',
      latest_version: '1.6.0',
      store_url: 'https://example.com',
    })).toBe(true);
  });

  it('allows entry when the installed version equals minimum_version', () => {
    expect(shouldBlockForUpdate('1.5.0', {
      minimum_version: '1.5.0',
      latest_version: '1.6.0',
      store_url: 'https://example.com',
    })).toBe(false);
  });

  it('allows entry when the installed version is above minimum_version', () => {
    expect(shouldBlockForUpdate('1.6.0', {
      minimum_version: '1.5.0',
      latest_version: '1.6.0',
      store_url: 'https://example.com',
    })).toBe(false);
  });

  it('does not block when there is no config (Supabase unavailable or no row for the platform)', () => {
    expect(shouldBlockForUpdate('0.0.1', null)).toBe(false);
  });
});
