# Tables, phase 0: what the spike found

A spike on its own branch, before building Tables (the review of 21 October 2026: tables first, as
things Jean keeps). Nothing here is wired into the app; `budgets.json`, `docs/decisions.md` and main
are untouched. The engine is `app/caps/tables/` (pure modules, no DOM), tested in
`test/tables.test.js`; the brains are measured by `scripts/tables.js` on `test/tables/`, results in
[results.md](results.md).

## The format, as it should be

A table is a folder `tables/<ulid>-<slug>/`, named once and never renamed (`folderOf`).

**`table.json`**: `{ format: 1, id, name, author, created, changed, properties, views }`.

- A column (property) is `{ id, name, type, options?, … }`. Its **id comes from its first name**, in
  any script (`company`, `応募日`, `اسم-الشركة`), and never changes, so renaming a column rewrites
  no change. A removed column stays as a tombstone, `deleted: <time>`, so a merge can't bring it
  back and its cells stay readable.
- Types: text, number, select, multi-select, status, date, checkbox, link, email, phone, person,
  place, files (what a brain may make), relation (`table`: the other table's ULID), and those Jean
  works out: rollup (`relation`, `property`, `aggregate`: count, sum, average, min, max, list),
  created-by, created-at, changed-by, changed-at. `checkCell` says, in words a brain reads, why a
  value doesn't fit; `null` clears any cell.
- Choices are `{ name }`, a status's steps `{ name, group: todo | doing | done }`; cells hold the
  choice's **name**, which keeps the file plain (see the open questions).
- A view is `{ id, type: table | board | list | calendar | gallery, group?, sort?, filter? }`. A new
  table gets a table view, and a board grouped by its status when it has one.

**`changes.jsonl`**, one line per row a change touches:

```
{"row":"<ulid>","set":{"status":"Interview","salary":52000},"at":"2026-10-21T09:12:00.000Z","by":"jean","why":"…"}
{"row":"<ulid>","delete":true,"at":"…","by":"user"}
{"row":"<ulid>","set":{"status":"Applied"},"at":"…","by":"user","undoes":"2026-10-21T09:12:00.000Z"}
{"compacted":"2026-07-01T00:00:00.000Z"}
```

- A **change** is the lines that share `at` and `by`: written together, undone together.
- `at` is ISO 8601 in UTC with milliseconds, from a **hybrid clock**: `max(now, latest time in the
  file + 1 ms)` (`nextAt`, `stamp`).
- A half-written last line (a crash) and any line that isn't a change are skipped when read.
- `pages/<row>.md` (a row's own page) was not prototyped.

**The brain's tool** names the columns `columns`, not `properties`: inside a JSON Schema, a
`properties` argument reads `parameters.properties.properties`. The capability line is 34 tokens
(of 40); the tool definition about 360. Most of that is a description that asks for a column for
everything a row will hold and names the types. It also shows one small table, about plants to
water, which no request asks for, in the user's language (`tableCreate(lang)`, English where there
is none). In the app that example would come from the locales, so it would need translating into
each of Jean's 33 languages.

The description was found in two rounds on the device's brain. First, with tool calls, on its GGUF
build:

| `table_create`'s description (Gemma 4 E2B GGUF, no thinking, tool calls, 112 tables each) | Right | Taken |
|---|---:|---:|
| A: "Make a table to keep track of something. Name it and its columns in the user's language; the first column names each row." | 17% | — |
| B: A, then "Give each column the type of its values: status for steps, listed in order; number for amounts; …" | 29% | — |
| C: A, then "Give each column the type its values have: a date, a number, a checkbox for yes or no, a select for a few choices, a status for steps (its options, in order); text for the rest." | 27% | 66% |
| D: C, asking for "every column the user will want" | 29% | 59% |
| **E: D, then an example table in English** | **37%** | **79%** |

A and B were scored before the last corrections to the scorer and the set (below); C, D and E with
them. E measured again in the battery below came to 35%. With B, it wrote "listed in order" as a
column's type. With C and D, it often gave a status column no steps, and the error Jean sent back
didn't help it mend the table; E's example mostly stopped that.

Then held to what Jean takes (below), on its MLX build, where what was left was columns left out:

| Description (Gemma 4 E2B MLX, held, the first 14 requests, 112 tables each) | Right |
|---|---:|
| E | 53% |
| F: a column "for each thing the request names or implies, and for what the user will note about each row: who, when, how much, and where it stands" | 52% |
| G: E with a larger example (six columns, every kind) | 51% |
| H: F with G's example | 44% |
| I: H, and "Think of the person filling in one row: give a column to each thing they will write down." | 57% |
| J: I, writing the table "in the language of the user's message, even when it isn't English" | 49% |
| **K: I, its example in the user's language (what `tool.js` holds)** | **68%**, twice |
| M: E's text, its example in the user's language | 58% |
| O: K, and a second example in the user's language (recipes to try) | 57% |

The longer the English description, the more often the brain named the columns of a French, Arabic or
Japanese table in English: 13 of 84 such tables with E, 20 to 24 with F to I. Counting English names
as right, I would have been 71%. Saying it in English (J) didn't help; an example in the user's
language did, with 3 English tables of 84. To check that K isn't fitted to those 14 requests, six
more were written after it was chosen (films, a car's upkeep, a school fair's volunteers,
prescriptions, presents, a team's training): on those, K is right 83% of the time and E 73% (48
tables each), about the same gain as on the 14.

## The merge rule, and its edge cases

**Each cell is its latest value**, ordered by time, then author, then the value's canonical JSON.
Merging two copies is the union of their lines, each once however its keys were written (`merge`).
That union is commutative, idempotent and order-free, so it settles the same way on every copy.
Tested:

- **Two copies edited offline at the same time**: every change is kept, whichever merges into which.
- **The same cell on both**: the later change wins. At the same millisecond the author settles it,
  then the value. The tie-break is the value, not the line's text, so compaction, which regroups
  cells into new lines, can't change a winner.
- **A row deleted on one copy and edited on the other**: deletion is a row-level cell. A row is gone
  while its latest deletion is later than every change to its cells. An edit stamped after the
  deletion brings the row back whole, all its other cells included. An edit stamped before it stays
  hidden, but kept in the file: undoing the deletion brings the row back with that edit.
- **Clocks that are off**: with the hybrid clock, a copy whose clock is behind still stamps a change
  after everything it has seen, so it wins as it should. A copy a year ahead wins only until the
  others have seen its line; their next changes are stamped after it. The cost: stamps drift to the
  fast clock's time until real time catches up. Times shown must be capped at now. They can't be
  clamped when read, because each copy would then merge differently.
- **`table.json`**: the newer copy wins, keeping columns and views that only the other copy has, and
  every choice from both, so no cell's value loses its choice (`mergeTables`). Columns added on each
  copy are both kept. The same column changed on both copies: the newer copy's version wins whole.
- **Compaction** (`compact`): lines older than a moment become one line per row and stamp that still
  wins a cell or the deletion. When each row was made is kept. Rows gone before the moment are
  dropped, unless a later line touches them. Merging stays exact for every copy that synced after
  that moment. A copy offline since then could bring a removed row back with only its later cells.
  Undo stops at the moment (the `compacted` line).
- **Undo** (`undo`) finds an author's latest change not yet undone, then puts back each cell's value
  from before it. A cell someone changed since is left as it is, and reported. A row the change made
  goes, unless someone wrote in it since. A deletion undone brings the row back. Undo writes new
  lines (the undoer's, `undoes: <at>`), so an undo merges like any other change. Redo isn't built:
  it would be an undo of the undo.

**What Sync must do first.** Today Sync (D157) settles a file changed on both sides with "anything
else, the newer wins". For `changes.jsonl`, that would drop a copy's lines. `caps/sync/mirror.js`
must merge `tables/*/changes.jsonl` with `merge()`, and `table.json` with `mergeTables()`.

## Size

| File | Lines of code (D246) |
|---|---:|
| `app/caps/tables/table.js` (table.json, columns, values, `mergeTables`) | 174 |
| `app/caps/tables/changes.js` (clock, fold, merge, compact, undo) | 118 |
| `app/caps/tables/query.js` (filter, sort, group, rollups) | 99 |
| `app/caps/tables/export.js` (CSV, .xlsx through `caps/made/formats.js`) | 39 |
| `app/caps/tables/tool.js` (`table_create`, its line, its example in four languages) | 40 |
| **The engine** | **470** |
| `scripts/tables.js` (the runner, `STRICT`) | 290 |
| `test/tables.test.js` (27 tests) | 386 |

The engine puts this branch over the app's budget: 30,247 lines of 29,777. The core is untouched
(2,000 of 2,000). A Tables capability would also need its views (table, board), editing, the tools
that change rows and query them, its strings in 33 languages and its part of `guide.txt`. That means
a raise with its own Dnnn, or deletions first.

## The brains against the 80% gate

The device's brain was measured last with `table_create` as `tool.js` holds it (description K
above), on 20 requests in English, French, Arabic and Japanese; the other brains before that, with
description E, on the first 14. The local brains ran in LM Studio on this Mac, where Gemma 4
E2B stands in for the device's brain, without thinking, as `npm run offers` measures it: its GGUF
build (Q4_K_M, `google/gemma-4-e2b` in results.md) and its MLX build (4-bit, LM Studio's second
instance, `google/gemma-4-e2b:2`). Claude Haiku ran through Claude Code, on your own Claude plan
(D235). The full tables are in [results.md](results.md).

| Brain | Right | Right at once | Taken | Tables | Gate (80%) |
|---|---:|---:|---:|---:|---|
| **Gemma 4 E2B (MLX), held to what Jean takes, description K** | **71%** | 71% | 100% | 160 | **fails** |
| Gemma 4 E2B (MLX), held, description E | 59% | 59% | 99% | 160 | fails |
| Gemma 4 E2B (MLX), tool calls, description K | 36% | 36% | 57% | 160 | fails |
| Gemma 4 E2B (MLX), tool calls, description E | 15% | 15% | 54% | 112 | fails |
| Gemma 4 E2B (GGUF), tool calls, description E | 35% | 35% | 77% | 112 | fails |
| Gemma 4 E4B, no thinking | 15% | 15% | 19% | 85 | fails |
| Qwen 3.5 2B, no thinking | 14% | 14% | 60% | 43 | fails |
| Ministral 3 3B | 33% | 33% | 49% | 43 | fails |
| Qwen 3.5 4B, no thinking | 60% | 60% | 98% | 43 | fails |
| gpt-oss-20b | 70% | 67% | 93% | 43 | fails |
| Gemma 4 26B A4B, thinking | 86% | 84% | 100% | 43 | passes |
| Claude Haiku | 98% | 98% | 100% | 56 | passes |

- **The scorer and the set were corrected** after reading Claude Haiku's misses, and every saved reply
  was scored again (`--from`). A column whose kind works and whose steps fit now comes before one of
  the right kind with the wrong steps. A column of a kind that doesn't work only names what came
  instead. A week as a number, and a date in place of a box, are right for homework. And the billing
  frequency is no longer required for subscriptions: the request doesn't ask for it, and a monthly
  cost answers it. The one table still capped is Haiku's 16 columns for flats; the cap is 15.
- **Left out.** LM Studio answers HTTP 500 to requests that come while it loads a brain. In the run
  above, that cost six brains their English: all but one of its requests. Those failures are left
  out, so those brains are measured on French, Arabic and Japanese. The runner now sends a brain's
  first request alone, but these brains were not run again.
- **Gemma 4 E2B** makes a table 95% of the time. In Japanese, LM Studio's parser misses 26 of its 28
  calls and leaves them as text in Gemma's own syntax, which Jean's device parser reads. Jean refuses
  19% of what it sends: mostly calls whose JSON came out broken, with quotes escaped inside a string
  so that the table's name is lost, and it doesn't mend them when told why. In the tables Jean takes,
  it finds 83% of the columns needed, every one of a kind that works, and the right steps 83% of the
  time. What it misses most is a whole column (51 of 61 misses): a book's author, an appointment's
  person, whether an expense was paid back.
- **Held to what Jean takes.** `npm run tables -- --strict` holds the brain's reply, while it
  decodes, to `STRICT` (`scripts/tables.js`): `table_create`'s arguments as a JSON Schema, with a
  type from the list, a select's choices and a status's two steps or more. LM Studio enforces it
  with a grammar (`response_format`, `json_schema`). The brain is told, as a rule, to answer with
  the table and given the tool's description and parameters; the tool itself isn't declared. The
  GGUF build thinks whenever its reply is held, with the tool or without it, despite `reasoning_effort: none`, so it was measured on the MLX build, which never does
  and is much faster (112 tables in about a minute, held or not).
  Held, with description K, its table is taken every time, 99% of its kinds work, and it is right
  **71%** of the time over the 20 requests: English 83%, French 75%, Arabic 65%, Japanese 63%. What
  still fails, no schema can require: a column the request implies, left out (48 of 58 misses).
  A book's author is missing every time, in every language, and an expense's category most times. A
  guest's reply is sometimes a box, which can't say "not yet". With tool calls, the MLX build asked
  which columns the person wanted, before making anything, in 47 of 160 replies, and Jean refused 21
  of the tables it sent. So the two builds of one brain differ:
  the gate should be measured on Jean's own runtime before it is settled.
- **Gemma 4 E4B** asks which columns the person wants before making the table, four times in five,
  as Jean's base prompt says to when a request is unclear. Only one reply was measured, so its tables
  that came after a question were never seen.
- **Brains not run:** none with a key, since this computer's environment holds no
  `<PROVIDER>_API_KEY` (OpenRouter, Anthropic, OpenAI, Mistral…). Nor did the device's real runtime
  run: Transformers.js on WebGPU, in the tab, with Jean's own weights. A larger Claude wasn't run
  either.

## Open questions for the owner

1. **The gate.** The device's brain, Gemma 4 E2B, makes a right table 35% of the time, far from
   80%, so by the rule agreed Tables is not offered with it. Held to what Jean takes while it
   decodes, and with a description asking for every column a row will hold, its example in the
   user's language, it gets to 71%: every table is taken, but a column the request implies is still
   left out, which no schema can require. That example would need writing in each of Jean's 33
   languages. Holding it in the tab would also need a logits processor in
   Jean's device runtime that follows `STRICT` through Gemma's own call syntax; Transformers.js has
   none built in, and its cost per token on WebGPU is unmeasured. Among local brains, only Gemma 4
   26B (thinking) passes. Qwen 3.5 4B (60%, and every table it sent was taken) and gpt-oss-20b (70%)
   come nearest. Ways that might close the rest of the gap, each to be measured, and held as well:
   - Let a first question count: answer it ("as you think best") and measure the table that follows,
     as Gemma 4 E4B shows.
   - Make the table in two steps: the columns first, then their kinds and steps.
   - Make a status with no steps a select whose choices come as values do, rather than refusing it.

   Or offer Tables only with a brain that passes. Which way?
2. **An edit and a deletion at the same time.** Today the later one wins, as with cells. Sync's own
   rule is "a change beats a deletion". Applying it to a deletion the edit never saw needs the
   deletion line to list what it saw: exact, but longer lines. Is "the later one wins, and undo
   brings it back" enough?
3. **Choices by name or by id.** By name, the file stays plain and brains write values as they read
   them. But renaming a choice rewrites every cell that holds it (one change, undoable), and a
   rename on one copy while the other copy sets the old name leaves a value without a choice: it
   is shown as it is, never lost. Ids would avoid both, at the cost of a mapping in every tool.
4. **A status's groups.** Jean guesses them: the first step is to do, the last is done, the others
   are under way. So a job tracker's "Offer" counts as under way and "Rejected" as done. Should the
   brain name the steps that end a row, at a few tokens more?
5. **Compaction.** When, and how far back: for example, lines older than 90 days, once a file
   passes 1 MB? A copy offline for longer could bring a removed row back with only part of it.
6. **A clock far ahead** drags every later stamp ahead until real time catches up. Should Jean
   refuse to stamp more than a day ahead of the latest line it has seen, and ask the person to
   check their clock?
7. **Formulas in .xlsx.** `caps/made/formats.js` makes a formula of any cell that starts with `=` and
   uses only safe functions. So a text cell holding "=1+1" would compute, and the export prefixes it
   with an apostrophe instead. Exporting the workbook writer so that it takes typed cells
   (`formats.js` unchanged otherwise) would avoid both.
8. **Not measured yet**: whether a brain *offers* Tables when a request needs it (`npm run offers`,
   with Tables among the offers), keeping a table up to date over a conversation, and the full
   first-conversation prompt with every tool, rather than `table_create` alone.
