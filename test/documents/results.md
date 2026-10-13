# Document evals: results

Made by `npm run documents -- --report --write` from the runs kept in `test/documents/.cache/results/`; the corpus, the questions and how they're scored are in [test/documents/](.), the hypotheses were registered in `hypotheses.json` at c1f7877 2026-10-11, before any result on the test split. Everything below is on the test split, the three seeds pooled, the compendium printed as a PDF by Chromium, unless it says otherwise. Each strategy uses the passage size it scored best with on the dev split (dense:gemma2q4 100, hybrid:gemma2q4 100, dense:gemma2 100, hybrid:gemma2 100, dense:granite32 100, hybrid:granite32 100, dense:granite 200, hybrid:granite 100, dense:harrier 200, hybrid:harrier 100, dense:gemma 100, hybrid:gemma 100, dense:e5 200, hybrid:e5 100, dense:qwen3 200, hybrid:qwen3 100, pages 100, lexical 100, lexical+exact 100, preselect 100 tokens).

## The corpus

| Size | PDF pages | Characters | Tokens (Qwen) | Tokens (Jean’s estimate) | Questions (3 seeds) |
|---|---|---|---|---|---|
| XS | 14 | 9 k | 3 k | 3 k | 48 |
| S | 26 | 34 k | 13 k | 12 k | 111 |
| M | 156 | 357 k | 149 k | 122 k | 366 |
| L | 814 | 2.18 M | 841 k | 742 k | 726 |
| XL | 4196 | 12.63 M | 4.59 M | 4.28 M | 954 |

## The hypotheses

|  | Claim | Verdict | Evidence |
|---|---|---|---|
| H1 | No vector database: a flat scan of Int8 vectors stays under 100 ms at p95 for ten times XL's passages; what dense retrieval costs is the embedding at ingestion | **refuted** | 245900 vectors of 384: p95 123.5 ms; 245900 vectors of 1024: p95 212.0 ms |
| H2 | On lookups, filters and the latest of several values, lexical search finds the evidence at least as well as dense retrieval (within 2 points); on questions about absent things it surfaces lures no more often | **not run** | – |
| H3 | Manipulation check: with the user's own words as the query, dense retrieval beats lexical search on low-overlap paraphrases and other languages; if not, the question set is audited before anything is concluded | **not run** | – |
| H4 | When the brain writes its own queries, lexical search answers paraphrases and other languages within 5 points of hybrid retrieval | **refuted** | nvidia/nemotron-3-super-120b-a12b: search 56%, search+meaning 76%; search − search+meaning: -19.8 points (95% CI -27.3 to -12.3, n = 187) |
| H5 | Totals and counts across the whole need exhaustive search and a script, not the best passages: with a script, at least 80% are right and at least 20 points more than without | **inconclusive** | nvidia/nemotron-3-super-120b-a12b:free: search+script 60%, search 50%; search+script − search: 10.0 points (95% CI -1.7 to 21.7, n = 60) |
| H6 | Ingestion can stay in memory: the first search of an XL document, its index built on the spot, takes under 1.5 s in Chromium slowed four times | **refuted** | 8610 ms with the CPU 4× slower (index 8590 ms, query 19 ms, 24590 passages); 2002 ms at full speed |
| H7 | For a brain with 32k of context, the pages that match the question beat the first pages by at least 15 points on lookups | **confirmed** | liquid/lfm-2.5-2.6b:free: preselect 100%, pages 0%; preselect − pages: 100.0 points (95% CI 100.0 to 100.0, n = 60) |
| H8 | Brain-written summaries made at ingestion do not beat exhaustive search with helpers on counts across the whole by 10 points or more | **inconclusive** | nvidia/nemotron-3-super-120b-a12b: summaries 60%, search+mapreduce 42%; summaries − search+mapreduce: 17.5 points (95% CI 3.5 to 31.6, n = 57) |

## Finding the evidence: recall within 32k tokens (all kinds but absent things)

| Strategy | S | M | L | XL |
|---|---|---|---|---|
| `pages` | 100 | 41 | 23 | 12 |
| `lexical` | 93 | 86 | 73 | 66 |
| `exact` | 14 | 15 | 14 | 14 |
| `lexical+exact` | 93 | 86 | 73 | 66 |
| `preselect` | 100 | 82 | 69 | 67 |
| `dense:e5` | 100 | 98 | 88 | 68 |
| `hybrid:e5` | 100 | 95 | 88 | 82 |
| `dense:qwen3` | 100 | 97 | 77 | 59 |
| `hybrid:qwen3` | 100 | 93 | 87 | 81 |
| `dense:granite` | 100 | 95 | 65 | – |
| `hybrid:granite` | 100 | 96 | 84 | – |
| `dense:harrier` | 100 | 97 | 81 | – |
| `hybrid:harrier` | 100 | 98 | 91 | – |
| `dense:gemma` | 100 | 93 | 90 | – |
| `hybrid:gemma` | 100 | 93 | 90 | – |
| `dense:gemma2` | 100 | 96 | 87 | 81 |
| `hybrid:gemma2` | 100 | 95 | 91 | 89 |

