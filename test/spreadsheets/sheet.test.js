// SPDX-License-Identifier: MIT
// The reader's rules, one at a time (collections, phase 0a): what sheet.js makes of small grids, apart from the twenty sheets
// scripts/spreadsheets.js measures it on. Run with: node --test test/spreadsheets/
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { first, read } from './sheet.js'
import { cellsOf, shown, strings, sheetCells } from './cells.js'
import { checkCell } from '../../app/caps/tables/table.js'

/** A grid from plain values: text, numbers, true and false, null for an empty cell, or a cell as cells.js gives it. @param {unknown[][]} lines */
const grid = (lines) => lines.map((line) => line.map((value) => (value === null ? undefined : typeof value === 'string' ? { value, kind: 'text' } : typeof value === 'number' ? { value, kind: 'number' } : typeof value === 'boolean' ? { value, kind: 'boolean' } : value)))
/** One column's values, read under a head, with filler rows so that kinds settle. @param {string[]} written @param {string} [region] */
const column = (written, region) => { const reading = read(/** @type {any} */ (grid([['Name', 'It'], ...written.map((value, i) => [`row ${i}`, value])])), { region }); return { type: reading.columns[1].type, format: reading.columns[1].format, currency: reading.columns[1].currency, values: reading.rows.map((row) => row[1]), reading } }

test('numbers as people write them, by region', () => {
  assert.deepEqual(column(['1,234.50', '1,234', '(45.00)', '-12', '+3', '1 234', '0.5', '12'], 'en-US').values, [1234.5, 1234, -45, -12, 3, 1234, 0.5, 12])
  assert.deepEqual(column(['1 234,50', '12,5', '1.234,56', '-35,00', '−7', '1 000 000'], 'fr-FR').values, [1234.5, 12.5, 1234.56, -35, -7, 1000000])
  assert.deepEqual(column(['1.234', '2.500'], 'en-US').values, [1.234, 2.5], 'a lone point before three digits is a decimal where the region writes it so')
  assert.deepEqual(column(['1.234', '2.500'], 'fr-FR').values, [1234, 2500], 'and thousands where it does not')
  assert.deepEqual(column(['1,234', '12.50'], 'fr-FR').values, [1234, 12.5], 'the column\'s other numbers settle it before the region')
  assert.deepEqual(column(['1,234', '2,500'], 'fr-FR').values, [1.234, 2.5])
  assert.deepEqual(column(["1'234.50", "12'000"], 'de-CH').values, [1234.5, 12000])
  assert.deepEqual(column(['١٬٢٣٤٫٥٠', '١٢٣٤', '۱۲'], 'ar-EG').values, [1234.5, 1234, 12])
  assert.deepEqual(column(['１，２００', '３００'], 'ja-JP').values, [1200, 300])
})

test('money and shares by their signs', () => {
  assert.deepEqual(column(['1 234,50 €', '12,90 €', '-35,00 €'], 'fr-FR'), { ...column(['1 234,50 €', '12,90 €', '-35,00 €'], 'fr-FR'), type: 'number', format: 'money', currency: 'EUR', values: [1234.5, 12.9, -35] })
  assert.equal(column(['$1,234.50', '($45.00)', '-$3'], 'en-US').currency, 'USD')
  assert.deepEqual(column(['$1,234.50', '($45.00)', '-$3'], 'en-US').values, [1234.5, -45, -3])
  assert.equal(column(['$10', '$20'], 'en-CA').currency, 'CAD', 'a sign several currencies share is the region\'s own')
  assert.equal(column(['£10', '£20'], 'en-GB').currency, 'GBP')
  assert.deepEqual([column(['¥1,200', '1,200円', '３２０万円', '△500円'], 'ja-JP').currency, column(['¥1,200', '1,200円', '３２０万円', '△500円'], 'ja-JP').values], ['JPY', [1200, 1200, 3200000, -500]])
  assert.deepEqual([column(['٤٬٥٠٠٫٠٠ ج.م', '22,000 EGP', '300 ج.م.'], 'ar-EG').currency, column(['٤٬٥٠٠٫٠٠ ج.م', '22,000 EGP', '300 ج.م.'], 'ar-EG').values], ['EGP', [4500, 22000, 300]])
  assert.deepEqual(column(['1 234,50 EUR', 'CHF 12.50'], 'fr-FR').values, [1234.5, 12.5])
  assert.deepEqual([column(['20 %', '5,5 %', '0 %'], 'fr-FR').format, column(['20 %', '5,5 %', '0 %'], 'fr-FR').values], ['percent', [0.2, 0.055, 0]])
  assert.deepEqual(column(['٪٢٠', '20٪', '１０％'], 'ar-EG').values, [0.2, 0.2, 0.1])
})

test('what is no number stays text', () => {
  for (const written of ['007', '0612345678', '12 kg', 'N° 5', '1e5', '3/4', '12:30', '2026-014', '$65,000–$75,000', '1,23,4', '12.345.6']) assert.equal(typeof column([written, written]).values[0], 'string', written)
})

