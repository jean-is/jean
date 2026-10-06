import { test } from 'node:test'
import assert from 'node:assert/strict'
import { memoryFS } from '../core/fs.js'
import { makeFile, replaceOnce } from '../caps/made/formats.js'
import { extractPages } from '../caps/files/extract.js'
import { readZip } from '../core/zip.js'
import {
  ignoreRules, ignored, walkFolder, listingText, findInFolder, openText, lineRange, changeText, planChange, diffLines, lastRead, topLevel, exactText,
} from '../caps/folders/work.js'
import { replaceInWord } from '../caps/folders/word.js'
import { copyFS, pickedFiles } from '../caps/folders/copy.js'
import { sitePage, inFolder, SITE } from '../caps/folders/site.js'

const encoder = new TextEncoder()
const contract = (/** @type {string} */ name, /** @type {string} */ clause) => makeFile(`${name}.docx`, `# Contract with ${name}\n\nThe parties agree as follows.\n\n${clause}\n\nSigned in Lyon.`).then((made) => made.bytes)

test('.gitignore: patterns anywhere or anchored, folders only, ** and !', () => {
  const rules = [...ignoreRules('# build output\n*.log\n/dist\nbuild/\ndocs/**/draft-*.md\n!keep.log\n\\#notes\n'), ...ignoreRules('secret.txt\n', 'app')]
  const out = (/** @type {string} */ path, isDir = false) => ignored(path, isDir, rules)
  assert.ok(out('server.log') && out('a/b/server.log'))
  assert.ok(!out('keep.log') && !out('a/keep.log'))
  assert.ok(out('dist', true) && !out('app/dist', true))
  assert.ok(out('build', true) && out('app/build', true) && !out('build'))
  assert.ok(out('docs/draft-1.md') && out('docs/a/b/draft-2.md') && !out('docs/final.md'))
  assert.ok(out('#notes'))
  assert.ok(out('app/secret.txt') && out('app/x/secret.txt') && !out('secret.txt'))
})

test('walkFolder: folders first, leaving out .git, node_modules and what .gitignore names, below a folder too', async () => {
  const fs = memoryFS({
    '.gitignore': 'dist/\n*.tmp\n', 'README.md': '# App', 'src/main.js': 'x', 'src/old.tmp': 'x', 'src/lib/.gitignore': 'gen.js\n', 'src/lib/gen.js': 'x', 'src/lib/util.js': 'x',
    'dist/app.js': 'x', 'node_modules/a/index.js': 'x', '.git/HEAD': 'ref', 'docs/guide.md': 'x',
  })
  const listing = await walkFolder(fs)
  assert.deepEqual(listing.entries.map((entry) => entry.path), ['docs', 'docs/guide.md', 'src', 'src/lib', 'src/lib/.gitignore', 'src/lib/util.js', 'src/main.js', '.gitignore', 'README.md'])
  assert.equal(listingText(await walkFolder(fs, 'src', 1)), 'src/lib/\nsrc/main.js')
  assert.equal(await topLevel(fs), 'docs/\nsrc/\n.gitignore\nREADME.md')
  assert.equal(listingText({ entries: listing.entries, more: false }, 2), 'docs/\ndocs/guide.md\n…and 7 more. List a folder inside it to see them.')
})

