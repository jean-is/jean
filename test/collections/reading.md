# A cell that reads: readings over the fields (phase 0d)

The question: can a collection's cell read as its value (€480, 12 Sept, a status as a pill) while staying the native field it is today, by drawing its reading over the field?

**Yes.** With the reading drawn over the field and the field shown only while its cell has the keyboard, the table is the same for assistive technology, for the keys and for the pointer, in Chromium, WebKit and Firefox, in English, Arabic and Japanese, beside a task and at 320 px. Four things have to come with it, each found here: a number's field loses its spinner; the reading is drawn by `cell()` from the row, not copied from the field; a column, not a cell, decides how many decimals its amounts show; and a native reader says where amounts sit in Arabic. VoiceOver and NVDA are owed by hand.

## How it was checked

`node test/collections/reading.js` serves Jean as it is (`scripts/serve.js`, port 4394) with the fake brain (4395), opens it in Playwright 1.64.1's Chromium 156, WebKit 27.2 and Firefox 157, and for each engine and language:

- makes "Autumn fair budget" as a brain would (`table_create`, then `table_change`): 8 rows; Item (text), Category (select), Owner (person), Due (date), Status (status), Estimate and Paid (numbers), Receipt (checkbox); Cakes and tea has no date, Barbecue no Paid. Jean's rows are accepted; later Jean changes four cells of three rows, which wait, tinted.
- runs every check twice in a fresh Jean, once as Jean is and once with the prototype, and compares the two logs; where one page can show both (the tree with all accepted), it is read before and after the prototype in the same page.

**The prototype** is put into the live page; nothing in `app/` changes. For each body cell whose field is a number, a date, a select or a status: `<span class="table-reading" aria-hidden="true" data-kind="…"><bdi>…</bdi></span>` after the field, laid over it (`position: absolute; inset: 0; pointer-events: none`), and the field at `opacity: 0` unless its cell has `:focus-within`. Money is `Intl.NumberFormat(intlLocales(), { style: 'currency', currency: 'EUR', trailingZeroDisplay: 'stripIfInteger' })` for Estimate and Paid, which stand for a column's `format: 'money'`; a date is its day and short month; a choice is its name in a quiet pill; nothing for none. Text fields and checkboxes are left alone. A number's field gains `dir="ltr"`, as the plan asks. Under forced colours the readings go and the fields show.

In English Jean's `en` writes "Sep 12", not "12 Sept"; in Japanese "9月12日"; in Arabic "12 سبتمبر" and "‏480 €".

Three variants: **focus** (the field shows with the keyboard in its cell), **hover** (with the pointer on it too), and **quiet** (no reading: the fields quietened by CSS alone, for the comparison).

Pictures are read back as pixels (a small PNG reader in the script) wherever a style could lie: what is left of a field under its reading, Jean's tint, the focus ring, contrast.

## Verdicts

Each cell is the three languages unless it says otherwise. "Same" means the log with the prototype equals the log without.

