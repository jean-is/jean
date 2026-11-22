# Composition

How Jean's creations feed each other, a collection shown in a deck, a document or a site at a version the consumer chooses, its provenance checkable, is in [architecture.md](architecture.md#composition), and the decision in [decisions.md](decisions.md) (D763). This page is how it was built: steps each shippable alone, what each delivered and how it was verified, then what departs from the plan, the known limits, the work left, which makes the most of the graph, and the decisions left open.

## Steps

Each step was committed alone (`:sparkles: composition: étape N — …`), and each exit criterion is checked by `test/compose.spec.js` in Chromium, against the fake brain.

### Step 1 — A live reference, and the graph

A slide's ```` ```table ```` block shows a collection live, read again while it shows after every change; the reader's right is asked at each resolution, a loop refused, and the pane's head lists *Links with other creations*.

**Exit criterion** (in English, Arabic and Japanese): a row changed shows changed on the slide at once while it shows, and once the slides are opened again.

### Step 2 — Versions and the journal

Versions (`versions/<n>.json`), published by hand or made by a change of columns once a collection has one; the selectors `@published` and `@3`, chosen from the consumer's menu; backward compatibility (earlier names read, deleted columns readable, a breaking change of kind refused as a version); documents and sites as consumers.

**Exit criterion**: slides pinned to version 1 still show its rows once version 2 is published, while slides that read `@published` show version 2's; the pinned slides set to *Published* from their menu follow it; a document pinned to version 1 and a site that reads the published version show theirs; a column renamed makes version 3, its old name still read and said; a column turned from text into a number makes none, and the menu says why.

### Step 3 — Recipes and refresh

Recipes: `sort:`, a chart (`chart:`, `by:`, `sum:`) in the deck's colours and each choice's own, figures in a slide's words (`` `=collections/… sum Amount` ``), and `ask:` run by a brain (`brain:`), by hand, every 5 minutes or hour, or as the collection changes (opt-in); runs kept consumer-side, cached by source version; changes gathered, propagation limited in depth, stopped by an error.

**Exit criterion**: slides that sum up a collection's approved artisans run once as they first show; by hand, an artisan approved changes nothing and runs nothing; *Update now* runs it on the rows as they are, and pressed again with nothing changed reads that run again; once *As the collection changes* is chosen, which writes `refresh: auto` into the slides, an artisan added and approved shows on the slide by itself, the third run.

### Step 4 — Proof and provenance

Versions and runs certified with a new credential type, `CreationVersion`, sealed by the mechanism answers use, `seal()`, `check()` and the answers' schema unchanged; ingredients named by their certificates' imprints; the chain checked in Jean and on the check page.

**Exit criterion**: slides whose recipe reads the published version show the run; their menu says it is certified back to version 1, as it does for slides pinned to version 1, and that the live rows have none; the provenance saved and dropped on the check page shows the run sealed and *Version 1 of a collection, sealed and unchanged since*; the version's certificate changed, or left out, is said so.

### Step 5 — Writing in

A collection's port, opened by its owner from Share's *Collect replies*; a published site's form proposes into it (`data-to`), its columns only, 30 an hour, each once, by `visitor`, into the journal; what shows is each consumer's own criteria.

**Exit criterion**: the owner opens the directory's port; a published site's form sends a neighbour's proposal, with a hidden field that tries to tick the box the site's table keeps rows by; collected, it is a visitor's row of the directory itself, the box left alone, in no collection of its own, and neither the site in Jean nor the published one shows it; the owner ticks the box, and the site shows it, in Jean and online once published again; version 1's file is byte for byte what it was, and no version was added.

### Step 6 — The graph whole

What already linked creations outside the graph comes into it (`linksIn()`): a collection's relation to another is an edge from the collection holding it, its column's name beside it; a file a deck or a document holds by its content (`../files/sha256-…`) is an edge to that file, whose pane's head lists what holds it. Neither is a reference, so neither carries a loop (`loops()` follows references alone), nor has a version, a recipe or a certificate. Slides an answer drew and Jean then kept as a file read their task's runs as their own (`runsFor()`), a run under way included, so a recipe is paid once.

