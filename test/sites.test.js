// Sites (D720): a site's paths and changes, what the brain is given, and its check from its files, which npm run sites measures
// brains with too; its looks (D739), each readable by day and by night, and the colours the brain writes put as their properties.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkFiles, told } from '../app/caps/sites/check.js'
import { pathIn, changed, reach, PLACE, sited } from '../app/caps/sites/file.js'
import { LINES, SITE, CHANGE } from '../app/caps/sites/tool.js'
import { LOOK, FACES, dealt, lookOf, ownLook, projectLook, cssOf, worn, saidOf } from '../app/caps/sites/look.js'
import { contrast } from '../app/ui/colour.js'
import { readFile } from 'node:fs/promises'

const encode = (/** @type {string} */ text) => new TextEncoder().encode(text)

/** A page as the skill asks for one. @param {string} lang @param {string} title @param {string} body @param {string} [head] */
const page = (lang, title, body, head = '') => /* html */ `<!doctype html>
<html lang="${lang}" dir="${lang === 'ar' ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title><meta name="description" content="${title}: breads baked every morning, cakes to order, and a shop open six days a week.">
<meta property="og:title" content="${title}"><meta property="og:description" content="Breads baked every morning."><meta property="og:type" content="website">
<link rel="stylesheet" href="${lang === 'en' ? '' : '../'}style.css">${head}</head>
<body><header><a href="index.html">Fournil</a><nav aria-label="Main"><a href="index.html" aria-current="page">Home</a></nav></header>
<main>${body}</main><footer><p>[your address]</p></footer></body></html>`

const versions = /* html */ '<link rel="alternate" hreflang="en" href="/index.html"><link rel="alternate" hreflang="ar" href="/ar/index.html">'

test('a site as the skill asks passes, in two languages, one right to left', () => {
  const files = new Map([
    ['index.html', encode(page('en', 'Fournil · Bakery', '<a href="ar/index.html" lang="ar" hreflang="ar">العربية</a><h1>Bread every morning</h1><img src="bread.jpg" alt="A loaf on a board" width="800" height="600"><form method="post" data-form="cake"><label for="email">Email</label><input id="email" type="email" name="email"><button>Send</button></form>', versions))],
    ['ar/index.html', encode(page('ar', 'فورنيل · مخبز', '<h1>خبز كل صباح</h1>', versions))],
    ['style.css', encode('body { margin-inline: auto; padding-block: 1rem; text-align: start; }')],
    ['bread.jpg', new Uint8Array([0xff, 0xd8, 0xff])],
  ])
  const report = checkFiles(files)
  assert.deepEqual(report.problems, [])
  assert.deepEqual(report.languages, ['en', 'ar'])
  assert.deepEqual(report.fill, ['[your address] (index.html, ar/index.html)'])
  assert.match(told(report, { name: 'Fournil', place: 'sites/1-fournil' }), /nothing to fix/)
})

test('what the skill forbids is each said, with its page', () => {
  const files = new Map([
    ['index.html', encode(/* html */ `<!doctype html><html><head><title></title><script src="https://cdn.example/lib.js"></script></head><body>
<h1>One</h1><h3>Skipped</h3><img src="missing.jpg"><a href="about.html"></a><button onclick="go()">Go</button><script>go = () => 1</script>
<form action="https://forms.example/x"><input name="password" type="password"></form></body></html>`)],
    ['lost.html', encode(page('en', 'Lost', '<h1>Lost</h1>'))],
    ['style.css', encode('@import url("https://fonts.example/a.css");')],
  ])
  const { problems } = checkFiles(files)
  for (const expected of ['<html> says no lang', 'its title is 0 characters', 'it loads https://cdn.example/lib.js from another site', 'its h3 “Skipped” follows an h1',
    'the picture missing.jpg has no alt', 'the picture missing.jpg is nothing the site has', 'a link to about.html has no name', 'its link to about.html reaches nothing',
    'onclick="…" runs a script', 'a script inside the page', 'a form sends to https://forms.example/x', 'a field asks for a password', 'it has 0 main part',
    'lost.html: nothing leads to it from index.html', 'style.css: it loads something from another site']) {
    assert.ok(problems.some((problem) => problem.includes(expected)), `missing: ${expected}\n${problems.join('\n')}`)
  }
})

