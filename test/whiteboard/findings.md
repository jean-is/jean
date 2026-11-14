# Whiteboard: phase 0 findings

14 November 2026. Phase 0 of the whiteboard (the plan's gates, written before running). Nothing of it is in `app/`.

## a. Brains: passes, with "three to seven areas" in both tools

- With no number in their wording, both brains made more areas than a person sorts at once: a fair's brainstorm 9 to 13, a
  wedding 9 to 12, a retro of 20 notes 7 or 8. Every miss of Sonnet's was that, and all but one of Haiku's.
- Saying "a few areas, three to seven" in both tools, and the capability's lines cut to its 40 tokens, took Haiku to 96.8% of its
  312 conversations (gate 85%) and Sonnet to 96.5% (gate 90%), both making every whiteboard right, Arabic and Japanese within
  10 points of English ([results](results.md)). Haiku's French choosing is its weakest (88%).
- Brains regroup a whiteboard's notes by their ids: Sonnet 24 of 24, Haiku 22 of 24. Once more Haiku made a new whiteboard rather
  than sorting the one open beside the task: the tool's wording says which to use (T5).
- Neither made a whiteboard for any of the 80 ordinary table requests, three runs each. Haiku's tables stay at 97%; Sonnet's are
  94% without the whiteboard's tools and 93% with them, under the gate's 96% either way, by its own tables of many columns.
- Choosing: a whiteboard where one is right and none elsewhere, 96% for Haiku and 94% for Sonnet, with every tool present (the
  best case: how a brain finds Whiteboards, through `offer` or a skill, is T5's to pick and measure). The misses are fair calls:
  a podcast's names brainstormed in the conversation, product feedback sorted into a table.
- GPT-5 mini wasn't measured: Copilot withdrew the model during the run.

## b. Spike: passes, at the edge for another person's change

Inside Jean, through its sealed storage, Tables' `load()` and Together's read chain: 300 notes, 12 areas, 30 texts, 200 drawn
lines of 200 points, a log of 5,000 lines (1 MB). Chromium headless with the CPU slowed 4×; WebKit at full speed.

| | Chromium, 4× | Chromium, 1,000 notes, 4× | WebKit | Gate |
|---|---:|---:|---:|---:|
| `load()` | 51 ms | 54 ms | 10 ms | |
| A drop, until painted | 63 ms (worst 68) | 68 (95) | 34 (48) | 100 ms |
| Another's change, through Together's read chain | 130 ms (worst 134) | 134 (155) | | 150 ms |
| Panning | 61 fps | 61 fps | 60 fps | 50 fps |
| Zooming across the far mark | 56 fps | 47 fps | 58 fps | 50 fps |

- `load()` is almost all folding: reading the sealed file takes 3 ms and parsing it 11. Another's change folds the log about
  four times (`take()`, `watch()`, `came()`, `reread()`), so T1 folds only what came and reads once per change.
- The far mark's restyle costs one long frame (51 ms, 133 with 1,000 notes): it changes once the zoom settles.
- Not measured: a phone, and a headed window (nothing here contends for the GPU, which is what D285's headed runs caught).
- Phase 2, the view itself (14 November), Chromium at 4×, 300 notes in 12 sections, 30 texts and 200 drawn lines, and 20 notes showing a
  creation's card: panning at 59 fps (worst frame 33 ms), zooming across the far mark at 52 (50 ms), a whole redraw 39 ms; 59, 55 and 36
  without the cards. Before, the pan set on the board as a custom property restyled its 36,000 elements at each step: 3 fps.

## c. Screen readers: not run

The pass needs the grip, the Move mode and the menu, which T4 builds first; VoiceOver and NVDA by hand then, before the rest of T4.

## d. Names

French: *Tableau blanc*, the owner's word. Japanese ホワイトボード and Arabic سبورة (or سبورة بيضاء) still wait for a native reader;
the planning session's reading, and the lanes as *Sections*, are in the plan.

## e. Found through its skill (T5): with two descriptions, Sonnet passes and Haiku is one conversation short

14 November, Haiku and Sonnet through the Claude plan, Whiteboards off and Jean's own skills offered as own-skills offers them,
three runs in four languages ([results](results.md#through-the-skill-t5-the-gate-written-before-the-runs)); GPT-5 mini isn't
offered by Copilot.

- Before them, the skill was found when a request named a whiteboard (Haiku 86%, Sonnet 99%) and almost never when it only implied
  one: 3 and 15 of the 96 brainstorms, retros and boards to sort. Where one is right, 45% and 57%, under the gate's 80%. Each miss
  is the skill not read; read, it was always followed. No whiteboard was made where a table or words are right.
- Two descriptions say when to read it. `skill`'s line, after the names: "; read whiteboard for a brainstorm, a retrospective or
  things to sort into groups with others, in place of a list or a table". After table_create's description: "For notes to brainstorm
  or sort with others, such as a retrospective, read the skill whiteboard instead: it brings a whiteboard." With both, Haiku goes to
  79.7% (153/192) and Sonnet to 89%, Arabic and Japanese within 10 points of English, no whiteboard for the 239 tables, which stay
  at 98% and 94% right. Sonnet passes, and Haiku is short by one conversation. Neither description alone did it: Haiku made 5 of
  16 with the note and 2 of 8 with the line's words.
- The note took table_create past the 400 tokens a tool's schema keeps to (404–423), so its own words were cut, every rule kept:
  "Make a table to keep track of something", which its name and line say, and two sentences that said the same thing in one. With
  the note, 376–395 tokens. Measured again, both hold: Haiku 79.7% (en 83, fr 75, ar 79, ja 81), Sonnet 87.5% (90, 81, 85, 94),
  no whiteboard for the 240 tables, which are right 99% and 95% of the time against 98% and 93% before.
- In `app/`: a `when` on the directory's whiteboard entry, which own-skills' line adds after the names, and the note on
  table_create wherever the skill can be read; `test/tables.test.js` holds the tool to 400 tokens with the note.
- What is left: a plan "on a board the whole family can see", which Haiku mostly made a table and Sonnet read as "project-plan";
  a section left empty for the group to fill ("To sort", Favorites, the party's sections everyone adds to), counted as a miss though
  the skill doesn't forbid it (with them, 85% and 90%).
- Not measured: once Skills is found, its own list replaces the names in the line, the skill's description is what the brain
  reads, and the line's words are gone.

## f. Once Skills is found: Haiku falls back, and the `when` in its listing brings it to 77%, not enough

15 November, the same set and gate, `--found` ([results](results.md#once-skills-is-found-sonnet-holds-haiku-falls-back-to-69-and-to-77-with-the-when-in-its-listing)).

- Once a skill has been read, Skills is found, `skill`'s line names no skill and `readFor` goes with the names. Haiku falls back
  from 79.7% to 69%, the skill unread for brainstorms answered in words or as a table. Sonnet holds at 87.5%. No whiteboard for
  tables.
- Whiteboard's `when` after its words in `<skills>` ("Notes in sections, to sort ideas together; read whiteboard for …") brings
  Haiku to 77% (en 77, fr 77, ar 73, ja 79) and Sonnet to 91%: under the gate for Haiku, so not in `app/`, where it would be one
  line of `listed()` in `caps/skills/skills.js` reusing `readFor`.
- Next to measure: the same words kept in `skill`'s line once Skills is found, where Haiku read them before.
