// A shared copy's seal (D361): sealed in the sharer's browser with AES-256-GCM, under a key drawn
// from the link's secret, and from a password when there is one, so the host keeps what it can't
// read. The link's `#` carries the secret, which browsers never send. A password's share also has a
// proof, drawn from the same, which the host asks for before it hands the copy out, so a password is
// only ever tried through it, never offline. No DOM: tested with node --test.

/** What PBKDF2 asks of a password: OWASP's count for SHA-256. */
const ITERATIONS = 600_000

/** @param {string} text */
const encode = (text) => new TextEncoder().encode(text)
/** @param {Uint8Array} bytes */
export const base64url = (bytes) => btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join('')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
/** @param {string} text */
export const bytesOf = (text) => Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), (char) => char.charCodeAt(0))
/** @param {number} length */
export const random = (length) => crypto.getRandomValues(new Uint8Array(length))
/** The SHA-256 of a text, base64url: what the host keeps of a write token or a proof. @param {string} text */
export const hashOf = async (text) => base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', encode(text))))

/**
 * What the key is drawn from: the secret, then, with a password, PBKDF2's of it on the share's salt.
 * @param {Uint8Array} secret @param {Uint8Array} salt @param {string} [password]
 */
export async function materialOf(secret, salt, password) {
  if (!password) return secret
  const typed = await crypto.subtle.importKey('raw', encode(password.normalize('NFC')), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: /** @type {BufferSource} */ (salt), iterations: ITERATIONS }, typed, 256)
  return new Uint8Array([...secret, ...new Uint8Array(bits)])
}

/**
 * The copy's key, and the proof the host asks of a password's share, both drawn from the material by HKDF.
 * @param {Uint8Array} material @param {Uint8Array} salt
 */
export async function keysOf(material, salt) {
  const base = await crypto.subtle.importKey('raw', /** @type {BufferSource} */ (material), 'HKDF', false, ['deriveKey', 'deriveBits'])
  /** @param {string} info */
  const as = (info) => ({ name: 'HKDF', hash: 'SHA-256', salt: /** @type {BufferSource} */ (salt), info: encode(info) })
  const key = await crypto.subtle.deriveKey(as('share key'), base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
  return { key, access: base64url(new Uint8Array(await crypto.subtle.deriveBits(as('share access'), base, 256))) }
}

/** A value as gzipped JSON. @param {unknown} value */
export const pack = async (value) => new Uint8Array(await new Response(new Blob([JSON.stringify(value)]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer())

/** Gzipped JSON as the value it was. @param {Uint8Array} bytes */
export const unpack = async (bytes) => JSON.parse(await new Response(new Blob([/** @type {BlobPart} */ (bytes)]).stream().pipeThrough(new DecompressionStream('gzip'))).text())

/**
 * A value sealed as the host keeps it: its salt (16 bytes), the nonce (12), then the ciphertext; under
 * the secret and the password, or the material they made, which sealing a share again takes.
 * @param {unknown} value @param {{ salt: Uint8Array, secret?: Uint8Array, password?: string, material?: Uint8Array }} seal
 * @returns {Promise<{ sealed: Uint8Array, access: string }>}
 */
export async function sealValue(value, { salt, secret = new Uint8Array(), password, material }) {
  const { key, access } = await keysOf(material ?? await materialOf(secret, salt, password), salt)
  const iv = random(12)
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, /** @type {BufferSource} */ (await pack(value))))
  return { sealed: new Uint8Array([...salt, ...iv, ...ciphertext]), access }
}

/** The salt a sealed copy was made with, which a password's needs first. @param {Uint8Array} sealed */
export const saltOf = (sealed) => sealed.slice(0, 16)

/**
 * A sealed copy opened with the material its key is drawn from; an Error when the key isn't its own.
 * @param {Uint8Array} sealed @param {Uint8Array} material
 */
export async function openValue(sealed, material) {
  const { key } = await keysOf(material, saltOf(sealed))
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: sealed.slice(16, 28) }, key, sealed.slice(28))
  return unpack(new Uint8Array(plain))
}

/** A link to a share: the host's address, its id, and the secret after `#`. @param {string} host @param {string} id @param {Uint8Array} secret */
export const linkOf = (host, id, secret) => `${host.replace(/\/?$/, '/')}${id}#${base64url(secret)}`

/**
 * A share's id: the first 128 bits of its write token's SHA-256, so the host lets no other token put a
 * copy there, even once it is no longer shared. @param {string} token
 */
export const idOf = async (token) => base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', encode(token))).slice(0, 16))

/** Whether a text is an id or a secret of a share's link. @param {string} text */
export const isPart = (text) => /^[\w-]{22,86}$/.test(text)
