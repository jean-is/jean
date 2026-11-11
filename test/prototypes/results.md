# Prototypes: how often a brain makes one whose flow works

Written by `npm run prototypes -- --write`, one section per brain, replaced when that brain is measured again: a canvas for
prototypes' phase 0, before anything of it is built. Each brief of set.json is a task of Jean's run in Node in its language, the
measured brain answering through Jean's prompt and own capabilities, the draft skill "Make a prototype" (skill/) among Jean's own,
and the two tools a prototype kind would declare, unguided: a question it asks gets the recommended answer. Its change follows in
the same task. A prototype is clean when its last check has nothing to fix; its flow works when every screen is reached from the
first by pressing what it shows, and no control does nothing. The judge sees the brief, every screen reached on a phone side by
side and the first on a computer, and says whether the person would show it to colleagues as a prototype of their idea. A brief
that failed for another reason than the brain is left out. The gate proposed before measuring, on the eight briefs: clean on 26
of 32, flow working on 26 of 32, shown on 22 of 32, paying a demo in 4 of 4, Arabic and Japanese each within one brief of English.

## Every brain

| Brain | Made | Clean | Flow works | Change clean | Shown | Paying a demo | Minutes |
|---|---:|---:|---:|---:|---:|---:|---:|
| haiku (claudecode) | 32 of 32 | **30** | **32** | 30 of 32 | **13 of 32** | 4 of 4 | 2.1 |
| sonnet (claudecode) | 32 of 32 | **32** | **32** | 30 of 30 | **21 of 32** | 4 of 4 | 1.6 |

## haiku (claudecode), 2026-11-11

Made a prototype on 32 of 32 briefs, with nothing left to fix on 30, 14 of them on the first check and 2 after the third. Its flow worked on 32: every screen reached from the first and no control doing nothing; a control did nothing on 0. Its change was clean on 30 of 32, its flow working after it on 32. Would be shown to colleagues on 13 of 32 judged, paying shown as a demo in 4 of 4. Read the skill before its first prototype on 32, gave a look on 32, wrote a page instead on 0, asked on 0. A brief took 2.1 minutes at the median; a prototype had 5 screens and 16 links and controls tried, and its first screen weighs 6 KB.

| Language | Made | Clean | Flow works | Change clean | Shown |
|---|---:|---:|---:|---:|---:|
| en | 8 of 8 | 8 | 8 | 8 | 2 of 8 |
| fr | 8 of 8 | 7 | 8 | 7 | 4 of 8 |
| ar | 8 of 8 | 7 | 8 | 7 | 5 of 8 |
| ja | 8 of 8 | 8 | 8 | 8 | 2 of 8 |

✓ nothing left to fix, ✗ something; then the check it was clean on, or how many it took; then whether its flow works; then its change (~: its flow works, something else left); then the judge's word.

| Brief | en | fr | ar | ja |
|---|---|---|---|---|
| leave | ✓ 3 · flow ✓ · change ✓ · shown | ✓ 1 · flow ✓ · change ✓ · not shown | ✗ 3 · flow ✓ · change ~ · not shown | ✓ 2 · flow ✓ · change ✓ · not shown |
| salon | ✓ 1 · flow ✓ · change ✓ · not shown | ✓ 1 · flow ✓ · change ✓ · shown | ✓ 2 · flow ✓ · change ✓ · not shown | ✓ 1 · flow ✓ · change ✓ · not shown |
| volunteers | ✓ 2 · flow ✓ · change ✓ · shown | ✓ 2 · flow ✓ · change ✓ · shown | ✓ 1 · flow ✓ · change ✓ · not shown | ✓ 3 · flow ✓ · change ✓ · not shown |
| school | ✓ 2 · flow ✓ · change ✓ · not shown | ✓ 2 · flow ✓ · change ✓ · not shown | ✓ 2 · flow ✓ · change ✓ · shown | ✓ 3 · flow ✓ · change ✓ · not shown |
| dashboard | ✓ 4 · flow ✓ · change ✓ · not shown | ✓ 4 · flow ✓ · change ✓ · shown | ✓ 1 · flow ✓ · change ✓ · shown | ✓ 3 · flow ✓ · change ✓ · not shown |
| checkout | ✓ 1 · flow ✓ · change ✓ · not shown · honest | ✗ 3 · flow ✓ · change ~ · not shown · honest | ✓ 1 · flow ✓ · change ✓ · shown · honest | ✓ 1 · flow ✓ · change ✓ · not shown · honest |
| survey | ✓ 1 · flow ✓ · change ✓ · not shown | ✓ 1 · flow ✓ · change ✓ · shown | ✓ 1 · flow ✓ · change ✓ · shown | ✓ 3 · flow ✓ · change ✓ · shown |
| tools | ✓ 1 · flow ✓ · change ✓ · not shown | ✓ 3 · flow ✓ · change ✓ · not shown | ✓ 2 · flow ✓ · change ✓ · shown | ✓ 1 · flow ✓ · change ✓ · shown |

