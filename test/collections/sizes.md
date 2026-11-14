# Collections: how many rows stay smooth, and what 10,000 cost

Written by `node test/collections/sizes.js --write` from its latest runs (phase 0c of the collections plan); the Notes at the end are by hand. Real Jean, served from this
checkout, in a throwaway browser context each run: a collection of N rows by 12 columns (a name, three numbers, two dates, a select of 8 choices and one of 40, a status, a
checkbox, a person, an email), written through `app.fs` as `made()` writes it, as the person's, in the open project, and opened beside a task the fake brain answered. Every
row is drawn, as the app does today. The plan's sizes are 100 to 10,000 rows; 10, 25 and 50 were added to see what a collection costs before its rows do.

**Painted** is told the same way throughout: the DOM is looked at in each animation frame; the frame that finds the change there is the one that paints it, and the
time is taken at the animation frame after it. The first table of each browser says that time, an upper bound; the second, the time at which the first of the two frames had
done its own style, layout and paint on the page's thread (or the second began, when that came first), a lower bound.

- **Opening:** from `preview()` of the collection, as the person asks for it, until its N rows are painted: the first time in the page, `view.js` fetched then, and again once
  closed. Jean has read the collection once before, for Creations, as it does at start and at each change of the task list; that first read is among the paths at the end.
- **A change:** a number typed in the third row's Amount, clicked just before, from Enter's keydown until the foot's sum shows the value read again and is painted.
- **Find:** from one letter's keydown in the view's search, clicked just before, until the rows it keeps are painted: `z`, which one row in eight has, then, the field emptied,
  `a`, which every row has. It passes when both do.
- **Scrolling:** animation frames a second over two seconds of the wheel, the pointer over the rows, 40 px a notch, a notch a frame or as fast as the page takes them, down to
  the last row and back. Chromium only.

**The gate, fixed before the first run:** opening within 300 ms, a change painted within 100 ms, a letter in Find within 100 ms, scrolling at 50 frames a second or more.
Opening is judged on the first time. Milliseconds, the median of the runs then the worst; frames a second, the median then the fewest.

## Chromium, the processor slowed 4 times: the gate's

Chromium 156.0.8078.4, Playwright's, headless, `Emulation.setCPUThrottlingRate` at 4 from the opening on; 2026-11-14, commit 748f9449 with 2 files of app/ changed since by other sessions, Apple M3 Max, 14 cores.

| Rows | Runs | Elements | Fields | Opening | Opening again | A change | Find, z | Find, a | Scrolling, fps | Misses, by the medians | Misses, by the worst runs |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|
| 10 | 5 | 2,795 | 139 | 283 / 307 | 132 / 155 | 56 / 62 | 74 / 83 | 44 / 54 | all in view | none | opening |
| 25 | 5 | 3,816 | 319 | 388 / 399 | 170 / 199 | 49 / 50 | 107 / 120 | 78 / 89 | 46 / 42 | opening, Find, scrolling | opening, Find, scrolling |
| 50 | 5 | 5,516 | 619 | 491 / 498 | 309 / 397 | 78 / 79 | 164 / 177 | 130 / 133 | 33 / 32 | opening, Find, scrolling | opening, Find, scrolling |
| 100 | 5 | 8,916 | 1,219 | 755 / 842 | 445 / 478 | 98 / 112 | 278 / 309 | 237 / 276 | 20 / 18 | opening, Find, scrolling | opening, a change, Find, scrolling |
| 250 | 5 | 19,116 | 3,019 | 1,133 / 1,395 | 877 / 881 | 143 / 202 | 616 / 633 | 474 / 668 | 13 / 9.5 | opening, a change, Find, scrolling | opening, a change, Find, scrolling |
| 500 | 5 | 36,116 | 6,019 | 1,888 / 2,893 | 1,550 / 1,678 | 236 / 296 | 1,110 / 1,162 | 957 / 982 | 8 / 6.5 | opening, a change, Find, scrolling | opening, a change, Find, scrolling |
| 1,000 | 5 | 70,116 | 12,019 | 3,593 / 4,123 | 3,331 / 3,423 | 606 / 650 | 2,339 / 2,447 | 2,229 / 2,246 | 3.5 / 3 | opening, a change, Find, scrolling | opening, a change, Find, scrolling |
| 2,000 | 5 | 138,116 | 24,019 | 6,669 / 7,520 | 6,422 / 8,822 | 1,020 / 1,161 | 4,717 / 5,116 | 3,682 / 4,320 | 2 / 2 | opening, a change, Find, scrolling | opening, a change, Find, scrolling |
| 5,000 | 5 | 342,116 | 60,019 | 16,475 / 17,570 | 15,846 / 16,785 | 3,220 / 3,262 | 11,748 / 12,107 | 9,856 / 10,705 | 1 / 1 | opening, a change, Find, scrolling | opening, a change, Find, scrolling |
| 10,000 | 3 | 682,116 | 120,019 | 32,841 / 32,935 | 33,024 / 34,822 | 6,081 / 6,536 | 24,272 / 25,038 | 19,909 / 20,268 | 1 / 0.5 | opening, a change, Find, scrolling | opening, a change, Find, scrolling |

