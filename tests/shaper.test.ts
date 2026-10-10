import { describe, expect, it } from 'vitest';
import { shapeRun, visualString, hasRtl } from '../src/core/shaper';

describe('Arabic/Persian shaper', () => {
  it('shapes سلام with lam-alef ligature', () => {
    const shaped = shapeRun([...'سلام'].map((c) => c.codePointAt(0)!));
    expect(shaped[0]).toBe(0xfeb3); // sin initial
    expect(shaped[1]).toBe(0xfefc); // lam-alef final ligature
    expect(shaped[2]).toBe(0xfee2); // mim final (FEE2)
  });
  it('isolates non-joining letters', () => {
    const shaped = shapeRun([...'سلام'].map((c) => c.codePointAt(0)!));
    void shaped;
    const d = shapeRun([...'د'].map((c) => c.codePointAt(0)!));
    expect(d[0]).toBe(0xfea9); // dal isolated
  });
  it('visual order reverses RTL text', () => {
    const vis = visualString('سلام', true);
    const cps = [...vis].map((c) => c.codePointAt(0)!);
    expect(cps[0]).toBe(0xfee2); // mim final appears first visually
  });
  it('keeps LTR runs intact inside RTL paragraph', () => {
    const vis = visualString('abc سلام', true);
    expect(vis.startsWith(String.fromCodePoint(0xfee2))).toBe(true); // visual RTL starts with shaped mim
    expect(vis.includes('abc')).toBe(true);
  });
  it('detects rtl', () => {
    expect(hasRtl('متن')).toBe(true);
    expect(hasRtl('text 123')).toBe(false);
  });
  it('Persian letters get Persian presentation forms', () => {
    const p = shapeRun([0x067e, 0x0627]); // پا
    expect(p[0]).toBe(0xfb58); // peh initial (joins forward to alef)
    expect(p[1]).toBe(0xfe8e); // alef final
    const g = shapeRun([0x06af, 0x0627, 0x0686]); // گاچ : gaf initial, alef final, cheh isolated
    expect(g[0]).toBe(0xfb94);
    expect(g[1]).toBe(0xfe8e);
    expect(g[2]).toBe(0xfb7a);
  });
});
