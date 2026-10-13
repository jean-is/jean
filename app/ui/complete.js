// The box's / and @ (D199). Typed at a word's start, either opens a menu just above the box,
// which narrows as the user types on. / names what Jean uses for the message: one of the room's
// skills, one of its connections, something Jean can do; and finds what isn't there yet, a
// ready-made skill, read before it is added, and a service to connect. @ points at what Jean reads:
// a file or folder of the conversation's folder, a file shared or made, which is attached, an
// earlier task. ↑ and ↓ move, Enter or Tab picks, Escape closes, never while an IME composes.
// What is picked stays in the message as words ("/chart", "@Budget"), and a note before the
// message tells the brain what each names (pointed()). Loaded when / or @ is first typed at a
// word's start (ui/composer.js), never with the first screen.
import { html, nothing } from 'lit-html'
import { signal, computed, effect } from '@preact/signals-core'
import { Element, define } from './base.js'
import { app, effective } from './state.js'
import { loaded, unlock, isDenied } from './caps.js'
import { ROOM_ICONS } from './dialogs.js'
import { CATALOGUE } from './discovery.js'
import { icons } from './icons.js'
import { styleSheet } from './sheet.js'
import { typing, searchable, matching, holds, digest, pointing } from './mentions.js'
import { t, locale, relativeTime } from '../core/i18n.js'
import { join, readJSON } from '../core/fs.js'
import { fileText, splitPages } from '../core/files.js'
import { loadConversation } from '../core/conversations.js'
import { isPicture, noteRecord } from '../core/events.js'
import { BRAND } from '../brand.js'

/** @import { Envelope, ResourceLink } from '../core/types.js' */
/** @import { Typing } from './mentions.js' */
/**
 * Something the menu offers: its icon and words, what typing finds it by (`words`, searchable()),
 * whether it is yet to be added, and what picking it does.
 * @typedef {{ icon: unknown, label: string, detail?: string, aside?: string, add?: boolean, words: string, pick: () => unknown, key?: string }} Option
 * @typedef {{ heading: string, options: Option[] }} Group
 */
/** What @ picked, by the words it put in the box: a path in the conversation's folder, or an earlier task. @typedef {{ kind: 'file' | 'folder', path: string } | { kind: 'task', path: string, title: string }} Pointed */

await styleSheet(new URL('complete.css', import.meta.url))

// The options of each group shown: the first ones, more once something is typed.
const FEW = 6
const MORE = 10
// What Jean can do that / names by its own groups, or that every conversation has.
const OWN = new Set(['discovery', 'ask', 'you', 'skills', 'connections'])

/** What is typed after / or @, and where; null while the menu is closed. */
const typed = signal(/** @type {Typing | null} */ (null))
/** Everything the menu could offer for what was typed, by group, as each is read. */
const offer = signal(/** @type {Group[]} */ ([]))
/** The groups shown: their options that match what is typed, each known by its group and words. */
const shown = computed(() => {
  const now = typed.value
  if (!now) return []
  const most = now.query ? MORE : FEW
  return offer.value.map((group) => ({ ...group, options: matching(group.options, now.query).slice(0, most).map((option) => ({ ...option, key: `${group.heading}\n${option.label}` })) }))
    .filter((group) => group.options.length)
})
const options = computed(() => shown.value.flatMap((group) => group.options))
/** The option Enter picks, by its key, so it stays picked while more groups come in; the first when none is. */
const chosen = signal('')
const active = computed(() => Math.max(0, options.value.findIndex((option) => option.key === chosen.value)))

/** The box. @type {HTMLTextAreaElement | null} */
let area = null
/** Where Escape closed the menu: it stays closed while that word is typed on. */
let dismissed = -1
/** What @ picked, by its words. @type {Map<string, Pointed>} */
const picked = new Map()
let reading = 0

