import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readZip } from '../app/core/zip.js'
import { extractPages } from '../app/caps/files/extract.js'
import { csvRows, fileName, makeFile, replaceOnce, sheetsIn } from '../app/caps/made/formats.js'
import { BRAND } from '../app/brand.js'

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
  assert.deepEqual(Object.keys(files).sort(), ['[Content_Types].xml', '_rels/.rels', 'docProps/custom.xml', 'word/_rels/document.xml.rels', 'word/document.xml', 'word/numbering.xml', 'word/styles.xml'])
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

test('docx: in the project\'s look, its headings in its colour and its voice\'s faces, a table\'s head line in its colour; without one, Word\'s own (D601)', async () => {
  const table = '| Item | Cost |\n| --- | --- |\n| Rent | 1200 |'
  const styles = async (/** @type {any} */ look) => (await parts((await makeFile('a.docx', `# Plan\n\n${table}`, { date: DATE, look })).bytes))
  const own = await styles({ colour: '#0f5d58', voice: 'elegant' })
  // In the schema's order, which Word holds to: the face, then bold, then the colour, then the size.
  assert.match(own['word/styles.xml'], /w:styleId="Heading1">.*<w:rPr><w:rFonts w:ascii="Georgia" w:hAnsi="Georgia" w:cs="Arial"\/><w:b\/><w:bCs\/><w:color w:val="0f5d58"\/><w:sz w:val="36"\/>/)
  assert.match(own['word/styles.xml'], /<w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Arial"\/>/)
  assert.match(own['word/document.xml'], /<w:tcBorders><w:bottom w:val="single" w:sz="12" w:space="0" w:color="0f5d58"\/><\/w:tcBorders><w:shd /)
  assert.match((await styles({ voice: 'friendly' }))['word/styles.xml'], /<w:rPrDefault><w:rPr><w:rFonts w:ascii="Trebuchet MS"/)
  const plain = await styles(undefined)
  assert.equal(plain['word/styles.xml'], (await styles({}))['word/styles.xml'])
  assert.doesNotMatch(plain['word/styles.xml'], /<w:color w:val="[0-9a-f]{6}"\/><w:sz w:val="36"/)
  assert.doesNotMatch(plain['word/document.xml'], /tcBorders/)
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

test('csvRows: the separator that splits the rows alike, or the one Excel\'s "sep=" line names', () => {
  // A quoted comma in the header, decimal commas, a title above the table: semicolons all the same.
  assert.deepEqual(csvRows('"Nom, prénom";Montant\n"Dupont, Jean";12,5\nMartin;3'), [['Nom, prénom', 'Montant'], ['Dupont, Jean', '12,5'], ['Martin', '3']])
  assert.deepEqual(csvRows('Relevé de compte\nDate;Libellé;Montant\n01/02/2026;CB, Carrefour;-12,30\n02/02/2026;Virement;100'),
    [['Relevé de compte'], ['Date', 'Libellé', 'Montant'], ['01/02/2026', 'CB, Carrefour', '-12,30'], ['02/02/2026', 'Virement', '100']])
  // On a tie, a semicolon before a comma; commas still win where they split every row and semicolons don't.
  assert.deepEqual(csvRows('Prix (€, TTC);Date\n12,5;2026-01-02'), [['Prix (€, TTC)', 'Date'], ['12,5', '2026-01-02']])
  assert.deepEqual(csvRows('Name,Note\nBob,later; maybe\nAl,ok'), [['Name', 'Note'], ['Bob', 'later; maybe'], ['Al', 'ok']])
  assert.deepEqual(csvRows('﻿sep=;\r\nName, first;Amount\r\nA, B;1'), [['Name, first', 'Amount'], ['A, B', '1']])
  assert.deepEqual(csvRows('"sep=,"\na;b,c'), [['a;b', 'c']])
  assert.deepEqual(csvRows('Name\nAlice\nBob'), [['Name'], ['Alice'], ['Bob']])
})

test('docx and xlsx: emphasis beside the punctuation of Chinese, Japanese and Korean is bold, as an answer draws it (D590)', async () => {
  const doc = (await parts((await makeFile('案内.docx', '雨天時は**5月21日（金）**に延期します。', { date: DATE })).bytes))['word/document.xml']
  assert.match(doc, /<w:b\/><w:bCs\/><\/w:rPr><w:t xml:space="preserve">5月21日（金）<\/w:t>/)
  assert.doesNotMatch(doc, /\*\*/)
  assert.deepEqual(sheetsIn('| 日付 | 内容 |\n|---|---|\n| **5月21日（金）**に | **「重要」**です |', '予定')[0].rows, [['日付', '内容'], ['5月21日（金）に', '「重要」です']])
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
  // Read back, a date is a date again, not the count of days Excel keeps.
  assert.match(text, /^Sheet: Budget\nItem\tAmount\tShare\tDue\tTotal\nRent\t1200\t0.125\t2026-10-03\t1200\n/)
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

test('a Word document, a workbook, a drawing and a web page say a trained model made them; other text stays as written (D324)', async () => {
  const source = 'http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia'
  for (const [name, content] of [['Report.docx', '# Report'], ['Budget.xlsx', 'Item,Cost\nRent,1200']]) {
    const files = await parts((await makeFile(name, content, { date: DATE })).bytes)
    assert.match(files['docProps/custom.xml'], new RegExp(`name="DigitalSourceType"><vt:lpwstr>${source}</vt:lpwstr>.*name="AISystemUsed"><vt:lpwstr>${BRAND.name}<`))
    assert.match(files['_rels/.rels'], /relationships\/custom-properties" Target="docProps\/custom.xml"/)
    assert.match(files['[Content_Types].xml'], /PartName="\/docProps\/custom.xml" ContentType="application\/vnd.openxmlformats-officedocument.custom-properties\+xml"/)
  }
  const svg = dec.decode((await makeFile('Plan.svg', '<svg xmlns="http://www.w3.org/2000/svg" width="10"><rect/></svg>')).bytes)
  assert.match(svg, new RegExp(`^<svg xmlns="http://www.w3.org/2000/svg" width="10"><metadata><x:xmpmeta .*DigitalSourceType="${source}" Iptc4xmpExt:AISystemUsed="${BRAND.name}"/></rdf:RDF></x:xmpmeta></metadata><rect/></svg>$`))
  assert.equal(dec.decode((await makeFile('Again.svg', svg)).bytes), svg)
  const page = dec.decode((await makeFile('Page.html', '<html><head><title>T</title></head><body>Hi</body></html>')).bytes)
  assert.match(page, /<title>T<\/title><script type="application\/ld\+json">\{"@context":"https:\/\/schema.org",.*"https:\/\/schema.org\/TrainedAlgorithmicMediaDigitalSource".*<\/script><\/head>/)
  assert.equal(JSON.parse(/<script[^>]*>(.*?)<\/script>/.exec(page)?.[1] ?? '').creator.name, BRAND.name)
  assert.equal(dec.decode((await makeFile('Again.html', page)).bytes), page)
  assert.match(dec.decode((await makeFile('Part.html', '<p>Hi</p>')).bytes), /^<script type="application\/ld\+json">.*<\/script>\n<p>Hi<\/p>$/)
  assert.equal(dec.decode((await makeFile('Notes.md', '# Notes')).bytes), '# Notes')
})

test('what Jean makes is read back as saying, unsigned, that AI made it and with what; a camera\'s mark says otherwise, and a file that says nothing gives nothing (D410)', async () => {
  const { credentialsGiven } = await import('../app/caps/certificates/card.js')
  const { marked } = await import('../app/caps/pictures/mark.js')
  const enc = new TextEncoder()
  const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, ...enc.encode('IHDR'), ...new Array(17).fill(0), 0, 0, 0, 0, ...enc.encode('IEND'), 0, 0, 0, 0])
  const camera = '<svg><metadata><x:xmpmeta><rdf:RDF><rdf:Description><Iptc4xmpExt:DigitalSourceType>http://cv.iptc.org/newscodes/digitalsourcetype/digitalCapture</Iptc4xmpExt:DigitalSourceType></rdf:Description></rdf:RDF></x:xmpmeta></metadata></svg>'
  const made = await Promise.all([['Report.docx', '# Report'], ['Budget.xlsx', 'Item,Cost\nRent,1200'], ['Plan.svg', '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>'], ['Page.html', '<p>Hi</p>'], ['Notes.md', '# Notes']].map(([name, content]) => makeFile(name, content)))
  const read = await credentialsGiven([...made, { name: 'Picture.png', bytes: marked(png, 'SD-Turbo', 'abc') }, { name: 'Photo.png', bytes: png }, { name: 'Photo.svg', bytes: enc.encode(camera) }])
  assert.deepEqual(read.map(({ name, unsigned, generated, maker }) => ({ name, unsigned, generated, maker })), [
    ...['Report.docx', 'Budget.xlsx', 'Plan.svg', 'Page.html'].map((name) => ({ name, unsigned: true, generated: true, maker: BRAND.name })),
    { name: 'Picture.png', unsigned: true, generated: true, maker: 'SD-Turbo' },
    { name: 'Photo.svg', unsigned: true, generated: false, maker: '' },
  ])
})

test('replaceOnce: one passage changed as written; quoted twice or not at all, it says so', () => {
  assert.equal(replaceOnce('Total: 10 $', '10 $', '12 $ and $&', 'a.md'), 'Total: 12 $ and $&')
  assert.throws(() => replaceOnce('a b a', 'a', 'c', 'a.md'), /in a.md 2 times: quote more/)
  assert.throws(() => replaceOnce('The text', 'missing', 'c', 'a.md'), /not in a.md, which reads:\nThe text/)
  assert.throws(() => replaceOnce('The text', '', 'c', 'a.md'), /Quote the passage/)
})

test('docx: a design system\'s ink, muted colour, pale fill and own fonts over its voice, a browser\'s family left out, and its links in its colour (D663)', async () => {
  const table = '| Item | Cost |\n| --- | --- |\n| Rent | 1200 |'
  const own = await parts((await makeFile('a.docx', `# Plan\n\n> Said\n\n[here](https://example.com)\n\n${table}`, { date: DATE, look: { colour: '#0f5d58', ink: '#222222', muted: '#555555', soft: '#eef5f4', voice: 'elegant', fonts: { heading: ['Bar & Co', 'serif'], body: ['system-ui', 'Inter'] } } })).bytes)
  const styles = own['word/styles.xml']
  assert.match(styles, /<w:rPrDefault><w:rPr><w:rFonts w:ascii="Inter" w:hAnsi="Inter" w:cs="Arial"\/><w:color w:val="222222"\/><w:sz /)
  assert.match(styles, /w:styleId="Heading1">.*<w:rPr><w:rFonts w:ascii="Bar &amp; Co" w:hAnsi="Bar &amp; Co" w:cs="Arial"\/><w:b\/><w:bCs\/><w:color w:val="0f5d58"\/>/)
  assert.match(styles, /w:styleId="Quote">.*?<w:i\/><w:iCs\/><w:color w:val="555555"\/>/)
  assert.match(styles, /w:styleId="Code">.*?w:fill="eef5f4"/)
  assert.match(styles, /w:styleId="Hyperlink">.*?<w:color w:val="0f5d58"\/>/)
  assert.match(own['word/document.xml'], /<w:shd w:val="clear" w:color="auto" w:fill="eef5f4"\/>/)
  // Only a browser's family given, the words are Word's own, and the headings the same.
  const family = (await parts((await makeFile('a.docx', '# Plan', { date: DATE, look: { fonts: { heading: ['ui-serif'], body: ['sans-serif'] } } })).bytes))['word/styles.xml']
  assert.match(family, /<w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri"/)
  assert.doesNotMatch(family, /w:styleId="Heading1">.*?<w:rFonts.*?w:styleId="Heading2"/)
})

test('docx: a logo on every page in its corner, in the page\'s head or foot, Word\'s own parts naming it; none without one (D663)', async () => {
  const logo = /** @type {const} */ ({ bytes: Uint8Array.of(1, 2, 3), type: 'png', width: 120, height: 30 })
  const made = async (/** @type {string} */ words, /** @type {string} */ logoAt) => makeFile('a.docx', words, { date: DATE, look: { logo, logoAt } })
  const top = await made('# Plan', 'top-end'), own = await parts(top.bytes)
  assert.match(own['word/document.xml'], /<w:sectPr><w:headerReference w:type="default" r:id="rIdLogo"\/><w:pgSz /)
  assert.match(own['word/_rels/document.xml.rels'], /Id="rIdLogo" Type="[^"]*\/header" Target="header.xml"/)
  assert.match(own['word/_rels/header.xml.rels'], /Id="rId1" Type="[^"]*\/image" Target="media\/logo.png"/)
  assert.match(own['[Content_Types].xml'], /<Default Extension="png" ContentType="image\/png"\/>/)
  assert.match(own['[Content_Types].xml'], /PartName="\/word\/header.xml" ContentType="[^"]*wordprocessingml.header\+xml"/)
  assert.match(own['word/header.xml'], /<w:hdr .*<w:jc w:val="right"\/>.*<wp:extent cx="1143000" cy="285750"\/>.*<a:blip r:embed="rId1"\/>/)
  assert.deepEqual([...await readZip(top.bytes).find((entry) => entry.name === 'word/media/logo.png')?.read() ?? []], [1, 2, 3])
  // At the foot, where a line starts; in Arabic, Word's left is that start.
  const foot = await parts((await made('# الخطة', 'bottom-start')).bytes)
  assert.match(foot['word/document.xml'], /<w:footerReference w:type="default" r:id="rIdLogo"\/>/)
  assert.match(foot['word/footer.xml'], /<w:ftr .*<w:bidi\/><w:jc w:val="left"\/>/)
  const none = await parts((await makeFile('a.docx', '# Plan', { date: DATE })).bytes)
  assert.doesNotMatch(none['word/document.xml'], /Reference/)
  assert.ok(!Object.keys(none).some((path) => /header|footer|media/.test(path)))
})

test('docx: a picture it was given in its place, no wider than the text, and what code draws in place of its code; any other stays what it says (D663)', async () => {
  const pictures = new Map(/** @type {[string, import('../app/caps/made/formats.js').Picture][]} */ ([['../files/a.png', { bytes: Uint8Array.of(1), type: 'png', width: 2000, height: 1000 }], ['{"chart":1}', { bytes: Uint8Array.of(2), type: 'jpeg', width: 300, height: 100 }]]))
  const own = await parts((await makeFile('a.docx', '![The <oven>](../files/a.png) and ![far](https://example.com/b.png) and ![odd](constructor)\n\n```echarts\n{"chart":1}\n```\n\n```js\nlet a\n```\n\n```\nconstructor\n```', { date: DATE, pictures })).bytes)
  const doc = own['word/document.xml']
  assert.match(doc, /<wp:extent cx="5731200" cy="2865600"\/><wp:docPr id="2" name="Picture 2" descr="The &lt;oven&gt;"\/>/)
  assert.match(doc, /<a:blip r:embed="rIdPicture1"\/>/)
  assert.match(doc, /\[far\].*\[odd\]/)
  assert.match(doc, /<w:pStyle w:val="Code"\/>.*constructor/)
  assert.match(doc, /<a:blip r:embed="rIdPicture2"\/>/)
  assert.doesNotMatch(doc, /chart/)
  assert.match(doc, /<w:pStyle w:val="Code"\/>.*let a/)
  assert.match(own['word/_rels/document.xml.rels'], /Id="rIdPicture2" Type="[^"]*\/image" Target="media\/picture2.jpeg"/)
  assert.match(own['[Content_Types].xml'], /<Default Extension="jpeg" ContentType="image\/jpeg"\/>/)
})

test('docx: what the user wrote themself doesn\'t say a trained model made it; by default a Word file does (D324, D663)', async () => {
  const own = await parts((await makeFile('a.docx', '# Mine', { date: DATE, made: false })).bytes)
  assert.ok(!('docProps/custom.xml' in own))
  assert.doesNotMatch(own['_rels/.rels'] + own['[Content_Types].xml'], /custom/)
  assert.ok('docProps/custom.xml' in await parts((await makeFile('a.docx', '# Jean\'s', { date: DATE })).bytes))
})

test('xlsx: in the look, a head row in its colour and headings\' face on its pale fill over a line, words in its ink and face; without one, as ever (D664)', async () => {
  const styles = async (/** @type {any} */ look) => (await parts((await makeFile('a.xlsx', 'Item,Cost\nRent,1200\n', { date: DATE, look })).bytes))['xl/styles.xml']
  const own = await styles({ colour: '#0f5d58', ink: '#222222', soft: '#eef5f4', fonts: { heading: ['Bar & Co'], body: ['Inter', 'sans-serif'] } })
  assert.match(own, /<fonts count="2"><font><sz val="11"\/><color rgb="FF222222"\/><name val="Inter"\/><\/font><font><b\/><sz val="11"\/><color rgb="FF0F5D58"\/><name val="Bar &amp; Co"\/><\/font><\/fonts>/)
  assert.match(own, /<fills count="3">.*<fgColor rgb="FFEEF5F4"\/>/)
  assert.match(own, /<borders count="2">.*<bottom style="medium"><color rgb="FF0F5D58"\/><\/bottom>/)
  assert.match(own, /<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"\/>/)
  const elegant = await styles({ voice: 'elegant' })
  assert.match(elegant, /<font><sz val="11"\/><name val="Calibri"\/><\/font><font><b\/><sz val="11"\/><name val="Georgia"\/><\/font>/)
  const plain = await styles(undefined)
  assert.match(plain, /<fonts count="2"><font><sz val="11"\/><name val="Calibri"\/><\/font><font><b\/><sz val="11"\/><name val="Calibri"\/><\/font><\/fonts><fills count="2">/)
  assert.match(plain, /<borders count="1">/)
  assert.match(plain, /<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"\/>/)
})
