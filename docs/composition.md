# Composition

How Jean's creations feed each other, a collection shown in a deck, a document or a site at a version the consumer chooses, its provenance checkable, is in [architecture.md](architecture.md#composition), and the decision in [decisions.md](decisions.md) (D763). This page is how it was built: five steps, each shippable alone, what each delivered and how it was verified, then what departs from the plan, the known limits and the decisions left open.

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

### Budgets

Built first on a main whose line budget was nearly full, each step from the second raised `loc.app` by what it measured, at the owner's word; replayed on the main it landed on, whose budget left room enough, those raises were dropped and no budget changed. Nothing was added to the first load, the core or Tables' folder; no dependency was added. Its strings are in the 54 languages Jean speaks.

## Where this departs from the plan, and why

- **Only collections are sources.** Slides, documents and sites consume; no step needed a document's sections or a deck's slides as a source, so their contracts aren't built. Loops therefore can't form yet: the check runs at each resolution and is tested on a graph where they can.
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
- **The commits' first lines** are in English after `composition: étape N —`, as the rest of the history is; the docs are in English, as all of Jean's are.

## Known limits

- Slides saved as PowerPoint: a composed chart is a native chart, each bar in its choice's colour, and a composed table a table (`test/compose.spec.js`); a run's words weren't checked in the exported file. A deck's own file, opened outside Jean or shared by link, draws a reference as its text, a figure as its formula: only Jean resolves one.
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

## Decisions left open

1. Publishing a site again on a schedule, or as its collection changes: an outward action, which would need its own approval rule (*Do it / Ask me first*).
2. Documents' sections and slides as sources, when a need shows.
3. Whether people working on a collection together get its versions and its port.
4. Whether Tables itself should refuse a breaking change of kind once a collection has versions.
5. A proof that discloses what a version or a run holds, from its kept salts.
