# Tables: how well brains make one

Written by `npm run tables -- --write`, one section per brain, replaced when that brain is measured
again. Each request asks to keep track of something, as the first message of a conversation, with
Jean's base prompt, the line of table_create and that tool alone; a table Jean refuses goes back to the
brain with why, as in Jean, up to three tries ("right at once": the first); "taken": a table Jean made from
what the brain sent, in the end. Columns, kinds and steps are counted in the tables taken. A table is right when it has every
column the request needs (named in the request's language, any of the names the set takes), each of a
kind that works for it, and a status's steps (all but one, when there are three or more); other
columns are fine. Tables is offered with the device's brain only if it is right about 80% of the time.

## Every brain

| Brain | Right | Gate (80%) |
|---|---:|---|
| google/gemma-4-e2b (lmstudio, {"reasoning_effort":"none"}) | 35% | fails |
| google/gemma-4-e4b (lmstudio, {"reasoning_effort":"none"}) | 15% | fails |
| qwen3.5-4b-mlx (lmstudio, {"reasoning_effort":"none"}) | 60% | fails |
| qwen3.5-2b-mlx (lmstudio, {"reasoning_effort":"none"}) | 14% | fails |
| mistralai/ministral-3-3b (lmstudio) | 33% | fails |
| openai/gpt-oss-20b (lmstudio) | 70% | fails |
| google/gemma-4-26b-a4b (lmstudio) | 86% | passes |
| haiku (claudecode) | 98% | passes |

## google/gemma-4-e2b (lmstudio, {"reasoning_effort":"none"}), 2026-10-21

Right on 35% of 112 tables (4 languages, 14 requests, 2 runs each): under the gate of 80%. 26 calls were read from Gemma's syntax in the text, as Jean's device runtime reads them.

| Language | Called table_create | Taken | Columns found | Of a kind that works | Steps | Right at once | Right |
|---|---:|---:|---:|---:|---:|---:|---:|
| en | 100% | 86% | 88% | 100% | 86% | 46% | **46%** |
| fr | 86% | 75% | 80% | 100% | 86% | 25% | **25%** |
| ar | 93% | 79% | 81% | 100% | 90% | 36% | **36%** |
| ja | 100% | 68% | 84% | 100% | 67% | 32% | **32%** |
| **All** | 95% | 77% | 83% | 100% | 83% | 35% | **35%** |

| Request | en | fr | ar | ja | Commonest misses |
|---|---:|---:|---:|---:|---|
| appointments | 2/2 | 0/2 | 2/2 | 2/2 | no qui (2) |
| books | 0/2 | 0/2 | 0/2 | 0/2 | no author (2); no auteur (2); no المؤلف (2) |
| expenses | 0/2 | 2/2 | 0/2 | 0/2 | no reimbursed (2); no カテゴリ (2); no 精算 (2) |
| flats | 0/2 | 1/2 | 0/2 | 0/2 | Give the table a name. (6); no rent (1) |
| guests | 1/2 | 2/2 | 2/2 | 0/2 | Reply Status: steps yes, no (1); 返信状況: steps 出席, 欠席 (1); 返事の有無: steps 出席, 欠席 (1) |
| homework | 0/2 | 0/2 | 0/2 | 2/2 | no handed (2); no rendu (2); 22 columns (2) |
| invoices | 0/2 | 1/2 | 0/2 | 0/2 | Give the table a name. (4); no المبلغ (2); Payée: steps envoyée, payée (1) |
| jobs | 2/2 | 0/2 | 2/2 | 2/2 | no table (2) |
| leads | 0/2 | 0/2 | 0/2 | 1/2 | Give the table a name. (3); no الهاتف (2); no phone (1) |
| loans | 2/2 | 0/2 | 0/2 | 0/2 | no الشخص (2); no objet (1); no qui (1) |
| runs | 0/2 | 0/2 | 0/2 | 0/2 | no date (4); no التاريخ (2); no 日付 (2) |
| stock | 2/2 | 1/2 | 2/2 | 0/2 | no 価格 (2); no prix (1) |
| subscriptions | 2/2 | 0/2 | 0/2 | 0/2 | no table (4); Give the table a name. (2) |
| tasks | 2/2 | 0/2 | 2/2 | 2/2 | no statut (2) |

## google/gemma-4-e4b (lmstudio, {"reasoning_effort":"none"}), 2026-10-21

Right on 15% of 85 tables (4 languages, 14 requests, 2 runs each): under the gate of 80%. 1 calls were read from Gemma's syntax in the text, as Jean's device runtime reads them. 27 requests the server failed are left out.

| Language | Called table_create | Taken | Columns found | Of a kind that works | Steps | Right at once | Right |
|---|---:|---:|---:|---:|---:|---:|---:|
| en | 100% | 100% | 100% | 100% | 100% | 100% | **100%** |
| fr | 18% | 18% | 94% | 100% | 100% | 14% | **14%** |
| ar | 21% | 21% | 91% | 100% | 100% | 14% | **14%** |
| ja | 14% | 14% | 100% | 100% | 100% | 14% | **14%** |
| **All** | 19% | 19% | 95% | 100% | 100% | 15% | **15%** |

| Request | en | fr | ar | ja | Commonest misses |
|---|---:|---:|---:|---:|---|
| jobs | 1/1 | 0/2 | 0/2 | 0/2 | no table (6) |
| appointments | 0/0 | 0/2 | 1/2 | 0/2 | no table (5) |
| books | 0/0 | 1/2 | 1/2 | 1/2 | no table (3) |
| expenses | 0/0 | 0/2 | 0/2 | 0/2 | no table (5); no الفئة (1) |
| flats | 0/0 | 0/2 | 0/2 | 0/2 | no table (6) |
| guests | 0/0 | 0/2 | 0/2 | 0/2 | no table (6) |
| homework | 0/0 | 2/2 | 0/2 | 0/2 | no table (3); no سلم (1) |
| invoices | 0/0 | 0/2 | 0/2 | 0/2 | no table (6) |
| leads | 0/0 | 0/2 | 0/2 | 0/2 | no table (6) |
| loans | 0/0 | 0/2 | 1/2 | 1/2 | no table (4) |
| runs | 0/0 | 0/2 | 0/2 | 0/2 | no table (5); no date (1) |
| stock | 0/0 | 0/2 | 0/2 | 0/2 | no table (6) |
| subscriptions | 0/0 | 1/2 | 1/2 | 1/2 | no table (3) |
| tasks | 0/0 | 0/2 | 0/2 | 1/2 | no table (5) |

## qwen3.5-4b-mlx (lmstudio, {"reasoning_effort":"none"}), 2026-10-21

Right on 60% of 43 tables (4 languages, 14 requests): under the gate of 80%. 13 requests the server failed are left out.

| Language | Called table_create | Taken | Columns found | Of a kind that works | Steps | Right at once | Right |
|---|---:|---:|---:|---:|---:|---:|---:|
| en | 100% | 100% | 100% | 100% | 100% | 100% | **100%** |
| fr | 100% | 100% | 94% | 100% | 100% | 79% | **79%** |
| ar | 100% | 100% | 82% | 98% | 75% | 50% | **50%** |
| ja | 93% | 93% | 77% | 100% | 80% | 50% | **50%** |
| **All** | 98% | 98% | 85% | 99% | 87% | 60% | **60%** |

| Request | en | fr | ar | ja | Commonest misses |
|---|---:|---:|---:|---:|---|
| jobs | 1/1 | 1/1 | 1/1 | 1/1 | — |
| appointments | 0/0 | 1/1 | 1/1 | 0/1 | no table (1) |
| books | 0/0 | 0/1 | 0/1 | 0/1 | no auteur (1); no المؤلف (1); الحالة: steps أقرأ, قرأت (1) |
| expenses | 0/0 | 0/1 | 1/1 | 0/1 | no remboursé (1); no 内容 (1); no 金額 (1) |
| flats | 0/0 | 1/1 | 0/1 | 1/1 | no الزيارة (1) |
| guests | 0/0 | 1/1 | 0/1 | 1/1 | no الاسم (1); no الرد (1) |
| homework | 0/0 | 1/1 | 0/1 | 0/1 | no سلم (1); no 生徒 (1); no 週 (1) |
| invoices | 0/0 | 1/1 | 1/1 | 1/1 | — |
| leads | 0/0 | 1/1 | 1/1 | 0/1 | 現在のステータス: steps 新規, 成約, 失注 (1) |
| loans | 0/0 | 1/1 | 1/1 | 1/1 | — |
| runs | 0/0 | 1/1 | 0/1 | 1/1 | no التاريخ (1) |
| stock | 0/0 | 1/1 | 0/1 | 0/1 | no المنتج (1); no الكمية (1); no السعر (1) |
| subscriptions | 0/0 | 1/1 | 1/1 | 1/1 | — |
| tasks | 0/0 | 0/1 | 0/1 | 0/1 | no statut (1); المهمة: select (1); no ステータス (1) |

## qwen3.5-2b-mlx (lmstudio, {"reasoning_effort":"none"}), 2026-10-21

Right on 14% of 43 tables (4 languages, 14 requests): under the gate of 80%. 13 requests the server failed are left out.

| Language | Called table_create | Taken | Columns found | Of a kind that works | Steps | Right at once | Right |
|---|---:|---:|---:|---:|---:|---:|---:|
| en | 100% | 100% | 50% | 100% | 100% | 0% | **0%** |
| fr | 79% | 64% | 78% | 100% | 33% | 14% | **14%** |
| ar | 50% | 29% | 27% | 100% | — | 0% | **0%** |
| ja | 93% | 86% | 74% | 94% | 0% | 29% | **29%** |
| **All** | 74% | 60% | 67% | 97% | 40% | 14% | **14%** |

| Request | en | fr | ar | ja | Commonest misses |
|---|---:|---:|---:|---:|---|
| jobs | 0/1 | 0/1 | 0/1 | 0/1 | no table (2); no position (1); no date (1) |
| appointments | 0/0 | 0/1 | 0/1 | 1/1 | no table (2) |
| books | 0/0 | 0/1 | 0/1 | 0/1 | no auteur (1); Give the table its columns. (1); no 著者 (1) |
| expenses | 0/0 | 0/1 | 0/1 | 0/1 | no table (1); no الفئة (1); no カテゴリ (1) |
| flats | 0/0 | 0/1 | 0/1 | 0/1 | Give the table its columns. (1); no العنوان (1); no الإيجار (1) |
| guests | 0/0 | 0/1 | 0/1 | 0/1 | Statut: steps invité, oui (1); no table (1); 返事者: text (1) |
| homework | 0/0 | 0/1 | 0/1 | 1/1 | no rendu (1); no التلميذ (1); no الأسبوع (1) |
| invoices | 0/0 | 0/1 | 0/1 | 1/1 | no client (1); no table (1) |
| leads | 0/0 | 0/1 | 0/1 | 0/1 | no téléphone (1); Statut: steps devis envoyé, accepté, refusé (1); no الاسم (1) |
| loans | 0/0 | 0/1 | 0/1 | 0/1 | no objet (1); no table (1); Give the table its columns. (1) |
| runs | 0/0 | 1/1 | 0/1 | 0/1 | no table (2) |
| stock | 0/0 | 0/1 | 0/1 | 0/1 | Give the table its columns. (2); no 価格 (1) |
| subscriptions | 0/0 | 1/1 | 0/1 | 1/1 | Give the table its columns. (1) |
| tasks | 0/0 | 0/1 | 0/1 | 0/1 | no qui (1); no statut (1); no table (1) |

## mistralai/ministral-3-3b (lmstudio), 2026-10-21

Right on 33% of 43 tables (4 languages, 14 requests): under the gate of 80%. 13 requests the server failed are left out.

| Language | Called table_create | Taken | Columns found | Of a kind that works | Steps | Right at once | Right |
|---|---:|---:|---:|---:|---:|---:|---:|
| en | 100% | 100% | 100% | 100% | 100% | 100% | **100%** |
| fr | 36% | 36% | 95% | 100% | 100% | 29% | **29%** |
| ar | 50% | 50% | 88% | 100% | 100% | 36% | **36%** |
| ja | 57% | 57% | 86% | 96% | — | 29% | **29%** |
| **All** | 49% | 49% | 90% | 99% | 100% | 33% | **33%** |

| Request | en | fr | ar | ja | Commonest misses |
|---|---:|---:|---:|---:|---|
| jobs | 1/1 | 0/1 | 0/1 | 0/1 | no table (3) |
| appointments | 0/0 | 0/1 | 1/1 | 0/1 | no table (1); no 医師 (1) |
| books | 0/0 | 1/1 | 1/1 | 0/1 | no 著者 (1); no ステータス (1) |
| expenses | 0/0 | 0/1 | 0/1 | 0/1 | no table (2); no الفئة (1); no مسترد (1) |
| flats | 0/0 | 0/1 | 1/1 | 0/1 | no table (2) |
| guests | 0/0 | 0/1 | 0/1 | 0/1 | no table (2); 返事の日程: date (1) |
| homework | 0/0 | 0/1 | 1/1 | 1/1 | no table (1) |
| invoices | 0/0 | 1/1 | 1/1 | 1/1 | — |
| leads | 0/0 | 0/1 | 0/1 | 0/1 | no table (3) |
| loans | 0/0 | 1/1 | 0/1 | 1/1 | no table (1) |
| runs | 0/0 | 0/1 | 0/1 | 0/1 | no date (1); no التاريخ (1); no 日付 (1) |
| stock | 0/0 | 0/1 | 0/1 | 0/1 | no table (3) |
| subscriptions | 0/0 | 1/1 | 0/1 | 0/1 | no table (2) |
| tasks | 0/0 | 0/1 | 0/1 | 1/1 | no table (2) |

## openai/gpt-oss-20b (lmstudio), 2026-10-21

Right on 70% of 43 tables (4 languages, 14 requests): under the gate of 80%. 13 requests the server failed are left out.

| Language | Called table_create | Taken | Columns found | Of a kind that works | Steps | Right at once | Right |
|---|---:|---:|---:|---:|---:|---:|---:|
| en | 100% | 100% | 100% | 100% | 100% | 100% | **100%** |
| fr | 100% | 100% | 96% | 100% | 100% | 79% | **86%** |
| ar | 86% | 86% | 90% | 100% | 75% | 57% | **57%** |
| ja | 93% | 93% | 93% | 95% | 50% | 64% | **64%** |
| **All** | 93% | 93% | 94% | 98% | 83% | 67% | **70%** |

| Request | en | fr | ar | ja | Commonest misses |
|---|---:|---:|---:|---:|---|
| jobs | 1/1 | 1/1 | 1/1 | 0/1 | no table (1) |
| appointments | 0/0 | 1/1 | 1/1 | 1/1 | — |
| books | 0/0 | 0/1 | 0/1 | 0/1 | no auteur (1); no المؤلف (1); no 著者 (1) |
| expenses | 0/0 | 1/1 | 0/1 | 0/1 | no table (1); no 精算 (1) |
| flats | 0/0 | 1/1 | 1/1 | 1/1 | — |
| guests | 0/0 | 1/1 | 1/1 | 0/1 | 返事あり: checkbox (1) |
| homework | 0/0 | 0/1 | 0/1 | 1/1 | no rendu (1); no table (1) |
| invoices | 0/0 | 1/1 | 1/1 | 1/1 | — |
| leads | 0/0 | 1/1 | 0/1 | 0/1 | no الهاتف (1); حالة الطلب: steps جديد, تم إرسال العرض, مقبول, مرفوض (1); 連絡先: email (1) |
| loans | 0/0 | 1/1 | 0/1 | 1/1 | no أعيد (1) |
| runs | 0/0 | 1/1 | 0/1 | 1/1 | no التاريخ (1) |
| stock | 0/0 | 1/1 | 1/1 | 1/1 | — |
| subscriptions | 0/0 | 1/1 | 1/1 | 1/1 | — |
| tasks | 0/0 | 1/1 | 1/1 | 1/1 | — |

## google/gemma-4-26b-a4b (lmstudio), 2026-10-21

Right on 86% of 43 tables (4 languages, 14 requests): over the gate of 80%. 13 requests the server failed are left out.

| Language | Called table_create | Taken | Columns found | Of a kind that works | Steps | Right at once | Right |
|---|---:|---:|---:|---:|---:|---:|---:|
| en | 100% | 100% | 100% | 100% | 100% | 100% | **100%** |
| fr | 100% | 100% | 92% | 100% | 100% | 79% | **79%** |
| ar | 100% | 100% | 98% | 100% | 100% | 93% | **93%** |
| ja | 100% | 100% | 96% | 100% | 100% | 79% | **86%** |
| **All** | 100% | 100% | 95% | 100% | 100% | 84% | **86%** |

| Request | en | fr | ar | ja | Commonest misses |
|---|---:|---:|---:|---:|---|
| books | 1/1 | 1/1 | 0/1 | 0/1 | no المؤلف (1); no 著者 (1) |
| appointments | 0/0 | 1/1 | 1/1 | 1/1 | — |
| expenses | 0/0 | 0/1 | 1/1 | 1/1 | no description (1); no catégorie (1) |
| flats | 0/0 | 1/1 | 1/1 | 1/1 | — |
| guests | 0/0 | 1/1 | 1/1 | 1/1 | — |
| homework | 0/0 | 0/1 | 1/1 | 1/1 | no rendu (1) |
| invoices | 0/0 | 1/1 | 1/1 | 1/1 | — |
| jobs | 0/0 | 1/1 | 1/1 | 1/1 | — |
| leads | 0/0 | 0/1 | 1/1 | 0/1 | no téléphone (1); no 電話 (1) |
| loans | 0/0 | 1/1 | 1/1 | 1/1 | — |
| runs | 0/0 | 1/1 | 1/1 | 1/1 | — |
| stock | 0/0 | 1/1 | 1/1 | 1/1 | — |
| subscriptions | 0/0 | 1/1 | 1/1 | 1/1 | — |
| tasks | 0/0 | 1/1 | 1/1 | 1/1 | — |

## haiku (claudecode), 2026-10-21

Right on 98% of 56 tables (4 languages, 14 requests): over the gate of 80%.

| Language | Called table_create | Taken | Columns found | Of a kind that works | Steps | Right at once | Right |
|---|---:|---:|---:|---:|---:|---:|---:|
| en | 100% | 100% | 100% | 100% | 100% | 100% | **100%** |
| fr | 100% | 100% | 100% | 100% | 100% | 100% | **100%** |
| ar | 100% | 100% | 100% | 100% | 100% | 100% | **100%** |
| ja | 100% | 100% | 100% | 100% | 100% | 93% | **93%** |
| **All** | 100% | 100% | 100% | 100% | 100% | 98% | **98%** |

| Request | en | fr | ar | ja | Commonest misses |
|---|---:|---:|---:|---:|---|
| appointments | 1/1 | 1/1 | 1/1 | 1/1 | — |
| books | 1/1 | 1/1 | 1/1 | 1/1 | — |
| expenses | 1/1 | 1/1 | 1/1 | 1/1 | — |
| flats | 1/1 | 1/1 | 1/1 | 0/1 | 16 columns (1) |
| guests | 1/1 | 1/1 | 1/1 | 1/1 | — |
| homework | 1/1 | 1/1 | 1/1 | 1/1 | — |
| invoices | 1/1 | 1/1 | 1/1 | 1/1 | — |
| jobs | 1/1 | 1/1 | 1/1 | 1/1 | — |
| leads | 1/1 | 1/1 | 1/1 | 1/1 | — |
| loans | 1/1 | 1/1 | 1/1 | 1/1 | — |
| runs | 1/1 | 1/1 | 1/1 | 1/1 | — |
| stock | 1/1 | 1/1 | 1/1 | 1/1 | — |
| subscriptions | 1/1 | 1/1 | 1/1 | 1/1 | — |
| tasks | 1/1 | 1/1 | 1/1 | 1/1 | — |
