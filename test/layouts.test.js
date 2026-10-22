// Layouts (D215, D291): which shape a table, a list or a quote has, told from its Markdown alone,
// never its words: a comparison, steps, a note, a timeline, key figures, a checklist, or none.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lex, parser } from '../app/ui/markdown.js'
import { aligned, compared, marked, roomy, stepped, titled, sequenced, noted, timed, figured, ticked, columns } from '../app/caps/layouts/shapes.js'

/** The first block of some Markdown. @param {string} source @returns {any} */
const first = (source) => lex(source).find((token) => token.type !== 'space')

test('a table whose columns are options is a comparison, the one with a ★ recommended', () => {
  assert.deepEqual(compared(first('| | Free | Orange ★ | SFR |\n|---|---|---|---|\n| Total | €480 | **€360** | €600 |\n| Data | 100 GB | 80 GB | **200 GB** |\n| 5G | ✓ | ✓ | ✗ |')), { pick: 2 })
  // Its corner named and no ★: its rows are more alike than its columns, a price in each, a ✓ in each.
  assert.deepEqual(compared(first('| Critère | React | Vue |\n|---|---|---|\n| Prix | 0 | 0 |\n| Poids | 45 Ko | 34 Ko |\n| Typé | ✓ | ✗ |')), { pick: -1 })
  // In any language: a mark, an amount, a few words or more are told apart without reading them.
  assert.deepEqual(compared(first('| | 甲 | 乙 |\n|---|---|---|\n| 価格 | 480円 | 360円 |\n| 5G | ✓ | ✗ |')), { pick: -1 })
})

test('records, tables of numbers and small tables are no comparison', () => {
  // A column of prices, a column of sizes: each row is an option, each column a measure.
  assert.equal(compared(first('| Plan | Price | Data | Commitment |\n|---|---|---|---|\n| Free | €20 | 100 GB | None |\n| Orange | €15 | 80 GB | 12 months |')), null)
  // Numbers alone, even under an empty corner.
  assert.equal(compared(first('| | Q1 | Q2 | Q3 |\n|---|---|---|---|\n| Sales | 100 | 120 | 90 |\n| Costs | 80 | 85 | 70 |')), null)
  assert.equal(compared(first('| | A |\n|---|---|\n| x | 1 |\n| y | 2 |')), null, 'one option')
  assert.equal(compared(first('| | A | B |\n|---|---|---|\n| x | 1 | 2 |')), null, 'one row')
  assert.equal(compared(first('| | A | B | C | D | E | F |\n|---|---|---|---|---|---|---|\n| x | 1 | 2 | 3 | 4 | 5 | a |\n| y | 1 | 2 | 3 | 4 | 5 | b |')), null, 'six options')
})

test('a column of amounts, a number and no word, lines up at the end, unless the table says otherwise', () => {
  assert.deepEqual(aligned(first('| Month | Price | Share | Size | Note |\n|---|---|---|:-:|---|\n| 2026-01 | €1,200 | 12% | 3 | ok |\n| 2026-02 | **€980** | -4.5% | 4 | 10 GB |')), ['', 'right', 'right', 'center', ''])
})

test('a comparison whose options say much takes the room beside the text', () => {
  assert.ok(roomy(first(`| | iPhone 17 Pro | Google Pixel 10 Pro (Android) |
|---|---|---|
| Prix neuf | 1 299 € au lancement, environ 1 130 € aujourd'hui | **749 €** (prix habituel 999 €) |
| Mises à jour | 5 ans de suivi logiciel selon Back Market. Un revendeur annonce 7 ans, mais je n'ai pas trouvé de confirmation officielle d'Apple | **7 ans** de mises à jour de sécurité et du système |
| Photo et vidéo | Triple capteur 48 Mpx, très prisé des créateurs de contenu | Photos et vidéos de très haute qualité, avec beaucoup d'IA |
| Autonomie | Record de 33 heures | Plus de 24 h |
| Simplicité | Très cohérent, peu de réglages à faire | Simple aussi, mais avec plus d'options à régler |`)))
  assert.ok(!roomy(first('| | Free | Orange ★ | SFR |\n|---|---|---|---|\n| **Total** | €480 | **€360** | €600 |\n| **Commitment** | **None** | 12 months | 24 months |')))
  // A character of Chinese, Japanese or Korean takes two places.
  assert.ok(roomy(first(`| | 甲 | 乙 |\n|---|---|---|\n| 説明 | ${'長'.repeat(30)} | ${'短'.repeat(26)} |\n| 価格 | 1 | 2 |`)))
})

