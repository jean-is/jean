# Designs: how well brains give a design's facts

Written by `npm run designs -- --write`, one section per brain, replaced when that brain is measured
again. Each request asks for something to print, post or send, as the first message of a conversation,
with Jean's base prompt, design's line and rule, and that tool alone; a design Jean can make nothing of
goes back to the brain with why, up to three tries. What the brain sends is repaired as Jean would, then
scored: every fact of the request, as its language writes it ("facts kept", over the designs taken);
nothing made up that the request didn't give (a phone number, a time, a date, a price); a size that's
right for it; words in the request's script; and the marks Jean's checks put on it, a weekday that isn't
its date's and a gap where a fact is missing, with none where none is due. A design is right when all of
that holds. Every brain gets Designs (24 October 2026), so there is no gate: this says where the schema,
Jean's repairs and the person's hand have to make up the difference.

## Every brain

| Brain | Right | Facts kept | Nothing made up |
|---|---:|---:|---:|
| haiku (claudecode) | 97% | 100% | 100% |
| qwen3.8-27b-splash (lmstudio, {"reasoning_effort":"none"}) | 92% | 99% | 100% |
| qwen3.5-4b-mlx (lmstudio, {"reasoning_effort":"none"}) | 84% | 98% | 97% |
| openai/gpt-oss-20b (lmstudio) | 77% | 95% | 88% |
| google/gemma-4-e2b (lmstudio, {"reasoning_effort":"none"}) | 69% | 93% | 100% |
| google/gemma-4-e2b (lmstudio, {"reasoning_effort":"none"}, held to what Jean takes) | 64% | 92% | 98% |
| google/gemma-4-e2b (lmstudio, {"reasoning_effort":"none"}, wording A) | 64% | 92% | 100% |
| google/gemma-4-e2b (lmstudio, {"reasoning_effort":"none"}, wording C) | 63% | 92% | 100% |
| nvidia-nemotron-3.5-bolt-e4b-mlx@4bit (lmstudio, {"reasoning_effort":"none"}) | 48% | 93% | 100% |
| qwen3.5-2b-mlx (lmstudio, {"reasoning_effort":"none"}) | 41% | 79% | 92% |

## haiku (claudecode), 2026-10-24

Right on 97% of 64 designs (8 languages, 8 requests). Marks no request called for, as false alarms: gap on certificate (2).

| Language | Called design | Taken | Facts kept | Nothing made up | Size | Script | Marks | Right |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| en | 88% | 88% | 100% | 100% | 100% | 100% | 100% | **88%** |
| fr | 100% | 100% | 100% | 100% | 100% | 100% | 100% | **100%** |
| ar | 100% | 100% | 100% | 100% | 100% | 100% | 100% | **100%** |
| ja | 100% | 100% | 100% | 100% | 100% | 100% | 100% | **100%** |
| es | 100% | 100% | 100% | 100% | 100% | 100% | 100% | **100%** |
| de | 100% | 100% | 100% | 100% | 100% | 100% | 100% | **100%** |
| ru | 100% | 100% | 97% | 100% | 100% | 100% | 100% | **88%** |
| vi | 100% | 100% | 100% | 100% | 100% | 100% | 100% | **100%** |
| **All** | 98% | 98% | 100% | 100% | 100% | 100% | 100% | **97%** |

| Request | en | fr | ar | ja | es | de | ru | vi | Commonest misses |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| bakesale | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 0/1 | 1/1 | no 200 (1); no поездк (1) |
| birthday | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | — |
| certificate | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | — |
| garage | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | — |
| housewarming | 0/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | no design (1) |
| lostcat | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | — |
| menu | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | — |
| offsite | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | — |

## qwen3.8-27b-splash (lmstudio, {"reasoning_effort":"none"}), 2026-10-24

Right on 92% of 64 designs (8 languages, 8 requests). Jean repaired 6: date into when (6). Marks no request called for, as false alarms: gap on certificate (1).

