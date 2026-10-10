// ── PDF export: full tab sheet with staff, tab row, synced lyrics ──────────
import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb, RotationTypes } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { Instrument, reedTab } from '../core/instruments';
import { TabEvent } from '../core/engine';
import { visualRuns, cpToString, hasRtl, BidiRun } from '../core/shaper';
import { midiToName, diatonicStep, keyName, keySigAlterations, toJalali, JALALI_MONTHS_FA, faDigits } from '../core/notes';

export interface PdfSongInfo {
  title: string;
  titleFa?: string;
  composer?: string;
  tempo?: number;
  timeSig: [number, number];
  keyFifths: number;
  keyMinor: boolean;
  source?: string;
}
export interface PdfOptions {
  song: PdfSongInfo;
  events: TabEvent[];
  instrument: Instrument;
  appliedTranspose: number;
  lang: 'fa' | 'en';
  notesPerLine?: number;
  showStaff?: boolean;
  showNoteNames?: boolean;
  fontRegular: Uint8Array;
  fontBold: Uint8Array;
}

const PAGE_W = 841.89;
const PAGE_H = 595.28;
const MARGIN = 36;
const LINE_SP = 7;
const HALF = LINE_SP / 2;

const C = {
  ink: rgb(0.13, 0.15, 0.17),
  staff: rgb(0.5, 0.54, 0.58),
  faint: rgb(0.6, 0.63, 0.66),
  blow: rgb(0.075, 0.42, 0.51),
  blowFill: rgb(0.89, 0.95, 0.97),
  draw: rgb(0.7, 0.32, 0.15),
  drawFill: rgb(0.99, 0.93, 0.88),
  slide: rgb(0.72, 0.53, 0.0),
  accent: rgb(0.06, 0.3, 0.36),
  white: rgb(1, 1, 1),
};

interface FontPair {
  pdf: PDFFont;
  fk: any;
}

class TextEngine {
  constructor(public reg: FontPair, public bold: FontPair, public helv: PDFFont, public helvB: PDFFont) {}
  runWidth(run: BidiRun, size: number, bold: boolean): number {
    const f = bold ? this.bold.fk : this.reg.fk;
    let w = 0;
    for (const cp of run.cps) w += (f.glyphForCodePoint(cp)?.advanceWidth ?? 1000) / 1000;
    return w * size;
  }
  width(text: string, size: number, opts: { bold?: boolean; rtl?: boolean } = {}): number {
    const runs = visualRuns(text, opts.rtl ?? hasRtl(text));
    let w = 0;
    for (const r of runs) w += this.runWidth(r, size, !!opts.bold);
    return w;
  }
  draw(
    page: PDFPage,
    text: string,
    opts: { size: number; y: number; bold?: boolean; rtl?: boolean; centerX?: number; right?: number; x?: number; color?: any },
  ): number {
    const paraRtl = opts.rtl ?? hasRtl(text);
    const runs = visualRuns(text, paraRtl);
    let total = 0;
    for (const r of runs) total += this.runWidth(r, opts.size, !!opts.bold);
    let x = opts.x ?? 0;
    if (opts.centerX !== undefined) x = opts.centerX - total / 2;
    if (opts.right !== undefined) x = opts.right - total;
    const color = opts.color ?? C.ink;
    for (const r of runs) {
      const s = cpToString(r.cps);
      const w = this.runWidth(r, opts.size, !!opts.bold);
      if (s.trim().length > 0) {
        const ascii = !hasRtl(s) && /^[\x00-\x7F]*$/.test(s);
        page.drawText(s, {
          x,
          y: opts.y,
          size: opts.size,
          font: ascii ? (opts.bold ? this.helvB : this.helv) : opts.bold ? this.bold.pdf : this.reg.pdf,
          color,
        });
      }
      x += w;
    }
    return total;
  }
}

