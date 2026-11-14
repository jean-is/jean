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

## c. Screen readers: not run

The pass needs the grip, the Move mode and the menu, which T4 builds first; VoiceOver and NVDA by hand then, before the rest of T4.

## d. Names

French: *Tableau blanc*, the owner's word. Japanese ホワイトボード and Arabic سبورة (or سبورة بيضاء) still wait for a native reader;
the planning session's reading, and the lanes as *Sections*, are in the plan.
