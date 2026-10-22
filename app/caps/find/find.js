// Search (D133), as in the Claude apps: once there is plenty to look back on, ⌘K, or Search
// at the top of the drawer (D165), finds a conversation in any project by its title or its words, a
// file shared or made by its name or its text, a creation (a document, a table…) by its name or its words, opened
// beside the conversation (D497), a project by its name, a section of Settings,
// and, once Connections is found, a connection and a service to connect, as the box's / offers
// them (D199), as people type: part of a word is enough, case and accents aside, in any script.
// What has a word in its name comes before what only says it, in each group and from group to group.
// It reads every conversation each time it opens, as the list does (an index in .cache/ can
// come later), and each file once (they are named by their content). Empty, it offers a new
// conversation and the room's latest ones.
import { html, nothing } from 'lit-html'
import { live } from 'lit-html/directives/live.js'
import { signal, computed } from '@preact/signals-core'
import { Element, define } from '../../ui/base.js'
import { register, loaded, slots } from '../../ui/caps.js'
import { app, newConversation, openConversation, enterProject, turnPage, openFile } from '../../ui/state.js'
import { syncDialog, closed, backdrop, openSettings, places, projectName } from '../../ui/dialogs.js'
import { focusComposer } from '../../ui/composer.js'
import { icons } from '../../ui/menu-icons.js'
import { loadConversation } from '../../core/conversations.js'
import { foldTurns, splitSuggestions } from '../../core/events.js'
import { fold, terms, ranges, passage } from '../../core/search.js'
import { join, readJSON } from '../../core/fs.js'
import { t, locale, relativeTime } from '../../core/i18n.js'
import { styleSheet } from '../../ui/sheet.js'

/** @typedef {import('../../core/settings.js').Project} Project */
/** @typedef {import('../../core/types.js').ResourceLink} ResourceLink */
/** @typedef {import('../../ui/creations.js').Creation} Creation */
/**
 * A conversation or a file as search reads it: its words (what was asked and answered, or the
 * file's text), composed (NFC), with its title, both also folded to the same length.
 * A creation is one too, its `kind` the slot of the capability that keeps it (D497).
 * @typedef {{ path: string, dir: string, id: string, title: string, at: string, size: number, text: string, folded: string, foldedTitle: string, link?: ResourceLink, kind?: import('../../ui/caps.js').Slot }} Entry
 */
/**
 * One thing that can be picked: its words, what was found in them marked, where it leads, and how well it matches.
 * @typedef {{ icon: unknown, title: unknown, snippet?: unknown, aside?: string, when?: string, go: () => unknown, score?: number }} Option
 */

// Its style sheet comes with it, not with the first screen.
await styleSheet(new URL('find.css', import.meta.url))

const RECENT = 8
const MOST = 30

const query = signal('')
const active = signal(0)
/** Every conversation, file and creation of every project, newest first, once read. */
const library = signal(/** @type {{ conversations: Entry[], files: Entry[], creations: Entry[] } | null} */ (null))
/** What was read before, by path: a conversation with as many records, or any file, is the same one. @type {Map<string, Entry>} */
const kept = new Map()
/** @type {Promise<void> | null} */
let reading = null
/** Connections, once found: their module, and how the box's / draws and names one (D199), loaded when search first opens then. */
const reached = signal(/** @type {{ connections: typeof import('../connections/connections.js'), logoOf: typeof import('../../ui/complete.js').logoOf, put: typeof import('../../ui/plus.js').put } | null} */ (null))

/** @param {Entry} a @param {Entry} b */
const newest = (a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)

function read() {
  reading ??= Promise.all(app.projects.peek().map(async ({ dir }) => {
    const [talks, files] = await Promise.all(['conversations', 'files'].map((folder) => app.fs.list(join(dir, folder))))
    const names = files.map((file) => file.name)
    return [...await Promise.all([
      ...talks.filter((file) => file.kind === 'file' && file.name.endsWith('.jsonl')).map((file) => conversation(dir, join(dir, 'conversations', file.name))),
      ...names.filter((name) => name.endsWith('.meta.json')).map((name) => shared(dir, name.slice(0, -'.meta.json'.length), names)),
    ]), ...await keeps(dir)]
  })).then((lists) => {
    const entries = lists.flat().filter((item) => item !== null)
    kept.clear()
    for (const item of entries) kept.set(item.path, item)
    const of = (/** @type {(item: Entry) => unknown} */ which) => entries.filter(which).sort(newest)
    library.value = { conversations: of((item) => !item.link), files: of((item) => item.link && !item.kind), creations: of((item) => item.kind) }
  }).catch((error) => console.warn('Search', error)).finally(() => { reading = null })
  return reading
}

