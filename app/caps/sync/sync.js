// Sync (D157): Jean's files mirrored into a folder of the user's that their cloud drive (OneDrive,
// Dropbox, iCloud Drive, Google Drive) keeps the same on their other computers, each computer's Jean
// syncing with it. Chrome and Edge open the folder in place, with Folders' access (D141): its handle is kept
// in IndexedDB, and the browser asks again once a visit unless allowed on every visit. The desktop app picks
// it with the system's dialog and keeps its path, which its host works in (D169). A round runs as Jean opens,
// every minute while it is on screen, after each answer and as it goes out of sight, in one tab at a time
// (mirror.js does the work). What comes in shows where the user is.
import { html } from 'lit-html'
import { signal, effect } from '@preact/signals-core'
import { register, unlock, loaded as capabilities } from '../../ui/caps.js'
import { app, notify, refreshProjects, refreshConversations } from '../../ui/state.js'
import { folderFS, mine } from '../../ui/opfs.js'
import { host, pickFolder, showFolder, hostFS } from '../../ui/host.js'
import { icons } from '../../ui/menu-icons.js'
import { loadConversation } from '../../core/conversations.js'
import { t, useStrings, relativeTime } from '../../core/i18n.js'
import { claim, syncRound, settleHomes, BASE } from './mirror.js'

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

// The folder can't be kept in a file (a handle can't, a path is this computer's): IndexedDB keeps it, never in a backup or a sync.
/** @type {Promise<IDBDatabase | null>} */
const database = new Promise((resolve) => {
  if (!globalThis.indexedDB) return resolve(null)
  const request = indexedDB.open(mine('app-sync'), 1)
  request.onupgradeneeded = () => request.result.createObjectStore('sync')
  request.onerror = () => resolve(null)
  request.onsuccess = () => resolve(request.result)
})
/** @param {IDBTransactionMode} mode @param {(store: IDBObjectStore) => IDBRequest} act @returns {Promise<any>} */
async function stored(mode, act) {
  const db = await database
  return db && new Promise((resolve) => {
    const transaction = db.transaction('sync', mode)
    const request = act(transaction.objectStore('sync'))
    transaction.oncomplete = () => resolve(request.result)
    transaction.onerror = transaction.onabort = () => resolve(undefined)
  })
}

/** Whether the browser lets Jean open the folder, asking when `ask` (it needs the user's click just before); the host always does. @param {Folder} folder */
const allowed = async (folder, ask = false) => typeof folder === 'string' || /** @type {any} */ (folder)[ask ? 'requestPermission' : 'queryPermission']({ mode: 'readwrite' }).then((/** @type {string} */ answer) => answer === 'granted', () => false)

/** One round, unless another tab is having one. */
async function round() {
  const { folder, at } = state.peek()
  if (!folder) return
  if (!(await allowed(folder))) return void (state.value = { folder, status: 'waiting', at })
  await navigator.locks.request(mine('app-sync'), { ifAvailable: true }, async (lock) => {
    if (!lock || folder !== state.peek().folder) return
    state.value = { folder, status: 'syncing', at }
    try {
      const fs = await (mirror ??= typeof folder === 'string' ? Promise.resolve(hostFS(folder)) : folderFS(folder))
      if (!(await claim(fs, { by: app.deviceId }))) throw new Error('Not a folder Jean syncs with')
      const came = await syncRound(app.fs, fs, { busy: (path) => app.running.peek().includes(path) })
      if (came.length) await show(came)
      if (folder === state.peek().folder) state.value = { folder, status: 'done', at: Date.now() }
    } catch (error) {
      console.warn('Sync', error)
      if (folder === state.peek().folder) state.value = { folder, status: 'failed', at }
    }
  })
}

/**
 * What came in shows: the projects (and Projects, Memory and Skills when what they keep came), the
 * room's conversations, and the one on screen unless it is being answered. @param {string[]} came
 */
async function show(came) {
  await settleHomes(app.fs)
  await refreshProjects()
  const home = app.projects.value.find((project) => project.data.default === true)
  if (home && !app.projects.value.some((project) => project.dir === app.projectDir)) app.project.value = home
  await refreshConversations()
  if (app.projects.value.some((project) => !project.data.default)) unlock('projects')
  if (came.some((path) => path.endsWith('memory.md'))) unlock('memory')
  if (came.some((path) => /(^|\/)skills\//.test(path))) unlock('skills')
  // Collections changed on the other computer, read again wherever they are drawn: a view, a document, a page's parts (D633).
  if (capabilities.peek().has('tables') && came.some((path) => path.includes('/collections/'))) await (await import('../tables/tables.js')).came(came)
  const current = app.current.peek()
  if (!current || !came.includes(current.path) || app.running.peek().includes(current.path)) return
  const loaded = await loadConversation(app.fs, current.path).catch(() => null)
  if (loaded && app.current.peek() === current) app.current.value = { ...current, records: loaded.records }
}

/** The user picks the folder: an empty one, or the one they sync with on another computer. */
export async function choose() {
  /** @type {Folder} */
  let folder
  try {
    folder = (await host) ? await pickFolder(t('sync.choose')) : await /** @type {any} */ (window).showDirectoryPicker({ id: 'sync', mode: 'readwrite', startIn: 'documents' })
  } catch (error) {
    if (/** @type {any} */ (error)?.name !== 'AbortError') console.warn('Sync', error)
    return
  }
  const fs = typeof folder === 'string' ? hostFS(folder) : await folderFS(folder)
  if (!(await claim(fs, { by: app.deviceId }).catch(() => false))) {
    fs.close?.()
    return notify(t('sync.refused', { folder: nameOf(folder) }))
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

/** What Jean knew of the last folder: its FS and the base, so another folder starts from nothing known. */
async function forget() {
  mirror?.then((fs) => fs.close?.(), () => {})
  mirror = null
  await app.fs.remove(BASE)
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

/** Sync's page in Your data (D519): how to set it up, or Sync now, the folder to show and Stop syncing. */
function page() {
  const { folder: chosen, status } = state.value
  return !chosen ? html`<p>${t('sync.text')}</p><div class="row"><button class="button" @click=${choose}>${icons.folder} ${t('sync.choose')}</button></div>` : html`<div class="row">
    <button class="button" ?disabled=${status === 'syncing'} @click=${status === 'waiting' ? allow : round}>${icons.sync} ${t(status === 'waiting' ? 'sync.allow' : 'sync.now')}</button>
    <button class="button subtle" @click=${() => reveal(chosen)}>${icons.folder} ${t('sync.show', { folder: nameOf(chosen) })}</button>
    <button class="button subtle" @click=${stop}>${t('sync.stop')}</button></div>`
}

/** Whether the folder chosen can't be synced with until the user acts. */
const stuck = () => !!state.value.folder && ['waiting', 'failed'].includes(state.value.status)

// A copy the user keeps, in Your data; what keeps it from syncing is the section's line, and once a round was in step, that the user's things are safe in the folder.
register({ id: 'sync', waiting: () => !state.value.folder, slots: { data: { id: 'sync', at: 1, group: 'copies', icon: icons.sync, label: 'cap.sync.name', text: line, draw: page,
  say: () => (stuck() ? line() : undefined),
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
setInterval(() => document.visibilityState === 'visible' && round(), 60_000)
// Going out of sight sends what was done; coming back brings what the other computers did.
document.addEventListener('visibilitychange', () => round())
effect(() => {
  if (!app.running.value.length) setTimeout(round, 2000)
})
