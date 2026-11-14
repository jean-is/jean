// SPDX-License-Identifier: MIT
// Replies to a published site's forms (D751). Publishing a site with a form adds Jean's script, SCRIPT, which every page with one loads:
// what a visitor sends is sealed in their browser to the site's own public key, as the host's records are (host/serve.js's sealRecord:
// an ephemeral P-256 key's half, the nonce, then AES-256-GCM under the key both halves agree on), and posted to the host, which keeps
// what it can't read until Jean collects it, 30 days at most (host/sites.js). The page then shows its own words: what the form's
// `[data-sent]` says once it went, what its `[data-unsent]` says when it didn't, in a status region the script adds as it starts.
// The private half is made at the first publish, sealed under a key drawn from the site's secret, and kept in site.json, so that any
// device holding the secret, or its recovery code, opens the replies. Pure: node tests run it.

/** The file Jean adds to a published site that has a form, which a site's own files never take. */
export const SCRIPT = '_form.js'
const ECDH = { name: 'ECDH', namedCurve: 'P-256' }
const encode = (/** @type {string} */ text) => new TextEncoder().encode(text)
/** @param {Uint8Array} bytes */
const base64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
/** @param {string} text */
const bytesOf = (text) => Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), (char) => char.charCodeAt(0))

/** Where a site's forms send their replies: the host at its sites' parent name, as host/sites.js's repliesAt() says, which a test holds it to. @param {string} address */
export const repliesAt = (address) => new URL(address.replace('{name}', 'x')).origin.replace('//x.', '//')
/** Whether a page has a form whose replies go to the host. @param {string} page */
export const formed = (page) => /<form\b[^>]*\sdata-form\b/i.test(page)

/**
 * Jean's script for a published site's forms: `at` where replies go (repliesAt, '' where the host takes none, so that a visitor reads its
 * [data-unsent] words rather than nothing), `key` the site's public half. The site's name is the first part of the page's own address.
 * @param {string} at @param {string} key
 */
export const scriptOf = (at, key) => `// Jean's script for this site's forms: what a visitor sends is sealed in their browser to the site's key, and kept by the host, which can't read it, until the site's owner collects it.
// In a block, so that none of its names meets the site's own.
{
const at = ${JSON.stringify(at)}, key = ${JSON.stringify(key)}, subtle = crypto.subtle
const base64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, '')
const seal = async (text) => {
  const ECDH = { name: 'ECDH', namedCurve: 'P-256' }, mine = await subtle.generateKey(ECDH, true, ['deriveKey']), iv = crypto.getRandomValues(new Uint8Array(12))
  const theirs = await subtle.importKey('raw', Uint8Array.from(atob(key.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)), ECDH, false, [])
  const shared = await subtle.deriveKey({ name: 'ECDH', public: theirs }, mine.privateKey, { name: 'AES-GCM', length: 256 }, false, ['encrypt'])
  return base64url(new Uint8Array([...new Uint8Array(await subtle.exportKey('raw', mine.publicKey)), ...iv, ...new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv }, shared, new TextEncoder().encode(text)))]))
}
const labelOf = (form, field) => (field.type === 'radio' ? field.closest('fieldset')?.querySelector('legend') : field.id && form.querySelector('label[for="' + CSS.escape(field.id) + '"]') || field.closest('label'))?.textContent.trim() || field.name
for (const form of document.querySelectorAll('form[data-form]')) {
  const status = form.appendChild(document.createElement('p'))
  let busy = false
  status.setAttribute('role', 'status')
  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    if (busy) return
    busy = true
    const fields = [...new FormData(form, event.submitter)].filter(([, value]) => typeof value === 'string').map(([name, value]) => {
      const field = form.elements.namedItem(name), one = field instanceof RadioNodeList ? field[0] : field
      return { label: one ? labelOf(form, one) : name, value, choice: Boolean(one && (one.type === 'radio' || one.type === 'checkbox' || one.localName === 'select')) }
    })
    const sent = at && await seal(JSON.stringify({ format: 1, form: form.dataset.form, page: location.pathname, at: new Date().toISOString(), fields }))
      .then((sealed) => fetch(at + '/v1/sites/' + location.hostname.split('.')[0] + '/replies', { method: 'POST', body: sealed, headers: { 'content-type': 'text/plain' } })).then((answer) => answer.ok, () => false)
    status.textContent = form.querySelector(sent ? '[data-sent]' : '[data-unsent]')?.textContent.trim() ?? ''
    if (sent) form.reset()
    busy = false
  })
}
}
`

