# Long tasks: Jean's harness against the same brain without it

Written by `npm run longtasks -- --write`, one section per brain, replaced when that brain is measured again. What is
measured is Jean's long-task features (compaction, plans, steering, Keep going) against the same brain without them,
not the brain: every run has Jean's own loop, prompt and tools (core/loop.js, caps/made, caps/ask, caps/plan,
caps/compact, the Folders tools as jean-cli runs them), in Node, with stand-ins for what only a page has. GDPval's
gold subset (openai/gdpval) is fetched at run time and never committed; its card states no licence. Its translated
requests are the judge brain's translations, kept in .cache/ only; their files and rubric stay in English.

How far the judge can be trusted: GDPval's own experimental grader agreed with its experts 66% of the time, the experts
with each other 71% (arXiv 2510.04374). A cheaper judge is likely worse; "verdicts that held both ways" says how often it
kept its verdict with the deliverables swapped, and `--hand` lays out pairs for the owner to grade, which
`--agreement` compares with it. GDPval-AA (Artificial Analysis) runs brains in its own harness with a shell and web
search for up to 100 turns, graded pairwise into an ELO: its numbers aren't on this page's scale.

## gpt-5-mini (copilot), 2026-10-17

### GDPval, 20 tasks of its gold subset

Each task once with Jean's features on (plan, compaction, Keep going up to three times) and once off, as a brain of a 32,000-token window, the reference files shared with the request; graded by gpt-5-mini, blind, twice with the deliverables swapped, with the task's rubric. A verdict that changed with the order counts as a tie. "Wins or ties against the expert" is GDPval's own measure, against the deliverable the occupation's expert made.

| Requests | Tasks judged | On better / tie / off better | On's win rate (ties half) | Rubric met, on / off | Wins or ties against the expert, on / off | Verdicts that held both ways |
|---|---:|---:|---:|---:|---:|---:|
| English | 20 | 5 / 9 / 6 | 48% | 71% / 71% | 45% / 55% | 75% |
| Translated | 9 | 6 / 1 / 2 | 72% | 64% / 64% | 33% / 33% | 78% |

| Runs | Brain steps | Blocks | Requests | Tokens read | Stopped at the cap / failed |
|---|---:|---:|---:|---:|---:|
| On | 2.5 | 1.0 | 2.7 | 21k | 0 / 0 |
| Off | 2.2 | 1.0 | 2.3 | 16k | 0 / 1 |

| Task | Occupation | Language | Files made, on / off | Verdict | Rubric, on / off |
|---|---:|---:|---:|---:|---:|
| 01d7e53e | Recreation Workers | ar | 1 / 1 | on | 88% / 82% |
| 01d7e53e | Recreation Workers | en | 1 / 1 | tie | 89% / 89% |
| 01d7e53e | Recreation Workers | fr | 1 / 1 | on | 90% / 90% |
| 01d7e53e | Recreation Workers | ja | 1 / 1 | off | 80% / 86% |
| 02aa1805 | Project Management Specialists | en | 0 / 0 | tie | 0% / 0% |
| 0419f1c3 | Property, Real Estate, and Community Association Managers | en | 1 / 1 | tie | 91% / 90% |
| 05389f78 | Buyers and Purchasing Agents | en | 2 / 2 | off | 90% / 91% |
| 0fad6023 | General and Operations Managers | en | 1 / 1 | off | 45% / 48% |
| 105f8ad0 | Sales Representatives, Wholesale and Manufacturing, Except Technical and Scientific Products | en | 1 / 1 | off | 58% / 64% |
| 1137e2bb | Order Clerks | en | 2 / 2 | on | 96% / 72% |
| 11dcc268 | Shipping, Receiving, and Inventory Clerks | en | 1 / 1 | tie | 65% / 65% |
| 1a78e076 | Nurse Practitioners | ar | 1 / 1 | on | 78% / 73% |
| 1a78e076 | Nurse Practitioners | en | 1 / 1 | off | 75% / 82% |
| 1a78e076 | Nurse Practitioners | fr | 1 / 1 | on | 78% / 77% |
| 1a78e076 | Nurse Practitioners | ja | 1 / 1 | tie | 73% / 74% |
| 1aecc095 | First-Line Supervisors of Office and Administrative Support Workers | en | 2 / 2 | tie | 72% / 74% |
| 1e5a1d7f | Property, Real Estate, and Community Association Managers | en | 1 / 1 | off | 94% / 100% |
| 36d567ba | Compliance Officers | en | 1 / 1 | tie | 76% / 76% |
| 3a4c347c | Editors | en | 1 / 1 | tie | 96% / 95% |
| 4520f882 | Financial Managers | ar | 1 / 1 | off | 27% / 34% |
| 4520f882 | Financial Managers | en | 1 / 1 | on | 17% / 17% |
| 4520f882 | Financial Managers | fr | 1 / 1 | on | 33% / 32% |
| 4520f882 | Financial Managers | ja | 1 / 1 | on | 33% / 32% |
| 46b34f78 | Financial and Investment Analysts | en | 1 / 1 | off | 70% / 87% |
| 4c18ebae | Compliance Officers | en | 2 / 2 | on | 70% / 69% |
| 5d0feb24 | News Analysts, Reporters, and Journalists | en | 1 / 1 | on | 77% / 76% |
| 6436ff9e | General and Operations Managers | en | 1 / 1 | tie | 83% / 83% |
| 7b08cd4d | Accountants and Auditors | en | 1 / 1 | tie | 88% / 91% |
| b39a5aa7 | Financial Managers | en | 1 / 1 | on | 73% / 53% |