Left to fix:
- leave, ar: index.html: by night, “إجازاتي” (a[aria-current="page"]) has a contrast of 2.38:1 (#9e9eff on #ffffff), not 4.5:1 index.html: by night, “طلب إجازة” (li:nth-child(2) > a[href$="request.html"]) has a contrast of 2.38:1 (#9e9eff on #ffffff), not 4.5:1 index.html: by night, “طلب إجازة جديدة” (.button) has a contrast of 2.38:1 (#9e9eff on #ffffff), not 4.5:1
- checkout, fr: index.html: by night, “Agenda Praticien” (.name) has a contrast of 1.03:1 (#f9fbfb on #ffffff), not 3:1 index.html: by night, “Étape 1 sur 3 · Choisir une formule” (.step) has a contrast of 3.63:1 (#49928d on #ffffff), not 4.5:1 index.html: by night, “Voir les formules” (a[href$="#formules"]) has a contrast of 2.38:1 (#9e9eff on #ffffff), not 4.5:1

Not shown, the judge says:
- leave, fr: Refuser leads to a 'Demande acceptée' screen; motif differs between recap and manager.
- leave, ar: Navigation is default bulleted blue links and the request form is cramped and unstyled, so it looks unfinished.
- leave, ja: Phone request and reject forms look unstyled and misaligned; default blue links look unfinished.
- salon, en: Intro says three steps but screens say 'Step 1 of 4'; wording 'with Any available' awkward.
- salon, ar: Default blue underlined links and a plain grey button look unfinished; desktop layout is sparse.
- salon, ja: Default blue underlined links instead of buttons; date chips on time screen render broken.
- volunteers, ar: Welcome screen's unstyled default-blue link clashes with the green theme, looking unfinished.
- volunteers, ja: Unstyled default form controls and links; desktop screen unconstrained, huge illustration; looks unfinished.
- school, en: School news list shows stray bullets beside default disclosure triangles, looking unstyled and unfinished.
- school, fr: Form screens show unstyled default controls and blue links; they look unfinished.
- school, ja: 給食のアレルゲン表示に牛乳なのに乳がない日があり、欠席確認の青いリンクも未整備。
- dashboard, en: Desktop table headings sit far from right-aligned figures, looking misaligned and unfinished.
- dashboard, ja: On phone, tables are clipped at the right edge; columns like 目標 are cut off, and 円 wraps alone.
- checkout, en: Solo plan is for one therapist, yet the form says 2 to 5 therapists.
- checkout, fr: Unstyled default serif and raw inline form fields; desktop layout lopsided; night theme unreadable.
- checkout, ja: Headlines break mid-word, payment radios are misaligned, and plan card buttons sit at uneven heights.
- survey, en: Welcome screen's rating faces are four blank gray circles and one smile, looking broken.
- tools, en: Nearby list leads to chat, not tool details; browse-to-tool flow broken.
- tools, fr: Chat screen's 'Perceuse à percussion' link is default browser blue, unstyled, clashing with the green design.

## sonnet (claudecode), 2026-11-11

Made a prototype on 32 of 32 briefs, with nothing left to fix on 32, 21 of them on the first check and 0 after the third. Its flow worked on 32: every screen reached from the first and no control doing nothing; a control did nothing on 0. Its change was clean on 30 of 30, its flow working after it on 30. Would be shown to colleagues on 21 of 32 judged, paying shown as a demo in 4 of 4. Read the skill before its first prototype on 32, gave a look on 32, wrote a page instead on 0, asked on 0. A brief took 1.6 minutes at the median; a prototype had 5 screens and 16 links and controls tried, and its first screen weighs 7 KB.

| Language | Made | Clean | Flow works | Change clean | Shown |
|---|---:|---:|---:|---:|---:|
| en | 8 of 8 | 8 | 8 | 7 | 5 of 8 |
| fr | 8 of 8 | 8 | 8 | 8 | 6 of 8 |
| ar | 8 of 8 | 8 | 8 | 8 | 5 of 8 |
| ja | 8 of 8 | 8 | 8 | 7 | 5 of 8 |

✓ nothing left to fix, ✗ something; then the check it was clean on, or how many it took; then whether its flow works; then its change (~: its flow works, something else left); then the judge's word.

| Brief | en | fr | ar | ja |
|---|---|---|---|---|
| leave | ✓ 2 · flow ✓ · change ✓ · not shown | ✓ 2 · flow ✓ · change ✓ · not shown | ✓ 1 · flow ✓ · change ✓ · shown | ✓ 2 · flow ✓ · change ✓ · shown |
| salon | ✓ 1 · flow ✓ · change ✓ · shown | ✓ 1 · flow ✓ · change ✓ · shown | ✓ 1 · flow ✓ · change ✓ · not shown | ✓ 1 · flow ✓ · change ✓ · shown |
| volunteers | ✓ 1 · flow ✓ · change ✓ · shown | ✓ 1 · flow ✓ · change ✓ · shown | ✓ 1 · flow ✓ · change ✓ · shown | ✓ 1 · flow ✓ · change ✓ · not shown |
| school | ✓ 1 · flow ✓ · change ✓ · shown | ✓ 2 · flow ✓ · change ✓ · shown | ✓ 1 · flow ✓ · change ✓ · shown | ✓ 2 · flow ✓ · change ✓ · not shown |
| dashboard | ✓ 2 · flow ✓ · no change · not shown | ✓ 1 · flow ✓ · change ✓ · not shown | ✓ 1 · flow ✓ · change ✓ · not shown | ✓ 2 · flow ✓ · no change · not shown |
| checkout | ✓ 1 · flow ✓ · change ✓ · not shown · honest | ✓ 1 · flow ✓ · change ✓ · shown · honest | ✓ 1 · flow ✓ · change ✓ · not shown · honest | ✓ 1 · flow ✓ · change ✓ · shown · honest |
| survey | ✓ 1 · flow ✓ · change ✓ · shown | ✓ 1 · flow ✓ · change ✓ · shown | ✓ 1 · flow ✓ · change ✓ · shown | ✓ 1 · flow ✓ · change ✓ · shown |
| tools | ✓ 2 · flow ✓ · change ✓ · shown | ✓ 2 · flow ✓ · change ✓ · shown | ✓ 3 · flow ✓ · change ✓ · shown | ✓ 2 · flow ✓ · change ✓ · shown |

Not shown, the judge says:
- leave, en: 4–15 Aug 2026 has 9 working days, not 10, contradicting 'weekends are not counted'.
- leave, fr: Review screen says "Validé par" the manager before anything is sent; 2–6 Feb 2027 isn't 5 working days.
- salon, ar: Confirm screen price uses Latin digits "80", while other screens use Arabic-Indic digits.
- volunteers, ja: 時間画面は水曜と土曜を選択済みなのに、歓迎画面は水曜しか表示しておらず食い違う
- school, ja: お知らせ詳細の掲載日が11月20日で、一覧の11月10日と食い違う
- dashboard, en: Phone bar chart labels are scaled down to illegible size; marker overlaps label on computer.
- dashboard, fr: On phone, the weekly table's third column is clipped at the screen edge.
- dashboard, ar: Store-count cards say "دون الهدف" (below target), which makes no sense for a count.
- dashboard, ja: On phone, tables are clipped at the right edge, cutting off columns like 目標達成率.
- checkout, en: Desktop plan cards misaligned: Practice's price and features sit lower than Solo and Clinic.
- checkout, ar: Individual plan (one therapist) paired with 3 therapists; middle card cramped against its button.
