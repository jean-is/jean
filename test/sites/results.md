# Sites: how often a brain makes one that passes its check

Written by `npm run sites -- --write`, one section per brain, replaced when that brain is measured again: first Sites' phase 0,
before the kind was built (D720). Each brief of set.json is a task of Jean's run in Node in its language, the measured brain
answering through Jean's prompt and own capabilities, the skill "Make a site" among Jean's own, and the two
tools Sites would declare, unguided: a question it asks gets the recommended answer. Its change follows in the same task.
A site is clean when its last check has nothing to fix. The judge sees the brief and the first page on a computer and a
phone, and says whether the person would put it online as it is. A brief that failed for another reason than the brain is
left out. The gate to build the kind, on the eight briefs it was set on: clean on 26 of 32, online on 22 of 32, honest on
the SaaS brief in 4 of 4, Arabic and Japanese each within one brief of English. Asking: once on the open briefs (those
leaving two choices or more that change the whole site), after reading the skill, and never on the others.

## Every brain

| Brain | Made | Clean | First check | Change clean | Would go online | Honest on SaaS | Asked once, open | Asked, others |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| qwen3.6-35b-a3b-splash (lmstudio, {"reasoning_effort":"none"}) | 6 of 12 | **5** | 1 | 5 of 7 | 0 of 6 | 0 of 1 | 3 of 6 | 2 of 6 |
| sonnet (claudecode) | 40 of 40 | **40** | 29 | 40 of 40 | 31 of 40 | 4 of 4 | 6 of 12 | 2 of 28 |

## qwen3.6-35b-a3b-splash (lmstudio, {"reasoning_effort":"none"}), 2026-11-11

Made a site on 6 of 12 briefs, with nothing left to fix on 5, 1 of them on the first check and 3 after the third. Its change was clean on 5 of 7. Would go online on 0 of 6 judged, honest on the SaaS brief in 0 of 1. Read the skill before its first site on 3, wrote a page instead on 1. Asked once on 3 of 6 open briefs, and on 2 of 6 others; more than once on 0, before reading the skill on 4. A brief took 1.4 minutes at the median, and a first page weighs 5 KB.

✓ nothing left to fix, ✗ something; then the check it was clean on, or how many it took; then its change; then the judge's word.

| Brief | en | ja |
|---|---|---|
| empty | ✗ no site | ✗ no site |
| band | ✓ 4 · change ✓ · not online · asked | ✗ asked |
| cleaning | ✗ no site | ✗ asked |
| landing | ✓ 2 · change ✓ · not online · asked before the skill | ✓ 6 · change ✓ · not online |
| business | ✓ 1 · change ✓ · not online | ✓ 5 · change ✓ · not online |
| saas | ✗ 3 · change ✗ · not online · not honest · asked before the skill | ✗ a page |

Left to fix:
- saas, en: index.html: a field asks for a password; a site never does

Not online, the judge says:
- band, en: Bare template look: header and content misaligned, nav off baseline, empty space, no imagery.
- landing, en: Pricing/features claim unlaunched product details (10+ templates, PayPal, tax); emoji icons look generic; mobile feature heading wraps awkwardly.
- landing, ja: デスクトップでメール入力欄が全幅に伸び、ボタンが下に浮いていて未完成に見える。
- business, en: Hero illustration looks like a handbag and jar, not bread; reads as placeholder.
- business, ja: Invented address, phone number and ingredient origins aren't bracketed; phone nav wraps awkwardly.
- saas, en: Broken logo glyph text, phone nav cramped, fake localStorage login with passwords on site.

## sonnet (claudecode), 2026-11-11

Made a site on 40 of 40 briefs, with nothing left to fix on 40, 29 of them on the first check and 0 after the third. Its change was clean on 40 of 40. Would go online on 31 of 40 judged, honest on the SaaS brief in 4 of 4. Read the skill before its first site on 40, wrote a page instead on 0. Asked once on 6 of 12 open briefs, and on 2 of 28 others; more than once on 0, before reading the skill on 1. A brief took 1.2 minutes at the median, and a first page weighs 7 KB.

✓ nothing left to fix, ✗ something; then the check it was clean on, or how many it took; then its change; then the judge's word.

| Brief | en | fr | ar | ja |
|---|---|---|---|---|
| empty | ✓ 1 · change ✓ · online · asked | ✓ 1 · change ✓ · online · asked | ✓ 1 · change ✓ · online · asked | ✓ 1 · change ✓ · online · asked |
| band | ✓ 1 · change ✓ · online | ✓ 1 · change ✓ · online · asked | ✓ 1 · change ✓ · online · asked | ✓ 2 · change ✓ · not online |
| cleaning | ✓ 1 · change ✓ · online | ✓ 2 · change ✓ · online | ✓ 1 · change ✓ · online | ✓ 2 · change ✓ · not online |
| landing | ✓ 1 · change ✓ · not online | ✓ 2 · change ✓ · not online | ✓ 1 · change ✓ · online | ✓ 2 · change ✓ · online |
| portfolio | ✓ 1 · change ✓ · online | ✓ 1 · change ✓ · online | ✓ 1 · change ✓ · online | ✓ 2 · change ✓ · online |
| business | ✓ 1 · change ✓ · online | ✓ 1 · change ✓ · online | ✓ 2 · change ✓ · online | ✓ 2 · change ✓ · online |
| event | ✓ 1 · change ✓ · online | ✓ 1 · change ✓ · online | ✓ 1 · change ✓ · online | ✓ 2 · change ✓ · not online |
| bilingual | ✓ 1 · change ✓ · online | ✓ 1 · change ✓ · online | ✓ 1 · change ✓ · online | ✓ 1 · change ✓ · not online · asked |
| cv | ✓ 1 · change ✓ · not online | ✓ 1 · change ✓ · online | ✓ 1 · change ✓ · online | ✓ 1 · change ✓ · online |
| saas | ✓ 1 · change ✓ · online · honest · asked before the skill | ✓ 1 · change ✓ · not online · honest | ✓ 2 · change ✓ · online · honest | ✓ 2 · change ✓ · not online · honest |

Not online, the judge says:
- band, ja: Placeholder brackets throughout, and no live info or real content; not finished.
- cleaning, ja: 「無料で見積もり相談」は依頼主が言っていない約束で、事実とは限らない。
- landing, en: Desktop form section is misaligned: heading and text sit offset from the left-aligned form.
- landing, fr: Steps' descriptions wrap in a narrow column, one word per line, on both views.
- event, ja: On phone, timeline titles start at inconsistent horizontal positions, so the layout looks unpolished.
- bilingual, ja: Invents a free trial lesson and adult-only focus the owner never stated.
- cv, en: On phone, the Languages heading sits cramped right under the Skills chips.
- saas, fr: Page is a waitlist, not the requested invoice SaaS; visual is plain and generic.
- saas, ja: Page promises per-customer login and invoice viewing, which the site cannot deliver; misleading claims.