function durGlyph(d: number): { kind: 'whole' | 'half' | 'quarter' | 'eighth' | 'sixteenth'; dot: boolean } {
  let dot = false;
  let dd = d;
  if (d === 1.5 || d === 3 || d === 0.75 || d === 6) {
    dot = true;
    dd = d / 1.5;
  }
  if (dd >= 4) return { kind: 'whole', dot };
  if (dd >= 2) return { kind: 'half', dot };
  if (dd >= 1) return { kind: 'quarter', dot };
  if (dd >= 0.5) return { kind: 'eighth', dot };
  return { kind: 'sixteenth', dot };
}

export async function exportTabPdf(o: PdfOptions): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const regFk = fontkit.create(new Uint8Array(o.fontRegular));
  const boldFk = fontkit.create(new Uint8Array(o.fontBold));
  const reg = { pdf: await doc.embedFont(o.fontRegular), fk: regFk };
  const bold = { pdf: await doc.embedFont(o.fontBold), fk: boldFk };
  const helv = await doc.embedFont(StandardFonts.Helvetica);
  const helvB = await doc.embedFont(StandardFonts.HelveticaBold);
  const T = new TextEngine(reg, bold, helv, helvB);
  const fa = o.lang === 'fa';

  const npl = Math.max(6, o.notesPerLine ?? 12);
  const events = o.events;
  const measureBeats = (o.song.timeSig[0] * 4) / o.song.timeSig[1];

  const titleMain = fa && o.song.titleFa ? o.song.titleFa : o.song.title;
  const titleSub = fa ? o.song.title : o.song.titleFa ? o.song.titleFa : undefined;

  let page: PDFPage | null = null;
  let pageNo = 0;
  let sy = 0; // bottom staff line (E4 line) of current system, y-up coords
  const systemsPerPage = 4;
  let sysOnPage = 0;

  const newPage = () => {
    page = doc.addPage([PAGE_W, PAGE_H]);
    pageNo++;
    sysOnPage = 0;
    if (pageNo === 1) drawTitleBlock(page);
    else T.draw(page, fa ? 'ادامهٔ قطعه' : 'Continued', { size: 9, x: MARGIN, y: PAGE_H - 30, rtl: fa, color: C.faint });
  };
  const newSystem = () => {
    if (!page || sysOnPage >= systemsPerPage) newPage();
    const first = pageNo === 1 ? 425 : 500;
    sy = first - sysOnPage * 106;
    sysOnPage++;
    drawClef(p());
  };

  function drawTitleBlock(pg: PDFPage) {
    const cx = PAGE_W / 2;
    T.draw(pg, titleMain, { size: 20, bold: true, centerX: cx, y: PAGE_H - 44, rtl: hasRtl(titleMain) });
    if (titleSub && titleSub !== titleMain)
      T.draw(pg, titleSub, { size: 11, centerX: cx, y: PAGE_H - 62, rtl: hasRtl(titleSub), color: C.faint });
    const infoL = fa ? `ساز: ${o.instrument.nameFa}` : `Instrument: ${o.instrument.nameEn}`;
    const keyOrig = keyName(o.song.keyFifths, o.song.keyMinor);
    const keyTr = o.appliedTranspose ? keyName(transposedFifths(o.song.keyFifths, o.appliedTranspose), o.song.keyMinor) : null;
    const infoR: string[] = [];
    infoR.push(`${fa ? 'گام' : 'Key'}: ${keyOrig}${keyTr ? ' → ' + keyTr : ''}`);
    infoR.push(`${fa ? 'کسر میزان' : 'Meter'}: ${fa ? faDigits(o.song.timeSig[0]) + '/' + faDigits(o.song.timeSig[1]) : o.song.timeSig.join('/')}`);
    if (o.song.tempo) infoR.push(`${fa ? 'تمپو' : 'Tempo'}: ${fa ? faDigits(o.song.tempo) : '♩=' + o.song.tempo}`);
    T.draw(pg, infoL, { size: 9, x: MARGIN, y: PAGE_H - 80, rtl: fa, color: C.accent });
    T.draw(pg, infoR.join('   •   '), { size: 9, right: PAGE_W - MARGIN, y: PAGE_H - 80, color: C.accent });
    if (o.song.composer)
      T.draw(pg, (fa ? 'آهنگساز: ' : 'Composer: ') + o.song.composer, { size: 9.5, centerX: cx, y: PAGE_H - 95, rtl: hasRtl(o.song.composer) || fa, color: C.ink });
    if (o.appliedTranspose !== 0)
      T.draw(
        pg,
        fa
          ? `برای جای‌گیری بهتر روی ساز، ${faDigits(o.appliedTranspose)} نیم‌پرده جابه‌جا شد.`
          : `Transposed ${o.appliedTranspose > 0 ? '+' : ''}${o.appliedTranspose} semitone(s) to fit the instrument.`,
        { size: 8.5, centerX: cx, y: PAGE_H - 109, rtl: fa, color: C.slide },
      );
    // legend row
    const ly = PAGE_H - 124;
    let lx = MARGIN;
    T.draw(pg, fa ? 'راهنما:' : 'Legend:', { size: 8.5, x: lx, y: ly, rtl: fa, bold: true });
    lx += 44;
    drawTabBox(pg, lx, ly - 3.5, '+4', false, false);
    lx += 26;
    T.draw(pg, fa ? 'دم' : 'blow', { size: 8.5, x: lx, y: ly, rtl: fa });
    lx += (fa ? 20 : 26) + 8;
    drawTabBox(pg, lx, ly - 3.5, '-4', true, false);
    lx += 26;
    T.draw(pg, fa ? 'بازدم' : 'draw', { size: 8.5, x: lx, y: ly, rtl: fa });
    lx += (fa ? 30 : 28) + 8;
    drawTabBox(pg, lx, ly - 3.5, '+4*', false, true);
    lx += 26;
    T.draw(pg, fa ? 'اسلاید فشرده' : 'slide pressed', { size: 8.5, x: lx, y: ly, rtl: fa });
  }

  function drawTabBox(pg: PDFPage, x: number, y: number, label: string, isDraw: boolean, slide: boolean) {
    const w = 24;
    const h = 14;
    pg.drawRectangle({
      x,
      y,
      width: w,
      height: h,
      borderColor: slide ? C.slide : isDraw ? C.draw : C.blow,
      borderWidth: slide ? 1.4 : 1,
      color: isDraw ? C.drawFill : C.blowFill,
    });
    pg.drawText(label, { x: x + w / 2 - helvB.widthOfTextAtSize(label, 8) / 2, y: y + 3.5, size: 8, font: helvB, color: slide ? C.slide : isDraw ? C.draw : C.blow });
  }

  function drawClef(pg: PDFPage) {
    const x = MARGIN + 2;
    const yTop = sy + 34; // svg origin (y grows downward)
    pg.drawSvgPath('M10 0 C13 4 13 8.5 11 12.5 L7.2 26.5 C6.5 29 8 31 10.1 31 C12.1 31 13.6 29.5 13.6 27.6 C13.6 25.8 12.2 24.5 10.5 24.5 C8.9 24.5 7.7 25.7 7.7 27.3', {
      x,
      y: yTop,
      borderColor: C.ink,
      borderWidth: 1.4,
    });
  }

  // ---------- music systems ----------
  const usable = PAGE_W - MARGIN * 2 - 20;
  newPage();
  newSystem();

  let col = 0;
  const colW = usable / npl;
  let prevBar = -1;
  const keyAlt = keySigAlterations(o.song.keyFifths);
  const preferFlat = (midi: number) => keyAlt.get(((midi % 12) + 12) % 12) === -1;

  for (let i = 0; i < events.length; i++) {
    if (col >= npl) {
      endSystem();
      newSystem();
      col = 0;
    }
    const e = events[i];
    const midi = e.midi > 0 ? e.midi + o.appliedTranspose : 0;
    const x = MARGIN + 20 + col * colW + colW / 2;
    const staffBottom = sy; // E4 line
    const staffTop = sy + 4 * LINE_SP;

    // barline?
    const bar = Math.floor(e.start / measureBeats);
    if (bar > prevBar) {
      if (col > 0) {
        p().drawLine({ start: { x: x - colW / 2, y: staffBottom }, end: { x: x - colW / 2, y: staffTop }, thickness: 0.8, color: C.staff });
        p().drawText(String(bar + 1), { x: x - colW / 2 + 2, y: staffTop + 12, size: 6.5, font: helv, color: C.faint });
      } else {
        p().drawText(String(bar + 1), { x: MARGIN + 2, y: staffTop + 12, size: 6.5, font: helv, color: C.faint });
      }
    }
    prevBar = Math.max(prevBar, bar);

    if (o.showStaff !== false) {
      for (let l = 0; l < 5; l++) {
        p().drawLine({ start: { x: MARGIN + 18, y: sy + l * LINE_SP }, end: { x: PAGE_W - MARGIN, y: sy + l * LINE_SP }, thickness: 0.7, color: C.staff });
      }
      if (midi > 0) drawNote(p(), midi, e.dur, x, staffBottom, e.tie === true && !!events[i + 1] && events[i + 1].midi === e.midi);
      else drawRest(p(), e.dur, x, staffBottom);
    }
    if (o.showNoteNames !== false && midi > 0) {
      p().drawText(midiToName(midi, preferFlat(midi)), { x: x - 6, y: staffTop + 4, size: 6, font: helv, color: C.faint });
    }

    // tab box (below staff)
    const tabY = staffBottom - 21;
    if (e.reed) drawTabBox(p(), x - 12, tabY, reedTab(e.reed), e.reed.breath === 'draw', e.reed.slide);
    else {
      p().drawRectangle({ x: x - 12, y: tabY, width: 24, height: 14, borderColor: C.faint, borderWidth: 0.7 });
      if (midi === 0) p().drawText('·', { x: x - 1.5, y: tabY + 3, size: 8, font: helvB, color: C.faint });
    }

    // lyric (synced syllable) below the tab
    if (e.lyric) {
      T.draw(p(), e.lyric, { size: 9, centerX: x, y: tabY - 14, rtl: hasRtl(e.lyric) });
    }
    col++;
  }
  endSystem(true);

  // ---------- appendix: instrument chart ----------
  drawChartPage();

  // footers
  const pages = doc.getPages();
  pages.forEach((pg, idx) => {
    pg.drawText(`${idx + 1} / ${pages.length}`, { x: PAGE_W - MARGIN - 20, y: 18, size: 8, font: helv, color: C.faint });
    T.draw(pg, fa ? 'سازدهنی‌تَب — مبدل نت به تبلچر کیمی ۱۰۴۰' : 'SazDehaniTab — Kimi 1040 note→tab converter', { size: 8, x: MARGIN, y: 18, rtl: fa, color: C.faint });
  });

  return doc.save();

  function p(): PDFPage {
    return page!;
  }
  function endSystem(final = false) {
    const rightX = PAGE_W - MARGIN;
    p().drawLine({ start: { x: rightX, y: sy }, end: { x: rightX, y: sy + 4 * LINE_SP }, thickness: final ? 2 : 0.8, color: C.staff });
  }
  function noteYof(midi: number, staffBottom: number): number {
    return staffBottom + (diatonicStep(midi) - diatonicStep(64)) * HALF;
  }
  function drawNote(pg: PDFPage, midi: number, dur: number, x: number, staffBottom: number, tie: boolean) {
    const y = noteYof(midi, staffBottom);
    const g = durGlyph(dur);
    const filled = g.kind === 'quarter' || g.kind === 'eighth' || g.kind === 'sixteenth';
    const step = diatonicStep(midi);
    // ledger lines below the staff (y smaller than staffBottom)
    if (step < 30) {
      for (let s = 28; s >= step; s -= 2) {
        pg.drawLine({ start: { x: x - 7, y: staffBottom - (30 - s) * HALF }, end: { x: x + 7, y: staffBottom - (30 - s) * HALF }, thickness: 0.8, color: C.staff });
      }
    }
    // ledger lines above the staff
    if (step > 38) {
      for (let s = 40; s <= step; s += 2) {
        pg.drawLine({ start: { x: x - 7, y: staffBottom + (s - 30) * HALF }, end: { x: x + 7, y: staffBottom + (s - 30) * HALF }, thickness: 0.8, color: C.staff });
      }
    }
    // accidental: flat when the key signature says so, sharp otherwise
    const pc = ((midi % 12) + 12) % 12;
    const keyAlt = keySigAlterations(o.song.keyFifths);
    if ([1, 3, 6, 8, 10].includes(pc)) {
      if (keyAlt.get(pc) === -1) drawFlat(pg, x - 11, y);
      else drawSharp(pg, x - 12, y);
    }
    // head
    pg.drawEllipse({ x, y, xScale: 4.1, yScale: 3.0, rotate: { angle: -18, type: RotationTypes.Degrees }, color: filled ? C.ink : C.white, borderColor: C.ink, borderWidth: 1.1 });
    if (g.kind !== 'whole') {
      const up = step < 34;
      const sx = up ? x + 3.8 : x - 3.8;
      pg.drawLine({ start: { x: sx, y }, end: { x: sx, y: up ? y + 24 : y - 24 }, thickness: 1, color: C.ink });
      if (g.kind === 'eighth' || g.kind === 'sixteenth') {
        const fy = up ? y + 24 : y - 24;
        const dir = up ? -1 : 1; // svg y-down: flag hangs downward on screen = -? adjust visually
        pg.drawSvgPath(`M0 0 C 4 ${4 * dir}, 6 ${9 * dir}, 3.5 ${15 * dir}`, { x: sx, y: fy, borderColor: C.ink, borderWidth: 1.4 });
        if (g.kind === 'sixteenth')
          pg.drawSvgPath(`M0 ${5 * dir} C 4 ${9 * dir}, 6 ${14 * dir}, 3.5 ${20 * dir}`, { x: sx, y: fy, borderColor: C.ink, borderWidth: 1.4 });
      }
    }
    if (g.dot) pg.drawEllipse({ x: x + 7, y: y + (step % 2 === 0 ? HALF : 0), xScale: 1.2, yScale: 1.2, color: C.ink });
    if (tie) pg.drawSvgPath('M0 0 Q 9 -7 18 0', { x: x + 6, y: y - 8, borderColor: C.ink, borderWidth: 1 });
  }
  function drawRest(pg: PDFPage, dur: number, x: number, staffBottom: number) {
    const mid = staffBottom + 2 * LINE_SP;
    if (dur >= 4) pg.drawRectangle({ x: x - 4, y: staffBottom + 3 * LINE_SP - 3, width: 8, height: 3, color: C.ink });
    else if (dur >= 2) pg.drawRectangle({ x: x - 4, y: mid, width: 8, height: 3, color: C.ink });
    else if (dur >= 1) pg.drawSvgPath('M0 8 L4 4 L0 0 L4 -5 L1 -10', { x: x - 2, y: mid + 6, borderColor: C.ink, borderWidth: 1.3 });
    else pg.drawSvgPath('M4 6 C 0 6, 0 2, 4 2 L1 -8', { x: x - 2, y: mid + 4, borderColor: C.ink, borderWidth: 1.2 });
  }
  function drawFlat(pg: PDFPage, x: number, y: number) {
    pg.drawLine({ start: { x, y: y - 7 }, end: { x, y: y + 5 }, thickness: 1, color: C.ink });
    pg.drawSvgPath('M0 0 C 4.5 -3, 4.5 -6.5, 0 -8.5', { x, y: y + 5, borderColor: C.ink, borderWidth: 1.3 });
  }
  function drawSharp(pg: PDFPage, x: number, y: number) {
    pg.drawLine({ start: { x: x + 1.5, y: y - 5 }, end: { x: x + 1.5, y: y + 5 }, thickness: 0.9, color: C.ink });
    pg.drawLine({ start: { x: x + 4.5, y: y - 5 }, end: { x: x + 4.5, y: y + 5 }, thickness: 0.9, color: C.ink });
    pg.drawLine({ start: { x: x - 1, y: y + 2.2 }, end: { x: x + 7, y: y + 3.6 }, thickness: 1.4, color: C.ink });
    pg.drawLine({ start: { x: x - 1, y: y - 3.6 }, end: { x: x + 7, y: y - 2.2 }, thickness: 1.4, color: C.ink });
  }

  function drawChartPage() {
    const pg = doc.addPage([PAGE_W, PAGE_H]);
    const cx = PAGE_W / 2;
    T.draw(pg, fa ? 'نقشهٔ نت‌های ساز شما' : 'Your instrument note map', { size: 15, bold: true, centerX: cx, y: PAGE_H - 50, rtl: fa });
    T.draw(pg, fa ? o.instrument.nameFa : o.instrument.nameEn, { size: 10, centerX: cx, y: PAGE_H - 68, rtl: fa, color: C.accent });
    let y = PAGE_H - 96;
    const cols = [MARGIN + 10, MARGIN + 90, MARGIN + 220, MARGIN + 350, MARGIN + 500];
    const headers = fa ? ['سوراخ', 'دم', 'دم + اسلاید', 'بازدم', 'بازدم + اسلاید'] : ['Hole', 'Blow', 'Blow + slide', 'Draw', 'Draw + slide'];
    headers.forEach((h, i2) => T.draw(pg, h, { size: 9.5, bold: true, x: cols[i2], y, rtl: fa }));
    y -= 6;
    pg.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 1, color: C.accent });
    y -= 16;
    for (let h = 1; h <= o.instrument.holes; h++) {
      const blow = o.instrument.reeds.find((r) => r.hole === h && r.breath === 'blow' && !r.slide)!;
      const draw = o.instrument.reeds.find((r) => r.hole === h && r.breath === 'draw' && !r.slide)!;
      const blowS = o.instrument.reeds.find((r) => r.hole === h && r.breath === 'blow' && r.slide);
      const drawS = o.instrument.reeds.find((r) => r.hole === h && r.breath === 'draw' && r.slide);
      pg.drawText(String(h), { x: cols[0], y, size: 9.5, font: helvB, color: C.ink });
      pg.drawText(midiToName(blow.midi), { x: cols[1], y, size: 9.5, font: helv, color: C.blow });
      if (blowS) pg.drawText(midiToName(blowS.midi), { x: cols[2], y, size: 9.5, font: helv, color: C.slide });
      pg.drawText(midiToName(draw.midi), { x: cols[3], y, size: 9.5, font: helv, color: C.draw });
      if (drawS) pg.drawText(midiToName(drawS.midi), { x: cols[4], y, size: 9.5, font: helv, color: C.slide });
      y -= 17;
      if (y < 60) break;
    }
    y -= 10;
    const d = new Date();
    const [jy, jm, jd] = toJalali(d.getFullYear(), d.getMonth() + 1, d.getDate());
    const dateFa = `${faDigits(jd)} ${JALALI_MONTHS_FA[jm - 1]} ${faDigits(jy)}`;
    const dateEn = d.toISOString().slice(0, 10);
    T.draw(pg, fa ? `تاریخ تولید: ${dateFa} (${dateEn})` : `Generated: ${dateEn} (${dateFa})`, { size: 8.5, x: MARGIN, y, rtl: fa, color: C.faint });
    T.draw(
      pg,
      fa ? 'علامت * یعنی کلید اسلاید فشرده شده. اعداد مثبت = دم، منفی = بازدم.' : '“*” means the slide button is pressed. “+” = blow, “−” = draw.',
      { size: 8.5, x: MARGIN, y: y - 16, rtl: fa, color: C.faint },
    );
  }
}

function transposedFifths(fifths: number, semitones: number): number {
  const pcToFifthsMaj: Record<number, number> = { 0: 0, 7: 1, 2: 2, 9: 3, 4: 4, 11: 5, 6: 6, 1: 7, 5: -1, 10: -2, 3: -3, 8: -4 };
  const majors = [0, 7, 2, 9, 4, 11, 6];
  const pc = (majors[(fifths + 700) % 7] + semitones + 120) % 12;
  return pcToFifthsMaj[pc] ?? 0;
}
