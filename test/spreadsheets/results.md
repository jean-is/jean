# Spreadsheets: can a sheet be read into a collection by rule?

Written by `node scripts/spreadsheets.js --write` on 2026-11-14. Twenty sheets made by script (test/spreadsheets/make.js), five each in
English, French, Arabic and Japanese, as people keep them, read through cells.js and sheet.js with no brain, each in its region and
with its language's words for yes and no. What a careful person expects of each is in set.js, written before the reader saw any;
twelve were used to improve the reader, eight were held out and read once at the end.

The gate, written before the first run: heads found in 95% of sheets; 90% of columns given the right kind; every cell left out is said; no sheet read wrong without a word.

| Sheets | Heads found (95%) | Columns of the right kind (90%) | Cells left out unsaid (0) | Sheets read wrong without a word (0) | Names | Rows | Values | Foot | Currencies | Expected left out, said | Workbook (sheets, hidden, 1904) | Values checkCell refuses |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| The 12 to improve on | 12/12 (100%) pass | 105/105 (100%) pass | 0 pass | 0 pass | 100% | 12/12 | 100% (0 of 1340 wrong) | 12/12 | 16/16 | 31/31 | 12/12 | 0 |
| The 8 held out | 8/8 (100%) pass | 65/65 (100%) pass | 0 pass | 0 pass | 100% | 8/8 | 100% (0 of 800 wrong) | 8/8 | 9/9 | 15/15 | 8/8 | 0 |
| All 20 | 20/20 (100%) pass | 170/170 (100%) pass | 0 pass | 0 pass | 100% | 20/20 | 100% (0 of 2140 wrong) | 20/20 | 25/25 | 46/46 | 20/20 | 0 |

A column's kind is its type and whether it is money or a share; a column the reader adds counts as wrong. A cell is said when it is
a head, a row's value or the foot, or lies in what the reader says it left out. A sheet is read wrong without a word when a value
isn't what was written, a line that is no row is one, a row or a column is missing or a currency is wrong, and nothing is said of
those cells. Names, rows, values, the foot, currencies, what a careful person expects left out and the workbook's sheets (which
are hidden, where its dates count from) are beside the gate, not in it.

## Each sheet

| Sheet | | Heads | Kinds | Rows | Values wrong | Foot | Dates | Unsaid | Silent | Misses |
|---|---|---|---|---|---|---|---|---|---|---|
| en-budget.xlsx |  | yes | 6/6 | yes | 0 | yes | yes | 0 | 0 | — |
| en-expenses.csv | held out | yes | 7/7 | yes | 0 | yes | yes | 0 | 0 | — |
| en-members.xlsx |  | yes | 11/11 | yes | 0 | yes | yes | 0 | 0 | — |
| en-orders.xlsx |  | yes | 10/10 | yes | 0 | yes | yes | 0 | 0 | — |
| en-jobs.tsv | held out | yes | 10/10 | yes | 0 | yes | yes | 0 | 0 | — |
| fr-budget.xlsx | held out | yes | 5/5 | yes | 0 | yes | yes | 0 | 0 | — |
| fr-expenses.csv |  | yes | 7/7 | yes | 0 | yes | yes | 0 | 0 | — |
| fr-members.xlsx |  | yes | 10/10 | yes | 0 | yes | yes | 0 | 0 | — |
| fr-orders.csv | held out | yes | 12/12 | yes | 0 | yes | yes | 0 | 0 | — |
| fr-jobs.xlsx |  | yes | 11/11 | yes | 0 | yes | yes | 0 | 0 | — |
| ar-budget.xlsx |  | yes | 5/5 | yes | 0 | yes | yes | 0 | 0 | — |
| ar-expenses.csv | held out | yes | 6/6 | yes | 0 | yes | yes | 0 | 0 | — |
| ar-members.xlsx | held out | yes | 8/8 | yes | 0 | yes | yes | 0 | 0 | — |
| ar-orders.xlsx |  | yes | 11/11 | yes | 0 | yes | yes | 0 | 0 | — |
| ar-jobs.csv |  | yes | 9/9 | yes | 0 | yes | yes | 0 | 0 | — |
| ja-budget.xlsx | held out | yes | 5/5 | yes | 0 | yes | yes | 0 | 0 | — |
| ja-expenses.xlsx |  | yes | 7/7 | yes | 0 | yes | yes | 0 | 0 | — |
| ja-members.xlsx |  | yes | 8/8 | yes | 0 | yes | yes | 0 | 0 | — |
| ja-orders.xlsx | held out | yes | 12/12 | yes | 0 | yes | yes | 0 | 0 | — |
| ja-jobs.txt |  | yes | 10/10 | yes | 0 | yes | yes | 0 | 0 | — |

