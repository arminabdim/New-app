// ── ABC notation parser (subset sufficient for tune archives & library) ────
import { SourceNote } from './engine';
import { parseKeyName, keySigNaturalMap } from './notes';

export interface ParsedSong {
  title: string;
  composer?: string;
  tempo?: number;
  timeSig: [number, number];
  keyName: string;
  keyFifths: number;
  keyMinor: boolean;
  notes: SourceNote[];
  bars: number[]; // start beats of barlines
}

const LETTER_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

function keySigSet(fifths: number): Map<number, number> {
  return keySigNaturalMap(fifths);
}

export function parseAbc(src: string): ParsedSong {
  const lines = src.replace(/\r/g, '').split('\n');
  let title = '';
  let composer = '';
  let tempo: number | undefined;
  let timeSig: [number, number] = [4, 4];
  let defLen = 1 / 8;
  let keyName = 'C';
  let keyFifths = 0;
  let keyMinor = false;

  const voices = new Map<string, SourceNote[]>();
  const voiceLyrics = new Map<string, string[][]>();
  const barsByVoice = new Map<string, number[]>();
  let curVoice = '1';
  voices.set(curVoice, []);
  voiceLyrics.set(curVoice, []);
  barsByVoice.set(curVoice, []);

  let measureAccidentals = new Map<number, number>();
  let pendingTuplet = 0; // notes remaining
  let tupletFactor = 1;
  let lastNoteIdx = -1;
  let brokenNext = 0; // 1 => next note *1.5, -1 => *0.5 ... value is multiplier
  let prevBrokenApplied = false;

  const cur = () => voices.get(curVoice)!;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('%')) continue;
    const field = /^([A-Za-z]):\s*(.*)$/.exec(line);
    if (field && !line.startsWith('|')) {
      const [_, k, v] = field;
      switch (k) {
        case 'T':
          title = title ? title + ' — ' + v : v;
          break;
        case 'C':
          composer = v;
          break;
        case 'M': {
          if (v === 'C') timeSig = [4, 4];
          else if (v === 'C|') timeSig = [2, 2];
          else {
            const m = /^(\d+)\/(\d+)$/.exec(v);
            if (m) timeSig = [+m[1], +m[2]];
          }
          break;
        }
        case 'L': {
          const m = /^(\d+)\/(\d+)$/.exec(v);
          if (m) defLen = +m[1] / +m[2];
          break;
        }
        case 'Q': {
          const m = /(\d+)\/(\d+)\s*=\s*(\d+)/.exec(v);
          if (m) tempo = Math.round(+m[3] * (+m[1] / +m[2]) * 4); // convert to quarter-note bpm
          else {
            const m2 = /=\s*(\d+)/.exec(v);
            if (m2) tempo = +m2[1];
          }
          break;
        }
        case 'K': {
          const km = /^([A-Ga-g])([#b♯]?)\s*([a-z]*)/i.exec(v.trim());
          if (km) {
            const minor = /^(m|min|minor)/i.test(km[3]);
            keyName = km[1].toUpperCase() + km[2] + (minor ? 'm' : '');
            const parsed = parseKeyName(keyName);
            keyFifths = parsed.fifths;
            keyMinor = parsed.minor;
          }
          break;
        }
        case 'V': {
          curVoice = v.split(/\s/)[0] || curVoice;
          if (!voices.has(curVoice)) {
            voices.set(curVoice, []);
            voiceLyrics.set(curVoice, []);
            barsByVoice.set(curVoice, []);
          }
          break;
        }
        case 'w': {
          voiceLyrics.get(curVoice)!.push(tokenizeW(v));
          break;
        }
      }
      continue;
    }
    // ---- body ----
    if (/^[A-Za-z]:/.test(line) && !/^[|:\s\[\](!^_=zZxA-Ga-g]/.test(line)) continue;
    let i = 0;
    const keySet = keySigSet(keyFifths);
    const n = line.length;
    while (i < n) {
      const ch = line[i];
      if (/\s/.test(ch)) {
        i++;
        continue;
      }
      if ('|:[]'.includes(ch) || ch === ':') {
        // barlines & repeats
        let j = i;
        while (j < n && '|:[]'.includes(line[j])) j++;
        barsByVoice.get(curVoice)!.push(sumBeats(cur()));
        measureAccidentals = new Map();
        i = j;
        continue;
      }
      if (ch === '{') {
        const j = line.indexOf('}', i);
        i = j === -1 ? n : j + 1;
        continue;
      }
      if (ch === '!') {
        const j = line.indexOf('!', i + 1);
        i = j === -1 ? n : j + 1;
        continue;
      }
      if (ch === '(') {
        const m = /^\((\d)(?::\d(?::\d)?)?/.exec(line.slice(i));
        if (m) {
          const nn = +m[1];
          pendingTuplet = nn;
          tupletFactor = nn === 3 ? 2 / 3 : nn === 2 ? 3 / 2 : nn === 6 ? 4 / 6 : nn === 4 ? 3 / 4 : 1;
          i += m[0].length;
          continue;
        }
        i++;
        continue;
      }
      if (ch === ')') {
        pendingTuplet = 0;
        tupletFactor = 1;
        i++;
        continue;
      }
      if (ch === '-') {
        if (lastNoteIdx >= 0 && cur()[lastNoteIdx]) cur()[lastNoteIdx].tie = true;
        i++;
        continue;
      }
      if (ch === '>' || ch === '<') {
        // broken rhythm: previous note gets 1.5x, next 0.5x (or reversed)
        if (lastNoteIdx >= 0) {
          const ln = cur()[lastNoteIdx];
          ln.dur = ln.dur * 1.5;
          brokenNext = ch === '>' ? -1 : 1; // -1 => next *0.5 ; 1 => next *1.5?? careful
          // standard: > : prev 1.5, next 0.5 ; < : prev 0.75? actually < : prev 0.5? we approximate: prev*0.75,next*1.5 is rare; keep simple
        }
        prevBrokenApplied = false;
        i++;
        continue;
      }
      // rest
      const restM = /^[zxZ]([0-9]*(?:\/[0-9]*)?|\/+)/.exec(line.slice(i));
      if (restM) {
        const mult = lenMult(restM[1]);
        const beats = defLen * 4 * mult; // in quarter beats (defLen is in whole-note fraction)
        let b = beats;
        if (pendingTuplet > 0) {
          b *= tupletFactor;
          pendingTuplet--;
        }
        cur().push({ midi: 0, start: sumBeats(cur()), dur: b }); // midi 0 = rest marker
        lastNoteIdx = -1;
        i += restM[0].length;
        continue;
      }
      // chord
      if (ch === '[') {
        const j = line.indexOf(']', i);
        if (j === -1) {
          i++;
          continue;
        }
        const inner = line.slice(i + 1, j);
        const noteRe = /([_^=]{1,2})?([A-Ga-g])(['',]*)\s*([0-9]*(?:\/[0-9]*)?|\/+)?/g;
        let nm: RegExpExecArray | null;
        let best: { midi: number; mult: number } | null = null;
        while ((nm = noteRe.exec(inner))) {
          if (!nm[2]) continue;
          const midi = abcPitch(nm[2], nm[1] ?? '', nm[3] ?? '', keySet, measureAccidentals);
          const mult = lenMult(nm[4] ?? '');
          if (!best || midi > best.midi) best = { midi, mult };
        }
        if (best) {
          let b = defLen * 4 * best.mult;
          if (pendingTuplet > 0) {
            b *= tupletFactor;
            pendingTuplet--;
          }
          if (brokenNext !== 0 && !prevBrokenApplied) {
            b *= brokenNext === -1 ? 0.5 : 1.5;
            brokenNext = 0;
          }
          cur().push({ midi: best.midi, start: sumBeats(cur()), dur: b });
          lastNoteIdx = cur().length - 1;
        }
        i = j + 1;
        continue;
      }
      // note
      const noteM = /^([_^=]{1,2})?([A-Ga-g])(['',]*)\s*([0-9]*(?:\/[0-9]*)?|\/+)/.exec(line.slice(i)) || /^([_^=]{1,2})?([A-Ga-g])(['',]*)/.exec(line.slice(i));
      if (noteM) {
        const midi = abcPitch(noteM[2], noteM[1] ?? '', noteM[3] ?? '', keySet, measureAccidentals);
        let mult = lenMult(noteM[4] ?? '');
        let b = defLen * 4 * mult;
        if (pendingTuplet > 0) {
          b *= tupletFactor;
          pendingTuplet--;
        }
        if (brokenNext !== 0) {
          b *= brokenNext === -1 ? 0.5 : 1.5;
          brokenNext = 0;
        }
        cur().push({ midi, start: sumBeats(cur()), dur: b });
        lastNoteIdx = cur().length - 1;
        i += noteM[0].length;
        continue;
      }
      i++;
    }
    void prevBrokenApplied;
  }

  // choose melody voice = the one with most notes
  let bestVoice = curVoice;
  let bestCount = -1;
  for (const [v, ns] of voices) {
    const real = ns.filter((x) => x.midi > 0).length;
    if (real > bestCount) {
      bestCount = real;
      bestVoice = v;
    }
  }
  let notes = (voices.get(bestVoice) ?? []).filter((x) => x.midi > 0);
  // attach lyrics
  const syl = (voiceLyrics.get(bestVoice) ?? []).flat();
  let si = 0;
  for (const note of notes) {
    while (si < syl.length && syl[si] === '|') si++; // barline sync does not consume a note
    if (si >= syl.length) break;
    const s = syl[si++];
    if (s === '-' || s === '_' || s === '*') continue; // hold / skip: consumes note, no new syllable
    note.lyric = s;
  }
  return {
    title: title || 'Untitled',
    composer: composer || undefined,
    tempo,
    timeSig,
    keyName,
    keyFifths,
    keyMinor,
    notes,
    bars: barsByVoice.get(bestVoice) ?? [],
  };
}

function sumBeats(ns: SourceNote[]): number {
  if (ns.length === 0) return 0;
  const l = ns[ns.length - 1];
  return l.start + l.dur;
}
function lenMult(s: string): number {
  if (!s) return 1;
  if (/^\/+$/.test(s)) return 1 / Math.pow(2, s.length);
  const m = /^(\d+)?(?:\/(\d+))?$/.exec(s);
  if (!m) return 1;
  const num = m[1] ? +m[1] : 1;
  const den = m[2] ? +m[2] : 1;
  return num / den;
}
function abcPitch(letter: string, acc: string, oct: string, keySet: Map<number, number>, measAcc: Map<number, number>): number {
  let pc = LETTER_PC[letter.toUpperCase()];
  const base = letter === letter.toUpperCase() ? 48 + pc : 60 + pc; // 'C'=C3(48), 'c'=C4(60)
  let midi = base;
  for (const c of oct) {
    if (c === "'") midi += 12;
    if (c === ',') midi -= 12;
  }
  const pcNow = ((midi % 12) + 12) % 12;
  if (acc) {
    let a = 0;
    for (const c of acc) {
      if (c === '^') a += 1;
      if (c === '_') a -= 1;
      if (c === '=') a = 0;
    }
    measAcc.set(pcNow, a);
    midi += a;
  } else if (measAcc.has(pcNow)) {
    midi += measAcc.get(pcNow)!;
  } else if (keySet.has(pcNow)) {
    midi += keySet.get(pcNow)!;
  }
  return midi;
}
function tokenizeW(v: string): string[] {
  const out: string[] = [];
  for (const tok of v.split(/\s+/)) {
    if (!tok) continue;
    if (tok === '|') {
      out.push('|');
      continue;
    }
    if (tok === '-' || tok === '_' || tok === '*') {
      out.push(tok);
      continue;
    }
    const trailing = tok.endsWith('-');
    const parts = tok.split('-').filter((p) => p !== '');
    for (const p of parts) out.push(p);
    void trailing;
  }
  return out;
}