| Check | Chromium 156 | WebKit 27.2 | Firefox 157 |
|---|---|---|---|
| 1. What assistive technology gets | **Same.** Playwright's ARIA snapshot of the table; each field's name, type, value and state in the DOM; and Chromium's own accessibility tree over its protocol (432 nodes of the table, by role, name, value, state) | **Same.** ARIA snapshot; DOM; and WebKit's own accessibility properties of each of the 64 fields (role, label, ignored, hidden, invalid, checked…); every reading is ignored | **Same.** ARIA snapshot; DOM; and in Firefox 159.0.1 itself, driven over BiDi, the count of nodes found by the role and name Gecko computes: 8 spinbuttons "Estimate", 8 "Paid", 8 comboboxes "Status", 8 checkboxes "Receipt", 85 cells, 8 row heads, 9 column heads, before and after; none named "€480" or "Sep 12" |
| 2. Keys (71 steps: Tab, Shift+Tab, Escape, arrows, Enter in, Enter to keep and go down, Escape to restore, on a number, a date, a status, a choice, the empty cells, a box, the name) | **Same** at every step: what has the keyboard, what every field holds. The cell with the keyboard always shows its field, no other does | **Same** | **Same** |
| 3. Pointer (18 presses: start, middle and end of a number, an empty number, a date, an empty date, a choice, a status) | **Same** events, same target, in English and Japanese. One press puts the keyboard in the field and shows it, 18 of 18. A status opens its list on the press; a date's picker opens from its glyph only, as today, which the reading hides. In Arabic, see *the spinner* below | **Same** in English and Japanese; 18 of 18. A status opens on the press; a date's picker and a choice's list open after a press anywhere, as today. In Arabic, see *the spinner* | **Same** in English and Japanese. 16 of 18: the two presses on a number's spinner step the value without the keyboard entering the field, as today, so its reading changes and stays. A status opens on the press; a date's picker from its glyph only. In Arabic, see *the spinner* |
| 4. Left of a field under its reading (readings made unseen, each cell's picture) | **Nothing**: 0 px of ink, on a filled and an empty number, date, on a choice and a status. No placeholder, glyph, arrow or spinner | **Nothing** | **Nothing** |
| 5. Forced colours | Readings gone, every field shown | The same (emulated: macOS has no such mode) | The same |
| 6. States | Jean's tint and its corner: same colours. The ring of a selected cell and of its field: same. A refused value: the field shows, its reading goes | **Same** | **Same** |
| 7. Looks (Tilde, Human, Classic, by day and by night; English and Arabic) | Reads in all six. Contrast, measured from pixels: amounts and days 11.7 to 16.6, a pill's words on the pill 7.9 to 12.0. Nothing left of a field in any | The same: 11.7 to 16.6, pills 8.2 to 12.8 | The same: 11.7 to 16.6, pills 8.5 to 12.8 |
| 8. Text | A copied row holds no more than today (nothing of the table: `user-select: none`). `window.find` finds the readings' words. Print never lays the pane out | The same | The same; today `window.find` finds nothing in the table, with readings it finds what they say |
| 9. Pointer passing (11 cells crossed) | Hover: a cell turns into its field at 11 of 11 steps, about 680 px change each. Focus only: 0 of 11, 0 px | Hover: 11 of 11, about 740 px. Focus only: 0 | Hover: 11 of 11, about 660 px. Focus only: 0 |
| 10. Right to left (Arabic) | Readings mirror; `Intl` writes "‏480 €" and "‏‎-60 €" with its own marks, drawn "€ 480" and "€ -60": figures left to right, the minus on their left. Each reading is drawn as its words are alone on a page | The same | The same |
| 320 px | Same tree; no reading cut or outside its cell; one press on a reading puts the keyboard in its field | The same | The same |
| Readings in step | 40 readings, 0 wrong: at first, after the 71 keys, after Jean's changes, after the rows are turned upside down, under Search and back | The same | The same |

## What each check found

**1. Assistive technology.** `aria-hidden` on the reading and `opacity` on the field change nothing any of the three engines exposes: opacity does not hide from the accessibility tree, and the reading never enters it. Playwright's snapshot is its own computation in the page, the same code in every engine, so each engine was also asked itself: Chromium over `Accessibility.getFullAXTree`; WebKit over its inspector's `DOM.getAccessibilityPropertiesForNode`, reached through Playwright's internals; Firefox's Juggler build gives no tree any more, so the installed Firefox was driven over BiDi, whose `accessibility` locator finds nodes by Gecko's computed role and name.

**2. Keys.** Nothing in `keys()`, `into()`, `go()` or the focus selectors sees the reading: it holds no field, takes no focus, and `pointer-events: none` keeps it out of `@click`'s `matches(CELL)`.

**3. Pointer.** The reading takes no press: the field under it is what `elementFromPoint` gives at every point tried, and the events are the same, in the same order, on the same target.

- *A select's list:* a status opens on the first press in the three engines, as today.
- *A date's picker:* in WebKit a press anywhere on the field opens it, as today. In Chromium and Firefox only the glyph at the field's end opens it, as today; a press elsewhere puts the keyboard in the day, month or year under the pointer. The press is the same, but the glyph is now unseen until the field shows: a person who aims at "12 Sept" gets the field, then presses its glyph. **So it takes two presses where today one on the glyph did**, unless the first lands on the cell's end. `showPicker()` on a press that brings the keyboard into a date's field would make the three engines agree; not tried here.
- *The spinner:* a press at the end of a number's reading lands on the spinner under it and steps the amount by one: 650 became 649 in Chromium, 651 in WebKit and Firefox, and the empty Paid became −1 (1 in Firefox). In Chromium and WebKit the field then shows; **in Firefox the keyboard never enters the field, so "€650" silently turns into "€651"**. Today the same press does the same, but on a spinner one sees. With `appearance: textfield` (and `::-webkit-inner-spin-button { display: none }`) the same press changes nothing and puts the keyboard in the field, in the three engines; the arrows still step a number that has the keyboard.
- *In Arabic:* the plan's `dir="ltr"` on a number's field moves its spinner from the cell's end to its start, in the three engines, so the press that steps is the one at the start. It is the only difference between the two logs in any engine or language, and it goes with the spinner.

**4. Left to see.** `opacity: 0` on the whole field hides all its parts at once; nothing has to be styled part by part, which is where engines differ. Without the prototype the same cells hold 150 to 540 px of ink.

**5. Forced colours.** `@media (forced-colors: active)` drops the readings and the rule that hides the fields; the fields are as today.

**6. States.**

- The tint and its corner are the cell's ground, under the reading: same colours with and without (`#d5cbaa` beside `#e3ddca`, corner `#755900` in Tilde by day).
- A selected cell has `:focus-within`, so its field shows and the ring is the one drawn today (`#896a01`), on the cell then on the field.
- A refused value: no column under a reading refuses one today (a number's field refuses letters by itself, a select adds what is typed). Marked by hand on a number's field, `aria-invalid="true"` makes the field show and the reading go, by the prototype's rule. With an Email column added and "nope" written in it, the cell is as today, since text has no reading.
- **Found on the way, not the readings':** the line under a refused field never shows. `.table-view .table-grid :is(td, th) > [aria-invalid='true']` (tables.css:40) loses to the field's own `border: 1px solid transparent` (tables.css:36), which is more specific: its colour computes to transparent in the three engines. The words under the field show.

**7. Looks.** No look restyles what the reading uses (the cell's ink, `currentColor` at 12% for the pill). The pill against its cell is 1.3 to 1.4 to 1: it is a shape around words, not a control, and its words carry it.

**8. Text.**

- *Copy:* the table's text can't be selected today, and a field's value is no text. Select all then Copy holds none of the 22 amounts and days read, as it holds none of the fields' values today. Were readings selectable, a copied row would be "Venue Sep 25 Paid €649 €200": the cells with a reading and not the others. Left unselectable.
- *Find:* by `window.find`, the nearest a script gets to the browser's own Find: "€300", "Sep 19" and "To do" are found with readings and not without. A field's own value is found as today in Chromium and WebKit ("300" in the Estimate field, a row's name), and not in Firefox, with or without. The browser's own Find is owed by hand: in Chromium it searches fields' values too, so "300" may count twice in one cell.
- *Print:* the pane is `display: none` in print (dock.css:80). Jean's own Print draws a sheet from the rows (`collectionWays().print`), with no field and no reading: the money there is the plan's own line (`export.js`, `made/formats.js`).

**9. The pointer passing.** With fields on hover, every cell the pointer crosses changes what it says and how: "€340" becomes "340" with a spinner, "Sep 13" becomes "13/09/2026" with a glyph, a pill becomes a select. That is 11 swaps in 11 steps and 660 to 740 px of the table repainted each time, against none. A touch screen has no hover at all, so the two would differ by device. The one thing hover buys is the date's glyph in view before the press (check 3).

**10. Right to left.** The reading keeps the table's direction, so an amount sits at the cell's end (the left) and a day or a pill at its start; the words inside are a `<bdi>`, so each takes its own direction and nothing around it moves a sign. `Intl` gives Arabic its marks (U+200F before the amount, U+200E before the minus) and Latin digits, in the three engines. A number's field, written left to right, sits at the same edge as its reading (`:dir(rtl)` on its cell turns `text-align: end` into `start`).

## Limits

1. **The spinner must go** from a number's field (check 3), or a press at a reading's end changes the amount, unseen in Firefox.
2. **A date takes two presses to reach its picker** in Chromium and Firefox, unless `showPicker()` is called (check 3).
3. **The reading and the field don't speak alike.** The reading is Jean's language; the field is the browser's. In an English Jean on this Mac, "€60.50" becomes "60,5" and "Sep 25" becomes "25/09/2026" in Chromium as the cell takes the keyboard ("60.5" and "09/25/2026" in WebKit and Firefox). It is so today for the field; the reading makes it a change one sees.
4. **Decimals are a column's matter.** With `stripIfInteger` cell by cell, "€480" and "€60.50" end at the same edge and their units don't line up. Either every amount of a column shows the currency's decimals, or none does when none has any.
5. **In Arabic, amounts at the cell's end line up their €, not their units.** `Intl` writes the currency after the number, drawn on its left: "€ 480" over "€ 1,234.50", ragged on the right. At the cell's start (the right) the units would line up. For the native reader of phase 0e.
6. **A row's Accept and Reject cover the end of the cell under them** as the table scrolls, and the end is where an amount's last figures now are: "€300" reads "€30" (`webkit-en-waiting-focus.png`, the three rows Jean changed). Today the field's figures are at its start, and what is covered is empty. A number cut short reads as another number: the cell under Accept and Reject needs its amount clear of them, or a ground that says something is over it. The plan's `scroll-padding` sees to the keyboard only.
7. **A day and its month say no year.** "12 Sept" is read the same for 2026 and 2027; `said()` (export.js:39) writes the year on a board's card. One of the two for both.
8. **Two elements more for each reading** (the span and its `<bdi>`), and `:has()` in the cell's rules: 80 elements for this table's 40 readings. Phase 0c's sizes are to be measured with them. A class on the cell, which `grid()` can give, spares the `:has()`.
9. **What a screen reader says is not what is read.** It says the field: "480", not "€480"; the plan's currency in the field's description covers it. Without the keyboard in the field (VoiceOver's cursor, NVDA's browse mode), its box is around a field one can't see, over the reading.
10. **Found on the way in WebKit, with or without readings:**
    - an empty date shows today's date in the cell's own ink (11/14/2026 on 14 November), since the field's colour is inherited; with readings an empty date shows nothing, with the fields quietened by CSS it still shows today;
    - a date's field that held a day then none, as rows are sorted, is `invalid` for WebKit's accessibility from then on, though its `validity` says valid.
11. **Headless Firefox keeps a date's picker open** once its field loses the keyboard (Escape, which Jean handles, or a press elsewhere), over the rows under it. The script closes it by its glyph. To see by hand in Firefox itself.

## The three ways

| | Readings over fields | Fields quietened by CSS alone | A cell that is text until entered |
|---|---|---|---|
| €480, 12 Sept in Jean's language | Yes | No: a field shows the bare number as the browser writes it (60,5 in Chromium on this Mac) and the date in the browser's order (25/09/2026, 09/25/2026) | Yes |
| A date's glyph, a number's spinner out of the way | Yes, with the whole field | The spinner, yes. The glyph in Chromium only: Firefox's can't be styled, WebKit has none | Yes |
| A status as a pill | Yes | Yes (`appearance: none` on the select), in the three engines | Yes |
| Nothing for an empty date | Yes | No: CSS can't tell an empty date; Chromium and Firefox show the date's mask (dd/mm/yyyy), WebKit today's date | Yes |
| Assistive technology, keys, pointer | As today, measured | As today | Rewritten: `cell()`, `keys()`, `into()`, `go()`; a grid for screen readers |
| Today's tests | Pass as they are: 42 of `test/tables.spec.js`'s 43, one skipped, with the readings as without (*The spec's run*) | Unchanged | 41 lines of `test/tables.spec.js` reach a cell through its field (`getByTitle`…), and more in documents, together and whiteboards |
| Lines | about 18 | about 6 | the plan counted it out |

**Recommendation: readings over fields, the field shown with the keyboard only.** It gives the picture the plan wants, and every path measured here is today's. Fields on hover are not worth their flicker: a date's `showPicker()` gives what they would. CSS alone can't write money or a month, and leaves WebKit's empty dates saying today. Text until entered draws the same picture for a rewrite of what works.

With it:

- no spinner in a number's field;
- the reading drawn by `cell()` from the row's value, as the field is, so the two can't part (the prototype copies the field and has to watch for redraws);
- `user-select: none` kept on the reading; `aria-hidden`; no `title`;
- the rule that shows the field when it is `aria-invalid`, for the day a number refuses a value;
- under forced colours, the fields.

## The spec's run

Today's `test/tables.spec.js`, 43 tests (24 in Chromium, 19 in WebKit), was run from a copy in the scratchpad, its imports pointed at the repository and the fake brain at port 4395, against Jean on 4394:

- as Jean is: 42 passed, 1 skipped (one WebKit skips by itself);
- with the readings drawn in every page before Jean's own scripts run (the same style sheet; each kind read from the page, since Jean's modules aren't there yet): **42 passed, 1 skipped**. In 31 of the 42 the page held readings over its fields, up to 48 at once.

So no line of that spec changes for the readings. What T5 adds is a test of their own: shown and unseen, the keyboard in and out, forced colours, Arabic.

Not run: the other specs that reach a collection's cells (documents, together, whiteboards, people), which need servers on other ports.

## Lines, for the real thing

- `view.js`, about 9: a `reading()` of two lines (the span, `aria-hidden`, its `<bdi>`); one more expression in each of `cell()`'s number and date and `choice()`'s status and select; `dir="ltr"` on the number; the day and month's format; a class on the cell if `:has()` is to be spared.
- `tables.css`, about 9, as the file packs them: the cell's `position: relative`; the reading's box; the amount's end and figures of one width; the pill; the number's field without a spinner, at its end, turned in `:dir(rtl)`; the field unseen unless `:focus-within` or invalid; forced colours.

Money itself (`format`, `currency`, `said()`) is the plan's other line and not counted.

The rules as tried, with the spinner gone (`[data-reading]` and the checks' own rules left out):

```css
.table-grid tbody :is(td, th):has(> .table-reading) { position: relative; }
.table-reading { position: absolute; inset: 0; display: flex; align-items: center; padding: 0.3rem 0.6rem; border: 1px solid transparent; overflow: hidden; white-space: nowrap; pointer-events: none; }
.table-reading > bdi { overflow: hidden; text-overflow: ellipsis; }
.table-reading[data-kind='number'] { justify-content: flex-end; font-variant-numeric: tabular-nums; }
.table-reading[data-kind='choice'] > bdi:not(:empty) { padding: 0.1rem 0.6rem; border-radius: 999px; background: color-mix(in oklab, currentColor 12%, transparent); font-size: 0.85rem; }
.table-grid tbody td > input[type='number'] { appearance: textfield; text-align: end; font-variant-numeric: tabular-nums; }
.table-grid tbody td > input[type='number']::-webkit-inner-spin-button { display: none; }
.table-grid tbody td:dir(rtl) > input[type='number'] { text-align: start; }
@media not (forced-colors: active) {
  .table-grid tbody :is(td, th):has(> .table-reading) > :is(input, select) { opacity: 0; }
  .table-grid tbody :is(td, th):is(:focus-within, :has(> [aria-invalid='true'])) > :is(input, select) { opacity: 1; }
  .table-grid tbody :is(td, th):is(:focus-within, :has(> [aria-invalid='true'])) > .table-reading { display: none; }
}
@media (forced-colors: active) { .table-reading { display: none; } }
```

`text-align: match-parent` would have spared the `:dir(rtl)` rule; it left the figure at the field's start in Chromium 156.

## By hand: VoiceOver, then NVDA

```
node test/collections/reading.js --headed --hold                    # Chromium, in English
node test/collections/reading.js --headed --hold --engine webkit    # Playwright's WebKit
node test/collections/reading.js --headed --hold --lang ar          # in Arabic
```

A window opens on Jean; within ten seconds the fake brain has made the collection, its rows are accepted, four cells wait tinted, and the readings are on. In the terminal, `off`, `focus`, `hover` or `quiet` then Enter switches; `q` then Enter, or closing the window, ends and stops both servers.

With VoiceOver (⌘F5):

1. VO-U, Tables, "Autumn fair budget". VO-→ along the second row. Each cell should say what it says after `off`: the column's name, the kind of field, its value ("Estimate, 650…"), and never "€650".
2. Tab from the table's name through the first row. Each field should appear as it takes the keyboard, and the reading come back as it leaves.
3. On a selected cell (the arrows), VO-Space or Enter goes into the field, as after `off`.
4. On Status, VO-Space opens the list. On Due, the picker.
5. VO-U, Form controls: the same list of fields as after `off`.
6. On the third row's Due (empty), and again after sorting by Due from its head's menu: does VoiceOver say it is invalid?
7. `--lang ar`: the same, and the order VoiceOver reads a row in.

For Safari itself, and for NVDA on Windows (Firefox and Chrome), which this script can't drive: `--hold` writes `reading-snippet.js` in its `--out` folder. Open Jean there (while `--hold` runs it is at http://127.0.0.1:4394/, or any Jean), open a collection, and paste the snippet in the browser's console: it draws the readings over that collection, every number column as money. With NVDA: the arrows in browse mode along a row, then Tab, then Enter on a field for focus mode; the same words as without.

## Pictures

`--out <folder>` is where they go; this run's are in the session's scratchpad, `reading/`, 372 of them, named by engine, language, what they show, and `before` or `focus` (with the readings; `hover` for that variant), most also as `…-start.png` for the table's first columns:

- `accepted` and `waiting`: the two states, before and with the readings; `amounts`: with a negative and a large amount written;
- `field-with-the-keys`, `field-without-spinner`: a number's field among the readings;
- `quiet-css-alone`: the fields quietened by CSS, no reading; `forced-colours`;
- `look-<tilde|human|classic>-<light|dark>`; `320-status`, `320-amounts`; `refused`;
- `hover-pointer-on-row-4` and `focus-pointer-on-row-4`: the pointer on a cell, in each variant;
- `results-<engine>-<language>.json`: every log.

## Not checked

- VoiceOver and NVDA: nothing here listens. Owed by hand, as above.
- Safari itself, and Firefox itself beyond its accessibility by role and name: the engines are Playwright's builds.
- Windows: its forced colours for real (emulated here), its number and date fields.
- A touch screen: a tap on a reading (the rule for hover is under `(hover: hover)`).
- The browser's own Find and its own Print.
- A row dragged by its handle with readings in its picture.
- The cost at 3,000 rows: phase 0c's.
- The other nine looks, and `prefers-contrast`.
- A Formula, a relation, a multi-select: no reading here. A relation is a select and would take a pill.