test('dates as people write them', () => {
  assert.deepEqual(column(['2026-03-04', '2026/3/4', '2026.03.04', '2026年3月4日', '２０２６／３／４', '2026-03-04T14:30:00Z', '2026-03-04 09:05']).values, ['2026-03-04', '2026-03-04', '2026-03-04', '2026-03-04', '2026-03-04', '2026-03-04T14:30', '2026-03-04T09:05'])
  assert.deepEqual(column(['04/03/2026', '05/03/2026'], 'fr-FR').values, ['2026-03-04', '2026-03-05'])
  assert.deepEqual(column(['04/03/2026', '05/03/2026'], 'en-US').values, ['2026-04-03', '2026-05-03'])
  assert.deepEqual(column(['04/03/2026', '13/03/2026'], 'en-US').values, ['2026-03-04', '2026-03-13'], 'a 13 settles day first, whatever the region')
  assert.deepEqual(column(['04/03/2026', '03/13/2026'], 'fr-FR').values, ['2026-04-03', '2026-03-13'])
  assert.deepEqual(column(['4.3.26', '04-03-2026', '4/3/99'], 'de-DE').values, ['2026-03-04', '2026-03-04', '1999-03-04'])
  assert.deepEqual(column(['4 mars 2026', '1er février 2026', '12 déc. 2025'], 'fr-FR').values, ['2026-03-04', '2026-02-01', '2025-12-12'])
  assert.deepEqual(column(['March 4, 2026', 'Mar 4, 2026', '4 Mar 2026', '4-Mar-26', 'Sept 9, 2026'], 'ja-JP').values, ['2026-03-04', '2026-03-04', '2026-03-04', '2026-03-04', 'Sept 9, 2026'].map((value, i) => (i === 4 ? null : value)))
  assert.deepEqual(column(['٣ يناير ٢٠٢٦', '١٥ فبراير ٢٠٢٦'], 'ar-EG').values, ['2026-01-03', '2026-02-15'])
  assert.deepEqual(column(['1/14/2026 3:30 PM', '1/15/2026 12:05 AM'], 'en-US').values, ['2026-01-14T15:30', '2026-01-15T00:05'])
  for (const written of ['31/02/2026', '2026-13-01', '4 mars', 'mars 2026']) assert.equal(column([written, 'autre'], 'fr-FR').type, 'text', written)
  const settled = (/** @type {string[]} */ written, /** @type {string} */ region) => column(written, region).reading.dates
  assert.deepEqual(settled(['04/03/2026', '05/03/2026'], 'fr-FR'), { order: 'dmy', settled: false })
  assert.deepEqual(settled(['04/03/2026', '25/03/2026'], 'en-US'), { order: 'dmy', settled: true })
  assert.deepEqual(settled(['2026-03-04'], 'en-US'), { order: 'mdy', settled: true })
})

test('kinds: ticks, addresses, phones, selects', () => {
  assert.deepEqual([column(['Yes', 'no', 'Y', 'N', 'TRUE']).type, column(['Yes', 'no', 'Y', 'N', 'TRUE']).values], ['checkbox', [true, false, true, false, true]])
  assert.deepEqual(read(/** @type {any} */ (grid([['Nom', 'Vu'], ['a', 'x'], ['b', null], ['c', 'x'], ['d', '✓']]))).rows.map((row) => row[1]), [true, null, true, true])
  assert.deepEqual(read(/** @type {any} */ (grid([['Nom', 'Réglé'], ['a', 'Oui'], ['b', 'Non'], ['c', 'O'], ['d', 'non']])), { yes: ['Oui'], no: ['Non'] }).rows.map((row) => row[1]), [true, false, true, false])
  assert.equal(column(['a@example.org', 'b.c@example.co.uk']).type, 'email')
  assert.deepEqual(column(['https://example.org/a', 'www.example.com/b']).values, ['https://example.org/a', 'https://www.example.com/b'])
  for (const phones of [['06 12 34 56 78', '+33 6 12 34 56 78'], ['(415) 555-0134', '415-555-0134'], ['090-1234-5678', '０９０－１２３４－５６７８'], ['+33612345678', '0033 6 12 34 56 78'], ['٠١٠٠ ١٢٣ ٤٥٦٧', '0100 123 4567']]) assert.equal(column(phones).type, 'phone', phones[0])
  assert.equal(column(['０９０－１２３４－５６７８', '090-1234-5678']).values[0], '090-1234-5678')
  assert.equal(column(['2026-014', '2026-015', '2026-016']).type, 'text', 'a reference is no phone')
  assert.deepEqual([column(['Paid', 'Pending', 'Paid', 'Paid', 'Refunded', 'Pending']).type, column(['Paid', 'Pending', 'Paid', 'Paid', 'Refunded', 'Pending']).reading.columns[1].options], ['select', ['Paid', 'Pending', 'Refunded']])
  assert.equal(column(['Ann', 'Bob', 'Cy', 'Dee', 'Ann']).type, 'text', 'four distinct in five cells are names')
  assert.equal(column(['12', 'n/a', '14', '15', '16', '17']).type, 'number')
  assert.deepEqual(column(['12', 'n/a', '14', '15', '16', '17']).reading.left, [{ why: 'value', where: 'B3' }])
  assert.equal(column(['12', 'n/a', 'soon', '15']).type, 'text', 'under four in five, a column is text')
})

