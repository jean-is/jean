// The EU's trusted lists as anchors (D439, ee/): XML read and written back as exclusive canonicalization says, as
// libxml2 writes it; a real member state's list's signature checked by the key the LOTL names for it; and fixture
// lists, a LOTL signed by a key policy carries, or by one its pivots announce, pointing to a member state's list
// whose qualified authority vouches for a seal while the list granted it. A list changed after it was signed, or
// signed by another key, gives no anchors.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { parse, canonical, signer } from '../app/ee/xml.js'
import { listed, anchorsAt } from '../app/ee/lists.js'
import { verdict, anchorsOf, listsOf, territoriesOf } from '../app/ee/trust.js'
import { parts, base64, unbase64 } from '../app/ee/pkix.js'
import { revocation, lasting } from '../app/ee/lasting.js'
import { makeSeal, seal, thumbprint, ISSUER } from '../app/caps/receipt/certificate.js'
import { authority, issue, ocspAnswer, QUALIFIED } from './fixtures/ca.js'
import { signed, lotl, memberList } from './fixtures/lists.js'

const LOTL = 'https://lists.fake.example/eu-lotl.xml'
const FR = 'https://lists.fake.example/tl-fr.xml'
const OCSP = 'http://ocsp.qtsp.fake.example'
const SEALED_AT = new Date('2026-10-19T10:00:00Z')

// The Official Journal's key, one a pivot announced after it, one retired before it, and France's list's.
const journal = await authority('LOTL signer', { from: new Date('2026-02-01T00:00:00Z') })
const next = await authority('Next LOTL signer')
const retired = await authority('Retired LOTL signer')
const operator = await authority('French list operator', { country: 'FR' })
// A qualified provider in France: the authority its list names, and the organisation's seal it certified.
const qualifiedCA = await authority('Qualified Seal CA', { country: 'FR', ocsp: `${OCSP}/ca` })

/** @param {Uint8Array} der */
const pem = (der) => `-----BEGIN CERTIFICATE-----\n${base64(der).match(/.{1,64}/g)?.join('\n')}\n-----END CERTIFICATE-----\n`
/** France's list, signed by its operator: the qualified authority granted from March, unless said otherwise. @param {{ statuses?: import('./fixtures/lists.js').Status[], by?: import('./fixtures/ca.js').Authority }} [given] */
const french = async ({ statuses = [{ from: '2026-03-01T00:00:00Z', status: 'granted' }], by = operator } = {}) => signed(memberList({ territory: 'FR', issued: '2026-10-01T00:00:00Z', services: [{ name: 'Qualified Seal CA', certificate: qualifiedCA.certificate, statuses }] }), by)
/** The LOTL, pointing to France's list. @param {{ by?: import('./fixtures/ca.js').Authority, pivots?: string[], signers?: Uint8Array[] }} [given] */
const lotlBy = async ({ by = journal, pivots = [], signers = [operator.certificate] } = {}) => signed(lotl({ issued: '2026-10-15T00:00:00Z', announced: [journal.certificate], pivots, lists: [{ territory: 'FR', location: FR, signers }] }), by)
/** How the lists are read: from these, and what was asked. @param {Record<string, string>} served */
const reader = (served) => {
  const asked = /** @type {string[]} */ ([])
  return { asked, read: async (/** @type {string} */ address) => (asked.push(address), served[address] ?? Promise.reject(new Error(`${address}: 404`))) }
}
const policy = [{ lotl: LOTL, signers: [pem(journal.certificate)] }]

test('XML is written back as exclusive canonicalization says, as libxml2 writes it: namespaces where used, attributes sorted, text escaped, comments left out', () => {
  const given = `<?xml version="1.0" encoding="UTF-8"?>
<?first instruction?>
<!-- dropped -->
<a:root xmlns:a="urn:a" xmlns="urn:default" xmlns:unused="urn:unused" z="1" a:y="2" b="&#9;tab&#10;line">
  <child  c='single "quotes"' xml:lang="fr">x &lt; y &amp; z &gt; w &#13; <![CDATA[<raw> & ]]>é&#x1F600;</child>
  <plain xmlns=""><a:deep/><!-- gone --></plain>
  <?inside data?>
</a:root>
<?after?>
`
  assert.equal(canonical(parse(given)), '<?first instruction?>\n<a:root xmlns:a="urn:a" b="&#x9;tab&#xA;line" z="1" a:y="2">\n  <child xmlns="urn:default" c="single &quot;quotes&quot;" xml:lang="fr">x &lt; y &amp; z &gt; w &#xD; &lt;raw&gt; &amp; é😀</child>\n  <plain><a:deep></a:deep></plain>\n  <?inside data?>\n</a:root>\n<?after?>')
  // An element alone declares what it uses from its ancestors' namespaces.
  assert.equal(canonical(parse(given).root.children.find((one) => typeof one === 'object' && 'local' in one && one.local === 'plain')), '<plain><a:deep xmlns:a="urn:a"></a:deep></plain>')
  for (const bad of ['<!DOCTYPE a [<!ENTITY x SYSTEM "file:///etc/passwd">]><a>&x;</a>', '<a>&unknown;</a>', '<a><b></a>', '<a/><b/>', '<p:a/>', 'text']) assert.throws(() => parse(bad), /XML/, bad)
})