| Language | Called design | Taken | Facts kept | Nothing made up | Size | Script | Marks | Right |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| en | 100% | 100% | 98% | 100% | 100% | 100% | 88% | **75%** |
| fr | 100% | 100% | 100% | 100% | 100% | 100% | 100% | **100%** |
| ar | 100% | 100% | 100% | 100% | 100% | 100% | 100% | **100%** |
| ja | 100% | 100% | 100% | 100% | 100% | 100% | 100% | **100%** |
| es | 100% | 100% | 100% | 100% | 100% | 100% | 100% | **100%** |
| de | 100% | 100% | 100% | 100% | 100% | 100% | 100% | **100%** |
| ru | 100% | 100% | 95% | 100% | 100% | 100% | 100% | **88%** |
| vi | 100% | 100% | 98% | 100% | 100% | 100% | 88% | **75%** |
| **All** | 100% | 100% | 99% | 100% | 100% | 100% | 97% | **92%** |

| Request | en | fr | ar | ja | es | de | ru | vi | Commonest misses |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| bakesale | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 0/1 | no thang 11 (1) |
| birthday | 0/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | no 3 pm (1) |
| certificate | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 0/1 | 1/1 | no проплыл (1); no нарукавник (1); no 18 (1) |
| garage | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | — |
| housewarming | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | — |
| lostcat | 0/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 0/1 | no gap mark (2) |
| menu | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | — |
| offsite | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | — |

## qwen3.5-4b-mlx (lmstudio, {"reasoning_effort":"none"}), 2026-10-24

Right on 84% of 64 designs (8 languages, 8 requests). Jean repaired 3: date into when (2), size certificate (1). Marks no request called for, as false alarms: gap on certificate (3), gap on garage (3), gap on menu (3), gap on offsite (4), gap on bakesale (3).

| Language | Called design | Taken | Facts kept | Nothing made up | Size | Script | Marks | Right |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| en | 100% | 100% | 98% | 100% | 100% | 100% | 100% | **88%** |
| fr | 100% | 100% | 98% | 100% | 100% | 100% | 100% | **88%** |
| ar | 88% | 88% | 100% | 86% | 100% | 100% | 86% | **63%** |
| ja | 100% | 100% | 96% | 88% | 100% | 100% | 75% | **75%** |
| es | 100% | 100% | 97% | 100% | 100% | 100% | 88% | **75%** |
| de | 100% | 100% | 100% | 100% | 100% | 100% | 100% | **100%** |
| ru | 100% | 100% | 98% | 100% | 100% | 100% | 88% | **88%** |
| vi | 100% | 100% | 100% | 100% | 100% | 100% | 100% | **100%** |
| **All** | 98% | 98% | 98% | 97% | 100% | 100% | 92% | **84%** |

| Request | en | fr | ar | ja | es | de | ru | vi | Commonest misses |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| bakesale | 1/1 | 0/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | no 10 h (1) |
| birthday | 0/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | no 3 pm (1) |
| certificate | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | — |
| garage | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | — |
| housewarming | 1/1 | 1/1 | 1/1 | 0/1 | 1/1 | 1/1 | 0/1 | 1/1 | no weekday mark (2); no (木) (1); no 11月14日 (1) |
| lostcat | 1/1 | 1/1 | 0/1 | 1/1 | 0/1 | 1/1 | 1/1 | 1/1 | no gap mark (2) |
| menu | 1/1 | 1/1 | 0/1 | 1/1 | 0/1 | 1/1 | 1/1 | 1/1 | made up a time (1); no camille (1); no hugo (1) |
| offsite | 1/1 | 1/1 | 0/1 | 0/1 | 1/1 | 1/1 | 1/1 | 1/1 | no design (1); weekday mark (1) |

## openai/gpt-oss-20b (lmstudio), 2026-10-24

Right on 77% of 64 designs (8 languages, 8 requests). Jean repaired 17: date into when (17). Marks no request called for, as false alarms: gap on housewarming (1), gap on garage (1), gap on birthday (1), gap on certificate (3).

