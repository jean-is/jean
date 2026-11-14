# Collections: phase 0b findings, sums and `format`

14 November 2026. Phase 0, part b, of "Collections, taken further" (the plan's gates, written before running). Nothing of it is
in `app/`: the set is [set.js](set.js), the tools measured [tools.js](tools.js), the runner `scripts/collections.js`
(`node scripts/collections.js --check` holds the set to the tools, asking no brain).

## How it was measured

- **The set:** four collections of 500 rows each, made by code from fixed seeds, the same every run: an association's expenses, a
  job search, a small shop's orders, members and their fees; money, dates from January 2025 to 11 November 2026, a status, a
  choice, a person, a box, some cells empty. Each exists in English, French, Arabic and Japanese with the same figures and its
  language's own columns, choices and names. Rows are in the order they were made, so this year's lie past the 200th.
- **24 questions in the four languages (96):** nine sums with a condition, seven counts, four by group, four of one row's value as
  a control. Each figure is worked out from the rows as made, by none of the tools measured; none is right from the first 200 rows.
- **A conversation:** Jean's base prompt, Tables' line, `table_create`, `table_rows` and `table_change`, the collection open beside
  the task in Tables' own words, the question as the first message, each call answered as Jean would, up to eight steps, the day
  fixed at 14 November 2026.
- **`table_rows`, two forms:** A, today's, word for word (200 rows, a JSON filter, "and N more: filter them"). B, the plan's:
  `where` in the words `rules()` reads, and `sum`, `count`, `by`, worked out on every row; with one of them it answers figures and
  no rows: how many rows they count, and how many had no value.
- **Right:** the last answer holds the figure, each group's for a question by group, read leniently (digit grouping, a currency,
  Arabic-Indic and full-width digits, 万), to the cent or rounded to the unit. Judged against every other question's figure, the
  answers of one run were "right" 24 times in 6,624, each a true coincidence (a group's count that is another question's figure).
- **Brains:** the Claude plan's Haiku (`claude-haiku-5-5`) and Sonnet (`claude-sonnet-5-5`) through Claude Code 2.1.323, three
  conversations at a time. 1,288 conversations in all, none failed by the server, no limit met.

## a. Sums: passes

The gate: with B, Haiku right on 85% of conversations or more, Sonnet 90%, Arabic and Japanese within 10 points of English.

| Brain | `table_rows` | Conversations | Right | en | fr | ar | ja | Asked for the figure | Calls | Tokens read, mean (most) | Wrong figures |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| Haiku | B, the plan's | 288, 3 runs | **100%** | 72/72 | 72/72 | 72/72 | 72/72 | 240/240 | 1.4 | 7,161 (19,896) | none |
| Sonnet | B, the plan's | 288, 3 runs | **100%** | 72/72 | 72/72 | 72/72 | 72/72 | 240/240 | 1.2 | 6,821 (10,289) | none |
| Haiku | A, today's | 96 | 97% | 24/24 | 22/24 | 23/24 | 24/24 | | 1.9 | 50,268 (235,044) | 3 sums: 1 said plainly, 2 with a doubt |
| Sonnet | A, today's | 96 | 100% | 24/24 | 24/24 | 24/24 | 24/24 | | 1.6 | 34,038 (148,253) | none |
| Haiku | C, B in fewer words | 96 | 100% | 24/24 | 24/24 | 24/24 | 24/24 | 80/80 | 1.9 | 8,816 (26,183) | none |
| Sonnet | C, B in fewer words | 96 | 100% | 24/24 | 24/24 | 24/24 | 24/24 | 80/80 | 1.5 | 7,146 (11,111) | none |

"Asked for the figure" counts the sums, counts and groups; "tokens read" adds every step of a conversation.

- **Brains ask.** In each of the 480 conversations with B about a sum, a count or a group, the first call asks for `sum`, `count`
  or `by`; none reads rows to add them. What B says after 200 rows ("and N more, not shown: … ask for sum or count") was never
  shown once: the tool's description alone does it. Each run of each brain is 96 of 96.
