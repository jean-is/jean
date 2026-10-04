// Sync (D157): Jean's files mirrored into a folder of the user's that their cloud drive (OneDrive,
// Dropbox, iCloud Drive, Google Drive) keeps the same on their other computers, each computer's Jean
// syncing with it. Chrome and Edge open the folder in place, with Folders' access (D141): its handle
// is kept in IndexedDB, and the browser asks again once a visit unless allowed on every visit. A round
// runs as Jean opens, every minute while it is on screen, after each answer and as it goes out of
// sight, in one tab at a time (mirror.js does the work). What comes in shows where the user is.
import { html } from 'lit-html'
import { signal, effect } from '@preact/signals-core'
import { register, unlock } from '../../ui/caps.js'
import { app, notify, refreshProjects, refreshConversations } from '../../ui/state.js'
import { folderFS } from '../../ui/opfs.js'
import { icons } from '../../ui/icons.js'
import { loadConversation } from '../../core/conversations.js'
import { t, useStrings, relativeTime } from '../../core/i18n.js'
import { claim, syncRound, settleHomes, BASE } from './mirror.js'

await useStrings('sync')

/**
 * The folder Jean syncs with, if any, how it stands, and when it was last in step.
 * @type {import('@preact/signals-core').Signal<{ handle?: FileSystemDirectoryHandle, status: 'waiting' | 'syncing' | 'done' | 'failed', at?: number }>}
 */
const state = signal({ status: 'done' })
/** @type {Promise<import('../../core/types.js').FS & { close: () => void }> | null} */
let mirror = null

// The folder's handle can't be kept in a file: IndexedDB keeps it, never in a backup or a sync.
/** @type {Promise<IDBDatabase | null>} */
const database = new Promise((resolve) => {
  if (!globalThis.indexedDB) return resolve(null)
  const request = indexedDB.open('app-sync', 1)
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

/** Whether the browser lets Jean open the folder, asking when `ask` (it needs the user's click just before). @param {FileSystemDirectoryHandle} handle */
const allowed = (handle, ask = false) => /** @type {any} */ (handle)[ask ? 'requestPermission' : 'queryPermission']({ mode: 'readwrite' }).then((/** @type {string} */ answer) => answer === 'granted', () => false)

/** One round, unless another tab is having one. */
async function round() {
  const { handle, at } = state.peek()
  if (!handle) return
  if (!(await allowed(handle))) return void (state.value = { handle, status: 'waiting', at })
  await navigator.locks.request('app-sync', { ifAvailable: true }, async (lock) => {
    if (!lock || handle !== state.peek().handle) return
    state.value = { handle, status: 'syncing', at }
    try {
      const fs = await (mirror ??= folderFS(handle))
      if (!(await claim(fs, { by: app.deviceId }))) throw new Error('Not a folder Jean syncs with')
      const came = await syncRound(app.fs, fs, { busy: (path) => app.running.peek().includes(path) })
      if (came.length) await show(came)
      if (handle === state.peek().handle) state.value = { handle, status: 'done', at: Date.now() }
    } catch (error) {
      console.warn('Sync', error)
      if (handle === state.peek().handle) state.value = { handle, status: 'failed', at }
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
  const current = app.current.peek()
  if (!current || !came.includes(current.path) || app.running.peek().includes(current.path)) return
  const loaded = await loadConversation(app.fs, current.path).catch(() => null)
  if (loaded && app.current.peek() === current) app.current.value = { ...current, records: loaded.records }
}

/** The user picks the folder: an empty one, or the one they sync with on another computer. */
export async function choose() {
  /** @type {FileSystemDirectoryHandle} */
  let handle
  try {
    handle = await /** @type {any} */ (window).showDirectoryPicker({ id: 'sync', mode: 'readwrite', startIn: 'documents' })
  } catch (error) {
    if (/** @type {any} */ (error)?.name !== 'AbortError') console.warn('Sync', error)
    return
  }
  const fs = await folderFS(handle)
  if (!(await claim(fs, { by: app.deviceId }).catch(() => false))) {
    fs.close()
    return notify(t('sync.refused', { folder: handle.name }))
  }
  await forget()
  mirror = Promise.resolve(fs)
  await stored('readwrite', (store) => store.put(handle, 'folder'))
  state.value = { handle, status: 'syncing' }
  notify(t('sync.syncing', { folder: handle.name }))
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
  mirror?.then((fs) => fs.close(), () => {})
  mirror = null
  await app.fs.remove(BASE)
}

async function allow() {
  const { handle } = state.peek()
  if (handle && (await allowed(handle, true))) await round()
}

/** Sync's part of Settings' Your data. */
function panel() {
  const { handle, status, at } = state.value
  const folder = handle?.name ?? ''
  const said = !handle ? t('sync.text')
    : status === 'waiting' ? t('sync.waiting', { folder }) : status === 'failed' ? t('sync.failed', { folder })
    : at ? t('sync.done', { folder, when: relativeTime(at) }) : t('sync.syncing', { folder })
  return html`<section class="sync">
    <h3>${t('cap.sync.name')}</h3>
    <p class="muted">${said}</p>
    <div class="row">${!handle ? html`<button class="button" @click=${choose}>${icons.folder} ${t('sync.choose')}</button>` : html`
      <button class="button" ?disabled=${status === 'syncing'} @click=${status === 'waiting' ? allow : round}>${icons.sync} ${t(status === 'waiting' ? 'sync.allow' : 'sync.now')}</button>
      <button class="button subtle" @click=${stop}>${t('sync.stop')}</button>`}</div>
  </section>`
}

register({ id: 'sync', panel })

// The folder chosen on an earlier visit: synced now, or once the user lets the browser open it again.
const kept = await stored('readonly', (store) => store.get('folder'))
if (kept) {
  state.value = { handle: kept, status: 'syncing' }
  if (!(await allowed(kept))) {
    state.value = { handle: kept, status: 'waiting' }
    notify(t('sync.waiting', { folder: kept.name }), { label: t('sync.allow'), run: allow })
  }
}
setInterval(() => document.visibilityState === 'visible' && round(), 60_000)
// Going out of sight sends what was done; coming back brings what the other computers did.
document.addEventListener('visibilitychange', () => round())
effect(() => {
  if (!app.running.value.length) setTimeout(round, 2000)
})
