// SPDX-License-Identifier: MIT
// Notices of what is coming up (caps/notifications fetches this once Tables or Documents is found): as Jean opens, as the project changes and each hour
// while it is open, each of the project's collections with a date is read, and a row due within the days its collection asks (./how.js) is told once
// for its day: the browser says the collection's name, the row's and how far its day is, nothing else of it; a click opens the collection. Each of its
// documents is read too, and an open task with a day that names the person, by the name they go by there (the `names` slot's, else their own), or no one,
// is told once on its day, by the document's name and the task's words; a click opens the document at it (D774). Only where the browser allows notices
// and the person left them on. What was told is kept on this device, in .cache/, so each device tells.
import { effect, computed } from '@preact/signals-core'
import { t, useStrings, intlLocales, locale, dir as direction } from '../../core/i18n.js'
import { parseFrontMatter } from '../../core/settings.js'
import { app, effective } from '../../ui/state.js'
import { loaded, slots } from '../../ui/caps.js'
import { coming, owed, keyOf, dayOf, datesOf, todos } from './due.js'
import { readHow } from './how.js'

await useStrings('soon')

/** @param {string} tag @param {string} title @param {string} body @param {() => unknown} open what a click opens, in the project it came from */
function tell(tag, title, body, open, dir = app.projectDir) {
  const options = { body, tag: `soon ${tag} ${body}`, lang: locale.peek(), dir: direction(), icon: 'icons/icon-192.png' }
  try {
    const item = new Notification(title, options)
    item.onclick = () => { focus(); item.close(); if (app.projectDir === dir) open() }
  } catch {
    // Android's browsers show one only through the service worker (sw.js).
    navigator.serviceWorker?.ready.then((registration) => registration.showNotification(title, options)).catch(console.warn)
  }
}

let checking = false
/** Each collection and document of the project read, and what is owed told; how many were. */
export async function check() {
  if (checking || Notification.permission !== 'granted' || app.settings.peek().notifications === false) return 0
  checking = true
  try {
    const dir = app.projectDir, at = `${dir}/.cache/soon.json`, today = dayOf(new Date()), far = new Intl.RelativeTimeFormat(intlLocales(), { numeric: 'auto' })
    const told = new Set(/** @type {string[]} */ (JSON.parse((await app.fs.read(at).catch(() => null)) ?? '[]'))), still = /** @type {string[]} */ ([])
    let count = 0
    /** What is owed of a thing's `dues` told, `before` days ahead; what was told of them kept. @param {string} place @param {string} title @param {import('./due.js').Due[]} dues @param {number} before @param {(due: any) => unknown} open */
    const owe = (place, title, dues, before, open) => {
      const mine = new Set(dues.map(keyOf).filter((key) => told.has(`${place} ${key}`)))
      for (const due of before < 0 ? [] : owed(dues, before, mine)) { tell(place, title, t('soon.notice', { name: due.name, when: far.format(due.away, 'day') }), () => open(due), dir); mine.add(keyOf(due)); count++ }
      still.push(...[...mine].map((key) => `${place} ${key}`))
    }
    const tables = loaded.peek().has('tables') ? await import('../tables/tables.js') : null
    for (const { folder } of (await tables?.collections(dir)) ?? []) {
      const one = await tables?.load(folder, dir).catch(() => null)
      if (!one || one.table.kind || !datesOf(one.table).length) continue
      const how = await readHow(dir, one.folder)
      owe(one.folder, one.table.name, coming(one.table, one.rows, { today, column: how.column }), how.before, () => import('../../ui/preview.js').then(({ preview }) => preview({ uri: one.folder, name: one.table.name, title: one.table.name })))
    }
    for (const { kind, name } of loaded.peek().has('documents') ? await app.fs.list(`${dir}/documents`) : []) {
      const path = `documents/${name}`, read = kind === 'file' && name.endsWith('.md') ? parseFrontMatter((await app.fs.read(`${dir}/${path}`)) ?? '') : null
      const me = slots('names').map((part) => part.me?.(path)).find(Boolean) ?? effective.peek().settings.name ?? ''
      if (read) owe(path, String(read.data.name ?? /^# +(.*\S)/.exec(read.body)?.[1] ?? name), todos(read.body, { today, me }), 0, (/** @type {{ day: string, nth: number }} */ due) => import('../documents/documents.js').then(({ openAt }) => openAt(path, due.day, due.nth)))
    }
    // Only what is still coming is kept, so the file never grows.
    if (app.projectDir === dir && (count || still.length !== told.size)) await app.fs.write(at, JSON.stringify(still))
    return count
  } catch (error) { console.warn(error); return 0 } finally { checking = false }
}

// Again for another project only, whatever else of it changes.
const place = computed(() => app.project.value?.dir)
effect(() => { void place.value; check() })
setInterval(check, 3_600_000)
