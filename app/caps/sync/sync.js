// Sync (D157): Jean's files mirrored into a folder of the user's that their cloud drive (OneDrive,
// Dropbox, iCloud Drive, Google Drive) keeps the same on their other computers, each computer's Jean
// syncing with it. Chrome and Edge open the folder in place, with Folders' access (D141): its handle is kept
// in IndexedDB, and the browser asks again once a visit unless allowed on every visit. The desktop app picks
// it with the system's dialog and keeps its path, which its host works in (D169). Rounds run as rounds.js
// says, and soon after the folder's files change too (where the browser tells: another Jean's in it, or the
// drive's); mirror.js does the work.
import { html } from 'lit-html'
import { signal } from '@preact/signals-core'
import { register } from '../../ui/caps.js'
import { app, notify } from '../../ui/state.js'
import { folderFS } from '../../ui/opfs.js'
import { keptIn } from '../../ui/idb.js'
import { host, pickFolder, showFolder, hostFS } from '../../ui/host.js'
import { icons } from '../../ui/menu-icons.js'
import { t, useStrings, relativeTime } from '../../core/i18n.js'
import { claim, syncRound, carried, BASE } from './mirror.js'
import { rounds, round, later } from './rounds.js'

await useStrings('sync')

/** A folder picked in the page, or the path of one picked in the desktop app. @typedef {FileSystemDirectoryHandle | string} Folder */
const nameOf = (/** @type {Folder} */ folder) => (typeof folder === 'string' ? folder.split('/').filter(Boolean).at(-1) ?? folder : folder.name)

/**
 * The folder Jean syncs with, if any, how it stands, and when it was last in step.
 * @type {import('@preact/signals-core').Signal<{ folder?: Folder, status: 'waiting' | 'syncing' | 'done' | 'failed', at?: number }>}
 */
const state = signal({ status: 'done' })
/** @type {Promise<import('../../core/types.js').FS> | null} */
let mirror = null
/** What hears of the folder's changes (FileSystemObserver, Chrome and Edge). */
let observer = /** @type {any} */ (null)

// The folder can't be kept in a file (a handle can't, a path is this computer's): IndexedDB keeps it, never in a backup or a sync.
const stored = keptIn('sync')

/** Whether the browser lets Jean open the folder, asking when `ask` (it needs the user's click just before); the host always does. @param {Folder} folder */
const allowed = async (folder, ask = false) => typeof folder === 'string' || /** @type {any} */ (folder)[ask ? 'requestPermission' : 'queryPermission']({ mode: 'readwrite' }).then((/** @type {string} */ answer) => answer === 'granted', () => false)

/** One round with the folder, under rounds.js's lock: the paths that came in. @returns {Promise<string[]>} */
async function run() {
  const { folder, at } = state.peek()
  if (!folder) return []
  if (!(await allowed(folder))) { state.value = { folder, status: 'waiting', at }; return [] }
  if (typeof folder !== 'string' && !observer && 'FileSystemObserver' in globalThis) (observer = new (/** @type {any} */ (globalThis).FileSystemObserver)(later)).observe(folder, { recursive: true }).catch(() => {})
  state.value = { folder, status: 'syncing', at }
  try {
    const fs = await (mirror ??= typeof folder === 'string' ? Promise.resolve(hostFS(folder)) : folderFS(folder))
    if (!(await claim(fs, { by: app.deviceId }))) throw new Error('Not a folder Jean syncs with')
    // What a round takes from a task goes as any removal does: kept first where policy says, or refused, which a toast says (D412).
    const came = await syncRound(app.fs, fs, { busy: (path) => app.running.peek().includes(path), removing: async (removals, act) => (await import('../../ui/send.js')).removing(removals, act) })
    if (folder === state.peek().folder) state.value = { folder, status: 'done', at: Date.now() }
    return came
  } catch (error) {
    console.warn('Sync', error)
    if (folder === state.peek().folder) state.value = { folder, status: 'failed', at }
    return /** @type {any} */ (error)?.came ?? []
  }
}

/** The user picks the folder: an empty one, or the one they sync with on another computer. */
export async function choose() {
  /** @type {Folder} */
  let folder
  try {
    folder = (await host) ? await pickFolder(t('sync.choose')) : await /** @type {any} */ (window).showDirectoryPicker({ id: 'sync', mode: 'readwrite', startIn: 'documents' })
  } catch (error) {
    if (/** @type {{ name?: string } | undefined} */ (error)?.name !== 'AbortError') console.warn('Sync', error)
    return
  }
  const fs = typeof folder === 'string' ? hostFS(folder) : await folderFS(folder)
  if (!(await claim(fs, { by: app.deviceId }).catch(() => false))) {
    fs.close?.()
    return notify(t('sync.refused', { folder: nameOf(folder) }), { alert: true })
  }
  await forget()
  mirror = Promise.resolve(fs)
  await stored('readwrite', (store) => store.put(folder, 'folder'))
  state.value = { folder, status: 'syncing' }
  notify(t('sync.syncing', { folder: nameOf(folder) }))
  await round()
}

