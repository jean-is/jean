// SPDX-License-Identifier: MIT
// A deck's look, its kit (D594, D602): Jean's own, under the person's design system (kit.json at the root of their files), under
// the organisation's in policy (`kit`), under the project's, each over deck's own layouts, and the file's own over them all, which
// a deck kept keeps (./edit.js). Jean's own follows the look chosen in
// Settings › Appearance, its paper by night and by day and its accent, the user's own where they chose one; on Tilde's rules,
// paper is never cream and sunflower never a fill behind words, so the slides deck sets on the primary (a cover, an
// introduction, the end) are on ink there, as a section is. Its layouts are named in the user's language, as the Slide layout menu
// and PowerPoint's read them. The project's is its `kit.json`, else one made from its colour (ui/kit.js), which a deck kept
// is offered again when it changes (D601). The brain is told the layouts it adds, changes or turns off (layoutsTold()).
import { STANDARD, mergeKits, labelOf } from '@codename/deck'
import { app, effective } from '../../ui/state.js'
import { LOOKS, OWN, lookId } from '../../ui/looks.js'
import { hexOf, projectKit, kitFile } from '../../ui/kit.js'
import { t, locale } from '../../core/i18n.js'

/** @typedef {ReturnType<typeof mergeKits>['kit']} Kit */

/** deck's words in the user's language: its bar's, its views', a slide's. */
export const words = () => Object.fromEntries(['deck', 'previous', 'next', 'where', 'present', 'presenter', 'overview', 'edit', 'source', 'notes', 'noNotes', 'upNext', 'last', 'slide', 'carousel'].map((key) => [key, t(`slides.${key}`)]))

/** Tilde's ink and paper by day and by night, and the margin's grey for a pale fill (docs/design.md). */
const TILDE = { paper: '#ffffff', ink: '#18171b', soft: '#f4f3f1', dark: { paper: '#19181b', ink: '#f3f1ed', soft: '#222125' } }

/** One of deck's layouts named in the user's language, whatever language deck reads the name in. @param {string} name */
const named = (name) => ((words) => ({ en: words, [locale.peek()]: words }))(t(`slides.layout.${name}`))

/**
 * A kit whose layouts of deck's that a kit over Jean's changed without a name (a deck's own: copyOf()) are named as Jean names
 * them, as deck keeps no name from the kit under; for the Slide layout menu, PowerPoint and the design system's page.
 * @param {ReturnType<typeof import('@codename/deck').mergeKits>['kit']} kit
 */
export const withNames = (kit) => ({ ...kit, layouts: Object.fromEntries(Object.entries(kit.layouts).map(([key, layout]) => [key, layout.label || !STANDARD.layouts[key] ? layout : { ...layout, label: named(key) }])) })

/** Jean's own kit, from the look on show. */
export function jeanKit() {
  const base = /** @type {import('../../ui/looks.js').LookId} */ (app.look.peek()), look = LOOKS[base] ?? LOOKS.tilde, own = effective.peek().settings.look
  const primary = hexOf(own?.accent ?? (lookId(own?.id, app.policy) === OWN ? app.policy.look?.accent : undefined) ?? look.accent)
  return { name: 'Jean', tokens: base === 'tilde' ? { ...TILDE, primary } : { paper: look.bar[1], primary, dark: { paper: look.bar[0] } },
    layouts: Object.fromEntries(Object.entries(STANDARD.layouts).map(([name, layout]) => [name, { ...layout, label: named(name), ...(base === 'tilde' && layout.paper === 'fill' && { paper: 'ink' }) }])) }
}

/**
 * A short print of the person's design system, the organisation's and the project's kits, which a deck kept holds (`look`,
 * ../skills/decks.js), so that it is offered their new look once they change (D601, D602); Jean's own, from the look on
 * show, offers nothing (D594). @param {string} [dir]
 */
export const lookPrint = async (dir) => [...JSON.stringify([await kitFile(null), app.policy.kit ?? null, await projectKit(dir)])].reduce((sum, char) => Math.imul(sum ^ char.charCodeAt(0), 16777619) >>> 0, 2166136261).toString(36)

/** The kit a deck of this project is drawn with, before its own: Jean's, the person's, the organisation's, the project's. @param {string} [dir] */
export const kitHere = async (dir) => mergeKits(jeanKit(), await kitFile(null), app.policy.kit, await projectKit(dir)).kit

/**
 * A kit's layouts as the brain is told them, after the steps of a skill that writes decks and with the deck on show (D594): its own,
 * and those of deck's, which the steps name, where it changes what a slide on them is written with (its slots, the figure its lists
 * or parts make, the deck's contents, what it is for), never their look; each by its name, its label in the person's language, what
 * it is for and when, its slots after the default one and its figure; then deck's own it turns off. Empty for none, as Jean's own.
 * @param {Kit} kit @param {string} [lang]
 */
export function layoutsTold({ layouts }, lang = locale.peek()) {
  const written = (/** @type {Kit['layouts'][string]} */ { slots, lists, parts, contents, intent, use_when, avoid_when }) => JSON.stringify([slots, lists, parts, contents, intent, use_when, avoid_when]), off = Object.keys(STANDARD.layouts).filter((name) => !layouts[name])
  const said = (/** @type {Kit['layouts'][string]} */ { intent, use_when, avoid_when, slots, lists, parts, contents }) => [intent, use_when && `use when: ${use_when}`, avoid_when && `avoid when: ${avoid_when}`,
    slots.length > 1 && `slots ${slots.filter((slot) => slot !== 'default').map((slot) => `\`::${slot}::\``).join(', ')}`, lists !== 'bullets' && `lists drawn as \`${lists}\``, parts !== 'none' && `\`##\` parts as \`${parts}\``, contents && 'the deck’s contents under its words'].flatMap((words) => (words ? [words.replace(/[.\s]+$/, '')] : []))
  const told = Object.entries(layouts).filter(([name, layout]) => !STANDARD.layouts[name] || written(layout) !== written(STANDARD.layouts[name])).map(([name, layout]) => ((named, words) => `- \`${name}\`${named === name ? '' : ` (${named})`}${words.length ? `: ${words.join('; ')}.` : ''}`)(labelOf(layout, name, lang), said(layout)))
  return [...(told.length ? ['Layouts the design system adds or changes, each slot’s words after a line naming it, as `::right::`:', ...told] : []), ...(off.length ? [`The design system turns off ${off.map((name) => `\`${name}\``).join(', ')}.`] : [])].join('\n')
}

/**
 * What a deck kept holds of its kit: its tokens and the layouts unlike deck's own, their names left to each reader, deck's own
 * turned off as false (D602), and the pictures their art draws (D606). @param {ReturnType<typeof import('@codename/deck').mergeKits>['kit']} kit
 */
export function copyOf({ name, tokens, layouts, pictures }) {
  const plain = (/** @type {object} */ layout) => JSON.stringify({ ...layout, label: undefined }), art = new Set(Object.values(layouts).flatMap((layout) => layout.art ?? []))
  return { name, tokens, layouts: { ...Object.fromEntries(Object.keys(STANDARD.layouts).filter((key) => !layouts[key]).map((key) => [key, false])),
    ...Object.fromEntries(Object.entries(layouts).filter(([key, layout]) => !STANDARD.layouts[key] || plain(layout) !== plain(STANDARD.layouts[key]))
      .map(([key, { label, ...layout }]) => [key, STANDARD.layouts[key] ? layout : { label, ...layout }])) },
    ...(art.size && { pictures: Object.fromEntries(Object.entries(pictures).filter(([key]) => art.has(key))) }) }
}
