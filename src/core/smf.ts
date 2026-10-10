// ── Standard MIDI File (SMF) writer + reader ────────────────────────────────
// Format 1, 480 ticks/quarter. Carries lyrics (meta 0x05) and tab fingering
// (meta 0x01 text) synced to note onsets, plus tempo/key/time signatures.

export interface SmfNote {
  midi: number;
  startBeat: number;
  durBeat: number;
  velocity?: number;
  lyric?: string;
  text?: string;
}
export interface SmfData {
  title: string;
  copyright?: string;
  tempoBpm: number;
  timeSig: [number, number];
  keyFifths: number;
  keyMinor: boolean;
  program: number;
  notes: SmfNote[];
  markers?: Array<{ beat: number; text: string }>;
}

export const PPQ = 480;

function varLen(n: number): number[] {
  const bytes = [n & 0x7f];
  n >>= 7;
  while (n > 0) {
    bytes.unshift((n & 0x7f) | 0x80);
    n >>= 7;
  }
  return bytes;
}
function be32(n: number): number[] {
  return [(n >> 24) & 255, (n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function be16(n: number): number[] {
  return [(n >> 8) & 255, n & 255];
}
function strBytes(s: string): number[] {
  return [...new TextEncoder().encode(s)];
}
function trackBytes(events: number[]): number[] {
  return [...strBytes('MTrk'), ...be32(events.length), ...events];
}

export function writeSmf(data: SmfData): Uint8Array {
  const beatToTick = (b: number) => Math.round(b * PPQ);

  // ---- track 0: global meta ----
  const t0: number[] = [];
  t0.push(0, 0xff, 0x03, ...varLen(strBytes(data.title).length), ...strBytes(data.title));
  if (data.copyright) {
    const c = strBytes(data.copyright);
    t0.push(0, 0xff, 0x02, ...varLen(c.length), ...c);
  }
  const uspq = Math.round(60000000 / data.tempoBpm);
  t0.push(0, 0xff, 0x51, 3, (uspq >> 16) & 255, (uspq >> 8) & 255, uspq & 255);
  const [num, den] = data.timeSig;
  const denPow = Math.round(Math.log2(den));
  t0.push(0, 0xff, 0x58, 4, num, denPow, 24, 8);
  const kf = (data.keyFifths + 256) % 256; // signed byte as unsigned
  t0.push(0, 0xff, 0x59, 2, kf, data.keyMinor ? 1 : 0);
  t0.push(0, 0xff, 0x2f, 0);

  // ---- track 1: notes + lyrics + tab text ----
  interface Ev { tick: number; ord: number; bytes: number[] }
  const evs: Ev[] = [];
  evs.push({ tick: 0, ord: 0, bytes: [0, 0xff, 0x04, ...varLen(strBytes('Kimi 1040 — harmonica tab').length), ...strBytes('Kimi 1040 — harmonica tab')] });
  evs.push({ tick: 0, ord: 1, bytes: [0, 0xc0, data.program & 0x7f] });
  if (data.markers) {
    for (const m of data.markers) {
      const s = strBytes(m.text);
      evs.push({ tick: beatToTick(m.beat), ord: 2, bytes: [0, 0xff, 0x06, ...varLen(s.length), ...s] });
    }
  }
  for (const n of data.notes) {
    const on = beatToTick(n.startBeat);
    const off = beatToTick(n.startBeat + n.durBeat);
    const vel = n.velocity ?? 90;
    if (n.text) {
      const s = strBytes(n.text);
      evs.push({ tick: on, ord: 3, bytes: [0, 0xff, 0x01, ...varLen(s.length), ...s] });
    }
    if (n.lyric) {
      const s = strBytes(n.lyric);
      evs.push({ tick: on, ord: 4, bytes: [0, 0xff, 0x05, ...varLen(s.length), ...s] });
    }
    evs.push({ tick: on, ord: 5, bytes: [0, 0x90, n.midi & 0x7f, vel & 0x7f] });
    evs.push({ tick: off, ord: 6, bytes: [0, 0x80, n.midi & 0x7f, 0] });
  }
  evs.sort((a, b) => a.tick - b.tick || a.ord - b.ord);
  const t1: number[] = [];
  let last = 0;
  for (const e of evs) {
    const d = e.tick - last;
    last = e.tick;
    const body = e.bytes.slice(1); // strip stored delta 0
    t1.push(...varLen(d), ...body);
  }
  t1.push(0, 0xff, 0x2f, 0);

  const header = [...strBytes('MThd'), ...be32(6), ...be16(1), ...be16(2), ...be16(PPQ)];
  const all = [...header, ...trackBytes(t0), ...trackBytes(t1)];
  return Uint8Array.from(all);
}

// ---- reader (used for .mid import + tests) ----
export interface SmfParsed {
  format: number;
  ppq: number;
  tracks: Array<Array<{ tick: number; beat: number; type: string; data?: Uint8Array; d1?: number; d2?: number }>>;
  tempoBpm: number;
  timeSig: [number, number];
  keyFifths: number;
  keyMinor: boolean;
  name: string;
  notes: Array<{ midi: number; startBeat: number; durBeat: number; velocity: number }>;
  lyrics: Array<{ beat: number; text: string }>;
  texts: Array<{ beat: number; text: string }>;
}

export function parseSmf(bytes: Uint8Array): SmfParsed {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let pos = 0;
  const readStr = (n: number) => {
    let s = '';
    for (let i = 0; i < n; i++) s += String.fromCharCode(bytes[pos++]);
    return s;
  };
  const u32 = () => {
    const v = dv.getUint32(pos);
    pos += 4;
    return v;
  };
  const u16 = () => {
    const v = dv.getUint16(pos);
    pos += 2;
    return v;
  };
  const readVar = () => {
    let v = 0;
    for (;;) {
      const b = bytes[pos++];
      v = (v << 7) | (b & 0x7f);
      if (!(b & 0x80)) break;
    }
    return v;
  };
  if (readStr(4) !== 'MThd') throw new Error('Not a MIDI file');
  u32();
  const format = u16();
  const ntrks = u16();
  const division = u16();
  const ppq = division & 0x8000 ? 480 : division;

  const out: SmfParsed = {
    format, ppq, tracks: [], tempoBpm: 120, timeSig: [4, 4], keyFifths: 0, keyMinor: false, name: '', notes: [], lyrics: [], texts: [],
  };
  for (let tr = 0; tr < ntrks; tr++) {
    if (readStr(4) !== 'MTrk') throw new Error('Bad track');
    const len = u32();
    const end = pos + len;
    let tick = 0;
    let running = 0;
    const events: SmfParsed['tracks'][number] = [];
    const open = new Map<number, number>(); // midi -> start tick
    while (pos < end) {
      const delta = readVar();
      tick += delta;
      let st = bytes[pos];
      if (st & 0x80) {
        pos++;
        running = st;
      } else st = running;
      const type = st & 0xf0;
      const beat = tick / ppq;
      if (st === 0xff) {
        const mt = bytes[pos++];
        const ml = readVar();
        const data = bytes.slice(pos, pos + ml);
        pos += ml;
        events.push({ tick, beat, type: 'meta', data, d1: mt });
        if (mt === 0x51 && ml === 3) out.tempoBpm = Math.round(60000000 / ((data[0] << 16) | (data[1] << 8) | data[2]));
        if (mt === 0x58) out.timeSig = [data[0], Math.pow(2, data[1])];
        if (mt === 0x59) {
          out.keyFifths = data[0] > 127 ? data[0] - 256 : data[0];
          out.keyMinor = data[1] === 1;
        }
        if (mt === 0x03) out.name = out.name || new TextDecoder().decode(data);
        if (mt === 0x05) out.lyrics.push({ beat, text: new TextDecoder().decode(data) });
        if (mt === 0x01) out.texts.push({ beat, text: new TextDecoder().decode(data) });
      } else if (type === 0x90) {
        const n = bytes[pos++];
        const v = bytes[pos++];
        events.push({ tick, beat, type: 'on', d1: n, d2: v });
        if (v > 0) open.set(n, tick);
        else {
          const s = open.get(n);
          if (s !== undefined) {
            out.notes.push({ midi: n, startBeat: s / ppq, durBeat: (tick - s) / ppq, velocity: 90 });
            open.delete(n);
          }
        }
      } else if (type === 0x80) {
        const n = bytes[pos++];
        pos++;
        events.push({ tick, beat, type: 'off', d1: n });
        const s = open.get(n);
        if (s !== undefined) {
          out.notes.push({ midi: n, startBeat: s / ppq, durBeat: (tick - s) / ppq, velocity: 90 });
          open.delete(n);
        }
      } else if (type === 0xa0 || type === 0xb0 || type === 0xe0) {
        pos += 2;
        events.push({ tick, beat, type: 'other' });
      } else if (type === 0xc0 || type === 0xd0) {
        pos += 1;
        events.push({ tick, beat, type: 'other' });
      } else if (st === 0xf0 || st === 0xf7) {
        const l = readVar();
        pos += l;
        events.push({ tick, beat, type: 'sys' });
      } else {
        events.push({ tick, beat, type: 'other' });
      }
    }
    pos = end;
    out.tracks.push(events);
  }
  out.notes.sort((a, b) => a.startBeat - b.startBeat);
  out.lyrics.sort((a, b) => a.beat - b.beat);
  return out;
}
