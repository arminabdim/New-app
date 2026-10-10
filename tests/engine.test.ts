import { describe, expect, it } from 'vitest';
import { getInstrument } from '../src/core/instruments';
import { convert, candidatesFor, instrumentRange } from '../src/core/engine';
import { SourceNote } from '../src/core/engine';

const kimi = getInstrument('kimi1040');

describe('instrument layout (Kimi 1040)', () => {
  it('has 40 reeds (10 holes × 4)', () => {
    expect(kimi.reeds.length).toBe(40);
  });
  it('matches the verified chromatic 10-hole chart', () => {
    const at = (h: number, b: 'blow' | 'draw', s = false) => kimi.reeds.find((r) => r.hole === h && r.breath === b && r.slide === s)!.midi;
    expect(at(1, 'blow')).toBe(60); // C4
    expect(at(1, 'draw')).toBe(62); // D4
    expect(at(2, 'blow')).toBe(64);
    expect(at(2, 'draw')).toBe(65);
    expect(at(4, 'blow')).toBe(72); // C5
    expect(at(4, 'draw')).toBe(71); // B4
    expect(at(10, 'blow')).toBe(88); // E6
    expect(at(10, 'draw')).toBe(89); // F6
    expect(at(1, 'blow', true)).toBe(61); // slide = +1
    expect(at(4, 'draw', true)).toBe(72); // B4 + slide = C5
  });
  it('is fully chromatic C4..F#6 (Hohner Octave-40 family layout)', () => {
    const r = instrumentRange(kimi);
    expect(r.min).toBe(60);
    expect(r.max).toBe(90);
    expect(r.chromatic).toBe(true);
  });
});

describe('conversion engine', () => {
  const scale = (midis: number[]): SourceNote[] => {
    let t = 0;
    return midis.map((m) => {
      const n = { midi: m, start: t, dur: 1 };
      t += 1;
      return n;
    });
  };
  it('maps a C major scale with correct sounding pitches', () => {
    const res = convert({ notes: scale([60, 62, 64, 65, 67, 69, 71, 72]) }, kimi, { autoTranspose: false });
    expect(res.unmappedCount).toBe(0);
    for (let i = 0; i < res.events.length; i++) {
      expect(res.events[i].reed!.midi).toBe(60 + [0, 2, 4, 5, 7, 9, 11, 12][i]);
    }
  });
  it('prefers slide-out fingerings when available', () => {
    const res = convert({ notes: scale([72, 72, 72]) }, kimi, { autoTranspose: false });
    expect(res.events.every((e) => !e.reed!.slide)).toBe(true);
  });
  it('auto-transposes an out-of-range melody to full coverage', () => {
    const high = scale([84, 86, 88, 89, 91, 93, 95, 96, 98, 100]); // C5..D7 -> above range
    const res = convert({ notes: high }, kimi);
    expect(res.coverage).toBe(1);
    expect(res.appliedTranspose).not.toBe(0);
  });
  it('reports unmapped notes on a diatonic harp', () => {
    const richter = getInstrument('richter10');
    const res = convert({ notes: scale([60, 61, 62]) }, richter, { autoTranspose: false }); // C C# D: C# missing
    expect(res.unmappedCount).toBe(1);
    expect(res.missingMidis).toContain(61);
  });
  it('rests pass through without error', () => {
    const notes: SourceNote[] = [ { midi: 60, start: 0, dur: 1 }, { midi: 0, start: 1, dur: 1 }, { midi: 64, start: 2, dur: 1 } ];
    const res = convert({ notes }, kimi, { autoTranspose: false });
    expect(res.unmappedCount).toBe(0);
    expect(res.events[1].reed).toBeNull();
  });
  it('every candidate produces the requested pitch', () => {
    for (let m = 60; m <= 97; m++) {
      for (const r of candidatesFor(kimi, m)) expect(r.midi).toBe(m);
    }
  });
});
