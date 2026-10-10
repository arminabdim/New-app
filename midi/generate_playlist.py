#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
generate_playlist.py
====================

یک فایل MIDI تک‌فایله می‌سازد که شامل تمام قطعاتِ پیشنهادیِ بالاست.

نکته‌ی مهم (حقوقی/هنری):
    ملودیِ دقیقِ آثارِ اصلی (که تحت حق نشر هستند) این‌جا بازنویسی/ترنسکرایب نشده.
    هر قطعه‌ی این فایل یک «برداشتِ بدیع» (original composition) است که در همان
    گام، همان تمپو، همان حسِ هارمونیک و همان قوسِ پویای تدریجیِ اثرِ الهام‌بخش
    نوشته شده: شروعِ کم‌جان ← لایه‌بندی تدریجی ← اوج.

خروجی:  midi/Cinematic-Atmospheres.mid   (Type 1، 480 tick بر beat)

ساختار فایل:
    Track 0 ....... نقشه‌ی تمپو + مارکرِ هر قطعه (برای جهش در DAW/پلیر)
    Track 1..N .... به‌ازای هر قطعه، یک ترک به‌ازای هر نقش (پیانو/استرینگ/ارگ/براس)

نحوه‌ی اجرا:
    python3 -m venv .venv-midi && .venv-midi/bin/pip install mido
    .venv-midi/bin/python midi/generate_playlist.py
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Sequence, Tuple

from mido import Message, MetaMessage, MidiFile, MidiTrack, bpm2tempo

# --------------------------------------------------------------------------- #
# تنظیمات پایه
# --------------------------------------------------------------------------- #

TPQ = 480                 # ticks per quarter note
BAR = TPQ * 4             # یک میزانِ ۴/۴
GAP_BEATS = 2.0           # سکوتِ کوتاه بین قطعه‌ها

OUT_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                        "Cinematic-Atmospheres.mid")

# نقش‌ها: (کانالِ پیش‌فرض، برنامه‌ی GM، برچسبِ ترک)
ROLES: Dict[str, Tuple[int, int, str]] = {
    "piano":   (0, 0,  "Piano"),
    "strings": (1, 48, "Strings"),
    "organ":   (2, 19, "Church Organ"),
    "brass":   (3, 61, "Brass Section"),
    "pad":     (4, 89, "Warm Pad"),
}

# هر بخش (آرپژ/باس/پد/ملودی) کانالِ خودش را می‌گیرد تا نت‌های هم‌پوشان
# روی یک کانال نیفتند (جلوگیری از قطع‌شدنِ زودهنگامِ نت در بعضی پلیرها).
PART_CHANNEL: Dict[Tuple[str, str], int] = {
    ("piano",   "arp"):    0, ("piano",   "bass"):  5, ("piano",   "melody"):  6,
    ("strings", "arp"):    1, ("strings", "pad"):   7,
    ("strings", "melody"): 8, ("strings", "bass"):  9,
    ("organ",   "pad"):    2, ("organ",   "arp"):  10, ("organ",   "melody"): 10,
    ("brass",   "bass"):   3, ("brass",   "pad"):  11, ("brass",   "melody"): 12,
    ("brass",   "arp"):    3,
    ("pad",     "pad"):    4, ("pad",     "arp"):   4, ("pad",     "melody"):  4,
}

# --------------------------------------------------------------------------- #
# ابزارهای موسیقایی
# --------------------------------------------------------------------------- #

_STEPS = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}


def n(name: str) -> int:
    """تبدیل نام نت به شماره‌ی MIDI:  "A3" -> 57 ,  "C#5" -> 73 ,  "Bb2" -> 46"""
    name = name.strip()
    semi = _STEPS[name[0].upper()]
    i = 1
    while i < len(name) and name[i] in "#b":
        semi += 1 if name[i] == "#" else -1
        i += 1
    octave = int(name[i:])
    return 12 * (octave + 1) + semi


CHORDS: Dict[str, Tuple[int, ...]] = {
    "maj":  (0, 4, 7),
    "min":  (0, 3, 7),
    "sus2": (0, 2, 7),
    "sus4": (0, 5, 7),
    "add9": (0, 4, 7, 14),
    "m9":   (0, 3, 7, 14),
    "dim":  (0, 3, 6),
    "5":    (0, 7),
}


def tones(root: str, quality: str) -> List[int]:
    """نت‌های یک آکورد (بالارونده)."""
    r = n(root)
    return [r + s for s in CHORDS[quality]]


def latin1(text: str) -> str:
    """رشته‌های متای MIDI فقط latin-1 هستند؛ بقیه را به ASCII نزدیک می‌کنیم."""
    repl = {"—": "-", "–": "-", "·": "-", "’": "'", "“": '"', "”": '"',
            "…": "...", "‌": ""}
    for k, v in repl.items():
        text = text.replace(k, v)
    return "".join(ch if ord(ch) < 256 else "?" for ch in text)


def vel(value: float) -> int:
    return max(1, min(127, int(round(value))))


def clamp_pitch(p: int) -> int:
    return max(21, min(108, p))


def arp_pitch(chord: Sequence[int], index: int) -> int:
    """index می‌تواند از تعداد نت‌های آکورد بیشتر باشد -> اکتاو بعدی."""
    k = len(chord)
    octave, i = divmod(index, k)
    return chord[i] + 12 * octave


# --------------------------------------------------------------------------- #
# ترک‌ساز
# --------------------------------------------------------------------------- #

