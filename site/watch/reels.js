// Jean's reels (D687, docs/reels.md): what each one plays, as the page that plays them (site/watch/page.js) writes it
// in each of its languages, from its words: cards, and tasks written as the site's demos are (site/demo.js), each
// with its stops. A stop holds the replay as long as its caption takes to read in its language. The sample spreadsheet's
// figures are the /excel page's, worked out from app/caps/files/sales.csv, never typed in.
import { languageName, dir } from '../../app/core/i18n.js'
import { demoFiles } from '../demo.js'
import { GROWTH, MONTHS, PRODUCTS, ROWS } from '../excel/page.js'

/** @import { Scene, Stop } from './schedule.js' */

/** The reels, in the order the page shows them; the first is the page's own. */
export const NAMES = ['jean', 'spreadsheet', 'asks-first', 'first-task']

/** What stops point at in Jean's conversation (app/ui/chat.js), each its last match that shows. */
export const ON = {
  file: '.msg-files .file-chip',
  request: '.msg-user',
  brain: '[data-call="brain-0"]',
  program: '[data-call="call-1"] pre',
  chart: 'app-chart',
  data: 'app-chart details > summary',
  read: '.read-list',
  answered: '.activity > summary',
  card: '.approval',
  allow: '.approval .approval-actions .button.primary',
  aloud: '.msg-jean .msg-actions button',
}

/** The words the player says, by its key in reel.js, from the page's `player.<key>`. */
const PLAYER = ['play', 'pause', 'again', 'mute', 'unmute', 'speed', 'times', 'language', 'full', 'leave', 'seek', 'time', 'chapter', 'player']

/**
 * How long a caption holds the replay: long enough to read once, since its words stay beside the window while Jean
 * goes on; a character of Chinese, Japanese or Korean counts for more than a Latin letter. @param {string} say
 */
export function reading (say) {
  const weight = [...say].reduce((sum, c) => sum + (/[぀-ヿ㐀-鿿가-힯]/.test(c) ? 2.6 : 1), 0)
  return Math.round(Math.min(5600, Math.max(2200, 900 + 40 * weight)) / 100) * 100
}

/** A stop that says something, held as long as it takes to read. @param {Omit<Stop, 'go'> & { say: string, go?: number }} stop @returns {Stop} */
const said = (stop) => ({ go: reading(stop.say), ...stop })

/**
 * Each reel's scenes and task files in a language, from the page's words.
 * @param {import('../site.js').Kit} kit @param {string} name
 * @returns {{ scenes: Scene[], files: Record<string, string> }}
 */
