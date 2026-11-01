# RGAA 4.1.2 audit of jean.is

Internal audit by Warehouse SAS, 1 November 2026. An AI, Claude by Anthropic, made the tests and the first judgments. Three separate AI readers, given none of those judgments, then judged 71 of the criteria again on a frozen copy, and the owner adopted their verdicts. No person has checked the judgments or tested with a screen reader. Tested: Working tree of 1 November 2026, HEAD 0e3ea3f4 plus uncommitted work, frozen to a copy before testing.

## Result

**46 of 88 applicable criteria met: 52.3%, which is partially conformant.** 39 not met, 3 not verified and counted as not met, 18 not applicable, out of 106.

Of the 46 met, 27 rest on the first judgments and 19 on the second read. If 3 of the met were wrong, the rate would fall under 50% and the status would be “not conformant”. Had only the readers’ high-confidence “not met” counted, it would be 65 of 88, 73.9%. The grid is [rgaa-audit-2026-11.xlsx](rgaa-audit-2026-11.xlsx).

## How it was counted

For each of the 71 criteria the readers judged, their verdict replaces the first, including 4.1 and 4.2 as not applicable and 12.10 and 13.7 as applicable and met. The other 35 keep the first judgments. Two were judged on the current tree after the readers finished, by the session that ran them: 6.2, since a heading’s link lost the name the reader saw, and 10.7, since the frame around a document’s text that the reader passed is gone. A flowchart, a map and an answer with sources were added to the sample as gaps the readers judged, and marked NW on the criteria they weren’t walked for. No reader’s “not met” went back to met: every failure each cites is still in the tree, though N34 and N54 cite a broken {count} that has been fixed and N35 cites a lock placeholder that has gone. No defect was fixed in this pass.

| Theme | Met | Not met | Not verified | Not applicable |
|---|---|---|---|---|
| 1. Images | 3 | 2 | 0 | 4 |
| 2. Frames | 2 | 0 | 0 | 0 |
| 3. Colours | 0 | 3 | 0 | 0 |
| 4. Multimedia | 3 | 2 | 1 | 7 |
| 5. Tables | 3 | 1 | 0 | 4 |
| 6. Links | 0 | 2 | 0 | 0 |
| 7. Scripts | 1 | 3 | 1 | 0 |
| 8. Mandatory elements | 7 | 3 | 0 | 0 |
| 9. Structure | 0 | 4 | 0 | 0 |
| 10. Presentation | 5 | 9 | 0 | 0 |
| 11. Forms | 6 | 7 | 0 | 0 |
| 12. Navigation | 9 | 2 | 0 | 0 |
| 13. Consultation | 7 | 1 | 1 | 3 |

## Non-conformities

### N14. The homepage’s content is outside <main>

Under the first screen, about 7,100 characters of the homepage sit outside <main>, which holds about 250. On the app’s first screen the legal links aren’t in a <footer>.

**Fix:** Make the page under the first screen the main content while it shows. A <footer> around the legal links, with the rules that lean on their <p>.

**Criteria:** 9.2. **Code:** `site/home/page.js:243`, `app/ui/composer.js:149`.

### N21. A design’s words overlap with more text spacing

With RGAA’s text spacing, a design’s lines run over one another on its page.

**Fix:** Let a part grow with its words, or keep the page’s words in a list beside it.

**Criteria:** 10.12. **Code:** `app/caps/designs/`.

### N24. One way around the app until search is found

The site’s pages have their menu and a site map. In the app, the tasks in the drawer are the only way around until search is found, after ten tasks.

**Fix:** Search that is always there.

**Criteria:** 12.1. **Code:** `app/ui/discovery.js`.

### N25. Dragging only, to move panes and columns

A pane’s head moves it and a column’s head reorders it by dragging alone, with no key and no single press. A pane’s width has keys but needs a drag with the pointer.

**Fix:** “Move” in the pane’s and the column’s menus (left, right, below), and width steps a press can reach.

**Criteria:** 7.3, 13.10. **Code:** `app/ui/dock.js:217`, `app/ui/dock.js:301`, `app/caps/tables/view.js:322`.

### N28. A heading’s link is for the pointer alone

The link beside a heading on the site’s pages has no words and is hidden from screen readers and the tab order. The pointer can use it, and the keyboard and screen readers can’t. The reader saw a name on it, which was removed after the copy it read was frozen.

**Fix:** Give it a name and let the keyboard reach it, or remove it. The site’s tests hold it as it is, so that is a choice to make first.

**Criteria:** 6.2. **Code:** `site/site.js:195`, `test/site.test.js:265`.

