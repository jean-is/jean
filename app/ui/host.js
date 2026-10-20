// The desktop app's host (D155, D169): Neutralino, which serves Jean on 127.0.0.1, answers the calls
// its configuration allows: the system's dialog for a folder, a folder opened in the system's file
// manager, the files there, how much memory the computer has, and the programs it runs, which list
// its network addresses (D260). Its key comes once per launch, to the first page that asks: Jean asks
// as it opens, before any other page could, and keeps it in the tab's session for a reload. A page
// served from anywhere else has no host and asks nothing.
import { normalizeDir, normalizePath } from '../core/fs.js'
import { encode, decode } from './seal.js'

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
/** Whoever listens to the host's events: what a program it started writes, and its end. */
const listeners = /** @type {Set<(event: string, data: any) => void>} */ (new Set())

/** A call to the host, answered with what it returns, or refused with its code as the error's name. @param {string} method @param {object} data @returns {Promise<any>} */
export async function call(method, data) {
  const known = await host
  if (!known) throw new Error('No host')
  const ws = await (socket ??= new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${known.port}?connectToken=${known.token.split('.')[1]}`)
    ws.onopen = () => resolve(ws)
    ws.onmessage = ({ data }) => {
      const { id, data: answer, event } = JSON.parse(data), request = waiting.get(id)
      if (event) for (const listener of listeners) listener(event, answer)
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

/** What a program writes, run through the system's shell as This computer's bridge is, once it ends. @param {string} command @returns {Promise<string>} */
async function output(command) {
  const written = /** @type {Record<number, string>} */ ({}), ended = new Set()
  let check = () => {}
  /** @type {(event: string, data: any) => void} */
  const listener = (event, { id, action, data } = {}) => {
    if (event !== 'spawnedProcess') return
    if (action === 'stdOut') written[id] = (written[id] ?? '') + data
    if (action === 'exit') ended.add(id)
    check()
  }
  listeners.add(listener)
  try {
    const { id } = await call('os.spawnProcess', { command })
    return await new Promise((resolve) => {
      check = () => ended.has(id) && resolve(written[id] ?? '')
      check()
    })
  } finally {
    listeners.delete(listener)
  }
}

/**
 * This computer's own network addresses (IPv4) in what ifconfig, ip or ipconfig lists: plain HTTP
 * reaches them as it reaches localhost, since a request to them never leaves the computer (D260).
 * @param {string} text
 */
export const addressesIn = (text) => [...new Set([...text.matchAll(/(?:\binet\s+(?:addr:)?|IPv4[^:\r\n]*:\s*)(\d{1,3}(?:\.\d{1,3}){3})\b/g)].map((match) => match[1]))].filter((address) => !address.startsWith('127.'))
/** This computer's own network addresses, as the system lists them within 2 s. @returns {Promise<string[]>} */
export const addresses = async () => addressesIn(await Promise.race([output((await host)?.os === 'Windows' ? 'ipconfig' : 'PATH=$PATH:/sbin:/usr/sbin; ifconfig 2>/dev/null || ip -o -4 addr show'),
  new Promise((resolve) => setTimeout(resolve, 2000, ''))]))
/** The system's dialog for a folder: its path; closed without one, an AbortError, as from the page's picker. @param {string} title @returns {Promise<string>} */
export const pickFolder = (title) => call('os.showFolderDialog', { title }).then((path) => path || Promise.reject(new DOMException('No folder', 'AbortError')))
/** This computer's memory, in bytes, as the system tells it (Settings › Computer, D176). @returns {Promise<number>} */
export const memoryTotal = () => call('computer.getMemoryInfo', {}).then((info) => info?.physical?.total ?? 0)
/** A folder opened in the system's file manager: Windows takes its path, the others a file: address, which holds nothing their shell would read. @param {string} path */
export const showFolder = async (path) => call('os.open', { url: (await host)?.os === 'Windows' ? path.replaceAll('/', '\\') : `file://${path.split('/').map(encodeURIComponent).join('/')}` })

/** A folder of the computer's, by its path, as an FS; bytes go to the host and back as base64. @param {string} root @returns {import('../core/types.js').FS} */
export function hostFS(root) {
  const at = (/** @type {string} */ path) => (path ? `${root.replace(/\/$/, '')}/${path}` : root)
  const stats = (/** @type {string} */ path) => call('filesystem.getStats', { path: at(path) }).catch((error) => (error.name === 'NE_FS_NOPATHE' ? null : Promise.reject(error)))
  const read = async (/** @type {string} */ path) => ((await stats(path = normalizePath(path)))?.isFile ? decode(await call('filesystem.readBinaryFile', { path: at(path) })) : null)
  /** @param {string} path @param {Uint8Array} bytes */
  const write = async (path, bytes) => {
    path = normalizePath(path)
    const put = () => call('filesystem.writeBinaryFile', { path: at(path), data: encode(bytes) })
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
