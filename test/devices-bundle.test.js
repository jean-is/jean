// What crosses between a person's paired devices (D700): secrets by their kind, never by id alone, and settings that
// follow the person, field by field and item by item, the newest winning, while what belongs to one device stays.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { memoryFS } from '../app/core/fs.js'
import { crossing } from '../app/ui/secrets.js'
import { DEFAULT_SETTINGS } from '../app/core/settings.js'
import { CONDITIONAL, FOLLOWS, STAYS, following, merged, ownOf, snapshotOf, stamp } from '../app/caps/devices/bundle.js'
import { codeOf } from '../scripts/security.js'

const APP = new URL('../app/', import.meta.url)
const brain = (/** @type {string} */ id, /** @type {string} */ provider, /** @type {string} */ baseURL, more = {}) => ({ id, provider, api: provider === 'device' ? 'device' : 'openai', baseURL, model: 'm', ...more })
const BRAINS = [
  brain('TYPED000000000000000000000', 'openai', 'https://api.openai.com/v1'),
  brain('plan', 'claudecode', 'http://127.0.0.1:23001/v1'),
  brain('oidc', 'openai', 'https://ai.example.org/v1', { auth: 'oidc' }),
  brain('local', 'ollama', 'http://localhost:11434/v1'),
  brain('device', 'device', ''),
]
const CONNECTIONS = [
  { id: 'KEYED000000000000000000000', name: 'K', url: 'https://mcp.example.com/', auth: 'key' },
  { id: 'SGNED000000000000000000000', name: 'O', url: 'https://mcp.example.net/', auth: 'oauth' },
  { id: 'mine', name: 'M', url: 'http://localhost:3000/mcp', auth: 'none' },
]

/** Each kind of secret the code writes, the ids that sample it, and whether those cross. */
const KINDS = /** @type {Record<string, Record<string, boolean>>} */ ({
  brain: { TYPED000000000000000000000: true, plan: false, oidc: false, local: false, device: false },
  connection: { KEYED000000000000000000000: true, SGNED000000000000000000000: false },
  search: { 'search:brave': true },
  site: { 'site:01JSITE0000000000000000000': true }, // a published site's secret (D720)
  'computer-registry': { 'computer-npm': false, 'computer-pypi': false }, // only to the address typed with it, which stays on its device
  'computer-bridge': { 'computer-bridge': false },
  signin: { signin: false, 'signin:audit': false },
  'seal-authority': { 'seal-authority': false },
  share: { 'share:01J': false },
  device: { device: false, devices: false },
  unknown: { 'something-new': false },
})
/** What each is, as the code writes it where that isn't a key typed: a search service's key and engine (web-search.js), tokens, the bridge's port and key. */
const SHAPES = /** @type {Record<string, string>} */ ({ 'search:brave': JSON.stringify({ key: 'secret of search:brave' }), SGNED000000000000000000000: JSON.stringify({ access: 'a', refresh: 'r' }),
  signin: JSON.stringify({ access: 'a', refresh: 'r' }), 'computer-bridge': JSON.stringify({ port: 23001, key: 'k' }) })

/**
 * Every setSecret() in app/, by its module and the expression of its id, with the kind of what it writes: a new one fails
 * until it is classified here and, where it should cross, in crossing().
 */
const KNOWN = /** @type {Record<string, string>} */ ({
  'app/ui/brain-pages.js brain.id': 'brain',
  'app/ui/brains.js brain.id': 'brain',
  'app/caps/machine/machine.js SECRET': 'computer-bridge',
  'app/caps/machine/machine.js brain.id': 'brain', // a plan's: the bridge's key
  'app/caps/signin/signin.js brain.id': 'brain', // an oidc brain's: the organisation's token
  'app/caps/signin/signin.js id': 'signin',
  'app/caps/profiles/profiles.js id': 'brain', // into a child's profile
  'app/caps/connections/connections.js connection.id': 'connection',
  'app/caps/connections/connections.js saved.connection.id': 'connection',
  'app/caps/web-search/web-search.js secretOf(id)': 'search',
  'app/caps/sites/publish.js keyOf(one.path)': 'site',
  'app/caps/computer/page.js `computer-${kind}`': 'computer-registry',
  'app/caps/share/share.js `share:${share.id}`': 'share',
  'app/caps/share/share.js `share:${now.id}`': 'share',
  'app/ee/authority.js KEPT': 'seal-authority',
  'app/caps/devices/devices.js SECRET': 'device', // this device's identity in the profile
  'app/caps/devices/flow.js SECRET': 'device', // the new device's own, into the profile it pairs into
  'app/caps/devices/flow.js DEVICES': 'device', // the devices the profile knows, removed ones too
  'app/caps/devices/flow.js id': 'brain', // what crossed, chosen again by crossing(), or what the new device keeps of its own: a brain's, a connection's, a search service's, a registry's, the bridge's
})

