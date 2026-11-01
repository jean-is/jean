# RGAA 4.1.2 audit of jean.is

Internal audit by Warehouse SAS, 1 November 2026. An AI, Claude by Anthropic, made the tests and the first judgments. Separate AI readers, given none of those judgments and told of no fix, then judged the criteria again in three rounds on frozen copies, and the owner adopted their verdicts. No person has checked the judgments or tested with a screen reader. Tested last: main at a41d8634, frozen to a copy with every result removed.

## Result

**49 of 88 applicable criteria met: 55.7%, which is partially conformant.** 36 not met, 3 not verified and counted as not met, 18 not applicable, out of 106.

Of the 49 met, 19 rest on the second read, 12 on the third and 18 on the fourth. If 6 of the met were wrong, the rate would fall under 50% and the status would be “not conformant”. The grid is [rgaa-audit-2026-11.xlsx](rgaa-audit-2026-11.xlsx).

## How it was counted

For each criterion, the last verdict counts.

| Round | What it judged | On | Result |
|---|---|---|---|
| First reading | All 106, by the AI that also made fixes | Working tree of 1 November | 77 of 88, which no later read upheld |
| Second read | 71 criteria, three AI readers | The tree on 0e3ea3f4 plus work not yet committed | 46 of 88 |
| Third read | The 27 met that no reader had seen, three AI readers | deb33e35 | 12 stood, 15 failed: 31 of 88 |
| Fourth read | The 34 that fixes claimed to close, three AI readers told of no fix | a41d8634 | 18 stood, 16 failed: 49 of 88 |

Criteria met on the second or third read weren’t read again after the fixes, so one could have regressed. Not met without a reader’s verdict: 7.3, 9.2, 10.12, 12.1, 13.10 on the first reading, and 10.7, judged on the current tree by the session that ran the second read. A flowchart, a map and an answer with sources were added to the sample as gaps the readers judged, and marked NW on the criteria they weren’t walked for. No reader’s “not met” went back to met without a later reader’s verdict.

| Theme | Met | Not met | Not verified | Not applicable |
|---|---|---|---|---|
| 1. Images | 2 | 3 | 0 | 4 |
| 2. Frames | 2 | 0 | 0 | 0 |
| 3. Colours | 0 | 3 | 0 | 0 |
| 4. Multimedia | 4 | 1 | 1 | 7 |
| 5. Tables | 2 | 2 | 0 | 4 |
| 6. Links | 2 | 0 | 0 | 0 |
| 7. Scripts | 1 | 3 | 1 | 0 |
| 8. Mandatory elements | 7 | 3 | 0 | 0 |
| 9. Structure | 1 | 3 | 0 | 0 |
| 10. Presentation | 6 | 8 | 0 | 0 |
| 11. Forms | 8 | 5 | 0 | 0 |
| 12. Navigation | 7 | 4 | 0 | 0 |
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

### N33. A flowchart has no description, and its alternative lists its words

A branching flowchart in an answer is an image whose alternative is its words in drawing order, with no relations, and nothing beside it describes it. Which step follows which, and where Yes and No lead, is told only by arrows and layout. Visual answers are on by default.

**Fix:** A description beside it: the steps and branches in words, from its source.

**Criteria:** 1.3, 1.6, 10.9, 10.10. **Code:** `app/caps/interactive/diagram.js:87`, `app/caps/interactive/interactive.js:342`.

### N34. States shown by colour alone

A collection’s Filter, Sort and Settings buttons say a rule is on only by turning gold, at 1.27:1, with the same name and no pressed state. Which cell of a row Jean changed is a tint alone, at 1.20:1. Search’s matched words are a background alone. The title on a changed cell was broken when read, which is fixed; the rest stands.

**Fix:** aria-pressed and a mark on the tools. A mark on the changed cell at all contrasts, or the change said beside it. Bold or an underline on the words found.

**Criteria:** 3.1. **Code:** `app/caps/tables/tables.css:5`, `app/caps/tables/view.js:170`, `app/caps/find/find.css`.

### N37. A map has nothing in text