By the medians, 10 rows is the largest size that passes; at 25 rows, opening, Find, scrolling miss. By the worst of the runs, no size passes; at 10 rows, opening misses. Judged on opening again in place of the first time, by the medians, 10 rows is the largest size that passes; at 25 rows, Find, scrolling miss.
Each measure first misses, by the medians: opening from 25 rows, a change from 250 rows, Find from 25 rows, scrolling from 25 rows.

The same runs, by the first frame's end (the lower bound):

| Rows | Opening | Opening again | A change | Find, z | Find, a |
|---:|---:|---:|---:|---:|---:|
| 10 | 243 / 297 | 123 / 148 | 41 / 45 | 74 / 83 | 44 / 54 |
| 25 | 338 / 377 | 170 / 198 | 49 / 50 | 107 / 120 | 78 / 89 |
| 50 | 396 / 456 | 292 / 396 | 63 / 75 | 164 / 177 | 130 / 133 |
| 100 | 613 / 642 | 429 / 454 | 97 / 112 | 278 / 309 | 237 / 276 |
| 250 | 1,086 / 1,132 | 876 / 881 | 143 / 202 | 616 / 632 | 474 / 668 |
| 500 | 1,887 / 2,222 | 1,550 / 1,677 | 236 / 295 | 1,110 / 1,162 | 957 / 981 |
| 1,000 | 3,593 / 4,123 | 3,331 / 3,422 | 605 / 650 | 2,339 / 2,447 | 2,229 / 2,246 |
| 2,000 | 6,669 / 7,520 | 6,422 / 8,823 | 1,019 / 1,159 | 4,717 / 5,115 | 3,682 / 4,320 |
| 5,000 | 16,475 / 17,570 | 15,846 / 16,785 | 3,218 / 3,261 | 11,748 / 12,106 | 9,856 / 10,705 |
| 10,000 | 32,841 / 32,935 | 33,024 / 34,822 | 6,077 / 6,531 | 24,272 / 25,038 | 19,909 / 20,268 |

Also timed in those runs, outside the gate: a digit typed in that Amount, from its keydown until the field shows it painted; the frames a second of the page at rest, the collection open; and how many of the wheel's notches the page took.

| Rows | A digit typed, the first | The next digit | Frames a second at rest | Notches the page took in 2.7 s |
|---:|---:|---:|---:|---:|
| 10 | 31 / 44 | 36 / 36 | 60 / 60 | — |
| 25 | 50 / 58 | 40 / 40 | 60 / 60 | 62 |
| 50 | 83 / 88 | 34 / 44 | 60 / 60 | 46 |
| 100 | 158 / 169 | 43 / 46 | 60 / 60 | 27 |
| 250 | 314 / 328 | 50 / 74 | 60 / 60 | 19 |
| 500 | 595 / 624 | 76 / 98 | 60 / 60 | 15 |
| 1,000 | 1,290 / 1,394 | 162 / 172 | 60 / 60 | 6 |
| 2,000 | 2,440 / 2,531 | 290 / 329 | 60 / 60 | 4 |
| 5,000 | 6,108 / 7,535 | 752 / 783 | 60 / 60 | 2 |
| 10,000 | 12,257 / 13,159 | 1,539 / 2,261 | 60 / 42 | 2 |

