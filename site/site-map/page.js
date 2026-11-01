// The site map, every page of the site by what it is for (RGAA's plan du site): only jean.is has all of them, so it doesn't ship.
// Its words are <lang>.json and the foot's (site/site.js, D438).
import { readdirSync } from 'node:fs'
import { COMPARED, SITE, USES } from '../site.js'
import { join } from 'node:path'

const ADDRESSES = { en: 'site-map', fr: 'fr/plan-du-site' }
const ARTICLES = readdirSync(join(SITE, 'help'), { withFileTypes: true }).filter((entry) => entry.isDirectory() && entry.name !== 'words').map((entry) => `help/${entry.name}`)

export default {
  addresses: ADDRESSES,
  ships: false,
  main: (kit) => {
    const item = (/** @type {string} */ name, /** @type {string} */ label) => (kit.link(name) ? /* html */ `<li><a href="${kit.link(name)}">${label}</a></li>` : '')
    const group = (/** @type {string} */ title, /** @type {string[]} */ items) => /* html */ `<h2>${title}</h2>
<ul>${items.join('')}</ul>`
    const top = kit.link('home') && /* html */ `<li><a href="${kit.link('home')}?index=1">${kit.app('learn.home')}</a></li>`
    return /* html */ `<article class="prose site-prose">
<h1>${kit.say('h1')}</h1>
<p>${kit.say('lede')}</p>
${group(kit.brand.name, [top, item('help', kit.app('learn.help')), item('files', kit.app('welcome.files')), item('privacy', kit.app('welcome.privacy')), item('terms', kit.app('welcome.terms')), item('accessibility', kit.say('foot.accessibility'))])}
${group(kit.say('foot.for'), [item('family', kit.say('foot.families')), item('work', kit.say('foot.work')), item('teachers', kit.say('foot.teachers')), item('associations', kit.say('foot.associations')), item('public-sector', kit.say('foot.public')), item('enterprise', kit.say('foot.it')), item('enterprise-key', kit.from('enterprise-key').say('h1'))])}
${group(kit.say('foot.uses'), USES.map((name) => item(name, kit.say(`foot.${name}`))))}
${group(kit.say('foot.compared'), COMPARED.map((name, i) => item(name, i ? kit.from(name).say('product') : kit.say('foot.all'))))}
${group(kit.app('learn.help'), ARTICLES.map((name) => item(name, kit.from(name).say('h1'))))}
${group(kit.say('others'), [item('charter', kit.from('charter').say('h1'))])}
</article>`
  },
}

