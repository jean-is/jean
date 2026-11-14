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
| `skill`'s line naming the skills alone, as Jean was | 45% (86/192) | 57% (110/192) | 80% |
| With the line's words for whiteboard and table_create's note | 79.7% (153/192) | 89% (170/192) | 80% |
| The same, table_create's own words cut so the note fits in 400 tokens: Jean's | 79.7% (153/192) | 87.5% (168/192) | 80% |
| Jean's, by language: en, fr, ar, ja | 83, 75, 79, 81 | 90, 81, 85, 94 | ar, ja within 10 of en |
| Whiteboards made for the 80 table requests, three runs, in each of the three | 0 | 0 | 2 at most |
| Those tables right: as Jean was, then Jean's | 98%, 99% | 93%, 95% | about as before |

Before them, every request that names a whiteboard got one (Haiku 86%, its misses tables made without reading the skill; Sonnet
99%), and almost none of those that only imply one: of the choosing set's 96, Haiku made 3, Sonnet 15. Every such miss is the skill
not read: a table, a document or words instead, or Sonnet reading "project-plan". When the skill was read, it was followed.

Two descriptions, Jean's since (`app/caps/skills/directory.js`, `app/caps/tables/tool.js`), close most of it. In `skill`'s line,
after the names: "; read whiteboard for a brainstorm, a retrospective or things to sort into groups with others, in place of a list
or a table". After table_create's description: "For notes to brainstorm or sort with others, such as a retrospective, read the skill
whiteboard instead: it brings a whiteboard." The note took table_create from about 390 tokens to 404–423, so its own words were cut,
every rule kept: "Make a table to keep track of something" went, which the tool's name and line say, and the sentence on the person
filling in a row took in the one on what the request names, which said the same. With them it is 376–395 tokens. Measured again,
the whiteboards held and the tables didn't drop. Sonnet passes the gate on all three counts. Haiku passes on languages and tables
and is one conversation short on the first: 153 of 192, where 154 is 80%. In the first run, one conversation of each brain failed at
the server ("fetch failed") and is left out of 528.

The misses left, with Jean's wording: the skill not read 29 times by Haiku (the house move planned "on a board the whole family can
see" 10 times in 12, a table each time; the hiring steps 6; the office party 5) and 19 by Sonnet (that move 10 times, reading
"project-plan" instead; the French kick-off as a table 3, the Arabic retro as a document 3); and a whiteboard with a section left
empty, 10 by Haiku and 5 by Sonnet: "To sort" or "Favorites" for the podcast's names, the office party's sections for everyone to
add to. The skill doesn't ask that every section hold a note, and that request asks for a place others fill: counted right, Haiku is
at 85% (163/192) and Sonnet at 90% (173/192).

Wordings tried first, Haiku on the choosing set's 8 English whiteboard requests (no whiteboard made where none is right in any):

| Wording | Runs | Right |
|---|---:|---:|
| The line naming the skills alone | 3 | 0 of 24 |
| The line, then "; read whiteboard for a brainstorm, a retrospective or ideas to sort with others, in place of a list or a table" | 1 | 2 of 8 |
| The line asking to read a skill "first whenever a request is for what one makes", whiteboard's use after it | 1 | 3 of 8 |
| table_create's note alone | 2 | 5 of 16 |
| The second row's line and the note | 1 | 6 of 8 |
| The line's words above and the note | 2 | 11 of 16 |

`npm run whiteboard -- --parts skill:make,skill:choose,skill:tables --runs 3` measures Jean as it is; SKILL_LINE and TABLE_NOTE
in the environment measure another line or note, and the line naming the skills alone with an empty TABLE_NOTE, Jean without them.

#### haiku (claudecode), Jean's: the line's words, the note, table_create's words cut

528 conversations, 3 runs each.

| Part | en | fr | ar | ja | All | Commonest misses |
|---|---:|---:|---:|---:|---:|---|
| skill:make | 100% (24/24) | 100% (24/24) | 100% (24/24) | 100% (24/24) | 100% (96/96) | — |
| skill:choose | 83% (40/48) | 75% (36/48) | 79% (38/48) | 81% (39/48) | 80% (153/192) | skill not read: table_create (17); skill not read: table_create, write (8); skill not read: words (3); a section empty (10) |
| skill:tables | 98% (59/60) | 100% (60/60) | 98% (59/60) | 98% (59/60) | 99% (237/240) | no task (1); no المهمة (1); 参加の状況: status (1) |

#### sonnet (claudecode), Jean's: the line's words, the note, table_create's words cut

528 conversations, 3 runs each.

| Part | en | fr | ar | ja | All | Commonest misses |
|---|---:|---:|---:|---:|---:|---|
| skill:make | 100% (24/24) | 100% (24/24) | 100% (24/24) | 100% (24/24) | 100% (96/96) | — |
| skill:choose | 90% (43/48) | 81% (39/48) | 85% (41/48) | 94% (45/48) | 88% (168/192) | project-plan read (10); skill not read: table_create (3); skill not read: write, table_create (3); a section empty (5) |
| skill:tables | 97% (58/60) | 97% (58/60) | 93% (56/60) | 93% (56/60) | 95% (228/240) | n columns (7); no handed (1); الحالة: steps مرسلة, مدفوعة (1); الحالة: steps مدفوعة (1) |

