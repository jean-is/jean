// A deck's look, its kit (D594, D602): Jean's own, under the person's design system (kit.json at the root of their files), under
// the organisation's in policy (`kit`), under the project's, each over deck's own layouts, and the file's own over them all, which
// a deck kept keeps (./edit.js). Jean's own follows the look chosen in
// Settings › Appearance, its paper by night and by day and its accent, the user's own where they chose one; on Tilde's rules,
// paper is never cream and sunflower never a fill behind words, so the slides deck sets on the primary (a cover, an
// introduction, the end) are on ink there, as a section is. Its layouts are named in the user's language, as the Layout menu
// and PowerPoint's read them. The project's is its `kit.json`, else one made from its colour (ui/kit.js), which a deck kept
// is offered again when it changes (D601).
import { STANDARD, mergeKits } from '@codename/deck'
import { app, effective } from '../../ui/state.js'
import { LOOKS, OWN, lookId } from '../../ui/looks.js'
import { hexOf, projectKit, kitFile } from '../../ui/kit.js'
import { t, locale } from '../../core/i18n.js'

/** Tilde's ink and paper by day and by night, and the margin's grey for a pale fill (docs/design.md). */
const TILDE = { paper: '#ffffff', ink: '#18171b', soft: '#f4f3f1', dark: { paper: '#19181b', ink: '#f3f1ed', soft: '#222125' } }

/** Jean's own kit, from the look on show. */
export function jeanKit() {
  const base = /** @type {import('../../ui/looks.js').LookId} */ (app.look.peek()), look = LOOKS[base] ?? LOOKS.tilde, own = effective.peek().settings.look
  const primary = hexOf(own?.accent ?? (lookId(own?.id, app.policy) === OWN ? app.policy.look?.accent : undefined) ?? look.accent)
  const named = (/** @type {string} */ name) => ((words) => ({ en: words, [locale.peek()]: words }))(t(`slides.layout.${name}`))
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
 * What a deck kept holds of its kit: its tokens and the layouts unlike deck's own, their names left to each reader, and deck's
 * own turned off as false (D602). @param {ReturnType<typeof import('@codename/deck').mergeKits>['kit']} kit
 */
export function copyOf({ name, tokens, layouts }) {
  const plain = (/** @type {object} */ layout) => JSON.stringify({ ...layout, label: undefined })
  return { name, tokens, layouts: { ...Object.fromEntries(Object.keys(STANDARD.layouts).filter((key) => !layouts[key]).map((key) => [key, false])),
    ...Object.fromEntries(Object.entries(layouts).filter(([key, layout]) => !STANDARD.layouts[key] || plain(layout) !== plain(STANDARD.layouts[key]))
      .map(([key, { label, ...layout }]) => [key, STANDARD.layouts[key] ? layout : { label, ...layout }])) } }
}
