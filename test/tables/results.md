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
| Gemma 4 E2B q4f16 in Jean’s runtime (brain-worker.js, headless Chromium, WebGPU) | 44% | fails |
| Gemma 4 E2B, 8-bit decoder and q4f16 embeddings, in Jean’s runtime (headless Chromium, WebGPU) | 45% | fails |
| gemma-4-e2b-it-mlx@8bit (lmstudio, {"reasoning_effort":"none"}, held to what Jean takes) | 80% | passes |
| gemma-4-e2b-it-mlx@8bit (lmstudio, {"reasoning_effort":"none"}) | 42% | fails |
| google/gemma-4-e2b:2 (lmstudio, {"reasoning_effort":"none"}, held to what Jean takes) | 71% | fails |
| google/gemma-4-e2b:2 (lmstudio, {"reasoning_effort":"none"}) | 36% | fails |
| google/gemma-4-e2b:2 (lmstudio, {"reasoning_effort":"none"}, held to what Jean takes, the earlier wording E) | 59% | fails |
| google/gemma-4-e2b:2 (lmstudio, {"reasoning_effort":"none"}, the earlier wording E) | 15% | fails |
| google/gemma-4-e2b (lmstudio, {"reasoning_effort":"none"}, the earlier wording E) | 35% | fails |
| google/gemma-4-e4b (lmstudio, {"reasoning_effort":"none"}, the earlier wording E) | 15% | fails |
| qwen3.5-4b-mlx (lmstudio, {"reasoning_effort":"none"}, the earlier wording E) | 60% | fails |
| qwen3.5-2b-mlx (lmstudio, {"reasoning_effort":"none"}, the earlier wording E) | 14% | fails |
| mistralai/ministral-3-3b (lmstudio, the earlier wording E) | 33% | fails |
| openai/gpt-oss-20b (lmstudio, the earlier wording E) | 70% | fails |
| google/gemma-4-26b-a4b (lmstudio, the earlier wording E) | 86% | passes |
| haiku (claudecode, the earlier wording E) | 98% | passes |

## Gemma 4 E2B q4f16 in Jean’s runtime (brain-worker.js, headless Chromium, WebGPU), 2026-10-21

Right on 44% of 80 tables (4 languages, 20 requests): under the gate of 80%.

| Language | Called table_create | Taken | Columns found | Of a kind that works | Steps | Right at once | Right |
|---|---:|---:|---:|---:|---:|---:|---:|
| en | 100% | 80% | 93% | 98% | 80% | 55% | **55%** |
| fr | 95% | 70% | 90% | 100% | 100% | 45% | **45%** |
| ar | 95% | 75% | 88% | 98% | 50% | 35% | **35%** |
| ja | 80% | 60% | 90% | 100% | 33% | 40% | **40%** |
| **All** | 93% | 71% | 90% | 99% | 69% | 44% | **44%** |