function scenesOf (kit, name) {
  const text = (/** @type {string} */ key, /** @type {Record<string, string>} */ params = {}) => kit.text(`${name}.${key}`, params)
  const shared = (/** @type {string} */ key) => kit.text(key)
  /** @type {Record<string, string>} */
  const files = {}
  /** A task written beside the page as a demo's is, at demos/reels/<reel>/<scene>.<lang>.jsonl. @param {string} scene @param {import('../demo.js').Task} task */
  const task = (scene, task) => {
    const written = demoFiles(kit, task, `reels/${name}/${scene}`)
    Object.assign(files, written)
    return Object.keys(written)[0]
  }
  /** The name and the promise, as the homepage says it. @returns {Scene} */
  const open = () => ({ kind: 'card', look: 'open', chapter: kit.brand.name, hold: 3800, title: kit.brand.name, line: kit.from('home').text('promise') })
  /** @param {string} key @returns {Scene} */
  const end = (key, href = kit.start) => ({ kind: 'card', look: 'end', chapter: text(`${key}.chapter`), hold: 4600, title: text(`${key}.title`), line: text(`${key}.line`), cta: { text: text(`${key}.cta`), href } })
  /** @param {string} key @returns {Scene} */
  const titled = (key) => ({ kind: 'card', look: 'title', chapter: text(`${key}.chapter`), hold: 3600, title: text(`${key}.title`), line: text(`${key}.line`) })
  switch (name) {
    case 'jean': return {
      scenes: [
        open(),
        { kind: 'task', chapter: text('chart.chapter'), src: task('chart', chart(kit)), tail: 1600, stops: [
          said({ at: 'brain-0', on: ON.file, say: text('chart.say.ask') }),
          said({ at: 'call-1', on: ON.program, say: text('chart.say.program') }),
          said({ at: 'end', on: ON.chart, say: text('chart.say.made') }),
        ] },
        { kind: 'task', chapter: text('letter.chapter'), src: task('letter', { asked: text('letter.ask'), brain: text('letter.brain'), answer: text('letter.answer') }), tail: 1400, stops: [
          said({ at: 'brain-0', on: ON.request, say: text('letter.say.any') }),
          said({ at: 'end', on: ON.answered, say: text('letter.say.where') }),
        ] },
        { kind: 'task', chapter: text('minutes.chapter'), src: task('minutes', minutes(kit, text)), tail: 1400, stops: [
          said({ at: 'ask:call-1', on: ON.allow, say: text('minutes.say.asks') }),
        ] },
        { kind: 'card', look: 'facts', chapter: text('keep.chapter'), hold: 6200, title: text('keep.title'), facts: kit.texts(`${name}.keep.facts`) },
        end('end'),
      ],
      files,
    }
    case 'spreadsheet': {
      const count = new Intl.NumberFormat(kit.lang)
      return {
        scenes: [
          titled('open'),
          { kind: 'task', chapter: text('task.chapter'), src: task('task', chart(kit)), tail: 1800, stops: [
            said({ at: 'brain-0', on: ON.file, say: text('task.say.file', { months: count.format(MONTHS.length), products: count.format(PRODUCTS.length) }) }),
            said({ at: 'brain-0', on: ON.request, say: text('task.say.ask') }),
            said({ at: 'brain-0', on: ON.brain, say: text('task.say.brain') }),
            said({ at: 'call-1', on: ON.program, say: text('task.say.program') }),
            said({ at: 'end', on: ON.chart, say: text('task.say.chart') }),
            said({ at: 'end', on: ON.data, click: true, say: text('task.say.data') }),
            said({ at: 'end', on: ON.read, say: text('task.say.read') }),
          ] },
          end('end', `${kit.start}?sample`),
        ],
        files,
      }
    }
    case 'asks-first': return {
      scenes: [
        titled('open'),
        { kind: 'task', chapter: text('task.chapter'), src: task('task', minutes(kit, text)), tail: 1600, stops: [
          said({ at: 'brain-0', on: ON.request, say: text('task.say.ask') }),
          said({ at: 'ask:call-1', on: ON.card, say: text('task.say.card') }),
          said({ at: 'ask:call-1', on: ON.allow, say: text('task.say.allow') }),
        ] },
        { kind: 'card', look: 'facts', chapter: text('rules.chapter'), hold: 6600, title: text('rules.title'), facts: kit.texts(`${name}.rules.facts`) },
      ],
      files,
    }
    case 'first-task': return {
      scenes: [
        titled('open'),
        { kind: 'task', chapter: text('task.chapter'), src: task('task', { asked: text('task.ask'), brain: shared('brain'), answer: text('task.answer') }), tail: 1600, stops: [
          said({ at: 'brain-0', on: ON.request, say: text('task.say.ask') }),
          said({ at: 'brain-0', on: ON.brain, say: text('task.say.brain') }),
          said({ at: 'end', on: ON.aloud, say: text('task.say.aloud') }),
        ] },
        end('end'),
      ],
      files,
    }
    default: throw new Error(`site/watch/reels.js: no reel named ${name}`)
  }
}

/**
 * Each product's growth since the sample's first month, month by month, its last the growth GROWTH has: what the
 * reel's program gives back, and its chart draws.
 */
export const MONTHLY = PRODUCTS.map((product) => {
  const units = MONTHS.map((month) => Number(ROWS.find((row) => row[0] === month && row[1] === product)?.[2]))
  return { product, months: units.map((one) => one / units[0] - 1) }
})

/** The program the reel's computer runs on the sample: each product's growth since the first month, month by month. @param {string} file */
const monthly = (file) => `const rows = csv(await file(${JSON.stringify(file)}))
const months = [...new Set(rows.map((row) => row.month))].sort()
const units = (month, product) => rows.find((row) => row.month === month && row.product === product).units
return [...new Set(rows.map((row) => row.product))].map((product) => {
  const growth = months.map((month) => units(month, product) / units(months[0], product) - 1)
  return { product, growth: growth.at(-1), months: growth }
})`

/**
 * The chart's lines, each 3:1 or more on Tilde's room by day and by night (WCAG's for a mark one reads), the warm one
 * for the product that grew the most, the cool ones for the others, in order.
 */
const WARM = '#e26c00'
const COOL = ['#2a80e2', '#009d82', '#d13d91']

