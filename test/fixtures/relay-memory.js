// A relay's backend in memory, its mailboxes as nothing and its stores whole (relay/store.js), with what it recorded: for the tests
// of the relay's store and of the store as an FS (app/caps/devices/store-fs.js).
/** A backend in memory, mailboxes and stores, with what it recorded. */
export function memory() {
  /** @type {Map<string, any>} */
  const metas = new Map()
  /** @type {Map<string, Map<string, any>>} */
  const objects = new Map()
  /** @type {Map<string, Map<string, { bytes: Uint8Array, at: number }>>} */
  const parts = new Map()
  /** @type {string[]} */
  const records = []
  const of = (/** @type {Map<string, Map<string, any>>} */ map, /** @type {string} */ sid) => map.get(sid) ?? map.set(sid, new Map()).get(sid)
  const backend = {
    room: Infinity, at: 0, counted: /** @type {Record<string, any>} */ ({}),
    box: async () => null, save: async () => {}, add: async () => {}, read: async () => null, drop: async () => {}, remove: async () => {},
    record: async (/** @type {string} */ text) => { records.push(text) },
    async free() { return this.room },
    store: async (/** @type {string} */ sid) => structuredClone(metas.get(sid) ?? null),
    saveStore: async (/** @type {string} */ sid, /** @type {any} */ meta) => { metas.set(sid, structuredClone(meta)) },
    removeStore: async (/** @type {string} */ sid) => { metas.delete(sid); objects.delete(sid); parts.delete(sid) },
    stores: async () => [...metas.keys()],
    objects: async (/** @type {string} */ sid) => Object.fromEntries(structuredClone([...of(objects, sid)])),
    saveObject: async (/** @type {string} */ sid, /** @type {string} */ oid, /** @type {any} */ version) => { of(objects, sid).set(oid, structuredClone(version)) },
    dropObject: async (/** @type {string} */ sid, /** @type {string} */ oid) => { of(objects, sid).delete(oid) },
    part: async (/** @type {string} */ sid, /** @type {string} */ hash) => of(parts, sid).get(hash)?.bytes ?? null,
    hasPart: async (/** @type {string} */ sid, /** @type {string} */ hash) => of(parts, sid).has(hash),
    async addPart(/** @type {string} */ sid, /** @type {string} */ hash, /** @type {Uint8Array} */ bytes) { of(parts, sid).set(hash, { bytes, at: this.at }) },
    parts: async (/** @type {string} */ sid) => [...of(parts, sid)].map(([hash, one]) => ({ hash, size: one.bytes.length, at: one.at })),
    dropPart: async (/** @type {string} */ sid, /** @type {string} */ hash) => { of(parts, sid).delete(hash) },
    async counts() { return structuredClone(this.counted) },
    async saveCounts(/** @type {any} */ counts) { this.counted = structuredClone(counts) },
  }
  return { backend, metas, objects, parts, records }
}
