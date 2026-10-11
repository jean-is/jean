# Offers: what brains offer, and when

Written by `npm run offers -- --write`, one section per brain, replaced when that brain is measured again.
Each request is the first message of a first conversation, with Jean's own frozen prompt and declared
tools in its language (8 languages, 43 requests each, one reply each); what counts is
whether the reply calls `offer`, and with what. Jean's tools answer as in a first conversation, the user
taking each recommended answer to `ask_user`. "What came instead" names the offer made in its place,
the tools the reply called in backticks, or none: an answer and nothing else. Jean refuses to offer
search before five conversations (D145); the brain's call counts all the same.

## Every brain: offered when needed

| Capability | google/gemma-4-26b-a4b (lmstudio) | mistralai/ministral-3-3b (lmstudio) | openai/gpt-oss-20b (lmstudio) | google/gemma-4-e2b (lmstudio, {"reasoning_effort":"none"}) |
|---|---:|---:|---:|---:|
| computer | 38% | 0% | 0% | 6% |
| memory | 0% | 4% | 4% | 0% |
| projects | 4% | 0% | 0% | 8% |
| folders | 63% | 25% | 19% | 0% |
| skills | 63% | 6% | 0% | 0% |
| routines | 94% | 19% | 56% | 25% |
| search | 92% | 4% | 71% | 92% |
| browser | 100% | 69% | 81% | 100% |
| pictures | 100% | 0% | 25% | 42% |
| connections | 21% | 0% | 4% | 0% |
| helpers | 0% | 0% | 0% | 4% |
| sync | 33% | 0% | 21% | 0% |
| **Right, all requests** | **62%** | **34%** | **44%** | **42%** |

## google/gemma-4-26b-a4b (lmstudio), 2026-10-11

Right on 62% of 344 requests. Of those that needed an offer, 47% got the right one and 53% none; of those that needed none, 0% got one.

| Capability | Requests that need it | Offered then | What came instead | Offered when not needed |
|---|---:|---:|---|---:|
| files | 0 | — | — | 0% (0) |
| computer | 16 | 38% (6) | `write` 9, none 1 | 0% (0) |
| memory | 24 | 0% (0) | none 15, `save_name` 5, `ask_user` 3, `save_name ask_user` 1 | 0% (0) |
| projects | 24 | 4% (1) | none 8, `write` 6, `ask_user` 5, `ask_user write` 2, `save_name ask_user write` 1, `write ask_user` 1 | 0% (0) |
| folders | 16 | 63% (10) | none 6 | 0% (0) |
| skills | 16 | 63% (10) | none 5, `save_name` 1 | 0% (0) |
| routines | 16 | 94% (15) | none 1 | 0% (0) |
| flows | 0 | — | — | 0% (0) |
| search | 24 | 92% (22) | none 2 | 0% (0) |
| browser | 16 | 100% (16) | — | 0% (0) |
| pictures | 24 | 100% (24) | — | 0% (0) |
| machine | 0 | — | — | 0% (0) |
| connections | 24 | 21% (5) | none 19 | 0% (0) |
| helpers | 24 | 0% (0) | `ask_user` 13, `ask_user write` 6, `write` 4, none 1 | 0% (0) |
| sync | 24 | 33% (8) | none 15, `ask_user` 1 | 0% (0) |
| none | 96 | 100% (96) | — | — |

| Language | Needed offers made | Offers not needed | Right |
|---|---:|---:|---:|
| en | 48% | 0% | **63%** |
| ar | 42% | 0% | **58%** |
| es | 45% | 0% | **60%** |
| fr | 48% | 0% | **63%** |
| hi | 45% | 0% | **60%** |
| ja | 55% | 0% | **67%** |
| sw | 45% | 0% | **60%** |
| zh-Hans | 48% | 0% | **63%** |

## mistralai/ministral-3-3b (lmstudio), 2026-10-11

Right on 34% of 344 requests. Of those that needed an offer, 8% got the right one and 91% none; of those that needed none, 0% got one.

| Capability | Requests that need it | Offered then | What came instead | Offered when not needed |
|---|---:|---:|---|---:|
| files | 0 | — | — | 0% (0) |
| computer | 16 | 0% (0) | none 12, `write` 2, `ask_user` 2 | 0% (0) |
| memory | 24 | 4% (1) | none 22, `save_name` 1 | 0% (0) |
| projects | 24 | 0% (0) | none 24 | 0% (0) |
| folders | 16 | 25% (4) | none 12 | 0% (0) |
| skills | 16 | 6% (1) | none 14, flows 1 | 0% (0) |
| routines | 16 | 19% (3) | none 13 | 0% (0) |
| flows | 0 | — | — | 0% (1) |
| search | 24 | 4% (1) | none 22, `ask_user` 1 | 0% (0) |
| browser | 16 | 69% (11) | none 5 | 0% (1) |
| pictures | 24 | 0% (0) | none 24 | 0% (0) |
| machine | 0 | — | — | 0% (0) |
| connections | 24 | 0% (0) | none 22, browser 1, `ask_user` 1 | 0% (0) |
| helpers | 24 | 0% (0) | none 17, `write` 6, `save_name` 1 | 0% (0) |
| sync | 24 | 0% (0) | none 24 | 0% (0) |
| none | 96 | 100% (96) | — | — |

