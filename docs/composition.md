# Composition

How Jean's creations feed each other: a collection shown in a deck, a document or a site, kept up to date, at a version the consumer chooses, with its provenance checkable. Built in five steps, each shippable alone; this page is the map, then what each step delivered.

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
