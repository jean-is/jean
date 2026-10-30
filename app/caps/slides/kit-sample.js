// What the design system's page shows on each layout (D602): a small project, from its idea to its launch, written as a layout
// wants it, so that each draws what it is for: a figure from its lists or its parts, a sentence, a quote, a picture, its slots.
// By what a layout does more than its name, so that a kit's own and a template's show theirs too. Dates and numbers are Intl's.
import { labelOf, rgbOf } from '@codename/deck'
import { t, locale, intlLocales } from '../../core/i18n.js'

/** The project's stages, and the rows of the contents' slide, kept short: the other layouts stay out of them. */
const STAGES = ['idea', 'plan', 'trial', 'launch'], LISTED = ['section', 'subsection', 'steps', 'metrics', 'timeline', 'process']
/** A stage's name, and what it is. @param {string} stage */
const named = (stage) => t(`slides.kit.sample.${stage}`), told = (/** @type {string} */ stage) => t(`slides.kit.sample.${stage}Text`)
/** Stages as a figure's items: a lead in bold, its words. @param {(stage: string, i: number) => string} lead @param {(stage: string) => string} words @param {string} [mark] */
const items = (lead, words, mark = '-', stages = STAGES) => stages.map((stage, i) => `${mark} **${lead(stage, i)}** ${words(stage)}`).join('\n'), plain = () => items(named, told), none = () => ''
/** A share, and a moment of the sample's year, as the language writes them; stages as `##` parts. @param {number} share */
const percent = (share) => new Intl.NumberFormat(intlLocales(locale.peek()), { style: 'percent' }).format(share), when = (/** @type {Intl.DateTimeFormatOptions} */ how, month = 0, hour = 12) => new Intl.DateTimeFormat(intlLocales(locale.peek()), how).format(new Date(2026, month, 15, Math.floor(hour), (hour % 1) * 60)), parts = (/** @type {string[]} */ stages) => stages.map((stage) => `## ${named(stage)}\n\n${told(stage)}`).join('\n\n')

/** What a slide on each is written with, under its heading (deck's docs/format.md), by the figure it draws, else by its name. Without a prototype: a kit names its own. @type {Record<string, () => string>} */
const WRITTEN = { __proto__: /** @type {any} */ (null), section: none, subsection: none, summary: none, steps: plain, pyramid: plain, bento: plain, process: () => items(named, told, '1.'), mindmap: () => STAGES.map((stage) => `- ${named(stage)}\n  - ${told(stage)}`).join('\n'),
  metrics: () => items((_, i) => percent([0.92, 0.64, 0.38][i]), named, '-', STAGES.slice(0, 3)), timeline: () => items((_, i) => when({ month: 'short' }, i * 3), named), agenda: () => items((_, i) => when({ timeStyle: 'short' }, 0, [9, 10.5, 13, 15.5][i]), told),
  versus: () => parts(['plan', 'trial']), matrix: () => parts(STAGES), statement: () => t('slides.kit.sample.saying'), quote: () => `> ${t('slides.kit.sample.saying')}\n\n${t('slides.kit.sample.who')}`, fact: () => `# ${percent(0.92)}\n\n${t('slides.kit.sample')}` }

/** A dusk over hills, its sun in the kit's main colour, in the middle of what half a slide keeps of it, dark enough for the white words deck sets on a picture. Its colour as deck reads it, so that a kit's odd one can't spoil the picture. @param {string} colour */
const picture = (colour) => `data:image/svg+xml;base64,${btoa(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 90"><path fill="#27303c" d="M0 0h160v90H0z"/><circle fill="rgb(${rgbOf(colour) ?? [136, 136, 136]})" cx="94" cy="28" r="10"/><path fill="#3a4656" d="M0 90V60l36-24 46 54z"/><path fill="#566274" d="M38 90l50-40 28 22 16-10 28 18v10z"/></svg>`)}`

/**
 * A slide's words on a layout, under its name: a line on a slide of few words, else a list; a lead and a line in each of its other
 * slots but one beside a list, which goes on with it. A sentence, a quote and a big number have their name small, as it would take their room.
 * @param {string} name @param {any} layout as deck's mergeKits() reads it @returns {string}
 */
function words(name, layout) {
  const key = layout.parts === 'none' ? (layout.lists === 'bullets' ? name : layout.lists) : layout.parts, rest = layout.slots.filter((/** @type {string} */ slot) => slot !== 'default')
  const under = WRITTEN[key]?.() ?? (layout.paper !== 'paper' || layout.title !== 'normal' || name === 'center' || rest.length > 1 ? t('slides.kit.sample') : STAGES.slice(0, 3 - rest.length).map((stage) => `- ${told(stage)}`).join('\n'))
  return `${['statement', 'quote', 'fact'].includes(name) ? '###' : '#'} ${labelOf(layout, name, locale.peek())}\n\n${under}\n${rest.map((/** @type {string} */ slot, /** @type {number} */ i) => `\n::${slot}::\n\n${slot === 'bottom' ? told('launch') : rest.length > 1 ? `### ${named(STAGES[i % 4])}\n\n${told(STAGES[i % 4])}` : `- ${told('trial')}\n- ${told('launch')}`}\n`).join('')}`
}

/** The deck that shows a kit: a slide for each of its layouts, the cover first. @param {ReturnType<typeof import('@codename/deck').mergeKits>['kit']} kit @returns {string} */
export const sampleDeck = (kit) => ['cover', ...Object.keys(kit.layouts).filter((name) => name !== 'cover')].filter((name) => kit.layouts[name]).map((name, i) => `${i ? '\n---\n' : '---\n'}layout: ${name}\nhideInToc: ${!LISTED.includes(name)}${name.startsWith('image') ? `\nimage: ${picture(kit.tokens.primary)}` : ''}\n---\n\n${words(name, kit.layouts[name])}`).join('')
