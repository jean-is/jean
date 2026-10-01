// ULID: 48-bit millisecond time + 80 random bits, Crockford base32, 26 chars.
// Lexicographically sortable by creation time. https://github.com/ulid/spec

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

/** @param {number} [time] milliseconds since epoch */
export function ulid(time = Date.now()) {
  let out = ''
  let t = time
  for (let i = 0; i < 10; i++) {
    out = ALPHABET[t % 32] + out
    t = Math.floor(t / 32)
  }
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  for (let i = 0; i < 16; i++) out += ALPHABET[bytes[i] % 32]
  return out
}

/** @param {string} id */
export function ulidTime(id) {
  let t = 0
  for (const ch of id.slice(0, 10)) t = t * 32 + ALPHABET.indexOf(ch)
  return t
}