class TrackBuilder:
    """جمع‌آوری پیام‌ها با زمانِ مطلق (absolute tick) و تبدیل به delta در پایان."""

    def __init__(self, name: str, channel: int, program: int):
        self.name = name
        self.channel = channel
        self.program = program
        self.events: List[Tuple[int, int, Message]] = []
        self.channels_used = {channel}
        self._order = 0

    def add(self, tick: int, msg: Message) -> None:
        self.events.append((tick, self._order, msg))
        self._order += 1

    def note(self, tick: int, pitch: int, dur: int, velocity: int,
             channel: Optional[int] = None) -> None:
        ch = self.channel if channel is None else channel
        self.channels_used.add(ch)
        pitch = clamp_pitch(pitch)
        dur = max(1, int(dur))
        self.add(tick, Message("note_on", channel=ch, note=pitch,
                               velocity=vel(velocity)))
        self.add(tick + dur, Message("note_off", channel=ch, note=pitch,
                                     velocity=64))

    def cc(self, tick: int, control: int, value: int) -> None:
        self.add(tick, Message("control_change", channel=self.channel,
                               control=control, value=value))

    def build(self) -> MidiTrack:
        track = MidiTrack()
        track.name = self.name
        track.append(MetaMessage("track_name", name=latin1(self.name), time=0))
        for ch in sorted(self.channels_used):
            track.append(Message("program_change", channel=ch,
                                 program=self.program, time=0))
        last = 0
        for tick, _, msg in sorted(self.events, key=lambda e: (e[0], e[1])):
            msg.time = int(tick) - last
            track.append(msg)
            last = int(tick)
        track.append(MetaMessage("end_of_track", time=0))
        return track


class PieceBuilder:
    """ترک‌های یک قطعه را به‌صورتِlazy می‌سازد."""

    def __init__(self, index: int, title: str):
        self.index = index
        self.title = title
        self.tracks: Dict[str, TrackBuilder] = {}

    def track(self, role: str) -> TrackBuilder:
        if role not in self.tracks:
            channel, program, label = ROLES[role]
            self.tracks[role] = TrackBuilder(
                f"{self.title} - {label}", channel, program)
        return self.tracks[role]


# --------------------------------------------------------------------------- #
# موتور رندر
# --------------------------------------------------------------------------- #

# prog item = (root, quality, bars, bass_note)
ProgItem = Tuple[str, str, int, Optional[str]]


def render_section(pb: PieceBuilder, sec: dict, start: int) -> int:
    """یک سکشن را از tick شروع رندر می‌کند و tickِ پایان را برمی‌گرداند."""
    prog: List[ProgItem] = sec["prog"]
    bars = sum(b for _, _, b, _ in prog)
    pass_ticks = bars * BAR
    passes = sec.get("passes", 1)
    curve: List[float] = sec.get("vel_curve", [1.0] * passes)
    play: Dict[str, Sequence[int]] = sec.get("play", {})
    default_role = sec.get("arp", {}).get("role", "piano")

    def allowed(part: str, p: int) -> bool:
        return p in play.get(part, range(passes))

    for p in range(passes):
        vs = curve[p] if p < len(curve) else curve[-1]
        t0 = start + p * pass_ticks

        # ---- آرپژ / اوستیناتو -------------------------------------------------
        if "arp" in sec and allowed("arp", p):
            a = sec["arp"]
            tk = pb.track(a.get("role", "piano"))
            div = a.get("div", 8)
            pat: List[int] = a["pattern"]
            acc: Optional[List[float]] = a.get("accents")
            step = BAR // div
            legato = a.get("legato", 0.95)
            base = a.get("vel", 58)
            t = t0
            for root, qual, nbars, _bass in prog:
                chord = tones(root, qual)
                for _ in range(nbars):
                    for i in range(div):
                        pitch = arp_pitch(chord, pat[i % len(pat)])
                        v = base * vs * (acc[i % len(acc)] if acc else 1.0)
                        tk.note(t, pitch, step * legato, v,
                                PART_CHANNEL.get((a.get("role", "piano"), "arp")))
                        t += step

        # ---- باس ---------------------------------------------------------------
        if "bass" in sec and allowed("bass", p):
            b = sec["bass"]
            bass_role = b.get("role", default_role)
            tk = pb.track(bass_role)
            bass_ch = PART_CHANNEL.get((bass_role, "bass"))
            hits: List[float] = b.get("hits", [0.0])
            dur = int(b.get("dur", 2.0) * TPQ * 0.95)
            base = b.get("vel", 60)
            t = t0
            for root, _qual, nbars, bassnote in prog:
                pitch = n(bassnote or root) - 12 * b.get("down", 0)
                group = nbars * BAR
                if dur >= group * 0.95:
                    # نتِ بمِ کشیده: یکی برای کلِ گروه آکوردی (مثلِ دورِ ۲ میزانی)
                    for h in hits:
                        tk.note(t + int(h * TPQ), pitch, int(group * 0.98),
                                base * vs, bass_ch)
                    t += group
                else:
                    for _ in range(nbars):
                        for h in hits:
                            tk.note(t + int(h * TPQ), pitch, dur, base * vs, bass_ch)
                        t += BAR

        # ---- پد (آکوردهای کشیده) -----------------------------------------------
        if "pad" in sec and allowed("pad", p):
            pd = sec["pad"]
            pad_role = pd.get("role", "strings")
            tk = pb.track(pad_role)
            pad_ch = PART_CHANNEL.get((pad_role, "pad"))
            base = pd.get("vel", 44)
            fill = pd.get("fill", 0.98)
            t = t0
            for root, qual, nbars, _bass in prog:
                chord = tones(root, qual)
                d = int(nbars * BAR * fill)
                notes_to_play = list(chord)
                if pd.get("add_root", True):
                    notes_to_play.append(chord[0] - 12)
                if pd.get("add_fifth_above"):
                    notes_to_play.append(chord[2] + 12 if len(chord) > 2 else chord[-1] + 12)
                for pitch in notes_to_play:
                    tk.note(t, pitch, d, base * vs, pad_ch)
                t += nbars * BAR

        # ---- ملودی --------------------------------------------------------------
        if "melody" in sec and allowed("melody", p):
            m = sec["melody"]
            mel_role = m.get("role", "piano")
            tk = pb.track(mel_role)
            mel_ch = PART_CHANNEL.get((mel_role, "melody"))
            base = m.get("vel", 70)
            legato = m.get("legato", 0.97)
            dbl = m.get("double") and p >= passes - 1
            t = t0
            for item in m["notes"]:
                note, beats = item
                if note is not None:
                    d = int(beats * TPQ * legato)
                    names = note if isinstance(note, (list, tuple)) else [note]
                    for name_ in names:
                        tk.note(t, n(name_), d, base * vs, mel_ch)
                        if dbl:
                            tk.note(t, n(name_) - 12, d, base * vs * 0.55, mel_ch)
                t += int(beats * TPQ)

    return start + passes * pass_ticks