test('a real member state’s list is signed by the key the LOTL names for it, and a byte changed breaks its signature', async () => {
  // Cyprus's list as it was on 16 September 2026; the LOTL of 15 October 2026 names its signer for CY.
  const xml = await readFile(new URL('./fixtures/tl-cy.xml', import.meta.url), 'utf8')
  const keyInfo = unbase64(/X509Certificate>([^<]+)</.exec(xml.slice(xml.lastIndexOf('SignatureValue')))?.[1] ?? '')
  assert.equal(createHash('sha256').update(keyInfo).digest('hex'), 'fd36c8e74907da36ba613c0af12a19591d7c1f97cf07ad3c3a43ffb202763be1')
  const { spki } = parts(keyInfo)
  assert.equal(await signer(parse(xml), [qualifiedCA.spki, spki]), 1)
  assert.ok(xml.includes('Svcstatus/withdrawn'))
  assert.equal(await signer(parse(xml.replace('Svcstatus/withdrawn', 'Svcstatus/granted')), [spki]), -1)
  assert.equal(await signer(parse(xml), [qualifiedCA.spki]), -1)
})

test('the LOTL signed by a key policy carries points to a member state’s list signed by a key it names for it: its qualified authorities, with their statuses over time', async () => {
  const { asked, read } = reader({ [LOTL]: await lotlBy(), [FR]: await french({ statuses: [{ from: '2026-03-01T00:00:00Z', status: 'granted', uses: ['ForeSignatures'] }, { from: '2026-06-01T00:00:00Z', status: 'granted' }, { from: '2026-11-01T00:00:00Z', status: 'withdrawn' }] }) })
  const { lists } = await listed({ lotl: LOTL, signers: listsOf(policy)[0].signers, territories: ['FR', 'US'] }, read)
  assert.deepEqual(asked, [LOTL, FR])
  // No list for a territory outside the EU's, which isn't one left unread.
  assert.deepEqual(lists.US, [])
  const [service] = lists.FR ?? []
  assert.equal(service.name, 'Qualified Seal CA')
  assert.deepEqual(service.statuses.map(({ from, status }) => [from, status.split('/').pop()]), [['2026-03-01T00:00:00Z', 'granted'], ['2026-06-01T00:00:00Z', 'granted'], ['2026-11-01T00:00:00Z', 'withdrawn']])
  // An anchor while granted, saying whether it certifies seals then; none before, or once withdrawn.
  assert.deepEqual(anchorsAt(service ? [service] : [], new Date('2026-04-01')).map(({ der, seals }) => [base64(der), seals]), [[base64(qualifiedCA.certificate), false]])
  assert.deepEqual(anchorsAt([service], SEALED_AT).map(({ seals }) => seals), [true])
  assert.deepEqual(anchorsAt([service], new Date('2026-02-01')), [])
  assert.deepEqual(anchorsAt([service], new Date('2026-12-01')), [])
})

test('a list changed after it was signed, or signed by a key not named for it, gives nothing: whoever relays the lists can withhold them, never choose them', async (t) => {
  t.mock.method(console, 'warn', () => {})
  const lotlXml = await lotlBy()
  const frXml = await french({ statuses: [{ from: '2026-03-01T00:00:00Z', status: 'withdrawn' }] })
  const signers = listsOf(policy)[0].signers
  // France's list says granted where it was signed saying withdrawn.
  const tampered = reader({ [LOTL]: lotlXml, [FR]: frXml.replace('Svcstatus/withdrawn', 'Svcstatus/granted') })
  assert.equal((await listed({ lotl: LOTL, signers, territories: ['FR'] }, tampered.read)).lists.FR, null)
  // Signed again, by a key the LOTL doesn't name for France.
  const other = await authority('Another operator', { country: 'FR' })
  assert.equal((await listed({ lotl: LOTL, signers, territories: ['FR'] }, reader({ [LOTL]: lotlXml, [FR]: await french({ by: other }) }).read)).lists.FR, null)
  // The LOTL naming another key for France, signed by a key policy doesn't carry; or changed after it was signed.
  await assert.rejects(listed({ lotl: LOTL, signers, territories: ['FR'] }, reader({ [LOTL]: await lotlBy({ by: other, signers: [other.certificate] }) }).read), /isn’t signed by a key named for it/)
  await assert.rejects(listed({ lotl: LOTL, signers, territories: ['FR'] }, reader({ [LOTL]: lotlXml.replace(base64(operator.certificate), base64(other.certificate)) }).read), /isn’t signed by a key named for it/)
})

