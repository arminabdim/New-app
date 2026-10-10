// ── Online song sources (best effort; degrades gracefully offline) ──────────
// These run in the *user's* browser, so they use whatever internet the device
// has. CORS-unfriendly sources fall back to opening the site directly.

export interface OnlineHit {
  title: string;
  source: string;
  url?: string;
  abc?: string; // if we could fetch machine-readable notation
}

export async function searchTheSession(q: string, proxy: string): Promise<OnlineHit[]> {
  const url = `${proxy}https://thesession.org/tunes/search?q=${encodeURIComponent(q)}&format=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('thesession HTTP ' + res.status);
  const data = await res.json();
  const hits: OnlineHit[] = [];
  for (const t of data?.tunes ?? []) {
    hits.push({ title: t.name, source: 'thesession.org', url: 'https://thesession.org/tunes/' + t.id });
  }
  return hits.slice(0, 8);
}

export async function fetchTheSessionAbc(tuneUrl: string, proxy: string): Promise<string> {
  const id = /tunes\/(\d+)/.exec(tuneUrl)?.[1];
  if (!id) throw new Error('bad url');
  const res = await fetch(`${proxy}https://thesession.org/tunes/${id}?format=json`);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const data = await res.json();
  const s = data?.settings?.[0]?.abc;
  if (!s) throw new Error('no abc');
  return `X:1\nT:${data.name}\nM:${data.settings?.[0]?.meter ?? '4/4'}\nL:1/8\nK:${data.settings?.[0]?.key}\n${s}\n`;
}

export async function searchLrclibLyrics(q: string): Promise<Array<{ title: string; artist: string; synced: Array<{ time: number; text: string }> | null; plain: string | null }>> {
  const res = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(q)}`);
  if (!res.ok) throw new Error('lrclib HTTP ' + res.status);
  const data = await res.json();
  return (data ?? []).slice(0, 5).map((r: any) => ({
    title: r.trackName ?? '',
    artist: r.artistName ?? '',
    synced: r.syncedLyrics ? parseLrc(r.syncedLyrics) : null,
    plain: r.plainLyrics ?? null,
  }));
}

export function parseLrc(lrc: string): Array<{ time: number; text: string }> {
  const out: Array<{ time: number; text: string }> = [];
  for (const line of lrc.split('\n')) {
    const m = /\[(\d+):(\d+(?:\.\d+)?)\](.*)/.exec(line);
    if (!m) continue;
    out.push({ time: +m[1] * 60 + parseFloat(m[2]), text: m[3].trim() });
  }
  return out;
}
