# RGAA 4.1.2 audit of jean.is

Internal audit by Warehouse SAS, 1 and 2 November 2026. An AI, Claude by Anthropic, made the tests and the first judgments. Separate AI readers, given none of those judgments and told of no fix, then judged the criteria again in six rounds on frozen copies, and the owner adopted their verdicts. No person has checked the judgments or tested with a screen reader. Tested last: main at 81c43b9b, frozen to a copy with every result removed.

## Result

**71 of 88 applicable criteria met: 80.7%, which is partially conformant.** 14 not met, 3 not verified and counted as not met, 18 not applicable, out of 106.

Of the 71 met, 19 rest on the second read, 12 on the third, 18 on the fourth, 8 on the fifth, 3 on the sixth and 11 on the seventh. If 28 of the met were wrong, the rate would fall under 50% and the status would be “not conformant”. The grid is [rgaa-audit-2026-11.xlsx](rgaa-audit-2026-11.xlsx).

## How it was counted

For each criterion, the last verdict counts.

| Round | What it judged | On | Result |
|---|---|---|---|
| First reading | All 106, by the AI that also made fixes | Working tree of 1 November | 77 of 88, which no later read upheld |
| Second read | 71 criteria, three AI readers | The tree on 0e3ea3f4 plus work not yet committed | 46 of 88 |
| Third read | The 27 met that no reader had seen, three AI readers | deb33e35 | 12 stood, 15 failed: 31 of 88 |
| Fourth read | The 34 that fixes claimed to close, three AI readers told of no fix | a41d8634 | 18 stood, 16 failed: 49 of 88 |
| Fifth read | The 19 that the next fixes claimed to close, three AI readers told of no fix | 7cb64458 | 10 stood, 9 failed: 59 of 88 |
| Sixth read | The 11 that the fixes after those claimed to close, three AI readers told of no fix | a262502b | 3 stood, 8 failed: 60 of 88 |
| Seventh read | The 24 that a batch of fixes claimed to close, four AI readers told of no fix | 81c43b9b | 11 stood, 13 failed: 71 of 88 |

Readers differ, so a “met” isn’t final: the sixth read failed 8.10, which the fifth had passed, on code unchanged between them, and failed 9.1 partly on card titles that had been there at the fifth. Part of what moves between reads is the reading, not the code, so this share has a margin no single read shows.

Criteria met on an earlier read weren’t read again after later fixes, so one could have regressed. Every criterion not met rests on a reader’s verdict. A flowchart, a map and an answer with sources were added to the sample as gaps the readers judged, and marked NW on the criteria they weren’t walked for. No reader’s “not met” went back to met without a later reader’s verdict.

| Theme | Met | Not met | Not verified | Not applicable |
|---|---|---|---|---|
| 1. Images | 5 | 0 | 0 | 4 |
| 2. Frames | 2 | 0 | 0 | 0 |
| 3. Colours | 0 | 3 | 0 | 0 |
| 4. Multimedia | 5 | 0 | 1 | 7 |
| 5. Tables | 4 | 0 | 0 | 4 |
| 6. Links | 2 | 0 | 0 | 0 |
| 7. Scripts | 2 | 2 | 1 | 0 |
| 8. Mandatory elements | 8 | 2 | 0 | 0 |
| 9. Structure | 2 | 2 | 0 | 0 |
| 10. Presentation | 12 | 2 | 0 | 0 |
| 11. Forms | 11 | 2 | 0 | 0 |
| 12. Navigation | 11 | 0 | 0 | 0 |
| 13. Consultation | 7 | 1 | 1 | 3 |

## Non-conformities

### N59. Grouped lists built with a listbox

Search’s results and the box’s / menu group options with role="group" inside a listbox, which RGAA’s note on 11.8 counts as not conformant though ARIA 1.2 allows it. The verdict rests on the note’s letter.

**Fix:** Separate listboxes per group, or native <optgroup>.

**Criteria:** 11.8. **Code:** `app/caps/find/find.js:283`, `app/ui/complete.js:398`.