## Speed

| 10,000 rows by 12 columns | Size | Cells (cells.js) | Read (sheet.js) | Heads | Kinds | Values wrong | Unsaid | Misses |
|---|---|---|---|---|---|---|---|---|
| speed.xlsx | 656 KB | 56 ms | 129 ms | yes | 12/12 | 0 of 120000 | 0 | — |
| speed.csv | 1082 KB | 19 ms | 200 ms | yes | 12/12 | 0 of 120000 | 0 | — |

The middle of five readings on this computer, the file's bytes already in memory.

## Real files, as read

What Numbers exported from documents made in it here (.cache/real/, not committed), each read from its language's region. Nothing
was expected of them in writing beforehand, so they give no figure: they are what the reader's rules were also improved on.

| File | Sheet read | Heads on line | Rows | Columns | Foot | Left out |
|---|---|---|---|---|---|---|
| numbers-ar-expenses.csv | numbers-ar-expenses | 1 | 6 | التاريخ: date · البيان: text · الفئة: text · المبلغ: money EUR · نسبة الخصم: percent · يوجد إيصال: checkbox | 13707.5 | total A8:F8 |
| numbers-ar-expenses.xlsx | Sheet 1 - مصروفات الجمعية | 2 | 6 | التاريخ: date · البيان: text · الفئة: text · المبلغ: money EUR · نسبة الخصم: percent · يوجد إيصال: checkbox | 13707.5 | total A9:F9; above A1:F1 |
| numbers-fr-budget.csv | numbers-fr-budget | 1 | 6 | Poste: text · Catégorie: select · Prévu: money EUR · Réalisé: money EUR · Écart: money EUR | 11020 · 11370.4 · 350.4 | total A8:E8 |
| numbers-fr-budget.xlsx | Sheet 1 - Budget 2026 — Les Jar | 2 | 6 | Poste: text · Catégorie: select · Prévu: money EUR · Réalisé: money EUR · Écart: money EUR | 11020 · 11370.4 · 350.4 | total A9:E9; above A1:E1 |
| numbers-fr-two-tables-csv/Sheet 1-Dépenses.csv | Sheet 1-Dépenses | 1 | 4 | Poste: text · Montant: money EUR · Payé: checkbox | — | — |
| numbers-fr-two-tables-csv/Sheet 1-Recettes.csv | Sheet 1-Recettes | 2 | 4 | Poste: text · Prévu: money EUR · Budget 2026 Réalisé: money EUR · Rappel 2025 Réalisé: money EUR · Reçu le: date | 7000 · 7637.5 · 6900 | total A7:E7; above A1:E1 |
| numbers-fr-two-tables.xlsx | Sheet 1 - Recettes, of 3 | 3 | 4 | Poste: text · Prévu: money EUR · Budget 2026 Réalisé: money EUR · Rappel 2025 Réalisé: money EUR · Reçu le: date | 7000 · 7637.5 · 6900 | total A8:E8; above A1:E2 |
| numbers-ja-members.csv | numbers-ja-members | 1 | 6 | 氏名: text · フリガナ: text · メール: email · 電話: phone · 入会日: date · 年会費: number · 納入済: checkbox | — | — |
| numbers-ja-members.xlsx | Sheet 1 - 会員名簿 | 2 | 6 | 氏名: text · フリガナ: text · メール: email · 電話: phone · 入会日: date · 年会費: number · 納入済: checkbox | — | above A1:G1 |


## The real sheets, by the rules alone

Sixteen public workbooks (34 sheets, public.js and public.md) and thirteen held out (14 sheets, held.js and held.md), each
expected by someone who did not write the reader. Round two's rules were made on the 34; the 14 were read once by round two's
frozen reader (held.md: 6 read wrong without a word) and are development material since. Round three added two rules (codes of
13 digits or more stay text; 総数 is a word for total); these figures are on sheets the rules were made or mended on.

