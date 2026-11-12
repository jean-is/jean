// SPDX-License-Identifier: MIT
// A store of IndexedDB's, one per profile and name, for what no file can hold: a folder's handle, which a path on this
// computer can't stand for. It is never in a backup or a sync. Without IndexedDB (some private windows), nothing is kept.
import { mine } from './opfs.js'

/** What an act on the store `name` answers once what it changed is written for good; undefined when nothing is kept. @param {string} name */
export function keptIn(name) {
  /** @type {Promise<IDBDatabase | null>} */
  const database = new Promise((resolve) => {
    if (!globalThis.indexedDB) return resolve(null)
    const request = indexedDB.open(mine(`app-${name}`), 1)
    request.onupgradeneeded = () => request.result.createObjectStore(name)
    request.onerror = () => resolve(null)
    request.onsuccess = () => resolve(request.result)
  })
  /** @template T @param {IDBTransactionMode} mode @param {(store: IDBObjectStore) => IDBRequest<T>} act @returns {Promise<T | undefined>} */
  return async (mode, act) => {
    const db = await database
    return db ? new Promise((resolve) => {
      const transaction = db.transaction(name, mode)
      const request = act(transaction.objectStore(name))
      transaction.oncomplete = () => resolve(request.result)
      transaction.onerror = transaction.onabort = () => resolve(undefined)
    }) : undefined
  }
}
