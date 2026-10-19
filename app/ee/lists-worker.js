// SPDX-FileCopyrightText: 2026 Warehouse SAS
// SPDX-License-Identifier: Elastic-2.0

// The EU's trusted lists, read off the page (D439): each from the browser where its host answers it, else through
// the gateway, then checked and summed up by lists.js. A worker, since a list can be megabytes of XML, and since
// the check page's own policy reaches Jean's files only, as its readers' workers do (D410).
import { listed } from './lists.js'

self.onmessage = async ({ data: { id, gateway, ...asked } }) => {
  /** @param {string} address */
  const read = async (address) => {
    const answer = await fetch(address).catch((error) => {
      if (!gateway) throw error
      const url = new URL(gateway)
      url.searchParams.set('url', address)
      return fetch(url)
    })
    if (!answer.ok) throw new Error(`${address}: HTTP ${answer.status}`)
    return answer.text()
  }
  try {
    self.postMessage({ id, type: 'done', ...await listed(asked, read) })
  } catch (error) {
    self.postMessage({ id, type: 'error', message: error instanceof Error ? error.message : String(error) })
  }
}
