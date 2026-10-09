import { test } from 'node:test'
import assert from 'node:assert/strict'
import { memoryFS, walk } from '../core/fs.js'
import { crc32, readZip, writeZip } from '../core/zip.js'
import { decodeText, docx, extractPages, extractable, isBinary, paginate, sheetRows, slideText } from '../caps/files/extract.js'
import { addFile, documentPart, estimateTokens, fileMeta, fileText, joinPages, pagesThatFit, parsePages, readTool, splitPages, weigh } from '../core/files.js'
import { isPicture } from '../core/events.js'
import { exportBackup, importBackup, isBackedUp } from '../caps/backup/archive.js'
import { officePage } from '../caps/files/office.js'
import { replaceInSheet, setCells } from '../caps/files/cells.js'
import { makeFile, replaceOnce } from '../caps/made/formats.js'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'

const enc = new TextEncoder()
const dec = new TextDecoder()

/** @param {Record<string, string>} files */
const zipOf = (files) => writeZip(Object.entries(files).map(([name, text]) => ({ name, bytes: enc.encode(text) })))

// ─── Zip ─────────────────────────────────────────────────────────────────────

test('crc32 matches the standard check value', () => {
  assert.equal(crc32(enc.encode('123456789')), 0xcbf43926)
  assert.equal(crc32(new Uint8Array()), 0)
})

test('writeZip and readZip round-trip, deflating what shrinks', async () => {
  const big = 'é'.repeat(5000)
  const zip = await zipOf({ 'a.txt': 'hi', 'dir/b.txt': big, 'ünï.txt': 'names are UTF-8' })
  const entries = readZip(zip)
  assert.deepEqual(entries.map((e) => e.name), ['a.txt', 'dir/b.txt', 'ünï.txt'])
  assert.equal(dec.decode(await entries[0].read()), 'hi')
  assert.equal(dec.decode(await entries[1].read()), big)
  assert.equal(entries[1].size, enc.encode(big).length)
  assert.ok(zip.length < enc.encode(big).length, 'the repetitive entry was deflated')
  assert.equal(dec.decode(await entries[2].read()), 'names are UTF-8')
})

test('readZip rejects what is not a zip', () => {
  assert.throws(() => readZip(enc.encode('just some text, long enough to scan for an end record')), /Not a zip/)
})

// ─── Extraction ──────────────────────────────────────────────────────────────

test('decodeText falls back to Windows-1252 and normalises line ends', () => {
  assert.equal(decodeText(enc.encode('a\r\nb\rc')), 'a\nb\nc')
  assert.equal(decodeText(new Uint8Array([0x63, 0x61, 0x66, 0xe9])), 'café')
})

test('UTF-16 text reads as text, and only a file with a zero byte in its first 8000 is data', () => {
  const wide = new Uint8Array([0xff, 0xfe, ...[...'été\r\n'].flatMap((char) => [char.charCodeAt(0), 0])])
  assert.equal(decodeText(wide), 'été\n')
  assert.equal(decodeText(new Uint8Array([0xfe, 0xff, 0, 0x4a])), 'J')
  assert.ok(!isBinary(wide) && !isBinary(enc.encode('plain')) && !isBinary(new Uint8Array()))
  assert.ok(isBinary(new Uint8Array([0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6])))
  assert.ok(!isBinary(new Uint8Array([...enc.encode('x'.repeat(8000)), 0])))
})

test('paginate groups lines into pages of about 4000 characters', () => {
  const lines = Array.from({ length: 300 }, (_, i) => `line ${i} `.repeat(4))
  const pages = paginate(lines)
  assert.ok(pages.length > 1)
  assert.ok(pages.every((page) => page.length <= 4100))
  assert.equal(pages.join('\n').replace(/\s+/g, ' '), lines.join('\n').replace(/\s+/g, ' ').trim())
  assert.deepEqual(paginate(['']), [''])
})

