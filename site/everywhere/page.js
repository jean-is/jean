// SPDX-License-Identifier: MIT
// One list, everywhere it shows (the job pages, ../excel/job.js), at /everywhere and /fr/partout, for the reader who
// searched for a price updated everywhere at once, a website that follows a spreadsheet, one list shown in several
// places: what Jean calls Links with other creations (D763), never by the word for what its map draws. Its Try sends a
// coffee roaster's request with ?q= (ui/app.js): a collection of prices, then a price list and a website that show it.
// Its pane is no conversation but a project's map, live, as Creations draws it (caps/compose/map.js, D764, in
// site/creation.js's document): the roaster's prices at the start, with the orders that relate to them and a flyer whose
// collection is gone; further along a price list on the published version, trade fair slides kept on version 2 while
// version 3 is out, and a newsletter whose instruction runs as the collection changes; a column further, the shop's
// website, which shows the prices and the price list's Delivery section. Each line is the app's, in the page's language.
import { linksIn, refsIn } from '../../app/caps/compose/refs.js'
import { ICONS } from '../site.js'
import { job } from '../excel/job.js'

/** Ids as ULIDs are written, the same at each build. @param {number} n */
const ulid = (n) => `01JEAN${String(n).padStart(20, '0')}`
/** The project's places, by what the page calls them. */
export const PLACES = {
  prices: `collections/${ulid(1)}-prices`,
  orders: `collections/${ulid(2)}-orders`,
  gone: `collections/${ulid(3)}-old-prices`,
  flyer: `decks/${ulid(4)}-flyer.deck.html`,
  list: `documents/${ulid(5)}-price-list.md`,
  slides: `decks/${ulid(6)}-trade-fair.deck.html`,
  letter: `documents/${ulid(7)}-newsletter.md`,
  shop: `sites/${ulid(8)}-shop`,
}
/** @import { Edge } from '../../app/caps/compose/refs.js' */
/** The collection's latest version, which the slides stay one behind. */
const LATEST = 3

/**
 * What each creation holds that links it, as the project keeps it: the price list's table on the published version and
 * its Delivery section, named for a reference; the slides' table on version 2; the newsletter's, an instruction run as
 * the collection changes; the website's table and the price list's section; the flyer's table, whose collection is
 * gone. @param {(key: string) => string} text
 */
const sourcesOf = (text) => ({
  [PLACES.list]: `# ${text('made.list')}\n\n\`\`\`table\n${PLACES.prices}@published\n\`\`\`\n\n## ${text('made.delivery')} {#delivery}\n`,
  [PLACES.slides]: `# ${text('made.slides')}\n\n---\n\n\`\`\`table\n${PLACES.prices}@2\n\`\`\`\n`,
  [PLACES.letter]: `# ${text('made.letter')}\n\n\`\`\`table\n${PLACES.prices}\nask: ${text('made.ask')}\nrefresh: auto\nbrain: ${text('made.brain')}\n\`\`\`\n`,
  [PLACES.shop]: `<table data-from="${PLACES.prices}"></table>\n<section data-from="${PLACES.list}#delivery"></section>`,
  [PLACES.flyer]: `# ${text('made.flyer')}\n\n---\n\n\`\`\`table\n${PLACES.gone}\n\`\`\`\n`,
})

/**
 * The map's links, as Jean's graph reads them from those (caps/compose/compose.js's graph()): each reference a consumer
 * holds, at the version it reads, with its recipe; then the orders' relation to the prices, by a column.
 * @param {(key: string) => string} text @returns {Edge[]}
 */
export const edgesOf = (text) => [
  ...Object.entries(sourcesOf(text)).flatMap(([from, source]) => [...refsIn(source).map((ref, index) => ({ from, to: ref.place, at: ref.at, recipe: ref.recipe, index })), ...linksIn(from, null, source)]),
  ...linksIn(PLACES.orders, /** @type {any} */ ({ properties: [{ id: 'product', type: 'relation', name: text('made.product'), collection: PLACES.prices }] })),
]

export default job({
  addresses: { en: 'everywhere', fr: 'fr/partout' },
  into: 'ask',
  exact: [ICONS.link, ICONS.clock, ICONS.tree],
  // The AI behind it, what can be a source, and where work lives, under one list; going online, an instruction's cost
  // and what leaves Jean as it is, under everywhere it shows.
  limits: { task: [0, 1, 5], trust: [2, 3, 4] },
  filled (kit) {
    const money = new Intl.NumberFormat(kit.lang, { style: 'currency', currency: 'EUR' }).format
    return { params: { old: money(12.5), new: money(13.9), links: kit.appText('compose.links'), map: kit.appText('compose.map'), drawn: kit.appText('compose.drawn') } }
  },
  drawn: () => ({ pane: '' }),
  made: (kit, { text }) => ({
    kind: 'map',
    name: text('made.name'),
    asked: text('pane.asked'),
    creations: Object.entries(PLACES).filter(([key]) => key !== 'gone').map(([key, place]) => ({ place, name: text(`made.${key}`) })),
    edges: edgesOf(text),
    latest: { [PLACES.prices]: LATEST },
  }),
})
