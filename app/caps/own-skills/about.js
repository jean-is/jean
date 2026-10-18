// What Jean can do and how it is used, for the brain (D423): `about` gives guide.txt, in English, each menu and button it
// names as the user's screen shows it, and Settings' sections as they are now. A capability of the case comes in the
// case's own words, with where it stands for this user: on, not found yet and how it is found, turned down, or not here
// (this browser or this place lacks what it needs); one policy denies is left out. A part that is always there comes in
// its first paragraph. With a topic, the three parts it matches best follow whole.
import { isDenied, loaded, SIZES } from '../../ui/caps.js'
import { CATALOGUE } from '../../ui/discovery.js'
import { effective } from '../../ui/state.js'
import { places } from '../../ui/dialogs.js'
import { bm25 } from '../../core/search.js'
import { t, formatBytes } from '../../core/i18n.js'
import { BRAND } from '../../brand.js'

const guide = fetch(new URL('guide.txt', import.meta.url)).then((response) => response.text())
/** A string as the user's screen shows it. @param {string} key @param {string} [id] the capability whose size it may say */
const shown = (key, id = '') => t(key, { name: BRAND.name, size: formatBytes(SIZES[id] ?? 0) })
/** Where a capability stands for this user, '' for a part always there: a capability is one the case has words for. @param {string} id */
const standing = (id) => (shown(`cap.${id}.text`) === `cap.${id}.text` ? '' : isDenied(id) ? 'denied' : !CATALOGUE.includes(id) ? 'not here'
  : loaded.value.has(id) ? 'on' : effective.value.settings.offers[id] ? 'turned down when offered' : `not found yet, found by: ${shown(`cap.${id}.hint`)}`)

/** The guide's rules, Settings now, a line for each part, and those a topic matches. @param {string} topic in English */
export async function read(topic) {
  const [head, ...parts] = (await guide).split(/^## /m)
  const kept = parts.map((part) => part.trim().split('\n')).map(([id, ...text]) => ({ id, text: text.join('\n').trim(), state: standing(id) })).filter(({ state }) => state !== 'denied')
  const lines = kept.map(({ id, text, state }) => `- ${id}${state ? ` (${state}): ${shown(`cap.${id}.text`, id)}` : `: ${text.split('\n\n')[0]}`}`)
  const hits = topic ? bm25(kept.map(({ text }, i) => `${lines[i]} ${text}`), topic).slice(0, 3) : []
  return [head.trim(), `{settings.title} has these sections now: ${places().map(([, place]) => t(place.label)).join(', ')}.`, lines.join('\n'), ...hits.map(({ index }) => `## ${kept[index].id}\n${kept[index].text}`)]
    .join('\n\n').replace(/\{([a-z][\w.-]*)\}/g, (_, key) => shown(key))
}
