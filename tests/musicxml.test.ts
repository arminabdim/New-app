import { describe, expect, it } from 'vitest';
import { parseMusicXml } from '../src/core/musicxml';

const XML = `<?xml version="1.0"?>
<score-partwise version="3.1">
  <movement-title>Test Song</movement-title>
  <part-list><score-part id="P1"><part-name>M</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>2</divisions>
        <key><fifths>1</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
      </attributes>
      <note><pitch><step>C</step><octave>5</octave></pitch><duration>2</duration>
        <lyric><syllabic>begin</syllabic><text>hel</text></lyric></note>
      <note><pitch><step>F</step><alter>1</alter><octave>5</octave></pitch><duration>2</duration>
        <lyric><syllabic>end</syllabic><text>lo</text></lyric></note>
      <note><pitch><step>F</step><octave>5</octave></pitch><duration>4</duration></note>
    </measure>
  </part>
</score-partwise>`;

describe('MusicXML parser', () => {
  it('parses pitches, durations, key and lyrics', () => {
    const p = parseMusicXml(XML);
    expect(p.title).toBe('Test Song');
    expect(p.keyFifths).toBe(1);
    expect(p.notes.map((n) => n.midi)).toEqual([72, 78, 78]); // accidental persists in the measure
    expect(p.notes[0].dur).toBe(1);
    expect(p.notes[2].dur).toBe(2);
    expect(p.notes[0].lyric).toBe('hel-');
    expect(p.notes[1].lyric).toBe('lo');
    // F in measure after explicit F# falls back to key sig (F# in G major)
    expect(p.notes[2].midi).toBe(78);
  });
});