### N90. A document’s changed words are a tint alone

Inside a line of a document with Jean’s changes, the words Jean added or altered are marked by a pale tint alone, 1.3:1 against the page; the underline shows only when more contrast is asked for. The gold bar and the row of buttons say a block changed, not which words.

**Fix:** An underline on the changed words at all times, kept calm.

**Criteria:** 3.1. **Code:** `app/caps/documents/editor.css:114`, `app/caps/documents/suggest.js:204`.

### N91. Two small words a shade under AA

On the families page, the drawn box’s “Jean est une IA et peut se tromper” sits on its own drop shadow at 4.31:1 to 4.51:1. In an answer, while a comparison’s head is stuck under the toolbar’s fade, the top of its “Recommandé” tag falls to 3.9:1 to 4.1:1. Both rest on measuring the darkest pixel behind the letters.

**Fix:** The family box’s line off its shadow or in the softer ink, and the toolbar’s fade kept off a stuck table head.

**Criteria:** 3.2. **Code:** `site/family/family.css`, `app/caps/layouts/layouts.css`.

### N92. The message box’s focus in two looks

In the Mondrian look the box shows the keys only by a pale yellow halo, 1.44:1 against the page, its black border the same in both states; in the Terminal look, focus only darkens a 1px border, a change of 1.65:1.

**Fix:** A ring of at least 3:1 on the box in every look.

**Criteria:** 3.3, 10.7. **Code:** `app/ui/looks/mondrian.css:65`, `app/ui/looks/terminal.css:79`, `app/ui/style.css:539`.

### N93. Cards that take the keys out of sight

In Creations beside a pane, with an offer showing, a card that takes the keys can stay hidden under the sticky offer and the message box: nothing scrolls it into view.

**Fix:** Scroll padding for the sticky box and offer in Creations, as in a task.

**Criteria:** 10.7. **Code:** `app/ui/creations.css`, `app/ui/style.css:71`.

### N94. Pointing at a slide’s part takes a click

A click on a slide’s words points Jean at that part, a ring and a note to the brain; from the keyboard nothing points a part, and no other control does it.

**Fix:** A slide’s parts reachable by the keyboard, Enter pointing one, or a command that does.

**Criteria:** 7.3. **Code:** `app/caps/slides/slides.js:162`, `app/caps/slides/slides.js:259`.

### N95. The demonstrations don’t say what they replay

On the help article and the Excel page, pressing the demonstration’s button replays a task whose “Réflexion…” and “Répondu par…” sit in a frame with no live region, and the button hides itself, focus falling to the page.

**Fix:** The app’s status region in the demonstration’s frame, and the button kept with the keys.

**Criteria:** 7.5. **Code:** `app/ui/demo.js:118`, `app/demo.html`.

### N96. English in French pages unmarked

An answer takes one language for the whole of it, so its English first line reads as French; search’s English extracts, the titles of English decks, designs and tasks, and a document’s short English heading carry no lang.

**Fix:** lang per block of an answer, and on the snippets and names whose language Jean knows or detects surely.

**Criteria:** 8.7. **Code:** `app/caps/made/made.js:256`, `app/caps/find/find.js:272`, `app/ui/preview.js:158`, `app/ui/inbox.js:77`.

### N97. dir="auto" by the letter

The app sets dir="auto" on the box, requests, answers, titles and search’s options; RGAA’s glossary knows only ltr and rtl. In the sample it always resolves to the direction around it, so nobody loses anything.

**Fix:** The resolved direction written, from the text’s first strong letter.

**Criteria:** 8.10. **Code:** `app/ui/composer.js:116`, `app/ui/chat.js`, `app/ui/inbox.js:77`, `app/caps/find/find.js:272`.

### N98. The drawer isn’t navigation

The drawer that lists the tasks, New task and Creations, the app’s way between its views, is a complementary region, not a nav, while Settings’ column of sections is a nav.

**Fix:** The drawer’s tasks and places in a nav named Tasks.