| Sheets | Heads found (95%) | Columns of the right kind (90%) | Cells left out unsaid (0) | Sheets read wrong without a word (0) | Names | Rows | Values | Foot | Currencies | Expected left out, said | Workbook (sheets, hidden, 1904) | Values checkCell refuses |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Real, French (5) | 5/5 (100%) pass | 29/29 (100%) pass | 0 pass | 0 pass | 106.9% | 5/5 | 100% (0 of 1708 wrong) | 5/5 | 0/0 | 10/10 | 5/5 | 0 |
| Real, Japanese (6) | 6/6 (100%) pass | 41/41 (100%) pass | 0 pass | 0 pass | 100% | 6/6 | 100% (0 of 703 wrong) | 6/6 | 0/0 | 18/18 | 6/6 | 0 |
| Real, Arabic (4) | 4/4 (100%) pass | 31/31 (100%) pass | 0 pass | 0 pass | 100% | 4/4 | 100% (0 of 965 wrong) | 4/4 | 0/0 | 24/24 | 4/4 | 0 |
| Real, English (19) | 19/19 (100%) pass | 224/224 (100%) pass | 0 pass | 0 pass | 99.6% | 19/19 | 100% (0 of 3848 wrong) | 15/19 | 0/0 | 109/109 | 19/19 | 0 |
| All 34 real | 34/34 (100%) pass | 325/325 (100%) pass | 0 pass | 0 pass | 100.3% | 34/34 | 100% (0 of 7224 wrong) | 30/34 | 0/0 | 161/161 | 34/34 | 0 |
| The 33 real tables (no label/value sheet) | 33/33 (100%) pass | 325/325 (100%) pass | 0 pass | 0 pass | 100.3% | 33/33 | 100% (0 of 7224 wrong) | 29/33 | 0/0 | 161/161 | 33/33 | 0 |
| Real, without the nine Townsville statements (25) | 25/25 (100%) pass | 261/261 (100%) pass | 0 pass | 0 pass | 101.5% | 25/25 | 100% (0 of 6405 wrong) | 25/25 | 0/0 | 78/78 | 25/25 | 0 |
| The 20 scripted | 20/20 (100%) pass | 170/170 (100%) pass | 0 pass | 0 pass | 100% | 20/20 | 100% (0 of 2140 wrong) | 20/20 | 25/25 | 46/46 | 20/20 | 0 |
| Real and scripted (54) | 54/54 (100%) pass | 495/495 (100%) pass | 0 pass | 0 pass | 100.2% | 54/54 | 100% (0 of 9364 wrong) | 50/54 | 25/25 | 207/207 | 54/54 | 0 |
| The 14 held, round three's rules alone | 13/14 (92.9%) MISS | 110/111 (99.1%) pass | 0 pass | 4 MISS | 119.8% | 11/14 | 99.9% (13 of 13632 wrong) | 14/14 | 0/0 | 22/26 | 14/14 | 0 |

What each public sheet is read as. A report is a sheet with parts, subtotals or a total: its rows are its line items, and every
part's name, subtotal and total is said, by kind and line, before anything is kept.