### N32. A chart with no title is named only “Chart”

A chart whose option has no title is an image named “Graphique”, which says neither what it is about nor what it shows: slide 2 of the deck, and the frame of the Excel page’s demo.

**Fix:** Name a chart from its series and categories when it has no title.

**Criteria:** 1.3. **Code:** `app/caps/charts/charts.js:139`.

### N33. A flowchart has no description

A branching flowchart in an answer is an image whose alternative is its words in drawing order, with no relations, and nothing beside it describes it. Visual answers are on by default.

**Fix:** A description beside it: the steps and branches in words, from its source.

**Criteria:** 1.6. **Code:** `app/caps/interactive/diagram.js:87`, `app/caps/interactive/interactive.js:342`.

### N34. States shown by colour alone

A collection’s Filter, Sort and Settings buttons say a rule is on only by turning gold, at 1.27:1, with the same name and no pressed state. Which cell of a row Jean changed is a tint alone, at 1.20:1. Search’s matched words are a background alone. The title on a changed cell was broken when read, which is fixed; the rest stands.

**Fix:** aria-pressed and a mark on the tools. A mark on the changed cell at all contrasts, or the change said beside it. Bold or an underline on the words found.

**Criteria:** 3.1. **Code:** `app/caps/tables/tables.css:5`, `app/caps/tables/view.js:170`, `app/caps/find/find.css`.

### N35. Words under AA

The active B in a document’s bubble is at 3.93:1. A source on the families page is at 4.04 to 4.31:1 on a card’s shadow. By night, placeholders keep the browser’s grey: the first brain’s address at 3.12:1, the key form’s at 3.33:1, with no mechanism on those pages. The lock’s placeholder, which the reader also cited, has since gone.

**Fix:** Darker ink on the bubble’s active button, the source clear of the shadow, and a placeholder colour for the dark theme.

**Criteria:** 3.2. **Code:** `app/caps/documents/editor.css:76`, `site/family/page.js:146`, `app/ui/style.css`.

### N36. Settings’ chosen option barely shows

In the default look, the chosen option of Settings’ choices (Light or dark, Font, Motion) is a white pill on a grey track, at 1.17:1, with a faint shadow as the only other sign. Other looks raise it, but the theme gallery isn’t a valid mechanism: its own chosen card is about 2.9:1.

**Fix:** A border or a darker pill at 3:1, and the gallery’s chosen card at 3:1.

**Criteria:** 3.3. **Code:** `app/ui/dialogs.css:198`.

### N37. A map has nothing in text

A map in an answer is a canvas named “Map” with zoom buttons and Copy. Nothing gives its places and route in text. Maps are in the homepage’s outputs.

**Fix:** Its places and route as a list beside it.

**Criteria:** 4.8. **Code:** `app/caps/interactive/map.js`.

### N38. A chart’s legend works by pointer alone

Past one series a chart has a legend, and a click on it hides a series, on a canvas with no focus and no key, with no equivalent elsewhere on the page.

**Fix:** The series as buttons or checkboxes beside the chart.

**Criteria:** 4.12. **Code:** `app/caps/charts/charts.js`, `app/caps/skills/directory/chart/SKILL.md`.

### N39. Row heads in tables aren’t headers

A table written in Markdown has <th> on its first row only, so its first column is <td> whatever it holds: in answers and documents. A collection’s rows are <td>, its name column included. Comparisons are right.

**Fix:** <th scope="row"> where the first column names its rows, and on a collection’s name column.

**Criteria:** 5.6. **Code:** `app/ui/markdown.js:113`, `app/caps/tables/view.js:417`.

### N40. A source’s link hides its number from its name

A source in an answer shows “1” while its name is “Open The Lighthouse (film)”, which leaves out what shows. A person using their voice would say the number.

**Fix:** A name that starts with the number.

**Criteria:** 6.1. **Code:** `app/ui/markdown.js:57`.

### N41. Focus and pages change without being asked

A deck or a design opening beside the task moves focus to the pane’s Close button with no action from the person: typing on lost letters, and a typed space closed the pane. The homepage’s and Settings’ language selects act as soon as an option is chosen, the homepage’s by going to another page.

**Fix:** Leave the focus where it is unless the person opened the pane. A button beside the language select, or say above it what choosing does.

**Criteria:** 7.4. **Code:** `app/ui/preview.js:168`, `app/ui/home.js:44`, `app/ui/dialogs.js:200`.

### N42. Status messages still missing or wrong

While Jean waits on a request for approval, the status still says it is thinking and the card isn’t live. Accepting a row or all of them in a collection writes nothing, and focus falls to the page. A retry isn’t said. An error toast and suggestions use role="status". The answer’s own status line and many errors are right.