**Criteria:** 9.2. **Code:** `app/ui/shell.js:44`.

### N99. A drawn profile card’s pairs

On the families page, the profile card gives each label and its value in spans in a paragraph, where the rest of the site uses a description list.

**Fix:** A dl, a dt and a dd per row.

**Criteria:** 9.3. **Code:** `site/family/page.js:124`.

### N100. One look’s box over the note, at 320 pixels

In the Mondrian look at 320 and 375 pixels wide, the box’s 6px border covers half of “Jean est une IA et peut se tromper” under it, at every scroll position.

**Fix:** The note clear of the box in that look’s narrow layout.

**Criteria:** 10.11. **Code:** `app/ui/looks/mondrian.css:64`, `site/home/home.css`.

### N101. Two fields without a name RGAA lists

Appearance’s text size readout, an output, has no label of any kind; a design’s layout choices are radios named by aria-label alone, with no title and no visible name. A page a brain wrote has a wrapping label, which is the brain’s.

**Fix:** aria-labelledby on the readout, and a title on each layout choice.

**Criteria:** 11.1. **Code:** `app/ui/look-page.js:80`, `app/caps/designs/view.js:300`.

### N102. A map turns and tilts with two fingers

A map keeps its two-finger rotate and tilt and its right-drag rotate, and its compass is hidden, so there is no one-tap way to turn it or set it straight. Zoom has buttons.

**Fix:** Turning and tilting off, or the compass shown.

**Criteria:** 13.10. **Code:** `app/caps/interactive/map.js:110`.

## Found and fixed in this audit