def render_piece(conductor: TrackBuilder, idx: int, spec: dict, start: int) -> int:
    pb = PieceBuilder(idx, spec["title"])
    bpm = spec["tempo"]

    conductor.add(start, MetaMessage("marker", text=latin1(f"{idx:02d}. {spec['title']}")))
    conductor.add(start, MetaMessage(
        "text", text=latin1(f"{spec['title']} - inspired by {spec['after']} - {bpm} BPM")))
    conductor.add(start, MetaMessage("set_tempo", tempo=bpm2tempo(bpm)))
    if spec.get("key"):
        conductor.add(start, MetaMessage("key_signature", key=spec["key"]))

    tick = start
    for sec in spec["sections"]:
        tick = render_section(pb, sec, tick)

    end = tick

    # ریتارداندوی انتهایی (به‌جز قطعاتی که باید ناگهانی تمام شوند)
    rit_bars = spec.get("rit_bars", 1)
    if rit_bars:
        steps = 8
        total = rit_bars * BAR
        for i in range(1, steps + 1):
            frac = i / steps
            conductor.add(end - total + int(total * frac),
                         MetaMessage("set_tempo",
                                     tempo=bpm2tempo(bpm * (1.0 - 0.16 * frac))))

    # پدالِ ساستین برای قطعات پیانویی
    if spec.get("pedal") and "piano" in pb.tracks:
        pb.tracks["piano"].cc(start, 64, 96)
        pb.tracks["piano"].cc(end, 64, 0)

    for tk in pb.tracks.values():
        ALL_TRACKS.append(tk)

    return end + int(GAP_BEATS * TPQ)


ALL_TRACKS: List[TrackBuilder] = []


# --------------------------------------------------------------------------- #
# محتوا: ۱۶ قطعه — هر کدام برداشتی بدیع در حس‌وحالِ اثرِ الهام‌بخش
# --------------------------------------------------------------------------- #

