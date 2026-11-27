# Views: how well brains propose one

Written by `npm run views -- --write`, one section per brain, replaced when that brain is measured again. Each request goes to the
brain as the first message of a conversation, with Jean's base prompt, the note of a collection open beside the task and Tables' four
tools, each call answered as Jean would, up to 6 steps (scripts/views.js). A view is right when Jean takes it and it shows what
the request asks: the rows it should keep, in order where one is asked, shown, grouped and hidden as asked, under a name in the
request's language. The gate, written before the first run: right on 80% of the requests for a view or more, and no view on
90% or more of the requests for something else, an answer or a change.

## sonnet (claudecode), 2026-11-27

Right on 100% of 80 requests for a view (4 languages): over the gate of 80%. No view on 100% of 24 requests for something else: over the gate of 90%.

| Language | Called table_view | Taken | Right at once | Right | No view for something else |
|---|---:|---:|---:|---:|---:|
| en | 100% (20/20) | 100% (20/20) | 100% (20/20) | 100% (20/20) | 100% (6/6) |
| fr | 100% (20/20) | 100% (20/20) | 100% (20/20) | 100% (20/20) | 100% (6/6) |
| ar | 100% (20/20) | 100% (20/20) | 100% (20/20) | 100% (20/20) | 100% (6/6) |
| ja | 100% (20/20) | 100% (20/20) | 100% (20/20) | 100% (20/20) | 100% (6/6) |
| All | 100% (80/80) | 100% (80/80) | 100% (80/80) | 100% (80/80) | 100% (24/24) |

Commonest misses: none.

## haiku (claudecode), 2026-11-17

Right on 92% of 160 requests for a view (4 languages, 2 runs each): over the gate of 80%. No view on 98% of 48 requests for something else: over the gate of 90%.

| Language | Called table_view | Taken | Right at once | Right | No view for something else |
|---|---:|---:|---:|---:|---:|
| en | 85% (34/40) | 85% (34/40) | 85% (34/40) | 85% (34/40) | 100% (12/12) |
| fr | 90% (36/40) | 90% (36/40) | 90% (36/40) | 90% (36/40) | 100% (12/12) |
| ar | 95% (38/40) | 95% (38/40) | 93% (37/40) | 93% (37/40) | 100% (12/12) |
| ja | 100% (40/40) | 100% (40/40) | 100% (40/40) | 100% (40/40) | 92% (11/12) |
| All | 93% (148/160) | 93% (148/160) | 92% (147/160) | 92% (147/160) | 98% (47/48) |

Commonest misses: over100: no view proposed (3); unpaid: no view proposed (2); not-food: no view proposed (2); mine: no view proposed (1); unpaid-travel: no view proposed (1); read-best: no view proposed (1).