**Exit criterion**: a collection that relates to the artisans is under their *Used in*, by its column, and opens them from its *Uses*; slides kept from an answer show their task's run, and keep none of their own; a picture held by those slides lists them under *Used in*.

### Step 7 — The graph answers

What the graph knows, said where it matters, each answer a read of edges. From the graph as last read (`known`, read again a second after a creation changes): a column deleted in Tables, or a creation deleted from Creations, says with its Undo what still uses it (the `touched` slot, `usersOf()`: references that name the column or show every column, any link for a creation); a column whose kind changed, here or by Sync, says where that changes what shows (`retyped()`). The links menu adds *Further along*, what is reached through the creation's own links, each with the one it is reached through (`further()`). The brain reads the same graph with `creation_links`, a read tool: what uses a creation and what it uses, each with the version it reads and its recipe, then what is further.

**Exit criterion**: slides that show a collection relating to the artisans are under the artisans' *Further along*, through it; the column the artisans' slides show deleted, its Undo says those slides still use it, and its kind changed, a toast says what that changes in them; `creation_links` says the same as the menu; that collection deleted from Creations, its Undo names the slides that use it.

### Budgets

Built first on a main whose line budget was nearly full, each step from the second raised `loc.app` by what it measured, at the owner's word; replayed on the main it landed on, whose budget left room enough, those raises were dropped and no budget changed. From step 6 on, a step that needs more room than the budget leaves raises `loc.app` by what it measures, at the owner's word, in a commit of its own before it; step 6 fitted in what was left. Nothing was added to the first load, the core or Tables' folder; no dependency was added. Its strings are in the 54 languages Jean speaks.

## Where this departs from the plan, and why

- **Only collections are sources.** Slides, documents, sites and prototypes consume; no step needed a document's sections or a deck's slides as a source, so their contracts aren't built. Loops therefore can't form yet: the check runs at each resolution and is tested on a graph where they can.
- **The journal is the one that exists.** A collection's `changes.jsonl` already says who, what and when for every write; a consumer's runs have their own (`composed/<ULID>.jsonl`). Slides and documents keep no journal of their writes: nothing reads one.
- **A draft first.** A change of columns makes a version only once the collection has one; before its author publishes, nothing can pin it.
- **A breaking change is refused as a version, not as a change.** Tables still lets a column change kind (and converts its values for live readers); composition makes no version of it, by hand or by itself, and says why. Refusing the change itself would mean changing Tables, whose code is at its gzip budget.
- **What costs nothing is resolved, not stored.** A query (`fields`, `where`, `sort`) is worked out at each read; only a brain's run is a stored, numbered result. A live reference drawn again as its collection changes is resolution, not propagation, which is the opt-in re-running of a paid recipe.
- **A schedule runs while Jean is open.** There is no Jean server; a minute's tick runs what is due.
- **Sites consume live, not on a schedule.** Their tables are filled each time the site is read or published; showing a change online means publishing again. Publishing on a schedule would put something online without asking each time, which Jean's rules don't allow unasked: left as a decision (below).
- **A provenance is one file.** The check page reads a JSON array of certificates, which Jean saves, rather than certificates dropped one by one.
- **No validation column, at the owner's word.** The plan's step 5 had a validation column only the owner sets, on which public recipes filter. It was built, then taken out: what a consumer shows is its own criteria, and a collection is neither helped nor guided to judge what comes in. What remains of column rights is the port's: which columns a proposal may write.
- **A figure is inline code, not a block.** A key figure's lead or a sentence holds no block, and the deck's editor writes inline code back as it is typed, so a formula in it survives typing on the slide where any other mark would be lost.
- **Charts are a recipe, not a reference of their own.** A slide's `echarts` block holds its numbers, which nothing ties to a collection; the Slides skill tells the brain to chart a collection with the ```` ```table ```` block and `chart:` instead, so that the graph, the selectors, versions and provenance hold for a chart as for a table.
- **Said with its Undo, not asked first.** The plan's step 7 asked before a column or a collection was deleted. Jean deletes at once and offers Undo everywhere, so the Undo's toast says what still uses it instead, which the Undo answers.
- **No count on Creations' cards, and no `@`, yet.** The plan's step 7 put on each card of the Creations page how many creations it uses and is used in, and had `@` say what a creation uses. The page's state and `@` live in modules of the first load, which has no byte left; the links menu and `creation_links` say it meanwhile.
- **The brain asks, rather than being told.** A tool's result saying which consumers a change of rows touches would go through Tables' code, at its gzip budget; `creation_links` is one read tool of its own, which the brain calls before changing what others show.
- **A picture is listed, not certified.** The plan's step 6 had a picture's credential join a version's or a run's ingredients. A run's ingredients are what it read, and slides have no certificate of their own beside their runs', so a picture held by content is a link of the graph, which says where it is used, and its own credential stays its own.
- **The commits' first lines** are in English after `composition: étape N —`, as the rest of the history is; the docs are in English, as all of Jean's are.

