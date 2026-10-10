import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { INSTRUMENTS, getInstrument, reedTab, Instrument } from './core/instruments';
import { convert, EngineResult, SourceNote, TabEvent } from './core/engine';
import { parseAbc } from './core/abc';
import { parseMusicXml } from './core/musicxml';
import { parseSmf } from './core/smf';
import { midiToName, keyName, hasRtlText, keySigAlterations } from './core/util';
import { exportTabPdf } from './export/pdf';
import { exportTabMidi } from './export/midi';
import { exportTabText } from './export/text';
import { searchLibrary, LIBRARY } from './search/library';
import { searchTheSession, fetchTheSessionAbc, searchLrclibLyrics } from './search/providers';
import { PreviewPlayer } from './audio/preview';
import { DICTS, Lang } from './i18n';

interface Song {
  title: string;
  titleFa?: string;
  composer?: string;
  tempo?: number;
  timeSig: [number, number];
  keyFifths: number;
  keyMinor: boolean;
  notes: SourceNote[];
  source: string;
}

let fontCache: { reg: Uint8Array; bold: Uint8Array } | null = null;
async function loadFonts() {
  if (fontCache) return fontCache;
  const b = (import.meta as any).env?.BASE_URL ?? './';
  const [r, bo] = await Promise.all([fetch(b + 'fonts/Vazirmatn-Regular.ttf'), fetch(b + 'fonts/Vazirmatn-Bold.ttf')]);
  fontCache = { reg: new Uint8Array(await r.arrayBuffer()), bold: new Uint8Array(await bo.arrayBuffer()) };
  return fontCache;
}
function download(bytes: Uint8Array, name: string, mime: string) {
  const blob = new Blob([bytes as any], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

function fromAbc(abc: string, source: string): Song {
  const p = parseAbc(abc);
  const parts = p.title.split(' — ');
  const faPart = parts.find((x) => /[؀-ۿ]/.test(x));
  const enPart = parts.find((x) => !/[؀-ۿ]/.test(x));
  return {
    title: enPart ?? p.title,
    titleFa: faPart,
    composer: p.composer,
    tempo: p.tempo,
    timeSig: p.timeSig,
    keyFifths: p.keyFifths,
    keyMinor: p.keyMinor,
    notes: p.notes,
    source,
  };
}
function fromMusicXml(xml: string, source: string): Song {
  const p = parseMusicXml(xml);
  return { title: p.title, composer: p.composer, tempo: p.tempo, timeSig: p.timeSig, keyFifths: p.keyFifths, keyMinor: p.keyMinor, notes: p.notes, source };
}
function fromMidi(bytes: Uint8Array, source: string): Song {
  const p = parseSmf(bytes);
  const notes: SourceNote[] = p.notes.map((n) => ({ midi: n.midi, start: n.startBeat, dur: n.durBeat }));
  for (const ly of p.lyrics) {
    let best: SourceNote | null = null;
    let bd = 0.35;
    for (const n of notes) {
      const d = Math.abs(n.start - ly.beat);
      if (d < bd) {
        bd = d;
        best = n;
      }
    }
    if (best && !best.lyric) best.lyric = ly.text;
  }
  return {
    title: p.name || 'Imported MIDI',
    tempo: p.tempoBpm,
    timeSig: p.timeSig,
    keyFifths: p.keyFifths,
    keyMinor: p.keyMinor,
    notes,
    source,
  };
}

function detectAndParse(name: string, buf: ArrayBuffer): Song | null {
  const lower = name.toLowerCase();
  const bytes = new Uint8Array(buf);
  if (lower.endsWith('.mid') || lower.endsWith('.midi') || (bytes[0] === 0x4d && bytes[1] === 0x54 && bytes[2] === 0x68)) return fromMidi(bytes, name);
  const text = new TextDecoder().decode(bytes);
  if (/<\?xml|<score-partwise/i.test(text)) return fromMusicXml(text, name);
  if (/^X:/m.test(text) || /(^|\n)[A-Z]:/.test(text)) return fromAbc(text, name);
  return null;
}

// ── On-screen tab renderer ──────────────────────────────────────────────────
function TabSvg(props: {
  events: TabEvent[];
  transpose: number;
  timeSig: [number, number];
  keyFifths: number;
  showStaff: boolean;
  showNames: boolean;
  currentIdx: number;
  lang: Lang;
}) {
  const { events, transpose, showStaff, showNames, currentIdx } = props;
  const colW = 54;
  const W = Math.max(760, events.length * colW + 70);
  const staffTop = 46;
  const LS = 8;
  const H = 178;
  const stepOf = (m: number) => {
    const STEP: Record<number, number> = { 0: 0, 1: 0, 2: 1, 3: 2, 4: 2, 5: 3, 6: 3, 7: 4, 8: 4, 9: 5, 10: 5, 11: 6 };
    return (Math.floor(m / 12) - 1) * 7 + STEP[((m % 12) + 12) % 12];
  };
  const measureBeats = (props.timeSig[0] * 4) / props.timeSig[1];
  const rows: ReactNode[] = [];
  let lastBar = -1;
  events.forEach((e, i) => {
    const x = 46 + i * colW;
    const midi = e.midi > 0 ? e.midi + transpose : 0;
    const bar = Math.floor(e.start / measureBeats);
    if (bar > lastBar) {
      rows.push(<line key={'b' + i} x1={x - colW / 2} y1={staffTop} x2={x - colW / 2} y2={staffTop + 4 * LS} stroke="#9aa4ab" strokeWidth={1} />);
      rows.push(
        <text key={'bn' + i} x={x - colW / 2 + 3} y={staffTop - 26} fontSize={9} fill="#98a0a7">
          {bar + 1}
        </text>,
      );
      lastBar = bar;
    }
    const hl = i === currentIdx;
    if (hl) rows.push(<rect key={'hl' + i} x={x - colW / 2} y={8} width={colW} height={H - 16} fill="#fff3c4" opacity={0.75} rx={8} />);
    if (showStaff) {
      for (let l = 0; l < 5; l++) rows.push(<line key={'s' + i + l} x1={x - colW / 2} y1={staffTop + l * LS} x2={x + colW / 2} y2={staffTop + l * LS} stroke="#c3cad0" strokeWidth={1} />);
    }
    if (midi > 0 && showStaff) {
      const step = stepOf(midi);
      const y = staffTop + 4 * LS - (step - 30) * (LS / 2);
      for (let s = 28; s >= step; s -= 2) rows.push(<line key={'ll' + i + s} x1={x - 8} y1={staffTop + 4 * LS + (30 - s) * (LS / 2)} x2={x + 8} y2={staffTop + 4 * LS + (30 - s) * (LS / 2)} stroke="#9aa4ab" />);
      for (let s = 40; s <= step; s += 2) rows.push(<line key={'lu' + i + s} x1={x - 8} y1={staffTop + 4 * LS - (s - 30) * (LS / 2)} x2={x + 8} y2={staffTop + 4 * LS - (s - 30) * (LS / 2)} stroke="#9aa4ab" />);
      const filled = e.dur < 2;
      rows.push(<ellipse key={'n' + i} cx={x} cy={y} rx={5} ry={3.6} fill={filled ? '#23272b' : '#fff'} stroke="#23272b" strokeWidth={1.3} transform={`rotate(-16 ${x} ${y})`} />);
      if (e.dur < 4) rows.push(<line key={'st' + i} x1={x + 4.6} y1={y} x2={x + 4.6} y2={y - 26} stroke="#23272b" strokeWidth={1.2} />);
      const pc = ((midi % 12) + 12) % 12;
      if ([1, 3, 6, 8, 10].includes(pc)) {
        const flat = keySigAlterations(props.keyFifths).get(pc) === -1;
        rows.push(
          <text key={'ac' + i} x={x - 16} y={y + 4} fontSize={13} fill="#23272b">
            {flat ? '♭' : '♯'}
          </text>,
        );
      }
    }
    if (showNames && midi > 0) {
      const flat = keySigAlterations(props.keyFifths).get(((midi % 12) + 12) % 12) === -1;
      rows.push(
        <text key={'nm' + i} x={x} y={staffTop - 12} fontSize={9} fill="#8a9198" textAnchor="middle">
          {midiToName(midi, flat)}
        </text>,
      );
    }
    // tab box
    const ty = staffTop + 4 * LS + 26;
    const isDraw = e.reed?.breath === 'draw';
    const slide = !!e.reed?.slide;
    rows.push(
      <rect
        key={'t' + i}
        x={x - 15}
        y={ty}
        width={30}
        height={18}
        rx={5}
        fill={e.reed ? (isDraw ? '#fdeee6' : '#e3f2f5') : '#f4f4f4'}
        stroke={slide ? '#b8860b' : isDraw ? '#b3502a' : '#1d7a8c'}
        strokeWidth={slide ? 2 : 1.2}
      />,
    );
    rows.push(
      <text key={'tt' + i} x={x} y={ty + 13} fontSize={11} fontWeight={700} textAnchor="middle" fill={slide ? '#b8860b' : isDraw ? '#b3502a' : '#1d7a8c'} fontFamily="monospace">
        {e.reed ? reedTab(e.reed) : e.midi === 0 ? '·' : '?'}
      </text>,
    );
    if (e.lyric)
      rows.push(
        <text key={'ly' + i} x={x} y={ty + 34} fontSize={11} textAnchor="middle" fill={hl ? '#7a5c00' : '#43484d'} fontWeight={hl ? 700 : 400}>
          {e.lyric}
        </text>,
      );
  });
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      {rows}
      <line x1={46 + events.length * colW - colW / 2} y1={staffTop} x2={46 + events.length * colW - colW / 2} y2={staffTop + 4 * LS} stroke="#23272b" strokeWidth={2.4} />
    </svg>
  );
}

export default function App() {
  const [lang, setLang] = useState<Lang>(() => (localStorage.getItem('lang') as Lang) || 'fa');
  const t = DICTS[lang];
  const [instId, setInstId] = useState('kimi1040');
  const [autoT, setAutoT] = useState(true);
  const [manualT, setManualT] = useState(0);
  const [showStaff, setShowStaff] = useState(true);
  const [showNames, setShowNames] = useState(true);
  const [npl, setNpl] = useState(12);
  const [song, setSong] = useState<Song | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Array<{ title: string; sub?: string; source: string; abc?: string; url?: string }>>([]);
  const [importText, setImportText] = useState('');
  const [status, setStatus] = useState('');
  const [showMap, setShowMap] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [curIdx, setCurIdx] = useState(-1);
  const [proxy, setProxy] = useState('');
  const playerRef = useRef(new PreviewPlayer());
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    localStorage.setItem('lang', lang);
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'fa' ? 'rtl' : 'ltr';
  }, [lang]);

  useEffect(() => {
    setSong(fromAbc(LIBRARY.find((l) => l.id === 'twinkle')!.abc, t.library));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const inst = getInstrument(instId);
  const result: EngineResult | null = useMemo(
    () => (song ? convert(song, inst, { autoTranspose: autoT, forceTranspose: autoT ? null : manualT }) : null),
    [song, inst, autoT, manualT],
  );

  useEffect(() => {
    if (curIdx >= 0 && scrollRef.current) {
      const el = scrollRef.current;
      el.scrollTo({ left: Math.max(0, curIdx * 54 - el.clientWidth / 2 + 100), behavior: 'smooth' });
    }
  }, [curIdx]);

  const doSearch = () => {
    const lib = searchLibrary(query).map((e) => {
      const titleLine = e.abc.split('\n').find((l) => l.startsWith('T:'))?.slice(2) ?? e.id;
      return { title: titleLine, sub: e.tagsFa, source: t.library, abc: e.abc };
    });
    setResults(lib);
    setStatus('');
    searchTheSession(query, proxy)
      .then((hits) => {
        setResults((prev) => [...prev, ...hits.map((h) => ({ title: h.title, source: h.source, url: h.url }))]);
      })
      .catch(() => setStatus(t.noResults));
  };

  const pickResult = async (r: { abc?: string; url?: string; title: string; source: string }) => {
    if (r.abc) {
      setSong(fromAbc(r.abc, r.source));
      return;
    }
    if (r.url) {
      try {
        setStatus(t.loading);
        const abc = await fetchTheSessionAbc(r.url, proxy);
        setSong(fromAbc(abc, r.source));
        setStatus('');
      } catch {
        window.open(r.url, '_blank');
        setStatus(t.noResults);
      }
    }
  };

  const onFiles = async (files: FileList | null) => {
    if (!files || !files[0]) return;
    const f = files[0];
    const buf = await f.arrayBuffer();
    const s = detectAndParse(f.name, buf);
    if (s) setSong(s);
    else setStatus(t.errParse);
  };

  const convertPasted = () => {
    try {
      if (/<score-partwise|<\?xml/i.test(importText)) setSong(fromMusicXml(importText, t.paste));
      else setSong(fromAbc(importText, t.paste));
      setStatus('');
    } catch {
      setStatus(t.errParse);
    }
  };

  const fetchLyrics = async () => {
    if (!song) return;
    setStatus(t.searching);
    try {
      const hits = await searchLrclibLyrics(song.titleFa ?? song.title);
      const withSync = hits.find((h) => h.synced) ?? hits[0];
      if (!withSync) throw new Error('none');
      const lines = withSync.synced ?? withSync.plain?.split('\n').map((x, i) => ({ time: i * 8, text: x })) ?? [];
      const last = lines[lines.length - 1]?.time || 1;
      const songEnd = song.notes[song.notes.length - 1]?.start ?? 1;
      const scale = songEnd / last;
      const notes = song.notes.map((n) => ({ ...n }));
      for (const line of lines) {
        if (!line.text) continue;
        const bt = line.time * scale;
        const n = notes.find((x) => !x.lyric && x.start >= bt - 0.26);
        if (n) n.lyric = line.text;
      }
      setSong({ ...song, notes });
      setStatus('');
    } catch {
      setStatus(t.noResults);
    }
  };

  const doPdf = async () => {
    if (!song || !result) return;
    setStatus(t.loading);
    try {
      const fonts = await loadFonts();
      const bytes = await exportTabPdf({
        song: { ...song },
        events: result.events,
        instrument: inst,
        appliedTranspose: result.appliedTranspose,
        lang,
        notesPerLine: npl,
        showStaff,
        showNoteNames: showNames,
        fontRegular: fonts.reg,
        fontBold: fonts.bold,
      });
      download(bytes, (song.title || 'tab').replace(/[^\w\-؀-ۿ ]/g, '') + '.pdf', 'application/pdf');
      setStatus(t.pdfReady);
    } catch (e) {
      setStatus(String(e));
    }
  };
  const doMidi = () => {
    if (!song || !result) return;
    const bytes = exportTabMidi({
      title: `${song.title}${song.titleFa ? ' — ' + song.titleFa : ''}`,
      events: result.events,
      appliedTranspose: result.appliedTranspose,
      tempo: song.tempo ?? 100,
      timeSig: song.timeSig,
      keyFifths: song.keyFifths,
      keyMinor: song.keyMinor,
    });
    download(bytes, (song.title || 'tab').replace(/[^\w\-]/g, '') + '.mid', 'audio/midi');
    setStatus(t.midiReady);
  };
  const doText = () => {
    if (!song || !result) return;
    const s = exportTabText({ title: song.title, instrument: inst, events: result.events, appliedTranspose: result.appliedTranspose, tempo: song.tempo });
    download(new TextEncoder().encode(s), 'tab.txt', 'text/plain');
  };

  const doPlay = () => {
    if (!result) return;
    if (playing) {
      playerRef.current.stop();
      setPlaying(false);
      setCurIdx(-1);
      return;
    }
    setPlaying(true);
    playerRef.current.play(
      result.events,
      result.appliedTranspose,
      song?.tempo ?? 100,
      (i) => setCurIdx(i),
      () => {
        setPlaying(false);
        setCurIdx(-1);
      },
    );
  };

  return (
    <div>
      <header className="top">
        <div className="brand">
          <div className="logo">۱۰۴۰</div>
          <div>
            <h1>{t.appName}</h1>
            <div className="tag">{t.tagline}</div>
          </div>
        </div>
        <button className="btn-secondary" onClick={() => setLang(lang === 'fa' ? 'en' : 'fa')}>
          {t.language}
        </button>
      </header>
      <main className="wrap">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <section className="card">
            <h2>{t.search}</h2>
            <div className="row">
              <input type="text" value={query} placeholder={t.searchPh} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && doSearch()} />
              <button className="btn-primary" onClick={doSearch}>
                {t.search}
              </button>
            </div>
            <div className="row" style={{ marginTop: 6 }}>
              <input type="text" dir="ltr" style={{ fontSize: 11 }} placeholder="CORS proxy (optional), e.g. https://corsproxy.io/?url=" value={proxy} onChange={(e) => setProxy(e.target.value)} />
            </div>
            {results.length > 0 && (
              <div className="list" style={{ marginTop: 10 }}>
                {results.map((r, i) => (
                  <div className="item" key={i} onClick={() => pickResult(r)}>
                    <div>
                      <div>{r.title}</div>
                      {r.sub && <div style={{ fontSize: 11, color: '#7d838a' }}>{r.sub}</div>}
                    </div>
                    <span className="src">{r.source}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="card">
            <h2>{t.importTitle}</h2>
            <div className="row">
              <input type="file" accept=".abc,.txt,.xml,.musicxml,.mid,.midi" onChange={(e) => onFiles(e.target.files)} />
            </div>
            <textarea value={importText} onChange={(e) => setImportText(e.target.value)} placeholder={t.importHint} />
            <button className="btn-secondary" onClick={convertPasted}>
              {t.importBtn}
            </button>
          </section>

          <section className="card">
            <h2>{t.settings}</h2>
            <label style={{ fontSize: 13 }}>{t.instrument}</label>
            <select value={instId} onChange={(e) => setInstId(e.target.value)}>
              {INSTRUMENTS.map((i) => (
                <option key={i.id} value={i.id}>
                  {lang === 'fa' ? i.nameFa : i.nameEn}
                </option>
              ))}
            </select>
            <div style={{ fontSize: 12, color: '#7d838a', margin: '6px 0' }}>{lang === 'fa' ? inst.descFa : inst.descEn}</div>
            <label className="ck">
              <input type="checkbox" checked={autoT} onChange={(e) => setAutoT(e.target.checked)} /> {t.autoTrans}
            </label>
            {!autoT && (
              <div className="row">
                <input type="range" min={-12} max={12} value={manualT} onChange={(e) => setManualT(+e.target.value)} />
                <span className="chip">{manualT > 0 ? '+' : ''}{manualT}</span>
              </div>
            )}
            <div className="row" style={{ marginTop: 8 }}>
              <label className="ck">
                <input type="checkbox" checked={showStaff} onChange={(e) => setShowStaff(e.target.checked)} /> {t.staff}
              </label>
              <label className="ck">
                <input type="checkbox" checked={showNames} onChange={(e) => setShowNames(e.target.checked)} /> {t.noteNames}
              </label>
            </div>
            <div className="row" style={{ marginTop: 8 }}>
              <label style={{ fontSize: 13 }}>{t.perLine}</label>
              <select value={npl} onChange={(e) => setNpl(+e.target.value)} style={{ width: 70 }}>
                {[8, 10, 12, 14, 16].map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </div>
            <button className="btn-ghost" onClick={() => setShowMap(!showMap)}>
              {showMap ? t.hideMap : t.noteMap}
            </button>
            {showMap && (
              <table className="map" style={{ marginTop: 8 }}>
                <thead>
                  <tr>
                    <th>{t.hole}</th>
                    <th>{t.blow}</th>
                    {inst.hasSlide && <th>{t.blow}+{t.slide}</th>}
                    <th>{t.draw}</th>
                    {inst.hasSlide && <th>{t.draw}+{t.slide}</th>}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: inst.holes }, (_, i) => i + 1).map((h) => {
                    const b = inst.reeds.find((r) => r.hole === h && r.breath === 'blow' && !r.slide)!;
                    const d = inst.reeds.find((r) => r.hole === h && r.breath === 'draw' && !r.slide)!;
                    const bs = inst.reeds.find((r) => r.hole === h && r.breath === 'blow' && r.slide);
                    const ds = inst.reeds.find((r) => r.hole === h && r.breath === 'draw' && r.slide);
                    return (
                      <tr key={h}>
                        <td>{h}</td>
                        <td className="blow">{midiToName(b.midi)}</td>
                        {inst.hasSlide && <td className="slide">{bs ? midiToName(bs.midi) : ''}</td>}
                        <td className="draw">{midiToName(d.midi)}</td>
                        {inst.hasSlide && <td className="slide">{ds ? midiToName(ds.midi) : ''}</td>}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </section>

          <section className="card">
            <h2>{t.about}</h2>
            <div style={{ fontSize: 12.5, color: '#565c63' }}>{t.aboutText}</div>
            <div style={{ fontSize: 12.5, color: '#96660a', marginTop: 6 }}>{t.tip}</div>
          </section>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <section className="card">
            {song ? (
              <>
                <div className="songhead">
                  <span className="t">{lang === 'fa' && song.titleFa ? song.titleFa : song.title}</span>
                  {lang === 'fa' ? <span className="m ltr">{song.title}</span> : song.titleFa ? <span className="m">{song.titleFa}</span> : null}
                </div>
                <div className="songhead" style={{ marginTop: 2 }}>
                  {song.composer && <span className="m">{t.composer}: {song.composer}</span>}
                  <span className="m">{t.key}: {keyName(song.keyFifths, song.keyMinor)}</span>
                  <span className="m">{t.meter}: {song.timeSig[0]}/{song.timeSig[1]}</span>
                  {song.tempo && <span className="m">{t.tempo}: ♩={song.tempo}</span>}
                  <span className="m">{t.source}: {song.source}</span>
                </div>
                {result && (
                  <div className="chips">
                    <span className="chip">{t.coverage}: {Math.round(result.coverage * 100)}%</span>
                    {result.appliedTranspose !== 0 && (
                      <span className="chip warn">
                        {t.transposedBy}: {result.appliedTranspose > 0 ? '+' : ''}{result.appliedTranspose} {t.semitones}
                      </span>
                    )}
                    {result.unmappedCount > 0 && <span className="chip bad">{t.unmapped}: {result.unmappedCount}</span>}
                  </div>
                )}
                <div className="tabwrap" ref={scrollRef} style={{ marginTop: 8 }}>
                  {result && <TabSvg events={result.events} transpose={result.appliedTranspose} timeSig={song.timeSig} keyFifths={song.keyFifths} showStaff={showStaff} showNames={showNames} currentIdx={curIdx} lang={lang} />}
                </div>
                <div className="row playbar" style={{ marginTop: 10 }}>
                  <button className="btn-primary" onClick={doPlay}>
                    {playing ? t.stop : t.play}
                  </button>
                  <button className="btn-secondary" onClick={doPdf}>
                    {t.exportPdf}
                  </button>
                  <button className="btn-secondary" onClick={doMidi}>
                    {t.exportMidi}
                  </button>
                  <button className="btn-secondary" onClick={doText}>
                    {t.exportText}
                  </button>
                  <button className="btn-ghost" onClick={fetchLyrics}>
                    {t.lyricsOn} (lrclib)
                  </button>
                </div>
              </>
            ) : (
              <div>{t.noSong}</div>
            )}
            <div className="status" style={{ marginTop: 8 }}>{status}</div>
          </section>
        </div>
      </main>
      <div className="footer">{t.appName} — Kimi/Qimei 1040 • PDF + MIDI • FA/EN</div>
    </div>
  );
}