test('the heads: under a title, on two lines, with none, away from A1', () => {
  const titled = read(/** @type {any} */ (grid([['Budget 2026'], [], ['Poste', 'Montant'], ['Eau', 120], ['Gaz', 80]])))
  assert.deepEqual([titled.heads, titled.columns.map((one) => one.name), titled.left], [2, ['Poste', 'Montant'], [{ why: 'above', where: 'A1:B2' }]])
  const wide = read(/** @type {any} */ (grid([['Club', 'Saison 2026'], ['Nom', 'Prénom', 'Ville', 'Rôle'], ['Durand', 'Léa', 'Nantes', 'Trésorière'], ['Petit', 'Marc', 'Rezé', 'Membre']])))
  assert.equal(wide.heads, 1, 'a line of twice as many words under a title of two cells')
  const none = read(/** @type {any} */ (grid([['2026-01-05', 'Loyer', -650], ['2026-01-07', 'Courses', -82.4]])))
  assert.deepEqual([none.heads, none.columns, none.rows, none.left], [-1, [], [], [{ why: 'none', where: 'A1:C2' }]], 'a sheet with no heads is declined, said whole (round 2)')
  const away = read(/** @type {any} */ (grid([[], [null, 'Liste'], [], [null, 'Item', 'Qty'], [null, 'Paper', 5], [null, 'Ink', 2]])))
  assert.deepEqual([away.heads, away.columns.map((one) => [one.name, one.at]), away.rows], [3, [['Item', 1], ['Qty', 2]], [['Paper', 5], ['Ink', 2]]])
  const years = read(/** @type {any} */ (grid([['Item', 2024, 2025], ['Rent', 1200, 1250], ['Power', 300, 320]])))
  assert.deepEqual([years.heads, years.columns.map((one) => one.name)], [0, ['Item', '2024', '2025']])
  const two = read(/** @type {any} */ (grid([['Name', 'Contact', null, 'Fee'], [null, 'Email', 'Phone', null], ['Ann', 'ann@example.org', '+44 7700 900551', 28], ['Bob', 'bob@example.org', '+44 7700 900552', 15]])), { merges: [{ top: 0, left: 0, bottom: 1, right: 0 }, { top: 0, left: 1, bottom: 0, right: 2 }, { top: 0, left: 3, bottom: 1, right: 3 }] })
  assert.deepEqual([two.heads, two.columns.map((one) => one.name)], [1, ['Name', 'Email', 'Phone', 'Fee']])
  assert.deepEqual(read([]), { heads: -1, columns: [], rows: [], from: [], foot: null, dates: { order: 'mdy', settled: true }, shape: 'list', left: [], doubts: [] })
  const one = read(/** @type {any} */ (grid([['Item', 'Qty'], ['Paper', 5]])))
  assert.deepEqual([one.heads, one.rows], [0, [['Paper', 5]]])
})

test('names: each its own, never empty', () => {
  const reading = read(/** @type {any} */ (grid([['Phone', 'phone', null, 'Montant\nTTC', '  Budget   '], ['01632 960114', '07700 900142', 'note', 1, 2], ['01632 960115', '07700 900143', 'other', 3, 4]])))
  assert.deepEqual(reading.columns.map((one) => one.name), ['Phone', 'phone 2', 'C', 'Montant TTC', 'Budget'])
})

test('the foot, subtotals and parts', () => {
  const plain = read(/** @type {any} */ (grid([['Poste', 'Montant'], ['Eau', 120], ['Gaz', 80], ['Loyer', 400], ['Total', 600]])))
  assert.deepEqual([plain.rows.length, plain.foot], [3, { at: 4, sums: [null, 600] }], 'two columns, the last line the sum of three')
  const none = read(/** @type {any} */ (grid([['Poste', 'Montant'], ['A', 10], ['B', 20], ['C', 30]])))
  assert.deepEqual([none.rows.length, none.foot], [3, null], 'thirty after ten and twenty is a row')
  const spaced = read(/** @type {any} */ (grid([['Date', 'Quoi', 'Montant'], ['2026-01-05', 'Eau', 120], ['2026-01-06', 'Gaz', 80], [], ['Total', null, 200]])))
  assert.deepEqual([spaced.rows.length, spaced.foot?.sums], [2, [null, null, 200]], 'a total after an empty line')
  const parts = read(/** @type {any} */ (grid([['Poste', 'Prévu', 'Réel'], ['Recettes'], ['Cotisations', 100, 110], ['Dons', 50, 40], ['Total recettes', 150, 150], ['Dépenses'], ['Eau', 30, 35], ['Salle', 90, 90], ['Total dépenses', 120, 125]])))
  assert.deepEqual([parts.rows.map((row) => row[0]), parts.foot, parts.left], [['Cotisations', 'Dons', 'Eau', 'Salle'], null, [{ why: 'section', where: 'A2:C2' }, { why: 'subtotal', where: 'A5:C5' }, { why: 'section', where: 'A6:C6' }, { why: 'subtotal', where: 'A9:C9' }]])
  const grand = read(/** @type {any} */ (grid([['Poste', 'Cat', 'Prévu', 'Réel'], ['a', 'x', 1, 2], ['b', 'x', 3, 4], ['Sous-total', null, 4, 6], ['c', 'y', 5, 6], ['d', 'y', 7, 9], ['Sous-total', null, 12, 15], ['Total', null, 16, 21]])))
  assert.deepEqual([grand.rows.length, grand.foot], [4, { at: 7, sums: [null, null, 16, 21] }])
})

test('where the table stops: another below, another beside, empty lines and columns inside', () => {
  const below = read(/** @type {any} */ (grid([['Poste', 'Montant'], ['Eau', 120], ['Gaz', 80], [], ['Dépenses'], ['Poste', 'Montant'], ['Salle', 90]])))
  assert.deepEqual([below.rows.length, below.left], [2, [{ why: 'below', where: 'A5:B7' }]])
  const note = read(/** @type {any} */ (grid([['Poste', 'Montant'], ['Eau', 120], ['Gaz', 80], [], ['Chiffres provisoires']])))
  assert.deepEqual([note.rows.length, note.left], [2, [{ why: 'below', where: 'A5:B5' }]])
  const inside = read(/** @type {any} */ (grid([['Nom', null, 'Ville', 'Âge'], ['Ann', null, 'Nantes', 31], [], ['Bob', null, 'Rezé', 44], ['Cy', null, 'Nantes', 27]])))
  assert.deepEqual([inside.columns.map((one) => one.name), inside.rows.length, inside.left], [['Nom', 'Ville', 'Âge'], 3, [{ why: 'empty', where: 'B1:B5' }, { why: 'empty', where: 'A3:D3' }]])
  const beside = read(/** @type {any} */ (grid([['Date', 'Quoi', 'Montant', null, 'Quoi', 'Somme'], ['2026-01-05', 'Eau', 120, null, 'Eau', 120], ['2026-01-06', 'Gaz', 80, null, 'Gaz', 160], ['2026-01-07', 'Gaz', 80], ['2026-01-08', 'Eau', 10], ['2026-01-09', 'Eau', 10]])))
  assert.deepEqual([beside.columns.map((one) => one.name), beside.left], [['Date', 'Quoi', 'Montant'], [{ why: 'beside', where: 'E1:F6' }]])
})

