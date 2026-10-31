// Pages of parts (D631): a ```html block holding only the visual skill's parts is read as data, to be drawn in the answer itself,
// and any other is a page for a frame; each part's lines are what it draws, numbers read as the language writes them.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parse, all, bound, key, frozen, figures, table, chart, form, number } from '../app/caps/interactive/parts.js'
import { shared } from '../app/caps/interactive/live.js'

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

test('while the answer writes it, whole lines alone, what is open closing at their end, and a tag cut across lines waiting for the rest; a doctype makes it a page from its first line', () => {
  const open = parse('<app-cards>\n<app-card heading="Spent">\n<app-table>\nWhat | €\nRent | 800\nFoo', true)
  assert.deepEqual(open?.[0].kids[0].kids.map((part) => table(part)), [{ heads: ['What', '€'], rows: [['Rent', '800']] }])
  assert.deepEqual(parse('<app-figures>\n1 | one\n</app-figures>\n<app-chart\n  kind="pie">', true)?.map((part) => part.tag), ['app-figures'])
  assert.deepEqual(parse('<app-figures>\n1 | one\n</app-figures>\n<app-chart\n  kind="pie">\n', true)?.map((part) => part.tag), ['app-figures', 'app-chart'])
  assert.equal(parse('<app-figures>\n1 | one\n</app-figures>\n<app-chart\n  kind="pie"'), null)
  // A doctype, as brains begin most pages, is no tag cut across lines: its frame begins with the first line (D289).
  for (const page of ['<!doctype html>\n<script>x</script>\n', '<!DOCTYPE html>\n', '<?xml version="1.0"?>\n']) assert.equal(parse(page, true), null, page)
})