| Request | en | fr | ar | ja | Commonest misses |
|---|---:|---:|---:|---:|---|
| appointments | 0/1 | 1/1 | 1/1 | 1/1 | Status: list a status column's steps, at least two, in order. (1) |
| books | 0/1 | 0/1 | 0/1 | 0/1 | no author (1); no auteur (1); no المؤلف (1) |
| car | 1/1 | 1/1 | 0/1 | 1/1 | Give the table a name. (1) |
| expenses | 1/1 | 0/1 | 0/1 | 0/1 | no catégorie (1); no مسترد (1); no table (1) |
| films | 0/1 | 1/1 | 0/1 | 0/1 | Give the table a name. (1); حالة المشاهدة: steps للمشاهدة (1); no table (1) |
| flats | 0/1 | 0/1 | 0/1 | 1/1 | no rent (1); no loyer (1); no الإيجار (1) |
| gifts | 1/1 | 1/1 | 1/1 | 1/1 | — |
| guests | 1/1 | 1/1 | 0/1 | 0/1 | حالة الرد: list a status column's steps, at least two, in order. (1); 返信の有無: steps 出席, 欠席 (1) |
| homework | 0/1 | 1/1 | 0/1 | 0/1 | Week 2 Status: status (1); no سلم (1); Give the table a name. (1) |
| invoices | 1/1 | 1/1 | 0/1 | 1/1 | حالة الدفع: steps مرسلة (1) |
| jobs | 1/1 | 0/1 | 0/1 | 0/1 | Statut: list a status column's steps, at least two, in order. (1); حالة الطلب: list a status column's steps, at least two, in order. (1); no table (1) |
| leads | 0/1 | 0/1 | 0/1 | 0/1 | no phone (1); Follow-up Needed: steps quote sent, won (1); no téléphone (1) |
| loans | 1/1 | 0/1 | 0/1 | 1/1 | Statut: list a status column's steps, at least two, in order. (1); no الشخص (1); ملاحظات الإرجاع: text (1) |
| medicines | 0/1 | 0/1 | 1/1 | 0/1 | Status: list a status column's steps, at least two, in order. (1); Statut: list a status column's steps, at least two, in order. (1); 服用状況: list a status column's steps, at least two, in order. (1) |
| runs | 0/1 | 0/1 | 0/1 | 1/1 | no date (2); الشعور: list a status column's steps, at least two, in order. (1) |
| stock | 1/1 | 1/1 | 1/1 | 1/1 | — |
| subscriptions | 1/1 | 0/1 | 0/1 | 0/1 | no table (3) |
| tasks | 0/1 | 0/1 | 1/1 | 0/1 | Status: list a status column's steps, at least two, in order. (1); Statut: list a status column's steps, at least two, in order. (1); 状況: list a status column's steps, at least two, in order. (1) |
| training | 1/1 | 1/1 | 1/1 | 0/1 | 修了状況: list a status column's steps, at least two, in order. (1) |
| volunteers | 1/1 | 0/1 | 1/1 | 0/1 | Statut: list a status column's steps, at least two, in order. (1); no 担当 (1) |

## Gemma 4 E2B, 8-bit decoder and q4f16 embeddings, in Jean’s runtime (headless Chromium, WebGPU), 2026-10-21

Right on 45% of 80 tables (4 languages, 20 requests): under the gate of 80%.

| Language | Called table_create | Taken | Columns found | Of a kind that works | Steps | Right at once | Right |
|---|---:|---:|---:|---:|---:|---:|---:|
| en | 100% | 75% | 90% | 100% | 100% | 50% | **50%** |
| fr | 90% | 65% | 87% | 97% | 100% | 30% | **30%** |
| ar | 95% | 75% | 90% | 100% | 100% | 55% | **55%** |
| ja | 95% | 60% | 92% | 100% | 67% | 45% | **45%** |
| **All** | 95% | 69% | 90% | 99% | 94% | 45% | **45%** |