/** The menu follows the caret in the box: open on a / or @ at a word's start, closed otherwise. @param {HTMLTextAreaElement} textarea */
export function follow(textarea) {
  if (area !== textarea) {
    area = textarea
    textarea.addEventListener('blur', close)
    textarea.addEventListener('click', () => follow(textarea))
    textarea.addEventListener('keyup', (event) => { if (/^(Arrow(Left|Right)|Home|End)$/.test(event.key)) follow(textarea) })
  }
  const now = textarea.selectionStart === textarea.selectionEnd ? typing(textarea.value, textarea.selectionStart) : null
  if (!now) dismissed = -1
  if (!now || now.start === dismissed) return close()
  const before = typed.peek()
  if (before?.start !== now.start || before.kind !== now.kind) read(now.kind)
  if (before?.query !== now.query) chosen.value = ''
  typed.value = now
}

function close() {
  reading++
  typed.value = null
  offer.value = []
}

// A box emptied or changed from elsewhere (sent, a request brought back) is followed too.
effect(() => {
  void app.draft.value
  queueMicrotask(() => area && typed.peek() && follow(area))
})

/**
 * Moves through the menu, picks or closes it; true when the key was for it. @param {KeyboardEvent} event
 */
export function keydown(event) {
  const list = options.peek()
  if (!typed.peek() || !list.length || event.altKey || event.ctrlKey || event.metaKey) return false
  if (/^Arrow(Up|Down)$/.test(event.key)) {
    const step = event.key === 'ArrowDown' ? 1 : -1
    chosen.value = list[(active.peek() + step + list.length) % list.length].key ?? ''
  } else if ((event.key === 'Enter' || event.key === 'Tab') && !event.shiftKey) list[active.peek()].pick()
  else if (event.key === 'Escape') {
    dismissed = typed.peek()?.start ?? -1
    close()
    event.stopPropagation()
  } else return false
  event.preventDefault()
  return true
}

/**
 * Reads what / or @ could offer, each group shown in its place as soon as it is read, and again
 * when it has more (skills from elsewhere come from the internet); what a later word asks for wins.
 * @param {'/' | '@'} kind
 */
function read(kind) {
  const mine = ++reading
  offer.value = []
  const makers = kind === '/' ? [skillsHere, connectionsHere, canDo, readySkills, services] : [folder, files, tasks]
  /** @type {(Group | null)[]} */
  const groups = makers.map(() => null)
  makers.forEach((make, i) => make((group) => {
    groups[i] = group
    if (mine === reading) offer.value = groups.filter((each) => each !== null)
  }).catch((error) => console.warn('The box’s menu', error)))
}
/** @typedef {(show: (group: Group) => void) => Promise<void>} Maker */

/** Puts what was picked in the box in place of what was typed, then a space. @param {string} word */
function put(word) {
  const now = typed.peek()
  if (!area || !now) return
  const end = now.start + 1 + now.query.length
  const after = area.value.slice(end)
  const caret = now.start + word.length + 1
  close()
  area.value = `${area.value.slice(0, now.start)}${word}${/^\s/.test(after) ? '' : ' '}${after}`
  area.setSelectionRange(caret, caret)
  area.dispatchEvent(new Event('input', { bubbles: true }))
  area.focus()
}

/** @param {string} label @param {string} [detail] */
const words = (label, detail = '') => searchable(`${label} ${detail}`)

// ─── / ───────────────────────────────────────────────────────────────────────

/** A skill's icon, as Jean's own directory draws it, or a scroll. @param {string} [path] */
export const drawn = (path) => (path ? html`<svg class="icon" viewBox="0 0 24 24" focusable="false"><path d=${path}></path></svg>` : icons.scroll)

/** Jean's own ready-made skills (D196), as Skills reads them. */
const directory = async () => (await import('../caps/skills/skills.js')).directory()

/** The room's skills, each in the user's language when it gives its name in it (D222). @type {Maker} */
async function skillsHere(show) {
  if (!loaded.value.has('skills')) return
  const [list, own, { shownIn }] = await Promise.all([(await import('../caps/skills/skills.js')).skills(), directory(), import('../caps/skills/directory.js')])
  show({ heading: t('cap.skills.name'), options: list.map((skill) => {
    const mine = !skill.source && own.find((entry) => entry.name === skill.name)
    const { title: label, text: detail } = shownIn(skill, locale.value)
    return { icon: drawn(mine ? mine.icon : undefined), label, detail, words: words(`${skill.name} ${label}`, detail), pick: () => put(`/${skill.name}`) }
  }) })
}