**Fix:** Say that Jean is waiting on the person, and move focus or a live line to the card. A status for each change of the review’s count, and focus kept. role="alert" on error toasts.

**Criteria:** 7.5. **Code:** `app/ui/chat.js:458`, `app/ui/review.js:14`, `app/ui/composer.js:66`.

### N43. Ids repeat with two panes open

A new document created with another open beside the task repeats the ids app-preview, doc, slash-menu and refs-menu (W3C’s checker). A single document has none repeated.

**Fix:** An id per pane, or no ids where a class serves.

**Criteria:** 8.2. **Code:** `app/ui/preview.js`, `app/caps/documents/`.

### N44. A document’s other languages aren’t marked

In a document, English, Arabic and Japanese passages carry no lang, so all are declared the page’s language, though Jean can tell them apart as it does for answers.

**Fix:** lang on each block from the language Jean detects.

**Criteria:** 8.7. **Code:** `app/caps/documents/editor.js`, `app/ui/language.js:71`.

### N45. A change relies on automatic direction

An Arabic line in a change is dir="auto", where RGAA recognises only ltr and rtl. The reader gets the right direction: this fails by the letter.

**Fix:** The resolved direction on a change’s lines, as the document’s own have.

**Criteria:** 8.10. **Code:** `app/caps/documents/suggest.js`.

### N46. A heading Jean changes loses its level

In a document under review, a changed heading is drawn without the level the others have, so a section outranks the document’s title and the pane’s.

**Fix:** The same aria-level in the change’s drawing.

**Criteria:** 9.1. **Code:** `app/caps/documents/suggest.js`.

### N47. Menus not marked as lists

Settings’ sections, the homepage’s strip and the site’s language links are lists of links or buttons with no list markup, and so are a collection’s menus and Create’s. A board’s cards give label and value in spans, not a description list.

**Fix:** <ul> in each menu, or a menu role where it is one, and <dl> on a card.

**Criteria:** 9.3. **Code:** `app/ui/dialogs.js`, `site/home/page.js`, `site/site.js:320`, `app/caps/tables/view.js`.

### N48. Example requests quoted without markup

The homepage’s twelve example requests are in typed guillemets with no <q>. The reader marks this borderline, low confidence: if invented requests aren’t quotations, this is met.

**Fix:** <q>, or no quotation marks.

**Criteria:** 9.4. **Code:** `site/home/page.js`.

### N49. A new document’s instruction exists only in the style sheet

The line saying “Type / to add a list, a table, a chart…” is generated content, so without styles it is gone and nothing else says it.

**Fix:** Say it in the page, for instance as the block’s description.

**Criteria:** 10.2. **Code:** `app/caps/documents/editor.css:37`.

### N50. Without styles, messages show out of turn

With styles off, the key form opens with both “Well received” and “The request didn’t leave” before anything is sent. A change’s old version follows it with no words saying which is which.

**Fix:** hidden on both messages until they apply, and a word before the old version.

**Criteria:** 10.3. **Code:** `site/enterprise-key/enterprise-key.css:27`, `app/caps/documents/suggest.js`.

### N51. A document’s focus is weak

A document’s text has its outline removed and shows focus by its caret and a hairline under its pane’s head. The reader passed the stronger frame this replaced; judged not met on the current tree after the readers finished, by the session that ran them.

**Fix:** A visible focus style on the text itself, in a form the owner accepts.

**Criteria:** 10.7. **Code:** `app/caps/documents/editor.css`.

### N52. A figure hidden from screen readers

A sourced figure on the families page (85% of parents, National Parents Union, 2026) sits inside an aria-hidden block, and appears nowhere else on the page.

**Fix:** Move it out of the hidden block, or repeat it in the text.

**Criteria:** 10.8. **Code:** `site/family/page.js:140`.

### N53. Help that names controls by shape and place

A help article identifies controls only by shape and place (“the arrow sends”, “press + beside it”), under a hidden figure, and never by the names a screen reader hears. Also the terms’ “the date at the top of this page” and an article’s “your menu at the foot of the task list”.

**Fix:** Give each control’s name beside its shape.

**Criteria:** 10.9. **Code:** `site/help/first-task/fr.json`, `site/terms/`, `site/help/openrouter/`.

### N54. What a changed cell says isn’t on its field

On focus, a changed cell’s tip is on the cell and not its field, so a screen reader hears only the column’s name. The article’s shape-and-place wording has no alternative either. The reader also cited a broken {count}, which is fixed.

