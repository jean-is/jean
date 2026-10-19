// SPDX-FileCopyrightText: 2026 Warehouse SAS
// SPDX-License-Identifier: Elastic-2.0

// The EU's trusted lists as the organisation's anchors (D439, ETSI TS 119 612). The List of Trusted Lists is taken
// once a key policy carries signed it, the certificates the Official Journal publishes, or a key that its pivots
// announce in turn from there; then each member state's list it points to, once a key it names for that list signed
// it. From each, its qualified authorities for certificates (CA/QC) with their statuses over time, so that a seal is
// judged by its authority's status when it sealed. Whoever relays the lists can withhold them, never choose them.
// Pure, given how to read an address, so it is tested under node --test.
import { parse, signer, childrenOf, textOf } from './xml.js'
import { parts, base64, unbase64 } from './pkix.js'

/** @typedef {import('./xml.js').Element} Element */
/** @typedef {import('./pkix.js').Parts} Parts */
/** @typedef {{ from: string, type: string, status: string, uses: string[] }} Status what a service was from a time: its type, its status, what it certifies for (ForeSeals…) */
/** @typedef {{ name: string, certificates: string[], statuses: Status[] }} Service a qualified authority, its certificates in base64, its statuses earliest first */
/** @typedef {Parts & { seals: boolean }} Anchor */

const LISTS = 'http://uri.etsi.org/TrstSvc/TrustedList/'
const QC = 'http://uri.etsi.org/TrstSvc/Svctype/CA/QC'

/** The elements down a path of names, in whichever namespace. @param {(Element | undefined)[]} from @param {...string} path @returns {Element[]} */
const down = (from, ...path) => path.reduce((all, local) => all.flatMap((one) => childrenOf(one).filter((child) => child.local === local)), /** @type {Element[]} */ (from.filter(Boolean)))
/** @param {Element | undefined} from @param {...string} path */
const textAt = (from, ...path) => textOf(down([from], ...path)[0]).trim()

/**
 * A list, once a key of its signers' holds its signature and that signer was valid when it was issued: its type,
 * territory and issue, and its root; throws, saying which, otherwise. @param {string} xml @param {Parts[]} signers @param {string} address
 */
export async function checked(xml, signers, address) {
  const document = parse(xml)
  const { root } = document
  const issued = new Date(textAt(root, 'SchemeInformation', 'ListIssueDateTime'))
  const by = signers[await signer(document, signers.map((one) => one.spki))]
  if (!by || !(by.from <= issued && issued <= by.until)) throw new Error(`${address} isn’t signed by a key named for it`)
  return { root, issued, type: textAt(root, 'SchemeInformation', 'TSLType'), territory: textAt(root, 'SchemeInformation', 'SchemeTerritory') }
}

/** What a list points to: each list's address, territory, type, whether XML, and the certificates whose keys may sign it. @param {Element} root */
export const pointersOf = (root) => down([root], 'SchemeInformation', 'PointersToOtherTSL', 'OtherTSLPointer').map((pointer) => {
  const said = down([pointer], 'AdditionalInformation', 'OtherInformation')
  return {
    location: textAt(pointer, 'TSLLocation'), territory: textOf(down(said, 'SchemeTerritory')[0]).trim(), type: textOf(down(said, 'TSLType')[0]).trim(),
    xml: /xml/.test(textOf(down(said, 'MimeType')[0])),
    signers: down([pointer], 'ServiceDigitalIdentities', 'ServiceDigitalIdentity', 'DigitalId', 'X509Certificate').map((one) => parts(unbase64(textOf(one)))),
  }
})

/**
 * The LOTL at an address, once signed: by a key of policy's signers, else by one its pivots announce. A pivot, an
 * earlier LOTL whose own pointer announces the keys that sign those after it, counts once issued after the newest
 * of policy's certificates (older ones could announce keys since retired), each signed by a key the one before it
 * announced, the first by policy's. @param {string} address @param {Parts[]} signers @param {(address: string) => Promise<string>} read
 */