test('a comparison’s cell is the best of its row when it is all in bold, a yes or a no by its mark', () => {
  const [row, other] = first('| | A | B | C |\n|---|---|---|---|\n| x | **€360** | ✓ yes | ❌ |\n| y | **€360** a month | ✔️ | - |').rows
  assert.deepEqual(row.slice(1).map(marked), ['is-best', 'is-yes', 'is-no'])
  assert.deepEqual(other.slice(1).map(marked), ['', 'is-yes', ''])
})

test('numbered items that each start in bold are steps, titled where a colon, a dash or the line ends', () => {
  const steps = first('1. **Get the code**: call 3179.\n2. **Order the SIM** — online.\n3. **Turn it on** when it arrives.\n4. **Done**')
  assert.ok(stepped(steps))
  const titles = steps.items.map((/** @type {any} */ item) => titled(item.tokens[0].tokens))
  assert.deepEqual(titles.map((title) => title?.end), [': ', ' — ', undefined, ''])
  assert.equal(titles[0]?.rest[0].text, 'call 3179.')
  assert.equal(titled(first('1. **取得**：電話します\n2. **注文**：オンライン').items[0].tokens[0].tokens)?.end, '：')
  // Set apart, its first paragraph the title alone.
  assert.deepEqual(titled(first('1. **One**\n\n   Then this.\n\n2. **Two**\n\n   And that.').items[0].tokens[0].tokens), { end: '', rest: [] })
  assert.ok(!stepped(first('1. **One** thing\n2. Another')))
  assert.ok(!stepped(first('- **One**: a\n- **Two**: b')))
  assert.ok(!stepped(first('1. **Alone**: one step')))
})

// As a brain wrote it: each step a paragraph that starts in bold with its number, its details in a list.
const BUY = `## Steps to buy

**1. Choose new or used.**
- The 18 Pro is $1,199 new.
- A used 15 Pro costs roughly $500–680.

**2. Choose the storage.**
- The 18 Pro starts at 256GB.

**3. Decide how to pay.**
- You can pay in full.
- Compare the total over 24 months.

**4. Trade in your current phone** at Apple, your carrier or a reseller.

**5. Pick where to buy.**
- For the 18 Pro, use Apple or your carrier.

**6. If you buy used, check these:**
- It is unlocked.
- Battery health is 85% or higher.

**7. Order and set up.**
- Back up your old phone first.
- Use Quick Start.

If you tell me your budget, I can recommend one.`

/** Each block's type, and a list's items' first words. @param {any[]} tokens */
const outline = (tokens) => tokens.filter((token) => token.type !== 'space').map((token) => (token.type === 'list' ? token.items.map((/** @type {any} */ item) => item.tokens[0].tokens.map((/** @type {any} */ part) => part.tokens?.[0]?.text ?? part.text).join('')) : token.type))

test('steps written apart, each a paragraph that starts in bold with its number, are one list of steps', () => {
  const [heading, steps, closing, ...none] = sequenced(lex(BUY)).filter((token) => token.type !== 'space')
  assert.equal(heading.type, 'heading')
  assert.ok(stepped(steps))
  assert.equal(steps.start, 1)
  assert.deepEqual(outline([steps])[0], ['Choose new or used.', 'Choose the storage.', 'Decide how to pay.', 'Trade in your current phone at Apple, your carrier or a reseller.', 'Pick where to buy.', 'If you buy used, check these:', 'Order and set up.'])
  // Each holds its details; the last as many blocks as the longest before it, so the closing words stay out.
  assert.deepEqual(steps.items.map((/** @type {any} */ item) => item.tokens.filter((/** @type {any} */ block) => block.type === 'list').length), [1, 1, 1, 0, 1, 1, 1])
  assert.equal(closing.type, 'paragraph')
  assert.deepEqual(none, [])
  // The number in bold alone: the step has no title, its words its first line.
  assert.deepEqual(outline(sequenced(lex('**1.** Choose new\n\n**2.** Storage'))), [['Choose new', 'Storage']])
})

