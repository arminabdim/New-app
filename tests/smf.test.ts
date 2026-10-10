import { describe, expect, it } from 'vitest';
import { writeSmf, parseSmf } from '../src/core/smf';

describe('SMF writer/reader round-trip', () => {
  it('preserves notes, lyrics, texts, tempo, name', () => {
    const bytes = writeSmf({
      title: 'Test — تست',
      tempoBpm: 96,
      timeSig: [3, 4],
      keyFifths: -1,
      keyMinor: false,
      program: 22,
      notes: [
        { midi: 72, startBeat: 0, durBeat: 1, lyric: 'سلام', text: '+4' },
        { midi: 74, startBeat: 1, durBeat: 0.5, lyric: 'خوب', text: '-4' },
        { midi: 76, startBeat: 1.5, durBeat: 2, text: '+5*' },
      ],
    });
    const p = parseSmf(bytes);
    expect(p.notes.length).toBe(3);
    expect(p.notes[0].midi).toBe(72);
    expect(p.notes[1].startBeat).toBeCloseTo(1);
    expect(p.notes[2].durBeat).toBeCloseTo(2);
    expect(p.tempoBpm).toBe(96);
    expect(p.timeSig).toEqual([3, 4]);
    expect(p.keyFifths).toBe(-1);
    expect(p.name).toContain('Test');
    expect(p.lyrics.map((l) => l.text)).toEqual(['سلام', 'خوب']);
    expect(p.texts.map((l) => l.text)).toEqual(['+4', '-4', '+5*']);
  });
});