## Known limits

- Slides saved as PowerPoint: a composed chart is a native chart, each bar in its choice's colour, and a composed table a table (`test/compose.spec.js`); a run's words weren't checked in the exported file. A deck's own file, opened outside Jean, draws a reference as its text, a figure as its formula: only Jean resolves one. A link to slides or a document, and a document's Word file, hold what each shows as they are made, a chart as its figures' table.
- A whiteboard is a collection too, but has neither versions nor a port.
- A recipe that runs as its source changes may meet the month's limit in the background: the question it asks then comes up unasked for.
- Versions, runs and ports are plain files of the project: Sync carries them as files, but working on a collection together (D733) sends its lines and its table only, so the others have neither its versions nor its port.
- The graph is read again from every slides, document and site file of the project once any of them, or a collection's columns, is written, and every five minutes at most otherwise: right for tens of creations, not thousands, where an index in `.cache/` would be.
- A run sends up to 200 rows to the brain it names, the one at hand otherwise, outside any task: through the `turn.step` hooks (a month's limit), but not through the approval rules, the brain being the person's own and the run the person's choice. Rows a visitor proposed reach it too, unless its recipe's `where` leaves them out; it has no tools, and what it writes is only shown, but words planted in a proposal could still steer what a slide says.
- The salts of a version's or a run's digests are kept, but nothing in Jean yet makes a proof that discloses what it holds.
- The consumer's menu draws its choices as Jean's full-width selects; a denser layout would cost style lines.
- The check page's introduction still speaks of answers only.
- The 45 translations of the new strings are Claude's, not a native speaker's.
- WebKit doesn't run `test/compose.spec.js` (in `CHROMIUM_ONLY`: what it checks is Jean's own JavaScript).

## Work left: the graph at its best

