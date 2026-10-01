import { describe, expect, it } from 'vitest';
import { findHomoeologGuideSite, homoeologSimilarity, projectHomoeologPosition } from '../homoeolog';

describe('homoeolog guide matching', () => {
  it('uses the exact guide path when available', () => {
    const reference = 'AAAACCCCGGGGTTTTCCGGAACCTTAAGG';
    const guide = 'GGGGTTTTCCGGAACCTTAA';
    const result = findHomoeologGuideSite(reference, guide);
    expect(result.matched).toBe(true);
    expect(result.exact).toBe(true);
    expect(result.mismatches).toBe(0);
  });

  it('anchors a one-mismatch homoeolog instead of using the reference centre', () => {
    const reference = 'AAAACCCCGGGGTTTTCCGGAACCTTCAAGG';
    const guide = 'GGGGTTTTCCGGAACCTTAA';
    const result = findHomoeologGuideSite(reference, guide);
    expect(result.matched).toBe(true);
    expect(result.exact).toBe(false);
    expect(result.mismatches).toBe(1);
    expect(result.grnaStart).toBe(8);
  });

  it('returns a clear error when no homologous site is credible', () => {
    const result = findHomoeologGuideSite('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', 'CCCCCCCCCCCCCCCCCCCC');
    expect(result.matched).toBe(false);
    expect(result.error).toContain('No homologous guide site');
  });
});

describe('homoeolog coordinate projection', () => {
  it('projects positions across a one-base deletion', () => {
    expect(projectHomoeologPosition('AAAACCCGGGG', 'AAAACCCCGGGG', 7)).not.toBeNull();
    expect(homoeologSimilarity('AAAACCCCGGGG', 'AAAACCCGGGG')).toBeGreaterThan(85);
  });
});