| Sheet | Read as | Parts | Subtotals | Total (the foot) | Records joined |
|---|---|---:|---:|---|---:|
| fr-bar-le-duc · Balance_Budgetaire_parametree_4 | no table | 0 | 0 | — | 0 |
| fr-wambrechies · Table 1 | report | 0 | 18 | line 58 | 0 |
| fr-lorient · BP 2019 Subv Inv | list | 0 | 0 | — | 0 |
| fr-lorient · BP 2019 Subv Fonct | list | 0 | 0 | — | 0 |
| fr-pont-l-abbe · fr-pont-l-abbe | list | 0 | 0 | — | 0 |
| ja-kuwana · R6 | report | 0 | 2 | line 17 | 2 |
| ja-kuwana · R7 | report | 0 | 2 | line 17 | 2 |
| ja-kuwana · R8 | report | 0 | 2 | line 17 | 2 |
| ja-miyakonojo · 都城市の歳入歳出決算 | list | 0 | 0 | — | 0 |
| ja-seika · 1 | report | 0 | 0 | line 15 | 0 |
| ja-kameoka · ja-kameoka | list | 0 | 0 | — | 0 |
| ar-ait-melloul-spending · مصاريف التجهيز | report | 5 | 4 | line 40 | 0 |
| ar-ait-melloul-income · مداخيل التسيير | report | 2 | 6 | line 71 | 0 |
| ar-ajman · موازنة النفقات والايرادات | list | 0 | 0 | — | 0 |
| ar-saudi-councils · المجالس البلدية 2021 | report | 0 | 0 | line 20 | 0 |
| en-calderdale · Parking account 2018_19 2024_25 | report | 0 | 4 | line 16 | 0 |
| en-cheltenham · Sheet1 | report | 0 | 0 | line 46 | 0 |
| en-barnet · Table 1 Loans | report | 0 | 2 | line 28 | 0 |
| en-barnet · Table 2 Stock | report | 0 | 0 | line 26 | 0 |
| en-barnet · Table 3 Additions | report | 0 | 0 | line 22 | 0 |
| en-barnet · Table 4 Deletions | report | 0 | 0 | line 24 | 0 |
| en-barnet · Table 5 Reservations | report | 0 | 0 | line 19 | 0 |
| en-barnet · Table 6 Borrowers | report | 0 | 1 | line 25 | 0 |
| en-townsville · Table 1 | report | 3 | 7 | — | 0 |
| en-townsville · Table 2 | report | 5 | 8 | — | 0 |
| en-townsville · Table 3 | report | 3 | 4 | line 27 | 0 |
| en-townsville · Table 4 | report | 2 | 2 | line 15 | 0 |
| en-townsville · Table 5 | list | 0 | 0 | — | 0 |
| en-townsville · Table 6 | report | 4 | 7 | — | 0 |
| en-townsville · Table 7 | report | 3 | 7 | — | 0 |
| en-townsville · Table 8 | report | 5 | 8 | — | 0 |
| en-townsville · Table 9 | report | 3 | 4 | line 27 | 0 |
| en-townsville · Table 10 | report | 2 | 2 | line 18 | 1 |
| en-townsville · Table 11 | report | 4 | 0 | — | 0 |

## Round three: where the rules doubt

Doubts on 68 sheets read by the rules alone (34 public, 14 held, 20 scripted).

As the expectations are written: 4 sheets read wrong without a word, 3 carrying a doubt (recall); 0 of 64 right sheets carrying one (false alarms).
   wrong: fr-pleumeleuc · spécifications: NO DOUBT
   wrong: ja-oita · 139: misfit, words, merged
   wrong: ja-urayasu · Sheet1: misfit, end
   wrong: ar-ait-melloul-grants · الاعانات والمنح المالية: total, misfit, sums, end
With Pleumeleuc's yes column accepted as a checkbox: 3 sheets read wrong without a word, 3 carrying a doubt (recall); 0 of 65 right sheets carrying one (false alarms).
   wrong: ja-oita · 139: misfit, words, merged
   wrong: ja-urayasu · Sheet1: misfit, end
   wrong: ar-ait-melloul-grants · الاعانات والمنح المالية: total, misfit, sums, end

| Doubt | Sheets wrong it is on | Right sheets it is on (false alarms) | Places, all sheets |
|---|---:|---:|---:|
| misfit | 3 | 0 | 5 |
| total | 1 | 0 | 1 |
| sums | 1 | 0 | 1 |
| words | 1 | 0 | 1 |
| end | 2 | 0 | 2 |
| long | 0 | 0 | 0 |
| merged | 1 | 0 | 1 |

Right sheets with a doubt:

## Round three: a brain reads the doubted sheets

The gate, written before the first run: on the doubted sheets, with Haiku, heads found in 95% of sheets; 90% of columns given the right kind; every cell left out is said; no sheet read wrong without a word, and no sheet a brain touched read worse than
without it; Sonnet beside it; three runs each. Then each brain once on every real sheet, doubted or not. The brain is shown the
sheet's lines (the first 60 and the last 20), the rules' reading and their doubts (layout.js), and its answer can only label lines
and columns; the rules read the sheet again with those labels. "Worse" is any of: heads lost, fewer columns of the right kind,
more cells unsaid, more read wrong without a word, more values wrong, rows no longer right.

The first Haiku run, with sheet.js frozen at `2bf3bea9…`, failed the gate: in each of its three runs, heads 2/3 and kinds 20/28
(71.4%), nothing unsaid, no sheet wrong without a word, and Urayasu read worse. Haiku had named line 4 as heads and left line 5,
which the rules had right, alone; a heads label then replaced the rules' line, against the prompt's own word that lines left out
keep the rules' reading. The reader was mended to keep that word (`da904902…`) and Haiku asked again: the runs below. Sonnet's
second run then showed a second flaw of the same kind (title lines labelled notes above the heads hid them), mended before the
runs on every sheet (`14f7d075…`, the frozen one); every answer below is read with it. The gate was not changed.

