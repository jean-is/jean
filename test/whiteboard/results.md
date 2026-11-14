# Whiteboard: how well brains make and sort one

Written by `npm run whiteboard`, three runs of each request, on 14 November 2026 (scripts/whiteboard.js). Each conversation
has Jean's base prompt and the lines of the tools present, each call answered as Jean would, up to 8 steps. A plan's bridge
answering with its own failure is counted as the server's, not the brain's.

The gate, written before the first run: Haiku right on 85% of runs or more and Sonnet on 90%, Arabic and Japanese within 10
points of English, ordinary tables right on 96% or more, and at most 2 whiteboards made for them.

## Through the skill (T5): the gate, written before the runs

In use, a brain gets Whiteboards' tools only once it reads the skill "Make a whiteboard", which turns the capability on. The parts
`skill:make` (the 8 briefs), `skill:choose` (the 16 choosing requests) and `skill:tables` (the 20 table requests in each language)
start with Whiteboards off: `table_create`, `write` and `skill`, its line naming Jean's own skills as own-skills writes it; reading
"whiteboard" answers its steps and "New tools: whiteboard, whiteboard_change", which are declared from the next step, as Jean does.
In English, French, Arabic and Japanese, three runs each, Haiku and Sonnet through the Claude plan. GPT-5 mini isn't measured:
Copilot answers that the model "is not available" (14 November, as for gpt-5.1-mini and gpt-4.1).