/**
 * A site's files as they are published: where a page has a form whose replies go to the host, SCRIPT added, and each such page loading it
 * at the end of its head. The rest as it is. @param {Map<string, Uint8Array>} files @param {string} script @returns {Map<string, Uint8Array>}
 */
export function withReplies(files, script) {
  const pages = [...files].filter(([path, bytes]) => /\.html?$/i.test(path) && formed(new TextDecoder().decode(bytes)))
  if (!pages.length) return files
  const tag = `<script src="/${SCRIPT}" defer></script>`
  return new Map([...files, ...pages.map(([path, bytes]) => /** @type {[string, Uint8Array]} */ ([path, encode(((page) => (/<\/head\s*>/i.test(page) ? page.replace(/<\/head\s*>/i, `${tag}$&`) : `${tag}${page}`))(new TextDecoder().decode(bytes)))])), [SCRIPT, encode(script)]])
}

/** The key a site's secret seals its replies' private half with, drawn from it one way. @param {Uint8Array} secret */
const lockOf = async (secret) => crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(), info: encode('site replies key') },
  await crypto.subtle.importKey('raw', /** @type {BufferSource} */ (secret), 'HKDF', false, ['deriveKey']), { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])

/** A new pair for a site's replies: its public half as the script takes it, and its private one. */
export async function pairOf() {
  const pair = await crypto.subtle.generateKey(ECDH, true, ['deriveKey'])
  return { key: base64url(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))), privateKey: pair.privateKey }
}
/** The private half sealed under the site's secret, for site.json. @param {CryptoKey} privateKey @param {Uint8Array} secret */
export async function sealKey(privateKey, secret) {
  const iv = crypto.getRandomValues(new Uint8Array(12)), sealed = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await lockOf(secret), await crypto.subtle.exportKey('pkcs8', privateKey))
  return base64url(new Uint8Array([...iv, ...new Uint8Array(sealed)]))
}
/** The private half opened with the site's secret; it throws for another secret. @param {string} sealed @param {Uint8Array} secret */
export async function keyOf(sealed, secret) {
  const bytes = bytesOf(sealed)
  return crypto.subtle.importKey('pkcs8', await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.subarray(0, 12) }, await lockOf(secret), bytes.subarray(12)), ECDH, true, ['deriveKey'])
}

/**
 * What a visitor sent, opened with the site's private half: its form, page and time, and each field's label, value and whether it was a
 * choice; null for what isn't a reply to it. Untrusted: anyone may post anything.
 * @param {string} sealed @param {CryptoKey} privateKey @returns {Promise<{ form: string, at: string, fields: { label: string, value: string, choice: boolean }[] } | null>}
 */
export async function opened(sealed, privateKey) {
  try {
    const bytes = bytesOf(sealed), theirs = await crypto.subtle.importKey('raw', bytes.subarray(0, 65), ECDH, false, [])
    const shared = await crypto.subtle.deriveKey({ name: 'ECDH', public: theirs }, privateKey, { name: 'AES-GCM', length: 256 }, false, ['decrypt'])
    const said = JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.subarray(65, 77) }, shared, bytes.subarray(77))))
    const fields = (Array.isArray(said?.fields) ? said.fields : []).slice(0, 50).map((/** @type {any} */ one) => ({ label: String(one?.label ?? '').trim().slice(0, 100), value: String(one?.value ?? '').slice(0, 5000), choice: one?.choice === true }))
    return { form: String(said?.form ?? '').trim().slice(0, 100) || 'form', at: Number.isNaN(Date.parse(said?.at)) ? new Date().toISOString() : new Date(said.at).toISOString(), fields: fields.filter((/** @type {{ label: string }} */ one) => one.label) }
  } catch { return null }
}