PLAYLIST: List[dict] = [

    # ---------------------------------------------------------------- 01
    {
        "title": "01 - Slow Horizon",
        "after": "Time — Hans Zimmer",
        "key": "A",
        "tempo": 66,
        "pedal": True,
        "sections": [{
            "prog": [
                ("A2",  "maj", 1, "A1"),  ("E2",  "maj", 1, "G#1"),
                ("F#2", "min", 1, "F#1"), ("D2",  "maj", 1, "D1"),
                ("A2",  "maj", 1, "A1"),  ("E2",  "maj", 1, "E1"),
                ("F#2", "min", 1, "F#1"), ("D2",  "maj", 1, "D2"),
            ],
            "arp": {"role": "piano", "pattern": [0, 2, 4, 2, 1, 3, 5, 3],
                    "div": 8, "vel": 58, "legato": 0.98},
            "bass": {"role": "piano", "hits": [0.0], "dur": 4.0, "vel": 62},
            "pad": {"role": "strings", "vel": 42},
            "melody": {"role": "piano", "vel": 74, "double": True, "notes": [
                ("C#5", 1.5), ("E5", 2.5),
                ("F#5", 2.0), ("E5", 2.0),
                ("C#5", 2.0), ("B4", 1.0), ("A4", 1.0),
                ("B4", 2.0),  ("A4", 2.0),
                ("C#5", 1.5), ("E5", 2.5),
                ("F#5", 2.0), ("E5", 1.0), ("C#5", 1.0),
                ("B4", 2.0),  ("A4", 1.0), ("F#4", 1.0),
                ("F#5", 2.0), ("E5", 2.0),
            ]},
            "passes": 4,
            "vel_curve": [0.60, 0.80, 0.96, 1.10],
            "play": {"melody": [1, 2, 3], "pad": [1, 2, 3]},
        }],
    },

    # ---------------------------------------------------------------- 02
    {
        "title": "02 - Becoming",
        "after": "Divenire — Ludovico Einaudi",
        "key": "Dm",
        "tempo": 78,
        "pedal": True,
        "sections": [{
            "prog": [
                ("D3",  "min", 1, "D2"),  ("Bb2", "maj", 1, "Bb1"),
                ("F3",  "maj", 1, "F2"),  ("C3",  "maj", 1, "C2"),
                ("D3",  "min", 1, "D2"),  ("Bb2", "maj", 1, "Bb1"),
                ("F3",  "maj", 1, "F2"),  ("C3",  "maj", 1, "C2"),
            ],
            "arp": {"role": "piano", "pattern": [0, 2, 1, 3, 2, 4, 3, 5],
                    "div": 16, "vel": 56, "legato": 0.9},
            "bass": {"role": "piano", "hits": [0.0, 2.0], "dur": 2.0, "vel": 68},
            "pad": {"role": "strings", "vel": 44},
            "melody": {"role": "piano", "vel": 78, "double": True, "notes": [
                ("A4", 2.0), ("D5", 2.0),
                ("F5", 4.0),
                ("A5", 2.0), ("G5", 2.0),
                ("E5", 4.0),
                ("D5", 2.0), ("F5", 2.0),
                ("G5", 2.0), ("F5", 2.0),
                ("A5", 2.0), ("C6", 2.0),
                ("E5", 2.0), ("D5", 2.0),
            ]},
            "passes": 3,
            "vel_curve": [0.70, 0.90, 1.06],
            "play": {"pad": [1, 2]},
        }],
    },

    # ---------------------------------------------------------------- 03
    {
        "title": "03 - First Light",
        "after": "Arrival of the Birds — The Cinematic Orchestra",
        "key": "E",
        "tempo": 74,
        "pedal": True,
        "sections": [{
            "prog": [
                ("E3",  "maj", 1, "E2"),  ("B2",  "maj", 1, "B1"),
                ("C#3", "min", 1, "C#2"), ("A2",  "maj", 1, "A1"),
                ("E3",  "maj", 1, "E2"),  ("G#2", "maj", 1, "G#1"),
                ("A2",  "maj", 1, "A1"),  ("B2",  "maj", 1, "B1"),
            ],
            "arp": {"role": "piano", "pattern": [0, 2, 4, 3, 2, 4, 2, 1],
                    "div": 8, "vel": 52, "legato": 0.98},
            "bass": {"role": "piano", "hits": [0.0], "dur": 4.0, "vel": 56},
            "pad": {"role": "strings", "vel": 40},
            "melody": {"role": "piano", "vel": 72, "double": True, "notes": [
                ("G#4", 1.0), ("B4", 1.0), ("E5", 2.0),
                ("D#5", 2.0), ("B4", 2.0),
                ("C#5", 2.0), ("G#4", 2.0),
                ("A4", 2.0),  ("C#5", 2.0),
                ("E5", 2.0),  ("G#5", 2.0),
                ("F#5", 2.0), ("D#5", 2.0),
                ("E5", 2.0),  ("C#5", 2.0),
                ("F#5", 2.0), ("D#5", 2.0),
            ]},
            "passes": 3,
            "vel_curve": [0.64, 0.86, 1.02],
        }],
    },

    # ---------------------------------------------------------------- 04
    {
        "title": "04 - Seven Candles",
        "after": "Light of the Seven — Ramin Djawadi",
        "key": "Dm",
        "tempo": 60,
        "pedal": True,
        "sections": [
            {   # مقدمه: پیانوی تنها روی یک نتِ بمِ کشیده
                "prog": [
                    ("D3",  "min", 2, "D2"), ("C3",  "maj", 2, "C2"),
                    ("Bb2", "maj", 2, "Bb1"), ("A2", "maj", 2, "A1"),
                ],
                "bass": {"role": "piano", "hits": [0.0], "dur": 8.0, "vel": 50},
                "pad": {"role": "organ", "vel": 30, "fill": 0.99},
                "melody": {"role": "piano", "vel": 66, "notes": [
                    ("D5", 2.0),  ("F5", 2.0), ("E5", 2.0), ("D5", 2.0),
                    ("C5", 2.0),  ("E5", 2.0), ("D5", 2.0), ("C5", 2.0),
                    ("D5", 2.0),  ("F5", 2.0), ("D5", 2.0), ("Bb4", 2.0),
                    ("C#5", 2.0), ("E5", 2.0), ("A5", 2.0), ("G#5", 2.0),
                ]},
                "passes": 1,
                "vel_curve": [0.72],
            },
            {   # بدنه: اوستیناتو + استرینگ + اوج
                "prog": [
                    ("D3",  "min", 1, "D2"), ("C3",  "maj", 1, "C2"),
                    ("Bb2", "maj", 1, "Bb1"), ("F3", "maj", 1, "A1"),
                    ("G2",  "min", 1, "G1"), ("D3",  "min", 1, "D2"),
                    ("Bb2", "maj", 1, "Bb1"), ("A2", "maj", 1, "A1"),
                ],
                "arp": {"role": "piano", "pattern": [0, 2, 4, 2, 3, 1, 2, 3],
                        "div": 8, "vel": 52, "legato": 0.95},
                "bass": {"role": "piano", "hits": [0.0, 2.0], "dur": 2.0, "vel": 62},
                "pad": {"role": "strings", "vel": 46},
                "melody": {"role": "piano", "vel": 74, "double": True, "notes": [
                    ("D5", 2.0),  ("F5", 2.0),
                    ("E5", 4.0),
                    ("F5", 2.0),  ("D5", 2.0),
                    ("A5", 2.0),  ("G5", 2.0),
                    ("Bb5", 2.0), ("G5", 2.0),
                    ("F5", 2.0),  ("D5", 2.0),
                    ("D5", 2.0),  ("F5", 2.0),
                    ("C#5", 2.0), ("E5", 2.0),
                ]},
                "passes": 2,
                "vel_curve": [0.86, 1.08],
            },
        ],
    },

    # ---------------------------------------------------------------- 05
    {
        "title": "05 - Relentless",
        "after": "Lux Aeterna — Clint Mansell",
        "key": "Em",
        "tempo": 86,
        "sections": [{
            "prog": [
                ("E3", "min", 2, "E2"), ("C3", "maj", 2, "C2"),
                ("G2", "maj", 2, "G1"), ("D3", "maj", 2, "D2"),
            ],
            "arp": {"role": "strings", "pattern": [0, 2, 4, 2, 3, 2, 4, 3],
                    "div": 8, "vel": 62, "legato": 0.92,
                    "accents": [1.0, 0.72, 0.86, 0.72, 1.0, 0.72, 0.86, 0.72]},
            "bass": {"role": "strings", "hits": [0.0, 1.0, 2.0, 3.0],
                     "dur": 1.0, "vel": 72},
            "melody": {"role": "brass", "vel": 70, "legato": 1.0, "notes": [
                ("E5", 4.0), ("G5", 4.0),
                ("G5", 4.0), ("E5", 4.0),
                ("G5", 4.0), ("B5", 4.0),
                ("A5", 4.0), ("F#5", 4.0),
            ]},
            "passes": 4,
            "vel_curve": [0.55, 0.72, 0.90, 1.12],
            "play": {"melody": [2, 3]},
        }],
    },

    # ---------------------------------------------------------------- 06
    {
        "title": "06 - Glass Window",
        "after": "Opening — Philip Glass",
        "key": "Cm",
        "tempo": 108,
        "rit_bars": 0,
        "pedal": True,
        "sections": [{
            "prog": [
                ("C3",  "min", 1, "C2"), ("C3", "min", 1, "C2"),
                ("Ab2", "maj", 1, "Ab1"), ("Bb2", "maj", 1, "Bb1"),
            ],
            "arp": {"role": "piano", "pattern": [0, 2, 4, 2, 1, 3, 5, 3],
                    "div": 8, "vel": 60, "legato": 0.92,
                    "accents": [1.0, 0.70, 0.86, 0.70, 1.0, 0.70, 0.86, 0.70]},
            "bass": {"role": "piano", "hits": [0.0], "dur": 4.0, "vel": 58},
            "pad": {"role": "pad", "vel": 30, "fill": 0.99},
            "melody": {"role": "pad", "vel": 46, "legato": 1.0, "notes": [
                ("Eb5", 8.0),
                ("C5", 4.0), ("D5", 4.0),
            ]},
            "passes": 6,
            "vel_curve": [0.62, 0.70, 0.78, 0.88, 0.76, 0.60],
            "play": {"pad": [3, 4, 5], "melody": [2, 3, 4, 5]},
        }],
    },

    # ---------------------------------------------------------------- 07
    {
        "title": "07 - Snowfall",
        "after": "Snow — Fabrizio Paterlini",
        "key": "F#",
        "tempo": 64,
        "pedal": True,
        "sections": [{
            "prog": [
                ("F#3", "maj", 1, "F#2"), ("C#3", "min", 1, "C#2"),
                ("B2",  "maj", 1, "B1"),  ("F#3", "maj", 1, "F#2"),
                ("F#3", "maj", 1, "F#2"), ("C#3", "min", 1, "C#2"),
                ("D#3", "min", 1, "D#2"), ("C#3", "maj", 1, "C#2"),
            ],
            "arp": {"role": "piano", "pattern": [0, 2, 4, 3, 2, 1, 3, 2],
                    "div": 8, "vel": 46, "legato": 0.98},
            "bass": {"role": "piano", "hits": [0.0], "dur": 4.0, "vel": 50},
            "pad": {"role": "pad", "vel": 24, "fill": 0.99},
            "melody": {"role": "piano", "vel": 66, "notes": [
                ("A#4", 1.0), ("C#5", 3.0),
                ("B4", 2.0),  ("A#4", 2.0),
                ("D#5", 2.0), ("C#5", 2.0),
                ("B4", 2.0),  ("A#4", 2.0),
                ("C#5", 2.0), ("F#5", 2.0),
                ("G#5", 2.0), ("F#5", 2.0),
                ("D#5", 2.0), ("F#5", 2.0),
                ("C#5", 4.0),
            ]},
            "passes": 3,
            "vel_curve": [0.66, 0.86, 0.96],
        }],
    },

    # ---------------------------------------------------------------- 08
    {
        "title": "08 - Engines",
        "after": "We Have to Go — Steve Jablonsky",
        "key": "Dm",
        "tempo": 92,
        "sections": [
            {
                "prog": [
                    ("D3",  "min", 1, "D2"),  ("Bb2", "maj", 1, "Bb1"),
                    ("F3",  "maj", 1, "F2"),  ("C3",  "maj", 1, "C2"),
                    ("D3",  "min", 1, "D2"),  ("Bb2", "maj", 1, "Bb1"),
                    ("G2",  "min", 1, "G1"),  ("A2",  "maj", 1, "A1"),
                ],
                "arp": {"role": "strings", "pattern": [0, 2, 4, 2, 3, 2, 4, 2],
                        "div": 8, "vel": 60, "legato": 0.9,
                        "accents": [1.0, 0.74, 0.88, 0.74, 1.0, 0.74, 0.88, 0.74]},
                "bass": {"role": "brass", "hits": [0.0, 2.0], "dur": 1.6, "vel": 74},
                "pad": {"role": "strings", "vel": 46},
                "melody": {"role": "brass", "vel": 78, "legato": 1.0, "notes": [
                    ("D5", 2.0),  ("F5", 2.0),
                    ("G5", 2.0),  ("F5", 2.0),
                    ("A5", 2.0),  ("G5", 2.0),
                    ("E5", 4.0),
                    ("D5", 1.0),  ("F5", 1.0), ("A5", 2.0),
                    ("Bb5", 2.0), ("A5", 2.0),
                    ("G5", 2.0),  ("Bb5", 2.0),
                    ("A5", 4.0),
                ]},
                "passes": 3,
                "vel_curve": [0.76, 0.94, 1.12],
                "play": {"melody": [1, 2], "bass": [1, 2]},
            },
            {   # کُدا: توتیِ کشیده
                "prog": [("D3", "min", 2, "D1")],
                "bass": {"role": "brass", "hits": [0.0], "dur": 8.0, "vel": 80},
                "pad": {"role": "strings", "vel": 58, "fill": 0.99,
                        "add_fifth_above": True},
                "melody": {"role": "brass", "vel": 84, "legato": 1.0,
                           "notes": [(("D5", "F5", "A5"), 8.0)]},
                "passes": 1,
                "vel_curve": [1.15],
            },
        ],
    },

    # ---------------------------------------------------------------- 09
    {
        "title": "09 - Experience",
        "after": "Experience — Ludovico Einaudi",
        "key": "F#m",
        "tempo": 94,
        "pedal": True,
        "sections": [{
            "prog": [
                ("F#3", "min", 1, "F#2"), ("D3", "maj", 1, "D2"),
                ("A2",  "maj", 1, "A1"),  ("E3", "maj", 1, "E2"),
                ("F#3", "min", 1, "F#2"), ("D3", "maj", 1, "D2"),
                ("A2",  "maj", 1, "A1"),  ("E3", "maj", 1, "E2"),
            ],
            "arp": {"role": "piano", "pattern": [0, 2, 1, 3, 2, 4, 3, 5],
                    "div": 16, "vel": 58, "legato": 0.88},
            "bass": {"role": "piano", "hits": [0.0, 2.0], "dur": 2.0, "vel": 70},
            "pad": {"role": "strings", "vel": 44},
            "melody": {"role": "piano", "vel": 78, "double": True, "notes": [
                ("C#5", 2.0), ("F#5", 2.0),
                ("A5", 2.0),  ("F#5", 2.0),
                ("E5", 2.0),  ("C#5", 2.0),
                ("B4", 2.0),  ("G#5", 2.0),
                ("F#5", 2.0), ("A5", 2.0),
                ("D5", 2.0),  ("F#5", 2.0),
                ("C#5", 2.0), ("E5", 2.0),
                ("G#5", 2.0), ("B5", 2.0),
            ]},
            "passes": 3,
            "vel_curve": [0.72, 0.92, 1.10],
            "play": {"pad": [1, 2]},
        }],
    },

    # ---------------------------------------------------------------- 10
    {
        "title": "10 - Earth Prelude",
        "after": "The Earth Prelude — Ludovico Einaudi",
        "key": "C",
        "tempo": 70,
        "pedal": True,
        "sections": [{
            "prog": [
                ("C3", "maj", 1, "C2"), ("A2", "min", 1, "A1"),
                ("F2", "maj", 1, "F1"), ("G2", "maj", 1, "G1"),
                ("C3", "maj", 1, "C2"), ("A2", "min", 1, "A1"),
                ("D3", "min", 1, "D2"), ("G2", "maj", 1, "G1"),
            ],
            "arp": {"role": "piano", "pattern": [0, 2, 4, 5, 4, 3, 2, 1],
                    "div": 8, "vel": 52, "legato": 0.97},
            "bass": {"role": "piano", "hits": [0.0], "dur": 4.0, "vel": 58},
            "pad": {"role": "strings", "vel": 40},
            "melody": {"role": "piano", "vel": 72, "double": True, "notes": [
                ("G4", 2.0), ("C5", 2.0),
                ("E5", 2.0), ("C5", 2.0),
                ("A5", 2.0), ("G5", 2.0),
                ("D5", 2.0), ("B4", 2.0),
                ("C5", 2.0), ("E5", 2.0),
                ("A5", 2.0), ("G5", 2.0),
                ("F5", 2.0), ("A5", 2.0),
                ("D5", 4.0),
            ]},
            "passes": 3,
            "vel_curve": [0.66, 0.86, 1.02],
            "play": {"pad": [1, 2]},
        }],
    },

    # ---------------------------------------------------------------- 11
    {
        "title": "11 - Cornfield",
        "after": "Cornfield Chase — Hans Zimmer",
        "key": "Dm",
        "tempo": 74,
        "sections": [{
            "prog": [
                ("D3",  "min", 1, "D2"), ("A2",  "min", 1, "A1"),
                ("Bb2", "maj", 1, "Bb1"), ("F3", "maj", 1, "F2"),
                ("D3",  "min", 1, "D2"), ("G2",  "min", 1, "G1"),
                ("Bb2", "maj", 1, "Bb1"), ("A2", "maj", 1, "A1"),
            ],
            "arp": {"role": "piano", "pattern": [0, 2, 4, 3, 2, 4, 2, 1],
                    "div": 8, "vel": 56, "legato": 0.95},
            "bass": {"role": "piano", "hits": [0.0], "dur": 4.0, "vel": 64},
            "pad": {"role": "organ", "vel": 48, "fill": 0.99},
            "melody": {"role": "strings", "vel": 62, "legato": 1.0, "notes": [
                ("A4", 2.0), ("D5", 2.0),
                ("E5", 2.0), ("C5", 2.0),
                ("F5", 2.0), ("D5", 2.0),
                ("C5", 2.0), ("A4", 2.0),
                ("D5", 2.0), ("F5", 2.0),
                ("G5", 2.0), ("D5", 2.0),
                ("F5", 2.0), ("D5", 2.0),
                ("C#5", 4.0),
            ]},
            "passes": 4,
            "vel_curve": [0.60, 0.76, 0.94, 1.10],
            "play": {"melody": [2, 3]},
        }],
    },

    # ---------------------------------------------------------------- 12
    {
        "title": "12 - Stay",
        "after": "Stay — Hans Zimmer",
        "key": "F#m",
        "tempo": 58,
        "pedal": True,
        "sections": [{
            "prog": [
                ("F#3", "min", 2, "F#2"), ("D3", "maj", 2, "D2"),
                ("A2",  "maj", 2, "A1"),  ("E3", "maj", 2, "E2"),
            ],
            "arp": {"role": "piano", "pattern": [0, 2, 4, 3, 2, 1, 3, 2],
                    "div": 8, "vel": 44, "legato": 0.98},
            "bass": {"role": "piano", "hits": [0.0], "dur": 8.0, "vel": 52},
            "pad": {"role": "organ", "vel": 46, "fill": 0.99},
            "melody": {"role": "piano", "vel": 66, "legato": 1.0, "notes": [
                ("C#5", 4.0), ("F#5", 4.0),
                ("A4", 4.0),  ("D5", 4.0),
                ("C#5", 4.0), ("E5", 4.0),
                ("B4", 4.0),  ("G#5", 4.0),
            ]},
            "passes": 3,
            "vel_curve": [0.62, 0.82, 0.98],
            "play": {"arp": [1, 2]},
        }],
    },

    # ---------------------------------------------------------------- 13
    {
        "title": "13 - Mountains",
        "after": "Mountains — Hans Zimmer",
        "key": "Gm",
        "tempo": 100,
        "sections": [
            {
                "prog": [
                    ("G3",  "min", 1, "G2"), ("Eb3", "maj", 1, "Eb2"),
                    ("Bb2", "maj", 1, "Bb1"), ("F3", "maj", 1, "F2"),
                    ("G3",  "min", 1, "G2"), ("Eb3", "maj", 1, "Eb2"),
                    ("F3",  "maj", 1, "F2"), ("D3",  "maj", 1, "D2"),
                ],
                "arp": {"role": "strings", "pattern": [0, 2, 4, 2, 3, 2, 4, 2],
                        "div": 8, "vel": 66, "legato": 0.86,
                        "accents": [1.0, 0.72, 0.9, 0.72, 1.0, 0.72, 0.9, 0.72]},
                "bass": {"role": "brass", "hits": [0.0, 1.0, 2.0, 3.0],
                         "dur": 0.9, "vel": 80},
                "pad": {"role": "brass", "vel": 52, "fill": 0.95},
                "melody": {"role": "brass", "vel": 76, "legato": 1.0, "notes": [
                    ("G5", 2.0),  ("Bb5", 2.0),
                    ("G5", 2.0),  ("Eb5", 2.0),
                    ("F5", 2.0),  ("Bb5", 2.0),
                    ("C6", 2.0),  ("A5", 2.0),
                    ("Bb5", 2.0), ("G5", 2.0),
                    ("Bb5", 2.0), ("G5", 2.0),
                    ("A5", 2.0),  ("C6", 2.0),
                    ("A5", 2.0),  ("F#5", 2.0),
                ]},
                "passes": 3,
                "vel_curve": [0.78, 0.96, 1.14],
                "play": {"melody": [1, 2], "pad": [1, 2]},
            },
            {   # کُدا
                "prog": [("G3", "min", 2, "G1")],
                "bass": {"role": "brass", "hits": [0.0], "dur": 8.0, "vel": 84},
                "pad": {"role": "strings", "vel": 60, "fill": 0.99,
                        "add_fifth_above": True},
                "melody": {"role": "brass", "vel": 86, "legato": 1.0,
                           "notes": [(("G5", "Bb5", "D6"), 8.0)]},
                "passes": 1,
                "vel_curve": [1.16],
            },
        ],
    },

    # ---------------------------------------------------------------- 14
    {
        "title": "14 - November",
        "after": "November — Max Richter",
        "key": "Am",
        "tempo": 66,
        "pedal": True,
        "sections": [{
            "prog": [
                ("A3", "min", 1, "A2"), ("F3", "maj", 1, "F2"),
                ("C3", "maj", 1, "C2"), ("G2", "maj", 1, "G1"),
                ("A3", "min", 1, "A2"), ("F3", "maj", 1, "F2"),
                ("C3", "maj", 1, "C2"), ("G2", "maj", 1, "G1"),
            ],
            "arp": {"role": "piano", "pattern": [0, 2, 4, 2, 1, 3, 2, 4],
                    "div": 8, "vel": 52, "legato": 0.97},
            "bass": {"role": "piano", "hits": [0.0], "dur": 4.0, "vel": 58},
            "pad": {"role": "strings", "vel": 46, "fill": 0.99},
            "melody": {"role": "piano", "vel": 68, "double": True, "notes": [
                ("E5", 2.0), ("C5", 2.0),
                ("A5", 2.0), ("G5", 2.0),
                ("G5", 2.0), ("E5", 2.0),
                ("D5", 2.0), ("B4", 2.0),
                ("A5", 2.0), ("E5", 2.0),
                ("F5", 2.0), ("A5", 2.0),
                ("E5", 2.0), ("G5", 2.0),
                ("D5", 4.0),
            ]},
            "passes": 3,
            "vel_curve": [0.66, 0.86, 1.02],
        }],
    },

    # ---------------------------------------------------------------- 15
    {
        "title": "15 - Daylight",
        "after": "On the Nature of Daylight — Max Richter",
        "key": "Bb",
        "tempo": 60,
        "sections": [{
            "prog": [
                ("Bb3", "maj", 2, "Bb2"), ("G3", "min", 2, "G2"),
                ("Eb3", "maj", 2, "Eb2"), ("F3", "maj", 2, "F2"),
            ],
            "bass": {"role": "strings", "hits": [0.0], "dur": 8.0, "vel": 54},
            "pad": {"role": "strings", "vel": 52, "fill": 0.995},
            "melody": {"role": "strings", "vel": 74, "legato": 1.0, "notes": [
                ("D5", 4.0),  ("F5", 4.0),
                ("G5", 4.0),  ("Bb5", 4.0),
                ("Bb5", 4.0), ("G5", 4.0),
                ("A5", 4.0),  ("C6", 4.0),
            ]},
            "passes": 3,
            "vel_curve": [0.62, 0.84, 1.06],
            "play": {"melody": [1, 2]},
        }],
    },

    # ---------------------------------------------------------------- 16
    {
        "title": "16 - Written on the Sky",
        "after": "Written on the Sky — Max Richter",
        "key": "Bm",
        "tempo": 72,
        "pedal": True,
        "sections": [{
            "prog": [
                ("B3",  "min", 1, "B2"),  ("G3", "maj", 1, "G2"),
                ("D3",  "maj", 1, "D2"),  ("A3", "maj", 1, "A2"),
                ("B3",  "min", 1, "B2"),  ("G3", "maj", 1, "G2"),
                ("D3",  "maj", 1, "D2"),  ("F#3", "maj", 1, "F#2"),
            ],
            "arp": {"role": "piano", "pattern": [0, 2, 4, 3, 2, 1, 3, 2],
                    "div": 8, "vel": 54, "legato": 0.96},
            "bass": {"role": "piano", "hits": [0.0, 2.0], "dur": 2.0, "vel": 60},
            "pad": {"role": "strings", "vel": 44},
            "melody": {"role": "strings", "vel": 66, "legato": 1.0, "notes": [
                ("F#5", 2.0), ("B5", 2.0),
                ("G5", 2.0),  ("D5", 2.0),
                ("A5", 2.0),  ("F#5", 2.0),
                ("E5", 2.0),  ("C#5", 2.0),
                ("B5", 2.0),  ("F#5", 2.0),
                ("D5", 2.0),  ("G5", 2.0),
                ("F#5", 2.0), ("A5", 2.0),
                ("C#5", 2.0), ("F#5", 2.0),
            ]},
            "passes": 3,
            "vel_curve": [0.70, 0.88, 1.06],
        }],
    },
]