/** @param {string} title @param {string} text @returns {Pick<Entry, 'title' | 'text' | 'folded' | 'foldedTitle'>} */
function readable(title, text) {
  // Markdown's marks are not words.
  const plain = text.normalize('NFC').replace(/[*`#|]+/g, ' ')
  const named = title.normalize('NFC')
  return { title: named, text: plain, folded: fold(plain), foldedTitle: fold(named) }
}

/** What was asked, the files shared, and what was answered. @param {string} dir the project's @param {string} path @returns {Promise<Entry | null>} */
async function conversation(dir, path) {
  const talk = await loadConversation(app.fs, path).catch(() => null)
  if (!talk) return null
  const known = kept.get(path)
  // A conversation gone back to a request (D188) may be as long as before, but not as late.
  if (known?.size === talk.records.length && known.at === talk.updatedAt) return known
  /** @type {string[]} */
  const parts = []
  for (const turn of foldTurns(talk.records)) {
    if (turn.user) parts.push(...turn.user.files.map((file) => file.name), turn.user.text)
    parts.push(splitSuggestions(turn.steps.map((step) => step.text).join('\n')).text)
  }
  return { path, dir, id: talk.header.id, at: talk.updatedAt, size: talk.records.length, ...readable(talk.title, parts.filter(Boolean).join('\n')) }
}

/**
 * A file shared or made (core/files.js): its name, and the text read from it.
 * @param {string} dir the project's @param {string} base `sha256-<hash>` @param {string[]} names the files folder's
 * @returns {Promise<Entry | null>}
 */
async function shared(dir, base, names) {
  const path = join(dir, 'files', `${base}.meta.json`)
  const known = kept.get(path)
  if (known) return known
  const meta = /** @type {import('../../core/files.js').FileMeta | null} */ (await readJSON(app.fs, path))
  const original = names.find((name) => name.startsWith(`${base}.`) && !name.endsWith('.md') && !name.endsWith('.meta.json'))
  if (!meta?.name || !original) return null
  const text = (await app.fs.read(join(dir, 'files', `${base}.md`)) ?? '').replace(/^\[\[page \d+\]\]$/gm, '')
  /** @type {ResourceLink} */
  const link = { type: 'resource_link', uri: `files/${original}`, name: meta.name, ...(meta.mimeType && { mimeType: meta.mimeType }), size: meta.size }
  return { path, dir, id: base, at: meta.createdAt, size: meta.size, link, ...readable(meta.name, text) }
}

/** A project's creations, as each capability found keeps them (D497), by name and words, read again each time, as they change. @param {string} dir the project's @returns {Promise<Entry[]>} */
const keeps = async (dir) => (await Promise.all(slots('creations').map(async (kind) => (/** @type {Creation[]} */ (await kind.kept(dir))).map(({ path, name, changed, text, link }) => ({ path: join(dir, path), dir, id: path, at: changed, size: 0, kind, link, ...readable(name, text) }))))).flat()

/** A text with what was found in it marked. @param {string} text @param {[number, number][]} found */
function marked(text, found) {
  /** @type {unknown[]} */
  const parts = []
  let at = 0
  for (const [start, end] of found) {
    parts.push(text.slice(at, start), html`<mark>${text.slice(start, end)}</mark>`)
    at = end
  }
  parts.push(text.slice(at))
  return parts
}

/** Where something is: in the room, or in another project, which is walked into first. @param {string} dir */
const elsewhere = (dir) => (dir === app.projectDir ? undefined : app.projects.value.find((project) => project.dir === dir))

/** A conversation, as the list opens one. @param {{ path: string, dir: string }} item */
function opening({ path, dir }) {
  const project = elsewhere(dir)
  return () => turnPage(async () => {
    if (project) await enterProject(project)
    await openConversation(path)
  })
}

/** A file, in the preview beside the conversation (D126). @param {Entry} item */
const showing = (item) => async () => {
  app.dialog.value = null
  const project = elsewhere(item.dir)
  if (project) await enterProject(project)
  if (item.link) await openFile(item.link)
}

/**
 * What has every word, as options, the best first, then in the list's order (the newest first): a word in its name
 * counts three times one only in the rest (what it says, what else it goes by, what it includes).
 * @template T @param {T[]} list @param {(item: T) => string[]} sides its name and the rest, folded
 * @param {string[]} words @param {(item: T) => Option} option @returns {Option[]}
 */
function matching(list, sides, words, option) {
  return list.map((item) => {
    const [title, text = ''] = sides(item)
    const points = words.map((word) => (title.includes(word) ? 3 : text.includes(word) ? 1 : 0))
    return { item, score: points.includes(0) ? 0 : points.reduce((/** @type {number} */ sum, n) => sum + n, 0) }
  }).filter(({ score }) => score).sort((a, b) => b.score - a.score).slice(0, MOST).map(({ item, score }) => ({ ...option(item), score }))
}

/** A conversation's, a creation's or a file's name and words. @param {Entry} item */
const titled = (item) => [item.foldedTitle, item.folded]

/** What was found in an entry: its title marked, and a passage of its words where they are. @param {Entry} item @param {string[]} words */
function found(item, words) {
  const first = Math.min(...words.map((word) => item.folded.indexOf(word)).filter((at) => at >= 0))
  const [start, end] = Number.isFinite(first) ? passage(item.text, first) : [0, 0]
  // Another project's, by its name (the home project is the assistant's own room, and goes by its name).
  const project = loaded.value.has('projects') ? elsewhere(item.dir) : undefined
  return {
    title: item.title ? marked(item.title, ranges(item.foldedTitle, words)) : t('conversation.untitled'),
    snippet: end ? [start ? '…' : '', ...marked(item.text.slice(start, end), ranges(item.folded.slice(start, end), words))] : undefined,
    aside: project && projectName(project),
    when: item.at,
  }
}

/** @param {string[]} words @returns {{ heading: string, options: Option[] }[]} */
function groups(words) {
  if (!words.length) {
    return [
      { heading: '', options: [{ icon: icons.compose, title: t('action.new'), go: () => turnPage(newConversation).then(focusComposer) }] },
      { heading: t('history.title'), options: app.conversations.value.slice(0, RECENT).map((item) => ({
        icon: icons.list, title: item.title || t('conversation.untitled'), when: item.updatedAt, go: opening({ ...item, dir: app.projectDir }),
      })) },
    ]
  }
  const folded = (/** @type {string} */ text) => fold(text.normalize('NFC'))
  const lit = (/** @type {string} */ text) => marked(text, ranges(fold(text), words))
  // Settings' sections shown now, by their names, what else they go by, or Settings' own.
  const settings = t('settings.title')
  const sections = places().map(([id, place]) => ({ label: t(place.label), icon: place.icon, go: () => openSettings(id), also: place.also?.() ?? '' }))
  const projects = loaded.value.has('projects') ? app.projects.value : []
  const { conversations = [], files = [], creations = [] } = library.value ?? {}
  // The room's connections and the services not connected yet, by name or what they include; picked, one is named in the box, a service connected first.
  const linked = loaded.value.has('connections') ? reached.value : null
  const named = (/** @type {string} */ name) => { app.dialog.value = null; linked?.put(`/${name}`) }
  return [
    { heading: settings, options: matching(sections, (place) => [folded(place.label), folded(`${place.also} ${settings}`)], words, (place) => ({ icon: place.icon, title: lit(place.label), go: place.go })) },
    { heading: t('cap.projects.name'), options: matching(projects, (project) => [folded(projectName(project))], words, (project) => ({
      icon: icons.layers, title: lit(projectName(project).normalize('NFC')), go: () => (project.dir === app.projectDir ? (app.dialog.value = null) : enterProject(project)),
    })) },
    { heading: t('cap.connections.name'), options: linked ? matching(linked.connections.offered(), ({ name }) => [folded(name)], words, ({ name, logo, tools }) => ({
      icon: linked.logoOf(name, logo), title: lit(name.normalize('NFC')), aside: tools.length ? t('connections.count', { count: tools.length }) : undefined, go: () => named(name),
    })) : [] },
    { heading: t('history.title'), options: matching(conversations, titled, words, (item) => ({ icon: icons.list, ...found(item, words), go: opening(item) })) },
    { heading: t('creations.title'), options: matching(creations, titled, words, (item) => ({ icon: item.kind?.draw(), ...found(item, words), go: showing(item) })) },
    { heading: t('cap.files.name'), options: matching(files, titled, words, (item) => ({
      icon: item.link?.mimeType?.startsWith('image/') ? icons.image : icons.file, ...found(item, words), go: showing(item),
    })) },
    { heading: t('cap.connections.yes'), options: linked ? matching(linked.connections.unconnected(), (entry) => [folded(entry.name), folded(entry.includes?.join(' ') ?? '')], words, (entry) => ({
      icon: linked.logoOf(entry.name, entry.logo), title: lit(entry.name), snippet: entry.includes && lit(linked.connections.products(entry.includes)), go: () => (named(entry.name), linked.connections.connectService(entry)),
    })) : [] },
  ]
}

/** What was typed, and what it finds, the group with the best match first, the others in their order; only the option picked changes as the pointer moves. */
const results = computed(() => {
  const words = terms(query.value, locale.value)
  const shown = groups(words).filter((group) => group.options.length).sort((a, b) => (b.options[0].score ?? 0) - (a.options[0].score ?? 0))
  return { words, shown, options: shown.flatMap((group) => group.options) }
})

/** @param {Event} event */
function typed(event) {
  query.value = /** @type {HTMLInputElement} */ (event.target).value
  active.value = 0
}

/** Up and down move through what was found, Enter opens it; never while an IME composes. @param {KeyboardEvent} event @param {Option[]} options */
function keydown(event, options) {
  if (event.isComposing || event.keyCode === 229 || !options.length) return
  const step = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0
  if (step) {
    event.preventDefault()
    active.value = (Math.min(active.value, options.length - 1) + step + options.length) % options.length
  } else if (event.key === 'Enter') {
    event.preventDefault()
    options[Math.min(active.value, options.length - 1)].go()
  }
}

class Find extends Element {
  render() {
    const { words, shown, options } = results.value
    const at = Math.min(active.value, options.length - 1)
    const none = words.length > 0 && !options.length && library.value !== null
    let index = 0
    /** @param {Option} option */
    const row = (option) => {
      const i = index++
      return html`<li role="option" id="find-${i}" class="find-option" aria-selected=${i === at ? 'true' : 'false'}
        @click=${option.go} @pointermove=${() => { active.value = i }}>
        ${option.icon}
        <span class="find-title" dir="auto">${option.title}</span>
        <span class="find-aside">${option.aside ? html`<span dir="auto">${option.aside}</span>` : nothing}${option.when
          ? html`<time datetime=${option.when}>${relativeTime(option.when)}</time>` : nothing}</span>
        ${option.snippet ? html`<span class="find-snippet" dir="auto">${option.snippet}</span>` : nothing}
      </li>`
    }
    return html`<dialog class="sheet find" aria-label=${t('cap.find.name')} @close=${this.#closed} @click=${backdrop}>
      <div class="find-field">
        ${icons.search}
        <input type="text" role="combobox" aria-expanded="true" aria-controls="find-results" aria-autocomplete="list"
          aria-activedescendant=${options.length ? `find-${at}` : nothing} aria-label=${t('cap.find.name')}
          placeholder=${t('find.placeholder')} autocomplete="off" spellcheck="false" enterkeyhint="go" dir="auto" autofocus
          .value=${live(query.value)} @input=${typed} @keydown=${(/** @type {KeyboardEvent} */ e) => keydown(e, options)}>
      </div>
      <div id="find-results" class="find-results" role="listbox" aria-label=${t('cap.find.name')} aria-busy=${words.length && !library.value ? 'true' : 'false'}>
        ${shown.map((group, g) => group.heading
          ? html`<ul role="group" aria-labelledby="find-group-${g}"><li role="presentation" id="find-group-${g}" class="find-heading">${group.heading}</li>${group.options.map(row)}</ul>`
          : html`<ul role="none">${group.options.map(row)}</ul>`)}
      </div>
      ${none ? html`<p class="find-none" role="status">${t('find.none', { query: `⁨${query.value.trim()}⁩` })}</p>` : nothing}
    </dialog>`
  }

  #open = false
  #closed = (/** @type {Event} */ event) => {
    active.value = 0
    closed('find')(event)
  }

  updated() {
    syncDialog(this, 'find')
    const open = app.dialog.value === 'find'
    if (open && !this.#open) {
      // Each time it opens: what was searched last, ready to be typed over, and everything read again.
      this.querySelector('input')?.select()
      read()
      if (loaded.peek().has('connections') && !reached.peek()) Promise.all([import('../connections/connections.js'), import('../../ui/complete.js'), import('../../ui/plus.js')]).then(([connections, { logoOf }, { put }]) => { reached.value = { connections, logoOf, put } })
    }
    this.#open = open
    if (open) this.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }
}

define('app-find', Find)
register({ id: 'find' })
