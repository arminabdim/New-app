// ── Arabic/Persian contextual shaping + lightweight bidi ───────────────────
// PDF text is not shaped by pdf-lib, so we map characters to Unicode Arabic
// Presentation Forms (verified present in Vazirmatn) and reorder runs for
// right-to-left display. The on-screen UI relies on the browser's native
// shaping instead.

const FORMS: Record<number, number[]> = {
  // base: [isolated, final, initial, medial]  (0 = none)
  0x0621: [0xfe80, 0, 0, 0],
  0x0622: [0xfe81, 0xfe82, 0, 0],
  0x0623: [0xfe83, 0xfe84, 0, 0],
  0x0624: [0xfe85, 0xfe86, 0, 0],
  0x0625: [0xfe87, 0xfe88, 0, 0],
  0x0626: [0xfe89, 0xfe8a, 0xfe8b, 0xfe8c],
  0x0627: [0xfe8d, 0xfe8e, 0, 0],
  0x0628: [0xfe8f, 0xfe90, 0xfe91, 0xfe92],
  0x0629: [0xfe93, 0xfe94, 0, 0],
  0x062a: [0xfe95, 0xfe96, 0xfe97, 0xfe98],
  0x062b: [0xfe99, 0xfe9a, 0xfe9b, 0xfe9c],
  0x062c: [0xfe9d, 0xfe9e, 0xfe9f, 0xfea0],
  0x062d: [0xfea1, 0xfea2, 0xfea3, 0xfea4],
  0x062e: [0xfea5, 0xfea6, 0xfea7, 0xfea8],
  0x062f: [0xfea9, 0xfeaa, 0, 0],
  0x0630: [0xfeab, 0xfeac, 0, 0],
  0x0631: [0xfead, 0xfeae, 0, 0],
  0x0632: [0xfeaf, 0xfeb0, 0, 0],
  0x0633: [0xfeb1, 0xfeb2, 0xfeb3, 0xfeb4],
  0x0634: [0xfeb5, 0xfeb6, 0xfeb7, 0xfeb8],
  0x0635: [0xfeb9, 0xfeba, 0xfebb, 0xfebc],
  0x0636: [0xfebd, 0xfebe, 0xfebf, 0xfec0],
  0x0637: [0xfec1, 0xfec2, 0xfec3, 0xfec4],
  0x0638: [0xfec5, 0xfec6, 0xfec7, 0xfec8],
  0x0639: [0xfec9, 0xfeca, 0xfecb, 0xfecc],
  0x063a: [0xfecd, 0xfece, 0xfecf, 0xfed0],
  0x0641: [0xfed1, 0xfed2, 0xfed3, 0xfed4],
  0x0642: [0xfed5, 0xfed6, 0xfed7, 0xfed8],
  0x0643: [0xfed9, 0xfeda, 0xfedb, 0xfedc],
  0x0644: [0xfedd, 0xfede, 0xfedf, 0xfee0],
  0x0645: [0xfee1, 0xfee2, 0xfee3, 0xfee4],
  0x0646: [0xfee5, 0xfee6, 0xfee7, 0xfee8],
  0x0647: [0xfee9, 0xfeea, 0xfeeb, 0xfeec],
  0x0648: [0xfeed, 0xfeee, 0, 0],
  0x0649: [0xfeef, 0xfef0, 0, 0],
  0x064a: [0xfef1, 0xfef2, 0xfef3, 0xfef4],
  // Persian letters
  0x067e: [0xfb56, 0xfb57, 0xfb58, 0xfb59],
  0x0686: [0xfb7a, 0xfb7b, 0xfb7c, 0xfb7d],
  0x0698: [0xfb8a, 0xfb8b, 0, 0],
  0x06a9: [0xfb8e, 0xfb8f, 0xfb90, 0xfb91],
  0x06af: [0xfb92, 0xfb93, 0xfb94, 0xfb95],
  0x06cc: [0xfbfc, 0xfbfd, 0xfbfe, 0xfbff],
};

// lam + alef ligatures: [isolated, final]
const LAM_ALEF: Record<number, [number, number]> = {
  0x0622: [0xfef5, 0xfef6],
  0x0623: [0xfef7, 0xfef8],
  0x0625: [0xfef9, 0xfefa],
  0x0627: [0xfefb, 0xfefc],
};

const TRANSPARENT = (c: number) => (c >= 0x064b && c <= 0x065f) || c === 0x0670 || (c >= 0x06d6 && c <= 0x06ed) || c === 0x0640;
const ZWNJ = 0x200c;