| Language | Needed offers made | Offers not needed | Right |
|---|---:|---:|---:|
| en | 23% | 0% | **44%** |
| ar | 6% | 0% | **33%** |
| es | 10% | 0% | **35%** |
| fr | 10% | 0% | **35%** |
| hi | 0% | 0% | **28%** |
| ja | 3% | 0% | **30%** |
| sw | 0% | 0% | **28%** |
| zh-Hans | 16% | 0% | **40%** |

## openai/gpt-oss-20b (lmstudio), 2026-10-11

Right on 44% of 344 requests. Of those that needed an offer, 22% got the right one and 70% none; of those that needed none, 0% got one.

| Capability | Requests that need it | Offered then | What came instead | Offered when not needed |
|---|---:|---:|---|---:|
| files | 0 | — | — | 1% (3) |
| computer | 16 | 0% (0) | none 6, `ask_user` 4, `write` 3, `ask_user write` 2, `write ask_user` 1 | 2% (6) |
| memory | 24 | 4% (1) | none 13, `ask_user` 8, `save_name` 2 | 1% (4) |
| projects | 24 | 0% (0) | `ask_user` 15, `ask_user write` 9 | 1% (2) |
| folders | 16 | 19% (3) | `ask_user` 9, computer 3, files 1 | 0% (0) |
| skills | 16 | 0% (0) | `ask_user write` 4, `ask_user` 4, `write` 3, none 2, memory 1, `save_name` 1, `ask_user save_name write` 1 | 0% (0) |
| routines | 16 | 56% (9) | `ask_user` 5, none 1, memory 1 | 0% (0) |
| flows | 0 | — | — | 0% (0) |
| search | 24 | 71% (17) | `ask_user` 6, none 1 | 0% (0) |
| browser | 16 | 81% (13) | none 3 | 1% (4) |
| pictures | 24 | 25% (6) | `ask_user` 8, `ask_user write` 7, none 2, `write` 1 | 0% (0) |
| machine | 0 | — | — | 0% (0) |
| connections | 24 | 4% (1) | `ask_user` 15, browser 4, computer 2, `write` 1, `ask_user write` 1 | 0% (0) |
| helpers | 24 | 0% (0) | `ask_user` 14, `ask_user write` 6, `write` 3, `write ask_user` 1 | 0% (0) |
| sync | 24 | 21% (5) | `ask_user` 9, none 3, projects 2, files 2, memory 2, computer 1 | 0% (0) |
| none | 96 | 100% (96) | — | — |

| Language | Needed offers made | Offers not needed | Right |
|---|---:|---:|---:|
| en | 26% | 0% | **47%** |
| ar | 16% | 0% | **40%** |
| es | 29% | 0% | **49%** |
| fr | 32% | 0% | **51%** |
| hi | 26% | 0% | **47%** |
| ja | 13% | 0% | **37%** |
| sw | 13% | 0% | **37%** |
| zh-Hans | 23% | 0% | **44%** |

## google/gemma-4-e2b (lmstudio, {"reasoning_effort":"none"}), 2026-10-11

Right on 42% of 344 requests. Of those that needed an offer, 23% got the right one and 75% none; of those that needed none, 6% got one.

| Capability | Requests that need it | Offered then | What came instead | Offered when not needed |
|---|---:|---:|---|---:|
| files | 0 | — | — | 0% (0) |
| computer | 16 | 6% (1) | `ask_user` 11, machine 1, `ask_user write` 1, `write` 1, none 1 | 0% (1) |
| memory | 24 | 0% (0) | none 15, `ask_user` 7, `save_name` 1, `save_name ask_user` 1 | 0% (0) |
| projects | 24 | 8% (2) | `ask_user` 13, none 8, search 1 | 0% (0) |
| folders | 16 | 0% (0) | none 10, `ask_user` 4, machine 1, computer 1 | 0% (0) |
| skills | 16 | 0% (0) | none 11, `write` 3, `save_name` 1, `ask_user` 1 | 0% (0) |
| routines | 16 | 25% (4) | `ask_user` 10, none 2 | 0% (0) |
| flows | 0 | — | — | 0% (0) |
| search | 24 | 92% (22) | none 1, `ask_user` 1 | 3% (8) |
| browser | 16 | 100% (16) | — | 0% (0) |
| pictures | 24 | 42% (10) | none 12, `ask_user` 1, `write` 1 | 0% (0) |
| machine | 0 | — | — | 1% (2) |
| connections | 24 | 0% (0) | none 16, `ask_user` 8 | 0% (0) |
| helpers | 24 | 4% (1) | `ask_user` 11, none 5, `write` 4, `ask_user write` 2, search 1 | 0% (0) |
| sync | 24 | 0% (0) | `ask_user` 19, none 5 | 0% (0) |
| none | 96 | 94% (90) | search 6 | — |

| Language | Needed offers made | Offers not needed | Right |
|---|---:|---:|---:|
| en | 35% | 0% | **53%** |
| ar | 23% | 8% | **42%** |
| es | 26% | 8% | **44%** |
| fr | 19% | 0% | **42%** |
| hi | 23% | 8% | **42%** |
| ja | 13% | 8% | **35%** |
| sw | 16% | 8% | **37%** |
| zh-Hans | 26% | 8% | **44%** |
