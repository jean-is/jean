# Composition

How Jean's creations feed each other: a collection shown in a deck, a document or a site, kept up to date, at a version the consumer chooses, with its provenance checkable. Built in five steps, each shippable alone; this page is the map, then what each step delivered, then a recap: what departs from the plan, the known limits and the decisions left open.

## The model

Five concepts, nothing else:

- **Creation**: anything made in Jean, with a stable place and a typed contract.
- **Contract**: what a creation exposes. A collection: its columns and rows. A deck: its slides. A document: its sections.
- **Reference**: a consumer's link to a source, with one of three selectors: *live* (the journal's head), *published* (the latest version published), *pinned* (one version).
- **Recipe**: what the consumer does with the source, attached to the reference: a query (columns, filter, sort) or an instruction a brain carries out.
- **Version**: a frozen, certified snapshot, numbered 1, 2, 3…

Brains and connections stay out of the graph: a brain runs a recipe and is a setting of that run; a connection feeds a creation, and the creation is what composes.

## What exists, and where each concept plugs in

| Concept | Already in Jean | Where composition plugs in |
| --- | --- | --- |
| Creation | Every kind a capability keeps is a creation (D497), listed by the `creations` slot (`ui/creations.js`), each at a place named by a ULID and never renamed (D474): `collections/<ulid>-<slug>/`, `decks/<ulid>-<slug>.deck.html`, `documents/<ulid>-<slug>.md`, `sites/<ulid>-<slug>/`. | The place is the stable identifier. Nothing new. |
| Contract | A collection is `collection.json`, its columns (`properties`, each id taken from its first name and kept through renames, a deleted one kept with `deleted`), and its rows folded from `changes.jsonl` (`caps/tables/changes.js`). `fill()` (`caps/fill/fill.js`) already works out a table of named columns and the rows a `where` keeps, for pages of parts (D633). A deck's contract is its Markdown (`readDeckFile`), a document's its Markdown. | `contractOf()` in `caps/compose/`: the columns, with the names each column had in earlier versions, and the rows. Only collections are sources for now; decks, documents and sites are consumers. |
| Reference | Documents already hold a live one: a ```` ```table ```` block whose one line is a collection's place, drawn by `<app-table>` (`caps/documents/drawn.js`, `tableOf()`); pages of parts name one with `<app-table from>`; a whiteboard's area shows one. | The same ```` ```table ```` block, its first line the place with an optional `@published` or `@<n>`, then the recipe's lines. Decks draw it through Slides' `BLOCKS` (`caps/slides/slides.js`); documents keep `<app-table>` for a bare place and hand any other block to composition; a site names one with `data-from`. |
| Recipe | `fill()`, `rules()` and `query()` (`caps/tables/query.js`) for columns, `where` and sort; a request outside any conversation through the `turn.step` hooks and `streamChat`, as titles are written (`ui/title.js`). | Lines of the reference block. Each run's result is kept on the consumer's side, by the source's version. |
| Version | None. The journal exists: `changes.jsonl`, a line per change of a row, `{ row, set, at, by, why? }`, never edited (D474). | `collections/<…>/versions/<n>.json`, frozen, written when the author publishes or the columns change. Writing stays writing. |
| Proof | Answer certificates: a W3C VC sealed as a JWS by the device's key (`seal()`, `check()` in `caps/receipt/certificate.js`, `sealOf()` and the `seal` hooks in `receipt.js`, the organisation's authority on them, D434); Content Credentials' ingredients (`caps/receipt/c2pa.js`); the check page, `check.html` and `caps/certificates/card.js`. | A version's certificate is a VC sealed by the same `seal()` and read by the same `check()`; its ingredients are the sources at their exact versions, by digest. |
| Permissions | Projects are self-contained, a place relative to one; policy denies a capability (`isDenied`); a task brought in from someone else's share never shows the project's collections (`allowed()` in `caps/interactive/view-parts.js`). | `readable()`, checked at every resolution. |
| Inbound write | A published site's form sends sealed replies through the share host, which become rows of the form's collection by `visitor` (`caps/sites/replies.js`, D751); the host limits size, rate and backlog. | A port: the columns a form may write, declared on the collection; a validation column only its owner sets. |
| Schedule | Routines' schedule (`caps/routines/schedule.js`). | A refresh every N minutes while Jean is open. |
| Graph view | None. | A part of the pane's head (`head` slot, `ui/preview.js`) on a collection and on a consumer: who it uses, who uses it. |

