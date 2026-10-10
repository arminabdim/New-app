// ── Harmonica instrument definitions ───────────────────────────────────────
// Reed layouts verified against published tuning charts:
//  • 10-hole chromatic (Kimi/Qimei/Swan/Easttop "1040" class, Hohner Chromonica 40 / CX-12 style)
//  • 12-hole chromatic solo tuning (Hohner Chromonica 48 official chart)
//  • 24-hole tremolo "scale tuning" (East-Asian layout, Wikipedia/Hohner)
//  • 10-hole diatonic Richter

export interface Reed {
  hole: number; // 1-based
  breath: 'blow' | 'draw';
  slide: boolean; // slide button pressed
  midi: number;
}
export interface Instrument {
  id: string;
  nameEn: string;
  nameFa: string;
  holes: number;
  hasSlide: boolean;
  reeds: Reed[];
  descFa: string;
  descEn: string;
  defaultFor?: string;
}

function build(blowOut: number[], drawOut: number[], hasSlide: boolean): Reed[] {
  const reeds: Reed[] = [];
  for (let h = 0; h < blowOut.length; h++) {
    reeds.push({ hole: h + 1, breath: 'blow', slide: false, midi: blowOut[h] });
    reeds.push({ hole: h + 1, breath: 'draw', slide: false, midi: drawOut[h] });
    if (hasSlide) {
      reeds.push({ hole: h + 1, breath: 'blow', slide: true, midi: blowOut[h] + 1 });
      reeds.push({ hole: h + 1, breath: 'draw', slide: true, midi: drawOut[h] + 1 });
    }
  }
  return reeds;
}

// 10-hole chromatic in C — the layout of the Kimi/Qimei 1040 family
// (blow: C E G C E G C E G C ; draw: D F A B F A B D F A ; slide = +1)
const CX12_BLOW = [60, 64, 67, 72, 76, 79, 84, 88, 91, 96];
const CX12_DRAW = [62, 65, 69, 71, 77, 81, 83, 86, 89, 93];

// 12-hole solo tuning, straight order (Hohner official): 4-hole octave groups
function soloBlow(n: number): number[] {
  const out: number[] = [];
  for (let h = 0; h < n; h++) {
    const g = Math.floor(h / 4);
    const p = h % 4;
    out.push([60, 64, 67, 72][p] + 12 * g);
  }
  return out;
}
function soloDraw(n: number): number[] {
  const out: number[] = [];
  for (let h = 0; h < n; h++) {
    const g = Math.floor(h / 4);
    const p = h % 4;
    out.push([62, 65, 69, 71][p] + 12 * g);
  }
  return out;
}

// 24-hole tremolo, scale tuning (Asia): groups of 4, blow C E G C↑ / draw D F A B
const TREM24_BLOW: number[] = [];
const TREM24_DRAW: number[] = [];
for (let h = 0; h < 24; h++) {
  const g = Math.floor(h / 4);
  const p = h % 4;
  TREM24_BLOW.push([60, 64, 67, 72][p] + 12 * g);
  TREM24_DRAW.push([62, 65, 69, 71][p] + 12 * g);
}

const RICHTER_BLOW = [60, 64, 67, 72, 76, 79, 84, 88, 91, 96];
const RICHTER_DRAW = [62, 67, 71, 74, 77, 81, 83, 86, 89, 93];

export const INSTRUMENTS: Instrument[] = [
  {
    id: 'kimi1040',
    nameEn: 'Kimi (Qimei) 1040 — 10-hole chromatic, key C',
    nameFa: 'سازدهنی کروماتیک کیمی (Qimei) 1040 — ۱۰ سوراخ، گام دو',
    holes: 10,
    hasSlide: true,
    reeds: build(soloBlow(10), soloDraw(10), true),
    descFa: 'کوک سولوی کروماتیک ۱۰ سوراخ (بر اساس کاتالوگ رسمی Hohner برای خانوادهٔ Octave/Chromonica 40 که Swan 1040 و Easttop T10-40 نیز از آن پیروی می‌کنند): گسترهٔ کاملاً کروماتیک C4 تا F#6 با اسلاید.',
    descEn: 'Solo-tuned 10-hole chromatic per the official Hohner catalog (Octave/Chromonica-40 family, which Swan 1040 / Easttop T10-40 follow). Fully chromatic C4–F#6.',
    defaultFor: '1040',
  },
  {
    id: 'kimi1040-cx12',
    nameEn: 'Kimi 1040 — alternate CX-12 style layout',
    nameFa: 'کیمی ۱۰۴۰ — کوک جایگزین به سبک CX-12',
    holes: 10,
    hasSlide: true,
    reeds: build(CX12_BLOW, CX12_DRAW, true),
    descFa: 'اگر ساز شما کوک سبک CX-12 دارد (گستره تا C7 ولی بدون D5 و B6)، این گزینه را انتخاب کنید.',
    descEn: 'Use if your unit follows the CX-12 style pattern (range to C7 but without D5/B6).',
  },
  {
    id: 'chrom12',
    nameEn: '12-hole chromatic, key C (solo tuning)',
    nameFa: 'کروماتیک ۱۲ سوراخ، گام دو (سولو)',
    holes: 12,
    hasSlide: true,
    reeds: build(soloBlow(12), soloDraw(12), true),
    descFa: 'کوک سولوی استاندارد ۱۲ سوراخ (طبق جدول رسمی Hohner).',
    descEn: 'Standard 12-hole solo tuning per Hohner official charts.',
  },
  {
    id: 'tremolo24',
    nameEn: '24-hole tremolo, key C (scale tuning)',
    nameFa: 'ترمولو ۲۴ سوراخ، گام دو (کوک آسیایی)',
    holes: 24,
    hasSlide: false,
    reeds: build(TREM24_BLOW, TREM24_DRAW, false),
    descFa: 'کوک scale آسیایی برای ترمولوهای ۲۴ سوراخ.',
    descEn: 'Asian scale tuning for 24-hole tremolos.',
  },
  {
    id: 'richter10',
    nameEn: '10-hole diatonic, key C (Richter)',
    nameFa: 'دیاتونیک ۱۰ سوراخ، گام دو (ریختر)',
    holes: 10,
    hasSlide: false,
    reeds: build(RICHTER_BLOW, RICHTER_DRAW, false),
    descFa: 'کوک ریختر برای هارمونیکای بلوز.',
    descEn: 'Richter tuning for blues harp.',
  },
];

export function getInstrument(id: string): Instrument {
  return INSTRUMENTS.find((i) => i.id === id) ?? INSTRUMENTS[0];
}

/** tab notation string for a reed, e.g. "+5", "-5", "+5*" (star = slide in) */
export function reedTab(reed: Reed): string {
  return (reed.breath === 'blow' ? '+' : '-') + reed.hole + (reed.slide ? '*' : '');
}