| Request | en | fr | ar | ja | Commonest misses |
|---|---:|---:|---:|---:|---|
| appointments | 0/1 | 1/1 | 1/1 | 0/1 | Status: list a status column's steps, at least two, in order. (1); no table (1) |
| books | 0/1 | 0/1 | 0/1 | 0/1 | no author (1); no auteur (1); no المؤلف (1) |
| car | 1/1 | 1/1 | 1/1 | 1/1 | — |
| expenses | 0/1 | 0/1 | 0/1 | 0/1 | no reimbursed (1); no remboursé (1); no مسترد (1) |
| films | 0/1 | 0/1 | 1/1 | 0/1 | no note (2); no table (1) |
| flats | 1/1 | 1/1 | 1/1 | 1/1 | — |
| gifts | 1/1 | 1/1 | 1/1 | 1/1 | — |
| guests | 1/1 | 0/1 | 0/1 | 0/1 | A répondu?: checkbox (1); حالة الرد: list a status column's steps, at least two, in order. (1); 返信の有無: steps 出席, 欠席 (1) |
| homework | 1/1 | 0/1 | 0/1 | 1/1 | no rendu (1); الأسبوع 1 - الواجب: list a status column's steps, at least two, in order. (1) |
| invoices | 1/1 | 1/1 | 1/1 | 0/1 | no table (1) |
| jobs | 0/1 | 0/1 | 1/1 | 1/1 | Application Status: list a status column's steps, at least two, in order. (1); Statut: list a status column's steps, at least two, in order. (1) |
| leads | 0/1 | 0/1 | 0/1 | 1/1 | no phone (1); no téléphone (1); حالة العرض: list a status column's steps, at least two, in order. (1) |
| loans | 0/1 | 0/1 | 0/1 | 1/1 | Status: list a status column's steps, at least two, in order. (1); Statut: list a status column's steps, at least two, in order. (1); no الشخص (1) |
| medicines | 1/1 | 0/1 | 1/1 | 1/1 | Statut: list a status column's steps, at least two, in order. (1) |
| runs | 0/1 | 0/1 | 0/1 | 0/1 | no date (2); no التاريخ (1); no table (1) |
| stock | 1/1 | 0/1 | 1/1 | 1/1 | no table (1) |
| subscriptions | 1/1 | 0/1 | 0/1 | 0/1 | no table (3) |
| tasks | 0/1 | 0/1 | 0/1 | 0/1 | Status: list a status column's steps, at least two, in order. (1); Statut: list a status column's steps, at least two, in order. (1); الحالة: list a status column's steps, at least two, in order. (1) |
| training | 0/1 | 0/1 | 1/1 | 0/1 | Status: list a status column's steps, at least two, in order. (1); Statut: list a status column's steps, at least two, in order. (1); ステータス: list a status column's steps, at least two, in order. (1) |
| volunteers | 1/1 | 1/1 | 1/1 | 0/1 | no 名前 (1) |

## gemma-4-e2b-it-mlx@8bit (lmstudio, {"reasoning_effort":"none"}, held to what Jean takes), 2026-10-21

Right on 80% of 320 tables (4 languages, 20 requests, 4 runs each): over the gate of 80%.

| Language | Called table_create | Taken | Columns found | Of a kind that works | Steps | Right at once | Right |
|---|---:|---:|---:|---:|---:|---:|---:|
| en | 100% | 100% | 97% | 98% | 100% | 85% | **85%** |
| fr | 100% | 100% | 98% | 98% | 100% | 88% | **88%** |
| ar | 100% | 100% | 94% | 100% | 79% | 74% | **74%** |
| ja | 100% | 100% | 91% | 98% | 100% | 75% | **75%** |
| **All** | 100% | 100% | 95% | 99% | 94% | 80% | **80%** |

| Request | en | fr | ar | ja | Commonest misses |
|---|---:|---:|---:|---:|---|
| appointments | 4/4 | 4/4 | 4/4 | 4/4 | — |
| books | 0/4 | 0/4 | 0/4 | 0/4 | no author (4); no auteur (4); no المؤلف (4) |
| car | 4/4 | 4/4 | 4/4 | 4/4 | — |
| expenses | 0/4 | 4/4 | 2/4 | 0/4 | no reimbursed (4); no カテゴリ (4); no 精算 (4) |
| films | 4/4 | 4/4 | 4/4 | 0/4 | no ステータス (4) |
| flats | 4/4 | 4/4 | 4/4 | 4/4 | — |
| gifts | 4/4 | 4/4 | 4/4 | 4/4 | — |
| guests | 4/4 | 0/4 | 0/4 | 0/4 | Date de réponse: date (4); حالة الرد: steps سيحضر, لن يحضر (4); 返信の有無: checkbox (4) |
| homework | 0/4 | 3/4 | 1/4 | 4/4 | Total Submitted: number (4); no سلم (3); Total rendus: number (1) |
| invoices | 4/4 | 4/4 | 4/4 | 4/4 | — |
| jobs | 4/4 | 4/4 | 3/4 | 4/4 | حالة الطلب: steps مقابلة, عرض (1) |
| leads | 4/4 | 4/4 | 0/4 | 4/4 | no الهاتف (4) |
| loans | 4/4 | 4/4 | 1/4 | 4/4 | no الشخص (2); no أعيد (2) |
| medicines | 4/4 | 4/4 | 4/4 | 4/4 | — |
| runs | 4/4 | 4/4 | 4/4 | 4/4 | — |
| stock | 4/4 | 4/4 | 4/4 | 4/4 | — |
| subscriptions | 4/4 | 4/4 | 4/4 | 4/4 | — |
| tasks | 4/4 | 3/4 | 4/4 | 4/4 | no tâche (1) |
| training | 4/4 | 4/4 | 4/4 | 4/4 | — |
| volunteers | 4/4 | 4/4 | 4/4 | 0/4 | no 担当 (4) |

