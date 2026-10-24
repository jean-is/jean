# Designs, phase 0: what the spike found

The spike before building Designs, take 8 of the canvas "Designs proposal" (24 October 2026): the
checks behind the mark, the file, what every brain this Mac reaches gives, whether the file draws what
the view drew, two to a sheet, and the nine faces. The pure modules are `spikes/designs/` (`checks.js`,
`format.js`, `tool.js`, `view.js`), never shipped, tested in `test/designs.test.js`. The brains are
measured by `scripts/designs.js` on `test/designs/` (results in [results.md](results.md)), the drawing by
`scripts/designs-render.js`, the faces by `scripts/designs-faces.js` with `designs-faces.py` (fontTools,
in a Python of its own; nothing of it ships).

## What changes in take 8

1. **The brain's tool keeps wording B, gains a list (`words.items`), and no gate.** Of three wordings
   measured on this device's class of brain, B was best (below). A menu, a programme or what's for sale
   needs a list: without one, small brains dropped the dishes.
2. **Jean's repairs count for more than the wording.** Two found here, a list under a name of the brain's
   own (`dishes`) and a date given only in ISO 8601 (written into `when` as the language writes a date),
   took Gemma 4 E2B from 45% to 69% right with the same replies.
3. **The mark keeps the weekday and the gap, and drops "past".** Every design that kept the person's
   wrong weekday got its mark, 70 of 70 across the brains. "Past" raised 58 marks over nine runs and not
   one was due: a lost cat and a certificate hold dates gone by that aren't events.
