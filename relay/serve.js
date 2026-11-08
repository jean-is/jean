// Runs the relay (relay.js, D45 · D226) on Node 22 or later, with nothing to install:
//   RELAY_CONFIG='{"origins":["https://jean.example"]}' node relay/serve.js
// PORT (8791 by default) and HOST (127.0.0.1; 0.0.0.0 to answer other machines) say where it listens,
// RELAY_DIR (./mailboxes by default) where it keeps mailboxes and the records of changes, and
// RELAY_PROXIED=1 takes the address from the proxy in front, as the share host does (host/serve.js).
// Its config may name `recordKey`, a public P-256 key (JWK), to which each record is sealed, as the
// share host's are: `node host/serve.js keys` makes a pair, and `node host/serve.js open` reads them.
import { createServer } from 'node:http'
import { appendFile, mkdir, readdir, readFile, rename, rm, statfs, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { listener, sealRecord, stopping } from '../host/serve.js'
import { relay, LIMITS } from './relay.js'

const DAY = 86_400_000

/**
 * A folder as the relay's store: each mailbox's file, its messages in a folder beside it, and a file of
 * records a day, sealed when there is a key. Once a day, what is past its time goes: a message past its
 * days, a mailbox nobody opened or read for its idle days, a record past a year.
 * @param {string} dir @param {CryptoKey | null} recordKey
 * @returns {import('./relay.js').Store & { free(): Promise<number>, sweep(tidy: (id: string, at: number) => Promise<void>, now?: number): Promise<void> }}
 */
export function folder(dir, recordKey) {
  const boxes = join(dir, 'boxes')
  const records = join(dir, 'records')
  /** @param {string} id */
  const at = (id) => join(boxes, id)
  /** @param {string} path */
  const json = (path) => readFile(path, 'utf8').then(JSON.parse, () => null)
  /** @param {string} path @param {string | Uint8Array} data */
  const write = async (path, data) => { await writeFile(`${path}.part`, data); await rename(`${path}.part`, path) }
  return {
    box: (id) => json(`${at(id)}.json`),
    async save(id, box) {
      await mkdir(boxes, { recursive: true })
      await write(`${at(id)}.json`, JSON.stringify(box))
    },
    async add(id, seq, body) {
      await mkdir(at(id), { recursive: true })
      await write(join(at(id), String(seq)), body)
    },
    read: (id, seq) => readFile(join(at(id), String(seq))).then((bytes) => new Uint8Array(bytes), () => null),
    async drop(id, seqs) { for (const seq of seqs) await rm(join(at(id), String(seq)), { force: true }) },
    async remove(id) {
      await rm(at(id), { recursive: true, force: true })
      await rm(`${at(id)}.json`, { force: true })
    },
    async record(text) {
      await mkdir(records, { recursive: true })
      await appendFile(join(records, `${new Date().toISOString().slice(0, 10)}.log`), `${recordKey ? await sealRecord(text, recordKey) : text}\n`)
    },
    async free() {
      await mkdir(dir, { recursive: true })
      const { bavail, bsize } = await statfs(dir)
      return bavail * bsize
    },
    // Each mailbox tidied in its turn (relay.js), so that a read or a message meanwhile is never undone.
    async sweep(tidy, now = Date.now()) {
      for (const name of await readdir(boxes).catch(() => [])) if (name.endsWith('.json')) await tidy(name.slice(0, -5), now)
      for (const name of await readdir(records).catch(() => [])) if (Date.parse(name.slice(0, 10)) + 366 * DAY < now) await rm(join(records, name), { force: true })
    },
  }
}

/** @param {string[]} args */
export async function main(args = []) {
  if (args.length) throw new Error('node relay/serve.js takes no command; node host/serve.js keys makes a pair for the records, and open reads them')
  const config = JSON.parse(process.env.RELAY_CONFIG ?? '{}')
  const dir = process.env.RELAY_DIR ?? 'mailboxes'
  const recordKey = config.recordKey ? await crypto.subtle.importKey('jwk', config.recordKey, { name: 'ECDH', namedCurve: 'P-256' }, false, []) : null
  const limits = { ...LIMITS, ...config.limits }
  const store = folder(dir, recordKey)
  const PORT = Number(process.env.PORT) || 8791
  const HOST = process.env.HOST ?? '127.0.0.1'
  const handle = relay({ origins: config.origins, limits, store })
  await store.sweep(handle.tidy)
  setInterval(() => store.sweep(handle.tidy).catch(console.error), DAY).unref()
  stopping(createServer(listener(handle, process.env.RELAY_PROXIED === '1')))
    .listen(PORT, HOST, () => console.log(`Relay on http://${HOST}:${PORT}/, keeping mailboxes in ${dir}`))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main(process.argv.slice(2))