/** Jean stops syncing; the folder keeps what it holds. */
async function stop() {
  await forget()
  await stored('readwrite', (store) => store.delete('folder'))
  state.value = { status: 'done' }
}

/** What Jean knew of the last folder: its FS, the base and the versions Markdown merged from, so another folder starts from nothing known. */
async function forget() {
  mirror?.then((fs) => fs.close?.(), () => {})
  observer?.disconnect()
  mirror = observer = null
  await Promise.all([BASE, BASE.slice(0, -5)].map((path) => app.fs.remove(path)))
}

async function allow() {
  const { folder } = state.peek()
  if (folder && (await allowed(folder, true))) await round()
}

// The desktop app's host opens the system's file manager. A page can't: its file picker, opened in the folder, shows what it holds, and what is picked changes nothing.
/** @param {Folder} folder */
const reveal = (folder) => (typeof folder === 'string' ? showFolder(folder) : /** @type {any} */ (window).showOpenFilePicker({ startIn: folder })).catch(() => {})

/** How Sync stands, its row's line in Your data and its page's: the folder and when it was last in step, or that it can't go on. */
function line() {
  const { folder, status, at } = state.value
  return !folder ? t('sync.off') : t(status === 'waiting' ? 'sync.waiting' : status === 'failed' ? 'sync.failed' : at ? 'sync.done' : 'sync.syncing', { folder: nameOf(folder), when: at ? relativeTime(at) : '' })
}

/** Sync's page in Your data: how to set it up, or Sync now, the folder to show and Stop syncing. */
function page() {
  const { folder: chosen, status } = state.value
  return !chosen ? html`<p>${t('sync.text')}</p><div class="row"><button class="button" @click=${choose}>${icons.folder} ${t('sync.choose')}</button></div>` : html`<div class="row">
    <button class="button" ?disabled=${status === 'syncing'} @click=${status === 'waiting' ? allow : round}>${icons.sync} ${t(status === 'waiting' ? 'sync.allow' : 'sync.now')}</button>
    <button class="button subtle" @click=${() => reveal(chosen)}>${icons.folder} ${t('sync.show', { folder: nameOf(chosen) })}</button>
    <button class="button subtle" @click=${stop}>${t('sync.stop')}</button></div>`
}

/** Whether the folder chosen can't be synced with until the user acts. */
const stuck = () => !!state.value.folder && ['waiting', 'failed'].includes(state.value.status)

// A copy the user keeps, in Your data; what keeps it from syncing is the section's line, with what lets it go on, and once a round was in
// step, that the user's things are safe in the folder; on the map, the folder chosen, moving once in step.
register({ id: 'sync', waiting: () => !state.value.folder, slots: { data: { id: 'sync', at: 1, group: 'copies', icon: icons.sync, label: 'cap.sync.name', text: line, draw: page,
  say: () => (stuck() ? line() : undefined),
  fix: () => (stuck() ? html`<button class="button primary" @click=${state.value.status === 'waiting' ? allow : round}>${icons.sync} ${t(state.value.status === 'waiting' ? 'sync.allow' : 'sync.now')}</button>` : undefined),
  node: () => (state.value.folder ? /** @type {import('../../ui/map.js').Place} */ ({ side: 'start', icon: icons.folder, name: t('cap.sync.name'), sub: nameOf(state.value.folder),
    state: stuck() ? 'wait' : state.value.at ? 'ok' : 'off', flow: Boolean(state.value.at) && !stuck() }) : undefined),
  copy: () => (state.value.folder && state.value.at && !stuck() ? t('sync.safe', { folder: nameOf(state.value.folder) }) : undefined) } } })

// The folder chosen on an earlier visit: synced now, or once the user lets the browser open it again.
const kept = await stored('readonly', (store) => store.get('folder'))
if (kept) {
  state.value = { folder: kept, status: 'syncing' }
  if (!(await allowed(kept))) {
    state.value = { folder: kept, status: 'waiting' }
    notify(t('sync.waiting', { folder: nameOf(kept) }), { label: t('sync.allow'), run: allow })
  }
}
rounds({ carry: carried, run })