/**
 * The sample spreadsheet asked which product grew the most, its products named in the reel's language: the program
 * that works out each one's growth month by month, what it gave back, and the answer with its chart: a line a
 * product from the same start, so the one that grew the most is the one that climbs, drawn warm over its own area,
 * its growth at its end, as this language writes a percent.
 * @param {import('../site.js').Kit} kit @returns {import('../demo.js').Task}
 */
function chart (kit) {
  const names = kit.texts('products')
  if (names.length !== PRODUCTS.length) throw new Error(`site/watch/${kit.lang}.json: products has ${names.length} names, the sample ${PRODUCTS.length} products`)
  const named = (/** @type {string} */ product) => names[PRODUCTS.indexOf(product)]
  const best = [...GROWTH].sort((a, b) => b.growth - a.growth)[0]
  const percent = (/** @type {string} */ value, /** @type {Intl.NumberFormatOptions} */ options = {}) => new Intl.NumberFormat(kit.lang, { style: 'percent', ...options }).format(1).replace(/\d+/, value)
  const month = new Intl.DateTimeFormat(kit.lang, { month: 'short', timeZone: 'UTC' })
  const cool = [...COOL]
  const colours = PRODUCTS.map((product) => (product === best.product ? WARM : /** @type {string} */ (cool.shift())))
  const option = {
    color: colours,
    legend: { top: 0, icon: 'roundRect', itemWidth: 16, itemHeight: 5, itemGap: 18 },
    grid: { containLabel: true, top: 40, bottom: 4, left: 4, right: 64 },
    xAxis: { type: 'category', boundaryGap: false, data: MONTHS.map((at) => month.format(new Date(`${at}-15T12:00:00Z`))), axisTick: { show: false } },
    yAxis: { type: 'value', axisLabel: { formatter: percent('{value}') }, splitLine: { lineStyle: { type: 'dashed' } } },
    series: MONTHLY.map(({ product, months }) => {
      const top = product === best.product
      return {
        name: named(product), type: 'line', smooth: 0.35, symbol: 'none', data: months.map((growth) => Math.round(growth * 100)),
        lineStyle: { width: top ? 4 : 2.5, cap: 'round' },
        ...top && {
          z: 3,
          areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: `${WARM}66` }, { offset: 1, color: `${WARM}00` }] } },
          endLabel: { show: true, formatter: percent('{c}', { signDisplay: 'exceptZero' }), fontSize: 14, fontWeight: 'bold', color: 'inherit' },
        },
      }
    }),
  }
  return {
    file: { name: kit.text('file'), type: 'text/csv' },
    asked: kit.appText('starter.sample.prompt'),
    brain: kit.text('brain'),
    code: monthly(kit.text('file')),
    output: `[\n${MONTHLY.map(({ product, months }) => `  ${JSON.stringify({ product: named(product), growth: Number(/** @type {number} */ (months.at(-1)).toFixed(3)), months: months.map((growth) => Number(growth.toFixed(3))) })}`).join(',\n')}\n]`,
    answer: `${kit.text('chart.answer', { product: named(best.product), growth: new Intl.NumberFormat(kit.lang, { style: 'percent', signDisplay: 'exceptZero' }).format(best.growth) })}\n\n\`\`\`echarts\n${JSON.stringify(option)}\n\`\`\``,
  }
}

/** Minutes to send to the team, which Jean asks before sending. @param {import('../site.js').Kit} kit @param {(key: string) => string} text @returns {import('../demo.js').Task} */
const minutes = (kit, text) => ({
  file: { name: kit.text('minutes.file'), type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  asked: kit.text('minutes.ask'),
  brain: kit.text('brain'),
  call: { name: 'send_email', title: kit.text('minutes.call'), input: { to: 'team@example.org', subject: kit.text('minutes.subject') }, output: kit.text('minutes.sent'), asks: true },
  answer: kit.text('minutes.answer'),
})

/**
 * A reel's file in a language, and its tasks' files, by their paths from the site's root.
 * @param {import('../site.js').Kit} kit @param {string} name
 */
export function reelFiles (kit, name) {
  const { scenes, files } = scenesOf(kit, name)
  const reel = {
    format: 1,
    kind: 'reel',
    name,
    lang: kit.lang,
    dir: dir(kit.lang),
    title: kit.text(`${name}.title`),
    address: kit.brand.domain,
    languages: kit.languages.map((code) => ({ lang: code, name: languageName(code) })),
    words: Object.fromEntries(PLAYER.map((key) => [key, kit.text(`player.${key}`)])),
    scenes,
  }
  return { [`reels/${name}.${kit.lang}.json`]: `${JSON.stringify(reel, null, 2)}\n`, ...files }
}