A map in an answer is a canvas named “Map”, in English, with zoom buttons and Copy. Nothing gives its places and route in text. Maps are in the homepage’s outputs.

**Fix:** Its places and route as a list beside it, and a name in the person’s language.

**Criteria:** 1.1, 1.3, 4.8, 10.9. **Code:** `app/caps/interactive/map.js`.

### N39. Row heads in tables aren’t headers

A table written in Markdown has <th> on its first row only, so its first column is <td> whatever it holds: in answers and documents. A collection’s rows are <td>, its name column included. Comparisons are right.

**Fix:** <th scope="row"> where the first column names its rows, and on a collection’s name column.

**Criteria:** 5.6. **Code:** `app/ui/markdown.js:113`, `app/caps/tables/view.js:417`.

### N44. A document’s other languages aren’t marked

In a document, English, Arabic and Japanese passages carry no lang, so all are declared the page’s language, though Jean can tell them apart as it does for answers.

**Fix:** lang on each block from the language Jean detects.

**Criteria:** 8.7. **Code:** `app/caps/documents/editor.js`, `app/ui/language.js:71`.

### N47. Menus not marked as lists

Settings’ sections, the homepage’s strip and the site’s language links are lists of links or buttons with no list markup, and so are a collection’s menus and Create’s. A board’s cards give label and value in spans, not a description list.

**Fix:** <ul> in each menu, or a menu role where it is one, and <dl> on a card.

**Criteria:** 9.3. **Code:** `app/ui/dialogs.js`, `site/home/page.js`, `site/site.js:320`, `app/caps/tables/view.js`.

### N51. A document’s focus is weak

A document’s text has its outline removed and shows focus by its caret and a hairline under its pane’s head. The reader passed the stronger frame this replaced; judged not met on the current tree after the readers finished, by the session that ran them.

**Fix:** A visible focus style on the text itself, in a form the owner accepts.

**Criteria:** 10.7. **Code:** `app/caps/documents/editor.css`.

### N57. Fields labelled in ways RGAA’s test doesn’t list

Wrapping labels with no for: the key form, the first brain’s forms, the lock’s setting, a design’s fields, a collection’s settings, most of Appearance’s radios. Named by aria-label alone with no visible words: a filter rule’s fields, the bubble’s address. A screen reader gets a name for every field: this fails the test’s words and voice control more than it silences anyone.

**Fix:** for and id on each label, and a title or visible words on the others.

**Criteria:** 11.1. **Code:** `site/enterprise-key/page.js`, `app/ui/brain-pages.js:266`, `app/caps/tables/view.js:162`.

### N59. Grouped lists built with a listbox

Search’s results and the box’s / menu group options with role="group" inside a listbox, which RGAA’s note on 11.8 counts as not conformant though ARIA 1.2 allows it. The verdict rests on the note’s letter.

**Fix:** Separate listboxes per group, or native <optgroup>.

**Criteria:** 11.8. **Code:** `app/caps/find/find.js:283`, `app/ui/complete.js:398`.

### N62. Wrong values get no help

A wrong value in a collection’s mail, link or phone column empties the cell and shows a short toast, with no format and no example, the keyboard already on the next cell. A wrong recovery code doesn’t say what form it takes.

**Fix:** Keep the value, mark it invalid, and say the form expected beside it.

**Criteria:** 11.11. **Code:** `app/caps/tables/view.js:123`, `app/caps/lock/lock.js`.

### N63. Deleting acts at once

Deleting a creation has a five-second Undo that doesn’t say how long it lasts, and focus falls to the page. Deleting a column or a row has no message, though ⌘Z brings a column back. Reject all has no confirmation, and ⌘Z didn’t restore it. Those are menus, not forms: a strict reading would pass them.

**Fix:** Say how long Undo lasts and keep it while it has focus. A message and an Undo on columns and rows, and on Reject all.

**Criteria:** 11.12. **Code:** `app/ui/creations-page.js:72`, `app/caps/tables/view.js`.

### N65. A link in a selected block falls short of AA

While a block’s menu is open, a link in that block is #896a01 on #e2ddca, 3.74:1.

**Fix:** Ink on links under .block-selected, or a lighter tint.