**Fix:** aria-describedby on the field, and the names under N53.

**Criteria:** 10.10. **Code:** `app/caps/tables/view.js:417`, `site/help/first-task/fr.json`.

### N55. A request for approval scrolls sideways at 320 pixels

At 320 pixels the approval card runs past the window, and an ordinary long address takes the card to 622 pixels and the page with it. It is text, so no exception applies.

**Fix:** Let the card and its address wrap.

**Criteria:** 10.11. **Code:** `app/ui/chat.js:458`, `app/ui/style.css:493`.

### N56. A tip’s Escape does more than close the tip

In a pane or Settings, Escape hides a tip and closes the pane or Settings too, with focus lost. Nothing else dismisses a tip there.

**Fix:** Escape closes the tip alone while one shows.

**Criteria:** 10.13. **Code:** `app/ui/tips.js`.

### N57. Fields labelled in ways RGAA’s test doesn’t list

Wrapping labels with no for: the key form, the first brain’s forms, the lock’s setting, a design’s fields, a collection’s settings, most of Appearance’s radios. Named by aria-label alone with no visible words: a filter rule’s fields, the bubble’s address, the foot’s language select. A screen reader gets a name for every field: this fails the test’s words and voice control more than it silences anyone.

**Fix:** for and id on each label, and a title or visible words on the others.

**Criteria:** 11.1. **Code:** `site/enterprise-key/page.js`, `app/ui/brain-pages.js:266`, `app/caps/tables/view.js:162`, `site/home/page.js:137`.

### N58. Every task box has the same name

Each to-do box in a document is named “Done”, ticked or not, and the item’s words aren’t tied to it.

**Fix:** aria-labelledby on the item’s text.

**Criteria:** 11.2. **Code:** `app/caps/documents/markdown.js:94`.

### N59. Grouped lists built with a listbox

Search’s results and the box’s / menu group options with role="group" inside a listbox, which RGAA’s note on 11.8 counts as not conformant though ARIA 1.2 allows it. The verdict rests on the note’s letter.

**Fix:** Separate listboxes per group, or native <optgroup>.

**Criteria:** 11.8. **Code:** `app/caps/find/find.js:283`, `app/ui/complete.js:398`.

### N60. The “Auto” button doesn’t say what it does

In the message box, the chip reads “Auto”, or a brain’s name, and doesn’t say that it opens the choice of brain.

**Fix:** A name that says so and includes what shows: “Choose a brain: Auto”.

**Criteria:** 11.9. **Code:** `app/ui/composer.js:139`.

### N61. Required fields not shown as required

The first brain’s key is required with nothing visible, and the line “All fields are required” before the local form and the lock’s isn’t in a label or tied to the fields.

**Fix:** Say so in each label, or aria-describedby to that line.

**Criteria:** 11.10. **Code:** `app/ui/brain-pages.js:266`, `app/caps/lock/lock.js`.

### N62. Wrong values get no help

A wrong value in a collection’s mail, link or phone column empties the cell and shows a short toast, with no format and no example, the keyboard already on the next cell. A wrong recovery code doesn’t say what form it takes.

**Fix:** Keep the value, mark it invalid, and say the form expected beside it.

**Criteria:** 11.11. **Code:** `app/caps/tables/view.js:123`, `app/caps/lock/lock.js`.

### N63. Deleting acts at once

Deleting a creation has a five-second Undo that doesn’t say how long it lasts, and focus falls to the page. Deleting a column or a row has no message, though ⌘Z brings a column back. Reject all has no confirmation, and ⌘Z didn’t restore it. Those are menus, not forms: a strict reading would pass them.

**Fix:** Say how long Undo lasts and keep it while it has focus. A message and an Undo on columns and rows, and on Reject all.

**Criteria:** 11.12. **Code:** `app/ui/creations-page.js:72`, `app/caps/tables/view.js`.

### N64. Settings has no link past its sections

Settings is a modal with its own address and sections, and no skip link inside: Tab goes through all its sections each time to reach the panel. If a modal isn’t a page this passes; the sample lists these as pages.

**Fix:** A skip link at the head of the sheet, or focus on the panel when a section is chosen.

**Criteria:** 12.7. **Code:** `app/ui/dialogs.js`.

## Found and fixed in this audit

What the first reading found, and fixed the same day. The second read may fail the same criterion on something else: these are fixes, not a claim that a criterion is met.