test('a page begun is parts until a whole line says otherwise, so no frame is made as it begins only to be let go', () => {
  for (const begun of ['', '<app-fig', '\n', '<!-- the page -->\n']) assert.deepEqual(parse(begun, true), [], begun)
  assert.equal(parse('<p>Hello</p>\n', true), null)
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

test('a part’s where is part of what it is, so two parts that keep other rows keep apart what they showed, and a frozen page leaves it out', () => {
  const source = '<app-figures from="Expenses">\nsum Amount | Spent\n</app-figures>\n<app-figures from="Expenses" where="Date is this month">\nsum Amount | Spent\n</app-figures>'
  const [all_, month] = /** @type {import('../app/caps/interactive/parts.js').Part[]} */ (parse(source))
  assert.equal(key(all_), JSON.stringify(['app-figures', 'Expenses', '', '', false, 'sum Amount | Spent']))
  assert.equal(key(month), JSON.stringify(['app-figures', 'Expenses', '', '', false, 'sum Amount | Spent', 'Date is this month']))
  const page = /** @type {import('../app/caps/interactive/parts.js').Part[]} */ (parse(frozen(source, { [key(all_)]: '€1,250 | Spent', [key(month)]: '€310 | Spent' })))
  assert.deepEqual(page.map((part) => [part.attrs, figures(part)]), [[{}, [['€1,250', 'Spent']]], [{}, [['€310', 'Spent']]]])
})

test('a card’s own words are its paragraphs, a blank line between two, as brains write a line about what it holds', () => {
  const [cards] = /** @type {import('../app/caps/interactive/parts.js').Part[]} */ (parse('<app-cards>\n<app-card heading="Offer">\nFlat white and a croissant\nfor €6.50.\n\nUntil 11:00.\n<app-table>\nA\n1\n</app-table>\nThen more.\n</app-card>\n</app-cards>'))
  assert.deepEqual(cards.kids[0].kids.map((part) => [part.tag, part.text.trim()]), [['#text', 'Flat white and a croissant\nfor €6.50.\n\nUntil 11:00.'], ['app-table', 'A\n1'], ['#text', 'Then more.']])
  assert.equal(frozen('<app-card heading="Offer">\nTwo &lt; three\n</app-card>', {}), '<app-card heading="Offer">\nTwo &lt; three\n</app-card>')
})

test('words after the last part, as an answer that never closed its page writes its own, follow it; words before or between parts don’t', () => {
  const words = '\n\nAll the figures are **samples**. Send me yours and I’ll fill it in.\n'
  const parts = /** @type {import('../app/caps/interactive/parts.js').Part[]} */ (parse(`${GARDEN}${words}`))
  assert.deepEqual(parts.map((part) => part.tag), ['app-figures', 'app-cards', '#words'])
  assert.equal(parts[2].text, words)
  assert.deepEqual(parse(`<app-figures>\n1 | one\n</app-figures>\nIt says 3 < 4 and 2 > 1`)?.at(-1)?.text, '\nIt says 3 < 4 and 2 > 1')
  // As it is written: once a line of them is whole, with the line being written, until a tag comes after them.
  assert.deepEqual(parse('<app-figures>\n1 | one\n</app-figures>\n\nAll sam', true)?.map((part) => part.tag), ['app-figures'])
  assert.deepEqual(parse('<app-figures>\n1 | one\n</app-figures>\n\nAll samples.\nSend', true)?.at(-1), { tag: '#words', attrs: {}, text: '\n\nAll samples.\nSend', kids: [] })
  for (const page of ['<app-figures>\n1 | one\n</app-figures>\nThen:\n<app-table>\nA\n1\n</app-table>', '<app-figures>\n1 | one\n</app-figures>\nNow <b>this</b>', 'First\n<app-figures>\n1 | one\n</app-figures>',
    '<app-cards>\n<app-card>\n<app-table>\nA\n</app-table>\n</app-card>\nWords in the row\n</app-cards>', `${GARDEN}\nDone.\n<script>alert(1)</script>`]) assert.equal(parse(page), null, page)
  assert.equal(frozen(`<app-figures>\n1 | one\n</app-figures>\nSo 1 < 2 & more`, {}), '<app-figures>\n1 | one\n</app-figures>\nSo 1 &lt; 2 &amp; more')
})

test('an app- tag that names no part is passed over, what it holds read in its place, so a page brains wrapped or added to stays parts', () => {
  assert.deepEqual(parse(`<app-page>\n${GARDEN}\n</app-page>`), parse(GARDEN))
  assert.deepEqual(parse('<app-figures>\n1 | one\n</app-figures>\n<app-progress current="2" target="5"></app-progress>\n<app-calendar-view next="14:00" />')?.map((part) => part.tag), ['app-figures'])
  assert.deepEqual(form(/** @type {any} */ (parse('<app-form ask="Add">\n<app-input>Name</app-input>\n</app-form>'))[0]), [{ label: 'Name', kind: 'text', start: '' }])
  for (const page of ['<app-calendar-view next="14:00" />', '<app-page>\n<h1>Home</h1>\n<app-figures>\n1 | one\n</app-figures>\n</app-page>', '<app-cards>\n<app-figures>\n1\n</app-figures>\n</app-cards>']) assert.equal(parse(page), null, page)
})

// A page whose parts share their state (D670): its form's fields, what is worked out from them, its tables, figures and charts, all at once.
const LOAN = `<app-form>
Amount: 1000..100000..500 = 15000
Rate (%): 0.1..15..0.1 = 4.9
Years: 1..10 = 5
</app-form>
<app-values>
Monthly = Rate (%) / 1200
Payment = Amount * Monthly / (1 - (1 + Monthly) ^ (-12 * Years))
Balance = Amount * (1 + Monthly) ^ (12 * Year) - Payment * ((1 + Monthly) ^ (12 * Year) - 1) / Monthly
</app-values>
<app-figures>
€{Payment:2} | a month
€{Payment * 12 * Years - Amount:2} | interest in all
€{Payment * 12 * Years:2} | cost in all
</app-figures>
<app-cards>
<app-card heading="What is left over {Years} years">
<app-chart kind="area" from="plan" by="Year" sum="Balance"></app-chart>
</app-card>
<app-card heading="Year by year" wide>
<app-table id="plan" each="Year = 0..Years">
Year | Balance
{Year} | €{Balance:0}
</app-table>
</app-card>
</app-cards>`
/** A page's parts, and each drawn by what it shares, with `how` given. @param {string} page @param {Partial<Parameters<typeof shared>[1]>} [how] */
const drawnBy = (page, how = {}) => {
  const parts = /** @type {import('../app/caps/interactive/parts.js').Part[]} */ (parse(page)), state = shared(parts, { given: new Map(), added: new Map(), lang: 'en', locales: ['en'], ...how })
  return { state, of: (/** @type {string} */ tag) => state.filled(/** @type {any} */ (all(parts).find((part) => part.tag === tag))) }
}

test('a loan page works its numbers out itself, and its figures, table and chart all follow its form', () => {
  const start = drawnBy(LOAN)
  assert.equal(start.state.live, true)
  assert.deepEqual(figures(start.of('app-figures')), [['€282.38', 'a month'], ['€1,942.91', 'interest in all'], ['€16,942.91', 'cost in all']])
  assert.equal(start.of('app-card').attrs.heading, 'What is left over 5 years')
  assert.deepEqual(table(start.of('app-table')).rows.map(([year]) => year), ['0', '1', '2', '3', '4', '5'])
  assert.deepEqual(table(start.of('app-table')).rows.at(-1), ['5', '€0'])
  assert.equal(figures(drawnBy('<app-values>\nA = -0.001\n</app-values>\n<app-figures>\n{A:0} | none\n</app-figures>').of('app-figures'))[0][0], '0', 'never -0')
  const line = chart(start.of('app-chart'))
  assert.deepEqual(line.labels, ['0', '1', '2', '3', '4', '5'])
  assert.deepEqual(line.series.map(({ name }) => name), ['Balance'])
  // A chart's `sum` naming a value rather than a column, as brains write under another head: that value at each step.
  const named = chart(drawnBy(LOAN.replace('Year | Balance', 'Year | Left to pay')).of('app-chart'))
  assert.deepEqual(named.series[0].data.map(Math.round), [15000, 12286, 9436, 6443, 3300, 0])
  assert.equal(line.series[0].data[0], 15000)
  assert.equal(line.kind, 'area')

  // The user moves a field: all of it, from the state alone.
  const moved = drawnBy(LOAN, { given: new Map([['Years', '2'], ['Amount', '10000']]) })
  assert.deepEqual(figures(moved.of('app-figures')).map(([value]) => value), ['€438.27', '€518.39', '€10,518.39'])
  assert.deepEqual(chart(moved.of('app-chart')).labels, ['0', '1', '2'])
  assert.equal(moved.of('app-card').attrs.heading, 'What is left over 2 years')
  // A field left empty, as it is on its way to a number: no number, never code.
  assert.deepEqual(figures(drawnBy(LOAN, { given: new Map([['Amount', '']]) }).of('app-figures'))[0], ['€—', 'a month'])
})

test('a field is a number, a slider with or without its step, a choice or a box, and a formula reads it as what it is', () => {
  const fields = form(/** @type {any} */ ({ text: 'Years: 1..30 = 5\nRate: 0..15 = 4.9\nCost: 0..1000..50\nFine: -1.5..1.5..0.25 = 0', attrs: {} }))
  assert.deepEqual(fields.map(({ kind, min, max, step, start }) => [kind, min, max, step, start]), [['range', '1', '30', '1', '5'], ['range', '0', '15', '0.1', '4.9'], ['range', '0', '1000', '50', '0'], ['range', '-1.5', '1.5', '0.25', '0']])
  const page = `<app-form>
Term: 3, 5, 7 = 5
Plan: Basic, Pro
Insured: yes
Name = Ada
Days: number = 1,000
</app-form>
<app-figures>
{Term * 2} | twice
{if(Plan = "Basic", 10, 20)} | price
{if(Insured, "covered", "not")} | cover
{"Hi " + Name} | hello
{Days} | days
</app-figures>`
  assert.deepEqual(figures(drawnBy(page).of('app-figures')).map(([value]) => value), ['10', '10', 'covered', 'Hi Ada', '1,000'])
  assert.deepEqual(figures(drawnBy(page, { given: new Map(Object.entries({ Term: '7', Plan: 'Pro', Insured: false })) }).of('app-figures')).map(([value]) => value), ['14', '20', 'not', 'Hi Ada', '1,000'])
})

test('what brains slip on stays a page of parts: a leaf closed under another’s name, a number where a field’s kind goes', () => {
  assert.deepEqual(parse('<app-figures>\n1 | one\n</app-values>\n<app-table>\nA\n</app-table>')?.map((part) => part.tag), ['app-figures', 'app-table'])
  assert.equal(parse('<app-cards>\n<app-card>\n<app-figures>\n1 | one\n</app-table>\n</app-card>\n</app-cards>')?.[0].kids[0].kids[0].text, '\n1 | one\n')
  assert.equal(parse('<app-figures>\n1 | one\n</app-card>'), null, 'only a leaf closes a leaf')
  assert.deepEqual(form(/** @type {any} */ ({ text: 'Amount: 15000\nRate: 4.9\nName: words', attrs: {} })).map(({ kind, start }) => [kind, start]), [['number', '15000'], ['number', '4.9'], ['text', '']])
  assert.deepEqual(figures(drawnBy('<app-form>\nAmount: 15000\n</app-form>\n<app-figures>\n{Amount * 2} | twice\n</app-figures>').of('app-figures'))[0], ['30,000', 'twice'])
})

test('a field is read by its label or its first words, as brains shorten them, and a value that differs from it by its case is its own', () => {
  const page = `<app-form>
Weight (kg): 30..200..0.5 = 70
Tarif horaire HT: 10..200 = 65
TVA (%): 0..30 = 20
Rate (%): 0..10 = 5
</app-form>
<app-values>
Tva = Tarif * TVA / 100
</app-values>
<app-figures>
{Weight * 2} | short
{Weight (kg) * 2} | whole
{Tarif horaire * 2} | two words
{Tva} | the value
{TVA (%)} | the field
{Rate (%) / 5} | brackets
</app-figures>`
  assert.deepEqual(figures(drawnBy(page).of('app-figures')).map(([value]) => value), ['140', '140', '130', '13', '20', '1'])
})

test('numbers are said in the language, with two decimals at most or as many as a formula asks, a year as it is written', () => {
  const page = `<app-values>
Big = 1234.5678
Whole = 2
</app-values>
<app-figures>
{Big} | at most two
{Big:0} | none
{Big:3} | three
{Whole} | whole
{Whole:2} | two
</app-figures>
<app-table each="Year = 2026..2028">
Year | Big
{Year} | {Big}
</app-table>`
  assert.deepEqual(figures(drawnBy(page).of('app-figures')).map(([value]) => value), ['1,234.57', '1,235', '1,234.568', '2', '2.00'])
  assert.deepEqual(table(drawnBy(page).of('app-table')).rows, [['2026', '1,234.57'], ['2027', '1,234.57'], ['2028', '1,234.57']])
  const said = (/** @type {string} */ lang) => figures(drawnBy(page, { lang, locales: [lang] }).of('app-figures'))[0][0]
  assert.equal(said('fr'), '1 234,57')
  assert.equal(said('ar-u-nu-arab'), '١٬٢٣٤٫٥٧')
  // In a chart, a number as a chart's lines hold one, whatever the language.
  const pie = drawnBy('<app-values>\nBig = 1234.5678\n</app-values>\n<app-chart kind="pie">\nOne | Two\nBoth: {Big}, {Big:0}\n</app-chart>', { lang: 'fr', locales: ['fr'] })
  assert.deepEqual(chart(pie.of('app-chart'), 'fr').series[0].data, [1234.57, 1235])
})

test('a form’s row reaches the table it names, then what adds up that table: figures, formulas and a chart', () => {
  const page = `<app-form>
Budget: number = 100
</app-form>
<app-figures>
{sum Kg} | kg
{count} | harvests
{Budget - sum Kg} | left
</app-figures>
<app-table id="harvests">
Crop | Kg
Beans | 4.5
Tomatoes | 12
Beans | 1.5
</app-table>
<app-chart kind="pie" from="harvests" by="Crop" sum="Kg"></app-chart>
<app-chart from="harvests" by="Crop"></app-chart>
<app-form ask="Add" to="harvests">
Crop: Beans, Tomatoes
Kg: number
</app-form>`
  const parts = /** @type {import('../app/caps/interactive/parts.js').Part[]} */ (parse(page)), charts = all(parts).filter((part) => part.tag === 'app-chart'), how = { given: new Map(), lang: 'en', locales: ['en'] }
  const before = shared(parts, { ...how, added: new Map() })
  assert.equal(before.live, true)
  assert.deepEqual(figures(before.filled(/** @type {any} */ (all(parts).find((part) => part.tag === 'app-figures')))).map(([value]) => value), ['18', '3', '82'])
  assert.deepEqual(chart(before.filled(charts[0])).labels, ['Beans', 'Tomatoes'])
  assert.deepEqual(chart(before.filled(charts[0])).series, [{ name: 'Kg', data: [6, 12] }])
  assert.deepEqual(chart(before.filled(charts[1])).series, [{ name: 'Crop', data: [2, 1] }], 'without a sum, how many of each')

  const after = shared(parts, { ...how, added: new Map([['harvests', [['Courgettes', '2 | big']]]]) })
  assert.deepEqual(figures(after.filled(/** @type {any} */ (all(parts).find((part) => part.tag === 'app-figures')))).map(([value]) => value), ['20', '4', '80'])
  assert.deepEqual(chart(after.filled(charts[0])).labels, ['Beans', 'Tomatoes', 'Courgettes'])
  assert.deepEqual(table(after.filled(/** @type {any} */ (all(parts).find((part) => part.tag === 'app-table')))).rows.at(-1), ['Courgettes', '2 ¦ big'])
})

test('a choice named as a column keeps the rows that hold it, in the table and all that adds it up; one no row holds keeps them all', () => {
  const page = `<app-form>
Region: All, North, South
</app-form>
<app-table id="sales">
Month | Region | Sales
Jan | North | 10
Feb | North | 20
Jan | South | 5
</app-table>
<app-chart kind="bar" from="sales" by="Month" sum="Sales"></app-chart>
<app-figures>
{sum Sales} | sold
</app-figures>`
  const everything = drawnBy(page)
  assert.equal(everything.state.live, true)
  assert.equal(table(everything.of('app-table')).rows.length, 3)
  assert.deepEqual(chart(everything.of('app-chart')).series[0].data, [15, 20])
  assert.equal(figures(everything.of('app-figures'))[0][0], '35')
  const south = drawnBy(page, { given: new Map([['Region', 'South']]) })
  assert.deepEqual(table(south.of('app-table')).rows, [['Jan', 'South', '5']])
  assert.deepEqual(chart(south.of('app-chart')).labels, ['Jan'])
  assert.equal(figures(south.of('app-figures'))[0][0], '5')
})

test('a page with nothing to share stays as it was written: a form’s button, a literal brace; what can’t be worked out is a dash, never code, and never hangs', () => {
  const garden = drawnBy(GARDEN)
  assert.equal(garden.state.live, false)
  assert.deepEqual(figures(garden.of('app-figures')), [['12', 'plants (sample)'], ['€84', 'spent this season (sample)']])
  assert.equal(drawnBy('<app-table>\nName | Means\n{name} | the name\n</app-table>').state.live, false)
  assert.equal(table(drawnBy('<app-table>\nName | Means\n{name} | the name\n</app-table>').of('app-table')).rows[0][0], '{name}')

  const broken = drawnBy(`<app-form>
A: number = 2
</app-form>
<app-values>
Loop = Back + 1
Back = Loop + 1
Wrong = A +
Later = Earlier * 2
Earlier = A * 2
</app-values>
<app-figures>
{Loop} | loop
{Wrong} | wrong
{Nobody} | nobody
{A / 0} | none
{Later} | written before what it reads
</app-figures>
<app-table each="N = 1..1e9">
N
{N}
</app-table>
<app-table id="never" each="N = 1..A..0">
N
{N}
</app-table>`)
  assert.deepEqual(figures(broken.of('app-figures')).map(([value]) => value), ['—', '—', '—', '—', '8'])
  assert.equal(table(broken.of('app-table')).rows.length, 600)
  // A chart that names no column of its table, or a table with no rows, draws a gap, never a line of zeros, and breaks nothing.
  const lost = drawnBy('<app-table id="t">\nA | B\nx | 1\n</app-table>\n<app-chart from="t" by="Nope" sum="Nope"></app-chart>').of('app-chart')
  assert.deepEqual(chart(lost).series, [{ name: 'Nope', data: [NaN] }])
  assert.deepEqual(chart(drawnBy('<app-table id="t">\nA | B\n</app-table>\n<app-chart from="t" by="A" sum="B"></app-chart>').of('app-chart')).labels, [''])
  const tables = /** @type {any[]} */ (all(/** @type {any} */ (parse(`<app-table each="Plan = Basic, Pro">\nPlan\n{Plan}\n</app-table>`))))
  assert.deepEqual(table(shared(tables, { given: new Map(), added: new Map(), lang: 'en', locales: ['en'] }).filled(tables[0])).rows, [['Basic'], ['Pro']])
})

test('what a page now holds, told to the brain: its fields, what is worked out, and the rows a form added', () => {
  const { state } = drawnBy(LOAN, { given: new Map([['Years', '2']]), added: new Map([['plan', [['9', '€1']]]]) })
  assert.equal(state.now(), 'Amount: 15000; Rate (%): 4.9; Years: 2; Monthly: 0.0041; Payment: 657.4; plan, added: 9 | €1')
})

test('a chart or a form naming a table of its page shows that table, unless that table shows a collection; a page’s values are parts too', () => {
  const parts = all(/** @type {any} */ (parse('<app-table id="mine">\nA\n1\n</app-table>\n<app-table id="kept" from="Expenses"></app-table>\n<app-chart from="mine" by="A"></app-chart>\n<app-chart from="kept" by="A"></app-chart>\n<app-chart from="Books" by="A"></app-chart>\n<app-values>\nB = 1\n</app-values>')))
  const tables = parts.filter((part) => part.tag === 'app-table')
  assert.deepEqual(parts.map((part) => bound(part, tables)), [undefined, 'Expenses', undefined, 'Expenses', 'Books', undefined])
})
