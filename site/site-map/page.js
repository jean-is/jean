// The site map, every page of the site by what it is for (RGAA's plan du site): only jean.is has all of them, so it
// doesn't ship. A landing page as the others are (landing() in site.js), its title no sentence: its acts are the
// site's parts, as the foot names them, each over its pages, and it ends on Jean itself. Its words are <lang>.json
// and the foot's (site/site.js, D438).
import { readdirSync } from 'node:fs'
import { COMPARED, SITE, USES, hero, landing, xml } from '../site.js'
import { join } from 'node:path'

const ADDRESSES = { en: 'site-map', fr: 'fr/plan-du-site' }
const ARTICLES = readdirSync(join(SITE, 'help'), { withFileTypes: true }).filter((entry) => entry.isDirectory() && entry.name !== 'words').map((entry) => `help/${entry.name}`)

export default {
  addresses: ADDRESSES,
  ships: false,
  main: (kit) => {
    const item = (/** @type {string} */ name, /** @type {string} */ label) => (kit.link(name) ? /* html */ `<li><a href="${kit.link(name)}">${label}</a></li>` : '')
    const pages = (/** @type {string[]} */ items) => /* html */ `<div class="site-block"><ul class="site-links">${items.join('')}</ul></div>`
    const top = kit.link('home') && /* html */ `<li><a href="${kit.link('home')}">${kit.app('learn.home')}</a></li>`
    return landing(kit, {
      top: hero(kit, { id: 'map-title', title: kit.say('h1'), lede: kit.say('lede') }),
      acts: [
        { id: 'map-site', title: xml(kit.brand.name), body: pages([top, item('help', kit.app('learn.help')), item('files', kit.app('welcome.files')), item('privacy', kit.app('welcome.privacy')), item('terms', kit.app('welcome.terms')), item('accessibility', kit.say('foot.accessibility'))]) },
        { id: 'map-for', title: kit.say('foot.for'), body: pages([item('family', kit.say('foot.families')), item('work', kit.say('foot.work')), item('teachers', kit.say('foot.teachers')), item('associations', kit.say('foot.associations')), item('charter', kit.from('charter').say('h1')), item('public-sector', kit.say('foot.public')), item('enterprise', kit.say('foot.it')), item('enterprise-key', kit.from('enterprise-key').say('h1'))]) },
        { id: 'map-uses', title: kit.say('foot.uses'), body: pages(USES.map((name) => item(name, kit.say(`foot.${name}`)))) },
        { id: 'map-compared', title: kit.say('foot.compared'), body: pages(COMPARED.map((name, i) => item(name, i ? kit.from(name).say('product') : kit.say('foot.all')))) },
        { id: 'map-help', title: kit.app('learn.help'), body: pages(ARTICLES.map((name) => item(name, kit.from(name).say('h1')))) },
      ],
      turn: { id: 'map-open', body: /* html */ `<p class="site-cta"><a class="button primary" href="${kit.start}">${kit.say('open')}</a></p>` },
    })
  },
}

