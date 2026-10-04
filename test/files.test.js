import { test } from 'node:test'
import assert from 'node:assert/strict'
import { memoryFS, walk } from '../core/fs.js'
import { crc32, readZip, writeZip } from '../core/zip.js'
import { decodeText, docx, extractPages, extractable, paginate, sheetRows, slideText } from '../caps/files/extract.js'
import { addFile, documentPart, estimateTokens, fileMeta, fileText, joinPages, pagesThatFit, parsePages, readTool, splitPages } from '../core/files.js'
import { isPicture } from '../core/events.js'
import { exportBackup, importBackup, isBackedUp } from '../caps/backup/archive.js'

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