### haiku (claudecode), the doubted sheets

| Sheets | Heads found (95%) | Columns of the right kind (90%) | Cells left out unsaid (0) | Sheets read wrong without a word (0) | Names | Rows | Values | Foot | Currencies | Expected left out, said | Workbook (sheets, hidden, 1904) | Values checkCell refuses |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Rules alone (3) | 2/3 (66.7%) MISS | 28/28 (100%) pass | 0 pass | 3 MISS | 103.6% | 0/3 | 99.3% (6 of 833 wrong) | 3/3 | 0/0 | 13/17 | 3/3 | 0 |
| With the brain, run 1 (3) | 3/3 (100%) pass | 28/28 (100%) pass | 0 pass | 0 pass | 103.6% | 3/3 | 100% (0 of 833 wrong) | 3/3 | 0/0 | 17/17 | 3/3 | 0 |
| With the brain, run 2 (3) | 3/3 (100%) pass | 28/28 (100%) pass | 0 pass | 0 pass | 103.6% | 3/3 | 100% (0 of 833 wrong) | 3/3 | 0/0 | 17/17 | 3/3 | 0 |
| With the brain, run 3 (3) | 3/3 (100%) pass | 28/28 (100%) pass | 0 pass | 0 pass | 103.6% | 3/3 | 100% (0 of 833 wrong) | 3/3 | 0/0 | 17/17 | 3/3 | 0 |

Run 1: 3 of 3 sheets touched; 0 read worse, 3 better; JSON not taken 0, answers with something dropped 0; tokens per sheet 4118 in, 1661 out; 9.9 s per sheet.
Run 2: 3 of 3 sheets touched; 0 read worse, 3 better; JSON not taken 0, answers with something dropped 0; tokens per sheet 4117 in, 1100 out; 8.2 s per sheet.
Run 3: 3 of 3 sheets touched; 0 read worse, 3 better; JSON not taken 0, answers with something dropped 0; tokens per sheet 4118 in, 1281 out; 9.3 s per sheet.

### haiku (claudecode), every real sheet, doubted or not

| Sheets | Heads found (95%) | Columns of the right kind (90%) | Cells left out unsaid (0) | Sheets read wrong without a word (0) | Names | Rows | Values | Foot | Currencies | Expected left out, said | Workbook (sheets, hidden, 1904) | Values checkCell refuses |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Rules alone (48) | 47/48 (97.9%) pass | 435/436 (99.8%) pass | 0 pass | 4 MISS | 105.3% | 45/48 | 99.9% (13 of 20856 wrong) | 44/48 | 0/0 | 183/187 | 48/48 | 0 |
| With the brain, run 1 (48) | 48/48 (100%) pass | 422/436 (96.8%) pass | 0 pass | 5 MISS | 104.8% | 42/48 | 99.5% (102 of 20856 wrong) | 43/48 | 0/0 | 183/187 | 48/48 | 0 |

