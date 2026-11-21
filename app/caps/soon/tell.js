// SPDX-License-Identifier: MIT
// Notices of what is coming up (caps/notifications fetches this once Tables is found): as Jean opens, as the project changes and each hour while it
// is open, each of the project's collections with a date is read, and a row due within the days its collection asks (./how.js) is told once
// for its day: the browser says the collection's name, the row's and how far its day is, nothing else of it; a click opens the collection.
// Only where the browser allows notices and the person left them on. What was told is kept on this device, in .cache/, so each device tells.
import { effect, computed } from '@preact/signals-core'
import { t, useStrings, intlLocales, locale, dir as direction } from '../../core/i18n.js'
import { app } from '../../ui/state.js'
import { coming, owed, keyOf, dayOf, datesOf } from './due.js'
import { readHow } from './how.js'

await useStrings('soon')

/** @param {string} folder @param {string} title the collection's name @param {string} body */
function tell(folder, title, body) {
  const options = { body, tag: `soon ${folder} ${body}`, lang: locale.peek(), dir: direction(), icon: 'icons/icon-192.png' }
  try {
    const item = new Notification(title, options)
    item.onclick = () => { focus(); item.close(); import('../../ui/preview.js').then(({ preview }) => preview({ uri: folder, name: title, title })) }
  } catch {
    // Android's browsers show one only through the service worker (sw.js).
    navigator.serviceWorker?.ready.then((registration) => registration.showNotification(title, options)).catch(console.warn)
  }
}

let checking = false
/** Each collection of the project read, and what is owed told; how many were. */
export async function check() {
  if (checking || Notification.permission !== 'granted' || app.settings.peek().notifications === false) return 0
  checking = true
  try {
    const tables = await import('../tables/tables.js'), dir = app.projectDir, at = `${dir}/.cache/soon.json`, today = dayOf(new Date()), far = new Intl.RelativeTimeFormat(intlLocales(), { numeric: 'auto' })
    const told = new Set(/** @type {string[]} */ (JSON.parse((await app.fs.read(at).catch(() => null)) ?? '[]'))), still = /** @type {string[]} */ ([])
    let count = 0
    for (const { folder } of await tables.collections(dir)) {
      const one = await tables.load(folder, dir).catch(() => null)
      if (!one || one.table.kind || !datesOf(one.table).length) continue
      const how = await readHow(dir, one.folder), dues = coming(one.table, one.rows, { today, column: how.column }), mine = new Set(dues.map(keyOf).filter((key) => told.has(`${one.folder} ${key}`)))
      for (const due of how.before < 0 ? [] : owed(dues, how.before, mine)) { tell(one.folder, one.table.name, t('soon.notice', { name: due.name, when: far.format(due.away, 'day') })); mine.add(keyOf(due)); count++ }
      still.push(...[...mine].map((key) => `${one.folder} ${key}`))
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
