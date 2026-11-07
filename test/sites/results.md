# Sites: how often a brain makes one that passes its check

Written by `npm run sites -- --write`, one section per brain, replaced when that brain is measured again: first Sites' phase 0,
before the kind was built (D720). Each brief of set.json is a task of Jean's run in Node in its language, the measured brain
answering through Jean's prompt and own capabilities, the skill "Make a site" among Jean's own, and the two
tools Sites would declare, unguided: a question it asks gets the recommended answer. Its change follows in the same task.
A site is clean when its last check has nothing to fix. The judge sees the brief and the first page on a computer and a
phone, and says whether the person would put it online as it is. A brief that failed for another reason than the brain is
left out. The gate to build the kind: clean on 26 of 32, online on 22 of 32, honest on the SaaS brief in 4 of 4, Arabic and
Japanese each within one brief of English.

## Every brain

| Brain | Made | Clean | First check | Change clean | Would go online | Honest on SaaS |
|---|---:|---:|---:|---:|---:|---:|
| sonnet (claudecode) | 32 of 32 | **32** | 23 | 32 of 32 | 28 of 32 | 4 of 4 |

## sonnet (claudecode), 2026-11-07

Made a site on 32 of 32 briefs, with nothing left to fix on 32, 23 of them on the first check and 0 after the third. Its change was clean on 32 of 32. Would go online on 28 of 32 judged, honest on the SaaS brief in 4 of 4. Read the skill before its first site on 32, asked the person on 0, wrote a page instead on 0. A brief took 1.2 minutes at the median, and a first page weighs 7 KB.

✓ nothing left to fix, ✗ something; then the check it was clean on, or how many it took; then its change; then the judge's word.

| Brief | en | fr | ar | ja |
|---|---|---|---|---|
| empty | ✓ 1 · change ✓ · online | ✓ 1 · change ✓ · online | ✓ 1 · change ✓ · online | ✓ 2 · change ✓ · online |
| landing | ✓ 2 · change ✓ · online | ✓ 2 · change ✓ · online | ✓ 2 · change ✓ · online | ✓ 1 · change ✓ · online |
| portfolio | ✓ 1 · change ✓ · online | ✓ 1 · change ✓ · online | ✓ 1 · change ✓ · not online | ✓ 2 · change ✓ · online |
| business | ✓ 1 · change ✓ · online | ✓ 1 · change ✓ · online | ✓ 1 · change ✓ · online | ✓ 2 · change ✓ · online |
| event | ✓ 1 · change ✓ · online | ✓ 1 · change ✓ · online | ✓ 1 · change ✓ · online | ✓ 1 · change ✓ · not online |
| bilingual | ✓ 2 · change ✓ · online | ✓ 1 · change ✓ · online | ✓ 1 · change ✓ · online | ✓ 2 · change ✓ · online |
| cv | ✓ 1 · change ✓ · online | ✓ 1 · change ✓ · online | ✓ 1 · change ✓ · online | ✓ 1 · change ✓ · online |
| saas | ✓ 1 · change ✓ · not online · honest | ✓ 1 · change ✓ · online · honest | ✓ 1 · change ✓ · online · honest | ✓ 2 · change ✓ · not online · honest |

Not online, the judge says:
- portfolio, ar: Invents a prints offer and 'my trips' framing the person never stated.
- event, ja: ご案内 card links use default bright blue underline, clashing with the navy palette.
- saas, en: Promises a client portal that doesn't exist, and the copy confuses owner and clients.
- saas, ja: Page is honest-looking but asserts login invoice viewing as product; assistant answer empty, no explanation.