/** A service's logo (D159), or its first letter. @param {string} name @param {string} [logo] */
export const logoOf = (name, logo) => (logo ? html`<img class="complete-logo" src=${new URL(`../caps/connections/logos/${logo}`, import.meta.url).href} alt="">`
  : html`<span class="complete-logo" aria-hidden="true">${[...name][0]}</span>`)

/** The room's connections. @type {Maker} */
async function connectionsHere(show) {
  if (!loaded.value.has('connections')) return
  const list = (await import('../caps/connections/connections.js')).offered()
  show({ heading: t('cap.connections.name'), options: list.map(({ name, logo, tools }) => ({
    icon: logoOf(name, logo), label: name, ...(tools.length && { aside: t('connections.count', { count: tools.length }) }), words: words(name), pick: () => put(`/${name}`),
  })) })
}

/**
 * What Jean can do now with tools the brain calls, by the name its trophy has (D127); Things Jean
 * made too, which every conversation has from its first message (D119). @type {Maker}
 */
async function canDo(show) {
  await unlock('made')
  const caps = [...loaded.value.values()].filter((cap) => !OWN.has(cap.id) && cap.tools?.some((tool) => !tool.hidden))
    .sort((a, b) => CATALOGUE.indexOf(a.id) - CATALOGUE.indexOf(b.id))
  show({ heading: t('collection.title', { name: BRAND.name }), options: caps.map((cap) => {
    const label = t(`cap.${cap.id}.name`)
    return { icon: icons[ROOM_ICONS[cap.id]] ?? icons.spark, label, words: words(label), pick: () => put(`/${label}`) }
  }) })
}

/**
 * Ready-made skills the room doesn't have, once Skills is found: Jean's own, then those its sources
 * publish (D121). Picked, one is read before it is added, and named in the box. @type {Maker}
 */
async function readySkills(show) {
  if (!loaded.value.has('skills')) return
  const skills = await import('../caps/skills/skills.js')
  const [have, own, { siteOf }, { shownIn }] = await Promise.all([skills.skills(), directory(), import('../caps/skills/sources.js'), import('../caps/skills/directory.js')])
  /** @param {(import('../caps/skills/sources.js').Entry & { icon?: string })[]} entries */
  const group = (entries) => {
    const names = new Set(have.map((skill) => skill.name))
    /** @type {Option[]} */
    const list = []
    for (const entry of entries) {
      if (names.has(entry.name)) continue
      names.add(entry.name)
      const { title: label, text: detail } = shownIn(entry, locale.value)
      list.push({ icon: drawn(entry.icon), label, detail, ...(entry.digest && { aside: siteOf(entry.url) }), add: true,
        words: words(`${entry.name} ${label}`, detail), pick: async () => {
          put(`/${entry.name}`)
          return import('../caps/skills/ready.js').then((module) => module.preview(entry))
        } })
    }
    return { heading: t('skills.directory'), options: list }
  }
  show(group(own))
  show(group([...own, ...(await skills.offered()).flatMap((index) => index.skills)]))
}

/**
 * Services Jean knows that aren't connected yet, those it can reach, once Connections is found.
 * Picked, one is connected, its sign-in included, and named in the box. @type {Maker}
 */
async function services(show) {
  if (!loaded.value.has('connections')) return
  const connections = await import('../caps/connections/connections.js')
  const known = connections.services()
  const have = new Set([...(app.policy.connections ?? []), ...(effective.value.settings.connections ?? [])].map((connection) => connection.url))
  const list = new Intl.ListFormat(locale.value, { type: 'unit', style: 'short' })
  show({ heading: t('cap.connections.yes'), options: known.filter((entry) => entry.via && entry.url && !have.has(entry.url)).map((entry) => ({
    icon: logoOf(entry.name, entry.logo), label: entry.name, ...(entry.includes && { detail: list.format(entry.includes) }), add: true,
    words: words(entry.name, entry.includes?.join(' ')), pick: async () => {
      put(`/${entry.name}`)
      await connections.connectService(entry)
    },
  })) })
}