test('docx: paragraphs, headings, tabs, tables, entities and rendered page breaks', () => {
  const xml = `<?xml version="1.0"?><w:document><w:body>
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Report</w:t></w:r></w:p>
    <w:p><w:r><w:t xml:space="preserve">Fish &amp; chips </w:t></w:r><w:r><w:tab/><w:t>&#233;t&#xE9;</w:t></w:r></w:p>
    <w:tbl><w:tr><w:tc><w:p><w:r><w:t>Name</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Total</w:t></w:r></w:p></w:tc></w:tr>
    <w:tr><w:tc><w:p><w:r><w:t>A|B</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>3</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
    <w:p><w:r><w:lastRenderedPageBreak/><w:t>Second page</w:t></w:r></w:p>
  </w:body></w:document>`
  const pages = docx(xml)
  assert.equal(pages.length, 2)
  assert.equal(pages[0], '# Report\nFish & chips \tété\n| Name | Total |\n| A\\|B | 3 |')
  assert.equal(pages[1], 'Second page')
})

test('docx without page breaks is paginated by size', () => {
  const para = `<w:p><w:r><w:t>${'word '.repeat(200)}</w:t></w:r></w:p>`
  const pages = docx(`<w:body>${para.repeat(10)}</w:body>`)
  assert.ok(pages.length >= 2)
})

test('slides and sheets', () => {
  assert.equal(slideText('<p:sld><a:p><a:r><a:t>Title</a:t></a:r></a:p><a:p><a:r><a:t>One</a:t></a:r><a:br/><a:r><a:t>Two</a:t></a:r></a:p></p:sld>'), 'Title\nOne\nTwo')
  const sheet = `<worksheet><sheetData>
    <row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row>
    <row r="2"><c r="A2" t="inlineStr"><is><t>Inline</t></is></c><c r="B2"><v>42.5</v></c><c r="C2" t="b"><v>1</v></c><c r="D2" t="str"><f>A1</f><v>Name</v></c></row>
  </sheetData></worksheet>`
  assert.deepEqual(sheetRows(sheet, ['Name', 'Total']), ['Name\t\tTotal', 'Inline\t42.5\tTRUE\tName'])
})

