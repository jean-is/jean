// Pages of parts (D631): a ```html block holding only the visual skill's parts is read as data, to be drawn in the answer itself,
// and any other is a page for a frame; each part's lines are what it draws, numbers read as the language writes them.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parse, all, bound, key, frozen, figures, table, chart, form, number } from '../app/caps/interactive/parts.js'

// The skill's own example (caps/skills/directory/visual/SKILL.md, step 7).
const GARDEN = `<app-figures>
12 | plants (sample)
€84 | spent this season (sample)
</app-figures>
<app-cards>
<app-card heading="Harvests" wide>
<app-table id="harvests">
Date | Crop | Kg
2026-09-02 | Tomatoes | 4.5
2026-09-15 | Beans | 1.2
</app-table>
</app-card>
<app-card heading="Kg by month">
<app-chart kind="bar">
Jul | Aug | Sep
Kg: 2, 6, 5.7
</app-chart>
</app-card>
<app-card heading="Log a harvest">
<app-form ask="Add harvest" to="harvests">
Date: date
Crop: Tomatoes, Beans, Courgettes
Kg: number
</app-form>
<app-form ask="Show season">
Season: 2025, 2026 = 2026
</app-form>
</app-card>
</app-cards>`

test('the skill’s example is parts alone, nested as it shows them, each with its attributes and lines', () => {
  const parts = /** @type {import('../app/caps/interactive/parts.js').Part[]} */ (parse(GARDEN))
  assert.deepEqual(parts.map((part) => part.tag), ['app-figures', 'app-cards'])
  const [harvests, months, log] = parts[1].kids
  assert.deepEqual([harvests.attrs, months.attrs.heading], [{ heading: 'Harvests', wide: '' }, 'Kg by month'])
  assert.deepEqual(figures(parts[0]), [['12', 'plants (sample)'], ['€84', 'spent this season (sample)']])
  assert.deepEqual(table(harvests.kids[0]), { heads: ['Date', 'Crop', 'Kg'], rows: [['2026-09-02', 'Tomatoes', '4.5'], ['2026-09-15', 'Beans', '1.2']] })
  assert.deepEqual(chart(months.kids[0]), { kind: 'bar', labels: ['Jul', 'Aug', 'Sep'], series: [{ name: 'Kg', data: [2, 6, 5.7] }] })
  assert.deepEqual(log.kids.map((one) => one.attrs), [{ ask: 'Add harvest', to: 'harvests' }, { ask: 'Show season' }])
  assert.deepEqual(form(log.kids[0]), [{ label: 'Date', kind: 'date', start: '' }, { label: 'Crop', kind: 'choice', choices: ['Tomatoes', 'Beans', 'Courgettes'], start: '' }, { label: 'Kg', kind: 'number', start: '' }])
  assert.deepEqual(form(log.kids[1]), [{ label: 'Season', kind: 'choice', choices: ['2025', '2026'], start: '2026' }])
})

test('a map or a diagram in an aside, comments, entities and a < in a cell are still parts', () => {
  const parts = parse(`<!-- the page -->\n<app-table>\nA | B\nx &lt; 5 | 3 < 4\n</app-table>\n<aside><app-map>{"type":"FeatureCollection","features":[]}</app-map></aside>\n<aside>\n<app-diagram>flowchart TD\nA --> B</app-diagram>\n</aside>`)
  assert.deepEqual(parts?.map((part) => part.tag), ['app-table', 'aside', 'aside'])
  assert.deepEqual(table(parts[0]).rows, [['x < 5', '3 < 4']])
  assert.equal(parts[1].kids[0].text, '{"type":"FeatureCollection","features":[]}')
  assert.equal(parts[2].kids[0].text, 'flowchart TD\nA --> B')
})

test('a script, a style, another tag, a tag inside a part or words outside one make it a page for a frame', () => {
  for (const page of [`${GARDEN}\n<script>alert(1)</script>`, '<style>p { color: red }</style>\n<app-figures>\n1 | one\n</app-figures>', '<p>Hello</p>',
    '<app-table>\nA\n<b>1</b>\n</app-table>', 'Here it is:\n<app-figures>\n1 | one\n</app-figures>', '<app-cards>\n<app-table>\nA\n</app-table>\n</app-cards>', '</app-card>', '']) {
    assert.equal(parse(page), null, page)
  }
})

test('while the answer writes it, whole lines alone, what is open closing at their end, and a tag cut across lines waiting for the rest', () => {
  const open = parse('<app-cards>\n<app-card heading="Spent">\n<app-table>\nWhat | €\nRent | 800\nFoo', true)
  assert.deepEqual(open?.[0].kids[0].kids.map((part) => table(part)), [{ heads: ['What', '€'], rows: [['Rent', '800']] }])
  assert.deepEqual(parse('<app-figures>\n1 | one\n</app-figures>\n<app-chart\n  kind="pie">', true)?.map((part) => part.tag), ['app-figures'])
  assert.deepEqual(parse('<app-figures>\n1 | one\n</app-figures>\n<app-chart\n  kind="pie">\n', true)?.map((part) => part.tag), ['app-figures', 'app-chart'])
  assert.equal(parse('<app-figures>\n1 | one\n</app-figures>\n<app-chart\n  kind="pie"'), null)
})

