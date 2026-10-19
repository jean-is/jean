// SPDX-FileCopyrightText: 2026 Warehouse SAS
// SPDX-License-Identifier: Elastic-2.0

// The EU's trusted lists for the check page and check_certificate (D439): read in a worker of their own
// (lists-worker.js), and kept in .cache/lists/ where Jean's files are at hand, in memory on the check page. A list
// read before a seal can't say what its authorities' statuses were then, so it is read again after one, and daily.
import { modelWorker } from '../ui/model.js'
import { readJSON, writeJSON } from '../core/fs.js'
import { anchorsAt } from './lists.js'

/** @typedef {{ read: string, services: import('./lists.js').Service[] }} Kept a list's authorities, and when it was read */

const DAY = 86_400_000
const worker = modelWorker(new URL('./lists-worker.js', import.meta.url), 'The trusted lists stopped being read.')
/** What was read in this page, by path. @type {Map<string, Kept>} */
const kept = new Map()

/**
 * The anchors that the EU's lists policy names give at a time, from the lists of a sealed certificate's territories:
 * their authorities granted then; `unread` when a list that may hold its authority couldn't be read or checked.
 * @param {{ lotl: string, signers: string[] }[]} lists @param {string[]} territories @param {Date} at
 * @param {{ fs?: import('../core/types.js').FS, gateway?: string }} where
 */
export async function anchorsFor(lists, territories, at, { fs, gateway }) {
  const anchors = []
  let unread = false
  for (const { lotl, signers } of lists) {
    // By the LOTL and its signers, so that lists a change of policy's no longer trusts aren't taken.
    const name = [...JSON.stringify([lotl, signers])].reduce((hash, char) => Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0, 2166136261).toString(36)
    const path = (/** @type {string} */ territory) => `.cache/lists/${name}/${territory}.json`
    /** @type {Map<string, Kept>} */
    const found = new Map()
    for (const territory of territories) {
      const one = kept.get(path(territory)) ?? (fs && /** @type {Kept | null} */ (await readJSON(fs, path(territory))))
      if (one && Date.parse(one.read) > Math.max(at.getTime(), Date.now() - DAY)) found.set(territory, one)
    }
    const missing = territories.filter((territory) => !found.has(territory))
    const read = new Date().toISOString()
    /** @type {Record<string, Kept['services'] | null>} */
    const got = missing.length ? (await worker.call({ lotl, signers, territories: missing, gateway }).catch((error) => (console.warn(lotl, error), { lists: {} }))).lists : {}
    for (const territory of missing) {
      const services = got[territory]
      if (!services) unread = true
      else {
        found.set(territory, { read, services })
        kept.set(path(territory), { read, services })
        if (fs) await writeJSON(fs, path(territory), { read, services }).catch(() => {})
      }
    }
    for (const { services } of found.values()) anchors.push(...anchorsAt(services, at))
  }
  return { anchors, unread }
}