| Language | Called design | Taken | Facts kept | Nothing made up | Size | Script | Marks | Right |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| en | 100% | 100% | 91% | 88% | 100% | 100% | 100% | **50%** |
| fr | 100% | 100% | 97% | 88% | 100% | 100% | 100% | **88%** |
| ar | 100% | 100% | 97% | 88% | 100% | 100% | 100% | **88%** |
| ja | 100% | 100% | 98% | 75% | 100% | 100% | 88% | **75%** |
| es | 100% | 100% | 100% | 88% | 100% | 100% | 100% | **88%** |
| de | 100% | 100% | 100% | 88% | 100% | 100% | 100% | **88%** |
| ru | 100% | 100% | 97% | 100% | 100% | 100% | 100% | **75%** |
| vi | 100% | 100% | 84% | 88% | 100% | 100% | 100% | **63%** |
| **All** | 100% | 100% | 95% | 88% | 100% | 100% | 98% | **77%** |

| Request | en | fr | ar | ja | es | de | ru | vi | Commonest misses |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| bakesale | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 0/1 | no 21 (1); no thang 11 (1); no 10 gio (1) |
| birthday | 0/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 0/1 | 0/1 | no 7 (2); no 3 pm (1) |
| certificate | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 0/1 | 1/1 | no проплыл (1) |
| garage | 0/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | no 2 pm (1) |
| housewarming | 1/1 | 1/1 | 1/1 | 0/1 | 1/1 | 1/1 | 1/1 | 1/1 | no (木) (1); made up a phone (1); no weekday mark (1) |
| lostcat | 0/1 | 1/1 | 1/1 | 0/1 | 1/1 | 1/1 | 1/1 | 1/1 | made up a phone (2) |
| menu | 0/1 | 0/1 | 0/1 | 1/1 | 0/1 | 0/1 | 1/1 | 0/1 | made up a date (5); no camille (2); no hugo (2) |
| offsite | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | — |

## google/gemma-4-e2b (lmstudio, {"reasoning_effort":"none"}), 2026-10-24

Right on 69% of 64 designs (8 languages, 8 requests). Jean repaired 19: date into when (11), dishes as items (8). Marks no request called for, as false alarms: gap on certificate (4), gap on menu (7), gap on bakesale (4), gap on birthday (1), gap on offsite (1).

| Language | Called design | Taken | Facts kept | Nothing made up | Size | Script | Marks | Right |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| en | 100% | 100% | 93% | 100% | 100% | 100% | 100% | **50%** |
| fr | 100% | 100% | 97% | 100% | 100% | 100% | 88% | **75%** |
| ar | 88% | 88% | 92% | 100% | 86% | 86% | 86% | **75%** |
| ja | 100% | 100% | 94% | 100% | 100% | 100% | 88% | **88%** |
| es | 100% | 100% | 93% | 100% | 100% | 100% | 88% | **50%** |
| de | 100% | 100% | 91% | 100% | 100% | 100% | 88% | **75%** |
| ru | 100% | 100% | 93% | 100% | 100% | 100% | 100% | **63%** |
| vi | 100% | 100% | 93% | 100% | 100% | 100% | 88% | **75%** |
| **All** | 98% | 98% | 93% | 100% | 98% | 98% | 90% | **69%** |

| Request | en | fr | ar | ja | es | de | ru | vi | Commonest misses |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| bakesale | 0/1 | 0/1 | 1/1 | 1/1 | 0/1 | 1/1 | 1/1 | 1/1 | no €2 (1); no ecole (1); no voyage (1) |
| birthday | 0/1 | 1/1 | 1/1 | 1/1 | 0/1 | 0/1 | 0/1 | 0/1 | no 7 (4); no 15:00 (1); no 15 uhr (1) |
| certificate | 0/1 | 1/1 | 1/1 | 1/1 | 0/1 | 1/1 | 0/1 | 1/1 | no armband (1); no valor (1); no проплыл (1) |
| garage | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | — |
| housewarming | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | — |
| lostcat | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | no gap mark (6); no moka (1); no رمادي (1) |
| menu | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | — |
| offsite | 1/1 | 1/1 | 0/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | no design (1) |

## google/gemma-4-e2b (lmstudio, {"reasoning_effort":"none"}, held to what Jean takes), 2026-10-24