| Defect | What was wrong | What it is now |
|---|---|---|
| N01 | Every screen of the app had the same title | The window’s title is now the task’s name, the Settings section, Creations or Search, then Jean, and the lock’s name says it is locked. |
| N02 | Status messages weren’t announced, or announced wrongly | A status line says Jean is thinking, writing and has answered, never its stream of words. Errors use role="alert", and the bare live regions role="status". |
| N03 | No link reached the main content in the app | A skip link reaches <main>. Following a skip link used to close the open task, the one that was there before included: the router now puts the task’s address back. |
| N04 | Text boxes with a hidden label had no visible words | The lock’s boxes have a visible label. The message box and search have a title, one of test 11.1.3’s ways, while their hint still goes as you type. A collection’s name, its field for a new column and a score’s range are named by a title alone. |
| N05 | Words too faint in search | The word found, the time and the placeholder are at AA, and so is a design’s count by night. |
| N06 | Focus too faint in search | Search’s line is at full strength. A document’s focus is N51. |
| N07 | Focus hidden under the message box | What has focus in a conversation keeps a margin clear of the task’s title and the box, beside a pane too. |
| N08 | A collection’s changes marked by colour alone | Each changed cell says so in a tip, and its row has Accept and Reject. Its lines stay faint by design, as place and words tell a cell apart; with more contrast asked for, the lines, the name and the changed cells are marked at 3:1. |
| N09 | Invalid code in the app | The spacers are hidden <li>, references point only at what is drawn, the curtain is in <body>, and a design’s takes hold no <div> in a <button>. |
| N10 | Changes of language not marked | Each answer has lang from the language Jean detects, and the sample’s English words on French pages are marked. |
| N11 | Tags used only for how they look | Shapes are <span>, and a note in an answer has a role of note, which says what its <blockquote> is. |
| N12 | Direction changes not marked | Each language in the menu has its dir, and a document’s paragraphs have a resolved ltr or rtl. |
| N13 | Headings missing or skipping a level | The site’s foot heads its columns with <h2>, a document’s headings sit under its pane’s, and a deck in an answer has a heading of its own. |
| N15 | Lists not marked as lists | A comparison’s sources are a <ul>, and the legal notice’s lines are separate paragraphs. |
| N16 | A quotation not marked | Boileau’s line is a <blockquote>. |
| N17 | Information lost without the style sheets | Icons carry their size, fill and stroke as attributes, and “Recommended” is in the page’s words. |
| N18 | A count hidden from screen readers | The count on a design’s Parts button is in its name. |
| N19 | Sideways scrolling at 320 pixels | Settings’ sections, the homepage’s strip and tiles, and a collection’s board wrap. |
| N20 | Button names that didn’t say or didn’t match | Parts says its count, and each of the homepage’s Try buttons has its own request in its name. |
| N22 | A tip couldn’t be hovered | A tip stays while the pointer is over it. |
| N23 | Required fields not shown as required | The first brain’s form, the lock’s and the key form say so. |
| N24 in part | Only one way around the site | A site map page in English and French, linked from every page’s foot. The app’s side is still open, below. |
| N26 | Charts and scores had no text equivalent | Each chart opens its numbers as a table, on a slide too, and each score its notes as text, in music notation. |
| N27 | A comparison’s row heads weren’t headers | The first column is <th scope="row">, and only the head row sticks. |
| N29 | A list the keyboard couldn’t scroll in WebKit | The shortcuts’ panel takes the keyboard, checked in both engines. |
| New | Create tiles cut their words | A Create tile’s words show whole at any size. |
| New | Ticking a document’s task by key lost the focus | The box keeps the focus through its item being drawn again. |
| New | A document’s new words marked by colour alone | They say so in a tip, and are underlined when more contrast is asked for. |
| New | A collection’s table and filter fields had no name | The table has the collection’s name, and each rule of a filter is a named group. |
| New | A collection’s menus stayed open under the keyboard | A menu closes as the keyboard leaves it, so what has focus is never under it. |

## Not verified

- **U1, Screen reader** (4.13, 7.1): What a screen reader announces: scripted controls (test 7.1.2) and charts and scores (4.13). *To close it:* A person with VoiceOver and Safari, and NVDA and Firefox, through a task, search, the menus, a sheet, a document, a collection, a chart and a score.
- **U2, Word’s and Excel’s accessibility checkers** (13.3): RGAA has an office document checked with its own program’s accessibility checker. Read in their XML instead: a .docx has real headings, lists, a table with a header row and its language, but no title; a .xlsx has a named sheet and a frozen, styled first row, not a declared table. *To close it:* Open each file in Word or Excel: Review › Check Accessibility.

## Seen outside the sample by the readers

Noted by the readers, and not counted unless a page above names them.

