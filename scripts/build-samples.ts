// Generates sample PDF + MIDI outputs from the built-in library (Node-side verification).
import fs from 'node:fs';
import path from 'node:path';
import { parseAbc } from '../src/core/abc';
import { getInstrument } from '../src/core/instruments';
import { convert } from '../src/core/engine';
import { exportTabPdf } from '../src/export/pdf';
import { exportTabMidi } from '../src/export/midi';
import { LIBRARY } from '../src/search/library';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const fontReg = fs.readFileSync(path.join(root, 'public/fonts/Vazirmatn-Regular.ttf'));
const fontBold = fs.readFileSync(path.join(root, 'public/fonts/Vazirmatn-Bold.ttf'));
const outDir = path.join(root, 'samples');
fs.mkdirSync(outDir, { recursive: true });

const ids = ['twinkle', 'happy-birthday', 'morgh-e-sahar'];
const inst = getInstrument('kimi1040');

async function main() {
  for (const id of ids) {
    const abc = LIBRARY.find((l) => l.id === id)!.abc;
    const p = parseAbc(abc);
    const parts = p.title.split(' — ');
    const faPart = parts.find((x) => /[؀-ۿ]/.test(x));
    const enPart = parts.find((x) => !/[؀-ۿ]/.test(x)) ?? p.title;
    const res = convert({ notes: p.notes }, inst, { autoTranspose: true });
    console.log(id, 'notes:', p.notes.length, 'transpose:', res.appliedTranspose, 'unmapped:', res.unmappedCount);
    const pdf = await exportTabPdf({
      song: { title: enPart, titleFa: faPart, composer: p.composer, tempo: p.tempo, timeSig: p.timeSig, keyFifths: p.keyFifths, keyMinor: p.keyMinor },
      events: res.events,
      instrument: inst,
      appliedTranspose: res.appliedTranspose,
      lang: 'fa',
      notesPerLine: 12,
      showStaff: true,
      showNoteNames: true,
      fontRegular: new Uint8Array(fontReg),
      fontBold: new Uint8Array(fontBold),
    });
    fs.writeFileSync(path.join(outDir, id + '.pdf'), pdf);
    const mid = exportTabMidi({
      title: enPart + (faPart ? ' — ' + faPart : ''),
      events: res.events,
      appliedTranspose: res.appliedTranspose,
      tempo: p.tempo ?? 100,
      timeSig: p.timeSig,
      keyFifths: p.keyFifths,
      keyMinor: p.keyMinor,
    });
    fs.writeFileSync(path.join(outDir, id + '.mid'), mid);
  }
  console.log('samples written to', outDir);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
