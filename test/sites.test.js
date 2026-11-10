// Sites (D720): a site's paths and changes, what the brain is given, and its check from its files, which npm run sites measures
// brains with too.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkFiles, told } from '../app/caps/sites/check.js'
import { pathIn, changed, reach, PLACE, sited } from '../app/caps/sites/file.js'
import { LINES, SITE, CHANGE } from '../app/caps/sites/tool.js'

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