4. **A gap's mark offers Remove as readily as Fill.** Small brains write gaps a design doesn't need
   ([Date and Time] on a menu) far more often than the one it does (a lost cat's phone number).
5. **A brain may say it made a design without calling design**: Nemotron 3.5 Bolt E4B in 11 of 64
   replies, and Gemma 4 E4B's GGUF build in 23. Jean can't take a reply's word for it: where the server
   can hold a reply to a schema, the first reply to a request Intuition takes for a design is held to
   design's, as `--strict` does here.
6. **The file holds: an SVG with its JSON in `<metadata>`, the same JSON in the PNG.** Lines measured
   from the view and written as SVG text draw the same in Chromium and within a pixel in WebKit;
   `textLength` holds a left-to-right line to the view's width, and must not be used on Arabic.
7. **Paper works from Chromium:** two A5s to an A4 sheet and four A6s to one, one page each, at the exact
   size, the words as text and every face embedded.
8. **The faces: Calm is Inter, not Source Sans 3; no Cyrillic or Greek Extended; 586 KB.** Each voice is
   offered in a language only where its face has every letter, and falls back Handwritten → Friendly →
   Calm, Calm having them all.

## The checks behind the mark

`checks.js` reads a part's words for dates in the design's language with Intl alone: the weekday and
month names Intl writes (format and standalone forms, long and short, Russian and Polish genitives,
Arabic's three sets of month names: Egypt's and the Gulf's, the Maghreb's, the Levant's), Arabic-Indic,
Persian and full-width digits, Japanese and Chinese 月 and 日, Korean 월 and 일, a day before or after its
month (14 November, November 14, 14 de noviembre, 14. November, ngày 14 tháng 11), a year after it, and a
weekday beside it (a short one only right by the date, a Japanese one only in brackets, (木)). Folding
(lower case, no accents or tashkeel, one alef) keeps every offset, so a fix rewrites only the weekday, in
its own form and case: "Thursday 14 November" → "Saturday 14 November", "Jeudi" → "Samedi",
"（木）" → "（土）", "الخميس" → "السبت". A date written without its year is this year's unless it was
more than 60 days ago.

The other checks: a gap ([Time], ［電話番号］); a small print's date after the event's; words fainter than
WCAG AA on their ground (3:1 from 18 pt, or 14 pt bold); a picture under 200 dpi at its printed width;
words within 5 mm of a paper size's edge. All are tested in eight languages, and run on every brain's
designs below.

**"Past" is dropped.** An event already past is rare in a design someone is making, and the dates that
are past in this set aren't events: a cat lost on 20 October, a swim on 18 October. Tying the check to
the event's ISO date, which the brain gives "if it announces one", didn't help: brains give one for the
lost cat and the certificate too. The weekday check, which catches the slip people do make, stays.

## The file

`format.js` writes a design as one SVG: `viewBox` in tenths of a millimetre on paper (A5 is 1480 × 2100)
or pixels on a screen; in `<metadata>`, an XMP packet (D324) and the design as JSON in an element of its
own namespace, `urn:design-file:1`, which names no brand; then the ground, pictures (`<image>` with the
picture's words as its `<title>`), shapes, and each text part as the lines the view laid out. Jean
reads back the JSON alone, with `JSON.parse`, never the markup, so Trusted Types needs no policy and a
drawing another program rewrote is never read as Jean's; any other SVG, or a format to come, reads as
no design. The PNG carries the same JSON in an iTXt chunk (keyword `design`) beside Jean's XMP, so a
picture sent back opens editable. Round trips are tested, with `<`, `&` and U+202F in the words.

## Lines and pictures

`designs-render.js` lays out Léa's invitation in eight languages (English, French, Arabic, Japanese,
Vietnamese, Russian, Yoruba, Hausa) as take 1 and, in English and Arabic, take 3, in the Friendly and Calm
voices; measures each text part's lines from the view (grapheme by grapheme, grouped by the top of their
boxes; the baseline from the box and the face's ascent); writes the SVG with the faces embedded; draws
it as a picture and as a PNG through a canvas at twice the size, as Jean's export does; and compares
each with the view where either has ink, a pixel differing when a channel is more than 48 apart.

| Engine | Lines measured | SVG lines' width against the view's | Ink differing, take 1 | Ink differing, take 3 | Canvas tainted |
|---|---|---|---:|---:|---|
| Chromium | every line, every language | the same (0 px) | 2.1–3.2% | 4.7–5.1% | never |
| WebKit | every line, every language | 2–3 px apart, 6 px in Japanese | 3.7–8.4% | 7.7–14.8% | never |
| Firefox | — | — | — | — | Playwright's Firefox doesn't launch on this Mac |

What differs in Chromium is the edges of glyphs and of the picture; in WebKit, a steady sub-pixel offset
and its own anti-aliasing of SVG text. Seen side by side the two are the same design: no line breaks
differently, nothing moves. Holding each line to the view's width with `textLength` (`lengthAdjust:
spacing`) cut WebKit's differences by a third to a half; a half-pixel nudge helped one take and not the
other, so no nudge. **But WebKit spaces Arabic glyph by glyph to fit `textLength`, which breaks its
joining** (40% and 58% of the ink differing, the words in pieces): `textLength` goes on left-to-right
lines alone. Arabic, Japanese, Vietnamese, Yoruba's stacked marks and Hausa's letters come out right in
both engines. Japanese breaks at phrases in Chromium (`word-break: auto-phrase`) and by character in
WebKit, which has no phrases yet; the lines are measured from each engine, so each SVG follows its own.

## Paper

From Chromium, `@page { size: A4 landscape; margin: 0 }` and two A5 views (148 mm wide, sized in container
units, so everything follows) print as one page of 297 × 210 mm; four A6s on A4 portrait as one of
210 × 297 mm. pdf.js reads back the words as text, and the six faces the page uses all embedded (78 KB
and 80 KB). A6 had to be 104 mm wide, not 105: two rows of 148.6 mm don't fit 297 mm. Safari's and
Firefox's print, and a phone's, can't be driven from Playwright: the roadmap's checklist gets them.

## The faces

`designs-faces.js` fetches each family as Google Fonts serves it, variable and split by script, reads its
licence in google/fonts, and has fontTools rename it to its voice and check it.

| Voice | Family | Reserved names | KB, as recommended | Lacks |
|---|---|---|---:|---|
| Friendly | Nunito, Rubik for Arabic and Hebrew | none | 106.1 + 40.8 | Hausa's Ƙ ƙ; Greek |
| Elegant | Playfair Display, Markazi Text, Frank Ruhl Libre | "Playfair Display" | 87.6 + 40.3 + 18.4 | Yoruba's Ṣ ṣ; Hausa's Ɓ Ɗ Ƙ Ƴ; Greek |
| Bold | Oswald, Lalezar for Arabic | none | 56.9 + 29.3 | Yoruba's Ṣ ṣ; Hausa's Ɓ Ɗ Ƙ Ƴ; Greek |
| Calm | **Inter** | none | 177.8 | nothing |
| Handwritten | Patrick Hand | none | 28.8 | Yoruba's Ṣ ṣ; Hausa; Cyrillic; Greek |
| **All** | | | **586.1** | |

- **Source Sans 3, the Fonts board's Calm, reserves "Source" and lacks Hausa's Ƙ ƙ Ƴ ƴ.** Of fourteen
  open families checked for Hausa, only Andika (SIL's literacy face: no Greek, reserves "Andika" and
  "SIL", two static weights), Inter, Noto Sans and EB Garamond have every letter. Inter has them all,
  Greek and Cyrillic too, reserves no name, and is variable. Calm is the fallback of every other voice,
  so with Inter no letter of Jean's Latin, Cyrillic or Greek languages falls to the device's face.
- **Yoruba's dotted vowels are in a family's Vietnamese file, not its Latin ones** (Ẹ ọ are U+1Exx): a
  Yoruba design needs the Vietnamese file too, which `unicode-range` fetches by itself.
- **No Cyrillic Extended or Greek Extended**: none of Jean's languages needs them (Ukrainian's Ґ Є І Ї
  are in Cyrillic). That took 60 KB off the board's 599, which was over its own 600.
- **Every face is renamed to its voice**, as D34 did with Gentium: required for Playfair Display and
  Source Sans 3, harmless for the others (−132 to +104 bytes a file).
- **Arabic and Hebrew**: Rubik, Markazi Text and Lalezar have `init`, `medi`, `fina`, `rlig` and mark
  positioning, and join correctly in Chromium and WebKit; Frank Ruhl Libre and Rubik shape Hebrew.
- **A voice is offered in a language only where its face has every letter** (`designs-faces.py`
  checks each Latin, Cyrillic and Greek language Jean has): in Greek, only Calm; in Hausa, Calm; in
  Yoruba, Friendly and Calm; in Russian, Ukrainian and Bulgarian, all but Handwritten. Each voice's
  stack falls back to Calm (Handwritten first to Friendly), so a letter missing still has a face of
  Jean's, and a shared file (Rubik) is declared under each voice that uses it.

## The brains

`npm run designs` asks 8 requests in 8 languages (English, French, Arabic, Japanese, Spanish, German,
Russian, Vietnamese): a birthday invitation; a housewarming on "Thursday 14 November", a Saturday in 2026;
a lost cat with no phone number given; a bake sale's square post; a wedding menu with no date; a
certificate; a save-the-date; a garage sale. A design is right when it keeps every fact as its language
writes it, makes up no phone number, time, date or price the request didn't give, has a right size and
the request's script, and gets the right marks: the wrong weekday marked, a gap for the lost cat's phone.
Every brain this Mac reaches through LM Studio's MLX builds and Claude Code's plan, one run each:

| Brain | Right | Called design | Facts kept | Nothing made up | Kept "Thursday", marked | Lost cat's gap | Needless gaps a design | Repaired |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Claude Haiku, through the plan | 97% | 98% | 100% | 100% | 7/7 | 8/8 | 0.35 | 0 |
| Qwen 3.8 27B Splash (MLX) | 92% | 100% | 99% | 100% | 8/8 | 6/8 | 0.29 | 6 |
| Qwen 3.5 4B (MLX, 8-bit) | 84% | 98% | 98% | 97% | 6/8 | 6/8 | 0.84 | 3 |
| gpt-oss-20b | 77% | 100% | 95% | 88% | 7/8 | 8/8 | 0.52 | 17 |
| Gemma 4 E2B, wording B (as tool.js holds) | 69% | 98% | 93% | 100% | 8/8 | 2/8 | 0.69 | 19 |
| Gemma 4 E2B, held to the schema | 64% | 100% | 92% | 98% | 7/8 | 8/8 | 1.46 | 10 |
| Gemma 4 E2B, wording A | 64% | 100% | 92% | 100% | 8/8 | 0/8 | 0.88 | 4 |
| Gemma 4 E2B, wording C | 63% | 98% | 92% | 100% | 8/8 | 1/8 | 0.80 | 12 |
| Nemotron 3.5 Bolt E4B (MLX, 4-bit) | 48% | 69% | 93% | 100% | 6/6 | 6/7 | 0.83 | 1 |
| Qwen 3.5 2B (MLX, 8-bit) | 41% | 97% | 79% | 92% | 5/8 | 4/8 | 0.39 | 6 |

"Kept 'Thursday', marked" counts the housewarming designs made: how many kept the person's weekday, and
of those, how many Jean marked (all of them). The others had changed it to Saturday without a word,
which loses the person's fact; the tool asks for facts "as the user gave them" for that reason.

- **Strong brains need almost nothing from Jean.** Haiku is right 97% of the time with no repair, and the
  Splash Qwen 92%, with Arabic, Japanese, Spanish, German and French all right.
- **The small brains' misses are mostly words left out, not words made up.** They drop an age ("Léa's
  7th" becomes "Birthday Invitation"), the person to reply to, or a list. Gemma 4 E2B wrote Spanish and
  German invitations with English titles and dates. Only gpt-oss-20b (5 dates on a menu, 3 phone
  numbers) and Qwen 3.5 2B (5 phone numbers, 3 times) made facts up.
- **Jean's repairs carry the small brains:** gpt-oss-20b and Gemma 4 E2B gave the date only in ISO
  8601 in 17 and 11 designs, and Gemma 4 E2B put the menu's dishes under `dishes` in 8.
- **Wordings A, B and C are within one run's noise on Gemma 4 E2B** once its replies are repaired (63 to
  69%). B makes the fewest needless gaps of the three, so it stays.
- **Held to the schema, Gemma 4 E2B writes the lost cat's gap every time but twice as many needless ones,**
  and isn't better overall (64%). Holding is for a brain that doesn't call the tool, not one that does.
- **Languages differ by brain:** Nemotron is right on 13% of its Arabic and Vietnamese designs, Gemma 4
  E2B on 50% of its English, while the Splash Qwen is right on every Arabic and Japanese one.
- **Set aside at the owner's word, 24 October:** LM Studio's GGUF builds (Gemma 4 E4B 34%, Gemma 4 26B
  A4B 92%, Ministral 3 3B 50%; their replies are in `.cache/gguf/`), and Claude Sonnet and the other two
  Splash models, not run.

## Not done here

- **Jean's own device runtime** (Gemma 4 E2B through `brain-worker.js`, 3.1 GB of weights not on this
  Mac): LM Studio's Gemma 4 E2B stood in for it, as it did for Tables, where the two scored close
  (36% and 44%). Brains through an API key (OpenAI, Gemini, OpenRouter): no key here.
- **Two computers merging a design part by part** was on the canvas's list for phase 0 but not this
  spike's; the format gives each part its time (`at`) for it.
- **Firefox**, Safari's and phones' printing, and a real person picking among three takes.
