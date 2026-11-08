// Runs the relay (relay.js, D45 · D226) on Node 22 or later, with nothing to install:
//   RELAY_CONFIG='{"origins":["https://jean.example"]}' node relay/serve.js
// PORT (8791 by default) and HOST (127.0.0.1; 0.0.0.0 to answer other machines) say where it listens,
// RELAY_DIR (./mailboxes by default) where it keeps mailboxes, people's stores and the records of changes, and
// RELAY_PROXIED=1 takes the address from the proxy in front, as the share host does (host/serve.js).
// Its config may name `recordKey`, a public P-256 key (JWK), to which each record is sealed, as the
// share host's are: `node host/serve.js keys` makes a pair, and `node host/serve.js open` reads them.
// Where it lists the organisation's people (`issuers`, colleagues.js), `node relay/serve.js forget <account>`
// takes a leaver off the list at once, the relay running or not.
import { createServer } from 'node:http'
import { appendFile, mkdir, readdir, readFile, rename, rm, stat, statfs, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { listener, sealRecord, stopping } from '../host/serve.js'
import { relay, LIMITS } from './relay.js'

const DAY = 86_400_000

/**
 * A folder as the relay's store: each mailbox's file, its messages in a folder beside it; each person's store in a folder of its own,
 * its file, its objects' versions in o/ and its parts in b/; one file for each colleague listed, in people/, read again once the folder
 * changed; and a file of records a day, sealed when there is a key. Once a day, what is past its time goes: a message past its days, a
 * mailbox nobody opened or read for its idle days, what a store no longer keeps (store.js), a listing lapsed, a part's upload cut
 * short, a record past a year.
 * @param {string} dir @param {CryptoKey | null} recordKey
 * @returns {import('./relay.js').Store & import('./store.js').Backend & import('./colleagues.js').Backend & { free(): Promise<number>, forget(account: string): Promise<number>,
 *   sweep(handle: { tidy(id: string, at: number): Promise<void>, tidyStore?(sid: string, at: number): Promise<void>, tidyPeople?(at: number): Promise<void> }, now?: number): Promise<void> }}
 */
export function folder(dir, recordKey) {
  const boxes = join(dir, 'boxes')
  const records = join(dir, 'records')
  const shelf = join(dir, 'stores')
  const people = join(dir, 'people')
  /** The list as last read, and the folder's time then: a file written or removed, by the relay or by forget, changes it. */
  let listed = { at: -1, entries: /** @type {import('./colleagues.js').Entry[]} */ ([]) }
  /** @param {string} sid @param {string[]} rest */
  const of = (sid, ...rest) => join(shelf, sid, ...rest)
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
    store: (sid) => json(of(sid, 'store.json')),
    async saveStore(sid, meta) {
      await mkdir(of(sid), { recursive: true })
      await write(of(sid, 'store.json'), JSON.stringify(meta))
    },
    removeStore: (sid) => rm(of(sid), { recursive: true, force: true }),
    stores: async () => (await readdir(shelf).catch(() => [])).filter((name) => /^[\w-]{22}$/.test(name)),
    async objects(sid) {
      /** @type {Record<string, import('./store.js').Version>} */
      const out = {}
      for (const name of await readdir(of(sid, 'o')).catch(() => [])) if (name.endsWith('.json')) { const one = await json(of(sid, 'o', name)); if (one) out[name.slice(0, -5)] = one }
      return out
    },
    async saveObject(sid, oid, version) {
      await mkdir(of(sid, 'o'), { recursive: true })
      await write(of(sid, 'o', `${oid}.json`), JSON.stringify(version))
    },
    dropObject: (sid, oid) => rm(of(sid, 'o', `${oid}.json`), { force: true }),
    part: (sid, hash) => readFile(of(sid, 'b', hash)).then((bytes) => new Uint8Array(bytes), () => null),
    hasPart: (sid, hash) => stat(of(sid, 'b', hash)).then(() => true, () => false),
    // Each upload under a name of its own, so that two of the same part never write one file.
    async addPart(sid, hash, bytes) {
      await mkdir(of(sid, 'b'), { recursive: true })
      const part = of(sid, 'b', `${hash}.${randomUUID()}.part`)
      await writeFile(part, bytes)
      await rename(part, of(sid, 'b', hash))
    },
    async parts(sid) {
      const out = []
      for (const name of await readdir(of(sid, 'b')).catch(() => [])) {
        const info = await stat(of(sid, 'b', name)).catch(() => null)
        // An upload cut short, a day on.
        if (name.endsWith('.part')) { if (info && Date.now() - info.mtimeMs > DAY) await rm(of(sid, 'b', name), { force: true }) }
        else if (info) out.push({ hash: name, size: info.size, at: info.mtimeMs })
      }
      return out
    },
    dropPart: (sid, hash) => rm(of(sid, 'b', hash), { force: true }),
    async entries() {
      const at = (await stat(people).catch(() => null))?.mtimeMs ?? -1
      if (at !== listed.at) {
        const names = (await readdir(people).catch(() => [])).filter((name) => name.endsWith('.json'))
        listed = { at, entries: (await Promise.all(names.map((name) => json(join(people, name))))).filter(Boolean) }
      }
      return listed.entries
    },
    async saveEntry(entry) {
      await mkdir(people, { recursive: true })
      await write(join(people, `${entry.id}.json`), JSON.stringify(entry))
    },
    dropEntry: (id) => rm(join(people, `${id}.json`), { force: true }),
    async forget(account) {
      const gone = (await this.entries()).filter((entry) => entry.account.toLowerCase() === account.toLowerCase())
      for (const entry of gone) await this.dropEntry(entry.id)
      return gone.length
    },
    counts: () => json(join(dir, 'counts.json')).then((counts) => counts ?? {}),
    async saveCounts(counts) {
      await mkdir(dir, { recursive: true })
      await write(join(dir, 'counts.json'), JSON.stringify(counts))
    },
    // Each mailbox and store tidied in its turn (relay.js), so that a read or a message meanwhile is never undone.
    async sweep({ tidy, tidyStore, tidyPeople }, now = Date.now()) {
      for (const name of await readdir(boxes).catch(() => [])) if (name.endsWith('.json')) await tidy(name.slice(0, -5), now)
      if (tidyStore) for (const sid of await this.stores()) await tidyStore(sid, now)
      await tidyPeople?.(now)
      for (const name of await readdir(records).catch(() => [])) if (Date.parse(name.slice(0, 10)) + 366 * DAY < now) await rm(join(records, name), { force: true })
    },
  }
}