#### haiku (claudecode), with the line's words and the note, table_create as it was

527 conversations, 3 runs each; 1 failed at the server.

| Part | en | fr | ar | ja | All | Commonest misses |
|---|---:|---:|---:|---:|---:|---|
| skill:make | 100% (24/24) | 100% (24/24) | 100% (24/24) | 100% (24/24) | 100% (96/96) | — |
| skill:choose | 81% (39/48) | 73% (35/48) | 79% (38/48) | 85% (41/48) | 80% (153/192) | skill not read: table_create (20); skill not read: table_create, write (6); skill not read: words (5); a section empty (8) |
| skill:tables | 100% (60/60) | 98% (59/60) | 98% (59/60) | 95% (56/59) | 98% (234/239) | no statut (1); الحالة: steps مرسلة (1); no 電話 (1); no プレゼント (1) |

#### sonnet (claudecode), with the line's words and the note, table_create as it was

527 conversations, 3 runs each; 1 failed at the server.

| Part | en | fr | ar | ja | All | Commonest misses |
|---|---:|---:|---:|---:|---:|---|
| skill:make | 100% (24/24) | 100% (24/24) | 100% (24/24) | 100% (24/24) | 100% (96/96) | — |
| skill:choose | 90% (43/48) | 81% (39/48) | 88% (42/48) | 96% (46/48) | 89% (170/192) | skill not read: project-plan read, table_create (9); skill not read: table_create (3); skill not read: write, table_create (2); a section empty (7) |
| skill:tables | 90% (54/60) | 98% (59/60) | 95% (57/60) | 93% (55/59) | 94% (225/239) | n columns (5); no address (3); no rent (3); no handed (2) |

#### haiku (claudecode), before them

528 conversations, 3 runs each.

| Part | en | fr | ar | ja | All | Commonest misses |
|---|---:|---:|---:|---:|---:|---|
| skill:make | 88% (21/24) | 100% (24/24) | 63% (15/24) | 96% (23/24) | 86% (83/96) | skill not read: table_create (11); skill not read: write, write (1); owner サム (1) |
| skill:choose | 50% (24/48) | 50% (24/48) | 56% (27/48) | 50% (24/48) | 52% (99/192) | skill not read: table_create (45); skill not read: words (39); skill not read: table_create, write (5) |
| skill:tables | 100% (60/60) | 100% (60/60) | 98% (59/60) | 92% (55/60) | 98% (234/240) | no プレゼント (3); no المهمة (1); no 電話 (1); no 名前 (1) |

#### sonnet (claudecode), before them

528 conversations, 3 runs each.

| Part | en | fr | ar | ja | All | Commonest misses |
|---|---:|---:|---:|---:|---:|---|
| skill:make | 100% (24/24) | 100% (24/24) | 100% (24/24) | 96% (23/24) | 99% (95/96) | a week's order (1) |
| skill:choose | 63% (30/48) | 50% (24/48) | 63% (30/48) | 56% (27/48) | 58% (111/192) | skill not read: words (31); skill not read: table_create (22); project-plan read (12); skill not read: write (10) |
| skill:tables | 93% (56/60) | 93% (56/60) | 92% (55/60) | 93% (56/60) | 93% (223/240) | n columns (10); no handed (2); الحالة: steps مرسلة, مدفوعة (2); no rendu (1) |

### Once Skills is found: Sonnet holds, Haiku falls back to 69%, and to 77% with the `when` in its listing

Measured with `--found`, the gate unchanged. Skills is found once a skill has been read, and Whiteboards may still not be. Then
`skill`'s line names no skill, and `readFor` goes with the names. Skills adds save_skill, its line and the rule "When a request
matches a skill, read it and follow its steps.", and `<skills>` lists each of Jean's own by its `text-en`, whiteboard's as "Notes in
sections, to sort ideas together". table_create keeps its note. suggest_skill is deferred, so it isn't declared.

| A whiteboard made right through the skill, where one is right | Haiku | Sonnet | Gate |
|---|---:|---:|---:|
| Skills not found, Jean's (above) | 79.7% (153/192) | 87.5% (168/192) | 80% |
| Skills found, before the `when` in `<skills>` | 69% (132/192) | 87.5% (168/192) | 80% |
| Those, by language: en, fr, ar, ja | 67, 63, 67, 79 | 88, 79, 90, 94 | ar, ja within 10 of en |
| Skills found, whiteboard's `when` after its words in `<skills>`: Jean's | 77% (147/192) | 91% (174/192) | 80% |
| Those, by language: en, fr, ar, ja | 77, 77, 73, 79 | 92, 83, 90, 98 | ar, ja within 10 of en |
| Whiteboards made for the 80 table requests, three runs, in each | 0 | 0 | 2 at most |
| Those tables right: before the `when`, then with it | 98%, 98% | 92%, 91% | about as before |