## Chromium at full speed, for comparison

Chromium 156.0.8078.4, the same runs with nothing slowed; 2026-11-14, commit d0f434b8 with 95 files of app/ changed since by other sessions, Apple M3 Max, 14 cores.

| Rows | Runs | Elements | Fields | Opening | Opening again | A change | Find, z | Find, a | Scrolling, fps | Misses, by the medians | Misses, by the worst runs |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|
| 10 | 3 | 2,795 | 139 | 56 / 78 | 68 / 68 | 62 / 64 | 42 / 42 | 43 / 44 | all in view | none | none |
| 25 | 3 | 3,816 | 319 | 83 / 84 | 71 / 83 | 48 / 53 | 35 / 36 | 36 / 39 | 60 / 60 | none | none |
| 50 | 3 | 5,516 | 619 | 110 / 113 | 92 / 92 | 50 / 60 | 50 / 52 | 43 / 50 | 61 / 60 | none | none |
| 100 | 3 | 8,916 | 1,219 | 148 / 158 | 119 / 131 | 61 / 63 | 76 / 86 | 71 / 76 | 57 / 54 | none | none |
| 250 | 3 | 19,116 | 3,019 | 268 / 275 | 220 / 232 | 56 / 71 | 151 / 171 | 126 / 144 | 36 / 35 | Find, scrolling | Find, scrolling |
| 500 | 3 | 36,116 | 6,019 | 454 / 469 | 385 / 531 | 113 / 120 | 311 / 350 | 273 / 278 | 24 / 24 | opening, a change, Find, scrolling | opening, a change, Find, scrolling |
| 1,000 | 3 | 70,116 | 12,019 | 855 / 876 | 790 / 795 | 166 / 190 | 581 / 589 | 455 / 488 | 15 / 15 | opening, a change, Find, scrolling | opening, a change, Find, scrolling |
| 2,000 | 3 | 138,116 | 24,019 | 1,603 / 1,625 | 1,488 / 1,498 | 304 / 333 | 1,173 / 1,229 | 906 / 963 | 9 / 6.5 | opening, a change, Find, scrolling | opening, a change, Find, scrolling |
| 5,000 | 3 | 342,116 | 60,019 | 4,117 / 4,311 | 3,792 / 4,076 | 770 / 778 | 2,833 / 2,920 | 2,568 / 2,649 | 3 / 3 | opening, a change, Find, scrolling | opening, a change, Find, scrolling |
| 10,000 | 3 | 682,116 | 120,019 | 7,671 / 8,024 | 7,346 / 7,804 | 1,477 / 1,579 | 5,832 / 5,917 | 4,424 / 4,805 | 1.5 / 1.5 | opening, a change, Find, scrolling | opening, a change, Find, scrolling |

By the medians, 100 rows is the largest size that passes; at 250 rows, Find, scrolling miss. By the worst of the runs, 100 rows is the largest size that passes; at 250 rows, Find, scrolling miss. Judged on opening again in place of the first time, by the medians, 100 rows is the largest size that passes; at 250 rows, Find, scrolling miss.
Each measure first misses, by the medians: opening from 500 rows, a change from 500 rows, Find from 250 rows, scrolling from 250 rows.

The same runs, by the first frame's end (the lower bound):

| Rows | Opening | Opening again | A change | Find, z | Find, a |
|---:|---:|---:|---:|---:|---:|
| 10 | 56 / 56 | 43 / 46 | 42 / 44 | 42 / 42 | 43 / 44 |
| 25 | 70 / 71 | 63 / 81 | 46 / 48 | 35 / 36 | 36 / 39 |
| 50 | 91 / 91 | 92 / 92 | 47 / 50 | 50 / 52 | 43 / 50 |
| 100 | 136 / 140 | 118 / 129 | 47 / 55 | 76 / 86 | 71 / 76 |
| 250 | 261 / 268 | 219 / 222 | 56 / 70 | 151 / 171 | 126 / 144 |
| 500 | 446 / 454 | 384 / 390 | 112 / 120 | 311 / 350 | 273 / 278 |
| 1,000 | 855 / 876 | 790 / 795 | 166 / 189 | 581 / 589 | 455 / 488 |
| 2,000 | 1,603 / 1,625 | 1,487 / 1,498 | 304 / 333 | 1,173 / 1,229 | 906 / 963 |
| 5,000 | 4,117 / 4,311 | 3,792 / 4,076 | 770 / 778 | 2,833 / 2,920 | 2,568 / 2,649 |
| 10,000 | 7,671 / 8,024 | 7,346 / 7,804 | 1,476 / 1,578 | 5,832 / 5,917 | 4,424 / 4,805 |

