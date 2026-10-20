// The seal on Jean's files at rest (docs/encryption.md): a header, then records of AES-256-GCM,
// each file's key derived from the vault key and the file's own salt, and the slots that keep the
// vault key sealed under this device's key, a passkey, a password or a recovery code. Web Crypto
// only, so the storage worker, the lock and node --test share it.

const MAGIC = [0x89, 0x73, 0x65, 0x61, 0x6c] // "\x89seal"
export const HEADER = 32
/** The most a record holds: a whole write is cut into records this long, so is a long append. */
export const RECORD = 64 * 1024
/** Where the slots are kept: the one file never sealed, since it opens the others. */
export const VAULT = '.secrets/vault.json'
const subtle = crypto.subtle
const encoder = new TextEncoder()
const AES = { name: 'AES-GCM', length: 256 }

/** @param {Uint8Array} salt @param {string} info */
const hkdf = (salt, info) => ({ name: 'HKDF', hash: 'SHA-256', salt, info: encoder.encode(info) })

/** @param {Uint8Array[]} parts */
function join(parts) {
  const all = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let at = 0
  for (const part of parts) all.set(part, (at += part.length) - part.length)
  return all
}

/** The vault key as one that only derives others, and never leaves. @param {Uint8Array} raw */
export const vaultKey = (raw) => subtle.importKey('raw', /** @type {BufferSource} */ (raw), 'HKDF', false, ['deriveKey', 'deriveBits'])

/** The 8 bytes a sealed file's header names its vault by. @param {CryptoKey} vault */
export const vaultId = async (vault) => new Uint8Array(await subtle.deriveBits(hkdf(new Uint8Array(), 'id'), vault, 64))

/** @param {CryptoKey} vault @param {Uint8Array} head */
const fileKey = (vault, head) => subtle.deriveKey(hkdf(head.slice(16, HEADER), 'file'), vault, AES, false, ['encrypt', 'decrypt'])

/** What each record of a file is bound to: its header and its path, so it opens nowhere else. @param {Uint8Array} head @param {string} path */
const bound = (head, path) => join([head, encoder.encode(path)])

/** Whether these bytes are a sealed file's. @param {Uint8Array} bytes */
export const isSealed = (bytes) => bytes.length >= HEADER && MAGIC.every((byte, i) => bytes[i] === byte)

/**
 * A whole file sealed, under a salt of its own, so a key of its own.
 * @param {CryptoKey} vault @param {Uint8Array} id @param {string} path @param {Uint8Array} bytes
 */
export async function seal(vault, id, path, bytes) {
  const head = new Uint8Array(HEADER)
  head.set(MAGIC)
  head[5] = 1
  head.set(id, 8)
  head.set(crypto.getRandomValues(new Uint8Array(16)), 16)
  return join([head, await records(vault, head, path, bytes)])
}

/**
 * Records to go after a sealed file's last, under its header: an append stays an append.
 * @param {CryptoKey} vault @param {Uint8Array} head @param {string} path @param {Uint8Array} bytes
 */
export async function records(vault, head, path, bytes) {
  const [key, data] = [await fileKey(vault, head), bound(head, path)]
  const starts = Array.from({ length: Math.ceil(bytes.length / RECORD) }, (_, i) => i * RECORD)
  return join((await Promise.all(starts.map(async (at) => {
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const sealed = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv, additionalData: data }, key, /** @type {BufferSource} */ (bytes.subarray(at, at + RECORD))))
    const length = new Uint8Array(4)
    new DataView(length.buffer).setUint32(0, sealed.length)
    return [length, iv, sealed]
  }))).flat())
}

/**
 * A sealed file's content. A record cut short, or whose tag fails, at the end is what a crash
 * mid-append leaves, and is left out, as a half-written line is; anywhere else, the file is damaged.
 * @param {CryptoKey} vault @param {Uint8Array} id @param {string} path @param {Uint8Array} bytes
 */
