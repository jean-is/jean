// The desktop app's host (D155, D169): Neutralino, which serves Jean on 127.0.0.1, answers the calls
// its configuration allows: the system's dialog for a folder, a folder opened in the system's file
// manager, and the files there. Its key comes once per launch, to the first page that asks: Jean asks
// as it opens, before any other page could, and keeps it in the tab's session for a reload. A page
// served from anywhere else has no host and asks nothing.
import { normalizeDir, normalizePath } from '../core/fs.js'

/** @type {Promise<{ os: string, port: string, token: string } | null>} */
export const host = globalThis.location?.hostname !== '127.0.0.1' ? Promise.resolve(null)
  : fetch('__neutralino_globals.js', { cache: 'no-store' }).then((response) => (response.ok ? response.text() : ''), () => '').then((text) => {
    const value = (/** @type {string} */ name) => new RegExp(`var ${name}='?([^';]*)`).exec(text)?.[1] ?? ''
    const token = value('NL_TOKEN') || sessionStorage.getItem('app.host')
    if (token) sessionStorage.setItem('app.host', token)
    return token ? { os: value('NL_OS'), port: value('NL_PORT'), token } : null
  })

let socket = /** @type {Promise<WebSocket> | null} */ (null)
const waiting = /** @type {Map<string, { resolve: (value: any) => void, reject: (error: Error) => void }>} */ (new Map())

/** A call to the host, answered with what it returns, or refused with its code as the error's name. @param {string} method @param {object} data @returns {Promise<any>} */
export async function call(method, data) {
  const known = await host
  if (!known) throw new Error('No host')
  const ws = await (socket ??= new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${known.port}?connectToken=${known.token.split('.')[1]}`)
    ws.onopen = () => resolve(ws)
    ws.onmessage = ({ data }) => {
      const { id, data: answer } = JSON.parse(data), request = waiting.get(id)
      waiting.delete(id)
      if (answer?.error) request?.reject(Object.assign(new Error(answer.error.message), { name: answer.error.code }))
      else request?.resolve(answer?.returnValue)
    }
    ws.onclose = () => {
      socket = null
      for (const request of [...waiting.values(), { reject }]) request.reject(new Error('The host closed'))
      waiting.clear()
    }
  }))
  const id = crypto.randomUUID()
  ws.send(JSON.stringify({ id, method, accessToken: known.token, data }))
  return new Promise((resolve, reject) => waiting.set(id, { resolve, reject }))
}

/** The system's dialog for a folder: its path; closed without one, an AbortError, as from the page's picker. @param {string} title @returns {Promise<string>} */
export const pickFolder = (title) => call('os.showFolderDialog', { title }).then((path) => path || Promise.reject(new DOMException('No folder', 'AbortError')))
/** A folder opened in the system's file manager: Windows takes its path, the others a file: address, which holds nothing their shell would read. @param {string} path */
export const showFolder = async (path) => call('os.open', { url: (await host)?.os === 'Windows' ? path.replaceAll('/', '\\') : `file://${path.split('/').map(encodeURIComponent).join('/')}` })

/** A folder of the computer's, by its path, as an FS; bytes go to the host and back as base64. @param {string} root @returns {import('../core/types.js').FS} */
export function hostFS(root) {
  const at = (/** @type {string} */ path) => (path ? `${root.replace(/\/$/, '')}/${path}` : root)
  const stats = (/** @type {string} */ path) => call('filesystem.getStats', { path: at(path) }).catch((error) => (error.name === 'NE_FS_NOPATHE' ? null : Promise.reject(error)))
  const read = async (/** @type {string} */ path) => ((await stats(path = normalizePath(path)))?.isFile ? Uint8Array.from(atob(await call('filesystem.readBinaryFile', { path: at(path) })), (c) => c.charCodeAt(0)) : null)
  /** @param {string} path @param {Uint8Array} bytes */
  const write = async (path, bytes) => {
    path = normalizePath(path)
    let text = ''
    for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
    const put = () => call('filesystem.writeBinaryFile', { path: at(path), data: btoa(text) })
    // Its folder is made when the first write there fails.
    await put().catch(async (error) => {
      if (!path.includes('/')) throw error
      await call('filesystem.createDirectory', { path: at(path.slice(0, path.lastIndexOf('/'))) })
      await put()
    })
  }
  return {
    read: async (path) => { const bytes = await read(path); return bytes && new TextDecoder().decode(bytes) },
    readBytes: read,
    write: (path, text) => write(path, new TextEncoder().encode(text)),
    writeBytes: write,
    append: async (path, text) => write(path, new TextEncoder().encode(new TextDecoder().decode((await read(path)) ?? new Uint8Array()) + text)),
    list: async (dir) => ((await stats(dir = normalizeDir(dir)))?.isDirectory ? /** @type {{ entry: string, type: string }[]} */ (await call('filesystem.readDirectory', { path: at(dir) }))
      .map(({ entry, type }) => ({ name: entry, kind: type === 'DIRECTORY' ? /** @type {const} */ ('directory') : /** @type {const} */ ('file') })).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) : []),
    remove: async (path) => { if (await stats(path = normalizePath(path))) await call('filesystem.remove', { path: at(path) }) },
    exists: async (path) => !!(await stats(normalizePath(path))),
    stat: async (path) => { const found = await stats(normalizePath(path)); return found?.isFile ? { size: found.size, lastModified: found.modifiedAt } : null },
  }
}