test('formulas that kept no result are said, and every value is one Tables takes', () => {
  const formula = { value: null, kind: 'empty', formula: true }
  const reading = read(/** @type {any} */ (grid([['Item', 'Qty', 'Price', 'Total', 'Paid'], ['Paper', 2, 4.5, formula, true], ['Ink', 1, 30, formula, false], ['Pens', 10, formula, formula, true]])))
  assert.deepEqual([reading.columns.map((one) => one.name), reading.left], [['Item', 'Qty', 'Price', 'Paid'], [{ why: 'formula', where: 'C4' }, { why: 'formula', where: 'D1:D4' }]])
  for (const [c, one] of reading.columns.entries()) for (const row of reading.rows) assert.equal(checkCell(/** @type {any} */ (one), row[c]), null)
})

test('cells: strings without their readings, formats as dates, shares, money and codes', () => {
  assert.deepEqual(strings('<sst><si><t>東京</t><rPh sb="0" eb="2"><t>トウキョウ</t></rPh><phoneticPr fontId="1"/></si><si/><si><r><rPr><b/></rPr><t>Total</t></r><r><t xml:space="preserve"> 2026 &amp; after</t></r></si></sst>'), ['東京', '', 'Total 2026 & after'])
  const styles = shown(`<styleSheet><numFmts><numFmt numFmtId="44" formatCode="_(&quot;$&quot;* #,##0.00_);_(&quot;$&quot;* \\(#,##0.00\\)"/><numFmt numFmtId="164" formatCode="#,##0.00\\ &quot;€&quot;"/><numFmt numFmtId="165" formatCode="#,##0\\ [$€-40C]"/><numFmt numFmtId="166" formatCode="[$-409]d\\ mmm\\ yyyy"/><numFmt numFmtId="167" formatCode="0.0%"/><numFmt numFmtId="168" formatCode="#,##0&quot;円&quot;"/><numFmt numFmtId="169" formatCode="0#&quot; &quot;##&quot; &quot;##&quot; &quot;##&quot; &quot;##"/><numFmt numFmtId="170" formatCode="#,##0;&quot;△ &quot;#,##0"/><numFmt numFmtId="171" formatCode="00000"/><numFmt numFmtId="172" formatCode="$#,##0.00"/></numFmts>
    <cellXfs><xf numFmtId="0"/><xf numFmtId="44"/><xf numFmtId="164"/><xf numFmtId="165"/><xf numFmtId="166"/><xf numFmtId="167"/><xf numFmtId="168"/><xf numFmtId="169"/><xf numFmtId="170"/><xf numFmtId="171"/><xf numFmtId="172"/><xf numFmtId="14"/><xf numFmtId="9"/><xf numFmtId="8"/><xf numFmtId="3"/></cellXfs></styleSheet>`)
  assert.deepEqual(styles, [{}, { format: 'money', currency: '$' }, { format: 'money', currency: '€' }, { format: 'money', currency: '€' }, { date: true }, { format: 'percent' }, { currency: '円' }, { code: '0# ## ## ## ##' }, {}, { code: '00000' }, { format: 'money', currency: '$' }, { date: true }, { format: 'percent' }, { format: 'money' }, {}])
  const sheet = (/** @type {boolean} */ date1904) => sheetCells('<worksheet><sheetData><row r="2"><c r="B2" s="7"><v>612345678</v></c><c r="C2" s="9"><v>1000</v></c><c r="D2" s="11"><v>46085</v></c><c r="E2" s="11"><v>46085.604166666664</v></c><c r="F2" s="2"><f>B2*2</f></c><c r="G2" t="b"><v>1</v></c><c r="H2" t="inlineStr"><is><t>in place</t></is></c></row></worksheet>', [], styles, date1904).cells[1].slice(1)
  assert.deepEqual(sheet(false), [{ value: '06 12 34 56 78', kind: 'text' }, { value: '01000', kind: 'text' }, { value: '2026-03-04', kind: 'date' }, { value: '2026-03-04T14:30', kind: 'date' }, { value: null, kind: 'empty', formula: true }, { value: true, kind: 'boolean' }, { value: 'in place', kind: 'text' }])
  assert.deepEqual(sheet(true).slice(2, 4), [{ value: '2030-03-05', kind: 'date' }, { value: '2030-03-05T14:30', kind: 'date' }])
})