**Criteria:** 3.2. **Code:** `app/caps/documents/editor.css`.

### N66. What is active barely shows

Search’s active result differs by a background alone, 1.22:1. The active entry in a document’s / menu and a pressed bubble button are 1.17:1, with an outline at 1.45:1. Which cell Jean changed is a tint, 1.2:1. A flowchart’s boxes have outlines at 1.45:1.

**Fix:** An ink bar or outline at 3:1 on what is active, and a mark on the changed cell, in a form the owner accepts.

**Criteria:** 3.3. **Code:** `app/caps/find/find.css:17`, `app/caps/documents/editor.css:68`, `app/caps/tables/tables.css:60`.

### N67. Tables not tied to what titles them

A line ending in a colon just before an answer’s table isn’t tied to it, nor is the homepage’s table to its section’s heading, though comparison and IT tables are. The reading that such a line is a title decides this.

**Fix:** aria-labelledby on the homepage’s table, and on an answer’s table to the line before it.

**Criteria:** 5.4. **Code:** `app/ui/markdown.js:109`, `site/home/page.js`.

### N68. A column’s kind and a pane at a narrow window change context

Choosing a kind in a collection’s add-column select adds the column and moves the keyboard into its name at once. At a narrow window, a creation a brain opens fills the window and takes the keyboard.

**Fix:** A button with a menu of kinds. Say a pane has opened, and leave the keyboard on a narrow window too.

**Criteria:** 7.4. **Code:** `app/caps/tables/view.js:401`, `app/ui/preview.js`.

### N69. Messages still silent or under the wrong role

On the key form, the note that a key is free under 250 people has no live region, and appears 721 pixels below its field. By the letter only: offers use role="status" where the test gives suggestions role="alert", and a deck’s slide count is aria-live with no role.

**Fix:** role="alert" on the note, tied to its field. Roles on offers and the slide count.

**Criteria:** 7.5. **Code:** `site/enterprise-key/page.js:130`, `app/ui/composer.js:63`.

### N70. A language marked wrongly

A short answer in English under a French interface is marked lang="fr", since a short text keeps the reader’s language without clear evidence. Jean’s own French words inside an answer marked English take no lang of their own: Recommandé, Avertissement, Voir les données.

**Fix:** No lang on an answer when the detector isn’t sure, and the interface’s lang on Jean’s own words in an answer.

**Criteria:** 8.8. **Code:** `app/caps/made/made.js:251`, `app/ui/language.js:96`.

### N71. The wordmark relies on automatic direction

On a right-to-left page the wordmark is dir="auto", where RGAA recognises only ltr and rtl. It reads correctly: this fails by the letter. A strict reading also counts Latin words with no dir of their own on such a page.

**Fix:** dir="ltr" on the wordmark.

**Criteria:** 8.10. **Code:** `app/ui/shell.js:41`.

### N72. Titles that aren’t headings

A comparison’s “Un réglage d’abord” titles a card and is a <p>. A design’s title part is a <p>. A reader may call these labels.

**Fix:** A heading on the card, and role="heading" with a level on a design’s title part.

**Criteria:** 9.1. **Code:** `site/compare/product.js:164`, `app/caps/designs/page.js:51`.

### N73. A design’s words shrink under zoom

A design’s words are sized to a sheet fitted to the window, so zooming the browser makes them smaller on screen: 22.7 pixels at 100%, 14.1 at 200%. The same words can be read in its fields.

**Fix:** Under zoom the sheet keeps its size and scrolls in its stage.

**Criteria:** 10.4. **Code:** `app/caps/designs/page.js:52`, `app/caps/designs/designs.css:46`.

### N74. Hidden drawings hold words found nowhere else

The families page’s hidden panes name the subjects a parent can choose and show what a child sees, while the list beside them says only “nine delicate subjects”. A reader may call them illustrations.

**Fix:** Name the subjects in the readable list, and give each pane a short alternative.

**Criteria:** 10.8. **Code:** `site/family/page.js:100`, `site/family/page.js:122`, `site/family/page.js:155`.

### N75. Capabilities tells what is found only by an icon

