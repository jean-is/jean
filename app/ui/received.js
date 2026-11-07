// What another app gave Jean (D714): a share, which the service worker holds in its memory until asked for it by its id in
// the address (Web Share Target), or files the system opened with Jean once installed (File Handling). Its words go in the
// box, to send or not, and its files are shared as dropped ones: nothing is sent before the person sends it.
import { app } from './state.js'
import { unlock } from './caps.js'

/** Files, as if dropped in the box. @param {File[]} files */
async function share(files) {
  if (files.length && (await unlock('files'))) await (await import('../caps/files/files.js')).addFiles(files)
}

/** A share the worker holds, its id then gone from the address; nothing after three seconds, which a worker stopped meanwhile lost. @param {string} id */
export async function received(id) {
  history.replaceState(history.state, '', location.pathname + location.hash)
  const worker = (await navigator.serviceWorker?.ready)?.active
  const channel = new MessageChannel()
  const data = /** @type {{ title: string, text: string, url: string, files: File[] } | null} */ (await new Promise((resolve) => {
    channel.port1.onmessage = ({ data: given }) => resolve(given)
    worker?.postMessage({ type: 'SHARED', id }, [channel.port2])
    setTimeout(() => resolve(null), 3000)
  }))
  if (!data) return
  const words = [data.title, data.text, data.url && !data.text.includes(data.url) ? data.url : ''].filter(Boolean).join('\n')
  if (words) app.draft.value = [app.draft.value, words].filter(Boolean).join('\n')
  await share(data.files)
}

/** Files the system opened with Jean. @param {FileSystemFileHandle[]} handles */
export const opened = async (handles) => share(await Promise.all(handles.map((handle) => handle.getFile())))