## Where it lives

One capability, `caps/compose/`, loaded with Tables: pure modules under `node --test` (the reference's grammar, the graph, cycles, permissions, contracts, versions, recipes), and `compose.js`, which registers the pane's head part and the block's drawer. It stays out of Tables' folder, whose code is at its budget (`gzipKB.capabilityCode`), and out of the first load.

## Steps

### Step 1 — A live reference, and the graph

- **Identity and contract.** A creation's place is its identifier. A collection's contract is its live columns and its rows as the journal's head folds them (`load()` in `caps/tables/tables.js`); slides are the consumer.
- **The reference.** A slide holds the block documents already hold: ```` ```table ````, its first line the collection's place. `fields: Name | Trade` and `where: Trade is Baker` under it come free, since `fill()` already reads them (`tableOf()` in `caps/compose/refs.js`). Slides' `BLOCKS` hands the block to `drawn()` (`caps/compose/compose.js`), which reads the collection again each time the slides are drawn and, while it shows, after every change, the user's, Jean's or Sync's (Tables' `watched()`). Twelve rows at most on a slide.
- **Rights, at each resolution** (`refused()`): Tables turned off or denied by policy; a task brought in from someone else's share, which never reads the project's collections; a loop; no such collection in the consumer's own project, a place being relative to it, so another project's collections are out of reach. The slide says which, in words.
- **Loops** (`loops()`): the graph is read from the project's slides and documents (`graph()`, read again at most once a second, as slides draw all their blocks at once), and a reference from `from` to `to` is refused when `from` is reached from `to`. While collections are the only sources, and never consumers, no loop can form; the check is there for the day slides or documents become sources.
- **The graph's first view.** In the head of a collection's, slides' or a document's pane, *Links with other creations* lists what it uses and what uses it, each with which version it reads (*Live*), each opening it.
- **Exit criterion, verified** (`test/compose.spec.js`, Chromium, in English, Arabic and Japanese): a row changed shows changed on the slide at once while it shows, and once the slides are opened again.

### Step 2 — Versions and the journal

- **The journal** is the one each collection already keeps, `changes.jsonl`: a line per row a change touches, who (`by`), what (`set`), when (`at`), never edited. Writing is not publishing: a row changed makes no version. The collection's menu says how many changes no version holds yet.
- **Versions** (`caps/compose/versions.js`): `collections/<…>/versions/<n>.json`, frozen, `format`, `n`, `at`, `by`, `why` (`published` or `schema`), the journal's head it was taken at (`head`), the columns, the rows with their computed cells, and the relations' names. *Publish version N* in the collection's menu makes one (`publish()` in `compose.js`); a change of its columns, here, in another tab or through Sync (`app.fs.watch`), makes one by itself once the collection has a version (`reshaped()`), never before: until its author publishes, a collection is a draft no consumer can pin.
- **Selectors.** After the place: nothing for *live*, `@published` for the latest version, `@3` for version 3. In the menu of the consumer's pane, a select beside each collection it uses writes the selector into the consumer's own file (`withAt()`), slides through Slides' `rewrite()`, a document as a file its editor merges in. A selector that reads no version says so: *This collection has no version yet*, *no version 3*.
- **Backward compatibility** (`breaks()`, `current()`). Columns keep their id through a rename, and a deletion only marks them deleted, so the contract is kept by construction: a recipe that names a column by a name it had in an earlier version reads it under its name now, and the menu says *“Trade” is now “Craft”*; a recipe that names a deleted column still reads it, while the columns shown by default leave it out. A column turned into a kind whose values read otherwise (a number into text, a date into a choice) breaks: no version is made, by hand or by itself, and the menu says which columns and what to do; kinds that read alike (text, email, link, phone, place; a choice and a status) don't break. Live consumers see the column as Tables converted it; pinned and published ones keep the last good version.
- **Documents and sites as consumers.** A document's ```` ```table ```` block that is the place alone keeps Tables' own editable view; one with a selector or a recipe is drawn by `<app-composed>`, read-only. A site's page names a collection with `<table data-from="collections/…@published" data-fields="Name | Trade" data-where="…">`, filled with escaped text as the site is read (`composed()`, called from `load()` in `caps/sites/kind.js`), so its frame, its check, its card and what *Publish* sends all show the rows as they are; a table that can't be resolved keeps what its file holds.
- **Exit criterion, verified** (`test/compose.spec.js`): slides pinned to version 1 still show its rows once version 2 is published, while slides that read `@published` show version 2's; the pinned slides set to *Published* from their menu follow it; a document pinned to version 1 and a site that reads the published version show theirs; a column renamed makes version 3, its old name still read and said; a column turned from text into a number makes none, and the menu says why.

### Step 3 — Recipes and refresh

- **The recipe** is the reference's own lines, in the consumer: the query, `fields:`, `where:` (as before) and `sort: Name` or `sort: Name desc` (`sorted()` in `caps/compose/recipes.js`), resolved at each read since it costs nothing; and an instruction, `ask:`, carried out by a brain, `brain:` naming one of the project's by its label, model or id, else the one at hand. The brain is a setting of the run, never a node of the graph.
- **A run** (`run()` in `compose.js`): the rows the query keeps (200 at most) under `<rows>`, after the instruction, in one request outside any task, through the `turn.step` hooks a turn's steps go through (so a month's limit holds it back), with a prompt of its own (`PROMPT`) that asks for Markdown alone and no invented fact. Each run is a line of the consumer's results, `composed/<its ULID>.jsonl` (a task's for slides in an answer), appended, never edited: `{ format, key, n, at, read, brain, output | error }`, numbered per reference. `key` is the reference's place, version and recipe, its `refresh` aside; `read` is the source's version (`v2`) or its journal's head.
- **Cache by source version.** A run whose reference already ran on the same `read` with the same brain is read again, not paid again (`lastRun()`).
- **Modes**, written as `refresh:` in the reference and chosen from the consumer's menu: *By hand* (the default, nothing written), with *Update now*; *Every 5 minutes* or *Every hour* (`refresh: 5 min`, `60 min`), run by a minute's tick while Jean is open (`due()`); *As the collection changes* (`refresh: auto`), the opt-in propagation. The first time a reference with `ask` shows, it runs once, so that it shows something.
- **Guards.** Changes that come close together are gathered (`GATHER`, 2 s after the last) into one run, and a run asked twice at once (as it first shows and as its source changes) runs once; a run that changes a consumer carries on to what uses that consumer, `DEPTH` (3) deep at most; a run that fails is kept as an error line, the last good run stays on show, the menu says the last update failed, and propagation stops there.
- **Exit criterion, verified** (`test/compose.spec.js`, against the fake brain): slides that sum up a collection's approved artisans run once as they first show; by hand, an artisan approved changes nothing and runs nothing; *Update now* runs it on the rows as they are, and pressed again with nothing changed reads that run again; once *As the collection changes* is chosen, which writes `refresh: auto` into the slides, an artisan added and approved shows on the slide by itself, the third run.

