// SPDX-FileCopyrightText: 2026 Warehouse SAS
// SPDX-License-Identifier: Elastic-2.0

// XML as the EU's trusted lists are written (D439): read into elements with their namespaces, written back as
// Exclusive XML Canonicalization 1.0 says (without comments), and an enveloped XML signature (XMLDSig 1.1) checked:
// each reference's digest over what it names, then SignedInfo's signature, by a key given, never one the document
// carries. A DTD refuses the document, so no entity reaches outside it. Web Crypto only, tested under node --test.
import { keyOf, read, children, raw, dottedOf, seq, oid, tlv } from '../caps/receipt/der.js'
import { base64, unbase64 } from './pkix.js'

/** @typedef {{ name: string, prefix: string, local: string, ns: string }} Named */
/** @typedef {Named & { value: string }} Attribute */
/** @typedef {Named & { attributes: Attribute[], scope: Map<string, string>, children: Node[] }} Element */
/** @typedef {{ target: string, data: string }} Instruction */
/** @typedef {Element | Instruction | string} Node */
/** @typedef {{ root: Element, children: Node[] }} Document the root, with the instructions around it */

const DSIG = 'http://www.w3.org/2000/09/xmldsig#'
const EXCLUSIVE = 'http://www.w3.org/2001/10/xml-exc-c14n#'
const ENVELOPED = `${DSIG}enveloped-signature`
const MORE = 'http://www.w3.org/2001/04/xmldsig-more#'
const DIGESTS = /** @type {Record<string, string>} */ ({ 'http://www.w3.org/2001/04/xmlenc#sha256': 'SHA-256', [`${MORE}sha384`]: 'SHA-384', 'http://www.w3.org/2001/04/xmlenc#sha512': 'SHA-512' })
/** Web Crypto's names for a signature method and its hash: RSA's PKCS #1 v1.5 and PSS (RFC 6931), and ECDSA. */
const METHODS = /** @type {Record<string, [string, string]>} */ (Object.fromEntries([256, 384, 512].flatMap((bits) => [
  [`${MORE}rsa-sha${bits}`, 'RSASSA-PKCS1-v1_5'], [`${MORE}ecdsa-sha${bits}`, 'ECDSA'], [`http://www.w3.org/2007/05/xmldsig-more#sha${bits}-rsa-MGF1`, 'RSA-PSS'],
].map(([uri, name]) => [uri, [name, `SHA-${bits}`]]))))
const ENTITIES = /** @type {Record<string, string>} */ ({ lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" })
const TEXT = /** @type {Record<string, string>} */ ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\r': '&#xD;' })
const QUOTED = /** @type {Record<string, string>} */ ({ '&': '&amp;', '<': '&lt;', '"': '&quot;', '\t': '&#x9;', '\n': '&#xA;', '\r': '&#xD;' })
const TAG = /<([^\s/>!?]+)((?:\s+[^\s=/>]+\s*=\s*(?:"[^"<]*"|'[^'<]*'))*)\s*(\/?)>/y
const PAIR = /\s+([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g
const encoder = new TextEncoder()

/** @param {string} why @returns {never} */
const fail = (why) => { throw new Error(`XML: ${why}`) }
/** Text with its references replaced by what they stand for. @param {string} text */
const unescaped = (text) => (text.includes('&') ? text.replace(/&(#x[\da-f]+|#\d+|[a-z]+);|&/gi, (_, ref) => (!ref ? fail('a lone &')
  : ref[0] !== '#' ? ENTITIES[ref] ?? fail(`&${ref};`) : String.fromCodePoint(/x/i.test(ref[1]) ? parseInt(ref.slice(2), 16) : Number(ref.slice(1))))) : text)
/** @param {string} a @param {string} b */
const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0)
/** @param {Node | Document} node @returns {node is Element} */
const isElement = (node) => typeof node === 'object' && 'scope' in node

/** An element's name, or an attribute's, resolved in a scope: an attribute without a prefix is in no namespace. @param {string} name @param {Map<string, string>} scope @param {boolean} element @returns {Named} */
function named(name, scope, element) {
  const colon = name.indexOf(':')
  const prefix = colon < 0 ? '' : name.slice(0, colon)
  return { name, prefix, local: name.slice(colon + 1), ns: prefix || element ? scope.get(prefix) ?? (prefix ? fail(`the prefix ${prefix}`) : '') : '' }
}

/**
 * A document read: its elements, their text and processing instructions, each element with the namespaces in scope
 * there; comments left out, as canonical XML without comments has them. @param {string} text @returns {Document}
 */
export function parse(text) {
  const source = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n')
  /** @type {Node[]} */
  const top = []
  /** @type {Element[]} */
  const open = []
  /** @type {Element | undefined} */
  let root
  let at = 0
  /** @param {Node} node */
  const add = (node) => (open.at(-1)?.children ?? top).push(node)
  while (at < source.length) {
    const next = source.indexOf('<', at)
    const end = next < 0 ? source.length : next
    if (end > at) {
      const text = source.slice(at, end)
      if (open.length) add(unescaped(text))
      else if (text.trim()) fail('text outside the root')
      at = end
      continue
    }
    if (source.startsWith('<!--', at)) at = (source.indexOf('-->', at + 4) + 1 || fail('a comment')) + 2
    else if (source.startsWith('<![CDATA[', at)) {
      const close = source.indexOf(']]>', at)
      add(source.slice(at + 9, close < 0 ? fail('a CDATA section') : close))
      at = close + 3
    } else if (source.startsWith('<?', at)) {
      const close = source.indexOf('?>', at)
      const [, target, data] = /^<\?([^\s?]+)\s*([^]*)$/.exec(source.slice(at, close < 0 ? fail('an instruction') : close)) ?? fail('an instruction')
      if (target.toLowerCase() !== 'xml') add({ target, data })
      at = close + 2
    } else if (source.startsWith('<!', at)) fail('a DTD')
    else if (source.startsWith('</', at)) {
      const close = source.indexOf('>', at)
      if (source.slice(at + 2, close).trim() !== open.pop()?.name) fail('a closing tag')
      at = close + 1
    } else {
      TAG.lastIndex = at
      const [, name, given, empty] = TAG.exec(source) ?? fail('a tag')
      const inherited = open.at(-1)?.scope ?? new Map([['xml', 'http://www.w3.org/XML/1998/namespace']])
      // Attributes' whitespace becomes spaces, then references are read (XML 1.0, 3.3.3).
      const pairs = [...given.matchAll(PAIR)].map(([, key, double, single]) => [key, unescaped((double ?? single).replace(/[\t\n]/g, ' '))])
      const declared = pairs.filter(([key]) => key === 'xmlns' || key.startsWith('xmlns:'))
      const scope = declared.length ? new Map([...inherited, ...declared.map(([key, value]) => /** @type {[string, string]} */ ([key.slice(6), value]))]) : inherited
      /** @type {Element} */
      const element = { ...named(name, scope, true), scope, children: [], attributes: pairs.filter((pair) => !declared.includes(pair)).map(([key, value]) => ({ ...named(key, scope, false), value })) }
      if (!open.length && root) fail('a second root')
      add(element)
      root ??= element
      if (!empty) open.push(element)
      at = TAG.lastIndex
    }
  }
  return open.length || !root ? fail('an element left open') : { root, children: top }
}

/**
 * An element and what it holds, or a whole document, as Exclusive XML Canonicalization 1.0 writes it without
 * comments: each element declares the namespaces it and its attributes use that its nearest written ancestor
 * didn't; `left` is left out (an enveloped signature). @param {Element | Document} node @param {Element} [left]
 */
export function canonical(node, left) {
  /** @type {string[]} */
  const out = []
  /** @param {Node} node @param {Map<string, string>} written */
  const write = (node, written) => {
    if (typeof node === 'string') return void out.push(node.replace(/[&<>\r]/g, (char) => TEXT[char]))
    if (!isElement(node)) return void out.push(`<?${node.target}${node.data && ` ${node.data}`}?>`)
    if (node === left) return
    let shown = written
    let declared = ''
    for (const prefix of [...new Set([node.prefix, ...node.attributes.flatMap((one) => (one.prefix ? [one.prefix] : []))])].sort()) {
      const uri = node.scope.get(prefix) ?? ''
      if (prefix === 'xml' || (written.get(prefix) ?? '') === uri) continue
      declared += ` xmlns${prefix && `:${prefix}`}="${quoted(uri)}"`
      if (shown === written) shown = new Map(written)
      shown.set(prefix, uri)
    }
    const attributes = [...node.attributes].sort((a, b) => compare(a.ns, b.ns) || compare(a.local, b.local)).map((one) => ` ${one.name}="${quoted(one.value)}"`)
    out.push(`<${node.name}${declared}${attributes.join('')}>`)
    for (const child of node.children) write(child, shown)
    out.push(`</${node.name}>`)
  }
  if (isElement(node)) write(node, new Map())
  else {
    // Instructions before the root end with a line, those after it start with one.
    const root = node.children.indexOf(node.root)
    for (const [i, child] of node.children.entries()) {
      if (i > root) out.push('\n')
      write(child, new Map())
      if (i < root) out.push('\n')
    }
  }
  return out.join('')
}
/** @param {string} value */
const quoted = (value) => value.replace(/[&<"\t\n\r]/g, (char) => QUOTED[char])

/** An element's child elements, those of a namespace's name when given. @param {Element | undefined} element @param {string} [ns] @param {string} [local] @returns {Element[]} */
export const childrenOf = (element, ns, local) => /** @type {Element[]} */ ((element?.children ?? []).filter((one) => isElement(one) && (!local || (one.ns === ns && one.local === local))))
/** An element's text. @param {Element | undefined} element */
export const textOf = (element) => (element?.children ?? []).filter((one) => typeof one === 'string').join('')
/** @param {Element | undefined} element @param {string} name */
const attributeOf = (element, name) => element?.attributes.find((one) => one.name === name)?.value
/** A key's SPKI as Web Crypto imports it: an RSASSA-PSS key (Germany's list) named rsaEncryption, the same key. @param {Uint8Array} spki */
function importable(spki) {
  const [algorithm, key] = children(read(spki))
  return dottedOf(children(algorithm)[0]) === '1.2.840.113549.1.1.10' ? seq(seq(oid('1.2.840.113549.1.1.1'), tlv(0x05)), raw(key)) : spki
}
/** The one element whose Id is this, none if two are. @param {Element} root @param {string} id */
function byId(root, id) {
  const found = []
  for (const stack = [root]; stack.length;) {
    const element = /** @type {Element} */ (stack.pop())
    if (attributeOf(element, 'Id') === id) found.push(element)
    stack.push(...childrenOf(element))
  }
  return found.length === 1 ? found[0] : undefined
}

/**
 * Which of some keys (SPKIs) signed a document by the one signature its root holds: its references, the whole
 * document but that signature and an element it names by Id, each canonicalized exclusively and hashed as it says,
 * and SignedInfo, canonicalized the same way, signed as it says. Another kind of reference or transform refuses it,
 * as does a signature without the whole document. -1 when none did. @param {Document} document @param {Uint8Array[]} keys
 */
export async function signer(document, keys) {
  const [signature, ...more] = childrenOf(document.root, DSIG, 'Signature')
  const [info] = childrenOf(signature, DSIG, 'SignedInfo')
  const [name, hash] = METHODS[attributeOf(childrenOf(info, DSIG, 'SignatureMethod')[0], 'Algorithm') ?? ''] ?? []
  if (!info || more.length || !name || attributeOf(childrenOf(info, DSIG, 'CanonicalizationMethod')[0], 'Algorithm') !== EXCLUSIVE) return -1
  let whole = false
  for (const reference of childrenOf(info, DSIG, 'Reference')) {
    const uri = attributeOf(reference, 'URI')
    const transforms = childrenOf(childrenOf(reference, DSIG, 'Transforms')[0], DSIG, 'Transform').map((one) => (childrenOf(one).length ? '' : attributeOf(one, 'Algorithm')))
    const target = uri === '' ? document : uri?.startsWith('#') ? byId(document.root, uri.slice(1)) : undefined
    const digest = DIGESTS[attributeOf(childrenOf(reference, DSIG, 'DigestMethod')[0], 'Algorithm') ?? '']
    if (!target || !digest || transforms.join() !== (uri === '' ? [ENVELOPED, EXCLUSIVE] : [EXCLUSIVE]).join()) return -1
    const bytes = new Uint8Array(await crypto.subtle.digest(digest, encoder.encode(canonical(target, uri === '' ? signature : undefined))))
    if (base64(bytes) !== textOf(childrenOf(reference, DSIG, 'DigestValue')[0]).replace(/\s/g, '')) return -1
    whole ||= uri === ''
  }
  const value = unbase64(textOf(childrenOf(signature, DSIG, 'SignatureValue')[0]))
  const signed = encoder.encode(canonical(info))
  for (const [i, spki] of whole ? keys.entries() : []) {
    const key = await keyOf(importable(spki), hash, name === 'ECDSA' ? undefined : name).catch(() => null)
    if (!key || (key.algorithm.name === 'ECDSA') !== (name === 'ECDSA')) continue
    const how = name === 'ECDSA' ? { name, hash } : name === 'RSA-PSS' ? { name, saltLength: Number(hash.slice(4)) / 8 } : name
    if (await crypto.subtle.verify(how, key, /** @type {BufferSource} */ (value), signed).catch(() => false)) return i
  }
  return -1
}