In Settings’ Capabilities, a capability found has a filled tile and one not found a dashed one, with nothing in words on the row.

**Fix:** The state in words on each row.

**Criteria:** 10.9, 10.10. **Code:** `app/ui/case-pages.css:10`.

### N76. A collection’s review leaves no room for its table

At 320 by 256, with changes to review, a collection’s table is 0 pixels high and can’t be scrolled to, so its rows and their buttons can’t be reached. The criterion gives a width alone: this rests on using 256 as the height.

**Fix:** The review bar scrolls with the pane, and the table keeps a least height.

**Criteria:** 10.11. **Code:** `app/ui/review.js:14`, `app/caps/tables/tables.css`.

### N77. Tips that cover words and can’t be dismissed

On comparison pages a source’s tip covers the words around it, ignores Escape and vanishes if the pointer moves onto it. A chart’s tooltip covers bars and ignores Escape.

**Fix:** On the site’s tips, the bridge and Escape the app’s have. Escape on a chart.

**Criteria:** 10.13. **Code:** `site/compare/compare.css:37`, `app/caps/charts/option.js:40`.

### N78. The key form refuses an address without saying how

The key form’s service accepts only https addresses, which the hint doesn’t say. Submitting one leaves the page for a bare line in English that names no field, as does a VAT number with a dot.

**Fix:** Say https and check it in the field, and have the service answer back at the form, the field named.

**Criteria:** 11.10. **Code:** `site/enterprise-key/page.js`, `requests/requests.js`.

### N79. The lock screen has no way to the site map

The lock screen leads to no page. This rests on treating it as a page that needs the link, and a reader may call it outside any set of pages.

**Fix:** A link to the site map, with Help, on the lock screen.

**Criteria:** 12.4. **Code:** `app/caps/lock/lock.js`.

### N80. Search and the legal links have no landmark

Search’s button has no role="search", and the app’s legal line no contentinfo, title or link to it.

**Fix:** A search landmark, and the legal line in a <footer>.

**Criteria:** 12.6. **Code:** `app/ui/shell.js:72`, `app/ui/composer.js:149`.

### N81. Tab lands where nothing shows

On a new profile the homepage stays in the Tab order under a document’s or a collection’s pane: 64 presses to reach the pane, 43 of them hidden. The tour on the Excel page is non-modal, so Tab goes on to the page behind it. In a long answer an offer’s buttons can land behind the message box. A design’s part menu and a document’s bubble sit away from what opens them.

**Fix:** The homepage inert while covered, the tour a modal dialog, a margin clear of the box, and those menus next in order.

**Criteria:** 12.8. **Code:** `site/demo.js:61`, `app/ui/home.js`, `app/ui/style.css:71`, `app/caps/documents/bubble.js:90`.

## Found and fixed in this audit