Composition and the graph are one ([architecture.md](architecture.md#composition)): every way a creation shows another becomes a reference, and every reference is an edge the graph reads. The steps below follow from that, each shippable alone, its exit criterion checked in `test/compose.spec.js` or `test/compose.test.js` as before. Steps 6 and 7, what already linked creations brought into the graph and what it can say at no cost, are built (above). Then, in order: the place most people read (8), then new sources and consumers (9 to 11), then what runs and what travels (12). Three rules hold for every step:

- **Nothing shown outside a reference.** A kind that starts showing another's content joins `CONSUMERS` in the same change, and its test checks that the source's *Links with other creations* lists it.
- **Budgets first.** `loc.app` has a dozen lines left and Tables' code is at its gzip limit: each step measures what it needs, deletes first where it can, asks for a raise in a change of its own, and stays out of Tables' folder.
- **What is paid stays opt-in.** A step that makes the graph carry more never makes a brain run, or anything leave Jean, that the person didn't choose.

### Step 8 — Answers that compose

An answer is where most people read, and today it draws a collection only inside a deck. A ```` ```table ```` block and a figure in an answer become references too, drawn by the same code (`WIDGETS` in `ui/markdown.js` gains `table`), their task the consumer. An answer is a moment: its selector is the journal as it was when the answer was written (`fold()` of the lines up to then), so it never changes by itself. It says how many changes came since, and *Show as it is now* draws the collection's head without writing into the answer (D188).

**Exit criterion**: an answer that charts a collection keeps its bars once a row changes, says one change since, shows the chart as it is now on a click, and the collection lists the task under *Used in*.

### Step 9 — Documents as sources

Decision 2 below, settled by a need already there: a site's FAQ, terms or privacy page is a document copied into HTML, and slides made from a report copy its sections. A document's contract is its sections, each heading's id written once beside it and kept through a rename, as a column's is; a version is published by hand, as a collection's is. Slides refer to one with a ```` ```section ```` block holding `documents/…#id`, a site with `<section data-from="documents/…#id">`, filled as its tables are. Loops can form from here on, a document showing slides that show it, and `loops()` refuses them, as it was built to.

**Exit criterion**: a site's FAQ page made from a document's section follows an edit of it, while a site pinned to version 1 doesn't; a reference that would close a loop says so, in words.

### Step 10 — More consumers

Each kind that shows data does it through a reference, never a copy.

- **Designs**: a part's words bound to a column, one design drawn per row (badges, certificates, place cards), and figures in its words.
- **Games and apps**: a quiz or flash cards whose questions are a collection's rows, given to the page as data when it is read and kept out of its file, as a site's rows are; its sandbox unchanged.
- **Whiteboards** as sources, with a contract of their own: a section becomes a slide, and a note with its owner and date a row of an action list; versions as a collection has them.

**Exit criterion**: one design makes a badge for each approved artisan, and one more once another is approved; a quiz plays a collection's questions, and a new row once it is read again; slides made of a whiteboard's sections follow a note moved to another section.

### Step 11 — The design system as a source

`kit.json`, the person's and the project's, is read live by decks, designs and Word, while a site copies it into `look.css` ([architecture.md](architecture.md#sites), *Later*). As a source, it has versions published by hand, each consumer reads it live or at a version, a site's `look.css` is written again as it changes, and the version it wore is an ingredient of what wears it.

**Exit criterion**: a site's colours follow the project's design system once it changes, slides pinned to its version 1 don't, and their provenance names that version.

### Step 12 — One way to run, one way to travel

- **One clock.** A recipe's `refresh:` and a routine's schedule are one scheduler. A flow's step or a routine reads a creation through a reference, with a selector and a recipe, rather than the newest file of its name, and a run of either is a run of the graph, certified.
- **Rows from elsewhere carry their origin.** What a routine or a connection writes into a collection, as its sources, is a run too, its certificate naming where it came from, so a chain can reach outside Jean.
- **The graph travels.** Versions, runs and ports go to those working on a collection together (decision 3), and a link to a creation can carry its ingredients' certificates, which the check page checks.

**Exit criterion**: a routine reading a collection's published version runs on a recipe's clock, its run certified with that version as ingredient; rows a source added carry a certificate naming the source; someone working on a collection together sees its versions and its port.

## Decisions left open

1. Publishing a site again on a schedule, or as its collection changes: an outward action, which would need its own approval rule (*Do it / Ask me first*).
2. Documents' sections and slides as sources: documents in step 9; slides when a need shows.
3. Whether people working on a collection together get its versions and its port: step 12 proposes they do.
4. Whether Tables itself should refuse a breaking change of kind once a collection has versions: step 7's Undo, which says what still uses a column, is the middle way.
5. A proof that discloses what a version or a run holds, from its kept salts.
