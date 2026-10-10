// ── MusicXML (score-partwise) parser ────────────────────────────────────────
import { SourceNote } from './engine';
import { parseXml, findAll, first, textOf } from './xml';
import { keySigNaturalMap } from './notes';

export interface ParsedMusicXml {
  title: string;
  composer?: string;
  tempo?: number;
  timeSig: [number, number];
  keyFifths: number;
  keyMinor: boolean;
  notes: SourceNote[];
}

const STEP_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export function parseMusicXml(src: string): ParsedMusicXml {
  const root = parseXml(src);
  const score = first(root, 'score-partwise') ?? root;
  const work = first(score, 'work');
  let title = textOf(first(score, 'movement-title')) || textOf(work ? first(work, 'work-title') : null);
  const ident = first(score, 'identification');
  let composer: string | undefined;
  if (ident) {
    for (const c of findAll(ident, 'creator')) {
      if ((c.attrs['type'] || '') === 'composer') composer = c.text.trim();
    }
  }
  if (!title) title = 'Untitled';

  const notes: SourceNote[] = [];
  let tempo: number | undefined;
  let timeSig: [number, number] = [4, 4];
  let keyFifths = 0;
  let keyMinor = false;

  const parts = findAll(score, 'part').filter((p) => p.children.length > 0);
  const part = parts[0];
  if (part) {
    let divisions = 1;
    let beat = 0;
    let measureAcc = new Map<number, number>();
    let keySet = new Map<number, number>();
    for (const measure of part.children.filter((c) => c.tag === 'measure')) {
      measureAcc = new Map();
      let lastWasChord = false;
      let lastStart = 0;
      for (const node of measure.children) {
        if (node.tag === 'attributes') {
          const d = first(node, 'divisions');
          if (d) divisions = parseInt(d.text, 10) || 1;
          const k = first(node, 'key');
          if (k) {
            const f = first(k, 'fifths');
            if (f) {
              keyFifths = parseInt(f.text, 10) || 0;
              keySet = keySigNaturalMap(keyFifths);
            }
            const mode = textOf(first(k, 'mode'));
            keyMinor = mode.startsWith('min');
          }
          const t = first(node, 'time');
          if (t) {
            const b = parseInt(textOf(first(t, 'beats')), 10);
            const bt = parseInt(textOf(first(t, 'beat-type')), 10);
            if (b && bt) timeSig = [b, bt];
          }
          continue;
        }
        if (node.tag === 'direction') {
          const st = findAll(node, 'metronome');
          for (const m of st) {
            const per = textOf(first(m, 'per-minute'));
            if (per) tempo = parseInt(per, 10) || tempo;
          }
          continue;
        }
        if (node.tag === 'sound') {
          const t = parseFloat(node.attrs['tempo'] || '');
          if (t) tempo = t;
          continue;
        }
        if (node.tag === 'backup') {
          const d = first(node, 'duration');
          if (d) beat -= (parseInt(d.text, 10) || 0) / divisions;
          if (beat < 0) beat = 0;
          continue;
        }
        if (node.tag === 'forward') {
          const d = first(node, 'duration');
          if (d) beat += (parseInt(d.text, 10) || 0) / divisions;
          continue;
        }
        if (node.tag !== 'note') continue;
        const durNode = first(node, 'duration');
        const durBeats = durNode ? (parseInt(durNode.text, 10) || 0) / divisions : 0;
        const isChord = first(node, 'chord') !== null;
        const isRest = first(node, 'rest') !== null;
        let lyric: string | undefined;
        const lyr = first(node, 'lyric');
        if (lyr) {
          const txt = textOf(first(lyr, 'text'));
          const syl = textOf(first(lyr, 'syllabic'));
          if (txt) lyric = syl === 'begin' || syl === 'middle' ? txt + '-' : txt;
        }
        if (isRest) {
          beat += durBeats;
          lastWasChord = false;
          continue;
        }
        const pitch = first(node, 'pitch');
        let midi = 60;
        if (pitch) {
          const step = textOf(first(pitch, 'step')).toUpperCase();
          const oct = parseInt(textOf(first(pitch, 'octave')), 10);
          const alterNode = first(pitch, 'alter');
          const pc = STEP_PC[step] ?? 0;
          let alter: number;
          if (alterNode) {
            alter = parseFloat(alterNode.text) || 0;
            measureAcc.set(pc, alter);
          } else if (measureAcc.has(pc)) alter = measureAcc.get(pc)!;
          else alter = keySet.get(pc) ?? 0;
          midi = (oct + 1) * 12 + pc + Math.round(alter);
        }
        const start = isChord ? lastStart : beat;
        notes.push({ midi, start, dur: durBeats, lyric });
        if (!isChord) {
          beat += durBeats;
          lastStart = start;
        }
        lastWasChord = isChord;
      }
      void lastWasChord;
    }
  }
  notes.sort((a, b) => a.start - b.start);
  return { title, composer, tempo, timeSig, keyFifths, keyMinor, notes };
}
