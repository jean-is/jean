// The EU's trusted lists for the tests (D439), as ETSI TS 119 612 writes them: a List of Trusted Lists pointing to
// member states' lists, each naming qualified authorities (CA/QC) with their statuses over time, and each enveloped-
// signed as every real one is (XMLDSig, exclusive canonicalization, ECDSA here, its XAdES properties named by Id)
// by the authority the test chooses. Comments, references, CDATA and prefixes in them, as canonicalization must take.
// The unit tests and the browser tests' routes share it.
import { parse, canonical, childrenOf } from '../../app/ee/xml.js'

/** @typedef {import('./ca.js').Authority} Authority */
/** @typedef {{ from: string, status: 'granted' | 'withdrawn', uses?: string[] }} Status */

const DSIG = 'http://www.w3.org/2000/09/xmldsig#'
const EXCLUSIVE = 'http://www.w3.org/2001/10/xml-exc-c14n#'
const ETSI = 'http://uri.etsi.org/TrstSvc/'
/** @param {Uint8Array} der */
const base64 = (der) => Buffer.from(der).toString('base64')
/** @param {string} text */
const sha256 = async (text) => Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))).toString('base64')
/** @param {Uint8Array[]} certificates */
const identities = (certificates) => certificates.map((one) => `<ServiceDigitalIdentity><DigitalId><X509Certificate>${base64(one)}</X509Certificate></DigitalId></ServiceDigitalIdentity>`).join('')
/** @param {string} name @param {string} type @param {string} territory @param {string} issued @param {string} [more] */
const scheme = (name, type, territory, issued, more = '') => `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<TrustServiceStatusList xmlns="http://uri.etsi.org/02231/v2#" xmlns:ns3="http://uri.etsi.org/02231/v2/additionaltypes#" Id="tsl" TSLTag="http://uri.etsi.org/19612/TSLTag">
  <SchemeInformation>
    <!-- What it is, and who keeps it. -->
    <TSLVersionIdentifier>6</TSLVersionIdentifier>
    <TSLType>${ETSI}TrustedList/TSLType/${type}</TSLType>
    <SchemeOperatorName><Name xml:lang="en">${name}</Name></SchemeOperatorName>
    <SchemeTerritory>${territory}</SchemeTerritory>
    ${more}
    <ListIssueDateTime>${issued}</ListIssueDateTime>
  </SchemeInformation>`

/**
 * A list enveloped-signed by an authority: the whole document but the signature, and its XAdES signed properties,
 * canonicalized exclusively and hashed with SHA-256, then SignedInfo signed with ECDSA P-256, its certificate in KeyInfo.
 * @param {string} xml @param {Authority} by
 */
export async function signed(xml, by) {
  const close = xml.lastIndexOf('</TrustServiceStatusList>')
  const whole = await sha256(canonical(parse(xml)))
  /** @param {string} properties @param {string} value */
  const placed = (properties, value) => `${xml.slice(0, close)}<ds:Signature xmlns:ds="${DSIG}" Id="sig"><ds:SignedInfo><ds:CanonicalizationMethod Algorithm="${EXCLUSIVE}"/><ds:SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha256"/><ds:Reference Id="whole" URI=""><ds:Transforms><ds:Transform Algorithm="${DSIG}enveloped-signature"/><ds:Transform Algorithm="${EXCLUSIVE}"/></ds:Transforms><ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/><ds:DigestValue>${whole}</ds:DigestValue></ds:Reference><ds:Reference Type="http://uri.etsi.org/01903#SignedProperties" URI="#properties"><ds:Transforms><ds:Transform Algorithm="${EXCLUSIVE}"/></ds:Transforms><ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/><ds:DigestValue>${properties}</ds:DigestValue></ds:Reference></ds:SignedInfo><ds:SignatureValue Id="value">${value}</ds:SignatureValue><ds:KeyInfo><ds:X509Data><ds:X509Certificate>${base64(by.certificate)}</ds:X509Certificate></ds:X509Data></ds:KeyInfo><ds:Object><xades:QualifyingProperties xmlns:xades="http://uri.etsi.org/01903/v1.3.2#" Target="#sig"><xades:SignedProperties Id="properties"><xades:SignedSignatureProperties><xades:SigningTime>2026-10-01T00:00:00Z</xades:SigningTime></xades:SignedSignatureProperties></xades:SignedProperties></xades:QualifyingProperties></ds:Object></ds:Signature>${xml.slice(close)}`
  const signature = (/** @type {string} */ text) => childrenOf(parse(text).root, DSIG, 'Signature')[0]
  const [object] = childrenOf(signature(placed('', '')), DSIG, 'Object')
  const properties = await sha256(canonical(childrenOf(childrenOf(object)[0])[0]))
  const [info] = childrenOf(signature(placed(properties, '')), DSIG, 'SignedInfo')
  const value = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, by.keys.privateKey, new TextEncoder().encode(canonical(info)))
  return placed(properties, base64(new Uint8Array(value)))
}