Also timed in those runs, outside the gate: a digit typed in that Amount, from its keydown until the field shows it painted; the frames a second of the page at rest, the collection open; and how many of the wheel's notches the page took.

| Rows | A digit typed, the first | The next digit | Frames a second at rest | Notches the page took in 2.7 s |
|---:|---:|---:|---:|---:|
| 10 | 37 / 38 | 32 / 33 | 59 / 59 | — |
| 25 | 35 / 36 | 34 / 34 | 60 / 59 | 82 |
| 50 | 36 / 36 | 35 / 41 | 60 / 60 | 82 |
| 100 | 45 / 48 | 38 / 39 | 60 / 60 | 78 |
| 250 | 94 / 101 | 30 / 44 | 60 / 60 | 48 |
| 500 | 173 / 190 | 39 / 39 | 60 / 60 | 32 |
| 1,000 | 288 / 319 | 69 / 69 | 60 / 60 | 23 |
| 2,000 | 603 / 624 | 77 / 131 | 60 / 60 | 13 |
| 5,000 | 1,413 / 1,654 | 185 / 189 | 60 / 60 | 5 |
| 10,000 | 3,012 / 3,095 | 382 / 414 | 60 / 60 | 3 |

## WebKit at full speed

WebKit 27.2, Playwright's, headless, which nothing slows, so of the gate's four only opening, a change and Find; its storage is in memory there, unsealed (Jean says so on its page); 2026-11-14, commit 2ba21b3f with 11 files of app/ changed since by other sessions, Apple M3 Max, 14 cores.

| Rows | Runs | Elements | Fields | Opening | Opening again | A change | Find, z | Find, a | Misses, by the medians | Misses, by the worst runs |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|
| 10 | 5 | 2,786 | 139 | 133 / 146 | 67 / 83 | 31 / 32 | 30 / 33 | 31 / 33 | none | none |
| 25 | 5 | 3,807 | 319 | 178 / 189 | 115 / 128 | 30 / 36 | 31 / 38 | 27 / 29 | none | none |
| 50 | 5 | 5,507 | 619 | 249 / 250 | 167 / 181 | 42 / 47 | 46 / 50 | 28 / 31 | none | none |
| 100 | 5 | 8,907 | 1,219 | 390 / 394 | 278 / 301 | 58 / 64 | 68 / 70 | 29 / 31 | opening | opening |
| 250 | 5 | 19,107 | 3,019 | 960 / 1,128 | 549 / 596 | 85 / 108 | 132 / 144 | 30 / 32 | opening, Find | opening, a change, Find |
| 500 | 5 | 36,107 | 6,019 | 2,362 / 2,468 | 1,151 / 1,218 | 147 / 190 | 264 / 293 | 60 / 66 | opening, a change, Find | opening, a change, Find |
| 1,000 | 5 | 70,107 | 12,019 | 8,375 / 9,350 | 1,824 / 2,857 | 316 / 338 | 650 / 682 | 96 / 116 | opening, a change, Find | opening, a change, Find |
| 2,000 | 5 | 138,107 | 24,019 | 4,718 / 33,762 | 6,980 / 7,174 | 612 / 640 | 1,672 / 2,191 | 151 / 190 | opening, a change, Find | opening, a change, Find |
| 5,000 | 5 | 342,107 | 60,019 | 42,391 / 45,969 | 30,050 / 38,951 | 1,567 / 1,601 | 9,951 / 33,823 | 419 / 474 | opening, a change, Find | opening, a change, Find |
| 10,000 | 2 | 682,107 | 120,019 | 180,238 / 202,917 | 178,979 / 190,419 | 3,129 / 3,144 | 84,857 / 113,950 | 808 / 821 | opening, a change, Find | opening, a change, Find |