## gemma-4-e2b-it-mlx@8bit (lmstudio, {"reasoning_effort":"none"}), 2026-10-21

Right on 42% of 160 tables (4 languages, 20 requests, 2 runs each): under the gate of 80%. 26 calls were read from Gemma's syntax in the text, as Jean's device runtime reads them.

| Language | Called table_create | Taken | Columns found | Of a kind that works | Steps | Right at once | Right |
|---|---:|---:|---:|---:|---:|---:|---:|
| en | 100% | 68% | 89% | 100% | 100% | 43% | **43%** |
| fr | 90% | 60% | 88% | 97% | 100% | 30% | **30%** |
| ar | 95% | 83% | 89% | 100% | 78% | 53% | **53%** |
| ja | 85% | 68% | 87% | 100% | 50% | 43% | **43%** |
| **All** | 93% | 69% | 88% | 99% | 87% | 42% | **42%** |

| Request | en | fr | ar | ja | Commonest misses |
|---|---:|---:|---:|---:|---|
| appointments | 0/2 | 0/2 | 2/2 | 0/2 | Status: list a status column's steps, at least two, in order. (2); Statut: list a status column's steps, at least two, in order. (2); no table (2) |
| books | 0/2 | 0/2 | 0/2 | 0/2 | no author (2); no auteur (2); no المؤلف (2) |
| car | 2/2 | 2/2 | 2/2 | 2/2 | — |
| expenses | 0/2 | 0/2 | 0/2 | 0/2 | no reimbursed (2); no remboursé (2); no مسترد (2) |
| films | 0/2 | 1/2 | 2/2 | 0/2 | no note (3); no ステータス (2) |
| flats | 2/2 | 2/2 | 2/2 | 2/2 | — |
| gifts | 2/2 | 2/2 | 2/2 | 2/2 | — |
| guests | 2/2 | 0/2 | 1/2 | 0/2 | A répondu ?: checkbox (2); 返信の有無: steps 出席, 欠席 (2); حالة الرد: list a status column's steps, at least two, in order. (1) |
| homework | 2/2 | 2/2 | 0/2 | 2/2 | no سلم (2) |
| invoices | 2/2 | 2/2 | 1/2 | 2/2 | حالة الدفع: steps مرسلة (1) |
| jobs | 0/2 | 0/2 | 1/2 | 0/2 | Application Status: list a status column's steps, at least two, in order. (2); Statut: list a status column's steps, at least two, in order. (2); no table (2) |
| leads | 0/2 | 0/2 | 0/2 | 0/2 | no phone (2); no téléphone (2); no الهاتف (1) |
| loans | 0/2 | 0/2 | 0/2 | 2/2 | Status: list a status column's steps, at least two, in order. (2); Statut: list a status column's steps, at least two, in order. (2); no الشخص (2) |
| medicines | 0/2 | 0/2 | 2/2 | 2/2 | Status: list a status column's steps, at least two, in order. (2); Statut du renouvellement: list a status column's steps, at least two, in order. (2) |
| runs | 0/2 | 1/2 | 0/2 | 2/2 | no date (3); no التاريخ (2) |
| stock | 2/2 | 0/2 | 2/2 | 1/2 | no table (2); 現在の在庫状況: list a status column's steps, at least two, in order. (1) |
| subscriptions | 1/2 | 0/2 | 0/2 | 0/2 | no table (6); Cancel Status: "select","options":["Active","Paused","Cancelled"]" isn't a kind of column. Use one of text, number, select, multi-select, status, date, checkbox, link, email, phone, person, place, files. (1) |
| tasks | 0/2 | 0/2 | 0/2 | 0/2 | Status: list a status column's steps, at least two, in order. (2); Statut: list a status column's steps, at least two, in order. (2); الحالة: list a status column's steps, at least two, in order. (2) |
| training | 0/2 | 0/2 | 2/2 | 0/2 | Status: list a status column's steps, at least two, in order. (2); no terminé (2); ステータス: list a status column's steps, at least two, in order. (2) |
| volunteers | 2/2 | 0/2 | 2/2 | 0/2 | Statut: list a status column's steps, at least two, in order. (2); no 名前 (2) |