/**
 * A List of Trusted Lists: its pivots' addresses, each member state's list with the certificates whose keys may sign
 * it, and the certificates of the keys that may sign the LOTLs after it. @param {{ issued: string, announced: Uint8Array[],
 * pivots?: string[], lists: { territory: string, location: string, signers: Uint8Array[] }[] }} given
 */
export const lotl = ({ issued, announced, pivots = [], lists }) => `${scheme('European Commission', 'EUlistofthelists', 'EU', issued, `<SchemeInformationURI><URI xml:lang="en">https://eur-lex.example/oj</URI>${pivots.map((one) => `<URI xml:lang="en">${one}</URI>`).join('')}</SchemeInformationURI>
    <PointersToOtherTSL>${[{ territory: 'EU', location: 'https://lists.fake.example/eu-lotl.xml', signers: announced, type: 'EUlistofthelists' }, ...lists].map(({ territory, location, signers, type = 'EUgeneric' }) => `
      <OtherTSLPointer><ServiceDigitalIdentities>${identities(signers)}</ServiceDigitalIdentities><TSLLocation>${location}</TSLLocation><AdditionalInformation><OtherInformation><TSLType>${ETSI}TrustedList/TSLType/${type}</TSLType></OtherInformation><OtherInformation><SchemeTerritory>${territory}</SchemeTerritory></OtherInformation><OtherInformation><ns3:MimeType>application/vnd.etsi.tsl+xml</ns3:MimeType></OtherInformation></AdditionalInformation></OtherTSLPointer>`).join('')}
    </PointersToOtherTSL>`)}
</TrustServiceStatusList>`

/**
 * A member state's list: its qualified authorities for certificates, each with its certificate and its statuses,
 * the latest its current one, those before in its history. @param {{ territory: string, issued: string,
 * services: { name: string, certificate: Uint8Array, statuses: Status[] }[] }} given
 */
export const memberList = ({ territory, issued, services }) => `${scheme(`Supervisory body of ${territory}`, 'EUgeneric', territory, issued)}
  <TrustServiceProviderList><TrustServiceProvider><TSPInformation><TSPName><Name xml:lang="en">Fake QTSP &amp; Co</Name></TSPName></TSPInformation><TSPServices>${services.map(({ name, certificate, statuses }) => {
    /** @param {Status} status @param {string} tag */
    const info = ({ from, status, uses = ['ForeSignatures', 'ForeSeals'] }, tag) => `<${tag}><ServiceTypeIdentifier>${ETSI}Svctype/CA/QC</ServiceTypeIdentifier><ServiceName><Name xml:lang="en"><![CDATA[${name}]]></Name></ServiceName><ServiceDigitalIdentity><DigitalId><X509Certificate>${base64(certificate)}</X509Certificate></DigitalId></ServiceDigitalIdentity><ServiceStatus>${ETSI}TrustedList/Svcstatus/${status}</ServiceStatus><StatusStartingTime>${from}</StatusStartingTime><ServiceInformationExtensions>${uses.map((use) => `<Extension Critical="true"><AdditionalServiceInformation><URI xml:lang="en">${ETSI}TrustedList/SvcInfoExt/${use}</URI></AdditionalServiceInformation></Extension>`).join('')}</ServiceInformationExtensions></${tag}>`
    const [now, ...before] = [...statuses].reverse()
    return `
    <TSPService>${info(now, 'ServiceInformation')}${before.length ? `<ServiceHistory>${before.map((one) => info(one, 'ServiceHistoryInstance')).join('')}</ServiceHistory>` : ''}</TSPService>`
  }).join('')}
  </TSPServices></TrustServiceProvider></TrustServiceProviderList>
</TrustServiceStatusList>`