What the reads found, and fixed the same day. A later read may fail the same criterion on something else: these are fixes, not a claim that a criterion is met.

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
| N28 | A heading’s link is for the pointer alone | A heading’s link is a named link the keyboard reaches, shown on focus and wherever nothing hovers, and the heading keeps its words as its name. |
| N32 | A chart with no title is named only “Chart” | A chart with no title is named by its series or what its data lists. |
| N35 | Words under AA | The bubble’s active button is in ink, a placeholder keeps to AA by night, and the families page’s source is clear of the card’s shadow. |
| N36 | Settings’ chosen option barely shows | Settings’ chosen option has an outline at 3:1, and the chosen look’s card a border at 3:1. |
| N38 | A chart’s legend works by pointer alone | A click on a chart’s legend no longer hides a series, so nothing on its canvas depends on the pointer alone. |
| N40 | A source’s link hides its number from its name | A source’s link starts with the number it shows. |
| N41 | Focus and pages change without being asked | A pane the person asked for takes the keys and one Jean opens leaves them. A language takes a press of its own: links on the homepage, Change language in Settings (D680). |
| N42 | Status messages still missing or wrong | While Jean waits on a decision the status says so, a retry is said, the 64 toasts that say something went wrong are alerts, and a collection’s review says how many are left, the keyboard kept. |
| N43 | Ids repeat with two panes open | Each pane and each document’s menus have ids of their own. |
| N45 | A change relies on automatic direction | A change’s lines take a resolved ltr or rtl. |
| N46 | A heading Jean changes loses its level | A changed heading keeps its level. |
| N48 | Example requests quoted without markup | The homepage’s example requests are quotations in <q>. |
| N49 | A new document’s instruction exists only in the style sheet | The instruction on a new document’s empty line is words in the page. |
| N50 | Without styles, messages show out of turn | The key form’s messages are hidden until they apply, and a change’s old version says it is one. |
| N52 | A figure hidden from screen readers | The 85% figure is read by screen readers. |
| N53 | Help that names controls by shape and place | Help names each control beside its shape and place, and the terms name their date. |
| N54 | What a changed cell says isn’t on its field | A changed cell’s words are on its field. |
| N55 | A request for approval scrolls sideways at 320 pixels | An approval and its address wrap at 320 pixels. |
| N56 | A tip’s Escape does more than close the tip | Escape closes a tip alone, and a tip in the app and on a name stays under the pointer. |
| N58 | Every task box has the same name | Each to-do box is named by its item. |
| N60 | The “Auto” button doesn’t say what it does | The chip says it chooses a brain, with what it shows. |
| N61 | Required fields not shown as required | The first brain’s and the lock’s required fields are tied to the line that says so. |
| N64 | Settings has no link past its sections | Settings has a skip link to its panel. |
| New | A decorative drawing was hidden by its parent alone | Site pages’ and a design’s ornaments carry aria-hidden on the svg itself. |
| New | A score’s player had no sound off | It has one, the music going on. |
| New | The app’s legal links looked like the words around them | They are underlined. |
| New | A collection’s shown columns had no group | They are a group named by their heading. |
| New | Language selects didn’t say what they ask | Settings’ has autocomplete="language", and the homepage’s is now links. |
| New | Nothing told how to leave a document’s table or list | The editor says so, and Keyboard shortcuts: Esc, then Tab. |
| New | An upright phone hid words of the homepage its side showed | It shows them. |
| New | A deck in an answer kept the page’s language | It takes its own once the stream reaches it. |

## Not verified

- **U1, Screen reader** (4.13, 7.1): What a screen reader announces: scripted controls (test 7.1.2) and charts and scores (4.13). *To close it:* A person with VoiceOver and Safari, and NVDA and Firefox, through a task, search, the menus, a sheet, a document, a collection, a chart and a score.
- **U2, Word’s and Excel’s accessibility checkers** (13.3): RGAA has an office document checked with its own program’s accessibility checker. Read in their XML instead: a .docx has real headings, lists, a table with a header row and its language, but no title; a .xlsx has a named sheet and a frozen, styled first row, not a declared table. *To close it:* Open each file in Word or Excel: Review › Check Accessibility.

## Seen outside the sample by the readers

Noted by the readers, and not counted unless a page above names them. For a criterion read more than once, the last reader’s note.

