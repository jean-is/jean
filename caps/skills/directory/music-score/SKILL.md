---
name: music-score
description: "Write music as a score the user can see and play, in ABC notation: a melody, a tune, a song's chords, an exercise or a transcription, when the user asks for sheet music, notes to play or a tune."
metadata:
  format: "1"
  blocks: abc
---
# Music score

Write music in ABC notation in a fenced code block tagged `abc`. It is drawn as a score where the block is, with a button to play it, each note lit as it sounds.

```abc
X:1
T:The Legacy Jig
M:6/8
L:1/8
Q:3/8=116
R:jig
K:G
GFG BAB | gfg d2B | GFG BAB | d2B G2B |
GFG BAB | gfg d2B | c2c B2A | GFG B2G :|
```

## Steps

1. The header, one field a line, in this order:
   - `X:1`, then `T:` the title, in the user's language unless the piece is known by its own;
   - `C:` the composer, when known;
   - `M:` the metre (`4/4`, `3/4`, `6/8`, `C`), and `L:` the length of a plain note, usually `1/8`;
   - `Q:` the tempo, such as `Q:1/4=100`;
   - `K:` the key, always last (`G`, `Dm`, `Bb`, `Ador`).
2. Notes: `C D E F G A B` from middle C up, `c d e f g a b` the octave above, `c'` higher still and `C,` lower. A number after a note changes its length (`A2`, `A3/2`, `A/2`). `^` sharpens a note, `_` flattens it and `=` makes it natural. `z` is a rest.
3. Bars: `|` between them, `|:` and `:|` around a repeat, `[1` and `[2` for first and second endings, `|]` at the end. Check that every bar adds up to the metre.
4. Chords: their names in quotes before a note (`"Am"A2`), notes sounding together in square brackets (`[CEG]`). Lyrics go on a `w:` line under the music they're sung to, a syllable a note, a word's syllables joined by `-`.
5. A melody with a bass, or several voices: `V:1` and `V:2 clef=bass` in the header, then each voice's music after its own `V:` line.
6. One tune a block; for several, several blocks. Compose, or write out music in the public domain; of a song still under copyright, give the chords or a short phrase, not the whole melody.
7. After the block, say in a sentence what the music is and how to play it.