test('what real files taught: signs that are words, references, midnight, lines above and below', () => {
  // Numbers' exports, and an audit workbook this repository keeps (docs/trust/rgaa-audit-2026-11.xlsx).
  for (const written of ['P10', 'Q1', '12 km', 'K2', 'R5', '3 l']) assert.equal(typeof column([written, 'autre']).values[0], 'string', `${written} is no money`)
  assert.deepEqual(column(['1.1', '1.2', '1.10', '2.1', '2.10']).values, ['1.1', '1.2', '1.10', '2.1', '2.10'], 'numbers that only their last zeros tell apart are references')
  assert.deepEqual(column(['1.5', '2.25', '10.75']).values, [1.5, 2.25, 10.75])
  assert.deepEqual(column(['03/01/2026 00:00', '19/01/2026 00:00'], 'fr-FR').values, ['2026-01-03', '2026-01-19'], 'Numbers writes 00:00 after every date')
  const pages = read(/** @type {any} */ (grid([['Criterion', 'Theme', 'P01', 'P10'], ['1.1', 'Images', 'C', 'NA'], ['1.2', 'Images', 'NC', 'C']])))
  assert.deepEqual([pages.heads, pages.columns.map((one) => one.name)], [0, ['Criterion', 'Theme', 'P01', 'P10']])
  const few = read(/** @type {any} */ (grid([['Title'], ['Ref', 'What', 'How', 'Criteria'], ['U1', 'Screen reader', 'By a person', '4.13, 7.1'], ['U2', 'Checkers', 'In Word', 8.2]])))
  assert.equal(few.heads, 1, 'a first row of words alone doesn\'t take the heads\' place')
  const tiers = read(/** @type {any} */ (grid([['Poste', 'Budget 2026', null, 'Rappel 2025', 'Reçu le'], [null, 'Prévu', 'Réalisé', 'Réalisé', null], ['Dons', 400, 615, 380, '2026-06-30'], ['Ventes', 900, 1042.5, 870, '2026-04-25']])))
  assert.deepEqual([tiers.heads, tiers.columns.map((one) => one.name)], [1, ['Poste', 'Prévu', 'Budget 2026 Réalisé', 'Rappel 2025 Réalisé', 'Reçu le']], 'heads on two lines with no merged cells, as a CSV keeps them')
  const again = read(/** @type {any} */ (grid([['Poste', 'Prévu', 'Réel'], ['Eau', 30, 35], ['Gaz', 20, 25], ['Poste', 'Prévu', 'Réel'], ['Salle', 90, 90], ['Autre poste', 'Budget', 'Dépensé'], ['Port', 5, 6]])))
  assert.deepEqual([again.rows.map((row) => row[0]), again.left], [['Eau', 'Gaz', 'Salle'], [{ why: 'section', where: 'A4:C4' }, { why: 'below', where: 'A6:C7' }]], 'the same heads again are passed over; others start another table')
  const noted = read(/** @type {any} */ (grid([['Poste', 'Montant'], ['Eau', 120], ['Gaz', 80], ['Source : mairie'], ['* provisoire']])))
  assert.deepEqual([noted.rows.length, noted.left], [2, [{ why: 'below', where: 'A5:B5' }, { why: 'below', where: 'A4:B4' }]])
  const sheet = (/** @type {string} */ name, /** @type {unknown[][]} */ lines, hidden = false) => ({ name, hidden, cells: /** @type {any} */ (grid(lines)) })
  assert.equal(first([sheet('Export Summary', [['Numbers Table Name', 'Excel Worksheet Name'], ['Recettes', 'Sheet 1 - Recettes'], ['Dépenses', 'Sheet 1 - Dépenses']]), sheet('Sheet 1 - Recettes', [['Poste']]), sheet('Sheet 1 - Dépenses', [['Poste']])]), 1)
  assert.equal(first([sheet('Lists', [['a']], true), sheet('Members', [['Name', 'Notes']]), sheet('Notes', [['x']])]), 1)
  assert.equal(first([sheet('Lists', [['a']], true)]), -1)
})

// ── Round 2: the rules the sixteen public workbooks asked for (test/spreadsheets/public.md) ──

test('totals by their word and their sums: on top of their parts, of totals, of one row, rounded', () => {
  const words = read(/** @type {any} */ (grid([['Poste', 'Montant'], ['Eau', 120], ['Gaz', 80], ['Sous-total', 200], ['Salle', 90], ['合　　計', 290]])))
  assert.deepEqual([words.from, words.foot, words.left], [[1, 2, 4], { at: 5, sums: [null, 290] }, [{ why: 'subtotal', where: 'A4:B4' }, { why: 'total', where: 'A6:B6' }]], 'one figure is enough with a word for total, in any language')
  for (const label of ['TOTAL RECETTES', 'Total excl Mobiles', 'On Street Total income', 'مجمـــوع الباب 10', 'المجموع العام', '小計', 'Summe', 'Итого']) assert.equal(read(/** @type {any} */ (grid([['Item', 'Sum'], ['a', 5], ['b', 7], [label, 12], ['c', 1]]))).from.length, 3, label)
  for (const name of ['Total Energies', 'مجموعة النيل', '会計']) assert.equal(read(/** @type {any} */ (grid([['Item', 'Sum'], ['a', 5], ['b', 7], [name, 40], ['c', 1]]))).from.length, 4, `${name} is a record: no sum`)
  // Chapters on top of their accounts, twice; a chapter of one account; a total of totals at the foot.
  const top = read(/** @type {any} */ (grid([['Compte', 'Prévu', 'Réalisé'], ['13 SUBVENTIONS', 300, 290], ['13 SUBVENTIONS', 300, 290], ['1391 État', 100, 95], ['1392 Autres', 200, 195],
    ['20 IMMOS', 50, 40], ['20 IMMOS', 50, 40], ['2033 Frais', 50, 40], ['TOTAL', 350, 330]])))
  assert.deepEqual([top.from, top.foot?.at], [[3, 4, 7], 8])
  // Rounded thousands: each part rounded, the total off by one; a surplus is the difference of two totals, a ratio a share.
  const statement = read(/** @type {any} */ (grid([[null, '2019/20', '2020/21'], ['Rates', 173824, 179020], ['Water', 99297, 104779], ['Waste', 87537, 90154], ['Total revenue', 360658, 373954],
    ['Staff', 134940, 138302], ['Materials', 143293, 141187], ['Total expenses', 278233, 279489], ['Operating surplus', 82425, 94465], ['Surplus ratio', { value: 0.23, kind: 'number', format: 'percent' }, { value: 0.25, kind: 'number', format: 'percent' }]])))
  assert.deepEqual(statement.from, [1, 2, 3, 5, 6])
  assert.deepEqual(statement.left.map((one) => one.why), ['subtotal', 'subtotal', 'subtotal', 'subtotal'])
  const off = read(/** @type {any} */ (grid([['', 'A', 'B'], ['x', 104779, 2], ['y', 90154, 3], ['z', 21761, 4], ['All', 216693, 9]])))
  assert.deepEqual(off.foot, { at: 4, sums: [null, 216693, 9] }, 'thousands off by one')
  assert.equal(read(/** @type {any} */ (grid([['', 'A', 'B'], ['x', 3, 3], ['y', 1, 1], ['z', 2, 1], ['w', 5, 7]]))).from.length, 4, 'small counts must add up exactly')
})

