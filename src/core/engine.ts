// ── Note → harmonica tab conversion engine ─────────────────────────────────
// Uses Viterbi-style dynamic programming over reed candidates to pick the
// fingering with the least hand movement, fewest slide changes and best
// breath ergonomics. Also auto-selects the best transposition when notes
// fall outside the instrument's range.

import { Instrument, Reed } from './instruments';

export interface SourceNote {
  midi: number;
  start: number; // in quarter-note beats
  dur: number; // in quarter-note beats
  lyric?: string;
  tie?: boolean; // tied to next note of same pitch
}

export interface TabEvent extends SourceNote {
  reed: Reed | null;
  sourceIndex: number;
}

export interface EngineOptions {
  slideWeight?: number; // cost of pressing the slide
  jumpWeight?: number; // cost per hole of hand movement
  breathSamePenalty?: number; // two consecutive notes on same breath
  autoTranspose?: boolean;
  forceTranspose?: number | null;
}

export interface EngineResult {
  events: TabEvent[];
  unmappedCount: number;
  missingMidis: number[];
  coverage: number; // 0..1 fraction of notes mappable
  appliedTranspose: number;
  bestTranspose: number;
  totalCost: number;
  range: { min: number; max: number } | null; // of the chosen fingering
}

export function candidatesFor(inst: Instrument, midi: number): Reed[] {
  return inst.reeds.filter((r) => r.midi === midi);
}

export function instrumentRange(inst: Instrument): { min: number; max: number; chromatic: boolean } {
  const midis = new Set(inst.reeds.map((r) => r.midi));
  const min = Math.min(...midis);
  const max = Math.max(...midis);
  let chromatic = true;
  for (let m = min; m <= max; m++) if (!midis.has(m)) chromatic = false;
  return { min, max, chromatic };
}

function pairCost(a: Reed | null, b: Reed, o: Required<EngineOptions>): number {
  if (!a) return 0;
  let c = Math.abs(a.hole - b.hole) * o.jumpWeight;
  if (a.slide !== b.slide) c += o.slideWeight;
  if (a.hole === b.hole && a.breath === b.breath) c += o.breathSamePenalty;
  return c;
}
function unaryCost(b: Reed, o: Required<EngineOptions>): number {
  let c = 0;
  if (b.slide) c += o.slideWeight * 0.5;
  // mild preference for the middle of the harp
  c += Math.abs(b.hole - 5) * 0.02;
  return c;
}

function convertAt(inst: Instrument, notes: SourceNote[], transpose: number, o: Required<EngineOptions>) {
  // DP over candidate reeds
  let prevLayer: Array<{ reed: Reed; cost: number; back: number }> | null = null;
  const layers: Array<Array<{ reed: Reed | null; cost: number; back: number }>> = [];
  let unmapped = 0;
  const missing = new Set<number>();
  let total = 0;

  for (let i = 0; i < notes.length; i++) {
    if (notes[i].midi <= 0) {
      // rest — passes through, not mappable, not an error
      layers.push([{ reed: null, cost: 0, back: -1 }]);
      prevLayer = null;
      continue;
    }
    const target = notes[i].midi + transpose;
    const cands = candidatesFor(inst, target);
    if (cands.length === 0) {
      unmapped++;
      missing.add(notes[i].midi);
      layers.push([{ reed: null, cost: 0, back: -1 }]);
      prevLayer = null; // break the chain
      continue;
    }
    const layer: Array<{ reed: Reed | null; cost: number; back: number }> = [];
    for (const c of cands) {
      let best = Infinity;
      let back = -1;
      const u = unaryCost(c, o);
      if (!prevLayer) {
        best = u;
      } else {
        for (let p = 0; p < prevLayer.length; p++) {
          const pc = prevLayer[p].cost + pairCost(prevLayer[p].reed, c, o) + u;
          if (pc < best) {
            best = pc;
            back = p;
          }
        }
      }
      layer.push({ reed: c, cost: best, back });
    }
    layers.push(layer);
    prevLayer = layer as Array<{ reed: Reed; cost: number; back: number }>;
  }

  // backtrace
  const chosen: Array<Reed | null> = new Array(notes.length).fill(null);
  let bestEnd = -1;
  let bestCost = Infinity;
  const last = layers[layers.length - 1];
  if (last) {
    for (let p = 0; p < last.length; p++) {
      if (last[p].cost < bestCost) {
        bestCost = last[p].cost;
        bestEnd = p;
      }
    }
  }
  total = bestCost === Infinity ? 0 : bestCost;
  for (let i = layers.length - 1; i >= 0 && bestEnd >= 0; i--) {
    const layer = layers[i];
    if (!layer) break;
    const item = layer[bestEnd];
    if (!item) break;
    chosen[i] = item.reed;
    bestEnd = item.back;
  }
  return { chosen, unmapped, missing: [...missing], total };
}

export function convert(song: { notes: SourceNote[] }, inst: Instrument, opts: EngineOptions = {}): EngineResult {
  const o: Required<EngineOptions> = {
    slideWeight: opts.slideWeight ?? 1.2,
    jumpWeight: opts.jumpWeight ?? 1.0,
    breathSamePenalty: opts.breathSamePenalty ?? 0.6,
    autoTranspose: opts.autoTranspose ?? true,
    forceTranspose: opts.forceTranspose ?? null,
  };
  const notes = song.notes;
  if (notes.length === 0) {
    return { events: [], unmappedCount: 0, missingMidis: [], coverage: 1, appliedTranspose: 0, bestTranspose: 0, totalCost: 0, range: null };
  }

  const tryList: number[] =
    o.forceTranspose !== null ? [o.forceTranspose] : o.autoTranspose ? Array.from({ length: 25 }, (_, i) => i - 12) : [0];

  const results = tryList.map((t) => ({ t, res: convertAt(inst, notes, t, o) }));
  // Prefer: full coverage; then stay in the original key when possible; then lowest movement cost.
  results.sort(
    (a, b) =>
      a.res.unmapped - b.res.unmapped ||
      (a.res.unmapped === 0 ? Math.abs(a.t) - Math.abs(b.t) : 0) ||
      a.res.total - b.res.total ||
      Math.abs(a.t) - Math.abs(b.t) ||
      a.t - b.t,
  );
  const best = results[0];
  const { t, res } = best;
  const events: TabEvent[] = notes.map((n, i) => ({ ...n, reed: res.chosen[i] ?? null, sourceIndex: i }));
  const mapped = events.filter((e) => e.reed);
  const range =
    mapped.length > 0
      ? { min: Math.min(...mapped.map((e) => e.reed!.midi)), max: Math.max(...mapped.map((e) => e.reed!.midi)) }
      : null;
  return {
    events,
    unmappedCount: res.unmapped,
    missingMidis: res.missing.sort((a, b) => a - b),
    coverage: notes.length ? (notes.length - res.unmapped) / notes.length : 1,
    appliedTranspose: t,
    bestTranspose: t,
    totalCost: res.total,
    range,
  };
}
