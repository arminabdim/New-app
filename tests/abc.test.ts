import { describe, expect, it } from 'vitest';
import { parseAbc } from '../src/core/abc';
import { LIBRARY } from '../src/search/library';

describe('ABC parser', () => {
  it('parses note pitches and lengths (ABC octave standard: C=C3, c=C4)', () => {
    const p = parseAbc(`X:1\nT:T\nM:4/4\nL:1/4\nK:C\nC D E2 | c'2 z2 |\n`);
    expect(p.notes.map((n) => n.midi)).toEqual([48, 50, 52, 72]);
    expect(p.notes[2].dur).toBe(2);
    expect(p.notes[3].midi).toBe(72); // c' = C5
  });
  it('applies key signature and accidentals', () => {
    const p = parseAbc(`X:1\nT:T\nL:1/8\nK:D\nF2 G2 | =F2 |\n`);
    expect(p.notes[0].midi).toBe(54); // F#3 in D major
    expect(p.notes[2].midi).toBe(53); // natural F
  });
  it('attaches w: lyrics syllabically', () => {
    const lib = LIBRARY.find((l) => l.id === 'ode-to-joy')!;
    const p = parseAbc(lib.abc);
    expect(p.notes[0].lyric).toBe('Joy');
    expect(p.notes[1].lyric).toBe('ful,');
  });
  it('parses broken rhythm', () => {
    const p = parseAbc(`X:1\nT:T\nL:1/4\nK:C\nC> D E F |\n`);
    expect(p.notes[0].dur).toBeCloseTo(1.5);
    expect(p.notes[1].dur).toBeCloseTo(0.5);
  });
  it('library songs all parse with notes', () => {
    for (const l of LIBRARY) {
      const p = parseAbc(l.abc);
      expect(p.notes.length, l.id).toBeGreaterThan(4);
    }
  });
});