The gate: each brain makes a whiteboard right, after reading the skill, for at least 80% of the requests where one is right
(`skill:make` and the choosing set's whiteboard requests), Arabic and Japanese within 10 points of English, and makes at most 2
whiteboards for the table requests over all three runs (240 conversations).

### What the runs gave: Sonnet passes, Haiku one conversation short, with two tool descriptions saying when to read it

| A whiteboard made right through the skill, where one is right | Haiku | Sonnet | Gate |
|---|---:|---:|---:|
| `skill`'s line naming the skills alone, as Jean is | 45% (86/192) | 57% (110/192) | 80% |
| With the line's words for whiteboard and table_create's note | 79.7% (153/192) | 89% (170/192) | 80% |
| Those, by language: en, fr, ar, ja | 81, 73, 79, 85 | 90, 81, 88, 96 | ar, ja within 10 of en |
| Whiteboards made for the 80 table requests, three runs | 0 and 0 | 0 and 0 | 2 at most |

As Jean is, every request that names a whiteboard got one (Haiku 86%, its misses tables made without reading the skill; Sonnet
99%), and almost none of those that only imply one: of the choosing set's 96, Haiku made 3, Sonnet 15. Every such miss is the skill
not read: a table, a document or words instead, or Sonnet reading "project-plan". When the skill was read, it was followed.

Two descriptions, both in `app/` and not shipped, close most of it. In `skill`'s line, after the names: "; read whiteboard for a
brainstorm, a retrospective or things to sort into groups with others, in place of a list or a table". After table_create's
description: "For notes to brainstorm or sort with others, such as a retrospective, read the skill whiteboard instead: it brings a
whiteboard." With both, Sonnet passes the gate on all three counts. Haiku passes on languages and tables and is one conversation
short on the first: 153 of 192, where 154 is 80%. Tables stay as they were: Haiku 98% right, Sonnet 94%. One conversation of each
brain failed at the server ("fetch failed") and is left out of 528.

The misses left: the skill not read 31 times by Haiku (the house move planned "on a board the whole family can see" 12 times in 12,
a table each time; the hiring steps 7) and 15 by Sonnet (that move 9 times, reading "project-plan" instead; the French kick-off as a
table 3, the Arabic retro as a document 3); and a whiteboard with a section left empty, 8 by Haiku and 7 by Sonnet: "Favorites" for
the podcast's names, the office party's sections for everyone to add to. The skill doesn't ask that every section hold a note, and
that request asks for a place others fill: counted right, Haiku is at 84% (161/192) and Sonnet at 92% (177/192).

Wordings tried first, Haiku on the choosing set's 8 English whiteboard requests (no whiteboard made where none is right in any):

| Wording | Runs | Right |
|---|---:|---:|
| The line as Jean has it | 3 | 0 of 24 |
| The line, then "; read whiteboard for a brainstorm, a retrospective or ideas to sort with others, in place of a list or a table" | 1 | 2 of 8 |
| The line asking to read a skill "first whenever a request is for what one makes", whiteboard's use after it | 1 | 3 of 8 |
| table_create's note alone | 2 | 5 of 16 |
| The second row's line and the note | 1 | 6 of 8 |
| The line's words above and the note | 2 | 11 of 16 |

`npm run whiteboard -- --parts skill:make,skill:choose,skill:tables --runs 3` measures Jean as it is; SKILL_LINE and TABLE_NOTE
in the environment measure another line or note.

#### haiku (claudecode), with the line's words and the note

527 conversations, 3 runs each; 1 failed at the server.

| Part | en | fr | ar | ja | All | Commonest misses |
|---|---:|---:|---:|---:|---:|---|
| skill:make | 100% (24/24) | 100% (24/24) | 100% (24/24) | 100% (24/24) | 100% (96/96) | — |
| skill:choose | 81% (39/48) | 73% (35/48) | 79% (38/48) | 85% (41/48) | 80% (153/192) | skill not read: table_create (20); skill not read: table_create, write (6); skill not read: words (5); a section empty (8) |
| skill:tables | 100% (60/60) | 98% (59/60) | 98% (59/60) | 95% (56/59) | 98% (234/239) | no statut (1); الحالة: steps مرسلة (1); no 電話 (1); no プレゼント (1) |

#### sonnet (claudecode), with the line's words and the note

527 conversations, 3 runs each; 1 failed at the server.

| Part | en | fr | ar | ja | All | Commonest misses |
|---|---:|---:|---:|---:|---:|---|
| skill:make | 100% (24/24) | 100% (24/24) | 100% (24/24) | 100% (24/24) | 100% (96/96) | — |
| skill:choose | 90% (43/48) | 81% (39/48) | 88% (42/48) | 96% (46/48) | 89% (170/192) | skill not read: project-plan read, table_create (9); skill not read: table_create (3); skill not read: write, table_create (2); a section empty (7) |
| skill:tables | 90% (54/60) | 98% (59/60) | 95% (57/60) | 93% (55/59) | 94% (225/239) | n columns (5); no address (3); no rent (3); no handed (2) |

#### haiku (claudecode), as Jean is

528 conversations, 3 runs each.

| Part | en | fr | ar | ja | All | Commonest misses |
|---|---:|---:|---:|---:|---:|---|
| skill:make | 88% (21/24) | 100% (24/24) | 63% (15/24) | 96% (23/24) | 86% (83/96) | skill not read: table_create (11); skill not read: write, write (1); owner サム (1) |
| skill:choose | 50% (24/48) | 50% (24/48) | 56% (27/48) | 50% (24/48) | 52% (99/192) | skill not read: table_create (45); skill not read: words (39); skill not read: table_create, write (5) |
| skill:tables | 100% (60/60) | 100% (60/60) | 98% (59/60) | 92% (55/60) | 98% (234/240) | no プレゼント (3); no المهمة (1); no 電話 (1); no 名前 (1) |

#### sonnet (claudecode), as Jean is

528 conversations, 3 runs each.

| Part | en | fr | ar | ja | All | Commonest misses |
|---|---:|---:|---:|---:|---:|---|
| skill:make | 100% (24/24) | 100% (24/24) | 100% (24/24) | 96% (23/24) | 99% (95/96) | a week's order (1) |
| skill:choose | 63% (30/48) | 50% (24/48) | 63% (30/48) | 56% (27/48) | 58% (111/192) | skill not read: words (31); skill not read: table_create (22); project-plan read (12); skill not read: write (10) |
| skill:tables | 93% (56/60) | 93% (56/60) | 92% (55/60) | 93% (56/60) | 93% (223/240) | n columns (10); no handed (2); الحالة: steps مرسلة, مدفوعة (2); no rendu (1) |

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