Right on 64% of 64 designs (8 languages, 8 requests). Jean repaired 10: date into when (10). Marks no request called for, as false alarms: gap on certificate (7), gap on menu (6), gap on bakesale (2), gap on offsite (2), gap on garage (5), gap on housewarming (1).

| Language | Called design | Taken | Facts kept | Nothing made up | Size | Script | Marks | Right |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| en | 100% | 100% | 97% | 100% | 100% | 100% | 100% | **75%** |
| fr | 100% | 100% | 95% | 100% | 100% | 100% | 75% | **63%** |
| ar | 100% | 100% | 95% | 100% | 100% | 100% | 88% | **63%** |
| ja | 100% | 100% | 98% | 100% | 100% | 100% | 88% | **75%** |
| es | 100% | 100% | 81% | 88% | 100% | 100% | 88% | **50%** |
| de | 100% | 100% | 83% | 100% | 100% | 100% | 88% | **50%** |
| ru | 100% | 100% | 95% | 100% | 100% | 88% | 88% | **63%** |
| vi | 100% | 100% | 93% | 100% | 100% | 100% | 100% | **75%** |
| **All** | 100% | 100% | 92% | 98% | 100% | 98% | 89% | **64%** |

| Request | en | fr | ar | ja | es | de | ru | vi | Commonest misses |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| bakesale | 0/1 | 0/1 | 1/1 | 1/1 | 0/1 | 0/1 | 1/1 | 1/1 | no 2 € (2); no €2 (1); no viaje (1) |
| birthday | 1/1 | 1/1 | 1/1 | 1/1 | 0/1 | 0/1 | 1/1 | 0/1 | no 7 (1); no 15 uhr (1); no thang 11 (1) |
| certificate | 1/1 | 1/1 | 0/1 | 0/1 | 0/1 | 0/1 | 1/1 | 1/1 | no سامي (1); no サミ (1); no sami (1) |
| garage | 1/1 | 1/1 | 0/1 | 1/1 | 1/1 | 1/1 | 0/1 | 1/1 | no 22 (2); no نوفمبر (1); no ноябр (1) |
| housewarming | 1/1 | 0/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | no jeudi (1); no 19 h (1); no weekday mark (1) |
| lostcat | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | no gap mark (6); no 20 (2); no moka (1) |
| menu | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | — |
| offsite | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 0/1 | 1/1 | no анси (1); not in its script (1) |

## google/gemma-4-e2b (lmstudio, {"reasoning_effort":"none"}, wording A), 2026-10-24

Right on 64% of 64 designs (8 languages, 8 requests). Jean repaired 4: date into when (3), words flat (1), no title (1). Marks no request called for, as false alarms: gap on bakesale (6), gap on certificate (7), gap on garage (6), gap on menu (7), gap on housewarming (4), gap on offsite (1).

| Language | Called design | Taken | Facts kept | Nothing made up | Size | Script | Marks | Right |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| en | 100% | 100% | 100% | 100% | 100% | 100% | 88% | **88%** |
| fr | 100% | 100% | 97% | 100% | 100% | 100% | 88% | **75%** |
| ar | 100% | 100% | 86% | 100% | 100% | 100% | 88% | **50%** |
| ja | 100% | 100% | 92% | 100% | 100% | 100% | 88% | **75%** |
| es | 100% | 100% | 86% | 100% | 100% | 100% | 88% | **63%** |
| de | 100% | 100% | 84% | 100% | 100% | 100% | 88% | **38%** |
| ru | 100% | 100% | 93% | 100% | 100% | 100% | 88% | **50%** |
| vi | 100% | 100% | 98% | 100% | 100% | 100% | 88% | **75%** |
| **All** | 100% | 100% | 92% | 100% | 100% | 100% | 88% | **64%** |

