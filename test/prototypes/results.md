# Prototypes: how often a brain makes one whose flow works

Written by `npm run prototypes -- --write`, one section per brain, replaced when that brain is measured again: first Prototypes'
phase 0, before it was built (findings.md), then the capability (D742). Each brief of set.json is a task of Jean's run in Node in
its language, the measured brain answering through Jean's prompt and own capabilities, the skill "Make a prototype" among Jean's own,
and Prototypes' two tools, unguided: a question it asks gets the recommended answer. Its change follows in
the same task. A prototype is clean when its last check has nothing to fix; its flow works when every screen is reached from the
first by pressing what it shows, and no control does nothing. The judge sees the brief, every screen reached on a phone side by
side and the first on a computer, and says whether the person would show it to colleagues as a prototype of their idea. A brief
that failed for another reason than the brain is left out. The gate proposed before measuring, on the eight briefs: clean on 26
of 32, flow working on 26 of 32, shown on 22 of 32, paying a demo in 4 of 4, Arabic and Japanese each within one brief of English.

## Every brain

| Brain | Made | Clean | Flow works | Change clean | Shown | Paying a demo | Minutes |
|---|---:|---:|---:|---:|---:|---:|---:|
| haiku (claudecode) | 32 of 32 | **32** | **32** | 32 of 32 | **11 of 32** | 4 of 4 | 2.1 |
| sonnet (claudecode) | 32 of 32 | **32** | **32** | 30 of 30 | **22 of 32** | 4 of 4 | 1.7 |

## haiku (claudecode), 2026-11-11

Made a prototype on 32 of 32 briefs, with nothing left to fix on 32, 15 of them on the first check and 0 after the third. Its flow worked on 32: every screen reached from the first and no control doing nothing; a control did nothing on 0. Its change was clean on 32 of 32, its flow working after it on 32. Would be shown to colleagues on 11 of 32 judged, paying shown as a demo in 4 of 4. Read the skill before its first prototype on 32, gave a look on 32, wrote a page instead on 0, asked on 0. A brief took 2.1 minutes at the median; a prototype had 6 screens and 17 links and controls tried, and its first screen weighs 6 KB.

| Language | Made | Clean | Flow works | Change clean | Shown |
|---|---:|---:|---:|---:|---:|
| en | 8 of 8 | 8 | 8 | 8 | 2 of 8 |
| fr | 8 of 8 | 8 | 8 | 8 | 3 of 8 |
| ar | 8 of 8 | 8 | 8 | 8 | 2 of 8 |
| ja | 8 of 8 | 8 | 8 | 8 | 4 of 8 |

✓ nothing left to fix, ✗ something; then the check it was clean on, or how many it took; then whether its flow works; then its change (~: its flow works, something else left); then the judge's word.

| Brief | en | fr | ar | ja |
|---|---|---|---|---|
| leave | ✓ 1 · flow ✓ · change ✓ · not shown | ✓ 2 · flow ✓ · change ✓ · not shown | ✓ 1 · flow ✓ · change ✓ · not shown | ✓ 2 · flow ✓ · change ✓ · shown |
| salon | ✓ 2 · flow ✓ · change ✓ · not shown | ✓ 1 · flow ✓ · change ✓ · not shown | ✓ 3 · flow ✓ · change ✓ · not shown | ✓ 1 · flow ✓ · change ✓ · shown |
| volunteers | ✓ 1 · flow ✓ · change ✓ · shown | ✓ 1 · flow ✓ · change ✓ · shown | ✓ 3 · flow ✓ · change ✓ · not shown | ✓ 2 · flow ✓ · change ✓ · shown |
| school | ✓ 2 · flow ✓ · change ✓ · not shown | ✓ 2 · flow ✓ · change ✓ · not shown | ✓ 3 · flow ✓ · change ✓ · not shown | ✓ 2 · flow ✓ · change ✓ · not shown |
| dashboard | ✓ 1 · flow ✓ · change ✓ · not shown | ✓ 2 · flow ✓ · change ✓ · not shown | ✓ 2 · flow ✓ · change ✓ · not shown | ✓ 1 · flow ✓ · change ✓ · not shown |
| checkout | ✓ 2 · flow ✓ · change ✓ · not shown · honest | ✓ 2 · flow ✓ · change ✓ · shown · honest | ✓ 3 · flow ✓ · change ✓ · shown · honest | ✓ 1 · flow ✓ · change ✓ · not shown · honest |
| survey | ✓ 1 · flow ✓ · change ✓ · shown | ✓ 1 · flow ✓ · change ✓ · shown | ✓ 1 · flow ✓ · change ✓ · shown | ✓ 3 · flow ✓ · change ✓ · shown |
| tools | ✓ 1 · flow ✓ · change ✓ · not shown | ✓ 1 · flow ✓ · change ✓ · not shown | ✓ 2 · flow ✓ · change ✓ · not shown | ✓ 1 · flow ✓ · change ✓ · not shown |

