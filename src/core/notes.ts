// ── Pitch / naming utilities ────────────────────────────────────────────────
export const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
export const SOLFA_FA = ['دو', 'دو♯', 'ر', 'ر♯', 'می', 'فا', 'فا♯', 'سل', 'سل♯', 'لا', 'لا♯', 'سی'];

export function pcOf(midi: number): number {
  return ((midi % 12) + 12) % 12;
}
export function octaveOf(midi: number): number {
  return Math.floor(midi / 12) - 1;
}
export function midiToName(midi: number, preferFlat = false): string {
  return (preferFlat ? FLAT_NAMES : SHARP_NAMES)[pcOf(midi)] + octaveOf(midi);
}
export function pcName(midi: number, preferFlat = false): string {
  return (preferFlat ? FLAT_NAMES : SHARP_NAMES)[pcOf(midi)];
}

const NAME_RE = /^([A-Ga-g])([#b♯♭]?)(-?\d)$/;
export function noteNameToMidi(name: string): number | null {
  const m = NAME_RE.exec(name.trim());
  if (!m) return null;
  const letters: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
  let pc = letters[m[1].toLowerCase()];
  if (m[2] === '#' || m[2] === '♯') pc += 1;
  if (m[2] === 'b' || m[2] === '♭') pc -= 1;
  pc = ((pc % 12) + 12) % 12;
  return (parseInt(m[3], 10) + 1) * 12 + pc;
}

// Diatonic staff-step index (C=0..B=6 within octave) — used for staff placement.
const STEP_OF_PC: Record<number, number> = { 0: 0, 1: 0, 2: 1, 3: 2, 4: 2, 5: 3, 6: 3, 7: 4, 8: 4, 9: 5, 10: 5, 11: 6 };
export function diatonicStep(midi: number): number {
  return octaveOf(midi) * 7 + STEP_OF_PC[pcOf(midi)];
}
/** accidental of a midi vs its natural spelling: 0 natural, 1 sharp-ish, -1 flat-ish */
export function accidentalOf(midi: number): -1 | 0 | 1 {
  const pc = pcOf(midi);
  const naturalPcs = [0, 2, 4, 5, 7, 9, 11];
  if (naturalPcs.includes(pc)) return 0;
  return 1; // sharps preferred spelling (C#, D#, F#, G#, A#)
}

// ── Key signatures ──────────────────────────────────────────────────────────
const SHARP_NAT = [5, 0, 7, 2, 9, 4, 11]; // naturals that get sharped: F C G D A E B
const FLAT_NAT = [11, 4, 9, 2, 7, 0, 5]; // naturals that get flatted: B E A D G C F

/** fifths (-7..7) -> map keyed by NATURAL pitch class -> alteration (+1/-1). For parsers. */
export function keySigNaturalMap(fifths: number): Map<number, 1 | -1> {
  const map = new Map<number, 1 | -1>();
  if (fifths > 0) for (let i = 0; i < fifths; i++) map.set(SHARP_NAT[i], 1);
  if (fifths < 0) for (let i = 0; i < -fifths; i++) map.set(FLAT_NAT[i], -1);
  return map;
}
/** fifths (-7..7) -> map keyed by ALTERED (sounding) pitch class -> alteration. For display. */
export function keySigAlterations(fifths: number): Map<number, 1 | -1> {
  const map = new Map<number, 1 | -1>();
  if (fifths > 0) for (let i = 0; i < fifths; i++) map.set((SHARP_NAT[i] + 1) % 12, 1);
  if (fifths < 0) for (let i = 0; i < -fifths; i++) map.set((FLAT_NAT[i] + 11) % 12, -1);
  return map;
}
export function keyName(fifths: number, minor = false): string {
  const majors = ['Cb', 'Gb', 'Db', 'Ab', 'Eb', 'Bb', 'F', 'C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#'];
  const minors = ['Ab', 'Eb', 'Bb', 'F', 'C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#', 'G#', 'D#', 'A#'];
  return (minor ? minors : majors)[fifths + 7] + (minor ? 'm' : '');
}
export function parseKeyName(name: string): { fifths: number; minor: boolean } {
  const m = /^([A-Ga-g])([#b♯♭]?)(m|min|minor)?$/i.exec(name.trim());
  if (!m) return { fifths: 0, minor: false };
  const letters: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
  let pc = letters[m[1].toLowerCase()];
  if (m[2] === '#' || m[2] === '♯') pc += 1;
  if (m[2] === 'b' || m[2] === '♭') pc -= 1;
  pc = ((pc % 12) + 12) % 12;
  const minor = !!m[3];
  const majFifths = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5][pc] ?? 0; // C G D A E B F# ... map pc->fifths for majors
  // pc -> fifths: C0 G1 D2 A3 E4 B5 F#6 C#7 / F-1 Bb-2 Eb-3 Ab-4 Db-5 Gb-6 Cb-7
  const pcToFifthsMaj: Record<number, number> = { 0: 0, 7: 1, 2: 2, 9: 3, 4: 4, 11: 5, 6: 6, 1: 7, 5: -1, 10: -2, 3: -3, 8: -4 };
  let f = pcToFifthsMaj[pc];
  if (f === undefined) f = 0;
  if (minor) f -= 3; // relative minor: D m = F M (one flat)
  return { fifths: Math.max(-7, Math.min(7, f)), minor };
}

// ── Jalali (Persian) calendar ───────────────────────────────────────────────
export function toJalali(gy: number, gm: number, gd: number): [number, number, number] {
  const gdm = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  const gy2 = gm > 2 ? gy + 1 : gy;
  let days =
    355666 + 365 * gy + Math.floor((gy2 + 3) / 4) - Math.floor((gy2 + 99) / 100) + Math.floor((gy2 + 399) / 400) + gd + gdm[gm - 1];
  let jy = -1595 + 33 * Math.floor(days / 12053);
  days %= 12053;
  jy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) {
    jy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }
  let jm: number, jd: number;
  if (days < 186) {
    jm = 1 + Math.floor(days / 31);
    jd = 1 + (days % 31);
  } else {
    jm = 7 + Math.floor((days - 186) / 30);
    jd = 1 + ((days - 186) % 30);
  }
  return [jy, jm, jd];
}
export const JALALI_MONTHS_FA = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
export const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
export function faDigits(s: string | number): string {
  return String(s).replace(/\d/g, (d) => FA_DIGITS[+d]);
}