Run 1: 30 of 48 sheets touched; 8 read worse (fr-wambrechies · Table 1; ja-kuwana · R6; en-cheltenham · Sheet1; en-townsville · Table 6; en-townsville · Table 10; fr-pleumeleuc · spécifications; fr-sixt-sur-aff · Feuil1; ja-kishiwada · Sheet1), 4 better; JSON not taken 0, answers with something dropped 0; tokens per sheet 3995 in, 1423 out; 9.0 s per sheet.
   fr-wambrechies · Table 1: WORSE; wrong without a word: line 63 is no row; line 66 is no row; line 69 is no row; line 72 is no row labels {"lines":{"59":"section","290":"row","291":"row","292":"row","293":"row","294":"row","295":"row","296":"row","297":"row","298":"row","299":"row","300":"subtotal","301":"subtotal","302":"row","303":"subtotal","304":"subtotal","305":"row","306":"row","307":"row","308":"row","309":"total"},"kinds":{}}
   ja-kuwana · R6: WORSE; wrong without a word: F3 read as "17.6"; F4 read as "▲3.1"; F7 read as "皆減"; F8 read as "▲0.9" labels {"lines":{"0":"heads","4":"section"},"kinds":{"5":"text"}}
   en-cheltenham · Sheet1: WORSE; wrong without a word: line 50 is no row; line 51 is no row; line 52 is no row; line 53 is no row labels {"lines":{"47":"section","48":"section","49":"row","50":"row","51":"row","52":"row","53":"row","54":"row","55":"row","56":"row","57":"row","59":"total"},"kinds":{}}
   en-townsville · Table 6: WORSE; wrong without a word: line 52 is no row; line 53 is no row; line 54 is no row; line 61 is no row labels {"lines":{"2":"heads","3":"heads","4":"heads","45":"section","46":"section","47":"section","48":"section","50":"section","51":"row","52":"row","53":"row","54":"total","56":"subtotal","58":"subtotal","59":"subtotal","60":"row","61":"subtotal","64":"heads","65":"heads","66":"heads","67":"heads","68":"
   en-townsville · Table 10: WORSE; wrong without a word: column (no name, A) missing labels {"lines":{"2":"heads","3":"note"},"kinds":{}}
   fr-pleumeleuc · spécifications: WORSE;  labels {"lines":{"9":"subtotal"},"kinds":{"2":"text","3":"text","4":"text"}}
   fr-sixt-sur-aff · Feuil1: WORSE;  labels {"lines":{},"kinds":{"2":"date","11":"date"}}
   ja-kishiwada · Sheet1: WORSE;  labels {"lines":{"4":"subtotal","7":"subtotal","10":"subtotal","15":"subtotal","20":"subtotal","25":"subtotal","30":"subtotal","35":"subtotal","40":"subtotal","45":"subtotal","50":"subtotal","55":"subtotal","114":"subtotal","121":"subtotal"},"kinds":{"1":"text"}}

### sonnet (claudecode), the doubted sheets

| Sheets | Heads found (95%) | Columns of the right kind (90%) | Cells left out unsaid (0) | Sheets read wrong without a word (0) | Names | Rows | Values | Foot | Currencies | Expected left out, said | Workbook (sheets, hidden, 1904) | Values checkCell refuses |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Rules alone (3) | 2/3 (66.7%) MISS | 28/28 (100%) pass | 0 pass | 3 MISS | 103.6% | 0/3 | 99.3% (6 of 833 wrong) | 3/3 | 0/0 | 13/17 | 3/3 | 0 |
| With the brain, run 1 (3) | 3/3 (100%) pass | 28/28 (100%) pass | 0 pass | 0 pass | 103.6% | 3/3 | 100% (0 of 833 wrong) | 3/3 | 0/0 | 17/17 | 3/3 | 0 |
| With the brain, run 2 (3) | 3/3 (100%) pass | 28/28 (100%) pass | 0 pass | 0 pass | 103.6% | 3/3 | 100% (0 of 833 wrong) | 3/3 | 0/0 | 17/17 | 3/3 | 0 |
| With the brain, run 3 (3) | 3/3 (100%) pass | 28/28 (100%) pass | 0 pass | 0 pass | 103.6% | 3/3 | 100% (0 of 833 wrong) | 3/3 | 0/0 | 17/17 | 3/3 | 0 |

Run 1: 3 of 3 sheets touched; 0 read worse, 3 better; JSON not taken 0, answers with something dropped 0; tokens per sheet 4097 in, 233 out; 4.9 s per sheet.
Run 2: 3 of 3 sheets touched; 0 read worse, 3 better; JSON not taken 0, answers with something dropped 0; tokens per sheet 4096 in, 261 out; 5.5 s per sheet.
Run 3: 3 of 3 sheets touched; 0 read worse, 3 better; JSON not taken 0, answers with something dropped 0; tokens per sheet 4097 in, 278 out; 5.1 s per sheet.

### sonnet (claudecode), every real sheet, doubted or not

| Sheets | Heads found (95%) | Columns of the right kind (90%) | Cells left out unsaid (0) | Sheets read wrong without a word (0) | Names | Rows | Values | Foot | Currencies | Expected left out, said | Workbook (sheets, hidden, 1904) | Values checkCell refuses |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Rules alone (48) | 47/48 (97.9%) pass | 435/436 (99.8%) pass | 0 pass | 4 MISS | 105.3% | 45/48 | 99.9% (13 of 20856 wrong) | 44/48 | 0/0 | 183/187 | 48/48 | 0 |
| With the brain, run 1 (48) | 48/48 (100%) pass | 435/436 (99.8%) pass | 0 pass | 4 MISS | 105% | 44/48 | 99.8% (51 of 20856 wrong) | 41/48 | 0/0 | 184/187 | 48/48 | 0 |

Run 1: 27 of 48 sheets touched; 5 read worse (fr-wambrechies · Table 1; en-cheltenham · Sheet1; en-townsville · Table 6; fr-sixt-sur-aff · Feuil1; ja-kishiwada · Sheet1), 3 better; JSON not taken 0, answers with something dropped 0; tokens per sheet 3978 in, 290 out; 5.3 s per sheet.
   fr-wambrechies · Table 1: WORSE; wrong without a word: line 63 is no row; line 66 is no row; line 69 is no row; line 72 is no row labels {"lines":{"58":"note","59":"section","290":"row","291":"row","292":"row","293":"row","294":"row","295":"row","296":"row","297":"row","298":"row","299":"row","300":"subtotal","301":"subtotal","302":"row","303":"subtotal","304":"subtotal","305":"row","306":"row","307":"row","308":"row","309":"total"},
   en-cheltenham · Sheet1: WORSE; wrong without a word: line 50 is no row; line 51 is no row; line 52 is no row; line 53 is no row labels {"lines":{"47":"section","48":"section","49":"row","50":"row","51":"row","52":"row","53":"row","54":"row","55":"row","56":"row","57":"row","59":"subtotal"},"kinds":{}}
   en-townsville · Table 6: WORSE; wrong without a word: line 52 is no row; line 53 is no row; line 54 is no row; line 57 is no row labels {"lines":{"2":"heads","3":"heads","4":"heads","45":"section","46":"section","47":"section","48":"section","50":"section","51":"row","52":"row","53":"row","54":"subtotal","56":"row","58":"row","59":"subtotal","60":"row","61":"subtotal","64":"section","65":"section","66":"section","67":"section","68":
   fr-pleumeleuc · spécifications: wrong without a word: C6 read as true; C7 read as true; C8 read as true; C9 read as true labels {"lines":{},"kinds":{"3":"text","4":"text"}}
   fr-sixt-sur-aff · Feuil1: WORSE;  labels {"lines":{},"kinds":{"2":"date"}}
   ja-kishiwada · Sheet1: WORSE;  labels {"lines":{"0":"note","2":"heads","4":"subtotal","7":"subtotal","10":"subtotal","15":"subtotal","20":"subtotal","25":"subtotal","30":"subtotal","35":"subtotal","40":"subtotal","45":"subtotal","50":"subtotal","55":"subtotal","114":"subtotal","121":"subtotal"},"kinds":{}}


## With no brain

What the sheet asks the person, for each kind of doubt:

- misfit: This line doesn't look like the others. Is it a row, or a note, a part's name or a total?
- total: This line is named a total, but its figures don't add up the rows. Leave it out as a total, or keep it as a row?
- sums: This line was left out because its figures equal the row or two above it. Is it a row after all?
- words: The first line under the column names holds words. Is it more column names, or a row?
- end: The last line is short and no total is above it. Is it a row, or a note to leave out?
- long: These long numbers may be codes, such as company numbers. Keep them as text?
- merged: Some column names run over two lines. Are both lines column names?

## Frozen

The reader as it stands after round three: cells.js, sheet.js and layout.js don't change until the third held-out set is read.

| File | SHA-256 |
|---|---|
| test/spreadsheets/cells.js | `a1d4871d3deaf86363e8bb520b52b0df608ea77443fe093422f6e8416eb82cb6` |
| test/spreadsheets/sheet.js | `14f7d0756557c169bcee8f82bd5b07f5e74d449c7fb53cd6dd02c422bcf16858` |
| test/spreadsheets/layout.js | `ff9717f335a8c3652d8dbec57fa8cfbfd9805ba214569a74b6b9e975a4021047` |

## What the figures don't say

Every scripted sheet was written by the reader's author, the eight held out too. The 48 real sheets were expected by someone else,
but the rules and the doubts were made or mended on them, with the misses in view: their figures measure the fit, not the reach.
The doubts' recall rests on three sheets. A third held-out set, of everyday lists rather than budgets, will measure the reach.