Not shown, the judge says:
- leave, en: Recap and sent screens show raw ISO dates, inconsistent with the other screens' date formats.
- leave, fr: RTT row says "3 septembre · 2 jours": one date, two days, which contradicts itself.
- leave, ar: The new-request form uses tiny default browser controls, looking unfinished next to the other screens.
- salon, en: Main buttons are default blue underlined links, unstyled; screens look unfinished.
- salon, fr: Coiffeur list ignores chosen service: coloriste Sara and barber Karim offered for Coupe femme.
- salon, ar: Main actions are default blue underlined links, unstyled; screens look unfinished.
- volunteers, ar: On desktop, the four step cards wrap three plus one, leaving an orphaned card.
- school, en: Default serif font, unstyled links and buttons, phone-width column left empty on computer.
- school, fr: Absence and message forms use unstyled default controls; plain blue links and a cramped confirmation card look unfinished.
- school, ar: Absence form uses unstyled native controls; news item dates Thursday 6 November, which was a Friday.
- school, ja: Default unstyled form controls, misaligned label, cramped lunch table; looks unfinished, narrow column on desktop.
- dashboard, en: Card sub-text sits oddly indented, misaligned with labels and values; 'vs September' wording inconsistent.
- dashboard, fr: On phone, the tables are clipped: Atteinte and Tickets columns are cut off.
- dashboard, ar: On phone, tables overflow and clip the last column header, leaving a stray 'ال'.
- dashboard, ja: On the phone, the region table's last column (前月比) is clipped at the screen edge.
- checkout, en: Practice form is unstyled, labels and fields run together; plan cards cramped, links look like raw text.
- checkout, ja: スターターは担当者1名までなのに、入力例が3名で矛盾。折り返しの孤立文字も目立つ。
- tools, en: Chat says 'No answer yet' directly above Sara's reply; sample text contradicts itself.
- tools, fr: Request form and tool buttons use unstyled defaults: monospace textarea, blue link, cramped labels.
- tools, ar: Request form looks unfinished: tiny monospace textarea, label beside it, default radio buttons.
- tools, ja: Unstyled default links, buttons and misaligned textarea on request, tool, sent screens look unfinished.

## sonnet (claudecode), 2026-11-11

Made a prototype on 32 of 32 briefs, with nothing left to fix on 32, 19 of them on the first check and 1 after the third. Its flow worked on 32: every screen reached from the first and no control doing nothing; a control did nothing on 0. Its change was clean on 30 of 30, its flow working after it on 30. Would be shown to colleagues on 22 of 32 judged, paying shown as a demo in 4 of 4. Read the skill before its first prototype on 32, gave a look on 32, wrote a page instead on 0, asked on 0. A brief took 1.7 minutes at the median; a prototype had 5 screens and 16 links and controls tried, and its first screen weighs 8 KB.

