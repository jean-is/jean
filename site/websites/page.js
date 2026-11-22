// SPDX-License-Identifier: MIT
// AI for websites (the job pages, ../excel/job.js), at /websites and /fr/sites-web, for the reader who searched for a
// free AI that makes a website. Its Try sends a studio's request with ?q= (ui/app.js): asked for a site, the brain reads
// Jean's own skill "Make a site" (D401), which brings Sites (D720), and makes it with `site`. Its pane is no
// conversation but the site that request makes, live in Jean's own site pane (site/creation.js): three pages written
// here as the skill has a brain write them, in the page's words, which Jean's own check passes (test/creation.test.js),
// one fact the request doesn't give left in square brackets, as Jean leaves it.
import { job } from '../excel/job.js'

/** What a class costs, and how many it takes at most, as the request gives them. */
const PRICE = 35
const PLACES = 8

/** A page's head, as the skill asks for one. @param {string} lang @param {string} dir @param {string} title @param {string} description */
const head = (lang, dir, title, description) => `<!doctype html>
<html lang="${lang}" dir="${dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta name="description" content="${description}">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:type" content="website">
<link rel="stylesheet" href="look.css">
<link rel="stylesheet" href="style.css">
</head>`

/** The site's one style sheet, coloured and set only through look.css's properties, as the skill's sheet on the look shows. */
const STYLE = `:root { --wide: 64rem; --gap: clamp(1rem, 4vw, 2.5rem); }
*, *::before, *::after { box-sizing: border-box; }
body { margin: 0; min-block-size: 100dvh; display: flex; flex-direction: column; font: 1.0625rem/1.6 var(--font); color: var(--ink); background: var(--paper); }
h1, h2, h3 { font-family: var(--display); font-weight: var(--display-weight); overflow-wrap: break-word; text-wrap: balance; }
h1 { margin-block: 0 1rem; font-size: clamp(2rem, 7vw, 3.25rem); line-height: 1.1; }
h2 { margin-block: 0 1.25rem; font-size: clamp(1.5rem, 5vw, 2rem); line-height: 1.2; }
h3 { margin-block: 0 0.25rem; font-size: 1.2rem; }
main { flex: 1; }
svg { max-inline-size: 100%; block-size: auto; }
.wrap { max-inline-size: var(--wide); margin-inline: auto; padding-inline: var(--gap); }
section { padding-block: clamp(2.5rem, 8vw, 4.5rem); }
p, li { max-inline-size: 65ch; }
a { color: var(--accent); }
:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }
.name { font-family: var(--display); font-weight: var(--display-weight); font-size: 1.25rem; color: var(--ink); text-decoration: none; }
.button { display: inline-block; padding: 0.75rem 1.25rem; border: 0; border-radius: 0.5rem; background: var(--accent); color: var(--on-accent); font: inherit; font-weight: 600; text-decoration: none; cursor: pointer; }
.grid { display: grid; gap: var(--gap); grid-template-columns: repeat(auto-fit, minmax(min(100%, 14rem), 1fr)); margin: 0; padding: 0; list-style: none; }
.grid li { padding: 1.25rem; border-radius: 0.75rem; background: var(--paper); }
.hero .wrap { display: grid; gap: var(--gap); align-items: center; grid-template-columns: repeat(auto-fit, minmax(min(100%, 18rem), 1fr)); }
.hero svg { inline-size: 100%; max-inline-size: 26rem; justify-self: center; }
.tint { background: var(--tint); }
.quiet { color: var(--quiet); }
header .wrap { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.5rem 1rem; padding-block: 1rem; }
nav ul { display: flex; flex-wrap: wrap; gap: 0.5rem 1.25rem; margin: 0; padding: 0; list-style: none; }
nav a[aria-current] { color: var(--ink); font-weight: 600; text-decoration: none; }
.scroll { overflow-x: auto; }
table { inline-size: 100%; border-collapse: collapse; }
th, td { padding: 0.75rem 0.5rem; border-block-end: 1px solid color-mix(in srgb, var(--quiet) 35%, var(--paper)); text-align: start; }
form { display: grid; gap: 1rem; max-inline-size: 32rem; }
label, legend { font-weight: 600; }
fieldset { margin: 0; padding: 0; border: 0; }
fieldset label { display: block; font-weight: 400; }
input[type='text'], input[type='email'], textarea { inline-size: 100%; padding: 0.625rem; border: 1px solid var(--quiet); border-radius: 0.375rem; font: inherit; color: var(--ink); background: var(--paper); }
footer { padding-block: 1.5rem; color: var(--quiet); font-size: 0.9375rem; }
footer p { margin: 0; }
`

/** The first page's drawing: a pot on its wheel under a shelf of three, in the look's colours. */
const DRAWING = `<svg viewBox="0 0 400 300" aria-hidden="true">
      <rect width="400" height="300" rx="24" fill="var(--tint)"/>
      <path d="M40 92h320" stroke="var(--quiet)" stroke-width="6" stroke-linecap="round"/>
      <path d="M78 88c-10-22-6-40 12-40s22 18 12 40zM176 88v-30h48v30zM224 66h14v14h-14M298 88c-16-14-12-44 6-44s22 30 6 44z" fill="var(--accent-2)"/>
      <ellipse cx="200" cy="252" rx="120" ry="16" fill="var(--quiet)"/>
      <path d="M150 248c-26-34-22-78 8-96c-6-12 2-22 42-22s48 10 42 22c30 18 34 62 8 96z" fill="var(--accent)"/>
      <path d="M166 152c20 8 48 8 68 0" fill="none" stroke="var(--on-accent)" stroke-width="5" stroke-linecap="round"/>
    </svg>`

