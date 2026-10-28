// What Jean can do and how it is used, for the brain (D423): `about` gives guide.txt, in English, each menu and button it
// names as the user's screen shows it, and what stands now, from the code rather than the guide: Settings' sections, the
// keyboard's shortcuts as Settings lists them, the version and when it was made (D652), what an organisation or a parent
// locked, and once Connections is found, the services it reaches here and those it doesn't yet. A capability of the case
// comes in the case's own words, with where it stands for this user: on, not found yet and how it is found, turned down,
// turned off (D433), or not here (this browser or this place lacks what it needs); one policy denies is left out. A part
// that is always there comes in its first paragraph. With a topic, the three parts it matches best follow whole.
import { isDenied, loaded, SIZES } from '../../ui/caps.js'
import { CATALOGUE } from '../../ui/discovery.js'
import { app, effective } from '../../ui/state.js'
import { offeredLooks } from '../../ui/looks.js'
import { places, lockedBy, KEYS, offered, released, madeOn } from '../../ui/dialogs.js'
import { keyNames } from '../../ui/inbox.js'
import { bm25 } from '../../core/search.js'
import { t, formatBytes } from '../../core/i18n.js'
import { BRAND } from '../../brand.js'

const guide = fetch(new URL('guide.txt', import.meta.url)).then((response) => response.text())
/** A string as the user's screen shows it. @param {string} key @param {string} [id] the capability whose size it may say */
const shown = (key, id = '') => t(key, { name: BRAND.name, size: formatBytes(SIZES[id] ?? 0) })
/** Where a capability stands for this user, '' for a part always there: a capability is one the case has words for. @param {string} id */
const standing = (id) => (shown(`cap.${id}.text`) === `cap.${id}.text` ? '' : effective.value.settings.off?.includes(id) ? 'turned off by the user' : isDenied(id) ? 'denied'
  : !CATALOGUE.includes(id) ? 'not here' : loaded.value.has(id) ? 'on' : effective.value.settings.offers[id] ? 'turned down when offered' : `not found yet, found by: ${shown(`cap.${id}.hint`)}`)
/** A locked setting, as Settings names it. @param {string} key "locale", "brains" or "rules.<kind>" (core/settings.js), or "look" (D500) */
const setting = (key) => (key === 'locale' ? t('settings.language') : key === 'brains' ? t('settings.brains') : key === 'look' ? t('look.title') : `${t('settings.approvals')} › ${t(`kind.${key.slice(6)}.label`)}`)
/** A service, with the products its one sign-in reaches. @param {{ name: string, includes?: string[] }} entry */
const named = ({ name, includes }) => (includes?.length ? `${name} (${includes.join(', ')})` : name)

/** What stands now for this user, a paragraph each. */
async function now() {
  const keys = KEYS.flatMap(([, group]) => group.filter(([, , id]) => offered(id)).map(([label, shortcut]) => `${t(label)} ${keyNames(shortcut)}`))
  const locked = [...effective.value.locked, ...offeredLooks(app.policy).length < 2 ? ['look'] : []].map(setting)
  const services = loaded.value.has('connections') ? (await import('../connections/connections.js')).services() : []
  const reached = (/** @type {boolean} */ yes) => services.filter((entry) => Boolean(entry.via) === yes).map(named).join(', ') || 'none'
  const { version, date } = await released()
  return [`{settings.title} has these sections now: ${places().map(([, place]) => t(place.label)).join(', ')}.`, `{settings.keyboard}, as this keyboard writes them: ${keys.join(', ')}.`,
    ...(version && date ? [`The version, at the foot of {settings.title} › {settings.general}: ${t('settings.version', { name: BRAND.name, version, date: madeOn(date) })}.`] : []),
    ...(locked.length ? [`${lockedBy()}, so the user can't change it: ${locked.join(', ')}.`] : []),
    ...(services.length ? [`Services that can be connected here: ${reached(true)}. Shown, but not reachable here yet: ${reached(false)}.`] : [])]
}

/** The guide's rules, what stands now, a line for each part, and those a topic matches. @param {string} topic in English */
export async function read(topic) {
  const [head, ...parts] = (await guide).split(/^## /m)
  const kept = parts.map((part) => part.trim().split('\n')).map(([id, ...text]) => ({ id, text: text.join('\n').trim(), state: standing(id) })).filter(({ state }) => state !== 'denied')
  const lines = kept.map(({ id, text, state }) => `- ${id}${state ? ` (${state}): ${shown(`cap.${id}.text`, id)}` : `: ${text.split('\n\n')[0]}`}`)
  const hits = topic ? bm25(kept.map(({ text }, i) => `${lines[i]} ${text}`), topic).slice(0, 3) : []
  return [head.trim(), ...await now(), lines.join('\n'), ...hits.map(({ index }) => `## ${kept[index].id}\n${kept[index].text}`)]
    .join('\n\n').replace(/\{([a-z][\w.-]*)\}/g, (_, key) => shown(key))
}