test('findInFolder: inside Word documents and text, case and accents aside, as path, line and passage; then all the words', async () => {
  const fs = memoryFS({
    'Contracts/Acme.docx': await contract('Acme', 'A late payment fee of 2% applies after 60 days.'),
    'Contracts/Bolt.docx': await contract('Bolt', 'Late   Payment: interest is due after 30 days.'),
    'Contracts/Cyan.docx': await contract('Cyan', 'No fee is charged for a payment that is late.'),
    'notes/Résumé.txt': 'Ask Dana about the LATE PAYMENT clause.\r\nNothing else.',
    'photo.png': new Uint8Array([137, 80, 78, 71, 0, 0, 0, 13]),
  })
  const found = await findInFolder(fs, 'late payment', { cache: new Map() })
  assert.match(found.text, /^Contracts\/Acme\.docx:3: A late payment fee of 2% applies after 60 days\.$/m)
  assert.match(found.text, /^notes\/Résumé\.txt:1: Ask Dana about the LATE PAYMENT clause\.$/m)
  assert.match(found.text, /3 places in 3 files\.$/)
  assert.doesNotMatch(found.text, /Cyan/)
  assert.deepEqual(Object.keys(found.read).sort(), ['Contracts/Acme.docx', 'Contracts/Bolt.docx', 'notes/Résumé.txt'])
  // Accents aside, and every word on one line when no line holds them together.
  assert.match((await findInFolder(fs, 'resume')).text, /Not found in 5 files/)
  assert.match((await findInFolder(fs, 'dana clause')).text, /notes\/Résumé\.txt:1:[\s\S]*with all its words but not together/)
  assert.match((await findInFolder(fs, 'fee', { path: 'Contracts' })).text, /2 places in 2 files/)
  await assert.rejects(findInFolder(fs, '  '), /Say what text/)
})