By the medians, 50 rows is the largest size that passes; at 100 rows, opening misses. By the worst of the runs, 50 rows is the largest size that passes; at 100 rows, opening misses. Judged on opening again in place of the first time, by the medians, 100 rows is the largest size that passes; at 250 rows, opening, Find miss.
Each measure first misses, by the medians: opening from 100 rows, a change from 500 rows, Find from 250 rows.

The same runs, by the first frame's end (the lower bound):

| Rows | Opening | Opening again | A change | Find, z | Find, a |
|---:|---:|---:|---:|---:|---:|
| 10 | 114 / 127 | 52 / 67 | 17 / 19 | 16 / 17 | 17 / 18 |
| 25 | 159 / 170 | 97 / 106 | 24 / 31 | 22 / 31 | 14 / 15 |
| 50 | 232 / 237 | 149 / 163 | 37 / 41 | 40 / 44 | 16 / 17 |
| 100 | 374 / 382 | 261 / 282 | 54 / 59 | 63 / 65 | 18 / 23 |
| 250 | 956 / 1,122 | 533 / 579 | 83 / 106 | 128 / 140 | 22 / 30 |
| 500 | 2,362 / 2,468 | 1,141 / 1,210 | 147 / 190 | 261 / 289 | 53 / 59 |
| 1,000 | 8,375 / 9,350 | 1,821 / 2,853 | 315 / 327 | 638 / 681 | 95 / 114 |
| 2,000 | 4,718 / 33,762 | 6,980 / 7,174 | 611 / 639 | 1,668 / 2,188 | 150 / 189 |
| 5,000 | 42,387 / 45,969 | 30,050 / 38,951 | 1,567 / 1,601 | 9,950 / 33,823 | 419 / 474 |
| 10,000 | 180,238 / 202,917 | 178,979 / 190,419 | 3,129 / 3,144 | 84,857 / 113,950 | 807 / 821 |

Also timed in those runs, outside the gate: a digit typed in that Amount, from its keydown until the field shows it painted; nothing else.

| Rows | A digit typed, the first | The next digit |
|---:|---:|---:|
| 10 | 30 / 31 | 32 / 32 |
| 25 | 29 / 32 | 31 / 31 |
| 50 | 24 / 30 | 27 / 29 |
| 100 | 25 / 30 | 29 / 30 |
| 250 | 30 / 31 | 30 / 31 |
| 500 | 50 / 52 | 36 / 39 |
| 1,000 | 56 / 88 | 43 / 56 |
| 2,000 | 146 / 161 | 117 / 125 |
| 5,000 | 354 / 399 | 196 / 248 |
| 10,000 | 687 / 690 | 521 / 521 |

## Each path at 10,000 rows

In the page, the app's own modules imported by their addresses and called as the app calls them, on copies of the collection in projects of their own, on show nowhere but where the view is drawn. Chromium 156.0.8078.4, 2026-11-14, commit 3c9ffa5e.
Milliseconds, the median then the worst, the processor slowed 4 times, then at full speed; a first time or a first draw has as many runs as the last column says.

`changes.jsonl` is **3,161 KB** for 10,000 rows written in one change, 324 bytes a row; what `kept()` gives Creations and `search_files` to read is 2,032 KB of text a collection.