/** @param {string[]} args */
export async function main(args = []) {
  const config = JSON.parse(process.env.RELAY_CONFIG ?? '{}')
  const dir = process.env.RELAY_DIR ?? 'mailboxes'
  if (args[0] === 'forget' && args[1]) return console.log(`${await folder(dir, null).forget(args[1])} listing(s) of ${args[1]} taken off.`)
  if (args.length) throw new Error('node relay/serve.js takes one command, forget <account>; node host/serve.js keys makes a pair for the records, and open reads them')
  const recordKey = config.recordKey ? await crypto.subtle.importKey('jwk', config.recordKey, { name: 'ECDH', namedCurve: 'P-256' }, false, []) : null
  const limits = { ...LIMITS, ...config.limits }
  const store = folder(dir, recordKey)
  const PORT = Number(process.env.PORT) || 8791
  const HOST = process.env.HOST ?? '127.0.0.1'
  const handle = relay({ origins: config.origins, limits, stores: config.stores, issuers: config.issuers, store })
  // Answering first: a sweep through many stores could outlast the check that a new release answers.
  stopping(createServer(listener(handle, process.env.RELAY_PROXIED === '1')))
    .listen(PORT, HOST, () => console.log(`Relay on http://${HOST}:${PORT}/, keeping mailboxes${config.stores ? ', stores' : ''}${config.issuers?.length ? ', the organisation’s people' : ''} in ${dir}`))
  await store.sweep(handle)
  setInterval(() => store.sweep(handle).catch(console.error), DAY).unref()
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main(process.argv.slice(2))