test('a LOTL signed by a key a pivot announced counts once that pivot is signed by policy’s key and issued after it; an older pivot can’t bring back a retired key', async () => {
  const PIVOT = 'https://lists.fake.example/eu-lotl-pivot-2.xml'
  const OLD = 'https://lists.fake.example/eu-lotl-pivot-1.xml'
  const signers = listsOf(policy)[0].signers
  // Pivot 2, after the Official Journal's key, signed by it, announces the next key, which signs the LOTL.
  const pivot = await signed(lotl({ issued: '2026-05-01T00:00:00Z', announced: [next.certificate], lists: [] }), journal)
  const { asked, read } = reader({ [LOTL]: await lotlBy({ by: next, pivots: [PIVOT] }), [PIVOT]: pivot, [FR]: await french() })
  assert.equal((await listed({ lotl: LOTL, signers, territories: ['FR'] }, read)).lists.FR?.length, 1)
  assert.deepEqual(asked, [LOTL, PIVOT, FR])
  // Pivot 1, issued before the journal's key, signed by it all the same, announces a key since retired: skipped.
  const old = await signed(lotl({ issued: '2026-01-15T00:00:00Z', announced: [retired.certificate], lists: [] }), journal)
  await assert.rejects(listed({ lotl: LOTL, signers, territories: ['FR'] }, reader({ [LOTL]: await lotlBy({ by: retired, pivots: [OLD] }), [OLD]: old }).read), /isn’t signed by a key named for it/)
})

test('a seal its member state’s list granted when it sealed is trusted, and qualified when the list says its authority certifies seals', async () => {
  const own = await makeSeal(new Date('2026-01-01T00:00:00Z'))
  const leaf = await issue({ spki: new Uint8Array(await crypto.subtle.exportKey('spki', own.keys.publicKey)), subject: 'Acme SA', country: 'FR', issuer: qualifiedCA, ocsp: `${OCSP}/seal`, usages: ['1.3.6.1.5.5.7.3.36'], statements: QUALIFIED })
  const sealed = await seal({ type: ['VerifiableCredential'], issuer: ISSUER + await thumbprint(own.keys.publicKey) }, { ...own, certificate: leaf, chain: [] }, SEALED_AT)
  const send = async (/** @type {string} */ address, /** @type {RequestInit} */ init) => new Response(await ocspAnswer(new Uint8Array(await new Response(init.body).arrayBuffer()), { signer: qualifiedCA }))
  const made = lasting(sealed, [leaf, qualifiedCA.certificate], await revocation([[leaf, qualifiedCA.certificate]], send))
  assert.deepEqual(territoriesOf(made), ['FR'])
  const { lists } = await listed({ lotl: LOTL, signers: listsOf(policy)[0].signers, territories: territoriesOf(made) }, reader({ [LOTL]: await lotlBy(), [FR]: await french() }).read)
  const anchors = (/** @type {Date} */ at) => [...anchorsOf(policy), ...anchorsAt(lists.FR ?? [], at)]
  assert.deepEqual(await verdict(made, anchors(SEALED_AT), SEALED_AT), { status: 'trusted', name: 'Qualified Seal CA', qualified: true })
  // Before the list granted it, the organisation trusts nothing that vouches for it.
  assert.deepEqual(await verdict(made, anchors(new Date('2026-02-01')), new Date('2026-02-01')), { status: 'untrusted', name: 'Qualified Seal CA' })
  // Granted for signatures only: trusted, not a qualified seal.
  const signatures = await listed({ lotl: LOTL, signers: listsOf(policy)[0].signers, territories: ['FR'] }, reader({ [LOTL]: await lotlBy(), [FR]: await french({ statuses: [{ from: '2026-03-01T00:00:00Z', status: 'granted', uses: ['ForeSignatures'] }] }) }).read)
  assert.deepEqual(await verdict(made, anchorsAt(signatures.lists.FR ?? [], SEALED_AT), SEALED_AT), { status: 'trusted', name: 'Qualified Seal CA' })
})

test('policy names the EU’s lists by the LOTL’s HTTPS address and the Official Journal’s certificates, beside its own anchors; anything else is said', () => {
  const both = [pem(journal.certificate), ...policy]
  assert.equal(anchorsOf(both).length, 1)
  assert.deepEqual(listsOf(both), [{ lotl: LOTL, signers: [base64(journal.certificate)] }])
  for (const bad of [{ lotl: 'http://lists.fake.example/eu-lotl.xml', signers: [pem(journal.certificate)] }, { lotl: LOTL }, { lotl: LOTL, signers: [] }, { lotl: LOTL, signers: ['not a certificate'] }]) {
    assert.throws(() => anchorsOf([pem(journal.certificate), bad]), /trust\[1\] names the EU’s List of Trusted Lists/)
  }
})