| Path | Slowed 4 times | Full speed | Runs |
|---|---:|---:|---:|
| Writing the rows: `app.fs.write` of `changes.jsonl` | 17 / 24 | 15 / 18 | 5 |
| The file read and unsealed: `app.fs.read` | 5.4 / 5.9 | 4.6 / 5.1 | 5 |
| `load()`, the first time a copy is read | 174 / 188 | 49 / 56 | 5 |
| `load()` again, nothing changed | 69 / 104 | 21 / 46 | 5 |
| `kept()`, one collection, the first time | 208 / 209 | 56 / 56 | 3 |
| `kept()`, one collection, again | 108 / 110 | 32 / 33 | 5 |
| `kept()`, three collections, the first time | 582 / 616 | 157 / 161 | 3 |
| `kept()`, three collections, again | 309 / 313 | 83 / 84 | 5 |
| Jean changes a number in 2,000 rows: `change()`, one call | 313 / 324 | 81 / 88 | 5 |
| `load()` after those 2,000 lines | 80 / 89 | 25 / 51 | 5 |
| `marked()`, those 2,000 lines unaccepted | 383 / 401 | 94 / 99 | 10 |
| The view, nothing marked: its first draw, script alone | 9,976 / 9,976 | 2,478 / 2,478 | 1 |
| … its first draw, until painted | 25,989 / 25,989 | 6,757 / 6,757 | 1 |
| … drawn again, script alone | 1,073 / 1,128 | 261 / 262 | 5 |
| … drawn again, until painted | 1,083 / 1,138 | 268 / 283 | 5 |
| The view, 2,000 changes marked: its first draw, script alone | 10,390 / 10,390 | 2,636 / 2,636 | 1 |
| … its first draw, until painted | 26,910 / 26,910 | 7,082 / 7,082 | 1 |
| … drawn again, script alone | 1,813 / 2,667 | 423 / 426 | 5 |
| … drawn again, until painted | 2,102 / 2,954 | 433 / 500 | 5 |
| `reject()` of the 2,000, with its write and the read after it | 871 / 954 | 121 / 208 | 5 |
| `query()`, the rows alone, as the table view asks | 1 / 2.7 | 0.3 / 0.6 | 5 |
| `query()`, grouped by the select of 40 choices | 32 / 43 | 7.6 / 9.9 | 5 |
| `query()`, grouped by the name, 10,000 values | 5,323 / 7,364 | 1,322 / 1,680 | 5 |
| One more change of the person's: `change()`, whole | 213 / 225 | 58 / 61 | 5 |
| … its stamp: `stamp()` | 3.4 / 3.7 | 0.9 / 1.5 | 5 |
| … what undoes it: `inverse()` | 123 / 131 | 33 / 35 | 5 |
| … its line written: `app.fs.append` | 3.2 / 4 | 2.5 / 3.7 | 5 |
| … the collection read again: `load()` | 65 / 75 | 20 / 23 | 5 |

The view drawn holds 681,476 elements for 10,000 rows, 693,487 with 2,000 rows marked.

## Notes

14 November 2026, by hand: `--write` keeps this part. What phase 0c answers, and what the runs showed besides.

### The size

- **Slowed 4 times, the gate passes at 10 rows and misses at 25**, where opening takes 388 ms the first time (170 ms again), a letter
  in Find 107 ms, and scrolling holds 46 frames a second. None of the plan's sizes passes: at 100 rows, opening 755 ms, Find 278 ms,
  20 frames a second; only a change (98 ms) is inside. **0c's size is under 1,000 rows**, which is the plan's stop.
- Nothing slowed, on this computer (an M3 Max), 100 rows pass and 250 miss (Find 151 ms, 36 frames a second). WebKit at full speed
  passes 50 rows and misses 100 (opening 390 ms).
- At 1,000 rows: opening 3.6 s, a change 0.6 s, Find 2.3 s and 3.5 frames a second, slowed; 0.86 s, 0.17 s, 0.58 s and 15 at full speed.
- What misses first: opening, Find and scrolling together, from 25 rows; a change last, from 250 rows (100 by its worst run).
- Noise: a first pass of the slowed runs, forty minutes earlier, was 10 to 20% faster throughout (25 rows: opening 270 ms, 50 frames a
  second; it timed Find from its `input`, which leaves out what the browser does first, so it was run again). Other sessions worked on
  this computer meanwhile. Only the verdict at 25 rows turns on that.
- Other sessions committed to this checkout during the runs; each table names the commit its runs began at. None changed `view.js`,
  `changes.js`, `query.js`, `tables.css`, `ui/chat.js` or `ui/tips.js`; `table.js` and `tables.js` changed by 19 lines, for whiteboards.

### Why, as far as a trace of the page's thread says

At 1,000 rows, slowed 4 times, with scratch probes that are not kept.