## google/gemma-4-e2b:2 (lmstudio, {"reasoning_effort":"none"}, held to what Jean takes), 2026-10-21

Right on 71% of 160 tables (4 languages, 20 requests, 2 runs each): under the gate of 80%.

| Language | Called table_create | Taken | Columns found | Of a kind that works | Steps | Right at once | Right |
|---|---:|---:|---:|---:|---:|---:|---:|
| en | 100% | 100% | 96% | 99% | 100% | 83% | **83%** |
| fr | 100% | 100% | 93% | 99% | 100% | 75% | **75%** |
| ar | 100% | 100% | 91% | 98% | 60% | 65% | **65%** |
| ja | 100% | 100% | 85% | 98% | 100% | 63% | **63%** |
| **All** | 100% | 100% | 91% | 99% | 89% | 71% | **71%** |

| Request | en | fr | ar | ja | Commonest misses |
|---|---:|---:|---:|---:|---|
| appointments | 2/2 | 2/2 | 2/2 | 2/2 | — |
| books | 0/2 | 0/2 | 0/2 | 0/2 | no author (2); no auteur (2); no المؤلف (2) |
| car | 2/2 | 2/2 | 2/2 | 2/2 | — |
| expenses | 2/2 | 0/2 | 0/2 | 0/2 | no catégorie (2); no الفئة (2); no カテゴリ (2) |
| films | 1/2 | 2/2 | 2/2 | 0/2 | no ステータス (2); no note (1) |
| flats | 0/2 | 2/2 | 0/2 | 2/2 | no rent (2); no الإيجار (2) |
| gifts | 2/2 | 2/2 | 2/2 | 2/2 | — |
| guests | 1/2 | 1/2 | 0/2 | 0/2 | RSVP Received: checkbox (1); Répondu: checkbox (1); تأكيد الحضور: checkbox (1) |
| homework | 2/2 | 2/2 | 1/2 | 2/2 | no سلم (1) |
| invoices | 1/2 | 2/2 | 1/2 | 2/2 | no date (1); حالة الدفع: steps مرسلة (1) |
| jobs | 2/2 | 1/2 | 2/2 | 2/2 | no poste (1) |
| leads | 2/2 | 1/2 | 1/2 | 0/2 | no téléphone (1); no الهاتف (1); حالة العرض: steps تم إرسال العرض, مقبول (1) |
| loans | 2/2 | 1/2 | 1/2 | 2/2 | no rendu (1); no الشخص (1); no أعيد (1) |
| medicines | 2/2 | 2/2 | 2/2 | 2/2 | — |
| runs | 2/2 | 2/2 | 2/2 | 2/2 | — |
| stock | 2/2 | 2/2 | 2/2 | 1/2 | no 商品 (1) |
| subscriptions | 2/2 | 1/2 | 2/2 | 2/2 | no prix (1) |
| tasks | 2/2 | 1/2 | 2/2 | 0/2 | no タスク (2); no tâche (1) |
| training | 2/2 | 2/2 | 1/2 | 2/2 | no مكتمل (1) |
| volunteers | 2/2 | 2/2 | 1/2 | 0/2 | no 担当 (2); التوفر (نعم/لا): checkbox (1); no 空き (1) |