- **1.1:** A design holding a QR code draws <svg class='design-part'> with no role and no alternative (app/caps/designs/page.js:45), which would fail 1.1.5 on P15; the sampled design has no QR code, and I saw the code only in the source, since 'Code QR' needs a link before it draws. Pictures in documents and answers take their alt from the Markdown (app/caps/layouts/layouts.js:142, app/ui/markdown.js:131), so a brain that writes none gives none; not reached in the sample.
- **1.2:** Settings > Compétences, one skill's page, and the composer's "/" list draw svg.icon with no aria-hidden: caps/skills/ready.js:64, ui/complete.js:161. I saw it visible on the skill page (reader-g/shots/skill-detail.png). Neither page is in the sample; T1.2.4 would fail there, and with it this criterion.
- **1.3:** wordsOf has no cap: any flowchart with more boxes than P39 passes 80 characters and fails T1.3.9. P39's pass of that test holds only because the sample's chart is small.
- **1.6:** Why the gap counts: 'Réponses visuelles' (maps, diagrams, timelines) is on by default in Settings › Skills, and the fake brain's flowchart follows that skill. Strict reading on the sample: between chart and summary sits div.drawn-foot (Copy), and between score sheet and summary the player too, so they are not 'juste après' in the code; visually adjacent, and I accepted it.
- **1.7:** Outside the sample, listed in the chart skill's 'when they fit better': 'Voir les données' on a sankey or graph reads 'A [object Object] B [object Object]', and on a dataset-based chart the raw JSON (app/caps/charts/charts.js:35-36; out/flow13.log). That description isn't relevant.
- **1.9:** If P06's drawing were counted as a captioned image, it would fail 1.9.1: figure has neither role nor aria-label. I don't count it: the test names image tags.
- **2.1:** When the computer capability runs code it adds <iframe sandbox='allow-scripts' src='sandbox.html' hidden> with no title (app/ui/sandbox.js:62-65; seen live on 'savings over 10 years', reader-d/out/X-savings.json). Extensions do the same (app/caps/extensions/extensions.js:109-112). These are display:none, so assistive technology cannot reach them, the same effect that note 2 of the glossary's 'Titre de cadre' gives aria-hidden, though that note names only aria-hidden; I would not fail them, but a strict reader of 2.1.1 could, and the fix is one word. Frames in the browser, a saved page and a game have titles by their code (app/caps/browser/browser.js:239,315,529; app/ui/view.js:208; app/caps/games/frame.js:112). The share viewer's frame has title='' (app/caps/share/view.js:37), which has the attribute but says nothing (2.2).
- **2.2:** Outside the sample: a small app in an answer is always titled 'Page interactive' and a map 'Carte', accurate as to kind, the same for every one (out/X-diagram.json, out/X-map.json). Weak but I wouldn't fail it.
- **3.1:** Gap, multi-series chart: series differ by colour alone, in lines and legend (shots/X-multiline.png; patterns only under prefers-contrast). I accepted the table under 'Voir les données' as the 'other method', since the glossary asks for a visible text and this one is a click away; a stricter reader would fail 3.1.3 there too. Passing: P35's changes (underline, 'Nouveau', 'Jean retire ce passage'), P07's callouts and best cells (bold), errors in words.
- **3.2:** The same gold link on a word Jean added (.suggest-new, #ded7c1) would be 3.54:1, calculated, not seen in the sample.
- **4.1:** Outside the sample: a film a brain makes is a video with controls, an aria-label holding the request, and no track, transcript or description beside it (out/X-film.json). It would fail 4.1.2 and 4.7.1. Films aren't among the outputs the homepage lists.
- **4.7:** See 4.1 on films: 'Here is your film.' doesn't identify one.
- **4.8:** Why the gap counts: 'cartes' is in the homepage's outputs, and its card 'La sortie vélo de dimanche' shows a map. The fake's tiles didn't paint in my run (shots/X-map-drawn.png): I read the DOM and source, not a finished map.
- **4.9:** Outside the sample: sankey and graph, as in 1.7.
- **4.10:** Voice and Live modes weren't run.
- **4.11:** Films made on the device, live voice and the camera use real media and are not in the sample.
- **4.12:** A chart whose brain asks for dataZoom keeps a canvas-only slider with no keyboard way (option.js does not strip it; tried: 0 focusable, shots/P17-datazoom.png). An app page listening to a map's 'pick' would offer a choice the keyboard cannot make. Either would fail this criterion if sampled.
- **5.4:** A brain writing a heading right above a table would make the case stronger.
- **5.5:** Those untitled tables are for criterion 5.4, which isn't mine. Whether the aria-label is announced wasn't tested with a screen reader.
- **5.6:** D1 and D2 mark the first row as a header (w:tblHeader) and not the first column; D3 freezes its first row. Empty th at the corner of P07's and P18's tables isn't a failure of this test.
- **6.1:** Links in answers are a brain's words: nothing stops 'cliquez ici'.
- **7.2:** An answer's receipt button shows a shield for a private answer and an info mark otherwise, under one fixed name, 'À propos de cette réponse' (app/caps/receipt/receipt.js:330-332). It is drawn per answer rather than updated, so I do not count it, but the shield's meaning reaches only those who open the card. A map's aria-label stays 'Map' as its contents change; I treat that under 1.1, though a reader could raise it under 7.2.2.
- **7.4:** On Windows and Linux, Chromium fires change on each arrow key in a closed select: there, arrowing through this list would add a column at each press and throw the focus out. Not measured here (macOS opens the list instead). A file <select> in the pane head (tree/app/ui/preview.js:156) swaps the shown file on change; no sample page holds several files.
- **7.5:** Connection and brain troubles use role=status with an error in them (.brain-wait, tree/app/ui/brain-pages.js:377, :459; .connection-wait, tree/app/caps/connections/page.js:104): an error in status would fail 7.5.2 if met. Not in the sample's states.
- **8.1:** An answer's own html page is not in the sample. It goes through the same relay as P40's frame, which writes the doctype first (preview.html:45); not read live.
- **8.2:** A strict reader may treat select > button as invalid where a validator predates customizable select. Browsers without it drop the button.
- **8.6:** A task with no title of its own (list shows 'Nouvelle tâche') keeps the homepage's 'Jean · Créez avec l’IA de votre choix, gardez tout'. The first-brain steps P24-P26 keep the same title; they are states of that page.
- **8.7:** A mixed answer gets one lang for the whole answer, by the code. Collection cells (P14, P36, P37) carry no lang. On P16 the inline deck's English slides sit in div lang=fr, which is a wrong indication (8.8's matter).
- **8.8:** Documents (P13) carry no lang on their English, Arabic and Japanese paragraphs, so 8.8 has nothing to judge there: that is 8.7.
- **8.10:** An Arabic answer on a French interface relies on dir="auto" for its only direction: the same letter, no loss. In P12's card preview the document's Arabic paragraph has no dir of its own under <div class="prose" dir="auto"> resolved to ltr: wrong direction, but aria-hidden and clipped out of sight.
- **9.1:** An answer's Markdown headings move down one level (## becomes h3, seen on P07-buy) with no h2: a jump the glossary allows.
- **9.4:** A brain quoting someone inline writes plain quote marks: Jean's Markdown has no path to <q>, so such an answer would fail 9.4.1. Not in the sample's answers.
- **10.1:** A math answer's MathML (temml) may carry width on mspace; no sample page holds math, so not read.
- **10.4:** Pinch-zoom on a trackpad would enlarge the sheet, as it would any page; I did not count it as the test's browser zoom. A deck in the answer with the pane closed goes from 19.1 to 31.2 px, 163%, and by calculation at most about 174% in full screen; the sample's P16 is the pane.
- **10.6:** Looks other than Terminal, Mondrian and the default were not measured; a look that removed underlines would change this. Dark themes not walked.
- **10.7:** At 320×256 the fixed box covers focused links on the homepage (P01). After 'Tout accepter' on P14, or Escape closing a pane, focus falls to body, so nothing shows until the next Tab.
- **10.9:** A collection's filter tool shows an active filter only by colour (tree/app/caps/tables/tables.css:5, data-on, no aria state): that is criterion 3.1's, not this one.
- **10.11:** A collection with no pending changes is usable at 320x256 (.table-scroll 90 px). .ent-address would overflow on any host longer than jean.is, but only jean.is serves that page.
- **10.13:** Deck charts use the same canvas tooltip.
- **11.1:** Editing a request in a task (main use, not listed in the sample): app-edit textarea aria-label only, no title (app/ui/edit.js:44), shot reader-c/shots/P07-edit-request.png.
- **11.2:** Settings › Cerveaux (not sampled): the select of brains is named 'Toujours le même' (ui, .brain-same), which does not say it picks a brain; it would be a borderline failure of 11.2.3 if that page were in the sample.
- **11.7:** P30's look gallery (input[name=look]) has no legend, which is 11.5, not this reader's.
- **11.8:** The '/' menu in the box isn't in the sample, but appears in any task.
- **11.10:** Collection cells of type email, url and date have no visible format error; they are outside a form.
- **11.12:** P28's #sent says nothing of how to correct a request; I don't count it, since the commitment is the separately signed quote.
- **11.13:** The 'Ajouter un profil' dialog, one press from P05 and the profile menu, has a name field for the person with autocomplete=off (tree/app/caps/profiles/dialog.js:55): it would fail if that dialog were sampled. Settings › À propos de vous has given-name, correct.
- **12.3:** With a French browser /site-map's 'Homepage' opens the French home, by language detection, not a wrong link.
- **12.4:** /ar's 'خريطة الموقع' opens the English site map, as Arabic has none.
- **12.8:** (b) needs a person with no task yet, or who has deleted their last one, on the homepage's address. (c) needs the offer, which came after a person's second task here.
- **12.10:** Not run: a deck saved as its own web page, where the root may be the page. Games use WASD inside their frame. A workbook's cell starts editing on any character, inside its frame.
- **12.11:** A loaded map's click on a place (P40) could not be tried: tiles were not available offline. It tells the page rather than opening controls (tree/app/caps/interactive/map.js:114).
- **13.1:** 13.1.4 would fail where an organisation's policy sets session.idle (e.g. PT15M, app/ee/session.js): the person can't remove or extend it, under 20 hours, no warning (app/ee/idle.js, not run). Policy-only.
- **13.5:** Before its skill is added, a brain's ```abc, ```echarts or deck block shows as raw code with only the answer's words around it. What a brain writes in an answer is outside Jean's control.
- **13.7:** Games and pages a brain writes could flash; they aren't in the sample.
- **13.8:** The look Pièce adds a moving light behind the page while Jean works (tree/app/ui/style.css:106-108); the same setting stops it. The blinking cursor in tree/app/ui/dialogs.css:163 shows only on a machine's card that is waking or working, not in the sample.
- **13.9:** Phone emulation in Chromium, not a real rotating device.