test('merged cells lend across their line, down only within the heads; a record over several lines is joined', () => {
  const merged = read(/** @type {any} */ (grid([['Code', 'Programme', null, null, 'Montant'], ['11.10', 'Terrains', null, null, 1000], ['11.20', 'Matériel', null, null, 3000], ['12.20', 'Mobilier', null, null, 200]])),
    { merges: [{ top: 0, left: 1, bottom: 0, right: 3 }, { top: 1, left: 1, bottom: 1, right: 3 }, { top: 2, left: 1, bottom: 2, right: 3 }, { top: 3, left: 1, bottom: 3, right: 3 }] })
  assert.deepEqual(merged.columns.map((one) => one.name), ['Code', 'Programme', 'Montant'], 'a column of lent cells alone is none')
  const corner = read(/** @type {any} */ (grid([['区　　分', null, '令和6年度', '比　　較'], [null, null, '予算額', '増減額'], ['一般会計', null, 63949752, 9582412], [null, '国民健康保険', 12806867, -410112], [null, '介護保険', 11096519, -102849]])),
    { merges: [{ top: 0, left: 0, bottom: 1, right: 1 }, { top: 2, left: 0, bottom: 2, right: 1 }, { top: 3, left: 0, bottom: 4, right: 0 }] })
  assert.deepEqual([corner.heads, corner.columns.map((one) => one.name), corner.rows.map((row) => row[1])], [1, ['区分', '区分 2', '予算額', '増減額'], ['一般会計', '国民健康保険', '介護保険']], 'down within the heads, across in a row, never down the rows')
  const over = read(/** @type {any} */ (grid([['区分', '予算額', '前年度'], ['水道事業', 5818462, 6029612], ['地方独立行政法人', null, 1073522], ['桑名市総合医療センター', 1013722, null], ['施設整備等貸付事業', null, null], ['下水道事業', 10211195, 9762678]])),
    { merges: [{ top: 2, left: 2, bottom: 4, right: 2 }] })
  assert.deepEqual([over.from, over.rows[1], over.left], [[1, 2, 5], ['地方独立行政法人桑名市総合医療センター施設整備等貸付事業', 1013722, 1073522], [{ why: 'joined', where: 'A4:C5' }]])
  const clash = read(/** @type {any} */ (grid([['Item', 'A', 'B'], ['x', 1, 9], ['y', 2, null], ['z', 3, null]])), { merges: [{ top: 1, left: 2, bottom: 2, right: 2 }] })
  assert.equal(clash.from.length, 3, 'two figures in one column: not joined')
})

test('under the foot, notes, checks and other tables are below; a cell or two with no head beside the table is beside', () => {
  const under = read(/** @type {any} */ (grid([['Location', 'Adult', 'Child', 'Teen'], ['BUR', 6359, 2439, 1003], ['CDH', 1869, 1059, 223], ['CLN', 4011, 1814, 519], ['TOTAL', 12239, 5312, 1745, 'TOTAL'],
    [null, null, null, 1745], ['Permitted', 64], ['THC', 143], ['注：各年４月１日現在', null, null, '資料：総務課']])))
  assert.deepEqual([under.from, under.foot?.at, under.columns.length], [[1, 2, 3], 4, 4])
  assert.deepEqual(under.left, [{ why: 'total', where: 'A5:E5' }, { why: 'below', where: 'A6:E9' }])
  const parts = read(/** @type {any} */ (grid([['科目', '予算'], ['収入の部'], ['会費', 1440], ['補助金', 250], ['収入合計', 1690], ['支出の部'], ['電気料', 180], ['予備費', 1510], ['支出合計', 1690]])))
  assert.deepEqual([parts.from, parts.foot, parts.shape], [[2, 3, 6, 7], null, 'report'], 'a total of the first part, then the next part: no foot')
  const note = read(/** @type {any} */ (grid([['Code', 'Projet', 'Montant'], ['11.10', 'Terrains', 1000], ['11.20', 'Matériel', 3000, ' SRM'], ['12.20', 'Mobilier', 200], ['13.10', 'Bacs', 750], ['14.20', 'Logiciels', 250], ['16.10', 'Parc', 5986]])))
  assert.deepEqual([note.columns.length, note.left], [3, [{ why: 'beside', where: 'D3' }]])
})