## google/gemma-4-e2b:2 (lmstudio, {"reasoning_effort":"none"}), 2026-10-21

Right on 36% of 160 tables (4 languages, 20 requests, 2 runs each): under the gate of 80%. 16 calls were read from Gemma's syntax in the text, as Jean's device runtime reads them.

| Language | Called table_create | Taken | Columns found | Of a kind that works | Steps | Right at once | Right |
|---|---:|---:|---:|---:|---:|---:|---:|
| en | 100% | 85% | 89% | 99% | 67% | 57% | **57%** |
| fr | 48% | 40% | 89% | 100% | 75% | 25% | **25%** |
| ar | 70% | 57% | 88% | 100% | 71% | 33% | **33%** |
| ja | 65% | 48% | 88% | 100% | 25% | 30% | **30%** |
| **All** | 71% | 57% | 89% | 100% | 62% | 36% | **36%** |

| Request | en | fr | ar | ja | Commonest misses |
|---|---:|---:|---:|---:|---|
| appointments | 2/2 | 0/2 | 0/2 | 0/2 | no table (5); اسم المريض: "undefined" isn't a kind of column. Use one of text, number, select, multi-select, status, date, checkbox, link, email, phone, person, place, files. (1) |
| books | 0/2 | 0/2 | 0/2 | 0/2 | no author (2); no status (2); no auteur (2) |
| car | 2/2 | 2/2 | 2/2 | 0/2 | no table (1); 車の名前: "undefined" isn't a kind of column. Use one of text, number, select, multi-select, status, date, checkbox, link, email, phone, person, place, files. (1) |
| expenses | 0/2 | 0/2 | 0/2 | 0/2 | no table (6); no reimbursed (2) |
| films | 1/2 | 0/2 | 1/2 | 0/2 | no table (2); no note (1); Vu?: steps à voir, vu (1) |
| flats | 0/2 | 2/2 | 1/2 | 0/2 | no rent (2); no الإيجار (1); no table (1) |
| gifts | 2/2 | 2/2 | 1/2 | 2/2 | no table (1) |
| guests | 1/2 | 0/2 | 0/2 | 0/2 | no table (2); الحالة: list a status column's steps, at least two, in order. (2); 返信の有無: steps 未回答, 出席, 欠席 (2) |
| homework | 2/2 | 1/2 | 1/2 | 2/2 | no rendu (1); no سلم (1) |
| invoices | 1/2 | 1/2 | 1/2 | 1/2 | Payment Status: list a status column's steps, at least two, in order. (1); no table (1); حالة الدفع: steps مرسلة (1) |
| jobs | 0/2 | 0/2 | 0/2 | 0/2 | no table (6); Status: list a status column's steps, at least two, in order. (1); Application Name: "undefined" isn't a kind of column. Use one of text, number, select, multi-select, status, date, checkbox, link, email, phone, person, place, files. (1) |
| leads | 0/2 | 0/2 | 0/2 | 0/2 | no table (3); no phone (2); Status: steps won, lost (1) |
| loans | 1/2 | 0/2 | 0/2 | 2/2 | no table (2); Item Lent: "undefined" isn't a kind of column. Use one of text, number, select, multi-select, status, date, checkbox, link, email, phone, person, place, files. (1); no rendu (1) |
| medicines | 2/2 | 0/2 | 2/2 | 1/2 | no table (2); 服薬状況: list a status column's steps, at least two, in order. (1) |
| runs | 1/2 | 2/2 | 0/2 | 2/2 | no date (1); no التاريخ (1); الشعور: list a status column's steps, at least two, in order. (1) |
| stock | 2/2 | 0/2 | 2/2 | 2/2 | no table (2) |
| subscriptions | 2/2 | 0/2 | 0/2 | 0/2 | no table (6) |
| tasks | 1/2 | 0/2 | 0/2 | 0/2 | no table (4); Status: list a status column's steps, at least two, in order. (1); 完了状況: list a status column's steps, at least two, in order. (1) |
| training | 1/2 | 0/2 | 2/2 | 0/2 | 修了状況: list a status column's steps, at least two, in order. (2); Status: list a status column's steps, at least two, in order. (1); no table (1) |
| volunteers | 2/2 | 0/2 | 0/2 | 0/2 | no table (2); no المهمة (2); no 空き (2) |