### Step 4 — Proof and provenance

- **The existing mechanism, a new type.** A collection's version and each run of a recipe get a W3C VC 2.0 of type `CreationVersion`, sealed exactly as an answer's certificate is: the device's key, the `seal` hooks (an organisation's authority), the witnesses the person chose (`certify()`, now exported by `caps/receipt/receipt.js`, which answers use too). Nothing in `seal()`, `check()` or the answers' schema changed; the new type has its own schema, `caps/compose/version.schema.json`.
- **What it says** (`credentialOf()` in `caps/compose/proof.js`): the creation's ULID and kind (`collection` or `run`), the version's or run's number, the author (`user`, or `jean` for a run), the time (`validFrom`), where it was done (`device` or `cloud`, from the brain), salted SD-JWT digests of what it holds (the version's JSON without its certificate, or the run's words) and of the recipe, the brain, and the **ingredients**: each source's kind and ULID, the version it read (`v1`, or its journal's head when read live), and that version's certificate's imprint (`imprint()`, the SHA-256 of its signature, as witnesses date it), in Content Credentials' spirit. The certificate and the salts are kept in `versions/<n>.json` and in the run's line; the words never enter the certificate.
- **The chain** (`chainOf()`, `holds()`): certificates given together, the first made from the others, the first checked by `check()`, then each ingredient found among them by its imprint and checked in turn, as deep as they go. An ingredient read live names no certificate, and the chain stops there.
- **In Jean**: the consumer's menu says, for each collection it uses, *Certified, back to version N of the collection*, *Certified, from the collection's rows as they were then* (a run on live rows), *The rows as they are now: no version, so no certificate*, or that its certificates don't hold; *Save its provenance* downloads the chain as a JSON array.
- **On the check page** (`checkGiven()` in `caps/certificates/card.js`): a provenance dropped is checked as a chain; the card shows the first certificate as any other, then *Made from*, each ingredient intact, changed, not given, or read live.
- **Exit criterion, verified** (`test/compose.spec.js`): slides whose recipe reads the published version show the run; their menu says it is certified back to version 1, as it does for slides pinned to version 1, and that the live rows have none; the provenance saved and dropped on the check page shows the run sealed and *Version 1 of a collection, sealed and unchanged since*; the version's certificate changed, or left out, is said so.

### Step 5 — Writing in

- **The port** (`caps/compose/ports.js`), opened by the collection's owner from its menu, *Accept proposals from a site*, and closed there: `port.json` in the collection's folder, `{ format, at, by, columns, approval, hour }`. Its columns are every column a form fills (text, number, a choice, a date, a link, an email, a phone, a place), its approval the collection's first box column, or one made for it, *Approved*. No port, no way in: a form that names a collection without one keeps sending to a collection of its own, as before.
- **Through a site's form.** A form of a published site names the collection with `data-to="collections/…"` (`formsTo()`); as Jean collects the replies (`gather()` in `caps/sites/sites.js`, D751), those of such a form go through `contribute()` instead of into a collection of their own. What gets in (`admitted()`): each field by its label onto the port's columns, the approval never (a field that tries is dropped), any other field dropped, each value as its column takes it and cut past 2,000 characters; at most `hour` (30) proposals an hour, counting those already in, and none the collection holds already. The rows are written by `visitor` into `changes.jsonl`: the journal's head, never a version.
- **Only the owner approves** (`owned()`): wherever a reference reads the collection (a slide, a document, a site's table) and whenever a version is made, the approval column holds only what its owner set, the person here or a change of Jean's they kept; a visitor's, or another person's working on it together, counts for nothing. So a site's `data-where="Approved is yes"` shows a proposal only once its owner ticks it. The menu says how many proposals wait.
- **Rate and abuse, at both ends.** The share host already takes a reply only for a site published with replies, 20 KB at most, 30 from a network an hour, 500 waiting, each kept 30 days, sealed in the visitor's browser; the port adds its own hourly cap, the columns it takes, the approval no one else sets, and duplicates dropped.
- **Sites consume live**: the site's tables are filled from the collection as it is each time the site is read, checked or published (step 2). A published site shows a proposal approved once it is published again, which the pane's *Publish…* says (*1 file changed since it was published*).
- **Exit criterion, verified** (`test/compose.spec.js`): the owner opens the directory's port; a published site's form sends a neighbour's proposal, with a hidden field that tries to approve it; collected, it is a visitor's row of the directory itself, not approved, in no collection of its own, and neither the site in Jean nor the published one shows it; the menu says one waits; the owner approves it, and the site shows it, in Jean and online once published again; version 1's file is byte for byte what it was, and no version was added.

## Recap

### What each step delivered

| Step | Delivered | Exit criterion |
| --- | --- | --- |
| 1 | A slide's ```` ```table ```` block shows a collection live; rights asked at each resolution; loops refused; the pane's *Links with other creations*. | A row changed shows changed on the slide, at once and once reopened. |
| 2 | Versions (`versions/<n>.json`), published by hand or made by a change of columns; selectors `@published`, `@3`; backward compatibility (old names read, deleted columns readable, breaking kinds refused); documents and sites as consumers. | Slides pinned to version 1 stay as they were after version 2; slides on `@published` follow. |
| 3 | Recipes: `sort:`, and `ask:` run by a brain (`brain:`), by hand, every 5 minutes or hour, or as the collection changes (opt-in); runs kept consumer-side, cached by source version; gathering, depth, stop on error. | The approved artisans summed up on a slide update by themselves once *As the collection changes* is chosen, and only then. |
| 4 | Versions and runs certified with a new VC type, `CreationVersion`, sealed by the existing mechanism; ingredients by certificate imprint; the chain checked in Jean and on the check page. | From slides, the provenance is checked back to the collection's version, in Jean and on the check page. |
| 5 | A collection's port, opened by its owner; a published site's form proposes into it (`data-to`); its columns only, never the approval, 30 an hour, once; only the owner's approval counts. | A directory takes a neighbour's proposal and shows it once approved, in Jean and online, no version changing. |

Each step was committed alone (`:sparkles: composition: étape N — …`), steps 2 to 5 each after a commit of its own raising `loc.app` by what the step measured, at the owner's word. Nothing was added to the first load, the core or Tables' folder; no dependency was added.

### Where this departs from the plan, and why

- **Only collections are sources.** Slides, documents and sites consume; no step needed a document's sections or a deck's slides as a source, so their contracts aren't built. Loops therefore can't form yet: the check runs at each resolution and is tested on a graph where they can.
- **The journal is the one that exists.** A collection's `changes.jsonl` already says who, what and when for every write; a consumer's runs have their own (`composed/<ULID>.jsonl`). Slides and documents keep no journal of their writes: nothing reads one.
- **A draft first.** A change of columns makes a version only once the collection has one; before its author publishes, nothing can pin it.
- **A breaking change is refused as a version, not as a change.** Tables still lets a column change kind (and converts its values for live readers); composition makes no version of it, by hand or by itself, and says why. Refusing the change itself would mean changing Tables, whose code is at its gzip budget.
- **What costs nothing is resolved, not stored.** A query (`fields`, `where`, `sort`) is worked out at each read; only a brain's run is a stored, numbered result. A live reference drawn again as its collection changes is resolution, not propagation, which is the opt-in re-running of a paid recipe.
- **A schedule runs while Jean is open.** There is no Jean server; a minute's tick runs what is due.
- **Sites consume live, not on a schedule.** Their tables are filled each time the site is read or published; showing a change online means publishing again. Publishing on a schedule would put something online without asking each time, which Jean's rules don't allow unasked: left as a decision (below).
- **A provenance is one file.** The check page reads a JSON array of certificates, which Jean saves, rather than certificates dropped one by one.
- **Column rights are enforced where they matter.** A port takes only its columns; the approval counts only where its owner set it, read from each cell's author, so a visitor or a person working on the collection together can't approve, whatever they write, while the owner's own ticks from their other devices, which Sync brings, count.
- **The commits' first lines** are in English after `composition: étape N —`, as the rest of the history is; the docs are in English, as all of Jean's are.

### Known limits

- Slides saved as PowerPoint: a composed table or a run's words weren't checked in the exported file.
- Versions, runs and ports are plain files of the project: Sync carries them as files, but working on a collection together (D733) sends its lines and its table only, so the others have neither its versions nor its port.
- The graph is read again from every slides, document and site file of the project (at most once a second, and again after any of them is written): right for tens of creations, not thousands, where an index in `.cache/` would be.
- A run sends up to 200 rows to the brain it names, the one at hand otherwise, outside any task: through the `turn.step` hooks (a month's limit), but not through the approval rules, the brain being the person's own and the run the person's choice. Rows a visitor proposed reach it too, unless its recipe keeps only approved ones; it has no tools, and what it writes is only shown, but words planted in a proposal could still steer what a slide says.
- The salts of a version's or a run's digests are kept, but nothing in Jean yet makes a proof that discloses what it holds.
- The consumer's menu draws its choices as Jean's full-width selects; a denser layout would cost style lines.
- The check page's introduction still speaks of answers only.
- The 45 translations of the new strings are Claude's, not a native speaker's.
- WebKit doesn't run `test/compose.spec.js` (in `CHROMIUM_ONLY`: what it checks is Jean's own JavaScript).

### Decisions left open

1. Publishing a site again on a schedule, or as its collection changes: an outward action, which would need its own approval rule (*Do it / Ask me first*).
2. Documents' sections and slides as sources, when a need shows.
3. Whether people working on a collection together get its versions and its port.
4. Whether Tables itself should refuse a breaking change of kind once a collection has versions.
5. A proof that discloses what a version or a run holds, from its kept salts.