Within 8k tokens, a device brain’s share:

| Strategy | S | M | L | XL |
|---|---|---|---|---|
| `pages` | 71 | 28 | 9 | 6 |
| `lexical` | 87 | 72 | 62 | 62 |
| `exact` | 14 | 15 | 14 | 14 |
| `lexical+exact` | 87 | 72 | 62 | 62 |
| `preselect` | 93 | 66 | 58 | 57 |
| `dense:e5` | 100 | 89 | 68 | 50 |
| `hybrid:e5` | 100 | 89 | 81 | 75 |
| `dense:qwen3` | 100 | 81 | 54 | 50 |
| `hybrid:qwen3` | 100 | 90 | 80 | 76 |
| `dense:granite` | 100 | 72 | 40 | – |
| `hybrid:granite` | 100 | 85 | 72 | – |
| `dense:harrier` | 100 | 85 | 57 | – |
| `hybrid:harrier` | 100 | 92 | 80 | – |
| `dense:gemma` | 100 | 92 | 87 | – |
| `hybrid:gemma` | 97 | 92 | 86 | – |
| `dense:gemma2` | 100 | 93 | 83 | 75 |
| `hybrid:gemma2` | 99 | 92 | 88 | 84 |

Within 128k tokens:

| Strategy | S | M | L | XL |
|---|---|---|---|---|
| `pages` | 100 | 100 | 33 | 27 |
| `lexical` | 93 | 97 | 81 | 76 |
| `exact` | 14 | 15 | 14 | 14 |
| `lexical+exact` | 93 | 97 | 81 | 76 |
| `preselect` | 100 | 100 | 82 | 73 |
| `dense:e5` | 100 | 98 | 89 | 70 |
| `hybrid:e5` | 100 | 97 | 88 | 83 |
| `dense:qwen3` | 100 | 97 | 78 | 59 |
| `hybrid:qwen3` | 100 | 94 | 88 | 81 |
| `dense:granite` | 100 | 96 | 67 | – |
| `hybrid:granite` | 100 | 98 | 86 | – |
| `dense:harrier` | 100 | 98 | 83 | – |
| `hybrid:harrier` | 100 | 99 | 92 | – |
| `dense:gemma` | 100 | 93 | 90 | – |
| `hybrid:gemma` | 100 | 93 | 91 | – |
| `dense:gemma2` | 100 | 96 | 87 | 81 |
| `hybrid:gemma2` | 100 | 96 | 91 | 89 |

## By kind of question at XL, within 32k tokens

For absent things, how often the strategy handed over a lure (lower is better).

| Strategy | lookup | paraphrase | filter | aggregate | multihop | temporal | crosslingual | negative | global |
|---|---|---|---|---|---|---|---|---|---|
| `pages` | 0 | 0 | 39 | 0 | 45 | 0 | 12 | 0 lure | 0 |
| `lexical` | 99 | 7 | 98 | 33 | 33 | 100 | 55 | 9 lure | 74 |
| `exact` | 0 | 0 | 0 | 0 | 0 | 93 | 23 | 0 lure | 0 |
| `lexical+exact` | 99 | 7 | 98 | 33 | 33 | 100 | 55 | 9 lure | 74 |
| `preselect` | 100 | 29 | 91 | 0 | 64 | 100 | 53 | 0 lure | 69 |
| `dense:e5` | 85 | 71 | 84 | 42 | 31 | 81 | 60 | 37 lure | 82 |
| `hybrid:e5` | 99 | 85 | 98 | 59 | 34 | 100 | 80 | 40 lure | 83 |
| `dense:qwen3` | 42 | 94 | 81 | 55 | 4 | 98 | 49 | 12 lure | 77 |
| `hybrid:qwen3` | 100 | 94 | 98 | 52 | 33 | 100 | 70 | 21 lure | 77 |
| `dense:granite` | – | – | – | – | – | – | – | – lure | – |
| `hybrid:granite` | – | – | – | – | – | – | – | – lure | – |
| `dense:harrier` | – | – | – | – | – | – | – | – lure | – |
| `hybrid:harrier` | – | – | – | – | – | – | – | – lure | – |
| `dense:gemma` | – | – | – | – | – | – | – | – lure | – |
| `hybrid:gemma` | – | – | – | – | – | – | – | – lure | – |
| `dense:gemma2` | 94 | 100 | 94 | 88 | 9 | 100 | 66 | 50 lure | 100 |
| `hybrid:gemma2` | 99 | 99 | 98 | 86 | 33 | 100 | 89 | 50 lure | 100 |

## Answers