export async function open(vault, id, path, bytes) {
  const damaged = () => new DOMException(`Can't open ${path}`, 'DataError')
  if (!isSealed(bytes) || id.some((byte, i) => bytes[8 + i] !== byte)) throw damaged()
  const head = bytes.subarray(0, HEADER)
  const [key, data] = [await fileKey(vault, head), bound(head, path)]
  /** @type {Uint8Array[][]} */
  const found = []
  for (let at = HEADER; at + 16 <= bytes.length;) {
    const end = at + 16 + new DataView(bytes.buffer, bytes.byteOffset + at, 4).getUint32(0)
    if (end > bytes.length) break
    found.push([bytes.subarray(at + 4, at + 16), bytes.subarray(at + 16, end)])
    at = end
  }
  const plain = await Promise.all(found.map(([iv, sealed], i) => subtle.decrypt({ name: 'AES-GCM', iv: /** @type {BufferSource} */ (iv), additionalData: data }, key, /** @type {BufferSource} */ (sealed)).then(
    (bytes) => new Uint8Array(bytes), (error) => { if (i < found.length - 1) throw damaged(); return new Uint8Array() })))
  return join(plain)
}

// ─── Slots ───────────────────────────────────────────────────────────────────

/**
 * One way to the vault key, as kept in vault.json: this device's key, a passkey (its credential and
 * the salt its PRF is asked for), a password (PBKDF2's salt and count), a recovery code, or the vault
 * key of a parent's profile, which a child's under 13 opens with (D228).
 * @typedef {{ kind: 'device' | 'passkey' | 'password' | 'recovery' | 'parent', iv: string, data: string, salt?: string, iterations?: number, credential?: string, profile?: string }} Slot
 */

/** Base64, in pieces: a picture's, a page's or a long email's bytes spread at once would overflow the call stack. @param {Uint8Array} bytes */
export function encode(bytes) {
  let text = ''
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(text)
}
/** @param {string} text */
export const decode = (text) => Uint8Array.from(atob(text), (char) => char.charCodeAt(0))

/** OWASP's count for PBKDF2-SHA-256, as sharing by link uses (D361). */
export const ITERATIONS = 600_000

/**
 * The key a slot is sealed under, from what the person gives: a passkey's PRF output, a password, a
 * recovery code's bytes, a parent's vault key. A device slot's key is the device's own.
 * @param {Omit<Slot, 'iv' | 'data'>} slot @param {Uint8Array | string} secret
 */
export async function slotKey(slot, secret) {
  const salt = decode(slot.salt ?? '')
  if (typeof secret === 'string') {
    const base = await subtle.importKey('raw', encoder.encode(secret), 'PBKDF2', false, ['deriveKey'])
    return subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: slot.iterations ?? ITERATIONS }, base, AES, false, ['encrypt', 'decrypt'])
  }
  return subtle.deriveKey(hkdf(salt, slot.kind), await subtle.importKey('raw', /** @type {BufferSource} */ (secret), 'HKDF', false, ['deriveKey']), AES, false, ['encrypt', 'decrypt'])
}

/**
 * The vault key sealed into a slot. @param {Uint8Array} raw @param {CryptoKey} key
 * @param {Omit<Slot, 'iv' | 'data'>} slot @returns {Promise<Slot>}
 */
export async function close(raw, key, slot) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  return { ...slot, iv: encode(iv), data: encode(new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv }, key, /** @type {BufferSource} */ (raw)))) }
}

/** The vault key out of a slot; throws when the key is the wrong one. @param {Slot} slot @param {CryptoKey} key */
export const unseal = async (slot, key) => new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv: decode(slot.iv) }, key, decode(slot.data)))

/**
 * This device's key for a vault's slot, kept in IndexedDB (app-keys) by the vault's root, a profile's
 * (D228), and non-extractable: read, made, or forgotten once a lock replaces it. Null when there is
 * none, or no IndexedDB. @param {'get' | 'make' | 'forget'} what @param {string} root @returns {Promise<CryptoKey | null>}
 */
export function deviceKey(what, root) {
  return new Promise((resolve) => {
    const request = indexedDB.open('app-keys', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('keys')
    request.onerror = () => resolve(null)
    request.onsuccess = async () => {
      const key = what === 'make' ? await subtle.generateKey(AES, false, ['encrypt', 'decrypt']) : null
      const store = request.result.transaction('keys', what === 'get' ? 'readonly' : 'readwrite').objectStore('keys')
      const asked = what === 'get' ? store.get(root) : what === 'make' ? store.put(key, root) : store.delete(root)
      asked.onsuccess = () => resolve(what === 'get' ? asked.result ?? null : key)
      asked.onerror = () => resolve(null)
    }
  })
}