- **1.3:** Gap, judged too: a diagram in an answer. app-diagram > img alt="Yes, No, Leaving home, Is it raining?, Take an umbrella, Wear sunglasses, Go out" (shots/X-umbrella.png; app/caps/interactive/diagram.js:87 wordsOf) is the words in drawing order, with no relations. Outside the sample: a generated picture's alt is the raw request, 'draw a cat on a sofa' (out/X-picture.json). Tests 1.3.8 and similar on what a screen reader says were not run.
- **1.6:** Why the gap counts: 'Réponses visuelles' (maps, diagrams, timelines) is on by default in Settings › Skills, and the fake brain's flowchart follows that skill. Strict reading on the sample: between chart and summary sits div.drawn-foot (Copy), and between score sheet and summary the player too, so they are not 'juste après' in the code; visually adjacent, and I accepted it.
- **1.7:** Outside the sample, listed in the chart skill's 'when they fit better': 'Voir les données' on a sankey or graph reads 'A [object Object] B [object Object]', and on a dataset-based chart the raw JSON (app/caps/charts/charts.js:35-36; out/flow13.log). That description isn't relevant.
- **1.9:** If P06's drawing were counted as a captioned image, it would fail 1.9.1: figure has neither role nor aria-label. I don't count it: the test names image tags.
- **2.2:** Outside the sample: a small app in an answer is always titled 'Page interactive' and a map 'Carte', accurate as to kind, the same for every one (out/X-diagram.json, out/X-map.json). Weak but I wouldn't fail it.
- **3.1:** Gap, multi-series chart: series differ by colour alone, in lines and legend (shots/X-multiline.png; patterns only under prefers-contrast). I accepted the table under 'Voir les données' as the 'other method', since the glossary asks for a visible text and this one is a click away; a stricter reader would fail 3.1.3 there too. Passing: P35's changes (underline, 'Nouveau', 'Jean retire ce passage'), P07's callouts and best cells (bold), errors in words.
- **3.2:** Text crossed by the hand-drawn marks on P18, P19, P22 was measured and accepted: the marks cross only part of each word, whose median stays over 5:1. Words on canvas charts weren't measured word by word; they read dark on white.
- **3.3:** Gap, multi-series chart: lime on white 1.66:1, orange 2.12:1, lime against orange 1.28:1. Exempt by the special case for a graphic with an alternative, the data table.
- **4.1:** Outside the sample: a film a brain makes is a video with controls, an aria-label holding the request, and no track, transcript or description beside it (out/X-film.json). It would fail 4.1.2 and 4.7.1. Films aren't among the outputs the homepage lists.
- **4.7:** See 4.1 on films: 'Here is your film.' doesn't identify one.
- **4.8:** Why the gap counts: 'cartes' is in the homepage's outputs, and its card 'La sortie vélo de dimanche' shows a map. The fake's tiles didn't paint in my run (shots/X-map-drawn.png): I read the DOM and source, not a finished map.
- **4.9:** Outside the sample: sankey and graph, as in 1.7.
- **4.10:** Voice and Live modes weren't run.
- **5.5:** Those untitled tables are for criterion 5.4, which isn't mine. Whether the aria-label is announced wasn't tested with a screen reader.
- **5.6:** D1 and D2 mark the first row as a header (w:tblHeader) and not the first column; D3 freezes its first row. Empty th at the corner of P07's and P18's tables isn't a failure of this test.
- **6.1:** Why the gap counts: 'réponses sourcées' is first in the homepage's outputs. Softest pass on the sample: 'à la maison', 'en famille', 'pour la DSI' on P01 and P31, in nav aria-labelledby='Jean pour vous', a context RGAA's list doesn't include; the preceding h1 and the words themselves carried it for me.
- **7.4:** On Windows and Linux an arrow key on a closed select fires change, so each arrow would switch language; not run here (macOS).
- **7.5:** Whether a region inserted with its text already in it ('Rien trouvé', 'Connexion…') is voiced depends on the screen reader; none was run.
- **8.2:** A two-pane layout is not its own sample entry; it is one step away from P33 and P13 (Tiles and dock), so I judged it.
- **8.6:** A task with no title of its own (list shows 'Nouvelle tâche') keeps the homepage's 'Jean · Créez avec l’IA de votre choix, gardez tout'. The first-brain steps P24-P26 keep the same title; they are states of that page.
- **8.7:** A mixed answer gets one lang for the whole answer, by the code. Collection cells (P14, P36, P37) carry no lang. On P16 the inline deck's English slides sit in div lang=fr, which is a wrong indication (8.8's matter).
- **8.10:** An Arabic answer in the French interface, a plain use: .msg-user, .prose and h1.conversation-title are all dir="auto" (computed rtl), lang=ar on .prose. On P31 'Jean' in the wordmark is span dir=auto.
- **10.7:** At 320×256 the fixed box covers focused links on the homepage (P01). After 'Tout accepter' on P14, or Escape closing a pane, focus falls to body, so nothing shows until the next Tab.
- **10.9:** Capabilities (P11) shows found or not by icon style (dashed or filled), with the words one click away on its page.
- **10.11:** Two documents side by side, then zoomed: each pane is 143 px wide and its view scrolls sideways (191/143), reader-b/shots/P33-320x256.png. Opening a second at 320 replaces the first.
- **10.13:** Main use the sample misses, a sourced answer (the homepage's 'réponses sourcées'): .cite-tip covers the words above it, is CSS only, Escape leaves it, by pointer and by focus, and moving the pointer onto it makes it vanish: fails 10.13.1 and 10.13.2 (reader-b/shots/T1013-cite-alone.png; tree/app/ui/style.css:404-406). A name in the box: .mark-tip has pointer-events none and vanishes when approached (10.13.2).
- **11.1:** Editing a request in a task (main use, not listed in the sample): app-edit textarea aria-label only, no title (app/ui/edit.js:44), shot reader-c/shots/P07-edit-request.png.
- **11.2:** Settings › Brains (not in the sample): select.brain-same aria-label 'Toujours le même' names the radio beside it, not what is chosen. P14 grid cells repeat the column name on every row ('Société' three times), acceptable inside a table with headers.
- **11.7:** P30's look gallery (input[name=look]) has no legend, which is 11.5, not this reader's.
- **11.8:** The '/' menu in the box isn't in the sample, but appears in any task.
- **11.9:** Outside any form, so outside this criterion's method: button.wordmark shows 'Jean' with title 'Nouvelle tâche', and P34's bubble shows ↵/⌫ under Appliquer/Retirer le lien (symbol case).
- **11.12:** P28's #sent says nothing of how to correct a request; I don't count it, since the commitment is the separately signed quote.
- **12.3:** With a French browser /site-map's 'Homepage' opens the French home, by language detection, not a wrong link.
- **12.7:** P05's main.lock has no link, nothing to skip, not counted. P13-P16, P33-P38: main is the conversation, the creation is an aside after the composer; from 'contenu principal' it took 21 Tabs to reach #doc, 29 from the top, though opening a new one does focus it.
- **12.10:** Not run: a deck saved as its own web page, where the root may be the page. Games use WASD inside their frame. A workbook's cell starts editing on any character, inside its frame.
- **13.1:** 13.1.4 would fail where an organisation's policy sets session.idle (e.g. PT15M, app/ee/session.js): the person can't remove or extend it, under 20 hours, no warning (app/ee/idle.js, not run). Policy-only.
- **13.5:** Before its skill is added, a brain's ```abc, ```echarts or deck block shows as raw code with only the answer's words around it. What a brain writes in an answer is outside Jean's control.
- **13.7:** Games and pages a brain writes could flash; they aren't in the sample.

## How each criterion was judged

- **Second read: an AI reader given no earlier verdict:** 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 2.2, 3.1, 3.2, 3.3, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10, 4.12, 5.1, 5.2, 5.3, 5.5, 5.6, 5.8, 6.1, 6.2, 7.4, 7.5, 8.2, 8.6, 8.7, 8.9, 8.10, 9.1, 9.3, 9.4, 10.2, 10.3, 10.5, 10.7, 10.8, 10.9, 10.10, 10.11, 10.13, 11.1, 11.2, 11.3, 11.4, 11.7, 11.8, 11.9, 11.10, 11.11, 11.12, 12.2, 12.3, 12.5, 12.7, 12.10, 13.1, 13.4, 13.5, 13.6, 13.7, 13.11, 13.12
- **First reading: settled by a tool:** 1.2, 2.1, 8.1, 8.3, 8.5, 10.1, 11.6, 11.13, 12.6, 12.9
- **First reading: a tool, then by hand:** 1.1, 4.11, 5.4, 5.7, 7.2, 7.3, 8.4, 8.8, 9.2, 10.4, 10.6, 10.12, 10.14, 11.5, 12.4, 12.8, 12.11, 13.2, 13.8, 13.9
- **First reading: by hand alone:** 12.1, 13.10
- **Needs assistive technology or Word: not run:** 4.13, 7.1, 13.3

## Sample

| Page | Why | What | Where |
|---|---|---|---|
| P01 | Required: homepage | Homepage, first screen and the page under it | /fr |
| P02 | Required: legal notice | Terms, which hold the legal notice | /fr/terms, /terms |
| P03 | Required: accessibility | Accessibility statement | /fr/accessibilite, /accessibility |
| P04 | Required: help | Help centre | /fr/aide, /help |
| P05 | Required: authentication | Lock screen: at rest, wrong password, recovery code | app, profile locked |
| P06 | Main use | Help article with a demonstration | /fr/aide/votre-premiere-tache |
| P07 | Main use | A task with an answer: table, steps, notes | app, #/c/… |
| P08 | Main use: search | Search: empty, results, nothing found | app, ⌘K |
| P09 | Main use | Tasks in the drawer | app |
| P10 | Main use | Settings › General | app, #/settings |
| P11 | Main use | Settings › Capabilities, and one capability | app, #/settings/… |
| P12 | Main use | Creations | app |
| P13 | Creation: document | A document in its editor, with lists, a table and three languages | app, pane |
| P14 | Creation: collection | A collection with Jean’s changes to accept or reject | app, pane |
| P15 | Main use | A design | app, pane |
| P16 | Main use | A slide deck | app, pane |
| P17 | Main use | Charts, of one series and of several, and a music score in answers | app |
| P18 | Main use | Page for IT | /fr/entreprise |
| P19 | Content type: data table | Comparison with ChatGPT | /fr/comparer/chatgpt |
| P20 | Main use | AI for Excel, with a demonstration | /fr/excel |
| P21 | Main use | Families | /fr/famille |
| P22 | Main use | Bringing your history | /fr/importer |
| P23 | Main use | A request for approval in an answer | app |
| P24 | Process: first brain, step 1 | One step before I answer | app |
| P25 | Process: first brain, step 2 | Plans and keys; what matters most | app |
| P26 | Process: first brain, step 3 | Connection form, and its error | app |
| P27 | Process: setting a lock | Choosing, password with error, recovery code | app, Settings › Your data |
| P28 | Process and form | Key request: form, sent, failed | /fr/entreprise/cle |
| P29 | Distinct look | A task in the Terminal and Mondrian looks | app |
| P30 | Distinct look: form | Settings › Appearance | app |
| P31 | Distinct look: right to left | Homepage in Arabic | /ar |
| P32 | Required: site map | Site map | /fr/plan-du-site, /site-map |
| P33 | Creation: document | A new, empty document | app, Creations › Create |
| P34 | Creation: document | A document’s menus: “/”, the bubble over selected words, a block’s menu | app, pane |
| P35 | Creation: document | A document with Jean’s changes: added, altered, taken away | app, pane |
| P36 | Creation: collection | A collection’s menus: a column’s, a filter with its rule, settings | app, pane |
| P37 | Creation: collection | A collection as a board | app, pane |
| P38 | Creation: collection | A new, empty collection | app, Creations › Create |
| P39 | Ordinary use: a flowchart | A flowchart in an answer | app |
| P40 | Ordinary use: a map | A map in an answer | app |
| P41 | Ordinary use: sources | An answer with sources | app |
| D1 | Downloadable document | An answer saved as a Word document | .docx |
| D2 | Downloadable: a document created | A document saved as a Word document | .docx |
| D3 | Downloadable: a collection created | A collection saved as an Excel workbook | .xlsx |
| R1 | Random | Comparison with Open WebUI | /fr/comparer/open-webui |
| R2 | Random | Help article: is Jean free? | /fr/aide/jean-est-il-gratuit |
| R3 | Random | Settings › Keyboard shortcuts | app, ⌘/ |
| R4 | Random | Comparison hub | /fr/comparer |
| R5 | Random | Help article: start free with OpenRouter | /fr/aide/commencer-gratuitement-avec-openrouter |

No separate contact page exists. The five random pages come from the 46 others by a hash of the commit and the date (`51494c91|2026-11-01|RGAA`), 11.4% of the other 44. Documents and collections are in the sample as people meet them: new and empty, in use, their menus, Jean’s changes, a board, and the files they are saved as. The second read’s verdicts and pictures are kept outside the repository.

## Tools and environment

Chromium 156 (Playwright 1.64) on macOS 27, keyboard and pointer; no assistive technology. axe-core 4.14, html-validate 9.7 in place of the W3C validator, Jean’s pixel measures from `test/contrast.spec.js` and `test/nontext.spec.js` extended to every state of the sample, `test/site.spec.js`, `test/reflow.spec.js`, `test/targets.spec.js` and `test/motion.spec.js`: 224 passed, 0 failed, 69 skipped in WebKit by design.