test('numbers as each language writes them, in its own digits, and plain in a part’s lines', () => {
  assert.deepEqual([number('1 234,5', 'fr'), number('1.234,5', 'de'), number('€1,234.50', 'en'), number('−3 %', 'en')], [1234.5, 1234.5, 1234.5, -3])
  assert.deepEqual([number('١٢٬٣٤٥٫٦', 'ar'), number('۱۲٬۳۴۵٫۶', 'fa'), number('１２３', 'ja'), number('१२३', 'hi'), number('Nothing', 'en')], [12345.6, 12345.6, 123, 123, NaN])
  assert.deepEqual(chart(/** @type {any} */ ({ attrs: { kind: 'line' }, text: 'Jan | Feb\nSales: 5.7, ٤', kids: [] }), 'de'), { kind: 'line', labels: ['Jan', 'Feb'], series: [{ name: 'Sales', data: [5.7, 4] }] })
})

// Parts that show a collection (D633).
const EXPENSES = `<app-figures from="Expenses">
count | Expenses
sum Amount | Spent
</app-figures>
<app-chart kind="bar" from="Expenses" by="Category" sum="Amount"></app-chart>
<app-table id="spent" from="Expenses">
Date | Amount
</app-table>
<app-form ask="Add" to="spent"></app-form>
<app-form ask="Add too" to="Expenses"></app-form>
<app-table id="notes">
Note
</app-table>
<app-form ask="Note it" to="notes">
Note: long
</app-form>`

test('a part shows a collection by its from, a form adds to one by its to, or through a table of the page that shows one, else to the page', () => {
  const parts = all(/** @type {import('../app/caps/interactive/parts.js').Part[]} */ (parse(EXPENSES))), tables = parts.filter((part) => part.tag === 'app-table')
  assert.deepEqual(parts.map((part) => bound(part, tables)), ['Expenses', 'Expenses', 'Expenses', 'Expenses', 'Expenses', undefined, undefined])
  assert.equal(new Set(parts.map(key)).size, parts.length)
  assert.equal(key(parts[1]), JSON.stringify(['app-chart', 'Expenses', 'Category', 'Amount', false, '']))
})

test('a page frozen, for a copy or a download: each bound part’s lines as it showed them, what binds it taken out, the rest as it was', () => {
  const parts = all(/** @type {import('../app/caps/interactive/parts.js').Part[]} */ (parse(EXPENSES)))
  const fills = { [key(parts[0])]: '3 | Expenses\n€1,250 | Spent', [key(parts[2])]: 'Date | Amount\n2026-10-01 | 12 < 20' }
  const page = /** @type {import('../app/caps/interactive/parts.js').Part[]} */ (parse(frozen(EXPENSES, fills)))
  assert.deepEqual(page.map((part) => [part.tag, part.attrs]), [['app-figures', {}], ['app-chart', { kind: 'bar', from: 'Expenses', by: 'Category', sum: 'Amount' }], ['app-table', { id: 'spent' }],
    ['app-form', { ask: 'Add', to: 'spent' }], ['app-form', { ask: 'Add too', to: 'Expenses' }], ['app-table', { id: 'notes' }], ['app-form', { ask: 'Note it', to: 'notes' }]])
  assert.deepEqual(figures(page[0]), [['3', 'Expenses'], ['€1,250', 'Spent']])
  assert.deepEqual(table(page[2]).rows, [['2026-10-01', '12 < 20']])
  assert.equal(frozen('<p>Not parts</p>', fills), '<p>Not parts</p>')
})

test('a card’s own words are its paragraphs, a blank line between two, as brains write a line about what it holds', () => {
  const [cards] = /** @type {import('../app/caps/interactive/parts.js').Part[]} */ (parse('<app-cards>\n<app-card heading="Offer">\nFlat white and a croissant\nfor €6.50.\n\nUntil 11:00.\n<app-table>\nA\n1\n</app-table>\nThen more.\n</app-card>\n</app-cards>'))
  assert.deepEqual(cards.kids[0].kids.map((part) => [part.tag, part.text.trim()]), [['#text', 'Flat white and a croissant\nfor €6.50.\n\nUntil 11:00.'], ['app-table', 'A\n1'], ['#text', 'Then more.']])
  assert.equal(frozen('<app-card heading="Offer">\nTwo &lt; three\n</app-card>', {}), '<app-card heading="Offer">\nTwo &lt; three\n</app-card>')
})
