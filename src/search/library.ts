// ── Built-in offline song library (ABC sources, public-domain tunes) ────────
export interface LibraryEntry {
  id: string;
  abc: string;
  tagsFa: string;
  tagsEn: string;
}

const L: LibraryEntry[] = [
  {
    id: 'ode-to-joy',
    tagsFa: 'بتهوون سرود شادی',
    tagsEn: 'beethoven ode to joy',
    abc: `X:1
T:Ode to Joy
C:Ludwig van Beethoven
M:4/4
L:1/4
Q:1/4=112
K:C
e e f g | g f e d | c c d e | e3/2 d1/2 d2 |
w:Joy-ful, joy-ful, we a-dore thee,
e e f g | g f e d | c c d e | d3/2 c1/2 c2 |
w:hol-y wis-dom be-fore thee.
`,
  },
  {
    id: 'twinkle',
    tagsFa: 'ستاره ستاره بچگانه',
    tagsEn: 'twinkle twinkle little star',
    abc: `X:1
T:Twinkle Twinkle Little Star
T:ستاره ستاره
C:Traditional (B. Frère)
M:4/4
L:1/4
Q:1/4=100
K:C
c c g g | a a g2 | f f e e | d d c2 |
w:Twin-kle twin-kle lit-tle star
g g f f | e e d2 | g g f f | e e d2 |
w:up a-bove the world so high
c c g g | a a g2 | f f e e | d d c2 |
w:like a dia-mond in the sky
`,
  },
  {
    id: 'happy-birthday',
    tagsFa: 'تولدت مبارک',
    tagsEn: 'happy birthday',
    abc: `X:1
T:Happy Birthday
T:تولدت مبارک
C:Hill sisters (trad. arr.)
M:3/4
L:1/8
Q:1/4=120
K:C
g g | a2 g2 c'2 | b4 g g | a2 g2 d'2 | c'4 g g |
w:Hap-py birth-day to you, hap-py birth-day to you, hap-py
g'2 e'2 c'2 | b2 a2 f f | e'2 c'2 d'2 | c'4 |]
w:birth-day dear friend, hap-py birth-day to you.
`,
  },
  {
    id: 'jingle-bells',
    tagsFa: 'زنگیل زنگیل کریسمس',
    tagsEn: 'jingle bells',
    abc: `X:1
T:Jingle Bells
C:James Lord Pierpont
M:4/4
L:1/4
Q:1/4=130
K:C
e e e | e e e | e g c d | e2 z2 |
w:Jin-gle bells, jin-gle bells, jin-gle all the way!
f f f f | f e e e | g g f d | c2 z2 |]
w:Oh what fun it is to ride in a one-horse o-pen sleigh!
`,
  },
  {
    id: 'greensleeves',
    tagsFa: 'گرین اسلیوز انگلیسی',
    tagsEn: 'greensleeves english folk',
    abc: `X:1
T:Greensleeves
C:English traditional
M:6/8
L:1/8
Q:3/8=90
K:Am
a | c'4 d'2 e'4 f'2 | e'4 d'2 b4 b2 | a4 b2 c'4 d'2 | c'4 a2 a4 a |
c'4 d'2 e'4 f'2 | e'4 d'2 b4 b2 | a4 b2 c'4 d'2 | c'6 a4 |]
`,
  },
  {
    id: 'saints',
    tagsFa: 'وقتی مقدسین روحانی',
    tagsEn: 'when the saints go marching in',
    abc: `X:1
T:When the Saints Go Marching In
C:American traditional
M:4/4
L:1/4
Q:1/4=120
K:C
c e f g | c e f g | c e f g | e c e d | c2 z2 |]
w:Oh when the saints, oh when the saints, oh when the saints go march-ing in.
`,
  },
  {
    id: 'morgh-e-sahar',
    tagsFa: 'مرغ سحر مرتضی نی‌داوود',
    tagsEn: 'morgh-e sahar persian',
    abc: `X:1
T:Morgh-e Sahar (diatonic adaptation)
T:مرغ سحر (تنظیم سادهٔ دیاتونیک)
C:Morteza Neydavoud — adapted for chromatic harmonica
M:4/4
L:1/8
Q:1/4=72
K:Dm
d2 f2 g2 a2 | b2 a2 g2 f2 | e2 f2 e2 d2 | d8 |
w:مرغ سحر نا له سر کن
d2 f2 g2 a2 | b2 a2 g2 f2 | e2 f2 d4 | d8 |
w:درد و غم دل را بگو
a2 a2 g2 f2 | g2 f2 e2 d2 | e2 f2 e2 d2 | d8 |]
w:تا به خون جر گر به داغت
`,
  },
  {
    id: 'bella-ciao',
    tagsFa: 'بلا چاو ایتالیایی',
    tagsEn: 'bella ciao italian',
    abc: `X:1
T:Bella Ciao
C:Italian traditional
M:4/4
L:1/4
Q:1/4=115
K:Am
a, a a b | c' b a a | a a b c' | b a a2 |
w:U-na mat-ti-na mi son sve-glia-to,
e' e' | e' f' e' d' | b d' b a | a2 z2 |]
w:o bel-la ciao, bel-la ciao, bel-la ciao, ciao, ciao!
`,
  },
];

export function searchLibrary(q: string): LibraryEntry[] {
  const s = q.trim().toLowerCase();
  if (!s) return L;
  return L.filter((e) => {
    const hay = (e.abc.split('\n').slice(1, 4).join(' ') + ' ' + e.tagsEn + ' ' + e.tagsFa).toLowerCase();
    return s.split(/\s+/).every((w) => hay.includes(w));
  });
}
export const LIBRARY = L;
