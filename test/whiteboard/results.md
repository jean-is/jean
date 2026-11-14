# Whiteboard: how well brains make and sort one

Written by `npm run whiteboard`, three runs of each request, on 14 November 2026 (scripts/whiteboard.js). Each conversation
has Jean's base prompt and the lines of the tools present, each call answered as Jean would, up to 8 steps. A plan's bridge
answering with its own failure is counted as the server's, not the brain's.

The gate, written before the first run: Haiku right on 85% of runs or more and Sonnet on 90%, Arabic and Japanese within 10
points of English, ordinary tables right on 96% or more, and at most 2 whiteboards made for them.

## The wording kept: "three to seven" areas, and the capability's lines cut to 40 tokens

The lines the prompt lists, cut after the runs below to the 40 tokens a capability has ("notes in named areas, to brainstorm,
plan or sort ideas with others"; "move, add or regroup a whiteboard's notes"), measured again.

### haiku (claudecode)

312 conversations.

| Part | en | fr | ar | ja | All | Commonest misses |
|---|---:|---:|---:|---:|---:|---|
| make | 100% (24/24) | 100% (24/24) | 100% (24/24) | 100% (24/24) | 100% (96/96) | — |
| regroup | 100% (6/6) | 83% (5/6) | 100% (6/6) | 83% (5/6) | 92% (22/24) | n areas (2); made another whiteboard (1); n notes left on the shelf (1) |
| choose | 100% (48/48) | 88% (42/48) | 96% (46/48) | 100% (48/48) | 96% (184/192) | none: table_create (3); none: table_create, write (2); none: words (2) |

The three parts: 96.8% (302/312), over its gate of 85%. By language, English 100%, Arabic 97%, Japanese 99%, French 91%: its
French misses are the garden's ideas and the product feedback sorted into a table.

### sonnet (claudecode)

312 conversations.

| Part | en | fr | ar | ja | All | Commonest misses |
|---|---:|---:|---:|---:|---:|---|
| make | 100% (24/24) | 100% (24/24) | 100% (24/24) | 100% (24/24) | 100% (96/96) | — |
| regroup | 100% (6/6) | 100% (6/6) | 100% (6/6) | 100% (6/6) | 100% (24/24) | — |
| choose | 94% (45/48) | 94% (45/48) | 96% (46/48) | 94% (45/48) | 94% (181/192) | none: words (11) |

The three parts: 96.5% (301/312), over its gate of 90%. Its eleven answers in words are the podcast's names again.

## "Three to seven" areas, with the longer lines

Both tools say how many areas to make or sort into (test/whiteboard/tools.js). The ordinary tables weren't run again: the change
is in the whiteboard's tools alone.

### haiku (claudecode)

312 conversations.

| Part | en | fr | ar | ja | All | Commonest misses |
|---|---:|---:|---:|---:|---:|---|
| make | 100% (24/24) | 96% (23/24) | 100% (24/24) | 96% (23/24) | 98% (94/96) | no whiteboard (2) |
| regroup | 83% (5/6) | 83% (5/6) | 83% (5/6) | 100% (6/6) | 88% (21/24) | n areas (3); made another whiteboard (2); n notes left on the shelf (2) |
| choose | 100% (48/48) | 92% (44/48) | 96% (46/48) | 100% (48/48) | 97% (186/192) | none: table_create (3); none: words (2); none: table_create, write (1) |

The three parts: 96.5% (301/312), over its gate of 85%.

### sonnet (claudecode)

312 conversations.

| Part | en | fr | ar | ja | All | Commonest misses |
|---|---:|---:|---:|---:|---:|---|
| make | 96% (23/24) | 100% (24/24) | 100% (24/24) | 100% (24/24) | 99% (95/96) | n areas (1) |
| regroup | 100% (6/6) | 100% (6/6) | 100% (6/6) | 100% (6/6) | 100% (24/24) | — |
| choose | 94% (45/48) | 90% (43/48) | 94% (45/48) | 94% (45/48) | 93% (178/192) | none: words (12); none: table_create (2) |

The three parts: 95.2% (297/312), over its gate of 90%. Its twelve answers in words are all the same request, names for a
podcast, which it brainstormed in the conversation.

## The first wording, with no number of areas

### haiku (claudecode)

552 conversations. Whiteboards made for ordinary tables: 0.

| Part | en | fr | ar | ja | All | Commonest misses |
|---|---:|---:|---:|---:|---:|---|
| make | 88% (21/24) | 92% (22/24) | 92% (22/24) | 88% (21/24) | 90% (86/96) | n areas (9); owner سام (1) |
| regroup | 100% (6/6) | 83% (5/6) | 100% (6/6) | 100% (6/6) | 96% (23/24) | n areas (1) |
| choose | 100% (48/48) | 94% (45/48) | 96% (46/48) | 98% (47/48) | 97% (186/192) | none: table_create (3); none: words (3) |
| tables | 98% (59/60) | 98% (59/60) | 98% (59/60) | 92% (55/60) | 97% (232/240) | no ステータス (2); no プレゼント (2); no task (1); no rendu (1) |

### sonnet (claudecode)

552 conversations. Whiteboards made for ordinary tables: 0.

| Part | en | fr | ar | ja | All | Commonest misses |
|---|---:|---:|---:|---:|---:|---|
| make | 88% (21/24) | 88% (21/24) | 88% (21/24) | 79% (19/24) | 85% (82/96) | n areas (14) |
| regroup | 100% (6/6) | 67% (4/6) | 50% (3/6) | 67% (4/6) | 71% (17/24) | n areas (7) |
| choose | 94% (45/48) | 90% (43/48) | 94% (45/48) | 94% (45/48) | 93% (178/192) | none: words (12); none: table_create (2) |
| tables | 97% (58/60) | 93% (56/60) | 88% (53/60) | 95% (57/60) | 93% (224/240) | n columns (9); الحالة: steps مرسلة, مدفوعة (3); no doctor (1); no handed (1) |

Sonnet without the whiteboard's tools, `npm run tables -- --runs 3` the same day: 94% of 240 tables. So its 93% here is its own
(tables of more than 15 columns, mostly), the whiteboard's tools costing about a point, and its 94% is under the gate's 96% with
or without them.

### gpt-5-mini (copilot)

Void: Copilot stopped offering the model during the run and answered each request "Error: Execution failed: Model "gpt-5-mini"
is not available.", which the harness then counted as words. It now counts such an answer as the server's failure.
