// ── MIDI export with synced lyrics + tab fingering meta events ─────────────
import { writeSmf, SmfNote } from '../core/smf';
import { reedTab } from '../core/instruments';
import { TabEvent } from '../core/engine';

export interface MidiExportArgs {
  title: string;
  events: TabEvent[];
  appliedTranspose: number;
  tempo: number;
  timeSig: [number, number];
  keyFifths: number;
  keyMinor: boolean;
}

export function exportTabMidi(a: MidiExportArgs): Uint8Array {
  const notes: SmfNote[] = a.events
    .filter((e) => e.midi > 0)
    .map((e) => ({
      midi: e.midi + a.appliedTranspose,
      startBeat: e.start,
      durBeat: Math.max(0.2, e.dur * 0.92),
      velocity: 88,
      lyric: e.lyric || undefined,
      text: e.reed ? reedTab(e.reed) : undefined,
    }));
  return writeSmf({
    title: a.title,
    copyright: 'SazDehaniTab — Kimi 1040 tab converter',
    tempoBpm: a.tempo || 100,
    timeSig: a.timeSig,
    keyFifths: a.keyFifths,
    keyMinor: a.keyMinor,
    program: 22, // harmonica
    notes,
    markers: [{ beat: 0, text: 'Kimi 1040 chromatic harmonica — tab in text events (+blow / -draw / * slide)' }],
  });
}