/**
 * The site, as `site` is given it: three pages and one style sheet, each page with the same top and foot.
 * @param {import('../site.js').Kit} kit @param {(key: string) => string} text @param {(key: string) => string[]} texts
 * @returns {Record<string, string>}
 */
export function pagesOf (kit, text, texts) {
  const { lang, dir } = kit, name = text('made.name'), files = ['index.html', 'classes.html', 'signup.html'], nav = texts('made.nav')
  const rows = /** @type {string[][]} */ (kit.raw('made.classes.rows')), cards = /** @type {string[][]} */ (kit.raw('made.home.cards')), evenings = texts('made.signup.evenings')
  const page = (/** @type {number} */ at, /** @type {string} */ key, /** @type {string} */ body) => `${head(lang, dir, `${text(`made.${key}.title`)} · ${name}`, text(`made.${key}.description`))}
<body>
<header><div class="wrap">
  <a href="index.html" class="name">${name}</a>
  <nav aria-label="${text('made.menu')}"><ul>
    ${files.map((file, i) => `<li><a href="${file}"${i === at ? ' aria-current="page"' : ''}>${nav[i]}</a></li>`).join('\n    ')}
  </ul></nav>
</div></header>
<main>
${body}
</main>
<footer><div class="wrap"><p>${text('made.foot')}</p></div></footer>
</body>
</html>
`
  return {
    'style.css': STYLE,
    'index.html': page(0, 'home', `  <section class="hero"><div class="wrap">
    <div>
      <h1>${text('made.home.h1')}</h1>
      <p>${text('made.home.lede')}</p>
      <a class="button" href="signup.html">${text('made.cta')}</a>
    </div>
    ${DRAWING}
  </div></section>
  <section class="tint"><div class="wrap">
    <h2>${text('made.home.h2')}</h2>
    <ul class="grid">
      ${cards.map(([title, words]) => `<li><h3>${title}</h3><p>${words}</p></li>`).join('\n      ')}
    </ul>
  </div></section>`),
    'classes.html': page(1, 'classes', `  <section><div class="wrap">
    <h1>${text('made.classes.h1')}</h1>
    <p>${text('made.classes.lede')}</p>
    <div class="scroll"><table>
      <thead><tr>${texts('made.classes.heads').map((head) => `<th scope="col">${head}</th>`).join('')}</tr></thead>
      <tbody>
        ${rows.map(([day, time]) => `<tr><th scope="row">${day}</th><td>${time}</td><td>${text('made.classes.price')}</td></tr>`).join('\n        ')}
      </tbody>
    </table></div>
    <p class="quiet">${text('made.classes.note')}</p>
    <a class="button" href="signup.html">${text('made.cta')}</a>
  </div></section>`),
    'signup.html': page(2, 'signup', `  <section><div class="wrap">
    <h1>${text('made.signup.h1')}</h1>
    <p>${text('made.signup.lede')}</p>
    <form method="post" data-form="${text('made.signup.form')}">
      <div><label for="name">${text('made.signup.name')}</label><input id="name" name="name" type="text" autocomplete="name" required></div>
      <div><label for="email">${text('made.signup.email')}</label><input id="email" name="email" type="email" autocomplete="email" required></div>
      <fieldset><legend>${text('made.signup.evening')}</legend>
        ${evenings.map((evening, i) => `<label for="evening-${i}"><input id="evening-${i}" type="radio" name="evening" value="${evening}"${i ? '' : ' checked'}> ${evening}</label>`).join('\n        ')}
      </fieldset>
      <div><label for="message">${text('made.signup.message')}</label><textarea id="message" name="message" rows="3"></textarea></div>
      <div><button class="button" type="submit">${text('made.signup.send')}</button></div>
      <p class="quiet">${text('made.signup.who')}</p>
      <p data-sent hidden>${text('made.signup.sent')}</p>
      <p data-unsent hidden>${text('made.signup.unsent')}</p>
    </form>
  </div></section>`),
  }
}

export default job({
  addresses: { en: 'websites', fr: 'fr/sites-web' },
  into: 'ask',
  // Its promise goes from the words to the site: the words, proved by what goes in, what comes out and where they go;
  // the site, by one made step by step and what Jean checks before it shows it.
  proves: { say: ['io', 'where'], site: ['replay', 'exact'] },
  // The AI behind it and where pictures come from, under the words; what a site can't do, what going online takes, and being wrong, under the site.
  limits: { say: [0, 1], site: [2, 3, 4, 5] },
  filled (kit) {
    const money = new Intl.NumberFormat(kit.lang, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format
    return { params: { price: money(PRICE), places: new Intl.NumberFormat(kit.lang).format(PLACES), publish: kit.appText('sites.publish') } }
  },
  drawn: () => ({ pane: '' }),
  made: (kit, { text, texts }) => ({ kind: 'site', name: text('made.name'), label: text('pane.title'), asked: text('pane.asked'), look: { accent: '#b4532a', type: 'friendly' }, files: pagesOf(kit, text, texts) }),
})
