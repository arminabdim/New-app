// ── Web Audio preview: simple harmonica-like synth ──────────────────────────
import { TabEvent } from '../core/engine';

export class PreviewPlayer {
  private ctx: AudioContext | null = null;
  private nodes: AudioScheduledSourceNode[] = [];
  private timers: number[] = [];
  playing = false;

  stop() {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
    for (const n of this.nodes) {
      try {
        n.stop();
      } catch {
        /* already stopped */
      }
    }
    this.nodes = [];
    this.playing = false;
  }

  play(events: TabEvent[], transpose: number, tempoBpm: number, onStep?: (i: number) => void, onEnd?: () => void) {
    this.stop();
    const Ctor: typeof AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
    this.ctx = new Ctor();
    const ctx = this.ctx;
    const spb = 60 / (tempoBpm || 100);
    const t0 = ctx.currentTime + 0.1;
    this.playing = true;
    let lastEnd = 0;
    events.forEach((e, i) => {
      if (e.midi <= 0) return;
      const start = t0 + e.start * spb;
      const dur = Math.max(0.18, e.dur * spb * 0.95);
      lastEnd = Math.max(lastEnd, e.start * spb + dur);
      const midi = e.midi + transpose;
      const freq = 440 * Math.pow(2, (midi - 69) / 12);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, start);
      g.gain.linearRampToValueAtTime(0.32, start + 0.04);
      g.gain.setValueAtTime(0.32, start + dur - 0.08);
      g.gain.linearRampToValueAtTime(0.0001, start + dur);
      const filt = ctx.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.value = 2400;
      const o1 = ctx.createOscillator();
      o1.type = 'sawtooth';
      o1.frequency.value = freq;
      const o2 = ctx.createOscillator();
      o2.type = 'sawtooth';
      o2.frequency.value = freq;
      o2.detune.value = 7; // tremolo-ish beating
      o1.connect(filt);
      o2.connect(filt);
      filt.connect(g);
      g.connect(ctx.destination);
      o1.start(start);
      o2.start(start);
      o1.stop(start + dur + 0.05);
      o2.stop(start + dur + 0.05);
      this.nodes.push(o1, o2);
      if (onStep) {
        this.timers.push(window.setTimeout(() => onStep(i), (start - ctx.currentTime) * 1000));
      }
    });
    this.timers.push(
      window.setTimeout(() => {
        this.playing = false;
        onEnd?.();
      }, (lastEnd + 0.4) * 1000),
    );
  }
}
