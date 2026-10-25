// A deck's look, its kit (D594): Jean's own, under the organisation's in policy (`kit`), under the project's, each over deck's
// own layouts, and the file's own over them all, which a deck kept keeps (./edit.js). Jean's own follows the look chosen in
// Settings › Appearance, its paper by night and by day and its accent, the user's own where they chose one; on Tilde's rules,
// paper is never cream and sunflower never a fill behind words, so the slides deck sets on the primary (a cover, an
// introduction, the end) are on ink there, as a section is. Its layouts are named in the user's language, as the Layout menu
// and PowerPoint's read them. The project's is its `kit.json`, else one made from its colour.
import { STANDARD, mergeKits } from '@codename/deck'
import { app, effective } from '../../ui/state.js'
import { LOOKS, OWN, lookId } from '../../ui/looks.js'
import { COLOURS } from '../../ui/touches.js'
import { t, locale } from '../../core/i18n.js'

/** Tilde's ink and paper by day and by night, and the margin's grey for a pale fill (docs/design.md). */
const TILDE = { paper: '#ffffff', ink: '#18171b', soft: '#f4f3f1', dark: { paper: '#19181b', ink: '#f3f1ed', soft: '#222125' } }

/** A colour as deck reads one, `#rrggbb`, whatever CSS calls it (an accent or a project's colour is oklch()), read back from a pixel. @param {string} colour */
export function hexOf(colour) {
  if (/^#[\da-f]{6}$/i.test(colour)) return colour
  const pen = /** @type {CanvasRenderingContext2D} */ (Object.assign(document.createElement('canvas'), { width: 1, height: 1 }).getContext('2d', { willReadFrequently: true }))
  Object.assign(pen, { fillStyle: colour }).fillRect(0, 0, 1, 1)
  return `#${[...pen.getImageData(0, 0, 1, 1).data.slice(0, 3)].map((c) => c.toString(16).padStart(2, '0')).join('')}`
}

/** Jean's own kit, from the look on show. */
export function jeanKit() {
  const base = /** @type {import('../../ui/looks.js').LookId} */ (app.look.peek()), look = LOOKS[base] ?? LOOKS.tilde, own = effective.peek().settings.look
  const primary = hexOf(own?.accent ?? (lookId(own?.id, app.policy) === OWN ? app.policy.look?.accent : undefined) ?? look.accent)
  const named = (/** @type {string} */ name) => ((words) => ({ en: words, [locale.peek()]: words }))(t(`slides.layout.${name}`))
  return { name: 'Jean', tokens: base === 'tilde' ? { ...TILDE, primary } : { paper: look.bar[1], primary, dark: { paper: look.bar[0] } },
    layouts: Object.fromEntries(Object.entries(STANDARD.layouts).map(([name, layout]) => [name, { ...layout, label: named(name), ...(base === 'tilde' && layout.paper === 'fill' && { paper: 'ink' }) }])) }
}

/** Each project's own kit, read once a visit. @type {Map<string, Promise<object | null>>} */
const projects = new Map()
/** The project's kit: its kit.json, else one of its colour, else none, as in a saved task's page. @param {string} [dir] */
const projectKit = (dir = app.projectDir) => !app.fs ? null : projects.get(dir) ?? projects.set(dir, app.fs.read(`${dir}/kit.json`).then((text) => (text ? JSON.parse(text) : null)).catch(() => null).then((own) => {
  const colour = app.project.peek().dir === dir && app.project.peek().data.colour
  return own ?? (typeof colour === 'string' && colour !== COLOURS[0][1] ? { tokens: { primary: hexOf(colour) } } : null)
})).get(dir)

/** The kit a deck of this project is drawn with, before its own: Jean's, the organisation's, the project's. @param {string} [dir] */
export const kitHere = async (dir) => mergeKits(jeanKit(), app.policy.kit, await projectKit(dir)).kit

/** What a deck kept holds of its kit: its tokens and the layouts unlike deck's own, their names left to each reader. @param {ReturnType<typeof import('@codename/deck').mergeKits>['kit']} kit */
export function copyOf({ name, tokens, layouts }) {
  const plain = (/** @type {object} */ layout) => JSON.stringify({ ...layout, label: undefined })
  return { name, tokens, layouts: Object.fromEntries(Object.entries(layouts).filter(([key, layout]) => !STANDARD.layouts[key] || plain(layout) !== plain(STANDARD.layouts[key]))
    .map(([key, { label, ...layout }]) => [key, STANDARD.layouts[key] ? layout : { label, ...layout }])) }
}
