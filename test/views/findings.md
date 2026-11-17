# Views: phase 0 findings

17 November 2026. Whether a brain proposes the right view of a collection from words, measured before `table_view` was declared in
Jean (D755). The gate, written before the first run: right on 80% of the requests for a view or more, Tables' own gate, and no view on
90% or more of the requests for something else.

## What was measured

- Three collections in each of four languages (English, French, Arabic, Japanese), six rows each: visits, expenses and a reading
  list, with a status, a choice, several choices, a person, a box, numbers and dates, and rows left empty on purpose.
- Twenty requests for a view in each language: some rows by a choice, a number, a date, an empty cell or the person asking; two rules
  at once; an order; a group; a board, a calendar; a column hidden. Six more ask for something else: three questions to answer and
  three changes to make.
- Each is the first message of a conversation, with Jean's base prompt, the note Jean gives of a collection open beside the task and
  Tables' four tools as Jean declares them. `table_rows` answers as Jean does; a view Jean refuses goes back with why.
- A view is scored by what it shows, never by how it is written: the rows Jean would show with it, in order where one is asked, its
  layout, its group, its hidden columns, and a name in the request's language ([expected](expected.json), `scripts/views.js`).

## What it found

- **It passes** ([results](results.md)): Haiku, through Claude Code, is right on 92% of 160 requests for a view (two runs each), and
  proposes none on 98% of 48 requests for something else. English 85%, French 90%, Arabic 93%, Japanese 100%.
- **A brain that proposes a view proposes the right one.** Of 148 views proposed, Jean took every one, and 147 showed what was asked. The one miss was a name not in the request's script, in Arabic.
- **Every other miss is a list in the answer.** Twelve times the brain read the rows with `table_rows` and listed them in words
  rather than proposing a view. So the wording of `table_view` is about when to use it, not how:
  - Said as what it is ("Propose a view of a table the user keeps, when they ask to see only some of its rows…"): 45% in English,
    every miss a list.
  - Starting with when ("When the user asks to show, filter, sort or group the rows… rather than reading the rows to list them in
    your answer"): 75%.
  - With "even after reading its rows" and "Its columns are enough to write one": 85% in English, the wording kept.
- **"@me" works.** The brain doesn't know who is asking: told that a person column's value `"@me"` is whoever is looking, its view of
  "my visits" kept the asker's own rows seven times out of eight; the eighth was a list.
- **One request was mine to fix.** "The visits planned for November" was read as those still to visit; it now says "dated in
  November".
- **One view came unasked**, in Japanese: after noting a book as finished, the brain also proposed a view of the books read.

## What it doesn't tell

- One brain was measured. `table_view` is declared for the brains `table_change` is (`passes()`): none on this device.
- Every conversation had the collection open beside the task, its columns in Jean's note. Asked of a collection that isn't open, a
  brain has to read it first; that path wasn't measured.
- Six rows a collection: no request needed more than a brain can read at once.
- `table_rows`' own wording was left as it is, since Tables were measured with it. Pointing from it to `table_view` might win back
  some of the lists; it would need Tables measured again.