## google/gemma-4-e2b:2 (lmstudio, {"reasoning_effort":"none"}, held to what Jean takes, the earlier wording E), 2026-10-21

Right on 59% of 160 tables (4 languages, 20 requests, 2 runs each): under the gate of 80%.

| Language | Called table_create | Taken | Columns found | Of a kind that works | Steps | Right at once | Right |
|---|---:|---:|---:|---:|---:|---:|---:|
| en | 100% | 100% | 92% | 97% | 75% | 68% | **68%** |
| fr | 100% | 100% | 83% | 98% | 88% | 60% | **60%** |
| ar | 100% | 100% | 88% | 100% | 91% | 57% | **57%** |
| ja | 100% | 98% | 73% | 97% | 67% | 50% | **50%** |
| **All** | 100% | 99% | 84% | 98% | 82% | 59% | **59%** |

| Request | en | fr | ar | ja | Commonest misses |
|---|---:|---:|---:|---:|---|
| appointments | 2/2 | 2/2 | 2/2 | 1/2 | no 医師 (1) |
| books | 0/2 | 0/2 | 0/2 | 0/2 | no author (2); no status (2); no auteur (2) |
| expenses | 2/2 | 0/2 | 0/2 | 0/2 | no remboursé (2); no مسترد (2); no montant (1) |
| flats | 0/2 | 2/2 | 0/2 | 2/2 | no rent (2); no الإيجار (2) |
| guests | 0/2 | 1/2 | 2/2 | 0/2 | RSVP Received: checkbox (2); Réponse: checkbox (1); 返信有無: checkbox (1) |
| homework | 2/2 | 2/2 | 2/2 | 2/2 | — |
| invoices | 2/2 | 1/2 | 1/2 | 2/2 | no client (1); no montant (1); no payée (1) |
| jobs | 0/2 | 1/2 | 1/2 | 2/2 | no position (2); no poste (1); no الوظيفة (1) |
| leads | 0/2 | 1/2 | 0/2 | 0/2 | Contact Method: select (2); Follow-up Status: steps won, lost (2); no 日付 (2) |
| loans | 1/2 | 0/2 | 1/2 | 2/2 | no rendu (2); no returned (1); no التاريخ (1) |
| runs | 0/2 | 0/2 | 0/2 | 1/2 | no date (3); no التاريخ (2); no ressenti (1) |
| stock | 2/2 | 2/2 | 0/2 | 1/2 | no السعر (2); no 商品 (1); no 数量 (1) |
| subscriptions | 2/2 | 2/2 | 2/2 | 1/2 | no サービス (1); no 料金 (1); no 更新日 (1) |
| tasks | 2/2 | 1/2 | 2/2 | 2/2 | no tâche (1); no qui (1); no statut (1) |
| car | 2/2 | 1/2 | 2/2 | 0/2 | no 費用 (2); no coût (1); no 内容 (1) |
| films | 2/2 | 2/2 | 0/2 | 0/2 | no ملاحظة (2); no ステータス (2) |
| gifts | 2/2 | 1/2 | 2/2 | 0/2 | no 誰 (2); no プレゼント (2); no 価格 (2) |
| medicines | 2/2 | 2/2 | 2/2 | 2/2 | — |
| training | 2/2 | 1/2 | 2/2 | 2/2 | Formation: status (1); no terminé (1) |
| volunteers | 2/2 | 2/2 | 2/2 | 0/2 | no 担当 (2); 参加の意思: checkbox (2) |

## google/gemma-4-e2b:2 (lmstudio, {"reasoning_effort":"none"}, the earlier wording E), 2026-10-21

Right on 15% of 112 tables (4 languages, 14 requests, 2 runs each): under the gate of 80%. 8 calls were read from Gemma's syntax in the text, as Jean's device runtime reads them.