Before the `when` was there, Haiku lost 11 points once Skills is found. What told it a whiteboard's use was `readFor` in `skill`'s line, and the
listing's words don't say brainstorm or retrospective. Of its 60 misses, 57 are the skill not read: words 28, a table 23, and
"project-plan" read 6. Sonnet doesn't move: 22 not read (words 10, a table 8) and one section empty.

With "; read whiteboard for a brainstorm, a retrospective or things to sort into groups with others, in place of a list or a table"
after whiteboard's words in `<skills>` (`readFor(['whiteboard'])`, the same words), Haiku comes back to 77%. That is under the gate, and 2.7 points under where it is before Skills is found. Its 45 misses: 33 not read (words 14,
a table 11, "project-plan" 8) and 12 with a section empty. Sonnet is at 91%. It shipped at the owner's word, under the gate, since it
beats 69%: `listedOwn()` in `app/caps/skills/directory.js`, which `listed()` calls, gives each of Jean's own its `readFor`. `--found`
measures Jean with it, and an empty `SKILLS_TEXT` without it.

Sonnet's tables, 92% and 91% here, were 95% in the run above and 93% at first: its misses are its own long tables ("n columns", 11
each time), and the tables' tools and words are the same in every state.

The next wording to measure keeps "; read whiteboard for …" in `skill`'s line once Skills is found, where Haiku read it before
(`readFor(own)` after the line's words with no names): `SKILL_LINE="read the steps of a skill before asking the user anything for it
or following it; read whiteboard for a brainstorm, a retrospective or things to sort into groups with others, in place of a list or
a table" npm run whiteboard -- --parts skill:make,skill:choose,skill:tables --runs 3 --found`.

#### haiku (claudecode), Skills found, before the `when` in `<skills>`

528 conversations, 3 runs each.

| Part | en | fr | ar | ja | All | Commonest misses |
|---|---:|---:|---:|---:|---:|---|
| skill:make | 100% (24/24) | 100% (24/24) | 100% (24/24) | 100% (24/24) | 100% (96/96) | — |
| skill:choose | 67% (32/48) | 63% (30/48) | 67% (32/48) | 79% (38/48) | 69% (132/192) | skill not read: words (28); skill not read: table_create (21); project-plan read (6); a section empty (3) |
| skill:tables | 97% (58/60) | 100% (60/60) | 97% (58/60) | 97% (58/60) | 98% (234/240) | no medicine (1); no who (1); no gift (1); no price (1) |

#### sonnet (claudecode), Skills found, before the `when` in `<skills>`

528 conversations, 3 runs each.

| Part | en | fr | ar | ja | All | Commonest misses |
|---|---:|---:|---:|---:|---:|---|
| skill:make | 100% (24/24) | 96% (23/24) | 100% (24/24) | 100% (24/24) | 99% (95/96) | a section empty (1) |
| skill:choose | 88% (42/48) | 81% (39/48) | 90% (43/48) | 94% (45/48) | 88% (169/192) | skill not read: words (10); skill not read: table_create (8); skill not read: write, table_create (2); a section empty (1) |
| skill:tables | 95% (57/60) | 93% (56/60) | 90% (54/60) | 90% (54/60) | 92% (221/240) | n columns (11); الحالة: steps مرسلة, مدفوعة (2); no ステータス (2); no handed (1) |

#### haiku (claudecode), Skills found, the `when` in `<skills>`: Jean's

528 conversations, 3 runs each.

| Part | en | fr | ar | ja | All | Commonest misses |
|---|---:|---:|---:|---:|---:|---|
| skill:make | 100% (24/24) | 100% (24/24) | 100% (24/24) | 100% (24/24) | 100% (96/96) | — |
| skill:choose | 77% (37/48) | 77% (37/48) | 73% (35/48) | 79% (38/48) | 77% (147/192) | skill not read: words (14); a section empty (12); skill not read: table_create (11); project-plan read (8) |
| skill:tables | 97% (58/60) | 100% (60/60) | 97% (58/60) | 98% (59/60) | 98% (235/240) | no cost (1); no course (1); no completed (1); no سلم (1) |

#### sonnet (claudecode), Skills found, the `when` in `<skills>`: Jean's

528 conversations, 3 runs each.

| Part | en | fr | ar | ja | All | Commonest misses |
|---|---:|---:|---:|---:|---:|---|
| skill:make | 100% (24/24) | 100% (24/24) | 100% (24/24) | 100% (24/24) | 100% (96/96) | — |
| skill:choose | 92% (44/48) | 83% (40/48) | 90% (43/48) | 98% (47/48) | 91% (174/192) | skill not read: table_create (6); a section empty (6); skill not read: write (3); skill not read: words (2) |
| skill:tables | 93% (56/60) | 87% (52/60) | 88% (53/60) | 95% (57/60) | 91% (218/240) | n columns (11); no handed (2); no rendu (2); الحالة: steps مرسلة, مدفوعة (2) |

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
