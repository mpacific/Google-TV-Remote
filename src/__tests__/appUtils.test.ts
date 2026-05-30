import { describe, it, expect } from 'vitest';
import {
  HIDDEN_PACKAGES,
  APP_DB,
  SKIP_SEGMENTS,
  PALETTE,
  fallbackName,
  colorFor,
  resolveApp,
} from '../appUtils';

// ── fallbackName ─────────────────────────────────────────────────────────────

describe('fallbackName', () => {
  it('skips "android" segment', () => {
    const result = fallbackName('com.example.android');
    expect(result.toLowerCase()).not.toBe('android');
  });

  it('skips "tv" segment', () => {
    const result = fallbackName('com.example.tv');
    expect(result.toLowerCase()).not.toBe('tv');
  });

  it('skips "mobile" segment', () => {
    const result = fallbackName('com.example.mobile');
    expect(result.toLowerCase()).not.toBe('mobile');
  });

  it('skips "app" segment', () => {
    const result = fallbackName('com.example.app');
    expect(result.toLowerCase()).not.toBe('app');
  });

  it('skips all SKIP_SEGMENTS entries and picks first non-skipped segment', () => {
    // "com" and "android" are both in SKIP_SEGMENTS, "example" is not
    const result = fallbackName('com.android.example');
    expect(result).toBe('Example');
  });

  it('returns a capitalised first letter', () => {
    const result = fallbackName('com.example.service');
    expect(result[0]).toBe(result[0].toUpperCase());
  });

  it('falls back gracefully when all segments are in SKIP_SEGMENTS', () => {
    // All of: com, android, tv, app, mobile are skipped — should fall back to last segment
    const result = fallbackName('com.android.tv.app.mobile');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('uses last segment when everything else is skipped', () => {
    // "com" is skipped, "android" is skipped, result should be "mobile" (last) but
    // "mobile" is also skipped — so it falls back to pkg.split('.').pop()
    const result = fallbackName('com.android.mobile');
    // All three segments are in SKIP_SEGMENTS; last segment "mobile" is the fallback
    expect(result).toBe('Mobile');
  });

  it('picks meaningful segment from a real-world-like package', () => {
    // "com" skipped, "plexapp" is not skipped
    expect(fallbackName('com.plexapp.android')).toBe('Plexapp');
  });

  it('handles package with single segment (no dots)', () => {
    const result = fallbackName('netflix');
    expect(result).toBe('Netflix');
  });
});

// ── colorFor ─────────────────────────────────────────────────────────────────

describe('colorFor', () => {
  it('returns a valid 7-character hex color string', () => {
    const color = colorFor('com.example.app');
    expect(color).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  it('returns a color from PALETTE', () => {
    const color = colorFor('com.example.app');
    expect(PALETTE).toContain(color);
  });

  it('is deterministic for the same input', () => {
    const a = colorFor('com.netflix.ninja');
    const b = colorFor('com.netflix.ninja');
    expect(a).toBe(b);
  });

  it('returns different colors for different inputs (spot check)', () => {
    const colors = new Set([
      colorFor('com.netflix.ninja'),
      colorFor('com.hulu.plus'),
      colorFor('com.spotify.tv.android'),
      colorFor('tv.pluto.android'),
      colorFor('com.twitch.android.viewer'),
    ]);
    // At least two distinct colors in a sample of five packages
    expect(colors.size).toBeGreaterThan(1);
  });
});

// ── APP_DB integrity ─────────────────────────────────────────────────────────

describe('APP_DB integrity', () => {
  it('every entry has a non-empty name', () => {
    for (const [pkg, entry] of Object.entries(APP_DB)) {
      expect(entry.name, `${pkg} should have a non-empty name`).toBeTruthy();
      expect(entry.name.trim().length, `${pkg} name should not be blank`).toBeGreaterThan(0);
    }
  });

  it('every entry has a valid 6-digit hex color', () => {
    for (const [pkg, entry] of Object.entries(APP_DB)) {
      expect(entry.color, `${pkg} color should be a 7-char hex`).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it('has entries for well-known streaming services', () => {
    expect(APP_DB['com.netflix.ninja']).toBeDefined();
    expect(APP_DB['com.hulu.plus']).toBeDefined();
    expect(APP_DB['com.disney.disneyplus']).toBeDefined();
  });
});

// ── HIDDEN_PACKAGES ───────────────────────────────────────────────────────────

describe('HIDDEN_PACKAGES', () => {
  it('contains com.google.android.play.games', () => {
    expect(HIDDEN_PACKAGES.has('com.google.android.play.games')).toBe(true);
  });

  it('contains com.google.android.videos', () => {
    expect(HIDDEN_PACKAGES.has('com.google.android.videos')).toBe(true);
  });

  it('has exactly two entries', () => {
    expect(HIDDEN_PACKAGES.size).toBe(2);
  });
});

// ── SKIP_SEGMENTS ─────────────────────────────────────────────────────────────

describe('SKIP_SEGMENTS', () => {
  it('contains expected common segments', () => {
    for (const seg of ['android', 'tv', 'mobile', 'app', 'com', 'org']) {
      expect(SKIP_SEGMENTS.has(seg), `should contain "${seg}"`).toBe(true);
    }
  });
});

// ── resolveApp ────────────────────────────────────────────────────────────────

describe('resolveApp', () => {
  it('uses APP_DB name when package is known', () => {
    const result = resolveApp('com.netflix.ninja', new Map());
    expect(result.name).toBe('Netflix');
  });

  it('uses APP_DB color when package is known', () => {
    const result = resolveApp('com.netflix.ninja', new Map());
    expect(result.color).toBe('#E50914');
  });

  it('prefers APP_DB color over generated color for known packages', () => {
    const result = resolveApp('com.netflix.ninja', new Map());
    // The stored brand color should be used, not colorFor()
    expect(result.color).toBe(APP_DB['com.netflix.ninja'].color);
  });

  it('uses deviceLabel name when package is unknown but label is provided', () => {
    const labels = new Map([['com.unknown.package', 'My Cool App']]);
    const result = resolveApp('com.unknown.package', labels);
    expect(result.name).toBe('My Cool App');
  });

  it('uses generated color (not APP_DB) when package is unknown', () => {
    const labels = new Map([['com.unknown.package', 'My Cool App']]);
    const result = resolveApp('com.unknown.package', labels);
    expect(result.color).toBe(colorFor('com.unknown.package'));
  });

  it('falls back to fallbackName when package is unknown and no deviceLabel', () => {
    const result = resolveApp('com.example.coolapp', new Map());
    expect(result.name).toBe(fallbackName('com.example.coolapp'));
  });

  it('falls back to colorFor when package is unknown and no deviceLabel', () => {
    const result = resolveApp('com.example.coolapp', new Map());
    expect(result.color).toBe(colorFor('com.example.coolapp'));
  });

  it('returns a valid hex color in all cases', () => {
    const cases = [
      resolveApp('com.netflix.ninja', new Map()),
      resolveApp('com.unknown.x', new Map([['com.unknown.x', 'X']])),
      resolveApp('com.totally.unknown', new Map()),
    ];
    for (const r of cases) {
      expect(r.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });
});