## How each criterion was judged

- **Fourth read: an AI reader given no earlier verdict, told of no fix:** 1.2, 1.3, 3.2, 3.3, 4.11, 4.12, 5.4, 6.1, 6.2, 7.4, 7.5, 8.2, 8.8, 8.10, 9.1, 9.4, 10.2, 10.3, 10.6, 10.8, 10.9, 10.10, 10.11, 10.13, 10.14, 11.2, 11.5, 11.9, 11.10, 11.13, 12.4, 12.7, 12.9, 13.9
- **Third read: an AI reader given no earlier verdict:** 1.1, 2.1, 5.7, 7.2, 8.1, 8.3, 8.4, 8.5, 10.1, 10.4, 11.6, 12.6, 12.8, 12.11, 13.2, 13.8
- **Second read: an AI reader given no earlier verdict:** 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 2.2, 3.1, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10, 5.1, 5.2, 5.3, 5.5, 5.6, 5.8, 8.6, 8.7, 8.9, 9.3, 10.5, 10.7, 11.1, 11.3, 11.4, 11.7, 11.8, 11.11, 11.12, 12.2, 12.3, 12.5, 12.10, 13.1, 13.4, 13.5, 13.6, 13.7, 13.11, 13.12
- **First reading: a tool, then by hand:** 7.3, 9.2, 10.12
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

No separate contact page exists. The five random pages come from the 46 others by a hash of the commit and the date (`51494c91|2026-11-01|RGAA`), 11.4% of the other 44. Documents and collections are in the sample as people meet them: new and empty, in use, their menus, Jean’s changes, a board, and the files they are saved as. The reads’ verdicts and pictures are kept outside the repository.

## Tools and environment

Chromium 156 (Playwright 1.64) on macOS 27, keyboard and pointer; no assistive technology. axe-core 4.14, html-validate 9.7 in place of the W3C validator, Jean’s pixel measures from `test/contrast.spec.js` and `test/nontext.spec.js` extended to every state of the sample, `test/site.spec.js`, `test/reflow.spec.js`, `test/targets.spec.js` and `test/motion.spec.js`: 224 passed, 0 failed, 69 skipped in WebKit by design. The third and fourth reads walked the same sample in the same browser, keyboard and pointer, with everything beyond this computer blocked in the fourth. No online checker was used in them.
