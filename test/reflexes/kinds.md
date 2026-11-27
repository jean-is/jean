# Kinds of work: jean-is/kev-0.6b-reflexes-ONNX on test/reflexes/kinds/

Written by `npm run reflexes -- --kinds --write`. Whether Kev, fine-tuned on Jean's other questions and never on this one,
tells what kind of work a request asks for (D773): 40 requests in each of 4 languages, 5 kinds, eight of each, q4 weights on the CPU.
Asked one way, as a choice among the five; the other, as a yes or no for each kind but the last, in one pass. Kinds would
need nine in ten right before Auto leans on them.

| Asked and read | en | ar | fr | ja | All |
|---|---:|---:|---:|---:|---:|
| One choice, its likeliest | 88% | 78% | 85% | 85% | **84%** |
| One choice, at 0.6 or other | 83% | 78% | 83% | 85% | **82%** |
| A yes or no for each, the surest at 0.6 or other | 95% | 83% | 90% | 95% | **91%** |

## One choice, its likeliest: what each kind was read as, every language

| Request's kind | writing | numbers | making | research | other |
|---|---:|---:|---:|---:|---:|
| writing | 25 |  | 2 |  | 5 |
| numbers |  | 27 |  |  | 5 |
| making |  |  | 29 |  | 3 |
| research |  |  |  | 21 | 11 |
| other |  |  |  |  | 32 |

## One choice, at 0.6 or other: what each kind was read as, every language

| Request's kind | writing | numbers | making | research | other |
|---|---:|---:|---:|---:|---:|
| writing | 23 |  | 2 |  | 7 |
| numbers |  | 27 |  |  | 5 |
| making |  |  | 29 |  | 3 |
| research |  |  |  | 20 | 12 |
| other |  |  |  |  | 32 |

## A yes or no for each, the surest at 0.6 or other: what each kind was read as, every language

| Request's kind | writing | numbers | making | research | other |
|---|---:|---:|---:|---:|---:|
| writing | 31 |  |  |  | 1 |
| numbers |  | 31 |  |  | 1 |
| making | 2 |  | 27 |  | 3 |
| research | 2 |  |  | 24 | 6 |
| other |  |  |  |  | 32 |