| Request | en | fr | ar | ja | es | de | ru | vi | Commonest misses |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| bakesale | 1/1 | 0/1 | 0/1 | 1/1 | 1/1 | 0/1 | 0/1 | 1/1 | no 21 (3); no novembre (1); no نوفمبر (1) |
| birthday | 1/1 | 1/1 | 0/1 | 0/1 | 1/1 | 0/1 | 1/1 | 0/1 | no 7 (2); no كلير (1); no 15 uhr (1) |
| certificate | 1/1 | 1/1 | 1/1 | 1/1 | 0/1 | 0/1 | 0/1 | 1/1 | no valor (1); no flugel (1); no проплыл (1) |
| garage | 1/1 | 1/1 | 0/1 | 1/1 | 1/1 | 0/1 | 0/1 | 1/1 | no 22 (2); no نوفمبر (1); no november (1) |
| housewarming | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | — |
| lostcat | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | no gap mark (8); no رمادي (1); no مخطط (1) |
| menu | 1/1 | 1/1 | 1/1 | 1/1 | 0/1 | 1/1 | 1/1 | 1/1 | no remolacha (1); no pato (1); no higo (1) |
| offsite | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | — |

## google/gemma-4-e2b (lmstudio, {"reasoning_effort":"none"}, wording C), 2026-10-24

Right on 63% of 64 designs (8 languages, 8 requests). Jean repaired 12: dishes as items (8), date into when (4). Marks no request called for, as false alarms: gap on certificate (6), gap on menu (8), gap on garage (2), gap on birthday (1), gap on bakesale (2).

| Language | Called design | Taken | Facts kept | Nothing made up | Size | Script | Marks | Right |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| en | 100% | 100% | 97% | 100% | 100% | 100% | 88% | **63%** |
| fr | 100% | 100% | 95% | 100% | 100% | 100% | 88% | **63%** |
| ar | 88% | 88% | 91% | 100% | 100% | 100% | 86% | **63%** |
| ja | 100% | 100% | 92% | 100% | 100% | 100% | 88% | **75%** |
| es | 100% | 100% | 95% | 100% | 100% | 100% | 88% | **50%** |
| de | 100% | 100% | 90% | 100% | 100% | 100% | 88% | **63%** |
| ru | 100% | 100% | 95% | 100% | 100% | 100% | 100% | **75%** |
| vi | 100% | 100% | 84% | 100% | 100% | 100% | 88% | **50%** |
| **All** | 98% | 98% | 92% | 100% | 100% | 100% | 89% | **63%** |

| Request | en | fr | ar | ja | es | de | ru | vi | Commonest misses |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| bakesale | 0/1 | 0/1 | 0/1 | 1/1 | 0/1 | 0/1 | 0/1 | 0/1 | no 21 (5); no €2 (1); no novembre (1) |
| birthday | 0/1 | 1/1 | 1/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | no 7 (6); no 15 gio (1) |
| certificate | 1/1 | 0/1 | 1/1 | 1/1 | 0/1 | 1/1 | 1/1 | 1/1 | no nage (1); no valor (1) |
| garage | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 0/1 | no 22 (1); no thang 11 (1) |
| housewarming | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | — |
| lostcat | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 1/1 | 0/1 | no gap mark (7); no رمادي (1); no مخطط (1) |
| menu | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | — |
| offsite | 1/1 | 1/1 | 0/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | no design (1) |

## nvidia-nemotron-3.5-bolt-e4b-mlx@4bit (lmstudio, {"reasoning_effort":"none"}), 2026-10-24

Right on 48% of 64 designs (8 languages, 8 requests). Jean repaired 1: date into when (1). Marks no request called for, as false alarms: gap on bakesale (5), gap on birthday (2), gap on certificate (3), gap on garage (3), gap on menu (5).

| Language | Called design | Taken | Facts kept | Nothing made up | Size | Script | Marks | Right |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| en | 88% | 88% | 94% | 100% | 100% | 100% | 100% | **63%** |
| fr | 75% | 75% | 95% | 100% | 83% | 100% | 100% | **63%** |
| ar | 25% | 25% | 92% | 100% | 50% | 100% | 100% | **13%** |
| ja | 75% | 75% | 87% | 100% | 100% | 100% | 100% | **50%** |
| es | 88% | 88% | 91% | 100% | 86% | 100% | 100% | **63%** |
| de | 88% | 88% | 100% | 100% | 100% | 100% | 86% | **75%** |
| ru | 75% | 75% | 93% | 100% | 83% | 100% | 100% | **50%** |
| vi | 38% | 25% | 85% | 100% | 50% | 100% | 100% | **13%** |
| **All** | 69% | 67% | 93% | 100% | 88% | 100% | 98% | **48%** |

