# Cinematic Atmospheres — فایل MIDI

`Cinematic-Atmospheres.mid` یک فایل MIDI تک‌فایله است که هر ۱۶ قطعه‌ی پیشنهادیِ
لیست بالا را پشت‌سرهم در خودش دارد: از «Time» و «Divenire» گرفته تا قطعاتِ
پیشنهادیِ هر سه هنرمند (Einaudi / Zimmer / Richter).

| مشخصه | مقدار |
|---|---|
| طول کل | **۲۲:۴۹** (۱۶ قطعه) |
| فرمت | MIDI Type 1، ‎480 tick بر beat |
| تعداد ترک‌ها | ۳۴ (ترک ۰ = نقشه‌ی تمپو و مارکرها + ۳۳ ترکِ صدا) |
| سازبندی GM | Piano (0)، Strings (48)، Church Organ (19)، Brass Section (61)، Warm Pad (89) |
| حجم فایل | ~۵۳ کیلوبایت |

---

## ⚠️ یک نکته‌ی مهم درباره‌ی محتوا

این فایل **ترنسکرایپتِ نت‌به‌نتِ آهنگ‌های اصلی نیست** (آن‌ها تحتِ حق نشر هستند و
کپی‌برداری از ملودی‌شان کارِ درستی هم نیست). به‌جایش، هر قطعه‌ی این فایل یک
**ساخته‌ی بدیع** است که در همان «قالبِ حسی»ِ اثرِ الهام‌بخش نوشته شده:

* همان گام و مرکزِ تونال،
* همان تمپو و همان نوعِ بافت (آرپژِ ۸ یا ۱۶ نت، اوستیناتو، پدِ کشیده)،
* و مهم‌تر از همه **همان قوسِ پویا**: شروعِ کم‌جان ← افزوده‌شدنِ لایه‌ها ← اوج
  (این همان چیزی است که در «Cornfield Chase» شنیده می‌شود).

یعنی می‌توانی آن را به‌عنوان موسیقیِ جدیدِ هم‌سلیقه گوش بدهی، نه به‌عنوان
بدلِ آهنگ‌هایی که دوست داری.

---

## زمان‌بندیِ پخش (برای پرش بین قطعه‌ها)

| زمان | قطعه | الهام‌بخش |
|---:|---|---|
| `0:00` | 01 — Slow Horizon | Time — Hans Zimmer |
| `1:58` | 02 — Becoming | Divenire — Ludovico Einaudi |
| `3:14` | 03 — First Light | Arrival of the Birds — The Cinematic Orchestra |
| `4:34` | 04 — Seven Candles | Light of the Seven — Ramin Djawadi |
| `6:13` | 05 — Relentless | Lux Aeterna — Clint Mansell |
| `7:44` | 06 — Glass Window | Opening — Philip Glass |
| `8:39` | 07 — Snowfall | Snow — Fabrizio Paterlini |
| `10:11` | 08 — Engines | We Have to Go — Steve Jablonsky |
| `11:21` | 09 — Experience | Experience — Ludovico Einaudi |
| `12:24` | 10 — Earth Prelude | The Earth Prelude — Ludovico Einaudi |
| `13:48` | 11 — Cornfield | Cornfield Chase — Hans Zimmer |
| `15:34` | 12 — Stay | Stay — Hans Zimmer |
| `17:16` | 13 — Mountains | Mountains — Hans Zimmer |
| `18:20` | 14 — November | November — Max Richter |
| `19:50` | 15 — Daylight | On the Nature of Daylight — Max Richter |
| `21:29` | 16 — Written on the Sky | Written on the Sky — Max Richter |

ترکِ اول (Track 0) برای هر قطعه یک **Marker** دارد؛ اکثر پلیرها و DAWها
(Reaper، Logic، Ableton، Cubase، MuseScore، GarageBand) با آن‌ها می‌توانی
مستقیم بپری روی قطعه‌ی موردنظر.

---

## چطور گوشش بدهم؟

۱. **ساده‌ترین راه:** دابل‌کلیک روی فایل — Windows Media Player / QuickTime /
VLC / MuseScore خودشان آن را با سازهای GM پخش می‌کنند.
۲. **صدای بهتر:** یک ساوندفونتِ GM خوب در VLC یا پلیر خودت بار کن
(مثل **FluidR3_GM** یا **GeneralUser GS**).
۳. **صدای عالی (توصیه):** فایل را در یک DAW بریز و ترکِ Piano را به یک
VSTِ پیانو (LABS Piano، Spitfire، Garritan CFX، Pianoteq) و ترک‌های Strings و
Brass را به یک کتابخانه‌ی ارکسترال وصل کن؛ تفاوتش زیاد است چون MIDI فقط
«دستورِ نواختن» است، نه صدا.

---

## ساختارِ فنیِ فایل

* `Track 0` — نقشه‌ی تمپو، مارکرها، امضای میزان و کلیدِ هر قطعه.
* هر قطعه ترک‌های خودش را دارد، مثلاً `01 - Slow Horizon - Piano` و
  `01 - Slow Horizon - Strings`.
* برای این‌که نت‌ها در پلیرها زود قطع نشوند، هر بخش روی یک **کانالِ جدا** است:
  آرپژ / باس / پد / ملودی هر کدام کانالِ خودشان را دارند.
* پیانو در قطعاتِ آرام، پدالِ ساستین (CC64) می‌گیرد.

---

## بازتولید / تغییر دادن

```bash
python3 -m venv .venv-midi
.venv-midi/bin/pip install mido
.venv-midi/bin/python midi/generate_playlist.py
```

همه‌ی محتوا در فایل `midi/generate_playlist.py` و در لیستِ `PLAYLIST` است.
برای شخصی‌سازیِ هر قطعه کافی است در دیکشنری‌اش این‌ها را عوض کنی:

* `tempo` — سرعت،
* `prog` — چرخه‌ی آکوردها (ریشه، نوعِ آکورد، تعداد میزان، نتِ بم)،
* `arp.pattern` — الگوی آرپژ (ایندکس روی نت‌های آکورد؛ بالاتر از ۳ یعنی اکتاوِ بعد)،
* `melody.notes` — ملودی به‌صورت `(نامِ نت, تعداد ضرب)`؛ `None` یعنی سکوت،
* `passes` و `vel_curve` — تعدادِ دورها و منحنیِ بلندشدنِ صدا (همان اوج‌گیری تدریجی)،
* `play` — مشخص می‌کند هر لایه از کدام دور وارد شود (مثلاً ملودی از دورِ دوم).