- **They pass on what a figure leaves out.** Told that some rows had no value (96 conversations for each brain), the answer said so
  94 times for Haiku and 90 for Sonnet ("two of those 124 expenses have no amount entered, so they aren't in the total").
- **One row's value** is found by `where` with `contains` or `is`, 48 of 48 for each brain, in 1.1 calls.
- **Today's tool is not wrong at 500 rows, it is dear.** With A, both brains page through the rows by date (`greater-than
  2025-12-31`, then `greater-than 2026-09-28`), read up to all 500, and add up to 267 numbers themselves; a count is read from the
  reply's own "N of its 500 rows", a group from one call for each choice. That is 5 to 7 times the tokens, 235,044 for one
  question. Haiku's three misses are sums it added wrong: 22,312.60 for 23,861.45 left to pay (122 of 124 rows added) and
  5,757.45 for 5,784.50 of travel, each called an estimate, and 6,460 for 6,590 of fees due, said plainly. About eight of
  Haiku's right answers and fifteen of Sonnet's tell the person the figure was added by hand and is to be checked.
- **What this doesn't say.** Both brains are at the ceiling, so the set can't rank two wordings that both work. Nothing here is
  past 500 rows: at 10,000, paging is 50 reads.

### What `where` refused

With B, 70 calls were refused, in 65 of the 576 conversations (11%): each was asked again once, and right.

| What the brain wrote | Haiku | Sonnet | Example |
|---|---:|---:|---|
| A year alone | 13 | 32 | `Category is Travel and Date is 2025` |
| A date's words with no "is" | 11 | 1 | `Collected by contains James and Paid on this year` |
| The collection by its name, or its place without `collections/` | 10 | 0 | `応募` |
| "is after", "is before" | 2 | 1 | `Envoyée le is after 2024-12-31` |

- `rules()` throws only the piece it couldn't read (`fill.js:79`), which a page's part swallows. B's refusal says the piece, the
  words a `where` takes and the collection's columns: that was enough every time.
- The 36 conversations of each brain about 2025 are where the year alone comes from: Sonnet wrote it first in 32 of them, then
  `last year`.

### B's words, and the ones dropped

- **As run:** "Read the rows of a table the user keeps, each with its id, which table_change needs: 200 at most. For a total or a
  count, ask for it rather than adding up rows: sum (a number column), count, and by (a column) for a figure per value; they are
  worked out on every row. where keeps some rows: a column, then is, is not, contains, before, after, >, < or is empty, then a
  value, joined by and; a date can be 2026-10-21, 2026-10, today, this week, this month, last month, this year, last year or last
  30 days." Its arguments: `table`, `where` ("e.g. Status is Paid and Date is this year"), `sum` ("A number column"), `count`,
  `by` ("A column"). A `filter` is still taken, and said nowhere.
- **What it weighs:** 212 tokens against today's 89, so 123 more (a quarter of its characters, as the budgets count): 76 for the
  description, 47 for the arguments.
- **Dropped, C:** the same without the list of what a `where` takes ("… where keeps some rows, in words."), 65 tokens more than
  today in place of 123. Still right every time, but refused in 47 of Haiku's 96 conversations and 21 of Sonnet's, against 11%:
  "Date is in 2026", "is in October 2026", "is between 2026-10-01 and 2026-10-31", "is on or after", Arabic's هي for "is", "is
  unchecked (no receipt)". It saves 58 tokens of prompt and costs Haiku half a call and 1,650 tokens read for each question.

## b. `format` on `table_create`: passes

The 80 ordinary requests of `test/tables/`, asked and scored as `npm run tables` does, twice for each brain, with `format: "money" |
"percent"` and `currency` on a column and one sentence before the example: "A number column of money takes format "money" and the
user's currency (EUR, JPY…); a share takes format "percent"." It adds 59 tokens (356 to 415). The gate: no lower than without it,
beyond what runs differ by.

| Brain | With `format`, 2 runs | Each run | Without it |
|---|---:|---|---|
| Haiku | **98%** (157/160) | 79/80, 78/80 | 98% (78/80, 31 October); 97% (232/240, 14 November, beside the whiteboard's tools) |
| Sonnet | **95%** (152/160) | 76/80, 76/80 | 94% of 240 (14 November); 93% (224/240, beside the whiteboard's tools) |

- **How noise was judged.** A run of 80 tables right 95% of the time moves by 2.4 points from one run to the next (a binomial's
  spread), two runs by 1.7, the three runs of the figures without it by 1.4: the two differ by 2.2 points before anything is
  meant. Both brains are a point or so over their figures without it, inside that. And the misses are the ones known without it:
  Sonnet's flats of 16 or 17 columns (4), its Arabic invoices' steps (2), a homework and a training column; Haiku's three are
  Japanese (a film's status, who an appointment is for, flats of 16 columns). None comes from `format`: Jean took every table, at
  the first try but once, and every column given a format is a number.
- **Money was marked** on 53 of Sonnet's 56 columns that are plainly money (an expense's amount, an invoice's, a price, a rent, a
  repair's cost), and on 42 of Haiku's 56: all 14 in Japanese, 13 in French, 11 in English, 4 in Arabic. Salaries and quotes got
  it too. No quantity, distance, duration or rating did, and nothing was made a share: no request of the 80 has one, so `percent`
  is measured only as doing no harm.
- **The currency follows the request where it can.** French gives EUR and Japanese JPY every time, and the flat to rent in Lyon is
  in euros in every language, Japanese and Arabic too. English names no country: where the request names no place, 21 of 22 are
  EUR, the sentence's own first example. In Arabic the brain can't know: Haiku leaves the format out 10 times of 14, Sonnet
  gives EUR, USD or SAR.
- Once, Haiku wrote `type: "money"` with a currency and no format, which Jean reads as a number today.

## What the plan should change

1. **Block 11 stands, and its reason changes.** Brains ask for the figure, so phase 3 builds `where`, `sum`, `count` and `by` as
   written. But today's `table_rows` already gets 500 rows right, by paging: what the plan buys is a sixth of the tokens, one
   call, a figure Jean worked out in place of one "added by hand, to be checked", and sums that hold past a few hundred rows.
2. **`rules()` reads what brains write first** (`fill.js`): a year alone (`Date is 2025`, `is in 2025`), `is after` and `is
   before`, a date's words with no `is` after a column (`Paid on this year`). That is 60 of the 70 refusals. A month in words and
   `between` only came with the shorter description.
3. **`table_rows` takes a collection by its name too,** as `follow()` does for a page: Haiku named it so 10 times in Japanese and
   Arabic.
4. **The refusal is the tool's own:** the piece not read, what a `where` takes, the columns with their choices. `rules()` gives the
   piece alone.
5. **Keep the list of what a `where` takes in the description:** its 58 tokens cost less than the calls it saves.
6. **With `sum`, `count` or `by`, answer figures and no rows,** always with how many rows they count and how many had no value:
   brains ask for `sum` and `count` together half the time, and pass the rows with no value on to the person.
7. **`format`: the brain says money, not which.** `currency` only when the request names a place or a currency; otherwise from the
   person's region, changed from the head's menu. Without that, English and Arabic collections come out in euros. A column sent as
   `type: "money"` is a number with `format: "money"`.

## Not run, not checked

- **A brain on this computer:** LM Studio wasn't running. The plan's "if that one doesn't, it reads rows as today" is unmeasured.
- Any brain but the plan's Haiku and Sonnet.
- Jean's own loop: the tools are answered outside the app, with Tables' three tools alone. In Jean a brain also has the Computer
  and Files, and could add rows up there.
- The working (the collection cited, the rows counted in the address), a second question in the same conversation, `or` in a
  `where` (written once), a relation, a formula column, more than 500 rows.
- `format` against a run without it on the same day and prompt: the figures without it are those of `test/tables/results.md` and
  `test/whiteboard/results.md`. `percent` on a request that has a share.
- Arabic and Japanese were written by the session that built the set, not read by a native reader.