| Request | en | fr | ar | ja | es | de | ru | vi | Commonest misses |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| bakesale | 1/1 | 1/1 | 0/1 | 1/1 | 1/1 | 1/1 | 1/1 | 0/1 | no design (2) |
| birthday | 0/1 | 1/1 | 0/1 | 1/1 | 0/1 | 1/1 | 0/1 | 0/1 | no 7 (2); no 3 pm (1); no design (1) |
| certificate | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 1/1 | 0/1 | 0/1 | size a6 (5); no swim (1); no armband (1) |
| garage | 1/1 | 0/1 | 0/1 | 0/1 | 1/1 | 1/1 | 1/1 | 0/1 | no design (4) |
| housewarming | 1/1 | 1/1 | 0/1 | 1/1 | 1/1 | 1/1 | 1/1 | 0/1 | no design (2) |
| lostcat | 1/1 | 1/1 | 1/1 | 0/1 | 1/1 | 0/1 | 0/1 | 1/1 | no グレー (1); no キジトラ (1); no 白 (1) |
| menu | 1/1 | 0/1 | 0/1 | 1/1 | 1/1 | 1/1 | 1/1 | 0/1 | no design (3) |
| offsite | 0/1 | 1/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | no design (7) |

## qwen3.5-2b-mlx (lmstudio, {"reasoning_effort":"none"}), 2026-10-24

Right on 41% of 64 designs (8 languages, 8 requests). Jean repaired 6: date into when (4), no title (2), words flat (1). Marks no request called for, as false alarms: gap on offsite (4), gap on certificate (1), gap on housewarming (1).

| Language | Called design | Taken | Facts kept | Nothing made up | Size | Script | Marks | Right |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| en | 100% | 100% | 81% | 100% | 100% | 100% | 100% | **63%** |
| fr | 100% | 100% | 81% | 100% | 100% | 100% | 75% | **38%** |
| ar | 100% | 100% | 74% | 100% | 100% | 100% | 75% | **38%** |
| ja | 100% | 100% | 75% | 63% | 100% | 88% | 100% | **50%** |
| es | 100% | 100% | 83% | 100% | 88% | 100% | 100% | **50%** |
| de | 100% | 100% | 86% | 100% | 100% | 100% | 100% | **50%** |
| ru | 100% | 100% | 72% | 88% | 100% | 100% | 75% | **13%** |
| vi | 75% | 75% | 83% | 83% | 100% | 100% | 83% | **25%** |
| **All** | 97% | 97% | 79% | 92% | 98% | 98% | 89% | **41%** |

| Request | en | fr | ar | ja | es | de | ru | vi | Commonest misses |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| bakesale | 1/1 | 0/1 | 1/1 | 0/1 | 1/1 | 1/1 | 0/1 | 1/1 | no 10 h (1); no 13 h (1); no ecole (1) |
| birthday | 1/1 | 1/1 | 0/1 | 1/1 | 0/1 | 0/1 | 0/1 | 0/1 | no 7 (5); no ليا (1); no lea (1) |
| certificate | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 1/1 | 0/1 | 0/1 | no sami (3); no nage (1); no brassard (1) |
| garage | 1/1 | 1/1 | 1/1 | 1/1 | 0/1 | 0/1 | 0/1 | 0/1 | no domingo (1); no sonntag (1); no воскресень (1) |
| housewarming | 1/1 | 0/1 | 0/1 | 1/1 | 1/1 | 1/1 | 0/1 | 1/1 | no weekday mark (3); no jeudi (1); no الخميس (1) |
| lostcat | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | no gap mark (4); no 20 (2); no moka (1) |
| menu | 0/1 | 0/1 | 0/1 | 0/1 | 1/1 | 0/1 | 0/1 | 0/1 | no camille (3); no hugo (3); made up a phone (2) |
| offsite | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 0/1 | no design (1) |