test('numbered lists cut apart by each step’s details are one list of steps; numbers out of turn are not', () => {
  assert.deepEqual(outline(sequenced(lex('1. **Choose**\n- a\n2. **Storage**\n- b\n\nDone.'))), [['Choose', 'Storage'], 'paragraph'])
  assert.deepEqual(outline(sequenced(lex('**1. One**\n\n**3. Three**'))), ['paragraph', 'paragraph'])
  assert.deepEqual(outline(sequenced(lex('**1. One**\n\n## Then\n\n**2. Two**'))), ['paragraph', 'heading', 'paragraph'])
  assert.deepEqual(outline(sequenced(lex('**1.5 GB** is plenty.\n\n**2 GB** is more.'))), ['paragraph', 'paragraph'])
  assert.deepEqual(outline(sequenced(lex('**1. Alone**\n- a'))), ['paragraph', ['a']])
})

test('a GitHub alert, or a quote that starts with an emoji, is a note', () => {
  assert.deepEqual(noted(first('> [!WARNING]\n> Leaving costs the months left.')), { kind: 'warning', title: '', text: 'Leaving costs the months left.' })
  assert.deepEqual(noted(first('> [!tip] Bon à savoir\n> Demandez.')), { kind: 'tip', title: 'Bon à savoir', text: 'Demandez.' })
  assert.deepEqual(noted(first('> ⚠️ **Attention :** il expire.')), { kind: 'warning' })
  assert.deepEqual(noted(first('> 💡 Astuce')), { kind: 'tip' })
  assert.deepEqual(noted(first('> 📌 À retenir')), { kind: 'note' })
  assert.equal(noted(first('> Être ou ne pas être')), null)
})

test('a list whose items start with a time or a date in bold is a timeline, in any language (D291)', () => {
  assert.ok(timed(first('- **09:00** Preheat the oven\n- **9h30** Bake\n- **10.15** Serve')))
  assert.ok(timed(first('- **2026-10-12** Launch\n- **1969**: the Moon\n- **12/10** Fair')))
  assert.ok(timed(first('- **09:00–10:30** Talk\n- **11:00 - 12:00** Lunch')))
  // A quantity, a word, a numbered list, a list with one item in bold, or one item, isn't.
  assert.ok(!timed(first('- **2 eggs** beaten\n- **200 g** flour')))
  assert.ok(!timed(first('- **Day 1** Paris\n- **Day 2** Lyon')))
  assert.ok(!timed(first('1. **09:00** Arrive\n2. **10:00** Leave')))
  assert.ok(!timed(first('- **09:00** Arrive\n- Then leave')))
  assert.ok(!timed(first('- **09:00** Arrive')))
})

test('two to six items, each a number in bold and a few words, are key figures (D291)', () => {
  assert.ok(figured(first('- **€118** in all\n- **4** people\n- **29,50 €** each')))
  assert.ok(figured(first('- **85%** done\n- **1 200** km')))
  // A word in the bold, many words after it, more than one paragraph, or seven items, aren't.
  assert.ok(!figured(first('- **2 h** away\n- **4** people')))
  assert.ok(!figured(first('- **4** people who will each pay their own share of the bill, tip included\n- **3** stalls')))
  assert.ok(!figured(first('- **4** people\n\n  More about them.\n- **3** stalls')))
  assert.ok(!figured(first(Array.from({ length: 7 }, (_, i) => `- **${i}** things`).join('\n'))))
})

test('a list of tasks, ticked or not, is a checklist (D291)', () => {
  assert.ok(ticked(first('- [ ] Passport\n- [x] Tickets')))
  assert.ok(!ticked(first('- [ ] Passport\n- Tickets')))
})


test('columns side by side, as Pandoc writes them, each with its own blocks, and a block of Pandoc\'s inside one (D501)', () => {
  parser.use({ extensions: [columns] })
  const [token] = lex(':::: columns\n::: column\n# One\n\n::: note\nInside.\n:::\n:::\n\n::: column\nTwo\n:::\n::::\nAfter.\n')
  assert.equal(token.type, 'columns')
  assert.equal(token.raw, ':::: columns\n::: column\n# One\n\n::: note\nInside.\n:::\n:::\n\n::: column\nTwo\n:::\n::::\n')
  assert.deepEqual(token.columns.map((/** @type {any} */ column) => column.tokens.filter((/** @type {any} */ t) => t.type !== 'space').map((/** @type {any} */ t) => t.type)), [['heading', 'paragraph'], ['paragraph']])
  assert.equal(token.columns[0].tokens.at(-1).text, '::: note\nInside.\n:::')
  // Not closed yet, as while an answer is being written: text until it is.
  assert.equal(lex(':::: columns\n::: column\nOne\n')[0].type, 'paragraph')
})