// ─── @ ───────────────────────────────────────────────────────────────────────

/** The files and folders of the conversation's folder, once the browser lets Jean open it (D141). @type {Maker} */
async function folder(show) {
  if (!loaded.value.has('folders')) return
  const found = await (await import('../caps/folders/folders.js')).entries()
  if (found) show({ heading: found.name, options: found.entries.map(({ path, kind }) => {
    const word = `@${path}${kind === 'directory' ? '/' : ''}`
    return { icon: kind === 'directory' ? icons.folder : icons.file, label: word.slice(1), words: searchable(path), pick: () => point(word, { kind: kind === 'directory' ? 'folder' : 'file', path }) }
  }) })
}

/** A file's metadata, by its path: files are named by their content, so it never changes. @type {Map<string, Promise<import('../core/files.js').FileMeta | null>>} */
const metas = new Map()

/**
 * The files shared or made in a project, the newest of each name first, with their metadata: what @ offers,
 * and what read and search_files reach (D24). @param {string} dir the project's
 */
export async function library(dir) {
  const names = (await app.fs.list(join(dir, 'files'))).map((entry) => entry.name)
  const found = await Promise.all(names.filter((name) => name.endsWith('.meta.json')).map(async (name) => {
    const path = join(dir, 'files', name)
    if (!metas.has(path)) metas.set(path, readJSON(app.fs, path))
    const meta = await metas.get(path)
    const base = name.slice(0, -'.meta.json'.length)
    const original = names.find((other) => other.startsWith(`${base}.`) && !other.endsWith('.md') && !other.endsWith('.meta.json'))
    return meta?.name && original ? [{ meta, link: /** @type {ResourceLink} */ ({ type: 'resource_link', uri: `files/${original}`, name: meta.name, ...(meta.mimeType && { mimeType: meta.mimeType }), size: meta.size }) }] : []
  }))
  const seen = new Set()
  return found.flat().sort((a, b) => (a.meta.createdAt < b.meta.createdAt ? 1 : -1)).filter(({ link }) => !seen.has(link.name) && seen.add(link.name))
}

/** Files shared or made in the room's project, the newest of each name first; picked, one is attached. @type {Maker} */
async function files(show) {
  if (isDenied('files')) return
  const newest = await library(app.projectDir)
  show({ heading: t('cap.files.name'), options: newest.map(({ meta, link }) => ({
    icon: isPicture(link) ? icons.image : icons.file, label: link.name, aside: relativeTime(meta.createdAt), words: searchable(link.name), pick: () => attach(link),
  })) })
}

/** A file of the library, attached to the message as if it were dropped again. @param {ResourceLink} link */
async function attach(link) {
  put(`@${link.name}`)
  if (!(await unlock('files')) || app.attachments.peek().some((item) => item.link?.uri === link.uri)) return
  const [text, bytes] = await Promise.all([fileText(app.fs, app.projectDir, link.uri), isPicture(link) ? app.fs.readBytes(join(app.projectDir, link.uri)) : null])
  const preview = bytes ? URL.createObjectURL(new Blob([/** @type {BlobPart} */ (bytes)], { type: link.mimeType })) : undefined
  app.attachments.value = [...app.attachments.peek(), { key: crypto.randomUUID(), name: link.name, status: 'ready', link, pages: splitPages(text ?? ''), ...(preview && { preview }) }]
}

/** The room's other tasks, the latest first. @type {Maker} */
async function tasks(show) {
  const here = app.current.peek()?.path
  show({ heading: t('history.title'), options: app.conversations.value.filter((item) => item.path !== here).map((item) => {
    const title = item.title || t('conversation.untitled')
    return { icon: icons.history, label: title, aside: relativeTime(item.updatedAt), words: searchable(title), pick: () => point(`@${title}`, { kind: 'task', path: item.path, title }) }
  }) })
}

/** @param {string} word @param {Pointed} what */
function point(word, what) {
  picked.set(word, what)
  put(word)
}

// ─── What the brain reads ────────────────────────────────────────────────────

