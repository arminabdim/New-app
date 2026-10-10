# سازدهنی‌تَب — Kimi 1040 Tab Converter

مبدل نت → تبلچر برای سازدهنی کروماتیک **کیمی / قیمی (Qimei) 1040** — و خروجی **PDF** و **MIDI** با متنِ هم‌زمانِ فارسی/انگلیسی.

Note → harmonica-tab converter for the **Kimi/Qimei 1040** 10-hole chromatic harmonica (and relatives), with **PDF** and **MIDI** export and synced Persian/English lyrics.

## ویژگی‌ها / Features

- جست‌وجوی آهنگ (کتابخانهٔ داخلی + جست‌وجوی برخط thesession.org) و واردسازی ABC / MusicXML / MIDI
  (song search — built-in library + online — and ABC / MusicXML / MIDI import)
- تبدیل نت به تبلچر با الگوریتم کمینه‌سازی حرکت دست و تغییر اسلاید (Viterbi/DP) + ترانسپوز خودکار
  (fingering chosen by dynamic programming over reed candidates; auto-transpose when out of range)
- خروجی PDF شامل خط حامل، تبلچر، متن سینک‌شده، نقشهٔ ساز و راهنما — با فونت وزیرمتن و پشتیبانی کامل فارسی
  (PDF with staff notation, tab row, synced lyrics, instrument chart; full Persian shaping via Vazirmatn)
- خروجی MIDI شامل نت‌ها، متن آهنگ (Lyric meta) و تبلچر (Text meta) به‌صورت سینک
  (MIDI carries lyric meta events + tab fingering text events, synced to note onsets)
- پخش پیش‌نمایش صوتی + هایلایت کارائوکه‌ای نت/متن
- رابط دومنبهٔ فارسی/انگلیسی (RTL/LTR)، واکنش‌گرا برای موبایل/تبلت/دسکتاپ

## نشانه‌گذاری تبلچر / Tab notation

| علامت | معنی |
|---|---|
| `+5` | دم (بازدم به بیرون) روی سوراخ ۵ — blow hole 5 |
| `-5` | بازدم (به داخل) روی سوراخ ۵ — draw hole 5 |
| `*`  | کلید اسلاید فشرده — slide button pressed |

## کوک ساز / Instrument layout

کوک پیش‌فرض، کوک «سولو» استاندارد کروماتیک ۱۰ سوراخ است (مطابق کاتالوگ رسمی Hohner برای خانوادهٔ Octave/Chromonica 40 که سازهای ۱۰۴۰ از آن پیروی می‌کنند):
گسترهٔ کاملاً کروماتیک C4 تا F♯6. کوک جایگزین سبک CX-12، کروماتیک ۱۲ سوراخ، ترمولو ۲۴ و دیاتونیک ۱۰ نیز در تنظیمات موجود است.

Default tuning = standard 10-hole chromatic solo tuning (per Hohner's official catalog for the Octave/Chromonica-40 family, which the 1040 clones follow): fully chromatic C4–F♯6. Alternates (CX-12 style, 12-hole chromatic, 24-hole tremolo, 10-hole diatonic) are selectable in Settings.

## اجرا / Run

```bash
npm install
npm run dev        # development server
npm run build      # production build (dist/)
npm test           # unit tests (engine, parsers, SMF round-trip, shaper)
npm run samples    # generate samples/*.pdf + *.mid from the library
```

## ساختار / Structure

- `src/core/` — notes, instrument reed maps, conversion engine (DP), ABC/MusicXML/SMF parsers, Persian shaper/bidi
- `src/export/` — PDF (pdf-lib + Vazirmatn), MIDI (SMF writer), text
- `src/search/` — built-in library + online providers
- `src/audio/` — WebAudio preview synth