| Language | Called table_create | Taken | Columns found | Of a kind that works | Steps | Right at once | Right |
|---|---:|---:|---:|---:|---:|---:|---:|
| en | 96% | 75% | 85% | 97% | 83% | 29% | **29%** |
| fr | 46% | 36% | 73% | 100% | 100% | 7% | **7%** |
| ar | 68% | 57% | 70% | 98% | 67% | 11% | **11%** |
| ja | 46% | 46% | 59% | 96% | 100% | 14% | **14%** |
| **All** | 64% | 54% | 74% | 97% | 80% | 15% | **15%** |

| Request | en | fr | ar | ja | Commonest misses |
|---|---:|---:|---:|---:|---|
| appointments | 2/2 | 1/2 | 0/2 | 0/2 | no table (4); no médecin (1) |
| books | 0/2 | 0/2 | 0/2 | 0/2 | Finished: "checkbox for yes or no" isn't a kind of column. Use one of text, number, select, multi-select, status, date, checkbox, link, email, phone, person, place, files. (2); no auteur (2); no المؤلف (2) |
| expenses | 0/2 | 0/2 | 0/2 | 0/2 | no table (4); no reimbursed (2); no الفئة (2) |
| flats | 0/2 | 1/2 | 0/2 | 0/2 | no rent (2); no الإيجار (2); no table (2) |
| guests | 0/2 | 0/2 | 2/2 | 1/2 | RSVP Received: checkbox (2); no table (2); 返信有無: checkbox (1) |
| homework | 0/2 | 0/2 | 0/2 | 2/2 | Week 1 Handed In: "checkbox for yes or no" isn't a kind of column. Use one of text, number, select, multi-select, status, date, checkbox, link, email, phone, person, place, files. (1); Week 1 Handed In?: "checkbox for yes or no" isn't a kind of column. Use one of text, number, select, multi-select, status, date, checkbox, link, email, phone, person, place, files. (1); Semaine 1: "checkbox for yes or no" isn't a kind of column. Use one of text, number, select, multi-select, status, date, checkbox, link, email, phone, person, place, files. (1) |
| invoices | 0/2 | 0/2 | 0/2 | 0/2 | no amount (2); no montant (2); no payée (2) |
| jobs | 0/2 | 0/2 | 0/2 | 0/2 | no table (6); no position (2) |
| leads | 1/2 | 0/2 | 0/2 | 0/2 | no table (4); no phone (1); Follow-up Status: steps won, lost (1) |
| loans | 2/2 | 0/2 | 0/2 | 0/2 | no table (3); no qui (1); تم الإعارة (نعم/لا): checkbox (1) |
| runs | 0/2 | 0/2 | 0/2 | 0/2 | no date (3); no التاريخ (2); no 日付 (2) |
| stock | 1/2 | 0/2 | 0/2 | 0/2 | no table (4); no 商品 (2); no 数量 (2) |
| subscriptions | 2/2 | 0/2 | 0/2 | 0/2 | no table (6) |
| tasks | 0/2 | 0/2 | 1/2 | 1/2 | no table (3); Status: list a status column's steps, at least two, in order. (2); no タスク (1) |

## google/gemma-4-e2b (lmstudio, {"reasoning_effort":"none"}, the earlier wording E), 2026-10-21

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

## google/gemma-4-e4b (lmstudio, {"reasoning_effort":"none"}, the earlier wording E), 2026-10-21

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

## qwen3.5-4b-mlx (lmstudio, {"reasoning_effort":"none"}, the earlier wording E), 2026-10-21

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

## qwen3.5-2b-mlx (lmstudio, {"reasoning_effort":"none"}, the earlier wording E), 2026-10-21

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

## mistralai/ministral-3-3b (lmstudio, the earlier wording E), 2026-10-21

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

## openai/gpt-oss-20b (lmstudio, the earlier wording E), 2026-10-21

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

## google/gemma-4-26b-a4b (lmstudio, the earlier wording E), 2026-10-21

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

## haiku (claudecode, the earlier wording E), 2026-10-21

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
