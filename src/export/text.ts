// ── Plain-text tab sheet (copy / share) ─────────────────────────────────────
import { reedTab, Instrument } from '../core/instruments';
import { TabEvent } from '../core/engine';
import { midiToName } from '../core/notes';

export function exportTabText(args: {
  title: string;
  instrument: Instrument;
  events: TabEvent[];
  appliedTranspose: number;
  tempo?: number;
}): string {
  const { title, instrument, events, appliedTranspose } = args;
  const lines: string[] = [];
  lines.push(title);
  lines.push(instrument.nameEn);
  lines.push(`transpose: ${appliedTranspose > 0 ? '+' : ''}${appliedTranspose} | tempo: ${args.tempo ?? '?'} bpm`);
  lines.push('legend: +n blow | -n draw | * slide in');
  lines.push('─'.repeat(64));
  const perLine = 8;
  for (let i = 0; i < events.length; i += perLine) {
    const chunk = events.slice(i, i + perLine);
    const tab = chunk.map((e) => (e.reed ? reedTab(e.reed).padEnd(5) : '·'.padEnd(5))).join('|');
    const nam = chunk.map((e) => (e.midi > 0 ? midiToName(e.midi + appliedTranspose).padEnd(5) : 'rest '.padEnd(5))).join('|');
    const lyr = chunk.map((e) => (e.lyric ?? '').padEnd(5)).join('|');
    lines.push(nam);
    lines.push(tab);
    if (lyr.trim()) lines.push(lyr);
    lines.push('');
  }
  return lines.join('\n');
}