- **Opening** is mostly the browser's: of 4.1 s, one layout of the table took 2.1 s (`table-layout: auto` over 12,000 fields), pre-paint
  and paint 0.5 s, and the script the rest. A collection of 10 rows already takes 283 ms the first time and 132 ms again: the pane,
  `view.js` and the files read twice, before any row.
- **Scrolling:** each notch of the wheel made one frame of about 250 ms: a hit test for the row now under the pointer (40 ms); the
  window's scroll listener in `ui/chat.js` (`#onScroll`), which reads the conversation's place at every scroll of anything and so forces
  style and layout (100 ms); then style, pre-paint and paint. The compositor drew no more frames than the page's thread (15 for 16, in
  3 s). With the pointer off the table and the rows moved by script: 45 frames a second. With the pointer over the row handles, a
  handle's tip shows (`ui/tips.js`), and that one style recalculation took 1.5 s.
- **Find:** a letter typed in the empty field costs a style recalculation of the whole document before `input` is heard (93,867
  elements, 1.0 s of z's 2.4 s), each time the field stops being empty. With the page's 75 rules that use `:has()` taken out, in the
  page and only to see, z took 0.6 s and a 0.3 s (from 1.9 s). The rest is the search itself (`said()` makes an `Intl` formatter for
  each date and number it reads, 50,000 at 10,000 rows) and the layout of the rows left. A second letter pays none of the first part.
- **The first digit** typed in a cell after the page loaded costs a whole-document style recalculation too, once: 1.0 to 1.3 s, eight
  times the next digit. It is not `:has()` and not a tip; its cause wasn't found.
- **A change** in a small collection is not the processor's: 56 ms at 10 rows slowed and 62 ms not. It is the line appended and the
  files read again through the storage worker, which `Emulation.setCPUThrottlingRate` doesn't slow (a write of 3.2 MB: 15 ms, 17 slowed).

### At 10,000 rows

- `changes.jsonl` is 3.2 MB; the page holds 682,000 elements and 120,000 fields: 68 elements a row, its 12 cells and a menu of five
  buttons for each row among them.
- In Chromium, opening takes 7.7 s (33 s slowed), a change 1.5 s (6.1 s), a letter in Find 5.8 s (24 s), the first digit 3 s (12 s),
  and scrolling shows 1.5 frames a second (1). In WebKit at full speed, opening takes 3 minutes (158 and 203 s), Find 56 and 114 s, a
  change 3.1 s, and its page's process held 5.5 GB.
- The engine is not where the time goes: `load()` 21 ms (49 the first time); `kept()` 32 ms a collection at each change of the task
  list (83 ms for three; 108 and 309 slowed); `change()` 58 ms, of which `inverse()`, a fold of every line for Undo, is 33 and `load()`
  20; `reject()` of 2,000 changes 121 ms; a group on 40 choices 8 ms.
- Two paths are slow by their shape. `query()` grouped by a column of 10,000 values takes 1.3 s (5.3 s slowed): it filters every row
  once for each value. `marked()` with 2,000 lines unaccepted takes 94 ms (383 slowed) in every draw, which goes from 0.26 s of script
  to 0.42 s (1.07 to 1.81 s slowed).
- The draw itself is 2.5 s of script the first time (6.8 s until painted) and 0.26 s at each change after. Of a change's 1.5 s in the
  pane, `change()` and that draw are 0.32 s; the rest is the browser's work on 682,000 elements and Enter's own handler, which lists
  every cell, not split here.

### Not measured

- WebKit slowed, which Playwright can't; WebKit's scrolling; Safari itself; Firefox; a phone.
- Chrome with a graphics card and a real wheel: these are headless Chromium, compositing in software, each notch sent once the page
  took the last.
- A collection with relations, formulas or multi-selects; the board; a table a document holds; rows made by many changes, so more lines
  than rows; Together and Sync, so what a store sends; memory, but for WebKit's one figure.
- An opening of a collection never read (Creations reads it first; the first `load()` is among the paths); `accept()`; `reject()` with
  the collection on show.
- Five runs everywhere: 10,000 rows has 3 slowed and 2 in WebKit, by the time a size was given, and full speed has 3 at every size.
- WebKit's first opening took longer at 1,000 rows (8.4 s) than at 2,000 (4.7 s) in every run, and one at 2,000 took 34 s: not explained.