test('the secrets that cross are chosen by their kind: a typed brain key, a connection’s key, search services’, sites’', async () => {
  const ids = Object.values(KINDS).flatMap((kind) => Object.keys(kind))
  const fs = memoryFS({ '.secrets/keys.json': JSON.stringify(Object.fromEntries(ids.map((id) => [id, SHAPES[id] ?? `secret of ${id}`]))) })
  const settings = /** @type {any} */ ({ brains: BRAINS, connections: CONNECTIONS })
  const crossed = await crossing(fs, settings)
  assert.equal(crossed['search:brave'], SHAPES['search:brave'], 'a search service’s key goes as web-search keeps it')
  assert.deepEqual(Object.keys(crossed).sort(), Object.values(KINDS).flatMap((kind) => Object.entries(kind).filter(([, goes]) => goes).map(([id]) => id)).sort())
  assert.equal(crossed.TYPED000000000000000000000, 'secret of TYPED000000000000000000000')
  // A brain's id alone decides nothing: the same id, a plan's now, stays.
  assert.equal((await crossing(fs, /** @type {any} */ ({ brains: [{ ...BRAINS[0], provider: 'chatgpt' }] }))).TYPED000000000000000000000, undefined)
  assert.deepEqual(await crossing(memoryFS(), settings), {})
  // Nor does a brain or a connection named as this device's own secrets are: they never cross.
  const named = /** @type {any} */ ({ brains: [brain('device', 'openai', 'https://api.openai.com/v1'), brain('devices', 'openai', 'https://api.openai.com/v1')], connections: [{ id: 'device', name: 'D', url: 'https://d.example/', auth: 'key' }] })
  assert.deepEqual(Object.keys(await crossing(fs, named)).sort(), ['search:brave', 'site:01JSITE0000000000000000000'])
  // Nor a brain or a connection under an id Jean doesn't give, as a secret that stays has.
  const stays = /** @type {any} */ ({ brains: ['signin', 'computer-bridge', 'seal-authority'].map((id) => brain(id, 'openai', 'https://api.openai.com/v1')), connections: [{ id: 'share:01J', name: 'S', url: 'https://s.example/', auth: 'key' }] })
  assert.deepEqual(Object.keys(await crossing(fs, stays)).sort(), ['search:brave', 'site:01JSITE0000000000000000000'])
  // Nor a brain named as one of the organisation's, whose token its sign-in keeps under that id (policy.brains).
  assert.equal((await crossing(fs, settings, { brains: [{ id: 'TYPED000000000000000000000' }] })).TYPED000000000000000000000, undefined)
})

test('a secret that holds an object never crosses, whatever the record beside it says, but a service account’s key file', async () => {
  const tokens = JSON.stringify({ access: 'a', refresh: 'r', expiresAt: 1 })
  const account = JSON.stringify({ type: 'service_account', client_email: 'x@y.iam.gserviceaccount.com', private_key: 'a pem', private_key_id: 'k' })
  const fs = memoryFS({ '.secrets/keys.json': JSON.stringify({ TYPED000000000000000000000: tokens, KEYED000000000000000000000: '{"port":23001,"key":"bridge"}', VERTEX00000000000000000000: account, 'search:brave': '["a"]', 'computer-npm': '12345', ANTHR000000000000000000000: 'sk-plain' }) })
  const settings = /** @type {any} */ ({ brains: [BRAINS[0], brain('VERTEX00000000000000000000', 'vertex', 'https://aiplatform.googleapis.com/v1'), brain('ANTHR000000000000000000000', 'mistral', 'https://api.mistral.ai/v1')], connections: CONNECTIONS })
  assert.deepEqual(await crossing(fs, settings), { VERTEX00000000000000000000: account, ANTHR000000000000000000000: 'sk-plain' })
})