/**
 * What a message names with / and @, as the note the brain reads just before it (D199): the
 * room's skills, connections and what Jean can do, by name, picked or typed; and the paths and
 * tasks picked after an @. Nothing when it names nothing. What was picked is forgotten.
 * @param {string} text @returns {Promise<Envelope[]>}
 */
export async function pointed(text) {
  /** @type {Map<string, () => Promise<{ means: string, body?: string }>>} */
  const meanings = new Map()
  if (loaded.value.has('skills')) {
    const { skills, steps } = await import('../caps/skills/skills.js')
    for (const { name } of await skills()) meanings.set(`/${name}`, async () => ({ means: `is the skill ${name}: follow its steps for this message`, body: await steps(name) }))
  }
  if (loaded.value.has('connections')) {
    for (const { name, tools } of (await import('../caps/connections/connections.js')).offered()) {
      meanings.set(`/${name}`, async () => ({ means: `is the connection ${name}: use it for this message${tools.length ? `, with ${tools.join(', ')}` : ''}` }))
    }
  }
  for (const cap of loaded.value.values()) {
    const names = OWN.has(cap.id) ? [] : (cap.tools ?? []).filter((tool) => !tool.hidden).map((tool) => tool.spec.name)
    if (names.length) meanings.set(`/${t(`cap.${cap.id}.name`)}`, async () => ({ means: `asks you to use these tools for this message: ${names.join(', ')}` }))
  }
  for (const [word, what] of picked) {
    meanings.set(word, async () => (what.kind === 'task' ? { means: `is the earlier task "${what.title}", as it went`, body: digest((await loadConversation(app.fs, what.path))?.records ?? []) }
      : { means: `is the ${what.kind} "${what.path}" in the user's folder: ${what.kind === 'file' ? 'read it with open' : 'see what it holds with list'}` }))
  }
  picked.clear()
  const lower = text.toLowerCase()
  const found = holds(text, [...meanings.keys()]).sort((a, b) => lower.indexOf(a.toLowerCase()) - lower.indexOf(b.toLowerCase()))
  if (!found.length) return []
  const named = await Promise.all(found.map(async (word) => ({ word, ...await /** @type {() => Promise<{ means: string, body?: string }>} */ (meanings.get(word))() })))
  return [noteRecord(pointing(named), { kind: 'mentions', words: found })]
}

// ─── The menu ────────────────────────────────────────────────────────────────

class Complete extends Element {
  render() {
    const list = options.value
    if (!typed.value || !list.length) return nothing
    const at = active.value
    let index = 0
    /** @param {Option} option */
    const row = (option) => {
      const i = index++
      return html`<li role="option" id="complete-${i}" class="complete-option" aria-selected=${i === at ? 'true' : 'false'}
        @click=${option.pick} @pointermove=${() => { chosen.value = option.key ?? '' }}>
        ${option.icon}<span class="complete-label" dir="auto">${option.label}</span>
        <span class="complete-aside">${option.aside ? html`<span dir="auto">${option.aside}</span>` : nothing}${option.add ? icons.plus : nothing}</span>
        ${option.detail ? html`<span class="complete-detail" dir="auto">${option.detail}</span>` : nothing}
      </li>`
    }
    // Pressed, an option keeps the box's keyboard.
    return html`<div id="complete" class="complete" role="listbox" aria-label=${t('suggest.title')} @mousedown=${(/** @type {Event} */ e) => e.preventDefault()}>
      ${shown.value.map((group, g) => html`<ul role="group" aria-labelledby="complete-group-${g}">
        <li role="presentation" id="complete-group-${g}" class="complete-heading" dir="auto">${group.heading}</li>${group.options.map(row)}
      </ul>`)}
    </div>`
  }

  updated() {
    const list = options.value
    const open = Boolean(typed.value && list.length)
    // The box says which option Enter picks, as a combobox's field does.
    if (area && open) {
      area.setAttribute('aria-autocomplete', 'list')
      area.setAttribute('aria-controls', 'complete')
      area.setAttribute('aria-activedescendant', `complete-${active.value}`)
    } else for (const name of ['aria-autocomplete', 'aria-controls', 'aria-activedescendant']) area?.removeAttribute(name)
    if (open) this.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }
}

define('app-complete', Complete)