export async function lotlOf(address, signers, read) {
  const xml = await read(address)
  const list = await checked(xml, signers, address).catch(async () => {
    const pivots = down([parse(xml).root], 'SchemeInformation', 'SchemeInformationURI', 'URI').map((one) => textOf(one).trim()).filter((uri) => /\.xml$/i.test(uri) && uri !== address)
    const newest = Math.max(...signers.map((one) => one.from.getTime()))
    let keys = signers
    for (const pivot of pivots.reverse()) {
      const text = await read(pivot)
      if (Date.parse(textAt(parse(text).root, 'SchemeInformation', 'ListIssueDateTime')) < newest) continue
      keys = pointersOf((await checked(text, keys, pivot)).root).find((one) => one.type === `${LISTS}TSLType/EUlistofthelists`)?.signers ?? []
    }
    return checked(xml, keys, address)
  })
  if (list.type !== `${LISTS}TSLType/EUlistofthelists`) throw new Error(`${address} isn’t the List of Trusted Lists`)
  return list
}

/**
 * A member state's qualified authorities, once a key the LOTL names for its list signed it: each with its
 * certificates and its statuses. @param {ReturnType<typeof pointersOf>[number]} pointer @param {(address: string) => Promise<string>} read
 * @returns {Promise<Service[]>}
 */
export async function servicesOf(pointer, read) {
  const list = await checked(await read(pointer.location), pointer.signers, pointer.location)
  if (list.type !== `${LISTS}TSLType/EUgeneric` || list.territory !== pointer.territory) throw new Error(`${pointer.location} isn’t ${pointer.territory}’s trusted list`)
  return down([list.root], 'TrustServiceProviderList', 'TrustServiceProvider', 'TSPServices', 'TSPService').flatMap((service) => {
    const [now] = down([service], 'ServiceInformation')
    const statuses = [now, ...down([service], 'ServiceHistory', 'ServiceHistoryInstance')].map((one) => ({
      from: textAt(one, 'StatusStartingTime'), type: textAt(one, 'ServiceTypeIdentifier'), status: textAt(one, 'ServiceStatus'),
      uses: down([one], 'ServiceInformationExtensions', 'Extension', 'AdditionalServiceInformation', 'URI').flatMap((uri) => /SvcInfoExt\/(For\w+)$/.exec(textOf(uri).trim())?.[1] ?? []),
    })).sort((a, b) => Date.parse(a.from) - Date.parse(b.from))
    const certificates = down([now], 'ServiceDigitalIdentity', 'DigitalId', 'X509Certificate').map((one) => base64(unbase64(textOf(one))))
    return certificates.length && statuses.some((one) => one.type === QC) ? [{ name: textAt(now, 'ServiceName', 'Name'), certificates, statuses }] : []
  })
}

/**
 * What the lists say of some territories: the LOTL checked, then each territory's list, none for a territory without
 * one, null where it can't be read or checked. @param {{ lotl: string, signers: string[], territories: string[] }} asked policy's LOTL, its
 * signers in base64 @param {(address: string) => Promise<string>} read @returns {Promise<{ lists: Record<string, Service[] | null> }>}
 */
export async function listed({ lotl, signers, territories }, read) {
  const pointers = pointersOf((await lotlOf(lotl, signers.map((one) => parts(unbase64(one))), read)).root)
  const lists = await Promise.all(territories.map(async (territory) => {
    const pointer = pointers.find((one) => one.territory === territory && one.xml && one.type === `${LISTS}TSLType/EUgeneric`)
    return /** @type {const} */ ([territory, pointer ? await servicesOf(pointer, read).catch((error) => (console.warn(error), null)) : []])
  }))
  return { lists: Object.fromEntries(lists) }
}

/**
 * The authorities a list granted at a time, as anchors: each certificate, and whether the list says the authority
 * certifies seals (false when it names what it certifies for, seals not among them). @param {Service[]} services @param {Date} at
 * @returns {Anchor[]}
 */
export const anchorsAt = (services, at) => services.flatMap(({ certificates, statuses }) => {
  const then = statuses.findLast((one) => Date.parse(one.from) <= at.getTime())
  return then?.type === QC && then.status === `${LISTS}Svcstatus/granted` ? certificates.map((one) => ({ ...parts(unbase64(one)), seals: !then.uses.length || then.uses.includes('ForeSeals') })) : []
})