test('an Office file is drawn in a page of its own: its viewer’s modules as data under an import map, its parser and the file as data, nothing from anywhere (D183)',
  { skip: !existsSync(new URL('../vendor/ooxml/graph.json', import.meta.url)) && 'npm run vendor makes vendor/ooxml' }, async (t) => {
    t.mock.method(globalThis, 'fetch', async (/** @type {URL} */ url) => new Response(await readFile(url)))
    const bytes = await zipOf({ '[Content_Types].xml': '<Types/>' })
    const page = await officePage('pptx', bytes, 'Plan <1>.pptx')
    const imports = JSON.parse(/<script type="importmap">(.*?)<\/script>/.exec(page)?.[1] ?? '{}').imports
    assert.ok(imports['ooxml/pptx.mjs'] && Object.values(imports).every((url) => url.startsWith('data:text/javascript;base64,')))
    assert.match(page, /import \{ PptxScrollViewer as Viewer \} from 'ooxml\/pptx\.mjs'/)
    assert.match(page, /wasmUrl: 'data:application\/wasm;base64,/)
    assert.ok(page.includes(`atob('${Buffer.from(bytes).toString('base64')}')`), 'the file, as data')
    assert.ok(!/https?:|\/\/[a-z]/.test(page.replace(/data:[^'"]+/g, '')), 'nothing from anywhere')
    assert.ok(!page.includes('<1>'), 'its name only as text')
    // A workbook in the preview has cells to change, and shows where it was looked at (D229); elsewhere it doesn't.
    const book = await officePage('xlsx', bytes, 'Budget.xlsx', { at: { sheet: 1, x: 0, y: 120, ref: 'B3</script>' } })
    assert.match(book, /parent\.postMessage\(\{ cell: /)
    assert.ok(book.includes('const at = {"sheet":1,"x":0,"y":120,"ref":"B3\\u003c/script>"}'), 'where it was, as data')
    assert.ok(!(await officePage('xlsx', bytes, 'Budget.xlsx')).includes('postMessage'))
    assert.ok(!(await officePage('docx', bytes, 'Plan.docx', {})).includes('postMessage'))
  })

test('extractPages reads real Office containers in presentation order', async () => {
  const pptx = await zipOf({
    'ppt/presentation.xml': '<p:presentation><p:sldIdLst><p:sldId id="1" r:id="rId3"/><p:sldId id="2" r:id="rId2"/></p:sldIdLst></p:presentation>',
    'ppt/_rels/presentation.xml.rels': '<Relationships><Relationship Id="rId2" Target="slides/slide1.xml"/><Relationship Id="rId3" Target="slides/slide2.xml"/></Relationships>',
    'ppt/slides/slide1.xml': '<a:p><a:r><a:t>Shown second</a:t></a:r></a:p>',
    'ppt/slides/slide2.xml': '<a:p><a:r><a:t>Shown first</a:t></a:r></a:p>',
  })
  assert.deepEqual(await extractPages('Deck.PPTX', pptx), ['Shown first', 'Shown second'])

  const xlsx = await zipOf({
    'xl/workbook.xml': '<workbook><sheets><sheet name="Q1 &amp; Q2" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId1" Target="/xl/worksheets/sheet1.xml"/></Relationships>',
    'xl/sharedStrings.xml': '<sst><si><t>Client</t></si><si><r><t>Ri</t></r><r><t>ch</t></r></si></sst>',
    'xl/worksheets/sheet1.xml': '<sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row></sheetData>',
  })
  assert.deepEqual(await extractPages('book.xlsx', xlsx), ['Sheet: Q1 & Q2\nClient\tRich'])

  assert.deepEqual(await extractPages('notes.md', enc.encode('# Hi\nthere')), ['# Hi\nthere'])
  assert.equal(await extractPages('scan.pdf', new Uint8Array()), null)
  assert.ok(extractable('a.docx') && extractable('b.csv') && !extractable('c.pdf') && !extractable('d.exe'))
})

// ─── Cells changed in place (D229) ───────────────────────────────────────────

const budget = () => makeFile('Budget.xlsx', 'Item,Amount\nRent,1200\nFood,450\nTotal,=SUM(B2:B3)').then((made) => made.bytes)
/** Each part of a workbook, by name, as text. @param {Uint8Array} bytes */
const partsOf = async (bytes) => Object.fromEntries(await Promise.all(readZip(bytes).map(async (entry) => [entry.name, dec.decode(await entry.read())])))
const RELS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'

test('setCells: numbers, text, formulas and booleans in place, a style kept, a cell emptied or added in order; the other parts as they were (D229)', async () => {
  const bytes = await budget()
  const changed = await setCells(bytes, [
    { sheet: 0, ref: 'B2', value: '1300' }, { sheet: 0, ref: 'A3', value: 'Groceries & co' }, { sheet: 0, ref: 'B4', value: '' },
    { sheet: 0, ref: 'D1', value: ' Note ' }, { sheet: 0, ref: 'C5', value: '=B2*2' }, { sheet: 0, ref: 'C1', value: 'true' }, { sheet: 0, ref: 'A1', value: '007' },
  ], 'Budget.xlsx')
  assert.deepEqual(await extractPages('Budget.xlsx', changed), ['Sheet: Budget\n007\tAmount\tTRUE\t Note \nRent\t1300\nGroceries & co\t450\nTotal\n\t\t=B2*2'])
  const [before, after] = [await partsOf(bytes), await partsOf(changed)]
  const sheet = after['xl/worksheets/sheet1.xml']
  assert.ok(sheet.includes('<c r="A1" s="1" t="inlineStr"><is><t>007</t></is></c>'), 'the header’s style kept; leading zeros keep it text')
  assert.ok(sheet.includes('<c r="C1" t="b"><v>1</v></c><c r="D1" t="inlineStr"><is><t xml:space="preserve"> Note </t></is></c></row>'), 'added after the row’s cells, in order')
  assert.ok(sheet.includes('<c r="A3" t="inlineStr"><is><t>Groceries &amp; co</t></is></c>'))
  assert.ok(sheet.includes('<row r="4"><c r="A4" t="s"><v>4</v></c></row><row r="5"><c r="C5"><f>B2*2</f></c></row></sheetData>'), 'a cell without a style goes; a row comes in order')
  assert.equal(after['xl/sharedStrings.xml'], before['xl/sharedStrings.xml'])
  assert.equal(after['xl/styles.xml'], before['xl/styles.xml'])
  assert.equal(after['xl/workbook.xml'].match(/fullCalcOnLoad="1"/g)?.length, 1)
  // An emptied cell with a style keeps it.
  assert.ok((await partsOf(await setCells(bytes, [{ sheet: 0, ref: 'A1', value: '' }], 'Budget.xlsx')))['xl/worksheets/sheet1.xml'].includes('<row r="1"><c r="A1" s="1"/>'))
  await assert.rejects(setCells(bytes, [{ sheet: 2, ref: 'A1', value: 'x' }], 'Budget.xlsx'), /Budget\.xlsx has no sheet 3/)
  for (const ref of ['B0', 'XFE1', 'A1048577', 'b2', 'A1:B2']) await assert.rejects(setCells(bytes, [{ sheet: 0, ref, value: 'x' }], 'Budget.xlsx'), /isn't a cell/, ref)
})

test('setCells: a prefixed sheet, rows and cells placed by order, a style that shows numbers as text, a shared formula’s cells, the formulas’ chain dropped (D229)', async () => {
  const bytes = await zipOf({
    '[Content_Types].xml': '<Types><Override PartName="/xl/workbook.xml" ContentType="main"/><Override PartName="/xl/calcChain.xml" ContentType="calcChain"/></Types>',
    'xl/workbook.xml': `<x:workbook xmlns:r="${RELS}"><x:sheets><x:sheet name="Data" sheetId="1" r:id="rId1"/></x:sheets><x:definedNames/><x:extLst/></x:workbook>`,
    'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="calcChain.xml"/></Relationships>',
    'xl/calcChain.xml': '<calcChain><c r="C2" i="1"/><c r="C3"/></calcChain>',
    'xl/styles.xml': '<styleSheet><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="49" applyNumberFormat="1"><alignment/></xf></cellXfs></styleSheet>',
    'xl/worksheets/sheet1.xml': '<x:worksheet><x:sheetData><x:row r="1" spans="1:2"><x:c r="A1"><x:v>1</x:v></x:c><x:c r="B1" s="1"><x:v>7</x:v></x:c></x:row>'
      + '<x:row><x:c><x:v>2</x:v></x:c><x:c/><x:c r="C2"><x:f t="shared" ref="C2:C3" si="0">A2*2</x:f><x:v>4</x:v></x:c></x:row>'
      + '<x:row r="3"><x:c r="C3"><x:f t="shared" si="0"/><x:v>0</x:v></x:c></x:row></x:sheetData></x:worksheet>',
  })
  const after = await partsOf(await setCells(bytes, [{ sheet: 0, ref: 'B1', value: '42' }, { sheet: 0, ref: 'B2', value: 'FALSE' }, { sheet: 0, ref: 'C3', value: '9' }], 'Data.xlsx'))
  const sheet = after['xl/worksheets/sheet1.xml']
  assert.ok(sheet.includes('<x:row r="1"><x:c r="A1"><x:v>1</x:v></x:c><x:c r="B1" s="1" t="inlineStr"><x:is><x:t>42</x:t></x:is></x:c></x:row>'), 'text as its style says, spans gone')
  assert.ok(sheet.includes('<x:row><x:c><x:v>2</x:v></x:c><x:c r="B2" t="b"><x:v>0</x:v></x:c><x:c r="C2">'), 'the second row and cell, where they are')
  assert.ok(sheet.includes('<x:row r="3"><x:c r="C3"><x:v>9</x:v></x:c></x:row>'), 'a cell that used the shared formula takes a value')
  assert.equal(after['xl/calcChain.xml'], undefined)
  assert.ok(!after['xl/_rels/workbook.xml.rels'].includes('calcChain') && !after['[Content_Types].xml'].includes('calcChain'))
  assert.ok(after['xl/workbook.xml'].includes('<x:definedNames/><x:calcPr fullCalcOnLoad="1"/><x:extLst/>'), 'calcPr where the standard puts it')
  await assert.rejects(setCells(bytes, [{ sheet: 0, ref: 'C2', value: '1' }], 'Data.xlsx'), /C2 in Data holds the formula that the cells of C2:C3 share/)
  // A value changed where no formula was keeps the formulas' chain.
  assert.ok((await partsOf(await setCells(bytes, [{ sheet: 0, ref: 'A1', value: '3' }], 'Data.xlsx')))['xl/calcChain.xml'])
})

test('setCells: a table’s header and part of an array formula change only as a whole, in a spreadsheet app (D229)', async () => {
  const bytes = await zipOf({
    'xl/workbook.xml': `<workbook xmlns:r="${RELS}"><sheets><sheet name="Scores" sheetId="1" r:id="rId1"/></sheets><calcPr calcId="191029"/></workbook>`,
    'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/worksheets/sheet1.xml': '<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Name</t></is></c><c r="B1" t="inlineStr"><is><t>Score</t></is></c></row>'
      + '<row r="2"><c r="A2" t="inlineStr"><is><t>Ana</t></is></c><c r="B2"><v>3</v></c><c r="D2"><f t="array" ref="D2:D3">B2:B3*2</f><v>6</v></c></row></sheetData></worksheet>',
    'xl/worksheets/_rels/sheet1.xml.rels': `<Relationships><Relationship Id="rId1" Type="${RELS}/table" Target="../tables/table1.xml"/></Relationships>`,
    'xl/tables/table1.xml': '<table id="1" name="Scores" displayName="Scores" ref="A1:B2"><tableColumns count="2"><tableColumn id="1" name="Name"/><tableColumn id="2" name="Score"/></tableColumns></table>',
  })
  await assert.rejects(setCells(bytes, [{ sheet: 0, ref: 'B1', value: 'Points' }], 'Scores.xlsx'), /B1 in Scores heads a column of the table Scores/)
  await assert.rejects(setCells(bytes, [{ sheet: 0, ref: 'D3', value: '1' }], 'Scores.xlsx'), /D3 in Scores is part of an array formula over D2:D3/)
  const changed = await setCells(bytes, [{ sheet: 0, ref: 'A2', value: 'Bea' }, { sheet: 0, ref: 'B2', value: '4' }, { sheet: 0, ref: 'C1', value: 'Note' }], 'Scores.xlsx')
  assert.deepEqual(await extractPages('Scores.xlsx', changed), ['Sheet: Scores\nName\tScore\tNote\nBea\t4\t\t6'])
  assert.ok((await partsOf(changed))['xl/workbook.xml'].includes('<calcPr calcId="191029" fullCalcOnLoad="1"/>'))
})

test('replaceInSheet: a passage within one row, as Files reads it; one that ends its row adds cells; a formula stays unless a formula replaces it (D229)', async () => {
  const bytes = await budget()
  const text = async (/** @type {Uint8Array} */ data) => (await extractPages('Budget.xlsx', data)).join('\n')
  assert.equal(await text(bytes), 'Sheet: Budget\nItem\tAmount\nRent\t1200\nFood\t450\nTotal\t1650')
  const changed = await replaceInSheet(bytes, 'Food\t450', 'Food\t500', 'Budget.xlsx', replaceOnce)
  assert.equal(await text(changed), 'Sheet: Budget\nItem\tAmount\nRent\t1200\nFood\t500\nTotal\t1650')
  assert.ok((await partsOf(changed))['xl/worksheets/sheet1.xml'].includes('<row r="3"><c r="A3" t="s"><v>3</v></c><c r="B3"><v>500</v></c></row>'), 'only the cell that changed')
  assert.equal(await text(await replaceInSheet(bytes, 'Rent\t1200', 'Rent\t1200\tmonthly', 'Budget.xlsx', replaceOnce)), 'Sheet: Budget\nItem\tAmount\nRent\t1200\tmonthly\nFood\t450\nTotal\t1650')
  assert.equal(await text(await replaceInSheet(bytes, 'nt\t12', 'nt\t13', 'Budget.xlsx', replaceOnce)), 'Sheet: Budget\nItem\tAmount\nRent\t1300\nFood\t450\nTotal\t1650')
  await assert.rejects(replaceInSheet(bytes, 'Item', 'Item\tCategory', 'Budget.xlsx', replaceOnce), /keep the cells a passage spans/)
  await assert.rejects(replaceInSheet(bytes, '450\nTotal', 'x', 'Budget.xlsx', replaceOnce), /one row at a time/)
  await assert.rejects(replaceInSheet(bytes, 'nowhere', 'x', 'Budget.xlsx', replaceOnce), /not in Budget\.xlsx/)
  await assert.rejects(replaceInSheet(bytes, 'Total\t1650', 'Total\t1700', 'Budget.xlsx', replaceOnce), /B4 in Budget is worked out by a formula, =SUM\(B2:B3\): give a new formula/)
  const doubled = await replaceInSheet(bytes, 'Total\t1650', 'Total\t=SUM(B2:B3)*2', 'Budget.xlsx', replaceOnce)
  assert.equal(await text(doubled), 'Sheet: Budget\nItem\tAmount\nRent\t1200\nFood\t450\nTotal\t=SUM(B2:B3)*2', 'a formula without its result shows as itself')
  // Back as it was.
  assert.equal(await text(await replaceInSheet(changed, 'Food\t500', 'Food\t450', 'Budget.xlsx', replaceOnce)), await text(bytes))
})

// ─── Library ─────────────────────────────────────────────────────────────────

test('pages round-trip through their markers', () => {
  assert.deepEqual(splitPages(joinPages(['one', 'two\n\nlines'])), ['one', 'two\n\nlines'])
  assert.deepEqual(splitPages('no markers'), ['no markers'])
})

test('addFile stores the original, its text and metadata once, by content', async () => {
  const fs = memoryFS()
  const bytes = enc.encode('hello')
  const input = { projectDir: 'projects/p', name: 'Hello.TXT', mimeType: 'text/plain', bytes, pages: ['hello'], by: 'dev1', now: new Date('2026-10-02T10:00:00Z') }
  const link = await addFile(fs, input)
  assert.match(link.uri, /^files\/sha256-[0-9a-f]{64}\.txt$/)
  assert.deepEqual({ ...link, uri: '' }, { type: 'resource_link', uri: '', name: 'Hello.TXT', mimeType: 'text/plain', size: 5 })
  assert.equal(await fileText(fs, 'projects/p', link.uri), '[[page 1]]\nhello')
  assert.equal((await fileMeta(fs, 'projects/p', link.uri))?.author, 'dev1')
  const again = await addFile(fs, { ...input, name: 'copy.txt' })
  assert.equal(again.uri, link.uri)
  assert.equal((await walk(fs)).length, 3)
})

test('pagesThatFit keeps whole files that fit, else the first pages (at least one)', () => {
  const pages = ['a'.repeat(300), 'b'.repeat(300), 'c'.repeat(300)]
  assert.deepEqual(pagesThatFit(pages, 1000), [1, 3])
  assert.deepEqual(pagesThatFit(pages, 250), [1, 2])
  assert.deepEqual(pagesThatFit(pages, 1), [1, 1])
  assert.equal(estimateTokens('日本語'), 3)
})

test('documentPart shows the recorded pages and says how to read the rest', () => {
  const text = joinPages(['p1', 'p2', 'p3'])
  /** @type {import('../core/types.js').ResourceLink} */
  const link = { type: 'resource_link', uri: 'files/x.pdf', name: 'x.pdf' }
  assert.equal(documentPart(link, text).text, text)
  const part = documentPart({ ...link, _meta: { pages: [1, 2], of: 3 } }, text)
  assert.equal(part.text, '[[page 1]]\np1\n\n[[page 2]]\np2\n\n(Pages 1–2 of 3. Use read for the others.)')
  assert.equal(documentPart({ ...link, uri: 'files/y.txt' }, joinPages(['only'])).text, 'only')
  assert.match(documentPart(link, null).text, /no longer available/)
})

test('a picture is shown to a brain that can see, and named to one that can’t', () => {
  /** @type {import('../core/types.js').ResourceLink} */
  const link = { type: 'resource_link', uri: 'files/s.png', name: 'Screen.png', mimeType: 'image/png', _meta: { source: 3 } }
  assert.ok(isPicture(link) && isPicture({ ...link, mimeType: 'image/jpeg' }))
  assert.ok(!isPicture({ ...link, mimeType: 'image/svg+xml' }) && !isPicture({ ...link, mimeType: undefined }))
  assert.deepEqual(documentPart(link, joinPages(['']), 'iVBORw0K'), { name: 'Screen.png', source: 3, text: '(The picture follows.)', image: { mimeType: 'image/png', data: 'iVBORw0K' } })
  assert.match(documentPart(link, joinPages([''])).text, /^\(A picture\. You cannot see pictures/)
  assert.match(documentPart(link, null, 'iVBORw0K').text, /no longer available/)
})

test('parsePages', () => {
  assert.deepEqual(parsePages(undefined, 9), [1, 9])
  assert.deepEqual(parsePages('3', 9), [3, 3])
  assert.deepEqual(parsePages('2-5', 9), [2, 5])
  assert.deepEqual(parsePages('4–', 9), [4, 9])
  assert.deepEqual(parsePages('7-99', 9), [7, 9])
  assert.deepEqual(parsePages(12, 9), [9, 9])
  assert.deepEqual(parsePages('nonsense', 9), [1, 9])
})

test('the read tool finds files by name and cuts long reads', async () => {
  const fs = memoryFS()
  const pages = Array.from({ length: 5 }, (_, i) => `Page ${i + 1} `.repeat(400))
  const link = await addFile(fs, { projectDir: 'p', name: 'Big.pdf', bytes: enc.encode('%PDF'), pages, by: 'd' })
  const tool = readTool({ fs, projectDir: () => 'p', files: () => [link], maxTokens: 1200 })
  assert.deepEqual(tool.locations?.({ file: 'big.pdf' }), [{ path: link.uri }])
  const out = await tool.run({ file: 'big.pdf', pages: '2-5' }, {})
  assert.match(out, /^Big\.pdf, pages 2–2 of 5\. Pages 3–5 are not shown\./)
  assert.ok(out.includes('[[page 2]]') && !out.includes('[[page 3]]'))
  await assert.rejects(tool.run({ file: 'other.pdf' }, {}), /No file named "other\.pdf"\. Files: Big\.pdf\./)
  const shot = await addFile(fs, { projectDir: 'p', name: 'Screen.png', mimeType: 'image/png', bytes: enc.encode('PNG'), pages: [''], by: 'd' })
  await assert.rejects(readTool({ fs, projectDir: () => 'p', files: () => [shot] }).run({ file: 'screen.png' }, {}), /"Screen\.png" is a picture/)
})

test("the read tool reads the files of the conversation that asked, by its run's signal, on screen or not", async () => {
  const fs = memoryFS()
  const here = await addFile(fs, { projectDir: 'p', name: 'Here.txt', bytes: enc.encode('here'), pages: ['On screen.'], by: 'd' })
  const away = await addFile(fs, { projectDir: 'p', name: 'Away.txt', bytes: enc.encode('away'), pages: ['Out of sight.'], by: 'd' })
  const run = new AbortController()
  const tool = readTool({ fs, projectDir: () => 'p', files: (signal) => (signal === run.signal ? [away] : [here]) })
  assert.match(await tool.run({ file: 'away.txt' }, { signal: run.signal }), /Out of sight\./)
  await assert.rejects(tool.run({ file: 'away.txt' }, {}), /No file named "away\.txt"\. Files: Here\.txt\./)
})

// ─── Backup ──────────────────────────────────────────────────────────────────

const HOME = (/** @type {string} */ id) => `---\nformat: 1\ndefault: true\nname: Home\n---\n${id}`

test('backups leave secrets, caches and temporary files out', async () => {
  assert.ok(isBackedUp('settings.json') && isBackedUp('projects/a/files/x.pdf'))
  assert.ok(!isBackedUp('.secrets/keys.json') && !isBackedUp('.cache/index') && !isBackedUp('a.md.tmp'))
  const fs = memoryFS({ 'settings.json': '{}', '.secrets/keys.json': 'secret', 'projects/A/project.md': HOME('A'), 'projects/A/files/x.bin': new Uint8Array([0, 255]) })
  const { bytes, files } = await exportBackup(fs, { by: 'dev', now: new Date('2026-10-02T10:00:00Z') })
  assert.equal(files, 3)
  const names = readZip(bytes).map((e) => e.name)
  assert.deepEqual(names, ['backup.json', 'projects/A/files/x.bin', 'projects/A/project.md', 'settings.json'])
  assert.ok(!dec.decode(bytes).includes('secret'))
})

test('importing adds what is missing, grows conversations and keeps local files', async () => {
  const source = memoryFS({
    'settings.json': '{"from":"backup"}',
    'projects/A/project.md': HOME('A'),
    'projects/A/conversations/1.jsonl': 'header\nline1\nline2\n',
    'projects/A/files/x.bin': new Uint8Array([1, 2, 3]),
  })
  const { bytes } = await exportBackup(source, { by: 'dev' })
  const target = memoryFS({
    'settings.json': '{"from":"device"}',
    'projects/B/project.md': HOME('B'), // the empty default project of a fresh device
    'projects/A/conversations/1.jsonl': 'header\nline1\n',
  })
  const result = await importBackup(target, bytes)
  assert.deepEqual(result, { added: 2, updated: 1, kept: 1 })
  assert.equal(await target.read('settings.json'), '{"from":"device"}')
  assert.equal(await target.read('projects/A/conversations/1.jsonl'), 'header\nline1\nline2\n')
  assert.deepEqual(await target.readBytes('projects/A/files/x.bin'), new Uint8Array([1, 2, 3]))
  assert.equal(await target.exists('projects/B'), false, 'the empty local default project is gone')
})

test('importing never shortens a conversation that diverged, and rejects non-backups', async () => {
  const { bytes } = await exportBackup(memoryFS({ 'c.jsonl': 'a\nb\nc\n' }), { by: 'd' })
  const target = memoryFS({ 'c.jsonl': 'a\nX\n' })
  assert.deepEqual(await importBackup(target, bytes), { added: 0, updated: 0, kept: 1 })
  assert.equal(await target.read('c.jsonl'), 'a\nX\n')
  await assert.rejects(importBackup(target, await zipOf({ 'x.txt': 'x' })), /not a backup/)
})

test('weigh totals the files by kind: tasks, files, workspaces, and the rest', async () => {
  const fs = memoryFS({
    'settings.json': '{}', 'memory.md': 'abc', '.cache/search.json': '12345', '.secrets/keys': 'k',
    'projects/01-home/project.md': 'xy', 'projects/01-home/conversations/01.jsonl': 'abcdef', 'projects/01-home/files/sha256-a.pdf': new Uint8Array(10),
    'projects/02-work/conversations/02.jsonl': 'été', 'projects/02-work/workspace/site/index.html': '<p>', 'projects/02-work/skills/x/SKILL.md': 'z',
  })
  assert.deepEqual(await weigh(fs), { conversations: 6 + 5, files: 10, workspace: 3, rest: 2 + 3 + 5 + 1 + 2 + 1 })
  assert.deepEqual(await weigh(memoryFS()), { conversations: 0, files: 0, workspace: 0, rest: 0 })
})