test('every secret the code writes is of a kind crossing() was told about', () => {
  const found = new Set()
  for (const path of readdirSync(APP, { recursive: true, encoding: 'utf8' })) {
    if (!path.endsWith('.js') || path.startsWith('vendor')) continue
    const code = codeOf(readFileSync(new URL(path, APP), 'utf8'), true)
    for (const [, id] of code.matchAll(/\bsetSecret\(\s*[\w.]+\s*,\s*([^,]+?)\s*,/g)) {
      const key = `app/${path.split('\\').join('/')} ${id}`
      found.add(key)
      assert.ok(KNOWN[key], `${key}: which kind of secret is this, and does it cross?`)
      assert.ok(KINDS[KNOWN[key]], `${key}: ${KNOWN[key]} is no kind crossing() was tested on`)
    }
  }
  assert.deepEqual(Object.keys(KNOWN).filter((key) => !found.has(key)), [], 'no longer written')
})

test('every field of settings either follows the person or stays on its device, and only one of the two', () => {
  const typed = /export interface Settings \{\n([\s\S]*?)\n\}/.exec(readFileSync(new URL('core/types.d.ts', APP), 'utf8'))?.[1] ?? ''
  const fields = [...typed.matchAll(/^ {2}(\w+)\??:/gm)].map(([, name]) => name)
  assert.ok(fields.length > 30)
  assert.deepEqual([...FOLLOWS, ...STAYS].sort(), [...fields].sort())
  assert.equal(new Set([...FOLLOWS, ...STAYS]).size, FOLLOWS.length + STAYS.length)
})

test('the catalogue’s capabilities that hang on a device are the ones a receiving device may lack', () => {
  const catalogue = /export const CATALOGUE = (.*)/.exec(readFileSync(new URL('ui/discovery.js', APP), 'utf8'))?.[1] ?? ''
  assert.deepEqual([...catalogue.matchAll(/\? \['([\w-]+)'\] : \[\]/g)].map(([, id]) => id).sort(), [...CONDITIONAL].sort())
})

test('what goes to another device leaves out what this one alone has', () => {
  const settings = /** @type {any} */ ({
    format: 1, locale: 'fr', name: 'Ada', brains: BRAINS, activeBrain: 'plan', rules: { fetch: 'allow' }, voice: 'Amélie', unlocked: ['files', 'machine', 'brain-local', 'folders', 'sync', 'reflexes', 'tables'],
    offers: {}, auto: true, cloud: false, connections: CONNECTIONS, dictated: 4, dock: { width: 0.4 }, notifications: false,
    urls: { gateway: 'http://localhost:8787/gateway', kiwix: 'http://127.0.0.1:8080', wikipedia: 'https://wiki.example/w/api.php', share: 'https://hst.ing', tavily: 'https://api.tavily.com/', timestamp: 'https://a.example https://[::1]:9/' },
  })
  const out = /** @type {any} */ (following(settings, { catalogue: ['files', 'tables', 'documents'] }))
  assert.deepEqual(Object.keys(out).filter((name) => !FOLLOWS.includes(/** @type {any} */ (name))), [])
  assert.deepEqual(out.brains.map((/** @type {any} */ one) => one.id), ['TYPED000000000000000000000'])
  assert.equal('activeBrain' in out, false, 'a plan’s brain chosen stays chosen here alone')
  assert.deepEqual(out.connections.map((/** @type {any} */ one) => one.id), ['KEYED000000000000000000000', 'SGNED000000000000000000000'])
  assert.deepEqual(out.urls, { wikipedia: 'https://wiki.example/w/api.php' }, 'of its addresses, where its sources read, but on this computer')
  assert.deepEqual(out.unlocked, ['files', 'tables'])
  assert.deepEqual([out.locale, out.name, out.rules], ['fr', 'Ada', undefined], 'an Always allow lets things happen without asking: it stays')
  assert.deepEqual(following(settings).unlocked, ['files', 'reflexes', 'tables'], 'without a catalogue, only this device’s own stay')
  assert.equal(following({ ...settings, cloud: true, activeBrain: 'TYPED000000000000000000000' }).activeBrain, 'TYPED000000000000000000000')
  assert.equal(settings.brains.length, 5, 'settings themselves untouched')
})

/** Settings as a device has them, and its times. @param {any} [more] @returns {any} */
const device = (more = {}) => ({ format: 1, locale: null, brains: [], activeBrain: null, rules: {}, voice: null, unlocked: [], offers: {}, auto: true, cloud: true, ...more })

test('each field and item carries the time it last changed, a removed one its tombstone', () => {
  const before = device({ locale: 'fr', brains: [BRAINS[0], BRAINS[3]], voice: 'x' })
  const after = device({ locale: 'ja', brains: [{ ...BRAINS[0], model: 'n' }], voice: 'y', connections: [CONNECTIONS[0]] })
  const times = stamp(before, after, { fields: { name: 5 } }, 10)
  assert.deepEqual(times.fields, { name: 5, locale: 10 }, 'the voice stays on its device, so it has no time')
  assert.deepEqual(times.brains, { TYPED000000000000000000000: { at: 10 }, local: { at: 10, gone: true, address: '["http://localhost:11434/v1","ollama","openai",null]' } }, 'a tombstone says where it pointed')
  assert.deepEqual(times.connections, { KEYED000000000000000000000: { at: 10 } })
  assert.deepEqual(stamp(after, structuredClone(after), times, 20), times, 'nothing changed, nothing stamped')
  assert.deepEqual(stamp(device({ rules: { a: 'ask', b: 'never' } }), device({ rules: { b: 'never', a: 'ask' } }), {}, 30).fields, {}, 'keys in another order are the same value')
})

test('the newest wins either way, a tombstone removes, and an older snapshot or the same one again changes nothing', () => {
  const [typed, other] = [BRAINS[0], brain('ANTHR000000000000000000000', 'anthropic', 'https://api.anthropic.com/v1')]
  // A, the laptop, names the person and adds a brain; B, the phone, changed its language later.
  const a = device({ name: 'Ada', locale: 'fr', brains: [typed, other], activeBrain: 'ANTHR000000000000000000000', unlocked: ['files', 'tables'] })
  const aTimes = stamp(device(), a, {}, 100)
  const b = device({ locale: 'ja', brains: [typed], activeBrain: 'TYPED000000000000000000000', unlocked: ['files', 'camera'], urls: { kiwix: 'http://localhost:8080' } })
  const bTimes = stamp(device(), b, {}, 50)
  bTimes.fields.locale = 200
  const snapshot = JSON.parse(JSON.stringify(snapshotOf(following(a), aTimes)))
  const { patch, times } = merged(b, bTimes, snapshot)
  assert.deepEqual(patch, { name: 'Ada', brains: [typed, other], activeBrain: 'ANTHR000000000000000000000', unlocked: ['files', 'camera', 'tables'] }, 'B’s newer language stays, its own capabilities too')
  assert.equal(times.fields.name, 100)
  assert.equal(times.fields.locale, 200)
  // The same snapshot again, over what it made: nothing.
  const b2 = { ...b, ...patch }
  assert.deepEqual(merged(b2, times, snapshot).patch, {})
  // The other way: B's newer language goes to A.
  const back = merged(a, aTimes, JSON.parse(JSON.stringify(snapshotOf(following(b2), times))))
  assert.deepEqual(back.patch, { locale: 'ja', unlocked: ['files', 'tables', 'camera'] })
  // A removes a brain: its tombstone removes it on B, and the brain chosen there moves on, as removing one leaves it.
  const a2 = { ...a, brains: [typed], activeBrain: 'TYPED000000000000000000000' }
  const aTimes2 = stamp(a, a2, aTimes, 300)
  const removed = merged(b2, times, snapshotOf(following(a2), aTimes2))
  assert.deepEqual(removed.patch, { brains: [typed], activeBrain: 'TYPED000000000000000000000' })
  assert.deepEqual(removed.times.brains.ANTHR000000000000000000000, { at: 300, gone: true, address: '["https://api.anthropic.com/v1","anthropic","openai",null]' })
  // An older snapshot, from before the removal, brings nothing back, nor anything else.
  assert.deepEqual(merged({ ...b2, ...removed.patch }, removed.times, snapshot).patch, {})
  // B keeps its own address on this computer when A's addresses win.
  const urls = merged(b, bTimes, snapshotOf({ urls: { wikipedia: 'https://wiki.example/w/api.php' } }, { fields: { urls: 400 } }))
  assert.deepEqual(urls.patch, { urls: { wikipedia: 'https://wiki.example/w/api.php', kiwix: 'http://localhost:8080' } })
  // What isn't a field that follows is never taken, whatever its time.
  assert.deepEqual(merged(b, bTimes, { fields: { voice: { value: 'z', at: 999 }, brains: { value: [], at: 999 } }, brains: {}, connections: {} }).patch, {})
})

test('a field cleared on one device goes as null with its time, and is cleared on the other, back to its default where it has one', () => {
  const before = device({ locale: 'fr', name: 'Ada' })
  const after = device({ name: undefined })
  delete after.locale
  const times = stamp(following(before), following(after), {}, 10)
  assert.deepEqual(times.fields, { locale: 10, name: 10 })
  const snapshot = JSON.parse(JSON.stringify(snapshotOf(following(after), times)))
  assert.deepEqual([snapshot.fields.name, snapshot.fields.locale], [{ value: null, at: 10 }, { value: null, at: 10 }])
  const { patch } = merged(device({ locale: 'fr', name: 'Ada' }), { fields: { name: 5, locale: 5 } }, snapshot)
  assert.deepEqual(patch, { name: undefined, locale: DEFAULT_SETTINGS.locale })
  // Absent and null are the same: nothing stamped, and nothing goes back and forth.
  assert.deepEqual(stamp(device({ locale: null }), device({ name: undefined }), {}, 20).fields, {})
  assert.deepEqual(merged(device({ name: undefined }), {}, snapshot).patch, {})
  // An older one changes nothing; nor does a field never set, which has no time to go with.
  assert.deepEqual(merged(device({ name: 'Ada' }), { fields: { name: 50 } }, snapshot).patch, {})
  assert.equal('name' in snapshotOf(following(device()), {}).fields, false)
})

test('what a device keeps of its own when another’s profile comes: all that stays, and of what follows, what is its alone', () => {
  const settings = /** @type {any} */ ({ ...device({ voice: 'Kyoko', dock: { width: 0.3 }, name: 'B', locale: 'ja', rules: { fetch: 'never' } }), brains: BRAINS, activeBrain: 'local', connections: CONNECTIONS,
    unlocked: ['files', 'machine', 'brain-local', 'folders', 'sync', 'camera'], urls: { kiwix: 'http://localhost:8080', wikipedia: 'https://wiki.example/w/api.php' } })
  const own = /** @type {any} */ (ownOf(settings))
  assert.deepEqual(Object.keys(own).filter((name) => FOLLOWS.includes(/** @type {any} */ (name))).sort(), ['activeBrain', 'brains', 'connections', 'rules', 'unlocked', 'urls'])
  assert.deepEqual(own.rules, { fetch: 'never' }, 'its approvals whole, as its choices for services')
  assert.deepEqual([own.voice, own.dock, own.cloud], ['Kyoko', { width: 0.3 }, true])
  assert.deepEqual(own.brains.map((/** @type {any} */ one) => one.id), ['plan', 'oidc', 'local', 'device'])
  assert.equal(own.activeBrain, 'local')
  assert.deepEqual(own.connections.map((/** @type {any} */ one) => one.id), ['mine'])
  assert.deepEqual(own.urls, { kiwix: 'http://localhost:8080' })
  assert.deepEqual(own.unlocked, ['machine', 'brain-local', 'folders', 'sync'])
  assert.equal(ownOf({ ...settings, activeBrain: 'TYPED000000000000000000000' }).activeBrain, null, 'a brain chosen that follows is chosen again from what comes')
  assert.equal('urls' in ownOf({ ...settings, urls: { wikipedia: 'https://wiki.example/w/api.php' }, connections: [] }), false)
})

test('what a device keeps for itself, a plan, a local brain, a connection on this computer, is never added, changed or removed from elsewhere', () => {
  const own = device({ brains: [BRAINS[1], BRAINS[3]], connections: [CONNECTIONS[2]] })
  const snapshot = { fields: {}, brains: { plan: { value: null, at: 9 }, local: { value: BRAINS[0], at: 9 }, mine: { value: brain('mine', 'ollama', 'http://localhost:1/v1'), at: 9 } },
    connections: { mine: { value: null, at: 9 }, near: { value: { id: 'near', name: 'N', url: 'http://127.0.0.1:9/mcp', auth: 'none' }, at: 9 } } }
  assert.deepEqual(merged(own, {}, /** @type {any} */ (snapshot)).patch, {})
})

test('two devices that changed a field at the same moment settle on the same value', () => {
  const [x, y] = [device({ locale: 'fr' }), device({ locale: 'de' })]
  const at = { fields: { locale: 7 }, brains: {}, connections: {} }
  const onX = merged(x, at, snapshotOf(following(y), at)).patch.locale ?? 'fr'
  const onY = merged(y, at, snapshotOf(following(x), at)).patch.locale ?? 'de'
  assert.equal(onX, onY)
})