test('openText: by lines, with which lines these are; a folder, a missing file and a picture said so', async () => {
  const lines = Array.from({ length: 10 }, (_, i) => `line ${i + 1}`).join('\r\n')
  const fs = memoryFS({ 'a.txt': `﻿${lines}`, 'pic.png': new Uint8Array([1, 0, 2]), 'dir/x.txt': 'x' })
  const all = await openText(fs, 'a.txt', undefined)
  assert.equal(all.text, `a.txt, lines 1-10 of 10.\n${lines.replaceAll('\r\n', '\n')}\n`)
  assert.equal(all.stamp?.size, encoder.encode(`﻿${lines}`).length)
  assert.equal((await openText(fs, 'a.txt', '3-4')).text, 'a.txt, lines 3-4 of 10. Read on with lines 5-.\nline 3\nline 4\n')
  assert.deepEqual([lineRange('7-', 10), lineRange('12', 10), lineRange('5-2', 10), lineRange('x', 10)], [[7, 10], [10, 10], [5, 5], [1, 10]])
  await assert.rejects(openText(fs, 'dir', undefined), /is a folder/)
  await assert.rejects(openText(fs, 'nope.txt', undefined), /There is no file at nope\.txt/)
  await assert.rejects(openText(fs, 'pic.png', undefined), /isn't text/)
})

test('changeText: one passage, in the file’s own line endings and byte order mark, so a diff shows only it', () => {
  const crlf = '﻿const greeting = "Hello"\r\nconsole.log(greeting)\r\n'
  assert.equal(changeText(crlf, 'const greeting = "Hello"\n', 'const greeting = "Bonjour"\n', 'main.js', replaceOnce), '﻿const greeting = "Bonjour"\r\nconsole.log(greeting)\r\n')
  const mixed = 'a\r\nb\nc'
  assert.equal(changeText(mixed, 'b', 'B', 'x', replaceOnce), 'a\r\nB\nc')
  assert.throws(() => changeText('a a', 'a', 'b', 'x.txt', replaceOnce), /is in x\.txt 2 times/)
  assert.throws(() => changeText('abc', 'z', 'b', 'x.txt', replaceOnce), /not in x\.txt/)
})

test('planChange: text exactly, a file made from an empty passage, a Word document in place, what can’t be changed said so', async () => {
  const fs = memoryFS({ 'main.js': 'let a = 1\r\nlet b = 2\r\n', 'old.txt': new Uint8Array([0x63, 0x61, 0x66, 0xe9]), 'Acme.docx': await contract('Acme', 'Payment is due within 60 days of the invoice.'), 'deck.pptx': 'x' })
  const text = await planChange(fs, { path: 'main.js', old: 'let b = 2', new: 'let b = 3' })
  assert.deepEqual([text.before, text.after, new TextDecoder().decode(text.bytes)], ['let a = 1\r\nlet b = 2\r\n', 'let a = 1\r\nlet b = 3\r\n', 'let a = 1\r\nlet b = 3\r\n'])
  const made = await planChange(fs, { path: 'notes/new.md', old: '', new: '# New' })
  assert.deepEqual([made.before, made.after], [null, '# New'])
  const sheet = await planChange(fs, { path: 'Totals.xlsx', old: '', new: 'region,total\nNorth,2540' })
  assert.ok(readZip(sheet.bytes).some((entry) => entry.name === 'xl/workbook.xml'))
  await assert.rejects(planChange(fs, { path: 'missing.txt', old: 'a', new: 'b' }), /There is no file at missing\.txt/)
  await assert.rejects(planChange(fs, { path: 'old.txt', old: 'caf', new: 'tea' }), /isn't UTF-8 text/)
  await assert.rejects(planChange(fs, { path: 'deck.pptx', old: 'x', new: 'y' }), /can't be changed in place/)
  const word = await planChange(fs, { path: 'Acme.docx', old: 'within 60 days', new: 'within 30 days' })
  assert.match(String(word.before), /within 60 days/)
  assert.match(word.after, /Payment is due within 30 days of the invoice\./)
  assert.deepEqual(diffLines(word.before, word.after).rows.filter((row) => row.kind !== ' '), [
    { kind: '-', text: 'Payment is due within 60 days of the invoice.' }, { kind: '+', text: 'Payment is due within 30 days of the invoice.' },
  ])
})

test('replaceInWord: a passage over several runs takes the first one’s formatting, and the rest of the document stays as it was', async () => {
  const bytes = await makeFile('Plan.docx', 'Fees: **late** payments cost *2%* more.\n\nSecond paragraph & more.').then((made) => made.bytes)
  const before = readZip(bytes)
  const changed = await replaceInWord(bytes, 'late payments cost 2', 'early payments cost 1', 'Plan.docx', replaceOnce)
  const text = (await extractPages('Plan.docx', changed)).join('\n')
  assert.match(text, /Fees: early payments cost 1% more\./)
  assert.match(text, /Second paragraph & more\./)
  const after = readZip(changed)
  assert.deepEqual(after.map((entry) => entry.name), before.map((entry) => entry.name))
  for (const [i, entry] of before.entries()) if (entry.name !== 'word/document.xml') assert.deepEqual(await after[i].read(), await entry.read())
  await assert.rejects(replaceInWord(bytes, 'more.\nSecond', 'x', 'Plan.docx', replaceOnce), /one paragraph at a time/)
  await assert.rejects(replaceInWord(bytes, 'nowhere', 'x', 'Plan.docx', replaceOnce), /not in Plan\.docx/)
  // Back as it was, word for word.
  const undone = await replaceInWord(changed, 'early payments cost 1', 'late payments cost 2', 'Plan.docx', replaceOnce)
  assert.match((await extractPages('Plan.docx', undone)).join('\n'), /Fees: late payments cost 2% more\./)
})

test('diffLines: the lines between what stayed the same, three around them; a made file all added', () => {
  const before = Array.from({ length: 10 }, (_, i) => `l${i + 1}`).join('\n')
  const after = before.replace('l6', 'six\nsix and a half')
  assert.deepEqual(diffLines(before, after), { line: 3, rows: [
    { kind: ' ', text: 'l3' }, { kind: ' ', text: 'l4' }, { kind: ' ', text: 'l5' }, { kind: '-', text: 'l6' }, { kind: '+', text: 'six' }, { kind: '+', text: 'six and a half' },
    { kind: ' ', text: 'l7' }, { kind: ' ', text: 'l8' }, { kind: ' ', text: 'l9' },
  ] })
  assert.deepEqual(diffLines(null, 'a\nb').rows, [{ kind: '+', text: 'a' }, { kind: '+', text: 'b' }])
  assert.deepEqual(diffLines('a\r\nb', 'a\nc').rows, [{ kind: ' ', text: 'a' }, { kind: '-', text: 'b' }, { kind: '+', text: 'c' }])
})

test('lastRead: the latest size and date read or changed, in that folder, by completed calls only', () => {
  const call = (/** @type {string} */ folder, /** @type {Record<string, [number, number]>} */ read, status = 'completed') => /** @type {any} */ ({ toolCallId: 'x', title: '', status, _meta: { folder, read } })
  const calls = [call('Clients', { 'a.txt': [1, 10] }), call('Code', { 'a.txt': [2, 20] }), call('Clients', { 'a.txt': [3, 30] }, 'failed'), call('Clients', { 'b.txt': [4, 40] })]
  assert.deepEqual(lastRead(calls, 'Clients', 'a.txt'), [1, 10])
  assert.deepEqual(lastRead(calls, 'Code', 'a.txt'), [2, 20])
  assert.equal(lastRead(calls, 'Clients', 'c.txt'), undefined)
})

test('memoryFS: stat gives a size and a date that moves on with each write', async () => {
  const fs = memoryFS({ 'a.txt': 'é' })
  const first = await fs.stat?.('a.txt')
  await fs.write('a.txt', 'é')
  const second = await fs.stat?.('a.txt')
  assert.equal(first?.size, 2)
  assert.ok((second?.lastModified ?? 0) > (first?.lastModified ?? 0))
  assert.equal(await fs.stat?.('nope'), null)
  assert.equal(exactText(new Uint8Array([0xef, 0xbb, 0xbf, 0x61])), '﻿a')
})

test('a copy of a folder picked where it can’t be opened in place: read as it is, changes kept beside it and zipped', async () => {
  const file = (/** @type {string} */ path, /** @type {string} */ text) => Object.defineProperty(new File([text], path.split('/').at(-1) ?? path, { lastModified: 1000 }), 'webkitRelativePath', { value: path })
  const { name, files } = pickedFiles([file('Clients/notes.txt', 'Monday'), file('Clients/Contracts/a.txt', 'x'), file('Clients/.git/HEAD', 'ref'), file('Clients/node_modules/m/i.js', 'y')])
  assert.equal(name, 'Clients')
  assert.deepEqual([...files.keys()], ['notes.txt', 'Contracts/a.txt'])
  const fs = copyFS(files)
  assert.deepEqual(await fs.list(''), [{ name: 'Contracts', kind: 'directory' }, { name: 'notes.txt', kind: 'file' }])
  assert.deepEqual(await fs.stat?.('notes.txt'), { size: 6, lastModified: 1000 })
  await fs.write('notes.txt', 'Friday')
  assert.equal(await fs.read('notes.txt'), 'Friday')
  assert.ok(((await fs.stat?.('notes.txt'))?.lastModified ?? 0) > 1000)
  await fs.remove('Contracts')
  assert.equal(await fs.exists('Contracts/a.txt'), false)
  assert.deepEqual(fs.changed(), ['notes.txt'])
  const zip = readZip(await fs.zip())
  assert.deepEqual([zip.map((entry) => entry.name), new TextDecoder().decode(await zip[0].read())], [['notes.txt'], 'Friday'])
})

// ─── Pages of the folder, for the browser (D156) ─────────────────────────────

/** The text behind a data address. @param {string} url */
const behind = (url) => Buffer.from(url.slice(url.indexOf(',') + 1), 'base64').toString('utf8')
/** Every data address in a page, by its type. @param {string} html @param {string} type */
const addresses = (html, type) => [...html.matchAll(new RegExp(`data:${type.replace('/', '\\/')};base64,[A-Za-z0-9+/=]+`, 'g'))].map((m) => m[0])

test('inFolder: a reference as a path of the folder, never another site, a hidden file or above the top', () => {
  assert.equal(inFolder('style.css', 'site/index.html'), 'site/style.css')
  assert.equal(inFolder('../img/a%20b.png?v=2#top', 'site/pages/about.html'), 'site/img/a b.png')
  assert.equal(inFolder('/logo.svg', 'site/index.html'), 'logo.svg')
  assert.equal(inFolder('../../../../etc/passwd', 'site/index.html'), 'etc/passwd')
  for (const ref of ['https://cdn.example/x.js', '//cdn.example/x.js', 'data:image/png;base64,AA', '#top', '', '.env', 'js/.secret.js', 'mailto:a@b.c']) assert.equal(inFolder(ref, 'index.html'), null, ref)
})

test('a page of the folder comes with what it uses: styles, pictures, fonts, scripts, modules and the data its scripts fetch', async () => {
  const fs = memoryFS({
    'site/index.html': `<!doctype html><html><head><link rel="stylesheet" href="css/main.css" media="screen"><link rel="stylesheet" href="https://cdn.example/x.css">
<style>h1 { background: url('img/bg.png') }</style><script src="js/app.js" defer integrity="sha384-x"></script><script src="https://cdn.example/lib.js"></script>
<script type="module" src="js/main.js"></script><script type="module">import { two } from './js/two.js'; document.title = two</script>
<script type="application/json">{"src": "x.png"}</script></head>
<body><img src="img/a.png" alt="a > b" srcset="img/a.png 1x, img/a2.png 2x"><div style="background: url(img/bg.png)"></div><a href="about.html">About</a>
<img src="../.env"><img src="missing.png"><textarea><img src="img/a.png"></textarea><svg><image href="img/a.png"/></svg></body></html>`,
    'site/css/main.css': '@import "base.css";\n@font-face { font-family: F; src: url(../fonts/f.woff2) }',
    'site/css/base.css': 'body { background: url("../img/bg.png") }',
    'site/img/a.png': new Uint8Array([137, 80, 78, 71]), 'site/img/a2.png': new Uint8Array([1]), 'site/img/bg.png': new Uint8Array([2]), 'site/fonts/f.woff2': new Uint8Array([3]),
    'site/js/app.js': 'fetch("data/sales.csv").then((r) => r.text())',
    'site/js/main.js': "import { one } from './one.js'\nimport('./lazy.js')\nexport * from 'https://cdn.example/m.js'",
    'site/js/one.js': "import { two } from './two.js'\nexport const one = two + 1",
    'site/js/two.js': "import { one } from './one.js'\nexport const two = 2",
    'site/js/lazy.js': 'export default 1',
    'site/data/sales.csv': 'region,sales\nNorth,12\n',
    'site/.env': 'KEY=secret', 'site/about.html': '<h1>About</h1>',
  })
  const shown = await sitePage(fs, 'site/index.html')
  assert.ok('html' in shown)
  const { html, path, files } = shown
  assert.equal(path, 'site/index.html')
  // Styles inline, their imports and what they use inside; another site's left to the page's policy.
  assert.match(html, /<style media="screen">body \{ background: url\("data:image\/png;base64,Ag=="\) \}\n@font-face \{ font-family: F; src: url\("data:font\/woff2;base64,Aw=="\) \}<\/style>/)
  assert.match(html, /<link rel="stylesheet" href="https:\/\/cdn.example\/x.css">/)
  assert.match(html, /h1 \{ background: url\("data:image\/png;base64,Ag=="\) \}/)
  assert.match(html, /<div style="background: url\(&quot;data:image\/png;base64,Ag==&quot;\)">/)
  // Pictures as data, a set of them too, in an SVG as well; not in a textarea, never a hidden file.
  assert.match(html, /<img src="data:image\/png;base64,iVBORw==" alt="a > b" srcset="data:image\/png;base64,iVBORw== 1x, data:image\/png;base64,AQ== 2x">/)
  assert.match(html, /<image href="data:image\/png;base64,iVBORw=="\/>/)
  assert.match(html, /<textarea><img src="img\/a.png"><\/textarea>/)
  assert.match(html, /<img src="\.\.\/\.env"><img src="missing.png">/)
  assert.ok(!html.includes(Buffer.from('KEY=secret').toString('base64')))
  // A classic script as data, deferred still, without an integrity it no longer has; another site's as it was.
  const app = /<script src="(data:text\/javascript;base64,[^"]+)" defer><\/script>/.exec(html)?.[1] ?? ''
  assert.equal(behind(app), 'fetch("data/sales.csv").then((r) => r.text())')
  assert.match(html, /<script src="https:\/\/cdn.example\/lib.js"><\/script>/)
  // Modules: imports made absolute, each in the import map once, cycles included; another site's kept.
  const map = JSON.parse(/<script type="importmap">(.*?)<\/script>/.exec(html)?.[1] ?? '{}').imports
  assert.deepEqual(Object.keys(map).sort(), ['js/lazy.js', 'js/one.js', 'js/two.js'].map((file) => `${SITE}site/${file}`))
  assert.equal(behind(map[`${SITE}site/js/one.js`]), `import { two } from '${SITE}site/js/two.js'\nexport const one = two + 1`)
  assert.equal(behind(map[`${SITE}site/js/two.js`]), `import { one } from '${SITE}site/js/one.js'\nexport const two = 2`)
  const main = addresses(html, 'text/javascript').map(behind).find((text) => text.includes('lazy'))
  assert.equal(main, `import { one } from '${SITE}site/js/one.js'\nimport('${SITE}site/js/lazy.js')\nexport * from 'https://cdn.example/m.js'`)
  assert.match(html, new RegExp(`<script type="module">import \\{ two \\} from '${SITE}site/js/two.js'; document.title = two</script>`))
  assert.match(html, /<script type="application\/json">\{"src": "x.png"\}<\/script>/)
  // The data its scripts name, for its fetch(), resolved from the page; links stay for the browser.
  assert.match(html, /const files = \{"site\/data\/sales.csv":"data:text\/csv;base64,/)
  assert.match(html, /<a href="about.html">About<\/a>/)
  assert.deepEqual(Object.keys(files).sort(), ['site/css/base.css', 'site/css/main.css', 'site/data/sales.csv', 'site/fonts/f.woff2', 'site/img/a.png', 'site/img/a2.png', 'site/img/bg.png', 'site/index.html', 'site/js/app.js', 'site/js/lazy.js', 'site/js/main.js', 'site/js/one.js', 'site/js/two.js'])
  assert.match(files['site/index.html'], /^\d+:\d+$/)
})

test('the folder itself: its index.html, or what it holds; a picture, a text as themselves; what isn’t a page, or isn’t there', async () => {
  const fs = memoryFS({ 'site/index.html': '<h1>Home</h1>', 'notes/a <b>.txt': 'x < y', 'notes/b.png': new Uint8Array([1]), 'notes/c.bin': new Uint8Array([2]), 'notes/sub/d.md': '#', 'notes/.hidden': 'h', '.gitignore': 'build/\n', 'build/x.js': 'x' })
  assert.deepEqual(await sitePage(fs, 'site'), { html: '<h1>Home</h1>', path: 'site/index.html', files: { 'site/index.html': (await sitePage(fs, 'site/')).files['site/index.html'] } })
  const top = await sitePage(fs, '', 'Work')
  assert.ok('html' in top && top.path === '')
  assert.match(top.html, /<h1 dir="auto">Work<\/h1><ul><li><a href="notes\/" dir="auto">notes\/<\/a><\/li><li><a href="site\/" dir="auto">site\/<\/a><\/li><\/ul>/)
  const notes = await sitePage(fs, 'notes/', 'Work')
  assert.ok('html' in notes && notes.path === 'notes/')
  assert.match(notes.html, /<li><a href="\.\.\/">\.\.<\/a><\/li><li><a href="sub\/" dir="auto">sub\/<\/a><\/li><li><a href="a%20%3Cb%3E.txt" dir="auto">a &#60;b&#62;.txt<\/a><\/li>/)
  assert.ok(!notes.html.includes('hidden'))
  const text = await sitePage(fs, 'notes/a <b>.txt')
  assert.ok('html' in text && text.html.includes('<pre dir="auto">x &#60; y</pre>'))
  const picture = await sitePage(fs, 'notes/b.png')
  assert.ok('html' in picture && picture.html.includes('<img src="data:image/png;base64,AQ==" alt="b.png">'))
  assert.deepEqual(await sitePage(fs, 'notes/c.bin'), { note: 'unshown' })
  assert.deepEqual(await sitePage(fs, 'notes/nope.html'), { note: 'missing' })
  assert.deepEqual(await sitePage(fs, 'nope/'), { note: 'missing' })
  assert.deepEqual(await sitePage(fs, 'notes/.hidden'), { note: 'missing' })
})