export function isArabicCp(c: number): boolean {
  return (c >= 0x0600 && c <= 0x06ff) || (c >= 0xfb50 && c <= 0xfeff) || (c >= 0x0750 && c <= 0x077f);
}
export function hasRtl(text: string): boolean {
  for (const ch of text) if (isArabicCp(ch.codePointAt(0)!)) return true;
  return false;
}
const isDigitCp = (c: number) => (c >= 0x30 && c <= 0x39) || (c >= 0x06f0 && c <= 0x06f9) || (c >= 0x0660 && c <= 0x0669);

/** Contextual shaping within a run; returns code points in LOGICAL order. */
export function shapeRun(cps: number[]): number[] {
  const out: number[] = [];
  const n = cps.length;
  let i = 0;
  let prevIsDual = false; // the previously *emitted* base joins forward (lam counts after a ligature)
  while (i < n) {
    const c = cps[i];
    if (TRANSPARENT(c)) {
      out.push(c);
      i++;
      continue;
    }
    if (c === ZWNJ) {
      out.push(c);
      prevIsDual = false;
      i++;
      continue;
    }
    let q = i + 1;
    while (q < n && TRANSPARENT(cps[q])) q++;
    const nextBase = q < n ? cps[q] : -1;
    const nextExists = q < n && nextBase !== ZWNJ;
    const curDual = (FORMS[c]?.[2] ?? 0) !== 0; // has an initial form => joins forward
    const nextJoinsBack = nextExists && (FORMS[nextBase]?.[1] ?? 0) !== 0; // has a final form => joins back

    if (c === 0x0644 && nextExists && LAM_ALEF[nextBase]) {
      out.push(prevIsDual ? LAM_ALEF[nextBase][1] : LAM_ALEF[nextBase][0]);
      prevIsDual = true;
      i = q + 1;
      continue;
    }
    const forms = FORMS[c];
    if (!forms) {
      out.push(c);
      prevIsDual = false;
      i++;
      continue;
    }
    const joinsNext = curDual && nextJoinsBack;
    const idx = (prevIsDual ? 1 : 0) + (joinsNext ? 2 : 0);
    out.push(forms[idx] || forms[0] || c);
    prevIsDual = curDual;
    i++;
  }
  return out;
}

export interface BidiRun {
  cps: number[]; // logical order, shaped if rtl
  rtl: boolean;
}

/** Split text into logical runs by direction (words keep spaces attached). */
export function logicalRuns(text: string): BidiRun[] {
  const tokens = text.split(/(\s+)/).filter((t) => t.length > 0);
  const runs: BidiRun[] = [];
  for (const tok of tokens) {
    if (/^\s+$/.test(tok)) {
      if (runs.length) runs[runs.length - 1].cps.push(...[...tok].map((c) => c.codePointAt(0)!));
      else runs.push({ cps: [...tok].map((c) => c.codePointAt(0)!), rtl: false });
      continue;
    }
    let hasAr = false;
    let hasDigit = false;
    let hasLatin = false;
    for (const ch of tok) {
      const c = ch.codePointAt(0)!;
      if (isArabicCp(c)) hasAr = true;
      else if (isDigitCp(c)) hasDigit = true;
      else if ((c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a)) hasLatin = true;
    }
    const rtl = hasAr && !hasLatin;
    if (runs.length && runs[runs.length - 1].rtl === rtl) {
      runs[runs.length - 1].cps.push(...[...tok].map((c) => c.codePointAt(0)!));
    } else {
      runs.push({ cps: [...tok].map((c) => c.codePointAt(0)!), rtl });
    }
    void hasDigit;
  }
  return runs;
}

/** Visual-order runs for an RTL or LTR paragraph. RTL runs are shaped + reversed. */
export function visualRuns(text: string, paraRtl: boolean): BidiRun[] {
  const runs = logicalRuns(text).map((r) =>
    r.rtl ? { cps: [...shapeRun(r.cps)].reverse(), rtl: true } : { cps: r.cps, rtl: false },
  );
  if (paraRtl) runs.reverse();
  return runs;
}

export function cpToString(cps: number[]): string {
  return String.fromCodePoint(...cps);
}

/** Convenience: whole string as a single visual string (for centered labels). */
export function visualString(text: string, paraRtl: boolean): string {
  return visualRuns(text, paraRtl)
    .map((r) => cpToString(r.cps))
    .join('');
}
