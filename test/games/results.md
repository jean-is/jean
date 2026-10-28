# Games: how often a brain makes one that plays clean

Written by `npm run games -- --write`, one section per brain, replaced when that brain is measured again. Each brief of
set.json is a fresh visit to Jean in its language, the measured brain answering through Jean's own prompt, the skill
"Make a game", its tools and their play-test, unguided: a question it asks gets Jean's recommended answer. A game is clean
when its last play-test has nothing to fix. The judge sees the brief, the card and a picture of the game being played,
and says whether it recreates a title someone made, which is counted where a brief names one: elsewhere the titles it
names are often genres. A brief that failed for another reason than the brain is left out.

## Every brain

| Brain | Made | Clean | First try | Asked | Original when one is named |
|---|---:|---:|---:|---:|---:|
| sonnet (claudecode) | 24 of 24 | **23** | 22 | 1 | 3 of 4 |

## sonnet (claudecode), 2026-10-28

Made a game on 24 of 24 briefs, with nothing left to fix on 23, 22 of them on the first play-test and 0 after the third. Read the skill before its first game on 24, asked the person on 1, wrote a page instead on 0, and ended on a question on 0. On the last play-test, no control changed the picture on 1, and the words were in the person's language on 24. Asked for an existing game, it made an original one of its kind on 3 of 4, judged by sonnet (claudecode), who named a title for 3 of the other games too. A brief took 1 minute and 41k tokens at the median.

✓ clean, ✗ not; then the play-test it was clean on, or how many it took; then the engine; then the game it redraws, if the judge says so.

| Brief | en | fr | ar | ja |
|---|---|---|---|---|
| empty | ✓ 1 · none | ✓ 1 · none | ✓ 2 · none · redraws Catch falling objects | ✓ 1 · phaser |
| child | ✓ 1 · none | ✓ 1 · none | ✓ 1 · none | ✓ 1 · none |
| words | ✓ 1 · none | ✓ 1 · none · redraws Word scramble | ✓ 1 · none | ✓ 1 · none |
| story | ✓ 1 · phaser | ✓ 1 · none | ✓ 1 · none | ✓ 1 · phaser |
| phone | ✓ 1 · none | ✓ 1 · none | ✓ 1 · none | ✓ 1 · phaser · redraws Subway Surfers |
| clone | ✓ 1 · none | ✓ 1 · none | ✗ 2 · none | ✓ 1 · none · redraws Tetris |

Left to fix:
- clone, ar: No control changed the picture (a, b).