test('a lone dash is nothing; codes stay text; phones need their shape', async () => {
  const dashes = read(/** @type {any} */ (grid([['', 'A', 'B'], ['x', 5, null], ['y', null, 4], ['z', 1, 2]])))
  assert.deepEqual(dashes.rows.map((row) => row[2]), [null, 4, 2])
  const csv = await cellsOf('d.csv', new TextEncoder().encode('Item;A;B\nx;5;-\ny;  - ;4\nz;―;2\n'))
  assert.deepEqual(csv.sheets[0].cells.slice(1).map((line) => line.map((cell) => cell.value)), [['x', '5', null], ['y', null, '4'], ['z', null, '2']], 'cells.js: a dash alone is an empty cell')
  assert.deepEqual(sheetCells('<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>    -</t></is></c></row></sheetData></worksheet>', [], [], false).cells, [])
  const postcodes = column(['29106', '29340', '29120', '29120', '35530'])
  assert.deepEqual([postcodes.type, postcodes.values[0]], ['text', '29106'], 'five digits that repeat are a code')
  assert.equal(column(['01200', '29340', '75011']).type, 'text', 'a zero in front makes the column codes')
  assert.equal(column(['100001', '100002', '100003']).type, 'number', 'running numbers are numbers')
  assert.equal(column(['2017', '2017', '2017']).type, 'number', 'a year is a number')
  for (const code of ['72-1/6574-13', '90-1/20421/1036', '11.10.10.10.10', '12.20.70.70.20']) assert.equal(column([code, `${code}0`]).type, 'text', code)
  for (const phone of ['06 12 34 56 78', '0612345678', '+44 7700 900551', '(415) 555-0134', '415-555-0134', '090-1234-5678']) assert.equal(column([phone, phone]).type, 'phone', phone)
  for (const not of ['123-456', '612 345 678', '2026-014']) assert.notEqual(column([not, not]).type, 'phone', not)
})

test('a year is a head above the rows, never inside them', () => {
  const grants = read(/** @type {any} */ (grid([['Budget', 'Imputation', 'Organisme', 'Montant'], ['BP', '72-1/6574-5', 'CREHA', 11492], ['BP', '72-1/6574-3', 'CNL', 1900], ['BP', '72-1/6574-9', 'CLCV', 1900], ['BP', '72-1/6574-13', 'ALOEN', 40000]])))
  assert.deepEqual([grants.from, grants.left], [[1, 2, 3, 4], []])
  const years = read(/** @type {any} */ (grid([['Name', 'Year'], ['Ann', 2019], ['Bob', 2021], ['Cy', 2020]])))
  assert.deepEqual([years.heads, years.rows.length], [0, 3], 'a year over more years is a value')
  const budget = read(/** @type {any} */ (grid([['Poste', 2025, 2026], ['Eau', 120, 130], ['Gaz', 80, 85]])))
  assert.deepEqual([budget.heads, budget.columns.map((one) => one.name)], [0, ['Poste', '2025', '2026']], 'years over amounts are heads')
})

test('a sheet with no heads is declined; a report says it is one', () => {
  const balance = read(/** @type {any} */ (grid([['Investissement'], ['Dépenses'], [null, 'BUDGET'], [null, 'PRIMITIF'], ['Total Dépenses', 9608738], [], ['Résultat', 2096153.51]])))
  assert.deepEqual([balance.heads, balance.rows, balance.left], [-1, [], [{ why: 'none', where: 'A1:B7' }]])
  assert.equal(read(/** @type {any} */ (grid([['Name', 'Fee'], ['Ann', 28], ['Bob', 15]]))).shape, 'list')
  assert.equal(read(/** @type {any} */ (grid([['Name', 'Fee'], ['Ann', 28], ['Bob', 15], ['Total', 43]]))).shape, 'report', 'a total row makes a report')
})

test('Shift_JIS is told from UTF-8 and Windows-1252 by cells.js', async () => {
  const hex = (/** @type {string} */ text) => Uint8Array.from(text.match(/../g) ?? [], (byte) => parseInt(byte, 16))
  const japanese = await cellsOf('pop.csv', hex('96bc914f2c8be08a7a0a8e5293632c313230300a'))
  assert.deepEqual(japanese.sheets[0].cells.map((line) => line.map((cell) => cell.value)), [['名前', '金額'], ['山田', '1200']])
  const french = await cellsOf('fr.csv', hex('4c6962656c6ce93b4d6f6e74616e740a52e963657074696f6e3b31322c35300a'))
  assert.deepEqual(french.sheets[0].cells.map((line) => line.map((cell) => cell.value)), [['Libellé', 'Montant'], ['Réception', '12,50']])
})

// ── Round 3: two rules, the doubts, and labels from a brain or the person ──

test('identifiers of 13 digits or more stay text; 総数 is a total', () => {
  const sirets = column([12345678900014, 98765432100027, 1234567890123].map((value) => /** @type {any} */ ({ value, kind: 'number' })))
  assert.deepEqual([sirets.type, sirets.values[0]], ['text', '12345678900014'])
  const mixed = column([12345678900014, 1200, 300].map((value) => /** @type {any} */ ({ value, kind: 'number' })))
  assert.deepEqual([mixed.type, mixed.reading.doubts.map((one) => one.kind)], ['number', ['long']])
  const counts = read(/** @type {any} */ (grid([['区分', '男', '女'], ['総数', 30, 32], ['A', 10, 12], ['B', 20, 20]])))
  assert.deepEqual([counts.from, counts.left], [[2, 3], [{ why: 'subtotal', where: 'A2:C2' }]])
})

