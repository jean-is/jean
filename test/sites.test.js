// The check npm run sites gives a brain for each site it makes (Sites' phase 0), from the files alone.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkFiles, told } from './sites/check.js'

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