| Condition | Brain | Answers | Right | Hallucinated | Evidence seen | Abstained on absent things | Calls | Seconds |
|---|---|---|---|---|---|---|---|---|
| `search` | nvidia/nemotron-3-super-120b-a12b:free | 95 | 45% | 23% | 52% | – | 2.5 | 47 |
| `search+script` | nvidia/nemotron-3-super-120b-a12b:free | 60 | 60% | 28% | 68% | – | 3.0 | 67 |
| `preselect` | liquid/lfm-2.5-2.6b:free | 60 | 100% | 0% | 100% | – | 0.7 | 3 |
| `pages` | liquid/lfm-2.5-2.6b:free | 60 | 0% | 3% | 0% | – | 1.4 | 15 |
| `search+meaning` | nvidia/nemotron-3-super-120b-a12b:free | 34 | 68% | 3% | 71% | – | 2.9 | 17 |
| `search` | nvidia/nemotron-3-super-120b-a12b | 256 | 65% | 4% | 68% | 100% | 2.4 | 90 |
| `search+meaning` | nvidia/nemotron-3-super-120b-a12b | 256 | 77% | 5% | 82% | 100% | 2.6 | 93 |
| `search+mapreduce` | nvidia/nemotron-3-super-120b-a12b | 57 | 42% | 25% | 44% | – | 2.2 | 105 |
| `summaries` | nvidia/nemotron-3-super-120b-a12b | 57 | 60% | 30% | 70% | – | 2.0 | 81 |

Against the targets, on ten questions of each kind at XL (`--answers overall`); faithfulness isn't measured yet.

| Condition | Brain | Answers | Right (target 85%) | Hallucinated (at most 5%) | Evidence seen | Abstained on absent things (90%) | Calls | Seconds |
|---|---|---|---|---|---|---|---|---|
| `search` | nvidia/nemotron-3-super-120b-a12b | 90 | 79% | 4% | 79% | 100% | 2.7 | 85 |
| `search+meaning` | nvidia/nemotron-3-super-120b-a12b | 90 | 80% | 11% | 89% | 100% | 2.9 | 96 |

## By format

The same questions with the compendium as Word, Markdown or text, and as a project of ten files (Word, Excel, PowerPoint, CSV, text and PDF), lexical search, recall within 32k tokens (absent things aside).

| Size | Format | Questions | pages | lexical | lexical+exact | preselect |
|---|---|---|---|---|---|---|
| L | docx | 506 | 19 | 74 | 74 | 69 |
| L | md | 506 | 19 | 73 | 73 | 69 |
| L | project | 506 | 23 | 76 | 76 | 64 |
| L | pdf | 506 | 23 | 73 | 73 | 69 |
| L | txt | 506 | 23 | 57 | 57 | 65 |
| M | docx | 252 | 40 | 86 | 86 | 79 |
| M | md | 252 | 40 | 86 | 86 | 80 |
| M | project | 252 | 41 | 85 | 85 | 77 |
| M | pdf | 252 | 41 | 86 | 86 | 82 |
| M | txt | 252 | 41 | 82 | 82 | 80 |
| S | docx | 74 | 100 | 95 | 95 | 100 |
| S | md | 74 | 100 | 95 | 95 | 100 |
| S | project | 74 | 100 | 93 | 93 | 100 |
| S | pdf | 74 | 100 | 93 | 93 | 100 |
| S | txt | 74 | 100 | 92 | 92 | 100 |
| XL | pdf | 678 | 12 | 66 | 66 | 67 |

## Costs

Making an XL compendium’s index in memory: 2353 ms in node on this computer; in Chromium, see H6.

| Embedder | Passages embedded | Minutes per million characters | Minutes for one XL corpus (12.5 M characters) |
|---|---|---|---|
| e5 | 291235 | 0.26 | 3 |
| gemma | 51733 | 3.36 | 42 |
| gemma2 | 210334 | 4.26 | 53 |
| gemma2q4 | 9164 | 6.16 | 77 |
| granite | 51733 | 0.46 | 6 |
| granite32 | 9164 | 1.67 | 21 |
| harrier | 51733 | 3.74 | 47 |
| qwen3 | 157495 | 5.05 | 63 |

Time to rank one question’s passages at XL:

| Strategy | p50 ms | p95 ms |
|---|---|---|
| `pages` | 16.1 | 41.4 |
| `lexical` | 11.7 | 15.4 |
| `exact` | 50.4 | 53.3 |
| `lexical+exact` | 61.1 | 66.4 |
| `preselect` | 722.4 | 817.5 |
| `dense:e5` | 9.3 | 10.0 |
| `hybrid:e5` | 27.8 | 31.3 |
| `dense:qwen3` | 46.0 | 47.0 |
| `hybrid:qwen3` | 55.8 | 59.5 |
| `dense:granite` | – | – |
| `hybrid:granite` | – | – |
| `dense:harrier` | – | – |
| `hybrid:harrier` | – | – |
| `dense:gemma` | – | – |
| `hybrid:gemma` | – | – |
| `dense:gemma2` | 33.8 | 34.2 |
| `hybrid:gemma2` | 42.5 | 45.6 |