### Steering and approvals, τ-bench's way

A person played by the same brain asks for a task, then changes their mind after two steps; they answer Jean's questions and approvals (each file made or changed is asked first) from what they want at that point. Success is every checkpoint of the changed request met at the end. pass^k is the chance that k runs in a row all succeed (3 runs of each scenario and language).

| The change of mind | pass^1 | pass^2 | pass^3 | Checkpoints (partial credit) | Brain steps | Approvals asked / declined | Failed |
|---|---:|---:|---:|---:|---:|---:|---:|
| Sent while it works (D365) | 61% | 44% | 33% | 76% | 5.6 | 287 / 68 | 0 |
| Sent once it answered | 56% | 33% | 17% | 72% | 6.4 | 316 / 95 | 0 |

| Language | pass^1 sent while it works | pass^1 sent once it answered |
|---|---:|---:|
| ar | 89% | 78% |
| en | 33% | 33% |
| fr | 33% | 33% |
| ja | 89% | 78% |

| Scenario | pass^1 sent while it works | pass^3 | Brain steps | pass^1 sent once it answered | pass^3 | Brain steps |
|---|---:|---:|---:|---:|---:|---:|
| expenses | 67% | 50% | 5.5 | 58% | 0% | 6.2 |
| meetings | 58% | 50% | 4.9 | 50% | 50% | 4.8 |
| prices | 58% | 0% | 6.4 | 58% | 0% | 8.4 |

### Long tasks cut short, TheAgentCompany's way

Each long scenario in each language, its checkpoints read from the files Jean left; partial credit is half the share of checkpoints passed, plus half when all are. A cut task stops after 2 steps and the person presses Keep going up to three times; with a plan, a confirmed plan that moved carries it on by itself first.

| Run | Runs | Score | All checkpoints | Score at the first stop | Brain steps | Blocks | Blocks a plan carried on | Calls after the stop that repeat one before it |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Whole, never stopped | 12 | 100% | 100% | — | 3.0 | 1.0 | — | — |
| Cut after 2 steps, Keep going pressed | 12 | 95% | 92% | 61% | 4.1 | 1.8 | 0.0 | 2 of 28 |
| Cut after 2 steps, with a plan | 12 | 100% | 100% | 82% | 3.5 | 1.7 | 0.0 | 0 of 16 |

### Diagnosis: what summaries keep, where plans come

Summaries from every run that had one, most from the long scenarios run again as a brain of a 16,000-token window (8 of 12 got one; their checkpoints: 95%). "Sources given again" counts the [n] cited before a summary that it cites too; the request at work and the notes in force are what Jean adds after the brain's words (D363).

| Language | Runs with a summary | Summaries | In its language | Sources given again | Request kept word for word | Notes in force kept |
|---|---:|---:|---:|---:|---:|---:|
| ar | 2 | 2 | 50% | — | 100% | — |
| en | 4 | 5 | 100% | — | 100% | — |
| fr | 2 | 2 | 100% | — | 100% | — |
| ja | 2 | 6 | 83% | — | 100% | — |

Plans, wherever Jean's features were on: long tasks should have one, one-step requests none, and a task that ended should have every step settled.

| Language | Long tasks with a plan | Its first plan at brain step | Every step settled when it ended | One-step requests with a plan |
|---|---:|---:|---:|---:|
| ar | 0% (27) | — | — | 0% (2) |
| en | 0% (44) | — | — | 0% (2) |
| fr | 0% (27) | — | — | 0% (2) |
| ja | 0% (27) | — | — | 0% (2) |

Over all languages: 0% of 125 long tasks had a plan, first shown at step — (median), every step settled in — of the 0 that ended; 0 of 8 one-step requests had one.

### Where a feature made things worse

- GDPval: the judge preferred the runs with the features off, on's win rate 48% (on better 5, off better 6, 9 ties of 20).
- Compaction: 2 of 15 summaries weren't in the conversation's language.