# --------------------------------------------------------------------------- #
# ساخت فایل
# --------------------------------------------------------------------------- #

def build_midi() -> MidiFile:
    mid = MidiFile(type=1, ticks_per_beat=TPQ)

    conductor = TrackBuilder("00 - Playlist: tempo map & markers", 0, 0)
    conductor.add(0, MetaMessage("time_signature", numerator=4, denominator=4))
    conductor.add(0, MetaMessage("set_tempo", tempo=bpm2tempo(70)))
    conductor.add(0, MetaMessage(
        "text", text="Cinematic Atmospheres - 16 original pieces inspired by the playlist"))

    tick = 0
    for i, spec in enumerate(PLAYLIST, start=1):
        tick = render_piece(conductor, i, spec, tick)

    mid.tracks.append(conductor.build())
    for tk in ALL_TRACKS:
        mid.tracks.append(tk.build())
    return mid


def main() -> None:
    mid = build_midi()
    mid.save(OUT_PATH)

    seconds = mid.length
    print(f"✓ saved: {OUT_PATH}")
    print(f"  type={mid.type}  tpq={mid.ticks_per_beat}  tracks={len(mid.tracks)}")
    print(f"  length: {int(seconds // 60)}:{int(seconds % 60):02d}  ({seconds:.1f}s)")
    notes = sum(1 for t in mid.tracks for m in t if m.type == "note_on")
    print(f"  note events: {notes}")
    print("\n  tracks:")
    for i, t in enumerate(mid.tracks):
        print(f"   {i:>2}. {t.name}")


if __name__ == "__main__":
    main()