test('each language has every page, and names the others', () => {
  const files = new Map([
    ['index.html', encode(page('en', 'Home', '<h1>Home</h1><a href="prices.html">Prices</a>'))],
    ['prices.html', encode(page('en', 'Prices', '<h1>Prices</h1>'))],
    ['fr/index.html', encode(page('fr', 'Accueil', '<h1>Accueil</h1>'))],
    ['style.css', encode('p { margin-left: 1rem; }')],
  ])
  const { problems } = checkFiles(files)
  assert.ok(problems.includes('fr/prices.html is missing: each language has every page'))
  assert.ok(problems.some((problem) => problem.startsWith('index.html: it names no version in en, fr')))
  // margin-left is only backwards where a language reads right to left: none here.
  assert.ok(!problems.some((problem) => problem.includes('physical')))
})

test("a site's paths: its own files, never its record, a hidden file, one outside it or a kind it doesn't hold", () => {
  assert.equal(pathIn('./fr/index.html'), 'fr/index.html')
  assert.equal(pathIn('/photos/dunes.JPG'), 'photos/dunes.JPG')
  for (const wrong of ['', 'site.json', '../index.html', 'a//b.html', '.hidden/page.html', 'https://example.com/a.html', 'notes.docx', 'app.php']) assert.throws(() => pathIn(wrong), undefined, wrong)
  assert.ok(PLACE.test('sites/01ABC-bakery') && !PLACE.test('sites/01ABC-bakery/index.html') && !PLACE.test('sites/.cache'))
  const files = new Map([['index.html', 1], ['fr/index.html', 1], ['menu.html', 1]])
  assert.deepEqual(['', 'fr/', 'fr', 'menu', 'menu.html', 'missing'].map((path) => reach(files, path)), ['index.html', 'fr/index.html', 'fr/index.html', 'menu.html', 'menu.html', null])
})