| Language | Made | Clean | Flow works | Change clean | Shown |
|---|---:|---:|---:|---:|---:|
| en | 8 of 8 | 8 | 8 | 7 | 6 of 8 |
| fr | 8 of 8 | 8 | 8 | 8 | 6 of 8 |
| ar | 8 of 8 | 8 | 8 | 8 | 4 of 8 |
| ja | 8 of 8 | 8 | 8 | 7 | 6 of 8 |

✓ nothing left to fix, ✗ something; then the check it was clean on, or how many it took; then whether its flow works; then its change (~: its flow works, something else left); then the judge's word.

| Brief | en | fr | ar | ja |
|---|---|---|---|---|
| leave | ✓ 2 · flow ✓ · change ✓ · not shown | ✓ 2 · flow ✓ · change ✓ · shown | ✓ 2 · flow ✓ · change ✓ · not shown | ✓ 1 · flow ✓ · change ✓ · shown |
| salon | ✓ 1 · flow ✓ · change ✓ · shown | ✓ 1 · flow ✓ · change ✓ · shown | ✓ 1 · flow ✓ · change ✓ · not shown | ✓ 1 · flow ✓ · change ✓ · not shown |
| volunteers | ✓ 1 · flow ✓ · change ✓ · shown | ✓ 1 · flow ✓ · change ✓ · shown | ✓ 1 · flow ✓ · change ✓ · shown | ✓ 2 · flow ✓ · change ✓ · shown |
| school | ✓ 2 · flow ✓ · change ✓ · shown | ✓ 2 · flow ✓ · change ✓ · not shown | ✓ 2 · flow ✓ · change ✓ · shown | ✓ 1 · flow ✓ · change ✓ · shown |
| dashboard | ✓ 1 · flow ✓ · no change · not shown | ✓ 3 · flow ✓ · change ✓ · not shown | ✓ 2 · flow ✓ · change ✓ · not shown | ✓ 1 · flow ✓ · no change · shown |
| checkout | ✓ 1 · flow ✓ · change ✓ · shown · honest | ✓ 1 · flow ✓ · change ✓ · shown · honest | ✓ 1 · flow ✓ · change ✓ · not shown · honest | ✓ 1 · flow ✓ · change ✓ · not shown · honest |
| survey | ✓ 1 · flow ✓ · change ✓ · shown | ✓ 1 · flow ✓ · change ✓ · shown | ✓ 1 · flow ✓ · change ✓ · shown | ✓ 1 · flow ✓ · change ✓ · shown |
| tools | ✓ 2 · flow ✓ · change ✓ · shown | ✓ 4 · flow ✓ · change ✓ · shown | ✓ 2 · flow ✓ · change ✓ · shown | ✓ 2 · flow ✓ · change ✓ · shown |

Not shown, the judge says:
- leave, en: Figures conflict: 10 approved annual days listed, yet 'Taken this year' shows 7.
- leave, ar: أرقام غير متسقة: الطلب 4 أيام ثم 3، والرصيد 14 ثم يتبقى 11
- salon, ar: confirm.html's 'start over' link is unstyled default blue underline, looking unfinished.
- salon, ja: 確認画面の「最初からやり直す」が未装飾の青い既定リンクで、仕上げ不足に見える
- school, fr: Weekday-date mismatches: 'mardi 18', 'lundi 24', 'vendredi 28' novembre contradict the menu's 2026 calendar.
- dashboard, en: On the phone's region screen, Rouen's €141k label is struck through by the target line.
- dashboard, fr: On phone, the regions table overflows: the Magasins column is cut off ('Ma').
- dashboard, ar: On phone, the tables overflow and clip text, e.g. "101٪ من الإ…", so screens look unfinished.
- checkout, ar: Basic plan is single-therapist, yet the clinic form shows 2–5 therapists.
- checkout, ja: Solo plan allows 1 staff, but the staff field is prefilled with 3.