test('doubts: each kind where the rules may be wrong, none where they are sure', () => {
  const kinds = (/** @type {unknown[][]} */ lines, /** @type {any} */ options = {}) => read(/** @type {any} */ (grid(lines)), options).doubts.map((one) => `${one.kind} ${one.at}`)
  const rows = [['a', 10, 20], ['b', 11, 21], ['c', 12, 22], ['d', 13, 23], ['e', 14, 24]]
  assert.deepEqual(kinds([['Name', 'A', 'B'], ...rows]), [], 'a plain list: no doubt')
  assert.deepEqual(kinds([['Name', 'A', 'B'], ...rows.slice(0, 3), ['Source: town hall', 'n/a', 5], ...rows.slice(3)]), ['misfit A5:C5'])
  assert.deepEqual(kinds([['Name', 'A', 'B'], ...rows, ['Total', 7, 9]]), ['total A7:C7'])
  assert.deepEqual(kinds([['Name', 'A', 'B'], ['a', 0, 100], ['b', 100, 0], ['c', 100, 100], ['d', 7, 8], ['e', 9, 10]]), ['sums A4:C4'], 'a row that equals the two above, among rows')
  const years = [2019, 2020, 2021, 2022, 2023].map((year, i) => [year, 3245 + i, 300 - i, 12, 9])
  assert.deepEqual(kinds([['Year', 'Staff', 'Schools', 'Police', 'Fire'], [null, 'of which', 'total', null, null], ...years]), ['misfit A2:E2', 'words A2:E2'])
  assert.deepEqual(kinds([['Name', 'A', 'B', 'C'], ['a', 10, 20, 30], ['b', 11, 21, 31], ['c', 12, 22, 32], ['d', 13, 23, 33], ['e', 14, 24, 34], ['Note: provisional', null, null, 'Source']]), ['misfit A7:D7', 'end A7:D7'])
  const staff = [2019, 2020, 2021, 2022, 2023].map((year, i) => [year, 3245 + i, 462 + i, 300 - i, 202 + i])
  assert.deepEqual(kinds([['Year', 'Staff', 'Police', 'Schools', null], [null, null, null, 'primary', 'office'], ...staff], { merges: [{ top: 0, left: 0, bottom: 1, right: 0 }, { top: 0, left: 3, bottom: 0, right: 4 }] }), ['misfit A2:E2', 'words A2:E2', 'merged A1:A2'])
})

test('labels: the rules read lines and columns as a brain or the person labels them, and doubt nothing labelled', () => {
  const lines = [['Year', 'Staff', 'Schools', 'Police', 'Fire'], [null, 'of which', 'total', null, null], [2019, 3245, 300, 12, 9], [2020, 3323, 297, 13, 9], ['Source: town hall', null, 'office'], ['Total', 6568, 597, 25, 18]]
  const plain = read(/** @type {any} */ (grid(lines)))
  assert.deepEqual([plain.heads, plain.from, plain.foot?.at], [0, [1, 2, 3, 4], 5])
  const labelled = read(/** @type {any} */ (grid(lines)), { labels: { lines: { 0: 'heads', 1: 'heads', 4: 'note' } } })
  assert.deepEqual([labelled.heads, labelled.from, labelled.foot?.at, labelled.columns.map((one) => one.name), labelled.doubts], [1, [2, 3], 5, ['Year', 'of which', 'total', 'Police', 'Fire'], []])
  assert.ok(labelled.left.some((one) => one.why === 'below' && one.where === 'A5:E5'))
  const grants = [['Name', 'A', 'B'], ['a', 0, 100], ['b', 100, 0], ['c', 100, 100], ['Total part 1', 1, 1], ['Part 2'], ['d', 7, 8], ['e', 9, 10], ['Total', 216, 218]]
  const fixed = read(/** @type {any} */ (grid(grants)), { labels: { lines: { 3: 'row', 4: 'total', 5: 'section' } } })
  assert.deepEqual([fixed.from, fixed.foot?.at, fixed.left.filter((one) => ['section', 'subtotal'].includes(one.why)).map((one) => `${one.why} ${one.where}`)], [[1, 2, 3, 6, 7], 8, ['subtotal A5:C5', 'section A6:C6']],
    'a line labelled the total with rows after it is a subtotal')
  // Lines left unlabelled keep the rules' reading: a heads label joins the rules' own line of heads, unless that line is labelled otherwise.
  const two = [['Year', 'A', 'B', 'C'], [null, 'Night', 'Day', 'Ratio'], [2000, 131467, 123536, 94], [2005, 154731, 150561, 97.3], [2010, 164877, 162294, 98.4]]
  assert.equal(read(/** @type {any} */ (grid(two))).heads, 1)
  assert.equal(read(/** @type {any} */ (grid(two)), { labels: { lines: { 0: 'heads' } } }).heads, 1, 'heads on line 1 joined by line 0, not replaced')
  assert.equal(read(/** @type {any} */ (grid(two)), { labels: { lines: { 0: 'heads', 1: 'row' } } }).heads, 0)
  const titled = [['Staff by year'], ...two]
  assert.equal(read(/** @type {any} */ (grid(titled)), { labels: { lines: { 0: 'note', 1: 'heads', 2: 'heads' } } }).heads, 2, 'a title labelled a note above the heads')
  const kinds = read(/** @type {any} */ (grid([['Code', 'Amount'], ['1001', 5], ['1002', 6], ['1003', 7]])), { labels: { kinds: { 0: 'text' } } })
  assert.deepEqual(kinds.columns.map((one) => one.type), ['text', 'number'])
  const beside = read(/** @type {any} */ (grid(lines)), { labels: { lines: { 4: 'beside' } } })
  assert.ok(beside.left.some((one) => one.why === 'beside' && one.where === 'A5:E5'))
})
