// A score's sound (D338), made in a worker so the page stays smooth while it is (./sound.js). A new
// request stops the one before.
import { render } from './sound.js'

let latest = 0

self.onmessage = ({ data }) => {
  latest = data.id
  const post = (/** @type {Record<string, any>} */ message, /** @type {Transferable[]} */ transfer = []) => self.postMessage({ id: data.id, ...message }, transfer)
  render(data, post, () => latest !== data.id)
    .then(() => post({ type: 'done' }), (error) => post({ type: 'error', message: error instanceof Error ? error.message : String(error) }))
}
