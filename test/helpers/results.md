# Helpers a step under: sonnet (claudecode), its helpers on haiku

Written by `npm run helpers -- --write`, 2026-11-28. Each request of [set.json](set.json), a large task in parts, run twice
by sonnet as Jean runs a task in Node: its helpers on sonnet, then on haiku; opus, given both answers
blind in both orders, says which does what was asked better, a tie when its two words disagree. Only pairs where both runs handed
parts to helpers count: 16 of 16 (helpers in 16 runs on sonnet's helpers, 16 on haiku's).
"A step under, as good" is the share of pairs haiku's helpers won or tied, a tie counting half.

| Language | Pairs | sonnet's helpers better | haiku's helpers better | Tie | A step under, as good |
|---|---:|---:|---:|---:|---:|
| en | 4 | 2 | 2 | 0 | 50% |
| fr | 4 | 2 | 2 | 0 | 50% |
| ar | 4 | 3 | 1 | 0 | 25% |
| ja | 4 | 2 | 1 | 1 | 38% |
| **All** | 16 | 9 | 6 | 1 | **41%** |

Tokens written: 105,727 with sonnet's helpers, 120,758 with haiku's. Pairs judged differently in the two orders, counted
as ties: 1.