What the reads found, and fixed since. A later read may fail the same criterion on something else: these are fixes, not a claim that a criterion is met.

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
| N33 | A flowchart has no description, and its alternative lists its words | A flowchart’s alternative says where it starts and that its words are just below, where a fold gives each step and what follows it. |
| N37 | A map has nothing in text | A map is named by what it holds, in the person’s language, and a fold under it lists its places in text. |
| N65 | A link in a selected block falls short of AA | A link in a selected block is in ink. |
| N66 | What is active barely shows | What is active in search and a document’s menus has an outline at 3:1, a pressed bubble button a border, and a changed cell a mark in its corner. |
| N67 | Tables not tied to what titles them | An answer’s table takes the heading or the line ending in a colon above it as its name, and the homepage’s is tied to its heading. |
| N68 | A column’s kind and a pane at a narrow window change context | A column’s kind is chosen from a menu of buttons. At a narrow window a pane Jean opens waits, with a message and a button to open it, and at a wide one the keyboard stays where it was. |
| N69 | Messages still silent or under the wrong role | The key form’s note is an alert, so are offers, and a deck’s slide count is a status. |
| N70 | A language marked wrongly | Jean’s own words in an answer carry the interface’s language, and an answer takes a language only when the detector is sure. |
| N71 | The wordmark relies on automatic direction | The wordmark has a resolved direction. |
| N72 | Titles that aren’t headings | A comparison’s card has a heading, and a design’s title is a heading on its page, not on its thumbnails. |
| N74 | Hidden drawings hold words found nowhere else | The words beside the families page’s drawings say what they show. |
| N75 | Capabilities tells what is found only by an icon | Capabilities says in hidden words which ones aren’t found yet. |
| N76 | A collection’s review leaves no room for its table | At a short window, a collection’s table keeps a least height under the review bar. |
| N77 | Tips that cover words and can’t be dismissed | On a product’s page Escape hides a source’s tip, which stays under the pointer, and a chart’s tip comes with a click, which Escape hides too. The comparisons’ own page still lacks Escape: N89. |
| N78 | The key form refuses an address without saying how | The key form’s hint says https and its field checks it, and the service answers back at the form, naming the fields. That answer needs the service’s own deploy. |
| N79 | The lock screen has no way to the site map | The lock screen links to the site map and to Help. |
| New | What changes in place, such as a file added or a capability turned on, was seen and not heard | It is said in the status region, shown or not. |
| New | A stopped answer said something had gone wrong | It says it was stopped. |
| New | A creation’s card named it without its kind, and a pinned task or a routine said so by an icon alone | The card’s name says its kind, and hidden words say pinned or routine. |
| New | A chart’s and a score’s words weren’t tied to them | aria-describedby points at the fold holding their figures or notes. |
| New | A deck’s bar and a creation’s name could run out of a narrow window | They wrap. |
| New | The primary button fell short of AA under the pointer | It keeps its contrast. |
| New | Latin words on the homepage in Arabic ran in the page’s direction, and an answer mixing scripts took one direction | Most Latin runs carry their direction, N86 naming the rest, and each block of an answer its own. |
| N14 | The homepage’s content is outside <main> | Under the first screen, the homepage is the one main landmark while it shows; the app’s legal links are a footer. |
| N21 | A design’s words overlap with more text spacing | A design’s words are fitted again, on screen, when a reader’s text spacing makes them overflow. |
| N24 | One way around the app until search is found | Search is there from the first task, in the bar and by ⌘K. |
| N25 | Dragging only, to move panes and columns | A pane’s head has a menu that moves it before, after or under the task and sizes it; a column’s and a row’s menus move them. |
| N34 | States shown by colour alone | A collection’s Filter and Settings say how many rules are on, in ink, with a pressed state; search’s found words are bold too. A document’s changed words: N90. |
| N39 | Row heads in tables aren’t headers | Tables in answers and documents give row heads where the first column names its rows, and a collection’s name column is one. |
| N44 | A document’s other languages aren’t marked | A document’s block carries its language when Jean is sure of it, never in the file. English elsewhere: N96. |
| N47 | Menus not marked as lists | Menus, Settings’ sections, the homepage’s strip and the site’s languages are lists, and a board’s card a description list. The families page’s card: N99. |
| N51 | A document’s focus is weak | A document shows it has the keys with a line along its text’s edge. |
| N57 | Fields labelled in ways RGAA’s test doesn’t list | Every label has for, and a field named by aria-label alone has a title. Two left: N101. |
| N62 | Wrong values get no help | A value a collection’s column refuses stays, marked invalid, with an example; a recovery code’s form is said beside it. |
| N63 | Deleting acts at once | Undo says how long it lasts and holds while the keyboard is on it; a deleted row or column and Accept all or Reject all have one. |
| N73 | A design’s words shrink under zoom | Under a browser’s zoom, a design keeps its size and scrolls in its stage. |
| N80 | Search and the legal links have no landmark | Search is a landmark, and the legal links a footer. |
| N81 | Tab lands where nothing shows | The homepage is out of the keys’ way under a pane, the Excel page’s tour is a modal dialog, an offer scrolls clear of the box, and a menu follows what opens it. |
| N82 | What Jean would remove fades out, and a hovered menu row’s hint falls short | What Jean would remove keeps its words whole, at AA, struck through; a hovered menu row’s hint is in the softer ink. |
| N83 | The ring on a design’s part can match its page | A design’s part has a two-tone ring that stands out on any page. |
| N84 | Messages still silent or under the wrong role | Searches that find nothing, a score’s sounds loading and a design’s check are said in the right roles. |
| N85 | Jean’s own words under a design’s or a deck’s language | Jean’s controls in a design and a deck diagram’s description carry the interface’s language. |
| N86 | Words with no direction of their own | The profile menu’s languages and the Arabic homepage’s Latin words carry their direction. dir="auto" elsewhere: N97. |
| N87 | Card titles that aren’t headings | Card titles on the comparisons’ page, the page for IT and the public sector’s are headings. |
| N88 | Words gone or pushed aside at 320 pixels | At 320 pixels the comparisons’ heads, Creations’ words and a file’s card all show. A design’s versions scroll sideways in one row, read as pictures, which RGAA excepts; one reader of four didn’t. One look’s box over the note: N100. |
| N89 | A source’s tip on the comparisons’ page ignores Escape | The comparisons’ page hides a source’s tip with Escape, and the homepage’s tiles change on a press. |
| New | There was no way to ask for more contrast in Jean itself, only through the system | Settings › Appearance has Contrast: Auto, Usual or More, which turns the rules for more contrast on. |
| New | Room’s red for danger was 2.7:1 by day | It has a day red, 5.6:1. |
| New | A saved Word or Excel file had no title | Each carries its name as its title. |