test('a change by exact passages: each found once in its file, or nothing changed and each failure said', () => {
  const files = new Map([['index.html', encode('<h1>Bread</h1><p>Bread</p>')], ['style.css', encode('a { color: red }')]])
  const done = changed(files, [{ path: 'style.css', old: 'red', new: 'brown' }])
  assert.ok('files' in done)
  assert.equal(new TextDecoder().decode(done.files.get('style.css')), 'a { color: brown }')
  assert.equal(new TextDecoder().decode(files.get('style.css')), 'a { color: red }', 'the site as it was is left alone')
  const failed = changed(files, [{ path: 'index.html', old: 'Bread', new: 'Cake' }, { path: 'about.html', old: 'x', new: 'y' }, { path: 'style.css', old: 'red', new: 'pink' }])
  assert.ok('error' in failed)
  assert.match(failed.error, /index\.html: the passage "Bread" is found 2 times, not once; about\.html isn't in the site/)
  assert.match(failed.error, /^Nothing changed/)
})

test('a page on its own as a site the host runs: its scripts in files of their own, what its on…="" do in one more, its data and its styles left in', () => {
  const page = /* html */ `<!doctype html><html lang="fr"><head><title>Pain</title><style>b { color: red }</style><script type="application/json" id="d">{"a":1}</script>
<script>let loaves = 3</script><script type="module">import './x.js'</script><script src="kept.js"></script></head>
<body><button onclick="loaves++; show(&quot;pain&quot;)" class="go">+</button><input onInput='say(this.value)'><img src="a.png"/></body></html>`
  const files = sited(page)
  assert.deepEqual([...files.keys()], ['script-1.js', 'script-2.js', 'on.js', 'index.html'])
  assert.equal(files.get('script-1.js'), 'let loaves = 3')
  assert.equal(files.get('script-2.js'), "import './x.js'")
  const index = String(files.get('index.html'))
  assert.match(index, /<script src="script-1\.js"><\/script><script src="script-2\.js" type="module"><\/script><script src="kept\.js"><\/script>/)
  assert.match(index, /<script type="application\/json" id="d">\{"a":1\}<\/script>/)
  assert.match(index, /<style>b \{ color: red \}<\/style>/)
  assert.match(index, /<button class="go" data-on="1">\+<\/button><input data-on="2"><img src="a\.png"\/><script src="on\.js"><\/script><\/body>/)
  assert.doesNotMatch(index, /on(click|input)=/i)
  assert.equal(files.get('on.js'), `document.querySelector('[data-on="1"]').addEventListener('click', function (event) {\nloaves++; show("pain")\n})\n`
    + `document.querySelector('[data-on="2"]').addEventListener('input', function (event) {\nsay(this.value)\n})`)
  // A page with nothing inside to move is the same page.
  assert.deepEqual([...sited('<p>Hi</p>')], [['index.html', '<p>Hi</p>']])
})

test('what the brain is given: a line each within 40 tokens, schemas within 400', () => {
  assert.deepEqual(LINES.map((line) => line.name), [SITE.name, CHANGE.name])
  for (const line of LINES) assert.ok(Math.ceil(`- ${line.name}: ${line.line}`.length / 4) <= 40, line.line)
  for (const spec of [SITE, CHANGE]) assert.ok(Math.ceil(JSON.stringify(spec).length / 4) <= 400, `${spec.name}: ${JSON.stringify(spec).length} characters`)
})

const { palettes } = JSON.parse(await readFile(new URL('../app/caps/designs/layouts.json', import.meta.url), 'utf8'))
const voices = Object.keys(FACES), decode = (/** @type {Uint8Array | undefined} */ bytes) => new TextDecoder().decode(bytes)

test('every look, dealt, the project’s or the brain’s, reads at AA by day and by night', () => {
  const looks = [...palettes.map((/** @type {any} */ one) => lookOf(one.id, 'calm', { paper: one.ground, ink: one.ink, accent: one.accent, accent2: one.accent2 })),
    ownLook({ accent: '#c2410c' }, voices, 'calm'), ownLook({ accent: '#ffe066', paper: '#fffef5', ink: '#777777' }, voices, 'calm'), ownLook({ accent: '#7dd3fc', paper: '#0b1020' }, voices, 'calm'),
    projectLook({ primary: '#e11d48', voice: 'elegant', soft: '#fde2e7', dark: { paper: '#101014', primary: '#ff7799' } }, voices, (colour) => colour), projectLook({ primary: '#ffcc00' }, voices, (colour) => colour)]
  const pairs = [['ink', 'paper'], ['ink', 'tint'], ['quiet', 'paper'], ['quiet', 'tint'], ['accent', 'paper'], ['accent', 'tint'], ['accent-2', 'paper'], ['accent-2', 'tint'], ['on-accent', 'accent'], ['on-accent', 'accent-2']]
  for (const look of looks) {
    assert.ok(look)
    for (const when of /** @type {const} */ (['day', 'night'])) for (const [words, ground] of pairs) {
      const colours = /** @type {Record<string, string>} */ (look[when])
      assert.ok(contrast(colours[words], colours[ground]) >= 4.5, `${look.id} by ${when}: ${words} ${colours[words]} on ${ground} ${colours[ground]}`)
    }
    // A night of its own: a dark paper, unless the day's is dark already.
    assert.ok(contrast(look.night.paper, '#000000') < contrast(look.night.paper, '#ffffff'), look.id)
  }
  assert.equal(ownLook({ accent: 'teal' }, voices, 'calm'), null)
  assert.equal(projectLook({ voice: 'bold' }, voices, (colour) => colour), null)
})

test('three looks are dealt, the project’s first, then the brain’s, then palettes apart, the same each time, in voices the language has; the one worn kept', () => {
  const page = (/** @type {string} */ lang) => new Map([['index.html', encode(`<!doctype html><html lang="${lang}" dir="ltr"><head></head></html>`)]])
  const project = (/** @type {string[]} */ voices) => projectLook({ primary: '#0057b8', voice: 'handwritten' }, voices, (colour) => colour)
  const given = { accent: '#2a6f4e', type: 'elegant' }, three = dealt({ files: page('ja'), seed: 'sites/01J-bakery', palettes, project, given })
  assert.deepEqual(three.looks.map((look) => look.id).slice(0, 2), ['project', 'own'])
  assert.equal(three.looks[0].voice, 'calm', 'no handwriting where Japanese is written')
  assert.deepEqual([three.look.id, three.look.voice], ['own', 'elegant'], 'the colours given are worn at once')
  assert.deepEqual(three.kept, { id: 'own', voice: 'elegant', own: given })
  // Picked again, the brain's colours stay among them, kept.
  const again = dealt({ files: page('ja'), seed: 'sites/01J-bakery', palettes, project, kept: { ...three.kept, id: 'project', voice: 'calm' } })
  assert.deepEqual([again.look.id, again.looks[1].id, again.kept.own], ['project', 'own', given])
  const plain = dealt({ files: page('en'), seed: 'sites/01J-bakery', palettes })
  assert.equal(new Set(plain.looks.map((look) => look.id)).size, 3)
  assert.equal(plain.look, plain.looks[0])
  assert.deepEqual(plain.looks, dealt({ files: page('en'), seed: 'sites/01J-bakery', palettes }).looks)
  assert.ok(dealt({ files: page('el'), seed: 'sites/01J-greek', palettes }).looks.every((look) => look.voice === 'calm'))
})

test('look.css holds every property, its night under a dark preference, the project’s fonts first', () => {
  const css = cssOf(/** @type {import('../app/caps/sites/look.js').Look} */ (projectLook({ primary: '#0057b8', voice: 'elegant', fonts: { heading: ['Playfair Display'], body: ['Inter";}x{'] } }, voices, (colour) => colour)))
  for (const name of ['paper', 'tint', 'ink', 'quiet', 'accent', 'accent-2', 'on-accent', 'font', 'display', 'display-weight']) assert.match(css, new RegExp(`--${name}: `))
  assert.match(css, /color-scheme: light dark;[\s\S]*@media \(prefers-color-scheme: dark\) \{ :root \{ --paper: #/)
  assert.match(css, /--display: "Playfair Display", ui-serif/)
  assert.match(css, /--font: "Interx", system-ui/)
  const night = cssOf(lookOf('night', 'bold', { paper: '#1c2240', ink: '#f4f1e8', accent: '#ffc857', accent2: '#8ecae6' }))
  assert.match(night, /color-scheme: dark;/)
  assert.doesNotMatch(night, /@media/)
})

test('a site wears its look: look.css linked from each page, its colours put as the nearest properties, what can’t be read said', () => {
  const look = lookOf('sunny', 'calm', { paper: '#fff4da', ink: '#1f2a44', accent: '#b23c26', accent2: '#235d97' })
  const files = new Map([
    ['index.html', encode('<html><head><link rel="stylesheet" href="style.css"></head><body><p style="color: #ffffff; background: #9a3b14">Hi</p><style>.x { border-color: #333 }</style><svg aria-hidden="true"><rect fill="#f3eee6"/><path stroke="url(#g)" fill="hsl(10 70% 40%)"/></svg></body></html>')],
    ['fr/index.html', encode('<html><head><link rel="stylesheet" href="../look.css"></head><body></body></html>')],
    ['es/index.html', encode('<html><head></head><body></body></html>')],
    ['style.css', encode(':root { --paper: #fff; --brand: #2a6f4e; } a:not(.white) { color: #2a6f4e; box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2); } .hero { background: linear-gradient(#ffffff, #f5f0e8); font-family: "Gold"; } .band { background: rgb(42 111 78 / 50%); } h1 { color: oklch(50% 0.1 30) }')],
    [LOOK, encode(':root { --accent: red }')],
  ])
  const out = worn(files, look), said = saidOf(out)
  assert.match(decode(out.files.get('index.html')), /<link rel="stylesheet" href="style.css"><link rel="stylesheet" href="look.css"><\/head>/)
  assert.match(decode(out.files.get('index.html')), /style="color: var\(--on-accent\); background: var\(--accent\)"/)
  assert.match(decode(out.files.get('index.html')), /\.x \{ border-color: var\(--ink\) \}/)
  assert.match(decode(out.files.get('index.html')), /<rect fill="var\(--tint\)"\/><path stroke="url\(#g\)" fill="var\(--accent\)"\/>/)
  assert.equal(decode(out.files.get('fr/index.html')), decode(files.get('fr/index.html')))
  assert.match(decode(out.files.get('es/index.html')), /href="\.\.\/look\.css"/)
  const css = decode(out.files.get('style.css'))
  assert.doesNotMatch(css, /--paper:/, 'the look’s own properties are look.css’s')
  assert.match(css, /--brand: var\(--accent-2\)/)
  assert.match(css, /a:not\(\.white\) \{ color: var\(--accent-2\); box-shadow: 0 1px 2px rgba\(0, 0, 0, 0\.2\);/)
  assert.match(css, /background: linear-gradient\(var\(--paper\), var\(--tint\)\); font-family: "Gold";/)
  assert.match(css, /background: color-mix\(in srgb, var\(--accent-2\) 50%, transparent\)/)
  assert.equal(decode(out.files.get(LOOK)), cssOf(look))
  assert.deepEqual(out.left, ['style.css: oklch(50% 0.1 30)'])
  assert.match(said.problems[0], /^style\.css: oklch\(50% 0\.1 30\): write one of look\.css's properties/)
  assert.match(said.line, /^look\.css's properties were put in place of 10 colours/)
  // Worn again, nothing more is put.
  assert.deepEqual(worn(out.files, look).put, [])
  assert.deepEqual(SITE.parameters.properties.look, CHANGE.parameters.properties.look)
})