## Not verified

- **U1, Screen reader** (4.13, 7.1): What a screen reader announces: scripted controls (test 7.1.2) and charts and scores (4.13). *To close it:* A person with VoiceOver and Safari, and NVDA and Firefox, through a task, search, the menus, a sheet, a document, a collection, a chart and a score.
- **U2, Word’s and Excel’s accessibility checkers** (13.3): RGAA has an office document checked with its own program’s accessibility checker. Read in their XML instead: a .docx has real headings, lists, a table with a header row and its language, but no title; a .xlsx has a named sheet and a frozen, styled first row, not a declared table. *To close it:* Open each file in Word or Excel: Review › Check Accessibility.

## Seen outside the sample by the readers

Noted by the readers, and not counted unless a page above names them. For a criterion read more than once, the last reader’s note.

- **1.1:** A picture in an answer takes its alt from the brain’s Markdown (caps/layouts/layouts.js:143), so ![](x.png) gives alt="" on an informative picture. A design with a real picture and a slide with a picture were not in the sample.
- **1.2:** Settings > Compétences, one skill's page, and the composer's "/" list draw svg.icon with no aria-hidden: caps/skills/ready.js:64, ui/complete.js:161. I saw it visible on the skill page (reader-g/shots/skill-detail.png). Neither page is in the sample; T1.2.4 would fail there, and with it this criterion.
- **1.3:** Chart and map names list every name in them with no limit (charts.js:139, caps/interactive/map.js:140), so a chart of many series or a map of many places passes 80 characters; RGAA only recommends that length.
- **1.6:** A chart with neither series data nor a dataset falls back to its raw JSON as the description (charts.js figures()). Pictures a brain generates, charts inside pages of parts and games were not in the sample and not judged.
- **1.7:** Outside the sample, listed in the chart skill's 'when they fit better': 'Voir les données' on a sankey or graph reads 'A [object Object] B [object Object]', and on a dataset-based chart the raw JSON (app/caps/charts/charts.js:35-36; out/flow13.log). That description isn't relevant.
- **1.9:** If P06's drawing were counted as a captioned image, it would fail 1.9.1: figure has neither role nor aria-label. I don't count it: the test names image tags.
- **2.1:** When the computer capability runs code it adds <iframe sandbox='allow-scripts' src='sandbox.html' hidden> with no title (app/ui/sandbox.js:62-65; seen live on 'savings over 10 years', reader-d/out/X-savings.json). Extensions do the same (app/caps/extensions/extensions.js:109-112). These are display:none, so assistive technology cannot reach them, the same effect that note 2 of the glossary's 'Titre de cadre' gives aria-hidden, though that note names only aria-hidden; I would not fail them, but a strict reader of 2.1.1 could, and the fix is one word. Frames in the browser, a saved page and a game have titles by their code (app/caps/browser/browser.js:239,315,529; app/ui/view.js:208; app/caps/games/frame.js:112). The share viewer's frame has title='' (app/caps/share/view.js:37), which has the attribute but says nothing (2.2).
- **2.2:** Outside the sample: a small app in an answer is always titled 'Page interactive' and a map 'Carte', accurate as to kind, the same for every one (out/X-diagram.json, out/X-map.json). Weak but I wouldn't fail it.
- **3.1:** A failed activity step is shown by a red dot (app/ui/style.css:484), with 'failed' only in visually hidden text (app/ui/chat.js:358). That would fail 3.1 wherever it appears. None appeared in the sample.
- **3.2:** Text that scrolls under the toolbar fade, the sticky composer or offers fades for a moment (not counted). The design 'takes' thumbnails hold tiny low-contrast miniature text (treated as pictures of options).
- **3.3:** The looks outside the sample (Human, Mail, Neon and others) were not walked.
- **4.1:** Outside the sample: a film a brain makes is a video with controls, an aria-label holding the request, and no track, transcript or description beside it (out/X-film.json). It would fail 4.1.2 and 4.7.1. Films aren't among the outputs the homepage lists.
- **4.7:** See 4.1 on films: 'Here is your film.' doesn't identify one.
- **4.8:** Maps in pages with forms (their 'pick' event) and caps/flows' canvas, games and the camera were not in the sample. They could hold media whose alternative is not checked here.
- **4.9:** Outside the sample: sankey and graph, as in 1.7.
- **4.10:** Voice and Live modes weren't run.
- **4.11:** Films made on the device, live voice and the camera use real media and are not in the sample.
- **4.12:** A chart whose brain asks for dataZoom keeps a canvas-only slider with no keyboard way (option.js does not strip it; tried: 0 focusable, shots/P17-datazoom.png). An app page listening to a map's 'pick' would offer a choice the keyboard cannot make. Either would fail this criterion if sampled.
- **5.4:** The document editor does not do what answers do: a table directly under a heading or a colon line has no name in a document (tried with "Le budget :": no aria-label, aria-labelledby or caption). A document like that would fail. In D1 and D2 the same lead-in has no w:tblCaption in the Word file.
- **5.5:** Those untitled tables are for criterion 5.4, which isn't mine. Whether the aria-label is announced wasn't tested with a screen reader.
- **5.6:** Answer and document tables only get row headers when every first-column cell has a letter and no digit (app/ui/markdown.js:113 namesRows): a brain's table whose rows are named '2024', 'T1 2025' or 'Semaine 1' would leave those row labels as <td> and fail 5.6.2. D1/D2 (Word) mark the header row (w:tblHeader); D3 (Excel) only styles and freezes row 1; these files fall under 13.3, not 5.6.
- **6.1:** Links in answers are a brain's words: nothing stops 'cliquez ici'.
- **7.2:** An answer's receipt button shows a shield for a private answer and an info mark otherwise, under one fixed name, 'À propos de cette réponse' (app/caps/receipt/receipt.js:330-332). It is drawn per answer rather than updated, so I do not count it, but the shield's meaning reaches only those who open the card. A map's aria-label stays 'Map' as its contents change; I treat that under 1.1, though a reader could raise it under 7.2.2.
- **7.3:** tables/view.js:142 blurs a cell after a storage-refused edit, and knows.js:133 blurs the 'what Jean knows' field on Enter: focus is dropped to body, not in the sample. Double-clicking the splitter resets it to the default width; the keyboard only has step-by-step arrows. A brain-written chart with dataZoom (sliders and drag) is not stripped by charts/option.js. The sample has none.
- **7.4:** Restoring a backup reloads the page 1.2 s later (caps/backup/backup.js:38), after a toast; not walked.
- **7.5:** Help articles and pages that frame other demos (D457) share demo.html and would fail the same way.
- **8.1:** An answer's own html page is not in the sample. It goes through the same relay as P40's frame, which writes the doctype first (preview.html:45); not read live.
- **8.2:** A strict reader may treat select > button as invalid where a validator predates customizable select. Browsers without it drop the button.
- **8.6:** A task with no title of its own (list shows 'Nouvelle tâche') keeps the homepage's 'Jean · Créez avec l’IA de votre choix, gardez tout'. The first-brain steps P24-P26 keep the same title; they are states of that page.
- **8.7:** Any answer that quotes another language inside a mostly French one gets the same treatment, because detection is per answer. aria-hidden creation previews (P12) show the document's Arabic and Japanese lines without lang, but they are hidden from assistive technology and cropped.
- **8.10:** A chat message or task title in Arabic in a French interface would rely on dir='auto' alone: right in rendering, but 'auto' again. Creation previews on P12 hold the document's Arabic paragraph under a dir='auto' container that resolves to ltr, without a dir of its own. It is aria-hidden and cropped out of view in the sample, but would show for a document that starts in Arabic.
- **9.1:** Conversation titles come from the brain; a seeded task without one shows h1 'Nouvelle tâche'.
- **9.2:** Also arguable, not counted: the composer (the core function) sits outside <main> on every app page and the homepage's first screen (h1 + composer) sits above its <main> on P01/P31 (the glossary allows leeway on homepages); the open document or collection is an <aside> (complementary) even when it fills the screen at 320 px; the lock screen's 'Plan du site · Centre d'aide' row is a <p> inside <main>, not a <footer>.
- **9.4:** A brain quoting someone inline writes plain quote marks: Jean's Markdown has no path to <q>, so such an answer would fail 9.4.1. Not in the sample's answers.
- **10.1:** A math answer's MathML (temml) may carry width on mspace; no sample page holds math, so not read.
- **10.4:** For a returning person, the new-task screen at 200% shows an offer (for example 'Laisser Jean choisir le cerveau…'). The welcome question and its pitch then stay under the sticky offer at every scroll position until 'Non merci' (reader-p/shots/z35-0.png to z35-140.png). If that screen were in the sample, 10.4 would fail.
- **10.6:** Looks other than Terminal, Mondrian and the default were not measured; a look that removed underlines would change this. Dark themes not walked.
- **10.7:** The conversation keeps focus clear of the composer (scroll-margin, app/ui/style.css:71) but Créations does not. In P26's error state, 'Retour' sits under the toolbar fade with only the bottom of its ring showing.
- **10.9:** A brain writes its own words: the fake brain's 'Look at the dot on the date' (P15) relies on a shape and on the design's dot; a real answer could say 'the button on the right'. Jean's own strings do not.
- **10.10:** The ABC text is a pertinent equivalent only for someone who can read ABC notation or letter names; a long tune would be heavy going. The map's words list names, not where places lie, which is enough for the sample's two stops and less for a route that matters by geography.
- **10.11:** The same overlap appears on phones about 375 px wide in the Mondrian look.
- **10.13:** With long task titles, hovering a row brings 'Plus d'options' into the row and would cut more of the title, with no way to hide it but moving away (10.13.1). Creations' start cards fan out on hover once many kinds are unlocked (app/ui/creations.css:58) and may push neighbours out of the clipped row; P12 shows three cards and no fan.
- **11.1:** The first brain step adds a checkbox 'first-also' only where this device can run the local brain (not in headless Chromium). It has label[for]. Any page a brain writes (P39 kind) can hold fields labelled however the model wrote them.
- **11.2:** Settings › Cerveaux (not sampled): the select of brains is named 'Toujours le même' (ui, .brain-same), which does not say it picks a brain; it would be a borderline failure of 11.2.3 if that page were in the sample.
- **11.7:** P30's look gallery (input[name=look]) has no legend, which is 11.5, not this reader's.
- **11.8:** The '/' menu in the box isn't in the sample, but appears in any task.
- **11.10:** Wrong-password lines ('Cela ne l'ouvre pas.') have role=alert with no link to the field; that is not an empty-field or format message, so 11.10 does not reach them. Other forms in the code were not walked: the share dialog, routines, connections, projects, profiles, skills, search keys.
- **11.11:** At P27, after a password mismatch is corrected, the alert 'Les deux mots de passe diffèrent.' stays on screen through the recovery-code step (reader-s/app-e2.out, lock.js:322). That is a stale error (criterion 11.10), not a missing suggestion. On P28 a refused request reloads the page empty, so everything typed is lost (11.10/11.12 territory, not this criterion).
- **11.12:** If an auditor reads P28's subscription request as having financial consequences (the privacy line says Warehouse SAS will invoice a subscription), the form itself has no checkbox, no review step and no stated way to cancel, and the verdict would rest on the signed quote counting as the extra step. Deleting a profile ('Repartir de zéro', lock.js) uses a native confirm, and is not in the sample.
- **11.13:** The 'Ajouter un profil' dialog, one press from P05 and the profile menu, has a name field for the person with autocomplete=off (tree/app/caps/profiles/dialog.js:55): it would fail if that dialog were sampled. Settings › À propos de vous has given-name, correct.
- **12.3:** With a French browser /site-map's 'Homepage' opens the French home, by language detection, not a wrong link.
- **12.4:** A copy an organisation hosts has no site map: the page does not ship (site/site-map/page.js:12) and sitePage() returns null without the homepage (app/ui/state.js:272-276), so none of this appears there; the criterion would not apply to such a copy but 12.1 might.
- **12.10:** Not run: a deck saved as its own web page, where the root may be the page. Games use WASD inside their frame. A workbook's cell starts editing on any character, inside its frame.
- **12.11:** A loaded map's click on a place (P40) could not be tried: tiles were not available offline. It tells the page rather than opening controls (tree/app/caps/interactive/map.js:114).
- **13.1:** 13.1.4 would fail where an organisation's policy sets session.idle (e.g. PT15M, app/ee/session.js): the person can't remove or extend it, under 20 hours, no warning (app/ee/idle.js, not run). Policy-only.
- **13.5:** Before its skill is added, a brain's ```abc, ```echarts or deck block shows as raw code with only the answer's words around it. What a brain writes in an answer is outside Jean's control.
- **13.7:** Games and pages a brain writes could flash; they aren't in the sample.
- **13.8:** The look Pièce adds a moving light behind the page while Jean works (tree/app/ui/style.css:106-108); the same setting stops it. The blinking cursor in tree/app/ui/dialogs.css:163 shows only on a machine's card that is waking or working, not in the sample.
- **13.9:** Phone emulation in Chromium, not a real rotating device.
- **13.10:** Any page a brain makes with <app-map> (D291) has the same map.

## How each criterion was judged

- **Seventh read: an AI reader given no earlier verdict, told of no fix:** 3.1, 3.2, 3.3, 5.6, 7.3, 7.5, 8.7, 8.8, 8.10, 9.1, 9.2, 9.3, 10.4, 10.7, 10.11, 10.12, 10.13, 11.1, 11.11, 11.12, 12.1, 12.6, 12.8, 13.10
- **Sixth read: an AI reader given no earlier verdict, told of no fix:** 1.6, 4.8, 10.9
- **Fifth read: an AI reader given no earlier verdict, told of no fix:** 1.1, 1.3, 5.4, 7.4, 10.8, 10.10, 11.10, 12.4
- **Fourth read: an AI reader given no earlier verdict, told of no fix:** 1.2, 4.11, 4.12, 6.1, 6.2, 8.2, 9.4, 10.2, 10.3, 10.6, 10.14, 11.2, 11.5, 11.9, 11.13, 12.7, 12.9, 13.9
- **Third read: an AI reader given no earlier verdict:** 2.1, 5.7, 7.2, 8.1, 8.3, 8.4, 8.5, 10.1, 11.6, 12.11, 13.2, 13.8
- **Second read: an AI reader given no earlier verdict:** 1.4, 1.5, 1.7, 1.8, 1.9, 2.2, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.9, 4.10, 5.1, 5.2, 5.3, 5.5, 5.8, 8.6, 8.9, 10.5, 11.3, 11.4, 11.7, 11.8, 12.2, 12.3, 12.5, 12.10, 13.1, 13.4, 13.5, 13.6, 13.7, 13.11, 13.12
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

Chromium 156 (Playwright 1.64) on macOS 27, keyboard and pointer; no assistive technology. axe-core 4.14, html-validate 9.7 in place of the W3C validator, Jean’s pixel measures from `test/contrast.spec.js` and `test/nontext.spec.js` extended to every state of the sample, `test/site.spec.js`, `test/reflow.spec.js`, `test/targets.spec.js` and `test/motion.spec.js`: 224 passed, 0 failed, 69 skipped in WebKit by design. The third to seventh reads walked the same sample in the same browser, keyboard and pointer, with everything beyond this computer blocked from the fourth on. No online checker was used in them.
