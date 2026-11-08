// What a paired device keeps and does with what comes (caps/devices/flow.js, D700), over profiles in memory: its name, the bundle A sends
// and B's profile filled from it, a task handed over, the devices listed, settings and keys that follow, and a device removed.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { memoryFS, readJSON, walk } from '../app/core/fs.js'
import { DEFAULT_SETTINGS, loadSettings, saveSettings, stringifyFrontMatter } from '../app/core/settings.js'
import { ulid } from '../app/core/ulid.js'
import { boxPair } from '../app/ui/seal.js'
import { getSecret, setSecret, deleteSecret } from '../app/ui/secrets.js'
import { base64url, random } from '../app/caps/share/seal.js'
import { isBackedUp } from '../app/caps/backup/archive.js'
import { carried } from '../app/caps/sync/mirror.js'
import { following, snapshotOf } from '../app/caps/devices/bundle.js'
import { headersFor } from '../app/core/llm.js'
import { owed, merged } from '../app/caps/devices/epochs.js'
import { SECRET, DEVICES, STORE, STORED, TIMES, carrying, shaped, deviceName, recordFor, recordsOf, listOf, changeList, mergeLists, tell, quiet, writeRecord, writeOwn, inPlace, bundleOf, adopt, refill, untouched, taskOf, arrive, receive, removal, look, share, unreached, known, back, firstOf, broughtFrom, alone } from '../app/caps/devices/flow.js'

const T = 1_800_000_000_000
const CATALOGUE = ['files', 'tables', 'documents', 'camera']
const HOME = `projects/${ulid(T)}-home`
const WORK = `projects/${ulid(T + 1)}-work`
const HEALTH = `projects/${ulid(T + 2)}-health`
const brain = (/** @type {string} */ id, /** @type {string} */ provider, /** @type {string} */ baseURL) => ({ id, provider, api: 'openai', baseURL, model: 'm' })
const BRAINS = [brain('TYPED000000000000000000000', 'openai', 'https://api.openai.com/v1'), brain('plan', 'claudecode', 'http://127.0.0.1:23001/v1'), brain('local', 'ollama', 'http://localhost:11434/v1')]
const CONNECTIONS = [{ id: 'KEYED000000000000000000000', name: 'Notes', url: 'https://mcp.example.com/', auth: 'key' }, { id: 'SGNED000000000000000000000', name: 'Mail', url: 'https://mcp.example.net/', auth: 'oauth' }]

/** A device's identity, as the secret `device` holds it. @returns {Promise<import('../app/caps/devices/flow.js').Identity>} */
const identity = async () => ({ id: ulid(), ...await boxPair(), token: base64url(random(32)), mailbox: base64url(random(16)) })
/** @param {import('../app/caps/devices/flow.js').Identity} one @param {string} name */
const recordOfIt = (one, name) => recordFor(one, name, T)

/** A handler's context over a profile's files, what it sends kept. @param {import('../app/core/types.js').FS} fs @param {import('../app/caps/devices/flow.js').Identity} me */
function context(fs, me, at = T) {
  /** @type {{ to: string, value: any }[]} */
  const sent = []
  const ctx = { fs, me, catalogue: CATALOGUE, now: () => at, settings: () => loadSettings(fs),
    change: async (/** @type {object} */ patch) => saveSettings(fs, { ...await loadSettings(fs), ...patch }),
    // As ui/relay.js's send(), the message's number, from 1.
    send: async (/** @type {{ id: string }} */ to, /** @type {object} */ value) => sent.push({ to: to.id, value: structuredClone(value) }) }
  return { ctx, sent, at: (/** @type {number} */ time) => { at = time } }
}

const project = (/** @type {object} */ data) => stringifyFrontMatter({ format: 1, createdAt: new Date(T).toISOString(), by: 'user', ...data }, '')

test('a device is named by its system, then its browser, or the desktop app by its system', () => {
  const ua = {
    iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
    chromeOnIphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/124.0.6367.88 Mobile/15E148 Safari/604.1',
    edge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0',
    mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
    android: 'Mozilla/5.0 (Android 14; Mobile; rv:125.0) Gecko/125.0 Firefox/125.0',
    linux: 'Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0',
    chromebook: 'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    samsung: 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/24.0 Chrome/117.0.0.0 Mobile Safari/537.36',
  }
  assert.equal(deviceName({ userAgent: ua.iphone }), 'iPhone · Safari')
  assert.equal(deviceName({ userAgent: ua.chromeOnIphone }), 'iPhone · Chrome')
  assert.equal(deviceName({ userAgent: ua.edge }), 'Windows · Edge')
  assert.equal(deviceName({ userAgent: ua.mac }), 'Mac · Safari')
  assert.equal(deviceName({ userAgent: ua.mac, touch: 5 }), 'iPad · Safari', 'an iPad’s Safari says Macintosh')
  assert.equal(deviceName({ userAgent: ua.android }), 'Android · Firefox')
  assert.equal(deviceName({ userAgent: ua.linux }), 'Linux · Firefox')
  assert.equal(deviceName({ userAgent: ua.samsung }), 'Android · Samsung Internet')
  // What the browser says of itself comes first.
  assert.equal(deviceName({ userAgent: ua.edge, platform: 'macOS', brands: [{ brand: 'Chromium' }, { brand: 'Google Chrome' }, { brand: 'Not_A Brand' }] }), 'Mac · Chrome')
  assert.equal(deviceName({ userAgent: ua.edge, platform: 'Windows', brands: [{ brand: 'Not/A)Brand' }, { brand: 'Microsoft Edge' }, { brand: 'Chromium' }] }), 'Windows · Edge')
  assert.equal(deviceName({ userAgent: ua.chromebook, platform: 'Chrome OS', brands: [{ brand: 'Chromium' }] }), 'ChromeOS · Chrome', 'Chromium alone: the user agent tells')
  assert.equal(deviceName({ userAgent: ua.chromebook }), 'ChromeOS · Chrome')
  // The desktop app: its system and its name.
  assert.equal(deviceName({ userAgent: ua.mac, os: 'Darwin', app: 'Jean' }), 'Mac · Jean')
  assert.equal(deviceName({ os: 'Windows', app: 'Jean' }), 'Windows · Jean')
  assert.equal(deviceName({ os: 'Linux', app: 'Jean' }), 'Linux · Jean')
  assert.equal(deviceName({}), '')
})

/** A's profile: settings with brains and connections of every kind, a key of every kind, two projects with a task, and A's own record. */
async function profileA() {
  const me = await identity()
  const fs = memoryFS({
    'settings.json': JSON.stringify({ ...DEFAULT_SETTINGS, locale: 'fr', name: 'Ada', voice: 'Amélie', brains: BRAINS, activeBrain: 'TYPED000000000000000000000', connections: CONNECTIONS, unlocked: ['files', 'machine', 'reflexes', 'tables'] }),
    '.secrets/keys.json': JSON.stringify({ TYPED000000000000000000000: 'key of typed', plan: 'key of plan', KEYED000000000000000000000: 'key of keyed', SGNED000000000000000000000: 'token of oauth', 'search:brave': 'key of brave',
      'computer-bridge': 'key of the bridge', signin: 'token of signin', 'share:01J': 'share', 'seal-authority': 'seal', [SECRET]: JSON.stringify(me) }),
    [`${HOME}/project.md`]: project({ default: true, name: 'Home' }),
    [`${WORK}/project.md`]: project({ name: 'Work' }),
    [`${WORK}/conversations/${ulid(T)}.jsonl`]: '{"format":1,"kind":"conversation"}\n',
  })
  await writeRecord(fs, recordOfIt(me, 'Mac · Chrome'))
  return { fs, me }
}

test('A’s bundle: settings and keys with the times they changed, nothing stamped anew, the keys that cross and no other, every project.md, the devices with B among them', async () => {
  const { fs, me } = await profileA()
  const b = await identity()
  const you = recordOfIt(b, 'iPhone · Safari')
  const profile = { dir: `profiles/${ulid(T)}-ada`, name: 'Ada', colour: 'oklch(0.74 0.17 150)' }
  const { ctx, at } = context(fs, me)
  await look(ctx)
  at(T + 5)
  await saveSettings(fs, { ...await loadSettings(fs), locale: 'de' })
  await look(ctx)
  at(T + 9)
  const bundle = await bundleOf(ctx, profile, you)
  assert.equal(bundle.kind, 'bundle')
  assert.equal(bundle.you, b.id)
  assert.deepEqual(bundle.profile, profile)
  assert.deepEqual(Object.keys(bundle.keys).sort(), ['KEYED000000000000000000000', 'TYPED000000000000000000000', 'search:brave'])
  assert.deepEqual(bundle.keys.TYPED000000000000000000000, { value: 'key of typed', at: 0 }, 'each key with its time, none here: it never changed since')
  const text = JSON.stringify(bundle)
  for (const kept of ['key of plan', 'token of oauth', 'key of the bridge', 'token of signin', '"share"', '"seal"', me.token, /** @type {string} */ (me.key.d)]) assert.ok(!text.includes(kept), kept)
  assert.deepEqual(bundle.projects.map((/** @type {{ path: string }} */ one) => one.path), [`${HOME}/project.md`, `${WORK}/project.md`])
  assert.match(bundle.projects[0].text, /default: true/)
  assert.deepEqual(bundle.devices.map((/** @type {{ id: string }} */ one) => one.id), [me.id, b.id])
  // Each field with the time it changed: B may leave it unopened, and a time made up now would beat a change made elsewhere before.
  assert.deepEqual([bundle.settings.fields.locale, bundle.settings.fields.name.at], [{ value: 'de', at: T + 5 }, 0])
  assert.deepEqual(Object.keys(bundle.settings.brains), ['TYPED000000000000000000000'])
  assert.equal(bundle.settings.fields.voice, undefined, 'the voice stays on its device')
  const kept = await readJSON(fs, TIMES)
  assert.deepEqual(kept.fields, { locale: T + 5 })
  assert.deepEqual(kept.seen, JSON.parse(JSON.stringify(following(await loadSettings(fs)))))
  // Of the keys, follows.json keeps when each changed and its hash, never the key.
  assert.deepEqual(Object.keys(kept.keys).sort(), ['KEYED000000000000000000000', 'TYPED000000000000000000000', 'search:brave'])
  assert.equal(kept.keys.TYPED000000000000000000000.at, 0)
  assert.match(kept.keys.TYPED000000000000000000000.hash, /^[\w+/]{43}=$/)
  assert.ok(!JSON.stringify(kept).includes('key of'))
})

test('the devices a profile knows and the times of what follows stay where neither Sync nor a backup goes', async () => {
  const { fs, me } = await profileA()
  await bundleOf(context(fs, me).ctx, { dir: `profiles/${ulid(T)}-ada`, name: 'Ada' }, recordOfIt(await identity(), 'iPhone · Safari'))
  const paths = await walk(fs)
  assert.ok(paths.includes(TIMES))
  assert.deepEqual(paths.filter((path) => /device/.test(path) && path !== TIMES), [], 'no file of a device: the list is a secret')
  assert.deepEqual(JSON.parse(String(await getSecret(fs, DEVICES))).map((/** @type {{ id: string }} */ one) => one.id), [me.id])
  for (const path of [TIMES, '.secrets/keys.json']) assert.deepEqual([carried(path), isBackedUp(path)], [false, false], path)
})

test('B’s new profile, filled from the bundle: its own voice and look, nothing its catalogue lacks, only the keys that cross, and its own identity', async () => {
  const { fs, me } = await profileA()
  const b = await identity()
  const bundle = await bundleOf(context(fs, me).ctx, { dir: `profiles/${ulid(T)}-ada`, name: 'Ada' }, recordOfIt(b, 'iPhone · Safari'))
  const onB = memoryFS()
  const firstRun = /** @type {any} */ ({ ...DEFAULT_SETTINGS, locale: 'ja', voice: 'Kyoko', look: { id: 'paper' }, unlocked: ['camera'] })
  // A bundle that holds more keys than cross: they are chosen again here, never this device's own identity or devices.
  const more = Object.fromEntries(Object.entries({ plan: 'key of plan', 'computer-bridge': 'bridge', [SECRET]: 'theirs', [DEVICES]: '[]', SGNED000000000000000000000: 'token' }).map(([id, value]) => [id, { value, at: T }]))
  await adopt(onB, { ...bundle, keys: { ...bundle.keys, ...more } }, { settings: firstRun, catalogue: CATALOGUE, me: b, now: T + 5 })
  const settings = await loadSettings(onB)
  assert.equal(settings.locale, 'fr', 'what follows the person comes')
  assert.equal(settings.name, 'Ada')
  assert.deepEqual([settings.voice, settings.look], ['Kyoko', { id: 'paper' }], 'what stays on a device is B’s')
  assert.deepEqual(settings.brains.map((one) => one.id), ['TYPED000000000000000000000'])
  assert.equal(settings.activeBrain, 'TYPED000000000000000000000')
  assert.deepEqual(settings.unlocked, ['files', 'tables', 'devices'], 'no reflexes on a device whose catalogue lacks them, no machine, which is A’s alone')
  assert.equal(await getSecret(onB, 'TYPED000000000000000000000'), 'key of typed')
  assert.equal(await getSecret(onB, 'KEYED000000000000000000000'), 'key of keyed')
  for (const id of ['plan', 'SGNED000000000000000000000', 'computer-bridge', 'signin']) assert.equal(await getSecret(onB, id), null, id)
  assert.deepEqual(JSON.parse(String(await getSecret(onB, SECRET))), b)
  assert.equal((await listOf(onB)).length, 2)
  assert.match(String(await onB.read(`${HOME}/project.md`)), /default: true/)
  assert.ok(await onB.exists(`${WORK}/project.md`))
  assert.equal(await onB.exists(`${WORK}/conversations`), false)
  assert.deepEqual((await recordsOf(onB)).map((one) => one.id).sort(), [me.id, b.id].sort())
  // What had no time on A comes with the least, so that a change anywhere wins over it.
  const kept = await readJSON(onB, TIMES)
  assert.deepEqual([kept.fields.locale, kept.keys.TYPED000000000000000000000.at, kept.heard], [1, 0, T + 5])
  // Saved with its times, never stamped again.
  assert.equal((await look(context(onB, b, T + 9).ctx)).changed, false)
})

test('the store’s keys A sent with *kept* are written with B’s identity and devices, in one write; malformed, none are', async () => {
  const { fs, me } = await profileA()
  const b = await identity()
  const bundle = await bundleOf(context(fs, me).ctx, { dir: `profiles/${ulid(T)}-ada`, name: 'Ada' }, recordOfIt(b, 'iPhone · Safari'))
  const store = { sid: base64url(random(16)), N: base64url(random(32)), epochs: { 0: base64url(random(32)) }, relay: 'https://relay.example/', token: base64url(random(32)) }
  const onB = memoryFS()
  /** @type {string[][]} */
  const writes = []
  const write = onB.write.bind(onB)
  onB.write = async (path, text) => { if (path === '.secrets/keys.json') writes.push(Object.keys(JSON.parse(text))); return write(path, text) }
  await adopt(onB, bundle, { settings: DEFAULT_SETTINGS, catalogue: CATALOGUE, me: b, now: T + 5, store })
  assert.deepEqual(JSON.parse(String(await getSecret(onB, STORE))), store)
  assert.ok([SECRET, DEVICES, STORE].every((id) => writes.at(-1)?.includes(id)) && !writes.slice(0, -1).some((ids) => ids.includes(SECRET)), 'the identity, the devices and the store together')
  const other = memoryFS()
  await adopt(other, bundle, { settings: DEFAULT_SETTINGS, catalogue: CATALOGUE, me: b, now: T + 5, store: { ...store, N: 'short' } })
  assert.equal(await getSecret(other, STORE), null)
  assert.equal(shaped({ ...store, epochs: {} }), false)
  // Its settings tell the others which store it holds, none once the relay no longer opens it.
  assert.deepEqual((await look(context(onB, b, T + 9).ctx)).value.store, { sid: store.sid, epoch: 0 })
  await setSecret(onB, STORE, JSON.stringify({ ...store, gone: true }))
  assert.equal((await look(context(onB, b, T + 9).ctx)).value.store, null)
})

test('the store carries what Sync does, but projects kept on this device, Home’s project.md aside, so that every device keeps one Home', () => {
  const carry = carrying([{ dir: HOME, data: { default: true, cloud: false } }, { dir: WORK, data: { cloud: false } }, { dir: HEALTH, data: {} }])
  assert.deepEqual([`${HOME}/project.md`, `${HOME}/conversations/a.jsonl`, `${WORK}/project.md`, `${WORK}/files/a.png`, `${HEALTH}/project.md`, 'memory.md', '.secrets/keys.json', 'settings.json', '.devices/store.json'].map(carry),
    [true, false, false, false, true, true, false, false, false])
})

test('B keeps what is its own beside what comes: its settings that stay, the brains it alone runs, its connections and capabilities on this computer, and their keys', async () => {
  const { fs, me } = await profileA()
  const b = await identity()
  const bundle = await bundleOf(context(fs, me).ctx, { dir: `profiles/${ulid(T)}-ada`, name: 'Ada' }, recordOfIt(b, 'iPhone · Safari'))
  const [mine, plan] = [brain('mine', 'ollama', 'http://localhost:11434/v1'), brain('myplan', 'claudecode', 'http://127.0.0.1:23001/v1')]
  const desk = { id: 'desk', name: 'Desk', url: 'http://localhost:3000/mcp', auth: 'key' }
  const onB = memoryFS()
  const settings = /** @type {any} */ ({ ...DEFAULT_SETTINGS, voice: 'Kyoko', dock: { width: 0.3 }, brains: [mine, plan, brain('cloudy', 'mistral', 'https://api.mistral.ai/v1')], activeBrain: 'mine',
    connections: [desk, { id: 'far', name: 'Far', url: 'https://far.example/mcp', auth: 'key' }], unlocked: ['machine', 'folders', 'brain-local', 'camera'], name: 'B', rules: { fetch: 'never' } })
  const keys = /** @type {Record<string, string>} */ ({ mine: 'key of mine', myplan: 'bridge key of my plan', desk: 'key of desk', far: 'key of far', cloudy: 'key of cloudy', 'computer-bridge': '{"port":1}' })
  await adopt(onB, bundle, { settings, catalogue: CATALOGUE, me: b, now: T + 5, secretOf: async (id) => keys[id] ?? null })
  const made = await loadSettings(onB)
  assert.deepEqual(made.brains.map((one) => one.id), ['mine', 'myplan', 'TYPED000000000000000000000'], 'its own brains beside A’s; one of B’s in the cloud follows, so A’s list is the list')
  assert.equal(made.activeBrain, 'TYPED000000000000000000000', 'the brain chosen comes from A, where it was chosen last')
  assert.deepEqual(made.connections?.map((one) => one.id), ['desk', 'KEYED000000000000000000000', 'SGNED000000000000000000000'])
  assert.deepEqual(made.unlocked, ['machine', 'folders', 'brain-local', 'files', 'tables', 'devices'])
  assert.deepEqual([made.voice, made.dock, made.name, made.rules], ['Kyoko', { width: 0.3 }, 'Ada', { fetch: 'never' }], 'what stays is B’s, what follows A’s')
  for (const [id, value] of Object.entries({ mine: 'key of mine', myplan: 'bridge key of my plan', desk: 'key of desk', 'computer-bridge': '{"port":1}', TYPED000000000000000000000: 'key of typed' })) assert.equal(await getSecret(onB, id), value, id)
  for (const id of ['far', 'cloudy']) assert.equal(await getSecret(onB, id), null, id)
})

test('a bundle left unopened stamps nothing: a change made elsewhere before it, sent later, still wins', async () => {
  const { fs: fsA, me: a, c } = await three()
  const fsC = memoryFS({ 'settings.json': await fsA.read('settings.json') ?? '', '.secrets/keys.json': await fsA.read('.secrets/keys.json') ?? '' })
  for (const one of await listOf(fsA)) await writeRecord(fsC, one)
  const [A, C] = [context(fsA, a), context(fsC, c)]
  await look(A.ctx)
  await look(C.ctx)
  // On C, offline: new rules and a key retyped after a leak, stamped then.
  C.at(T + 1000)
  await saveSettings(fsC, { ...await loadSettings(fsC), maskWords: ['Ada'] })
  await setSecret(fsC, 'TYPED000000000000000000000', 'sk-NEW')
  const fromC = (await look(C.ctx)).value
  // On A, a phone added, the bundle made, and the phone leaves it unopened.
  A.at(T + 2000)
  await bundleOf(A.ctx, { dir: `profiles/${ulid(T)}-ada`, name: 'Ada' }, recordOfIt(await identity(), 'Phone'))
  // C back: A takes what changed there.
  A.at(T + 3000)
  await receive(A.ctx, /** @type {any} */ ((await recordsOf(fsA)).find((one) => one.id === c.id)), fromC)
  assert.deepEqual([(await loadSettings(fsA)).maskWords, await getSecret(fsA, 'TYPED000000000000000000000')], [['Ada'], 'sk-NEW'])
})

test('refilled in place, a device keeps what it did on its own since: its project.md, its words to mask, a brain it added and its key, and its own plan brain, whatever comes', async () => {
  const [a, b, c] = await Promise.all([identity(), identity(), identity()])
  const plan = brain('X', 'claudecode', 'http://127.0.0.1:23001/v1')
  const files = (/** @type {any} */ more = {}) => memoryFS({ 'settings.json': JSON.stringify({ ...DEFAULT_SETTINGS, name: 'Ada', rules: { fetch: 'ask' }, brains: [BRAINS[0], ...(more.brains ?? [])], activeBrain: 'TYPED000000000000000000000' }),
    '.secrets/keys.json': JSON.stringify({ TYPED000000000000000000000: 'sk-shared', ...more.keys }), [`${WORK}/project.md`]: project({ name: 'Work' }), [`${HEALTH}/project.md`]: `${project({ name: 'Health' })}My treatment.` })
  const [fsA, fsB] = [files(), files({ brains: [plan], keys: { X: 'BRIDGE-KEY' } })]
  for (const fs of [fsA, fsB]) for (const [one, name] of /** @type {const} */ ([[a, 'Mac'], [b, 'Phone'], [c, 'Laptop']])) await writeRecord(fs, recordOfIt(one, name))
  const A = context(fsA, a)
  await look(A.ctx)
  await look(context(fsB, b).ctx)
  // A removes B, which keeps Jean on its own, then the lost laptop C.
  A.at(T + 10)
  await removal(A.ctx, b.id, false)
  await alone(fsB, a.id, T + 10, b.id)
  await removal(A.ctx, c.id, true)
  // On B alone: new rules, a brain with its key, the Work project's instructions rewritten.
  const own = await loadSettings(fsB)
  await saveSettings(fsB, { ...own, maskWords: ['Ada'], brains: [...own.brains, brain('MSTRA000000000000000000000', 'mistral', 'https://api.mistral.ai/v1')] })
  await setSecret(fsB, 'MSTRA000000000000000000000', 'key of mistral')
  await fsB.write(`${WORK}/project.md`, `${project({ name: 'Work' })}Written on the phone.`)
  await fsB.remove(HEALTH)
  // On A, later: the person's name, a project. Then B added again in place, the bundle naming B's plan brain as a brain that goes, with no key.
  A.at(T + 30)
  await saveSettings(fsA, { ...await loadSettings(fsA), name: 'Ada L.' })
  await fsA.write(`${HOME}/project.md`, project({ default: true, name: 'Home' }))
  const meB = await identity()
  const bundle = /** @type {any} */ (await bundleOf(A.ctx, { dir: `profiles/${ulid(T)}-ada`, name: 'Ada' }, recordFor(meB, 'Phone', T + 30, a.id)))
  bundle.settings.brains.X = { value: brain('X', 'openai', 'https://api.openai.com/v1'), at: T + 40 }
  assert.deepEqual([await inPlace(fsB, a.public), await inPlace(fsB, c.public)], [true, false], 'only the device that removed it, never one removed after, which it never hears of')
  const B = context(fsB, meB, T + 50)
  // What it knew of a store before goes, the store's keys that came taking its place; the versions Markdown merges from stay.
  for (const path of [...STORED, '.cache/store/memory.md']) await fsB.write(path, '{}')
  const store = { sid: base64url(random(16)), N: base64url(random(32)), epochs: { 0: base64url(random(32)) }, relay: 'https://relay.example/', token: base64url(random(32)) }
  await refill(B.ctx, bundle, store)
  assert.deepEqual([JSON.parse(String(await getSecret(fsB, STORE))), ...await Promise.all([...STORED, '.cache/store/memory.md'].map((path) => fsB.exists(path)))], [store, false, false, true])
  const after = await loadSettings(fsB)
  assert.deepEqual([after.name, after.maskWords], ['Ada L.', ['Ada']], 'A’s later change comes, B’s own stays')
  assert.deepEqual(after.brains.map((one) => [one.id, one.provider]), [['TYPED000000000000000000000', 'openai'], ['X', 'claudecode'], ['MSTRA000000000000000000000', 'mistral']])
  assert.deepEqual([await getSecret(fsB, 'MSTRA000000000000000000000'), await getSecret(fsB, 'X')], ['key of mistral', 'BRIDGE-KEY'])
  assert.match(String(await fsB.read(`${WORK}/project.md`)), /Written on the phone/)
  assert.deepEqual([await fsB.exists(HEALTH), await fsB.exists(`${HOME}/project.md`)], [false, true], 'a project it deleted stays deleted; one it never had comes')
  // What B did on its own goes to A, never the bridge's key.
  await share(B.ctx)
  assert.deepEqual(B.sent.map((one) => one.to), [a.id])
  assert.deepEqual([B.sent[0].value.keys.MSTRA000000000000000000000?.value, B.sent[0].value.snapshot.fields.maskWords.value], ['key of mistral', ['Ada']])
  assert.ok(!JSON.stringify(B.sent).includes('BRIDGE-KEY'))
})

test('B’s new profile keeps B’s own addresses, on this computer or not, and takes where A’s sources read', async () => {
  const { fs, me } = await profileA()
  await saveSettings(fs, { ...await loadSettings(fs), urls: { wikipedia: 'https://wiki.example/w/api.php', share: 'https://hst.ing', kiwix: 'http://localhost:8080' } })
  const b = await identity()
  const bundle = await bundleOf(context(fs, me).ctx, { dir: `profiles/${ulid(T)}-ada`, name: 'Ada' }, recordOfIt(b, 'iPhone · Safari'))
  const onB = memoryFS()
  await adopt(onB, bundle, { settings: { ...DEFAULT_SETTINGS, urls: { relay: 'http://127.0.0.1:8791/', share: 'https://mine.example' } }, catalogue: CATALOGUE, me: b, now: T + 5 })
  assert.deepEqual((await loadSettings(onB)).urls, { wikipedia: 'https://wiki.example/w/api.php', relay: 'http://127.0.0.1:8791/', share: 'https://mine.example' })
})

test('a profile nothing was ever done in holds only what first run makes: settings, keys, caches, and an empty Home', async () => {
  const first = { 'settings.json': '{}', '.secrets/keys.json': '{}', '.secrets/vault.json': '{}', '.cache/index.json': '{}', [TIMES]: '{}', [`${HOME}/project.md`]: project({ default: true, name: 'Home' }) }
  assert.equal(await untouched(memoryFS()), true)
  assert.equal(await untouched(memoryFS(first)), true)
  for (const [path, text] of Object.entries({ [`${HOME}/conversations/${ulid()}.jsonl`]: '{}\n', [`${WORK}/project.md`]: project({ name: 'Work' }), 'memory/me.md': 'I like tea',
    [`${HOME}/files/sha256-abc.txt`]: 'notes', [`${HOME}/documents/${ulid()}.md`]: '# Plan', 'collections/books/collection.json': '{}', 'skills/x/SKILL.md': '---\n---\n', 'shares/x.json': '{}', 'notes.txt': 'x' })) {
    assert.equal(await untouched(memoryFS({ ...first, [path]: text })), false, path)
  }
  assert.equal(await untouched(memoryFS({ ...first, [`projects/${ulid(T + 5)}-home/project.md`]: project({ default: true, name: 'Home' }) })), false, 'two Homes')
  // What Jean found out as it went, and what stays on the device, aren't the person's work; what they set, typed or wrote is.
  const found = { 'settings.json': JSON.stringify({ ...DEFAULT_SETTINGS, locale: 'ja', unlocked: ['devices', 'camera'], offers: { tables: 'x' }, voice: 'Kyoko', urls: { relay: 'http://127.0.0.1:8791/' } }), '.secrets/keys.json': JSON.stringify({ [SECRET]: '{}', [DEVICES]: '[]' }) }
  assert.equal(await untouched(memoryFS({ ...first, ...found })), true)
  for (const [path, text] of Object.entries({ 'settings.json': JSON.stringify({ ...DEFAULT_SETTINGS, brains: [BRAINS[0]] }), '.secrets/keys.json': JSON.stringify({ 'search:brave': '{"key":"b"}' }),
    [`${HOME}/project.md`]: `${project({ default: true, name: 'Home' })}Answer in French.`, [`${HOME}/project.md `]: '' })) {
    if (path.endsWith(' ')) continue
    assert.equal(await untouched(memoryFS({ ...first, [path]: text })), false, path)
  }
  // A parent's profile, a teen's made from it: its family key is work too, never erased with it.
  assert.equal(await untouched(memoryFS({ ...first, '.secrets/family.json': '{}' })), false, 'a family key')
  for (const settings of [{ brains: [BRAINS[0]] }, { maskWords: ['Ada'] }, { name: 'Ada' }]) assert.equal(await untouched(memoryFS({ ...first, 'settings.json': JSON.stringify({ ...DEFAULT_SETTINGS, ...settings }) })), false, JSON.stringify(settings))
  assert.equal(await untouched(memoryFS({ ...first, [`${HOME}/project.md`]: project({ default: true, name: 'Home', colour: 'oklch(0.7 0.1 20)' }) })), false, 'Home as first run doesn’t write it')
})

/** A task in Work that shared a file, as its device keeps it. */
function taskHere() {
  const id = ulid(T)
  const path = `${WORK}/conversations/${id}.jsonl`
  const lines = [{ format: 1, kind: 'conversation', id, createdAt: new Date(T).toISOString(), by: 'user' },
    { at: new Date(T).toISOString(), by: 'user', update: { sessionUpdate: 'user_message_chunk', content: { type: 'resource_link', uri: 'files/sha256-abc.txt', name: 'notes.txt', mimeType: 'text/plain' } } },
    { at: new Date(T).toISOString(), by: 'user', update: { sessionUpdate: 'user_message_chunk', content: { type: 'text', text: 'Plan the trip' } } },
    { at: new Date(T).toISOString(), by: 'jean', step: 0, update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Here is a plan.' } } },
    { at: new Date(T).toISOString(), by: 'user', meta: { title: 'The trip' } }]
  const text = lines.map((line) => JSON.stringify(line)).join('\n') + '\n'
  const fs = memoryFS({ [`${WORK}/project.md`]: project({ name: 'Work' }), [path]: text, [`${WORK}/files/sha256-abc.txt`]: new TextEncoder().encode('notes'),
    [`${WORK}/files/sha256-abc.md`]: '[[page 1]]\nnotes', [`${WORK}/files/sha256-abc.meta.json`]: '{"format":1,"kind":"file"}' })
  return { fs, path, text, id }
}

test('a task goes with its project.md and the files it names, never from a project kept on its device', async () => {
  const { fs, path, text } = taskHere()
  const message = /** @type {any} */ (await taskOf(fs, path))
  assert.equal(message.kind, 'task')
  assert.deepEqual(message.task, { path, text })
  assert.equal(message.project.path, `${WORK}/project.md`)
  assert.deepEqual(Object.keys(message.files).sort(), ['files/sha256-abc.md', 'files/sha256-abc.meta.json', 'files/sha256-abc.txt'])
  assert.equal(Buffer.from(message.files['files/sha256-abc.txt'], 'base64').toString(), 'notes')
  await fs.write(`${WORK}/project.md`, project({ name: 'Work', cloud: false }))
  assert.equal(await taskOf(fs, path), 'kept')
  assert.equal(await taskOf(fs, `${WORK}/conversations/${ulid()}.jsonl`), 'gone')
  assert.equal(await taskOf(fs, 'settings.json'), 'gone')
})

test('a task that arrives: project.md and files written where missing, the copy here replaced when it is a prefix, kept when it holds more, forked when it went its own way', async () => {
  const { fs: there, path, text, id } = taskHere()
  const message = /** @type {any} */ (await taskOf(there, path))
  // Nothing of it here: all written, under the same path.
  const fs = memoryFS({ [`${WORK}/files/sha256-abc.md`]: 'what this device read' })
  assert.deepEqual(await arrive(fs, message), { path, title: 'The trip' })
  assert.equal(await fs.read(path), text)
  assert.equal(await fs.read(`${WORK}/project.md`), message.project.text)
  assert.equal(new TextDecoder().decode(/** @type {Uint8Array} */ (await fs.readBytes(`${WORK}/files/sha256-abc.txt`))), 'notes')
  assert.equal(await fs.read(`${WORK}/files/sha256-abc.md`), 'what this device read', 'a file already here is written once')
  // Its project.md here stays as it is.
  await fs.write(`${WORK}/project.md`, project({ name: 'Mine' }))
  // A prefix here is replaced.
  const lines = text.split('\n')
  await fs.write(path, `${lines.slice(0, 2).join('\n')}\n`)
  assert.equal((await arrive(fs, message))?.path, path)
  assert.equal(await fs.read(path), text)
  assert.match(String(await fs.read(`${WORK}/project.md`)), /Mine/)
  // More here: kept.
  const more = `${text}${JSON.stringify({ at: new Date(T).toISOString(), by: 'user', update: { sessionUpdate: 'user_message_chunk', content: { type: 'text', text: 'And back?' } } })}\n`
  await fs.write(path, more)
  assert.equal((await arrive(fs, message))?.path, path)
  assert.equal(await fs.read(path), more)
  // Gone its own way here: what came is a task of its own, with a new ULID, and this one stays.
  const own = `${lines[0]}\n${JSON.stringify({ at: new Date(T).toISOString(), by: 'user', update: { sessionUpdate: 'user_message_chunk', content: { type: 'text', text: 'Something else' } } })}\n`
  await fs.write(path, own)
  const forked = await arrive(fs, message)
  assert.ok(forked && forked.path !== path)
  assert.match(forked.path, new RegExp(`^${WORK}/conversations/[0-9A-HJKMNP-TV-Z]{26}\\.jsonl$`))
  assert.equal(await fs.read(path), own)
  const [head, ...rest] = String(await fs.read(forked.path)).split('\n')
  assert.equal(JSON.parse(head).id, forked.path.slice(-32, -6))
  assert.notEqual(JSON.parse(head).id, id)
  assert.deepEqual(rest, text.split('\n').slice(1))
  // The same message again, as when another tab takes over the reading: the task kept already is found, once more on it too.
  assert.deepEqual(await arrive(fs, message), forked)
  await fs.append(forked.path, `${JSON.stringify({ at: new Date(T).toISOString(), by: 'user', meta: { title: 'Mine now' } })}\n`)
  assert.deepEqual(await arrive(fs, message), forked)
  assert.equal((await fs.list(`${WORK}/conversations`)).length, 2)
})

test('a task that arrives malformed is refused, and a file outside its project is never written', async () => {
  const { fs: there, path } = taskHere()
  const message = /** @type {any} */ (await taskOf(there, path))
  const fs = memoryFS()
  await arrive(fs, { ...message, files: { '../../.secrets/keys.json': 'e30=', '.secrets/keys.json': 'e30=', 'files/../../x': 'e30=', 'conversations/x.jsonl': 'e30=', 'project.md': 'e30=', 'files/ok.txt': 'b2s=' } })
  assert.deepEqual((await fs.list(WORK)).map((entry) => entry.name).sort(), ['conversations', 'files', 'project.md'])
  assert.deepEqual((await fs.list(`${WORK}/files`)).map((entry) => entry.name), ['ok.txt'])
  for (const wrong of [{ ...message, task: { ...message.task, path: `${HOME}/conversations/${ulid()}.jsonl` } }, { ...message, task: { ...message.task, path: `${WORK}/conversations/../x.jsonl` } },
    { ...message, project: { ...message.project, path: 'projects/../project.md' } }, { ...message, task: { ...message.task, text: 'not a conversation' } }, {}]) assert.equal(await arrive(memoryFS(), wrong), null)
})

/** A device's profile that knows two others, C and D. */
async function three() {
  const [me, c, d] = await Promise.all([identity(), identity(), identity()])
  const fs = memoryFS({ 'settings.json': JSON.stringify({ ...DEFAULT_SETTINGS, brains: BRAINS, activeBrain: 'TYPED000000000000000000000', connections: CONNECTIONS }),
    '.secrets/keys.json': JSON.stringify({ TYPED000000000000000000000: 'k', plan: 'p', KEYED000000000000000000000: 'k', SGNED000000000000000000000: 'o', 'search:brave': 'b', 'computer-npm': 'n', 'computer-bridge': 'x' }) })
  for (const [one, name] of /** @type {const} */ ([[me, 'Mac · Chrome'], [c, 'iPhone · Safari'], [d, 'Windows · Edge']])) await writeRecord(fs, recordOfIt(one, name))
  return { fs, me, c, d }
}

test('the devices another lists are merged: a new one only from the device that added it, a removed one removed for good, never this one’s own changed', async () => {
  const { fs, me, c, d } = await three()
  const [e, f, g] = await Promise.all([identity(), identity(), identity()])
  const { ctx, sent } = context(fs, me)
  const from = /** @type {any} */ ((await recordsOf(fs)).find((one) => one.id === c.id))
  // It lists this device under another name, removed even, C, and E, which C added; not D, which a list that left it out doesn't remove.
  // G, added by D, and one that says nothing of who added it, come only from that device, or with a pairing's bundle.
  const records = [{ ...recordOfIt(me, 'Renamed'), removedAt: new Date(T).toISOString() }, from, recordFor(e, 'Android · Firefox', T, c.id), recordFor(g, 'Pixel', T, d.id), recordOfIt(f, 'Linux'), { id: 'nonsense' }]
  assert.equal(await receive(ctx, from, { kind: 'devices', records }), null)
  const now = await recordsOf(fs)
  assert.deepEqual(now.map((one) => one.id).sort(), [me.id, c.id, d.id, e.id].sort())
  assert.equal(now.find((one) => one.id === me.id)?.name, 'Mac · Chrome')
  // D removed there: removed here, and kept as removed.
  const gone = { ...recordOfIt(d, 'Windows · Edge'), removedAt: new Date(T + 5).toISOString() }
  await receive(ctx, from, { kind: 'devices', records: [gone] })
  assert.deepEqual((await recordsOf(fs)).map((one) => one.id).sort(), [me.id, c.id, e.id].sort())
  assert.equal((await listOf(fs)).find((one) => one.id === d.id)?.removedAt, gone.removedAt)
  // An older list, from a device that missed the removal, never brings it back, nor its key under another id; settings carry lists too.
  await receive(ctx, from, { kind: 'devices', records: [recordOfIt(d, 'Windows · Edge'), recordFor({ ...d, id: ulid() }, 'Windows · Edge', T, c.id), recordFor(f, 'Linux · Firefox', T, c.id)] })
  await receive(ctx, from, { kind: 'settings', snapshot: {}, devices: [recordOfIt(d, 'Windows · Edge')] })
  assert.deepEqual((await recordsOf(fs)).map((one) => one.id).sort(), [me.id, c.id, e.id, f.id].sort())
  // A list that isn't one changes nothing; each list that changed this one went on to the others with this device's state.
  await receive(ctx, from, { kind: 'devices', records: 'all' })
  assert.equal((await recordsOf(fs)).length, 4)
  assert.ok(sent.length && sent.every((one) => (one.value.kind === 'settings' && Array.isArray(one.value.devices)) || (one.to === d.id && one.value.kind === 'removed')))
  // D, removed there, is told by this device too, which may be the one D knows, and again as anything goes until its mailbox is gone,
  // which it removes as it acts on it; nothing else goes to it.
  assert.deepEqual(sent.filter((one) => one.to === d.id).map((one) => one.value.kind), ['settings', 'removed', 'removed'])
  // A device removed anywhere, the list naming it removed or this one, adds no one.
  assert.equal((mergeLists(await listOf(fs), [{ ...from, removedAt: new Date(T).toISOString() }, recordFor(g, 'Pixel', T, c.id)], me.id, c.id) ?? []).some((one) => one.id === g.id), false)
  assert.equal(mergeLists(await listOf(fs), [recordFor(g, 'Pixel', T, d.id)], me.id, d.id), null)
})

test('settings from another device are merged without what this one’s catalogue lacks, saved with their times, and never stamped or sent again', async () => {
  const { fs, me, c, d } = await three()
  const settings = /** @type {any} */ ({ ...DEFAULT_SETTINGS, locale: 'ja', voice: 'Kyoko', unlocked: ['files'] })
  await saveSettings(fs, settings)
  await fs.write(TIMES, JSON.stringify({ format: 1, fields: { locale: T }, brains: {}, connections: {}, seen: following(settings), heard: T }))
  const { ctx, sent, at } = context(fs, me, T + 20)
  const from = /** @type {any} */ ((await recordsOf(fs)).find((one) => one.id === c.id))
  const theirs = /** @type {any} */ ({ ...settings, locale: 'fr', voice: 'Amélie', unlocked: ['files', 'reflexes', 'tables'] })
  await receive(ctx, from, { kind: 'settings', snapshot: JSON.parse(JSON.stringify(snapshotOf(following(theirs), { fields: { locale: T + 10, unlocked: T + 10 } }))) })
  const merged = await loadSettings(fs)
  assert.deepEqual([merged.locale, merged.voice, merged.unlocked], ['fr', 'Kyoko', ['files', 'tables']])
  const kept = await readJSON(fs, TIMES)
  assert.equal(kept.fields.locale, T + 10)
  assert.equal(kept.heard, T + 20, 'heard by the relay’s time of a message')
  assert.deepEqual(sent, [], 'nothing changed here, so nothing goes back')
  assert.equal((await look(ctx)).changed, false, 'a merged patch is never stamped')
  // A change here not yet stamped when another snapshot comes: stamped first, then sent on to the others.
  await saveSettings(fs, { ...merged, locale: 'de' })
  at(T + 30)
  await receive(ctx, from, { kind: 'settings', snapshot: snapshotOf({ name: 'Ada' }, { fields: { name: T + 25 } }) })
  assert.deepEqual([(await loadSettings(fs)).locale, (await loadSettings(fs)).name], ['de', 'Ada'])
  assert.deepEqual(sent.map((one) => one.to).sort(), [c.id, d.id].sort())
  assert.deepEqual(sent[0].value.snapshot.fields.locale, { value: 'de', at: T + 30 })
})

test('asked for its settings, a device answers the one that asked', async () => {
  const { fs, me, c } = await three()
  await fs.write(TIMES, JSON.stringify({ format: 1, seen: following(await loadSettings(fs)) }))
  const { ctx, sent } = context(fs, me)
  const from = /** @type {any} */ ((await recordsOf(fs)).find((one) => one.id === c.id))
  await receive(ctx, from, { kind: 'ask' })
  assert.deepEqual(sent.map((one) => [one.to, one.value.kind]), [[c.id, 'settings']])
  assert.deepEqual(Object.keys(sent[0].value.snapshot.brains), ['TYPED000000000000000000000'])
})

test('keys go with their times: the newest wins either way, a forgotten one is forgotten everywhere, and only those that cross here are taken', async () => {
  const { fs, me, c } = await three()
  await fs.write(TIMES, JSON.stringify({ format: 1, seen: following(await loadSettings(fs)) }))
  const { ctx, sent, at } = context(fs, me, T + 1)
  const from = /** @type {any} */ ((await recordsOf(fs)).find((one) => one.id === c.id))
  const key = (/** @type {string} */ value, /** @type {number} */ when) => ({ value, at: when })
  await receive(ctx, from, { kind: 'settings', snapshot: {}, keys: { TYPED000000000000000000000: key('sk-new', T + 10), plan: key('bridge', T + 10), 'computer-bridge': key('{}', T + 10), KEYED000000000000000000000: key('k-2', T + 10),
    oauth: key('{"access":"a"}', T + 10), device: key('{}', T + 10), devices: key('[]', T + 10), 'search:brave': { at: T + 10, gone: true } } })
  // A plan's key, the bridge's, OAuth tokens and this device's own never cross: it keeps its own.
  assert.deepEqual(await Promise.all(['TYPED000000000000000000000', 'KEYED000000000000000000000', 'search:brave', 'plan', 'computer-bridge', 'SGNED000000000000000000000'].map((id) => getSecret(fs, id))), ['sk-new', 'k-2', null, 'p', 'x', 'o'])
  assert.equal((await listOf(fs)).length, 3)
  // follows.json keeps when each changed and its hash, never the key.
  const kept = await readJSON(fs, TIMES)
  assert.deepEqual([kept.keys.TYPED000000000000000000000.at, kept.keys['search:brave']], [T + 10, { at: T + 10, gone: true }])
  assert.ok(!/sk-new|k-2/.test(JSON.stringify(kept)))
  assert.deepEqual(sent, [], 'nothing changed here, so nothing goes back')
  // An older copy, which a device that sent last would have spread, changes nothing; a forgotten key never comes back from one.
  await receive(ctx, from, { kind: 'settings', snapshot: {}, keys: { TYPED000000000000000000000: key('sk-old', T + 5), 'search:brave': key('b', T + 5) } })
  assert.deepEqual([await getSecret(fs, 'TYPED000000000000000000000'), await getSecret(fs, 'search:brave')], ['sk-new', null])
  // A key changed here alone, no setting with it, is stamped when it changed and goes with its time; an older copy then loses to it.
  at(T + 20)
  await setSecret(fs, 'KEYED000000000000000000000', 'k-3')
  const looked = await look(ctx)
  assert.equal(looked.changed, true)
  assert.deepEqual(looked.value.keys.KEYED000000000000000000000, { value: 'k-3', at: T + 20 })
  assert.deepEqual(await share(ctx), [])
  assert.deepEqual(sent.map((one) => [one.value.kind, one.value.keys.KEYED000000000000000000000, one.value.keys.plan]), [['settings', { value: 'k-3', at: T + 20 }, undefined], ['settings', { value: 'k-3', at: T + 20 }, undefined]])
  assert.equal((await readJSON(fs, TIMES)).pending, undefined, 'sent to every device: nothing waits')
  await receive(ctx, from, { kind: 'settings', snapshot: {}, keys: { KEYED000000000000000000000: key('k-2', T + 15) } })
  assert.equal(await getSecret(fs, 'KEYED000000000000000000000'), 'k-3')
  // Forgotten here: a tombstone goes, and a newer one from elsewhere forgets it here.
  at(T + 30)
  await deleteSecret(fs, 'KEYED000000000000000000000')
  assert.deepEqual((await look(ctx)).value.keys.KEYED000000000000000000000, { at: T + 30, gone: true })
  await receive(ctx, from, { kind: 'settings', snapshot: {}, keys: { TYPED000000000000000000000: { at: T + 40, gone: true } } })
  assert.equal(await getSecret(fs, 'TYPED000000000000000000000'), null)
})

test('a change stamped here that never went, the tab closed too soon, waits to go and keeps the time it was made', async (t) => {
  t.mock.method(console, 'warn', () => {})
  const { fs, me, c, d } = await three()
  await fs.write(TIMES, JSON.stringify({ format: 1, seen: following(await loadSettings(fs)) }))
  const { ctx, sent, at } = context(fs, me, T + 10)
  await saveSettings(fs, { ...await loadSettings(fs), name: 'Ada' })
  assert.deepEqual([(await look(ctx)).changed, (await readJSON(fs, TIMES)).pending], [true, T + 10])
  // Opened again much later: nothing changed since, but the change waits to go, with the time it was made.
  at(T + 99)
  const again = await look(ctx)
  assert.deepEqual([again.changed, again.pending, again.value.snapshot.fields.name], [false, T + 10, { value: 'Ada', at: T + 10 }])
  // A device that doesn't take it: it still waits; once all do, nothing waits.
  const failing = { ...ctx, send: async (/** @type {{ id: string }} */ to, /** @type {any} */ value) => { if (to.id === d.id) throw new TypeError('offline'); return sent.push({ to: to.id, value }) } }
  assert.deepEqual((await share(failing)).map((one) => one.id), [d.id])
  assert.ok((await readJSON(fs, TIMES)).pending)
  assert.deepEqual(await share(ctx), [])
  assert.equal((await readJSON(fs, TIMES)).pending, undefined)
  assert.deepEqual(sent.map((one) => one.to).sort(), [c.id, c.id, d.id].sort())
})

test('a setting cleared on one device is cleared on the others', async () => {
  const { fs, me, c } = await three()
  await saveSettings(fs, { ...await loadSettings(fs), name: 'Ada' })
  await fs.write(TIMES, JSON.stringify({ format: 1, fields: { name: T }, seen: following(await loadSettings(fs)) }))
  const { ctx } = context(fs, me, T + 10)
  const from = /** @type {any} */ ((await recordsOf(fs)).find((one) => one.id === c.id))
  // The name cleared there: the field gone, with its time.
  const there = following({ ...await loadSettings(fs), name: undefined })
  await receive(ctx, from, { kind: 'settings', snapshot: JSON.parse(JSON.stringify(snapshotOf(there, { fields: { name: T + 5 } }))) })
  assert.equal('name' in await loadSettings(fs), false)
  assert.equal((await look(ctx)).changed, false, 'never stamped again')
  // And the other way: cleared here, it goes as null with its time.
  await saveSettings(fs, { ...await loadSettings(fs), name: 'Bea' })
  await look(ctx)
  const settings = await loadSettings(fs)
  delete settings.name
  await saveSettings(fs, settings)
  assert.deepEqual((await look({ ...ctx, now: () => T + 20 })).value.snapshot.fields.name, { value: null, at: T + 20 })
})

test('a device removed is kept as removed at once, the others told before it, nothing goes to it again, and what it may hold is named', async () => {
  const { fs, me, c, d } = await three()
  const { ctx, sent } = context(fs, me)
  const left = await removal(ctx, c.id, true)
  // The others first, the list with it removed, with this device's state; then the device itself.
  assert.deepEqual(sent.map((one) => [one.to, one.value.kind]), [[d.id, 'settings'], [c.id, 'removed']])
  assert.deepEqual(sent[0].value.devices.map((/** @type {{ id: string, removedAt?: string }} */ record) => [record.id, Boolean(record.removedAt)]).sort(), [[me.id, false], [c.id, true], [d.id, false]].sort())
  // With the list that removes it, whose removals it passes on before it erases: it may know a device the remover doesn't.
  assert.deepEqual([sent[1].value.kind, sent[1].value.erase, sent[1].value.devices.find((/** @type {any} */ one) => one.id === c.id)?.removedAt], ['removed', true, new Date(T).toISOString()])
  assert.deepEqual((await recordsOf(fs)).map((one) => one.id).sort(), [me.id, d.id].sort())
  assert.equal((await listOf(fs)).find((one) => one.id === c.id)?.removedAt, new Date(T).toISOString())
  assert.deepEqual(left?.brains.map((one) => one.id), ['TYPED000000000000000000000'])
  assert.deepEqual(left?.services, ['Notes', 'Brave Search', 'Mail'], 'a Computer registry’s key never went; the service it signed in to itself is named')
  assert.equal(await removal(ctx, me.id, true), null, 'never this one')
  assert.equal(await removal(ctx, ulid(), false), null)
  sent.length = 0
  await share(ctx)
  assert.deepEqual(sent.map((one) => [one.to, one.value.kind]), [[d.id, 'settings'], [c.id, 'removed']], 'settings and keys go to the devices left alone; the removal, until C acts on it')
  // On the device removed, the message says what to do; a task handed over says where it is now.
  const from = /** @type {any} */ ((await recordsOf(fs)).find((one) => one.id === d.id))
  assert.deepEqual(await receive(ctx, from, { kind: 'removed', erase: false }), { removed: { erase: false } })
  const { fs: there, path } = taskHere()
  assert.deepEqual(await receive(ctx, from, await taskOf(there, path)), { arrived: { path, title: 'The trip' } })
})

test('a device removed is owed to the store until an epoch names it, on the device that removed it and on one that hears of it, and stays owed while no epoch does', async () => {
  const { fs, me, c, d } = await three()
  const { ctx, sent } = context(fs, me)
  const held = /** @type {any} */ ({ epochs: { 0: 'k' } })
  assert.equal(owed(held, await listOf(fs)), false)
  await removal(ctx, c.id, true)
  assert.equal(owed(held, await listOf(fs)), true)
  // D hears of it from the list that removed it, and owes it too, whichever of them begins the epoch first.
  const onD = memoryFS()
  for (const [one, name] of /** @type {const} */ ([[me, 'Mac · Chrome'], [c, 'iPhone · Safari'], [d, 'Windows · Edge']])) await writeRecord(onD, recordOfIt(one, name))
  await receive(context(onD, d).ctx, /** @type {any} */ ((await listOf(onD)).find((one) => one.id === me.id)), sent[0].value)
  assert.equal(owed(held, await listOf(onD)), true)
  // Owed still, each round, until an epoch names C; then never again, removed staying removed whatever another epoch says.
  assert.equal(owed(merged(held, { epochs: {}, removed: [d.id] }), await listOf(fs)), true)
  const named = merged(held, { epochs: { 1: 'k1' }, removed: [c.id] })
  assert.equal(owed(merged(named, { epochs: {}, removed: [] }), await listOf(fs)), false)
})

test('a removal the relay can’t take stands here and is tried again, the device told only once the others all were', async (t) => {
  t.mock.method(console, 'warn', () => {})
  const { fs, me, c, d } = await three()
  const { ctx, sent } = context(fs, me)
  /** Sends, refusing what `refuse` names with a status. @param {(to: string, kind: string) => number | undefined | false} refuse */
  const relay = (refuse) => ({ ...ctx, send: async (/** @type {any} */ to, /** @type {any} */ value) => {
    const status = refuse(to.id, value.kind)
    if (status !== false) throw Object.assign(new Error('refused'), { status })
    return sent.push({ to: to.id, value })
  } })
  // D's mailbox full: the removal stands here, nothing goes to C or comes from it, the keys to revoke are said, and D named; C waits.
  const first = await removal(relay((to) => (to === d.id ? 507 : false)), c.id, true)
  assert.deepEqual([first?.brains.map((one) => one.id), first?.unreached], [['TYPED000000000000000000000'], ['Windows · Edge', 'iPhone · Safari']])
  assert.deepEqual(sent, [])
  assert.deepEqual((await recordsOf(fs)).map((one) => one.id).sort(), [me.id, d.id].sort())
  assert.deepEqual([Boolean((await readJSON(fs, TIMES)).pending), (await readJSON(fs, TIMES)).owe], [true, { [c.id]: true }])
  // D takes it, C's message refused: C still waits. Then D is told again first, then C, whose mailbox takes it: C waits all the same,
  // until it acts on it and removes its mailbox, and nothing waits.
  assert.deepEqual((await share(relay((to, kind) => (kind === 'removed' ? 507 : false)))).map((one) => one.id), [c.id])
  assert.deepEqual((await share(ctx)).map((one) => one.id), [c.id])
  assert.deepEqual([(await readJSON(fs, TIMES)).owe, await unreached(fs, c.id), await unreached(fs, d.id)], [{ [c.id]: true }, true, false])
  assert.deepEqual(await share(relay((to, kind) => (kind === 'removed' ? 404 : false))), [])
  assert.deepEqual(sent.map((one) => [one.to, one.value.kind]), [[d.id, 'settings'], [d.id, 'settings'], [c.id, 'removed'], [d.id, 'settings']])
  assert.deepEqual([(await readJSON(fs, TIMES)).pending, (await readJSON(fs, TIMES)).owe], [undefined, {}])
  // C's mailbox gone, nothing reaches it; D's gone, it asks when it's back: removed either way.
  sent.length = 0
  const { fs: fs2, me: me2, c: c2, d: d2 } = await three()
  const { ctx: ctx2 } = context(fs2, me2)
  assert.deepEqual((await removal({ ...ctx2, send: async (/** @type {any} */ to) => { throw Object.assign(new Error('gone'), { status: 404, to: to.id }) } }, c2.id, true))?.unreached, [])
  assert.deepEqual((await recordsOf(fs2)).map((one) => one.id).sort(), [me2.id, d2.id].sort())
})

test('a removed device that hears of it first can’t have a key of its own trusted: the others read the removal before anything it sends', async () => {
  // Three devices, A, C and X, each with a mailbox read in order; X, removed by A, sends C a list naming a key of its own, Z, the moment
  // it hears, as a lost laptop's thief would.
  const [a, c, x, z] = await Promise.all([identity(), identity(), identity(), identity()])
  /** @type {Record<string, { from: string, bytes: Uint8Array }[]>} */
  const boxes = { [a.id]: [], [c.id]: [], [x.id]: [], [z.id]: [] }
  const named = /** @type {const} */ ([[a, 'Mac · Chrome'], [c, 'iPad · Safari'], [x, 'iPhone · Safari']])
  const { envelope, openEnvelope } = await import('../app/caps/devices/pair.js')
  /** @param {import('../app/caps/devices/flow.js').Identity} me */
  async function device(me) {
    const fs = memoryFS({ 'settings.json': JSON.stringify({ ...DEFAULT_SETTINGS, brains: [BRAINS[0]] }), '.secrets/keys.json': JSON.stringify({ TYPED000000000000000000000: 'sk', [SECRET]: JSON.stringify(me) }) })
    for (const [one, name] of named) await writeRecord(fs, recordOfIt(one, name))
    await fs.write(TIMES, JSON.stringify({ format: 1, seen: following(await loadSettings(fs)) }))
    const { ctx } = context(fs, me)
    ctx.send = async (/** @type {{ id: string, key: JsonWebKey }} */ to, /** @type {object} */ value) => {
      boxes[to.id].push({ from: me.id, bytes: await envelope(me, to.key, value) })
      if (to.id === x.id) boxes[c.id].push({ from: x.id, bytes: await envelope(x, c.public, { kind: 'devices', records: [...named.map(([one, name]) => recordOfIt(one, name)), recordOfIt(z, 'Mac · Chrome')] }) })
      return boxes[to.id].length
    }
    return { fs, ctx }
  }
  /** What devices.js's heard() does: each message opened only from a device not removed, in order. @param {{ fs: any, ctx: any }} one */
  async function read({ fs, ctx }) {
    for (const { bytes } of boxes[ctx.me.id].splice(0)) {
      const known = await recordsOf(fs)
      const opened = await openEnvelope(ctx.me, known.map((one) => one.key), bytes).catch(() => null)
      const from = opened && known.find((one) => one.id !== ctx.me.id && one.key.x === opened.from.x && one.key.y === opened.from.y)
      if (from) await receive(ctx, from, opened.value)
    }
  }
  const [A, C] = [await device(a), await device(c)]
  await removal(A.ctx, x.id, true)
  assert.deepEqual(boxes[c.id].map((one) => one.from), [a.id, x.id], 'A’s list in C’s mailbox before what X sent')
  await read(C)
  assert.deepEqual((await recordsOf(C.fs)).map((one) => one.id).sort(), [a.id, c.id].sort())
  assert.equal((await listOf(C.fs)).some((one) => one.id === z.id), false)
  // C's next state goes to A alone, and Z is trusted nowhere.
  await share(C.ctx)
  await read(A)
  assert.deepEqual([boxes[z.id].length, (await listOf(A.fs)).some((one) => one.id === z.id)], [0, false])
})

test('a device removed that keeps Jean forgets who it is, and is added again in place only by the device that removed it', async () => {
  const { fs, me, c, d } = await three()
  const stranger = await identity()
  await setSecret(fs, SECRET, JSON.stringify(me))
  await fs.write(TIMES, '{}')
  // Still paired: no device, not even one it has, fills it again in place.
  assert.equal(await inPlace(fs, c.public), false)
  await setSecret(fs, STORE, '{"sid":"S"}')
  for (const path of [...STORED, '.cache/store/memory.md']) await fs.write(path, '{}')
  await alone(fs, c.id, T, me.id)
  assert.equal(await getSecret(fs, SECRET), null)
  // The store's keys go, and what it knew of the store, but the versions Markdown merges from, so that joined again its words meet the others'.
  assert.equal(await getSecret(fs, STORE), null)
  assert.deepEqual(await Promise.all([...STORED, '.cache/store/memory.md'].map((path) => fs.exists(path))), [false, false, true])
  assert.equal(await fs.exists(TIMES), true, 'the times stay, so that what it does on its own since wins when it is filled again')
  assert.deepEqual((await recordsOf(fs)).map((one) => one.id), [c.id])
  assert.equal(await inPlace(fs, c.public), true)
  for (const key of [d.public, stranger.public, me.public]) assert.equal(await inPlace(fs, key), false, 'one it had, maybe removed since without its hearing, or one it never had')
  // Paired again some other way, with an identity of its own: what it kept of that pairing is kept only as removed.
  const again = await identity()
  await writeOwn(fs, recordOfIt(again, 'Mac · Chrome'))
  assert.deepEqual((await recordsOf(fs)).map((one) => one.id), [again.id])
  assert.equal((await listOf(fs)).length, 4)
})

test('a connection signed in on one device while another renames it keeps the typed key on both, and no token goes', async () => {
  // A signs a connection in (tokens under its id, its key forgotten) while B, asleep, renames it with its old 'key' record.
  const C = { id: 'CNN00000000000000000000000', name: 'Notes', url: 'https://mcp.example.com/', auth: 'key' }
  const [a, b] = [await identity(), await identity()]
  const fsA = memoryFS({ 'settings.json': JSON.stringify({ ...DEFAULT_SETTINGS, connections: [C] }), '.secrets/keys.json': JSON.stringify({ CNN00000000000000000000000: 'k1' }) })
  await writeRecord(fsA, recordOfIt(a, 'A'))
  const A = context(fsA, a)
  const bundle = await bundleOf(A.ctx, { dir: `profiles/${ulid(T)}-x`, name: 'X' }, recordOfIt(b, 'B'))
  await writeRecord(fsA, recordOfIt(b, 'B'))
  const fsB = memoryFS()
  await adopt(fsB, bundle, { settings: { ...DEFAULT_SETTINGS }, catalogue: CATALOGUE, me: b, now: T })
  const B = context(fsB, b)
  const [onA, onB] = [/** @type {any} */ ((await recordsOf(fsA)).find((one) => one.id === b.id)), /** @type {any} */ ((await recordsOf(fsB)).find((one) => one.id === a.id))]
  const TOKENS = JSON.stringify({ access: 'ACCESS', refresh: 'REFRESH', expiresAt: T + 3_600_000 })
  A.at(T + 10)
  await setSecret(fsA, 'CNN00000000000000000000000', TOKENS)
  await saveSettings(fsA, { ...await loadSettings(fsA), connections: [{ ...C, auth: 'oauth' }] })
  const signed = (await look(A.ctx)).value
  B.at(T + 11)
  await saveSettings(fsB, { ...await loadSettings(fsB), connections: [{ ...C, name: 'My notes' }] })
  const renamed = (await look(B.ctx)).value
  // Each hears the other: the newer record, B's, says the connection takes a key, so A's tombstone, older, takes nothing from B,
  // whose key goes again with that record's time and replaces A's tokens there; the tokens, never a key, go nowhere.
  A.at(T + 12)
  B.at(T + 12)
  await receive(A.ctx, onA, renamed)
  assert.equal((await loadSettings(fsA)).connections?.[0].auth, 'key')
  await receive(B.ctx, onB, signed)
  for (const { value } of B.sent.splice(0)) await receive(A.ctx, onA, value)
  for (const [fs, name] of /** @type {const} */ ([[fsA, 'A'], [fsB, 'B']])) assert.deepEqual([(await loadSettings(fs)).connections?.[0], await getSecret(fs, 'CNN00000000000000000000000')], [{ ...C, name: 'My notes' }, 'k1'], name)
  await share(A.ctx)
  assert.ok(!JSON.stringify([signed, renamed, A.sent, B.sent]).includes('REFRESH'), 'no token sent')
  // Tokens sent as a key by a device that would, under a connection that takes one, are refused here.
  B.at(T + 20)
  await receive(B.ctx, onB, { kind: 'settings', snapshot: {}, keys: { CNN00000000000000000000000: { value: TOKENS, at: T + 20 } } })
  assert.equal(await getSecret(fsB, 'CNN00000000000000000000000'), 'k1')
})

test('what a device keeps for itself is never removed, changed or added from elsewhere, and no key crosses under a kind it wasn’t made for', async () => {
  const { fs, me, c } = await three()
  const plan = brain('X', 'claudecode', 'http://127.0.0.1:23001/v1')
  await saveSettings(fs, { ...await loadSettings(fs), brains: [...BRAINS, plan], activeBrain: 'X' })
  for (const [id, value] of Object.entries({ X: 'BRIDGE-KEY', RPHAN000000000000000000000: 'sk-left', gateway: 'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJhZGEifQ.sig' })) await setSecret(fs, id, value)
  const { ctx, sent, at } = context(fs, me)
  ctx.policy = { brains: [{ id: 'gateway' }] }
  await look(ctx)
  const from = /** @type {any} */ ((await recordsOf(fs)).find((one) => one.id === c.id))
  const settings = (/** @type {Record<string, any>} */ brains) => ({ kind: 'settings', snapshot: { fields: {}, brains, connections: {} }, keys: {} })
  // A tombstone for B's plan brain, then the same id as a brain that goes; a local brain in its place; brains named as a key left
  // here or as the organisation's brain, which policy holds.
  at(T + 20)
  await receive(ctx, from, settings({ X: { value: null, at: T + 10 }, local: { value: null, at: T + 10 } }))
  at(T + 40)
  await receive(ctx, from, settings({ X: { value: brain('X', 'openai', 'https://api.openai.com/v1'), at: T + 30 }, mine: { value: brain('mine', 'ollama', 'http://localhost:11434/v1'), at: T + 30 },
    RPHAN000000000000000000000: { value: brain('RPHAN000000000000000000000', 'openai', 'https://api.openai.com/v1'), at: T + 30 }, gateway: { value: brain('gateway', 'openai', 'https://api.openai.com/v1'), at: T + 30 } }))
  const brains = (await loadSettings(fs)).brains.map((one) => [one.id, one.provider])
  assert.deepEqual(brains, [['TYPED000000000000000000000', 'openai'], ['plan', 'claudecode'], ['local', 'ollama'], ['X', 'claudecode'], ['RPHAN000000000000000000000', 'openai']], 'never one under an id Jean doesn’t give, as the organisation’s')
  assert.deepEqual([await getSecret(fs, 'X'), await getSecret(fs, 'RPHAN000000000000000000000')], ['BRIDGE-KEY', null], 'B’s plan keeps its key; one left under an id that now crosses is deleted')
  at(T + 50)
  await setSecret(fs, 'TYPED000000000000000000000', 'sk-2')
  await share(ctx)
  assert.ok(sent.length && !/BRIDGE-KEY|sk-left|eyJhbGci/.test(JSON.stringify(sent)))
})

test('a device paired while another is removed hears of the removal from the one that added it before anything the removed one sends, and a removed device introduces no one', async () => {
  const [a, c, x, b, z] = await Promise.all([identity(), identity(), identity(), identity(), identity()])
  const { envelope, openEnvelope } = await import('../app/caps/devices/pair.js')
  /** @type {Record<string, Uint8Array[]>} */
  const boxes = { [a.id]: [], [c.id]: [], [x.id]: [], [b.id]: [], [z.id]: [] }
  /** @param {import('../app/core/types.js').FS} fs @param {import('../app/caps/devices/flow.js').Identity} me */
  const device = (fs, me) => {
    const { ctx } = context(fs, me)
    ctx.send = async (/** @type {any} */ to, /** @type {object} */ value) => boxes[to.id].push(await envelope(me, to.key, value))
    return ctx
  }
  /** As devices.js's heard(): each message opened only from a device it has, in order; what came, by kind. @param {any} ctx */
  const read = async (ctx) => {
    const kinds = []
    for (const bytes of boxes[ctx.me.id].splice(0)) {
      const known = await recordsOf(ctx.fs)
      const opened = await openEnvelope(ctx.me, known.map((one) => one.key), bytes).catch(() => null)
      const from = opened && known.find((one) => one.id !== ctx.me.id && sameKeyOf(one.key, opened.from))
      kinds.push(from ? [from.id, opened.value.kind, await receive(ctx, from, opened.value)] : 'dropped')
    }
    return kinds
  }
  const sameKeyOf = (/** @type {JsonWebKey} */ one, /** @type {JsonWebKey} */ two) => one.x === two.x && one.y === two.y
  const profile = async () => {
    const fs = memoryFS({ 'settings.json': JSON.stringify({ ...DEFAULT_SETTINGS, brains: [BRAINS[0]] }), '.secrets/keys.json': JSON.stringify({ TYPED000000000000000000000: 'sk' }) })
    for (const [one, name] of /** @type {const} */ ([[a, 'Mac'], [c, 'iPad'], [x, 'iPhone']])) await writeRecord(fs, recordOfIt(one, name))
    return fs
  }
  const [A, C] = [device(await profile(), a), device(await profile(), c)]
  // On A, the code typed: the bundle lists X. Meanwhile the person removes X on C, and A reads it.
  const you = recordFor(b, 'Pixel', T, a.id)
  const bundle = await bundleOf(A, { dir: `profiles/${ulid(T)}-ada`, name: 'Ada' }, you)
  await removal(C, x.id, true)
  await read(A)
  // B joins: A keeps it and tells everyone, B too; the removed X, which knew B's mailbox some other way, sends B a list naming Z, and its removal.
  const fsB = memoryFS()
  await adopt(fsB, bundle, { settings: { ...DEFAULT_SETTINGS }, catalogue: CATALOGUE, me: b, now: T })
  const B = device(fsB, b)
  await writeRecord(A.fs, you)
  await tell(A, { kind: 'devices', records: await listOf(A.fs) })
  boxes[b.id].push(await envelope(x, b.public, { kind: 'devices', records: [recordFor(z, 'Mac', T, x.id)] }), await envelope(x, b.public, { kind: 'removed', erase: true }))
  const heard = await read(B)
  assert.deepEqual(heard.map((one) => (Array.isArray(one) ? one.slice(0, 2) : one)), [[a.id, 'devices'], 'dropped', 'dropped'])
  assert.deepEqual((await recordsOf(fsB)).map((one) => one.id).sort(), [a.id, c.id, b.id].sort())
  // Had B trusted X: what X introduced goes no further, nor anything once X is removed, wherever it says so.
  const late = recordFor(z, 'Mac', T, x.id)
  assert.equal(mergeLists(await listOf(A.fs), [late], a.id, b.id), null, 'Z from B, which didn’t add it')
  assert.equal(mergeLists(await listOf(A.fs), [late], a.id, x.id), null, 'Z from X, removed here')
  assert.equal(await receive(B, /** @type {any} */ ((await listOf(fsB)).find((one) => one.id === x.id)), { kind: 'removed', erase: true }), null, 'a removal from a removed device is never obeyed')
})

/**
 * Devices over one profile, each its own files, their mailboxes read in order as devices.js reads them (heard()): after each message, a
 * share when it changed something here or comes from a device the last share didn't reach; `noticed` as a change here, or `waiting`, as
 * the device comes back online; `again` as the timer that sends what a device didn't take a while later. A device that acts on its removal
 * removes its mailbox, as removed() does, and nothing reaches it then: erased, its identity goes, else alone() keeps it on its own; a
 * device whose identity went or is another now reads nothing. One offline sends nothing, and what it would send waits.
 * @param {number} count @param {object} settings @param {object} keys
 */
async function mesh(count, settings, keys) {
  const clock = { now: T }
  const ids = await Promise.all(Array.from({ length: count }, () => identity()))
  const boxes = new Map(ids.map((one) => [one.id, /** @type {{ from: string, value: any }[]} */ ([])]))
  const devices = await Promise.all(ids.map(async (me) => {
    const fs = memoryFS({ 'settings.json': JSON.stringify({ ...DEFAULT_SETTINGS, ...settings }), '.secrets/keys.json': JSON.stringify({ ...keys, [SECRET]: JSON.stringify(me) }) })
    for (const one of ids) await writeRecord(fs, recordOfIt(one, 'Device'))
    const dev = { fs, me, online: true, refuse: new Set(), ...context(fs, me) }
    Object.assign(dev.ctx, { now: () => clock.now, send: async (/** @type {{ id: string }} */ to, /** @type {object} */ value) => {
      if (!dev.online || dev.refuse.has(to.id)) throw Object.assign(new TypeError('not sent'), { status: dev.online ? 507 : undefined })
      if (!boxes.has(to.id)) throw Object.assign(new Error('gone'), { status: 404 })
      return boxes.get(to.id)?.push({ from: me.id, value: structuredClone(value) })
    } })
    await look(dev.ctx)
    return dev
  }))
  /** @typedef {typeof devices[number]} Dev */
  const noticed = async (/** @type {Dev} */ dev, waiting = false) => { const { changed, pending } = await look(dev.ctx); if (changed || (waiting && (pending || await unreached(dev.fs)))) await share(dev.ctx, false, false) }
  const again = async (/** @type {Dev} */ dev) => { if (await unreached(dev.fs)) await share(dev.ctx, false) }
  const read = async (/** @type {Dev} */ dev) => {
    if (JSON.parse(await getSecret(dev.fs, SECRET) ?? 'null')?.id !== dev.me.id) return
    const removals = /** @type {{ erase: boolean, by: string }[]} */ ([])
    for (const box = boxes.get(dev.me.id) ?? []; box.length;) {
      const { from, value } = /** @type {{ from: string, value: any }} */ (box.shift())
      const record = (await listOf(dev.fs)).find((one) => one.id === from && one.id !== dev.me.id)
      if (record?.removedAt && await back(dev.ctx, record, value)) await share(dev.ctx, false, false)
      if (!record || record.removedAt) continue
      const done = await receive(dev.ctx, record, value)
      if ((await look(dev.ctx)).changed || await unreached(dev.fs, from)) await share(dev.ctx, false, false)
      if (done && 'removed' in done) removals.push({ ...done.removed, by: from })
    }
    if (!removals.length) return
    const { erase, by } = await firstOf(dev.fs, removals)
    await (erase ? deleteSecret(dev.fs, SECRET) : alone(dev.fs, by, clock.now, dev.me.id))
    boxes.delete(dev.me.id)
  }
  const settled = async () => { for (let i = 0; i < 6; i++) for (const dev of devices) await read(dev) }
  return { devices, clock, noticed, again, read, settled, boxes }
}

test('an old removal crossing two edits made offline elsewhere keeps the newest key typed, everywhere, and never brings back the one replaced', async (t) => {
  t.mock.method(console, 'warn', () => {})
  for (const cEditsBrain of [false, true]) {
    const { devices: [A, B, C], clock, noticed, read, settled } = await mesh(3, { brains: [BRAINS[0]], activeBrain: 'TYPED000000000000000000000' }, { TYPED000000000000000000000: 'sk1' })
    // A removes the brain, its key with it; C, offline, types a new key (edits the brain too, the second time); B, offline, renames it.
    clock.now = T + 10
    await deleteSecret(A.fs, 'TYPED000000000000000000000')
    await saveSettings(A.fs, { ...await loadSettings(A.fs), brains: [], activeBrain: null })
    await noticed(A)
    clock.now = T + 20
    C.online = false
    if (cEditsBrain) await saveSettings(C.fs, { ...await loadSettings(C.fs), brains: [{ ...BRAINS[0], model: 'm-c' }] })
    await setSecret(C.fs, 'TYPED000000000000000000000', 'sk2')
    await noticed(C)
    clock.now = T + 30
    B.online = false
    await saveSettings(B.fs, { ...await loadSettings(B.fs), brains: [{ ...BRAINS[0], model: 'm-b' }] })
    await noticed(B)
    for (const one of cEditsBrain ? [C, B] : [B, C]) [one.online, clock.now] = [true, clock.now + 10], await read(one), await noticed(one)
    await settled()
    for (const one of [A, B, C]) assert.deepEqual([(await loadSettings(one.fs)).brains.map((brain) => brain.model), await getSecret(one.fs, 'TYPED000000000000000000000')], [['m-b'], 'sk2'], `C edits the brain: ${cEditsBrain}`)
  }
})

test('a connection signed in on one device, renamed on another and its key typed again on a third keeps the newest typed key everywhere, and no token goes', async (t) => {
  t.mock.method(console, 'warn', () => {})
  const K = { id: 'KCNN0000000000000000000000', name: 'Notes', url: 'https://mcp.example.com/', auth: 'key' }
  for (const count of [2, 3]) {
    const { devices: [A, B, C], clock, noticed, read, settled } = await mesh(count, { connections: [K] }, { KCNN0000000000000000000000: 'k1' })
    const sent = /** @type {string[]} */ ([])
    for (const one of [A, B, C].filter(Boolean)) ((send) => { one.ctx.send = async (to, value) => { sent.push(JSON.stringify(value)); return send(to, value) } })(one.ctx.send)
    // A signs in: its tokens where the key was. C, offline, types k2. B, offline, renames the connection with its old record.
    clock.now = T + 10
    await setSecret(A.fs, 'KCNN0000000000000000000000', JSON.stringify({ access: 'ACCESS', refresh: 'REFRESH' }))
    await saveSettings(A.fs, { ...await loadSettings(A.fs), connections: [{ ...K, auth: 'oauth' }] })
    await noticed(A)
    if (C) [C.online, clock.now] = [false, T + 15], await setSecret(C.fs, 'KCNN0000000000000000000000', 'k2'), await noticed(C)
    clock.now = T + 20
    B.online = false
    await saveSettings(B.fs, { ...await loadSettings(B.fs), connections: [{ ...K, name: 'Mine' }] })
    await noticed(B)
    for (const one of [B, C].filter(Boolean)) [one.online, clock.now] = [true, clock.now + 5], await read(one), await noticed(one)
    await settled()
    for (const one of [A, B, C].filter(Boolean)) assert.deepEqual([(await loadSettings(one.fs)).connections?.[0], await getSecret(one.fs, 'KCNN0000000000000000000000')], [{ ...K, name: 'Mine' }, count === 3 ? 'k2' : 'k1'])
    assert.ok(!sent.some((one) => one.includes('REFRESH')), 'no token sent')
  }
})

test('a time from the future never wins for good, and what isn’t whole is left out, the rest of the message taken', async () => {
  const { fs, me, c, d } = await three()
  const thief = { ...BRAINS[0], model: 'thief' }
  await saveSettings(fs, { ...await loadSettings(fs), brains: [...BRAINS, brain('P', 'claudecode', 'http://127.0.0.1:23001/v1')], unlocked: ['files'] })
  await setSecret(fs, 'P', 'BRIDGE-KEY')
  const { ctx, at } = context(fs, me, T + 100)
  await look(ctx)
  const [x, other] = [c, d].map((one) => /** @type {any} */ (recordFor(one, 'Device', T)))
  // X, a device of the profile's, a thief's now: a brain and a key from the far future; fields of the wrong kind, an entry that is none,
  // unlocked as a string, a brain under another id than its own, one with none, a bare string.
  const brains = { TYPED000000000000000000000: { value: thief, at: 8.64e15 }, ANTHR000000000000000000000: { value: brain('P', 'openai', 'https://api.openai.com/v1'), at: T + 50 }, nameless: { value: { provider: 'openai' }, at: T + 50 }, bare: { value: 'x', at: T + 50 } }
  const fields = { locale: { value: 42, at: T + 50 }, off: { value: {}, at: T + 50 }, unlocked: { value: 'machine', at: T + 50 }, rules: null, limit: { value: 5, at: 'soon' }, name: { value: 'Ada', at: T + 50 } }
  await receive(ctx, x, { kind: 'settings', snapshot: { fields, brains, connections: {} }, keys: { TYPED000000000000000000000: { value: 'sk-thief', at: 8.64e15 } } })
  const taken = await loadSettings(fs)
  assert.deepEqual([taken.name, taken.locale, taken.off, taken.unlocked, taken.limit], ['Ada', DEFAULT_SETTINGS.locale, undefined, ['files'], undefined])
  assert.deepEqual(taken.brains.map((one) => [one.id, one.provider, one.model]), [['TYPED000000000000000000000', 'openai', 'thief'], ['plan', 'claudecode', 'm'], ['local', 'ollama', 'm'], ['P', 'claudecode', 'm']])
  assert.deepEqual([await getSecret(fs, 'TYPED000000000000000000000'), await getSecret(fs, 'P')], ['sk-thief', 'BRIDGE-KEY'])
  // Its times no later than this device's clock and a minute: removed, its values lose to the person's fix two minutes on, even from
  // another device that took them too.
  assert.ok((await readJSON(fs, TIMES)).keys.TYPED000000000000000000000.at <= T + 100 + 60_000)
  await removal(ctx, x.id, true)
  at(T + 100 + 120_000)
  await saveSettings(fs, { ...await loadSettings(fs), brains: (await loadSettings(fs)).brains.map((one) => (one.id === 'TYPED000000000000000000000' ? BRAINS[0] : one)) })
  await setSecret(fs, 'TYPED000000000000000000000', 'sk-rotated')
  await look(ctx)
  await receive(ctx, other, { kind: 'settings', snapshot: { fields: {}, brains: { TYPED000000000000000000000: { value: thief, at: T + 100 + 60_000 } }, connections: {} }, keys: { TYPED000000000000000000000: { value: 'sk-thief', at: T + 100 + 60_000 } } })
  assert.deepEqual([(await loadSettings(fs)).brains[0].model, await getSecret(fs, 'TYPED000000000000000000000')], ['m', 'sk-rotated'])
})

test('a list a device couldn’t take goes again until it has it; the device that removes another vouches for those it added; a removed device sends nothing', async (t) => {
  t.mock.method(console, 'warn', () => {})
  const b = await identity()
  for (const aGoesAgain of [true, false]) {
    const { devices: [A, C, D], read } = await mesh(3, { brains: [BRAINS[0]] }, { TYPED000000000000000000000: 'sk' })
    // A keeps B and shares the list; D's mailbox, full, refuses it: it waits on A.
    await writeRecord(A.fs, recordFor(b, 'Pixel', T, A.me.id))
    A.refuse.add(D.me.id)
    assert.deepEqual((await share(A.ctx)).map((one) => one.id), [D.me.id])
    assert.ok((await readJSON(A.fs, TIMES)).pending)
    await read(C)
    await read(D)
    assert.deepEqual([(await recordsOf(C.fs)).some((one) => one.id === b.id), (await recordsOf(D.fs)).some((one) => one.id === b.id)], [true, false])
    A.refuse.clear()
    // A, opened again, sends what waits; or, never again, it is removed on C, which then vouches for what A added.
    if (aGoesAgain) assert.deepEqual(await share(A.ctx), [])
    else await removal(C.ctx, A.me.id, false)
    await read(D)
    assert.ok((await recordsOf(D.fs)).some((one) => one.id === b.id), `D has B, A going again: ${aGoesAgain}`)
    if (!aGoesAgain) {
      // A, removed and alone, keeps what alone() marks as its own: its lists never leave it.
      await alone(A.fs, C.me.id, T, A.me.id)
      A.sent.length = 0
      assert.ok((await tell(A.ctx, { kind: 'devices', records: await listOf(A.fs) })).length)
      assert.ok((await share(A.ctx)).length)
      assert.deepEqual(A.sent, [])
    }
  }
})

test('what stays on one device never follows: deleting old tasks, certificates, an Always allow, groups offered, and Your devices turned off', async () => {
  const { devices: [A, B], read } = await mesh(2, { off: ['devices', 'machine'] }, {})
  await saveSettings(A.fs, { ...await loadSettings(A.fs), forget: 30, certificates: { log: true }, rules: { send: 'allow' }, services: { mail: { send: 'allow' } }, grouped: ['Trip'], off: ['tables', 'devices', 'reflexes', 'meaning', 'natural-voice'], name: 'Ada', limit: 20 })
  await share(A.ctx)
  await read(B)
  const there = await loadSettings(B.fs)
  assert.deepEqual([there.name, there.forget, there.certificates, there.rules, there.services, there.grouped, there.limit], ['Ada', undefined, undefined, DEFAULT_SETTINGS.rules, undefined, undefined, undefined], 'a monthly limit, against what this device spends')
  assert.deepEqual(there.off, ['devices', 'machine', 'tables'], 'what is off there, but Your devices, what is this device’s own, and what each device downloads (Intuition, meaning, voices)')
})

test('a time this device stamped while its clock ran ahead wins no longer than a minute past its clock, here or elsewhere', async (t) => {
  t.mock.method(console, 'warn', () => {})
  const { devices: [A, F, H], clock, noticed, read, settled } = await mesh(3, { brains: [BRAINS[0]] }, { TYPED000000000000000000000: 'sk1' })
  // F, opened offline with its clock a year ahead, gets a key typed and a language chosen; its clock right again, it shares.
  F.ctx.now = () => clock.now + 365 * 86_400_000
  await setSecret(F.fs, 'TYPED000000000000000000000', 'skF')
  await saveSettings(F.fs, { ...await loadSettings(F.fs), locale: 'de' })
  await look(F.ctx)
  F.ctx.now = () => clock.now
  clock.now = T + 1000
  await noticed(F)
  await settled()
  // H, later, types the newest key and chooses French; F, later still, changes something else and shares.
  clock.now = T + 200_000
  await setSecret(H.fs, 'TYPED000000000000000000000', 'skH')
  await saveSettings(H.fs, { ...await loadSettings(H.fs), locale: 'fr' })
  await noticed(H)
  await settled()
  clock.now = T + 300_000
  await saveSettings(F.fs, { ...await loadSettings(F.fs), name: 'Ada' })
  await noticed(F)
  await settled()
  for (const one of [A, F, H]) assert.deepEqual([await getSecret(one.fs, 'TYPED000000000000000000000'), (await loadSettings(one.fs)).locale, (await loadSettings(one.fs)).name], ['skH', 'fr', 'Ada'])
  await read(A)
})

test('a list change waits before anything goes: a send that never ends, or an older share taken after a newer one failed, leaves it waiting, and the device removed is told once the others are', async (t) => {
  t.mock.method(console, 'warn', () => {})
  const { fs, me, c, d } = await three()
  const { ctx, sent } = context(fs, me)
  // A share whose send to D hangs, as a closed tab's would; meanwhile C is removed, and that share fails.
  let land = () => {}
  const slow = { ...ctx, send: async (/** @type {any} */ to, /** @type {any} */ value) => { if (to.id === d.id) await new Promise((resolve) => { land = () => resolve(undefined) }); return sent.push({ to: to.id, value }) } }
  const older = share(slow)
  await new Promise((resolve) => setTimeout(resolve, 5))
  const refusing = { ...ctx, send: async (/** @type {any} */ to) => { throw Object.assign(new Error('offline'), { to: to.id }) } }
  assert.deepEqual((await removal(refusing, c.id, true))?.unreached, ['Windows · Edge', 'iPhone · Safari'])
  land()
  assert.deepEqual(await older, [])
  assert.ok((await readJSON(fs, TIMES)).pending, 'the older share, taken, clears nothing newer')
  // Opened again: the list goes, then C is told, and nothing waits but C acting on it.
  sent.length = 0
  assert.deepEqual((await share(ctx)).map((one) => one.id), [c.id])
  assert.deepEqual(sent.map((one) => [one.to, one.value.kind]), [[d.id, 'settings'], [c.id, 'removed']])
  assert.equal((await readJSON(fs, TIMES)).pending, undefined)
  // A removal whose sends never end: it waits all the same, marked before anything went.
  const { fs: fs2, me: me2, c: c2, d: d2 } = await three()
  const { ctx: ctx2 } = context(fs2, me2)
  void removal({ ...ctx2, send: () => new Promise(() => {}) }, c2.id, false)
  await new Promise((resolve) => setTimeout(resolve, 5))
  assert.deepEqual([Boolean((await readJSON(fs2, TIMES)).pending), (await readJSON(fs2, TIMES)).owe], [true, { [c2.id]: false }])
  // The tab closed the moment the list changed, before anything else: it waits too.
  const closing = { ...ctx2, lock: async (/** @type {string} */ name, /** @type {() => Promise<any>} */ run) => { const done = await run(); if (name === 'app-device-list') throw new Error('closed'); return done } }
  await fs2.remove(TIMES)
  await assert.rejects(removal(closing, d2.id, true), /closed/)
  assert.ok((await readJSON(fs2, TIMES)).pending)
})

test('a brain this device chose that doesn’t go stays chosen: another device’s echo of the time it was chosen never takes it back', async (t) => {
  t.mock.method(console, 'warn', () => {})
  const [local, cloud] = [brain('0local', 'ollama', 'http://localhost:11434/v1'), brain('ZSKY0000000000000000000000', 'openai', 'https://api.openai.com/v1')]
  const { devices: [A, B], clock, noticed, read } = await mesh(2, { brains: [cloud], activeBrain: 'ZSKY0000000000000000000000' }, { ZSKY0000000000000000000000: 'sk' })
  await saveSettings(A.fs, { ...await loadSettings(A.fs), brains: [local, cloud], activeBrain: '0local' })
  clock.now = T + 10
  await noticed(A)
  await read(B)
  clock.now = T + 20
  await saveSettings(B.fs, { ...await loadSettings(B.fs), name: 'Ada' })
  await noticed(B)
  await read(A)
  assert.deepEqual([(await loadSettings(A.fs)).activeBrain, (await loadSettings(A.fs)).name, (await loadSettings(B.fs)).activeBrain], ['0local', 'Ada', 'ZSKY0000000000000000000000'])
  // A choice made later elsewhere still wins.
  clock.now = T + 30
  await saveSettings(B.fs, { ...await loadSettings(B.fs), brains: [cloud, brain('ANTHR000000000000000000000', 'openai', 'https://api.openai.com/v1')], activeBrain: 'ANTHR000000000000000000000' })
  await noticed(B)
  await read(A)
  assert.equal((await loadSettings(A.fs)).activeBrain, 'ANTHR000000000000000000000')
})

test('a Computer registry’s key stays on its device with the address typed for it, and words to mask, which only grow, take both devices’', async (t) => {
  t.mock.method(console, 'warn', () => {})
  const { devices: [A, B], clock, noticed, read } = await mesh(2, {}, {})
  await saveSettings(A.fs, { ...await loadSettings(A.fs), computer: { registries: { npm: 'https://corp.example/npm/' } } })
  await setSecret(A.fs, 'computer-npm', 'corp-token')
  await setSecret(B.fs, 'computer-npm', 'my-own-token')
  // Each adds a word to mask before hearing the other's.
  clock.now = T + 1
  await saveSettings(A.fs, { ...await loadSettings(A.fs), maskWords: ['Dupont'] })
  await noticed(A)
  clock.now = T + 2
  await saveSettings(B.fs, { ...await loadSettings(B.fs), maskWords: ['Martin'] })
  await noticed(B)
  await read(A)
  await read(B)
  assert.deepEqual([await getSecret(B.fs, 'computer-npm'), (await loadSettings(B.fs)).computer], ['my-own-token', undefined])
  for (const one of [A, B]) assert.deepEqual([...(await loadSettings(one.fs)).maskWords ?? []].sort(), ['Dupont', 'Martin'])
  // Sent as a key anyway, it is never taken.
  await receive(B.ctx, /** @type {any} */ ((await recordsOf(B.fs)).find((one) => one.id === A.me.id)), { kind: 'settings', snapshot: {}, keys: { 'computer-npm': { value: 'corp-token', at: T + 100 } } })
  assert.equal(await getSecret(B.fs, 'computer-npm'), 'my-own-token')
})

test('a removal owed waits until the removed device is told: a list or an ask answered meanwhile tells it, and nothing clears what is owed', async (t) => {
  t.mock.method(console, 'warn', () => {})
  for (const answer of ['list', 'ask', 'hung', 'racing']) {
    const { fs, me, c, d } = await three()
    const { ctx, sent } = context(fs, me)
    const record = /** @type {any} */ ((await recordsOf(fs)).find((one) => one.id === d.id))
    // C removed while D can't be reached.
    assert.deepEqual((await removal({ ...ctx, send: async (/** @type {any} */ to) => { throw Object.assign(new Error('offline'), { to: to.id }) } }, c.id, true))?.unreached, ['Windows · Edge', 'iPhone · Safari'])
    if (answer === 'hung') {
      // D takes the list, and the tab closes while C's removal is on its way: it still waits, to go as Jean opens.
      void share({ ...ctx, send: async (/** @type {any} */ to, /** @type {any} */ value) => { if (value.kind === 'removed') await new Promise(() => {}); return sent.push({ to: to.id, value }) } })
      await new Promise((resolve) => setTimeout(resolve, 5))
      assert.deepEqual([Boolean((await readJSON(fs, TIMES)).pending), (await readJSON(fs, TIMES)).owe], [true, { [c.id]: true }])
      await share(ctx)
    } else if (answer === 'racing') {
      // Another tab removes D while this one shares, after this share was marked, marking it anew: it keeps waiting, whatever this share took.
      await share({ ...ctx, send: async (/** @type {any} */ to, /** @type {any} */ value) => {
        const kept = await readJSON(fs, TIMES)
        if (!kept.owe[d.id]) await fs.write(TIMES, JSON.stringify({ ...kept, pending: kept.pending + 1, owe: { ...kept.owe, [d.id]: false } }))
        return sent.push({ to: to.id, value })
      } })
      assert.deepEqual([Boolean((await readJSON(fs, TIMES)).pending), (await readJSON(fs, TIMES)).owe], [true, { [c.id]: true, [d.id]: false }])
      continue
    } else if (answer === 'list') await receive(ctx, record, { kind: 'settings', snapshot: {}, devices: [recordFor(await identity(), 'Pixel', T, d.id)] })
    else await receive(ctx, record, { kind: 'ask' })
    assert.deepEqual(sent.filter((one) => one.to === c.id).map((one) => [one.value.kind, one.value.erase]), [['removed', true]], answer)
    assert.deepEqual([(await readJSON(fs, TIMES)).pending, (await readJSON(fs, TIMES)).owe], [undefined, { [c.id]: true }], answer)
  }
})

test('of two shares at once, the one begun before a removal never tells the removed device: only the one that sent the list removing it does, after it', async () => {
  const { fs, me, c, d } = await three()
  const { ctx } = context(fs, me)
  const sent = /** @type {{ to: string, value: any }[]} */ ([])
  const opened = () => { /** @type {() => void} */ let open = () => {}; return Object.assign(new Promise((resolve) => { open = () => resolve(undefined) }), { open: () => open() }) }
  const [gate, slow] = [opened(), opened()]
  const older = share({ ...ctx, send: async (/** @type {any} */ to, /** @type {any} */ value) => { await gate; return sent.push({ to: to.id, value }) } })
  await new Promise((resolve) => setTimeout(resolve, 5))
  const removing = removal({ ...ctx, send: async (/** @type {any} */ to, /** @type {any} */ value) => { if (to.id === d.id) await slow; return sent.push({ to: to.id, value }) } }, c.id, true)
  await new Promise((resolve) => setTimeout(resolve, 5))
  gate.open()
  await older
  slow.open()
  await removing
  const told = sent.findIndex((one) => one.to === c.id && one.value.kind === 'removed')
  const list = sent.findIndex((one) => one.to === d.id && one.value.devices?.some((/** @type {any} */ record) => record.id === c.id && record.removedAt))
  assert.ok(list >= 0 && told > list, 'the removed device told only after the others have the list removing it')
  assert.equal(sent.filter((one) => one.value.kind === 'removed').length, 1)
})

test('a profile paired, or once, is never untouched; a project deleted while paired stays deleted when the profile is filled again', async () => {
  const first = { 'settings.json': '{}', [`${HOME}/project.md`]: project({ default: true, name: 'Home' }) }
  const [me, other] = await Promise.all([identity(), identity()])
  const single = memoryFS({ ...first, '.secrets/keys.json': JSON.stringify({ [SECRET]: JSON.stringify(me) }) })
  await writeRecord(single, recordOfIt(me, 'Phone'))
  assert.equal(await untouched(single), true, 'its own record alone')
  for (const removed of [false, true]) {
    const paired = memoryFS({ ...first, '.secrets/keys.json': JSON.stringify({ [SECRET]: JSON.stringify(me) }) })
    for (const one of [recordOfIt(me, 'Phone'), { ...recordOfIt(other, 'Mac'), ...(removed && { removedAt: new Date(T).toISOString() }) }]) await writeRecord(paired, one)
    assert.equal(await untouched(paired), false, `another device, removed: ${removed}`)
  }
  // B, filled from A's bundle with Health in it, deletes Health while paired; removed, then filled again in place: Health stays deleted.
  const { fs: fsA, me: a } = await profileA()
  await fsA.write(`${HEALTH}/project.md`, project({ name: 'Health' }))
  const meB = await identity()
  const bundle = await bundleOf(context(fsA, a).ctx, { dir: `profiles/${ulid(T)}-ada`, name: 'Ada' }, recordFor(meB, 'Phone', T, a.id))
  const fsB = memoryFS()
  await adopt(fsB, bundle, { settings: { ...DEFAULT_SETTINGS }, catalogue: CATALOGUE, me: meB, now: T })
  await fsB.remove(HEALTH)
  await alone(fsB, a.id, T + 10, meB.id)
  await refill(context(fsB, await identity(), T + 20).ctx, bundle)
  assert.deepEqual([await fsB.exists(HEALTH), await fsB.exists(`${WORK}/project.md`)], [false, true])
  // A project that came with that refill, deleted while paired, stays deleted the next time too.
  const again = { ...bundle, projects: [...bundle.projects, { path: `${HEALTH}-2/project.md`, text: project({ name: 'New' }) }] }
  const second = await identity()
  await refill(context(fsB, second, T + 30).ctx, again)
  assert.equal(await fsB.exists(`${HEALTH}-2`), true)
  await fsB.remove(`${HEALTH}-2`)
  await alone(fsB, a.id, T + 40, second.id)
  await refill(context(fsB, await identity(), T + 50).ctx, again)
  assert.equal(await fsB.exists(`${HEALTH}-2`), false)
})

test('a change typed on a device whose clock is behind still wins over what it replaced, and what it received is never lowered by its clock', async (t) => {
  t.mock.method(console, 'warn', () => {})
  const DAY = 86_400_000
  const { devices: [A, D, C], clock, noticed, read, settled } = await mesh(3, { brains: [BRAINS[0]] }, { TYPED000000000000000000000: 'sk1' })
  // Day 1: C, offline, types a key, which waits. Day 2: A rotates the key, and D takes it.
  clock.now = T + DAY
  C.online = false
  await setSecret(C.fs, 'TYPED000000000000000000000', 'sk-c')
  await noticed(C)
  clock.now = T + 2 * DAY
  await setSecret(A.fs, 'TYPED000000000000000000000', 'sk-a')
  await saveSettings(A.fs, { ...await loadSettings(A.fs), name: 'From A' })
  await noticed(A)
  await read(D)
  // Day 4: D, opened offline with its clock five days behind, changes the person's name, then gets the newest key typed.
  clock.now = T + 4 * DAY
  ;[D.online, D.ctx.now] = [false, () => clock.now - 5 * DAY]
  await saveSettings(D.fs, { ...await loadSettings(D.fs), name: 'Ada' })
  await noticed(D)
  await setSecret(D.fs, 'TYPED000000000000000000000', 'sk-d')
  await noticed(D)
  // Day 5: both back, D's clock right: everyone ends with the key typed last, on D, then a change on A brings nothing back.
  clock.now = T + 5 * DAY
  ;[D.online, C.online, D.ctx.now] = [true, true, () => clock.now]
  await noticed(C)
  await noticed(D)
  await settled()
  for (const one of [A, D, C]) assert.equal((await loadSettings(one.fs)).name, 'Ada', 'the name changed last, on D')
  clock.now = T + 6 * DAY
  await saveSettings(A.fs, { ...await loadSettings(A.fs), name: 'Ada L.' })
  await noticed(A)
  await settled()
  for (const one of [A, D, C]) assert.equal(await getSecret(one.fs, 'TYPED000000000000000000000'), 'sk-d')
})

test('asking the others after a quiet week leaves when another was last heard as it was, so a clock ahead never lifts the cap', async (t) => {
  t.mock.method(console, 'warn', () => {})
  const DAY = 86_400_000
  const { devices: [A, F, H], clock, noticed, settled } = await mesh(3, { brains: [BRAINS[0]] }, { TYPED000000000000000000000: 'sk1' })
  for (const one of [A, F, H]) await fs2heard(one.fs, T - 5 * DAY)
  // F, opened offline with its clock three days ahead, asks the others after what looks like a quiet week, then gets a key typed.
  F.ctx.now = () => clock.now + 3 * DAY
  assert.equal(await quiet(F.ctx), true)
  assert.deepEqual([(await readJSON(F.fs, TIMES)).heard, (await readJSON(F.fs, TIMES)).asked], [T - 5 * DAY, T + 3 * DAY])
  // What it hears then is dated by the relay's clock, never its own.
  await receive(F.ctx, /** @type {any} */ ((await recordsOf(F.fs)).find((one) => one.id === A.me.id)), null, T)
  assert.equal((await readJSON(F.fs, TIMES)).heard, T)
  await setSecret(F.fs, 'TYPED000000000000000000000', 'skF')
  await look(F.ctx)
  // Its clock right again: what it stamped ahead is capped, and the key H types later wins everywhere.
  F.ctx.now = () => clock.now
  clock.now = T + 1000
  await noticed(F)
  await settled()
  clock.now = T + 200_000
  await setSecret(H.fs, 'TYPED000000000000000000000', 'skH')
  await noticed(H)
  await settled()
  clock.now = T + 300_000
  await saveSettings(F.fs, { ...await loadSettings(F.fs), name: 'Ada' })
  await noticed(F)
  await settled()
  for (const one of [A, F, H]) assert.equal(await getSecret(one.fs, 'TYPED000000000000000000000'), 'skH')
})
/** follows.json as a device that last heard another at `at`. @param {any} fs @param {number} at */
const fs2heard = async (fs, at) => fs.write(TIMES, JSON.stringify({ ...await readJSON(fs, TIMES), heard: at }))

test('a brain or a connection another device names as a secret that stays here takes nothing: only ids Jean gives cross', async () => {
  const { fs, me, c } = await three()
  const stays = { 'computer-bridge': '{"port":1,"key":"k","always":["work"]}', signin: '{"access":"a"}', 'share:01J': '{"key":"s"}', 'seal-authority': '{"key":"seal"}', 'computer-pypi': 'corp' }
  for (const [id, value] of Object.entries(stays)) await setSecret(fs, id, value)
  const { ctx, sent } = context(fs, me, T + 10)
  await look(ctx)
  const from = /** @type {any} */ ((await recordsOf(fs)).find((one) => one.id === c.id))
  const ids = Object.keys(stays)
  await receive(ctx, from, { kind: 'settings', snapshot: { fields: {}, brains: Object.fromEntries(ids.map((id) => [id, { value: brain(id, 'openai', 'https://api.openai.com/v1'), at: T + 5 }])), connections: {} },
    keys: Object.fromEntries(ids.map((id, i) => [id, i % 2 ? { at: T + 5, gone: true } : { value: 'chosen there', at: T + 5 }])) })
  for (const [id, value] of Object.entries(stays)) assert.equal(await getSecret(fs, id), value, id)
  assert.ok(!(await loadSettings(fs)).brains.some((one) => ids.includes(one.id)))
  await share(ctx)
  assert.ok(!/corp|seal|"a"/.test(JSON.stringify(sent.map((one) => one.value.keys))))
})

test('a device that learns of a removal tells the removed device too, which may not know the one that removed it', async (t) => {
  t.mock.method(console, 'warn', () => {})
  const { devices: [Y, C, D], boxes, read, again } = await mesh(3, {}, {})
  // Y adds A, and its list reaches D but never C; A then removes C.
  const a = await identity()
  const A = { fs: memoryFS(), me: a, ...context(memoryFS(), a) }
  A.fs = A.ctx.fs
  for (const one of [...await listOf(Y.fs), recordFor(a, 'Pixel', T, Y.me.id)]) await writeRecord(A.fs, one)
  await writeRecord(Y.fs, recordFor(a, 'Pixel', T, Y.me.id))
  await writeRecord(D.fs, recordFor(a, 'Pixel', T, Y.me.id))
  const told = /** @type {{ to: string, value: any }[]} */ ([])
  A.ctx.send = async (/** @type {any} */ to, /** @type {any} */ value) => told.push({ to: to.id, value })
  await removal(A.ctx, C.me.id, true)
  // C can't open what A sent: A isn't among its devices. D, which knows A, learns of the removal, and tells C itself.
  const fromA = /** @type {any} */ ((await recordsOf(D.fs)).find((one) => one.id === a.id))
  await receive(D.ctx, fromA, told.find((one) => one.to === D.me.id)?.value)
  assert.equal((await listOf(D.fs)).find((one) => one.id === C.me.id)?.erase, true)
  assert.deepEqual((boxes.get(C.me.id) ?? []).filter((one) => one.from === D.me.id).map((one) => one.value.kind), ['removed'], 'D told C')
  assert.deepEqual([(boxes.get(C.me.id) ?? []).find((one) => one.value.kind === 'removed')?.value.erase], [true])
  assert.equal((await readJSON(D.fs, TIMES)).owe?.[C.me.id], true, 'owed until C acts on it')
  // C opens D's notice, which it can, acts on it and removes its mailbox: D's next try finds it gone, and owes nothing.
  await read(C)
  assert.equal(boxes.has(C.me.id), false)
  await again(D)
  assert.equal((await readJSON(D.fs, TIMES)).owe?.[C.me.id], undefined)
})

test('joining keeps what this device turned off of its own, and its Auto when kept on itself; a project a task crossed with stays deleted when filled again', async () => {
  const { fs, me } = await profileA()
  const b = await identity()
  const bundle = await bundleOf(context(fs, me).ctx, { dir: `profiles/${ulid(T)}-ada`, name: 'Ada' }, recordOfIt(b, 'Mac · Jean'))
  const onB = memoryFS()
  await adopt(onB, { ...bundle, projects: bundle.projects.filter((one) => !one.path.startsWith(WORK)), settings: { ...bundle.settings, fields: { ...bundle.settings.fields, off: { value: ['tables'], at: T } } } },
    { settings: /** @type {any} */ ({ ...DEFAULT_SETTINGS, unlocked: ['machine', 'files'], off: ['machine', 'files'], cloud: false, auto: false, offers: { 'voice.download': 'T1', tables: 'T1' }, services: { KEYED000000000000000000000: { other: 'allow' } } }),
      catalogue: CATALOGUE, me: b, now: T, secretOf: async (id) => (id === 'computer-bridge' ? '{"port":1}' : null) })
  assert.deepEqual([...(await loadSettings(onB)).off ?? []].sort(), ['machine', 'tables'], 'This computer stays off here; what follows comes')
  assert.equal((await loadSettings(onB)).auto, false, 'kept on itself, its own Auto')
  assert.deepEqual([(await loadSettings(onB)).offers?.['voice.download'], (await loadSettings(onB)).services], ['T1', { KEYED000000000000000000000: { other: 'allow' } }], 'its own consent to download, and its own choices for a service')
  // A task of a project the bundle didn't bring arrives; the project is deleted while paired, then the profile is filled again.
  const { fs: there, path } = taskHere()
  const { ctx } = context(onB, b)
  await receive(ctx, /** @type {any} */ ((await recordsOf(onB)).find((one) => one.id === me.id)), await taskOf(there, path))
  await onB.remove(WORK)
  await alone(onB, me.id, T + 10, b.id)
  const more = { ...bundle, projects: [...bundle.projects, { path: `${WORK}/project.md`, text: project({ name: 'Work' }) }] }
  await refill(context(onB, await identity(), T + 20).ctx, more)
  assert.equal(await onB.exists(WORK), false)
})

test('offers answered go key by key, but consents to download on one device, and a device kept on itself keeps its own Auto and brain', async () => {
  const { devices: [A, B], clock, read } = await mesh(2, { offers: { tables: 'T1' } }, {})
  clock.now = T + 10
  await saveSettings(A.fs, { ...await loadSettings(A.fs), offers: { tables: 'T1', 'voice.download': 'T2', live: 'T2', documents: 'T3' }, auto: false })
  await saveSettings(B.fs, { ...await loadSettings(B.fs), offers: { tables: 'T1', meaning: 'T4' }, cloud: false })
  await share(A.ctx)
  await read(B)
  const there = await loadSettings(B.fs)
  assert.deepEqual([there.offers, there.auto], [{ tables: 'T1', meaning: 'T4', documents: 'T3' }, true], 'no consent to download here, and Auto as it was')
  // B, kept on itself, picks Auto by hand there later: A keeps its own choice.
  clock.now = T + 20
  await saveSettings(B.fs, { ...await loadSettings(B.fs), auto: false })
  await share(B.ctx)
  await read(A)
  clock.now = T + 30
  await saveSettings(B.fs, { ...await loadSettings(B.fs), auto: true })
  await share(B.ctx)
  await read(A)
  assert.deepEqual([(await loadSettings(A.fs)).offers, (await loadSettings(A.fs)).auto], [{ tables: 'T1', 'voice.download': 'T2', live: 'T2', documents: 'T3', meaning: 'T4' }, false])
})

test('a look made while a share is under way is never cleared unsent: the share looks and marks in one turn', async () => {
  const { fs, me } = await three()
  const { ctx } = context(fs, me)
  await look(ctx)
  const sent = /** @type {any[]} */ ([])
  // Another tab changes a setting and looks as soon as the share's first turn of follows.json ends.
  let turns = 0
  const lock = async (/** @type {string} */ name, /** @type {() => Promise<any>} */ run) => {
    const out = await run()
    if (name === 'app-follows' && turns++ === 0) { await saveSettings(fs, { ...await loadSettings(fs), name: 'Ada' }); await look(ctx) }
    return out
  }
  await share({ ...ctx, lock, send: async (/** @type {any} */ to, /** @type {any} */ value) => sent.push(value) })
  const went = sent.some((one) => one.snapshot?.fields?.name?.value === 'Ada')
  assert.ok(went || (await readJSON(fs, TIMES)).pending, 'what changed went, or waits')
})

test('a device never moves where another’s brain or connection sends its key or sign-in, nor its gateway or who dates its certificates', async (t) => {
  t.mock.method(console, 'warn', () => {})
  const MAIL = { id: 'EMA00000000000000000000000', name: 'Mail', url: 'https://mcp.mail.example/', auth: 'oauth' }
  const urls = { gateway: 'https://gw.example/', timestamp: 'https://tsa.example/tsr', transparencyLog: 'https://log.example/', tavily: 'https://api.tavily.com/', npm: 'https://registry.npmjs.org/' }
  const { devices: [A, B, M], clock, noticed, read } = await mesh(3, { brains: [BRAINS[0]], activeBrain: BRAINS[0].id, connections: [MAIL], urls }, { TYPED000000000000000000000: 'sk' })
  // B has no addresses of its own. M, a thief's device before it is removed, points the brain and Mail at its own address, and the
  // addresses each device keeps.
  clock.now = T + 5
  await saveSettings(B.fs, { ...await loadSettings(B.fs), urls: undefined })
  await look(B.ctx)
  clock.now = T + 10
  const evil = { gateway: 'https://evil.example/', timestamp: 'https://evil.example/tsr', transparencyLog: 'https://evil.example/log', tavily: 'https://evil.example/tavily', npm: 'https://evil.example/npm/', kiwix: 'https://kiwix.example/' }
  await saveSettings(M.fs, { ...await loadSettings(M.fs), name: 'Ada', brains: [{ ...BRAINS[0], baseURL: 'https://evil.example/v1' }], connections: [{ ...MAIL, servers: ['https://evil.example/mcp'] }], urls: evil })
  await noticed(M)
  for (const one of [A, B]) await read(one)
  for (const [one, own] of /** @type {const} */ ([[A, urls], [B, {}]])) {
    const there = await loadSettings(one.fs)
    assert.deepEqual([there.name, there.brains[0].baseURL, there.connections?.[0], there.urls], ['Ada', BRAINS[0].baseURL, MAIL, { ...own, kiwix: evil.kiwix }])
  }
  // Nor by removing one, then making it again pointing elsewhere: where it pointed stays with its tombstone.
  clock.now = T + 20
  await saveSettings(M.fs, { ...await loadSettings(M.fs), connections: [] })
  await noticed(M)
  clock.now = T + 30
  await saveSettings(M.fs, { ...await loadSettings(M.fs), connections: [{ ...MAIL, url: 'https://evil.example/' }] })
  await noticed(M)
  await read(B)
  assert.deepEqual((await loadSettings(B.fs)).connections ?? [], [])
})

test('guards and capabilities turned off on two devices apart take both, so that neither grows less careful', async (t) => {
  t.mock.method(console, 'warn', () => {})
  const { devices: [A, B], clock, noticed, read } = await mesh(2, {}, {})
  const [ask, never] = [{ id: ulid(T), kind: 'search', then: 'ask' }, { id: ulid(T + 1), kind: 'delete', then: 'never' }]
  // B, offline, asks first before searching and turns Memory off; A, later, never deletes and turns Routines off.
  clock.now = T + 60_000
  B.online = false
  await saveSettings(B.fs, { ...await loadSettings(B.fs), guards: [/** @type {any} */ (ask)], off: ['memory'] })
  await noticed(B)
  clock.now = T + 660_000
  await saveSettings(A.fs, { ...await loadSettings(A.fs), guards: [/** @type {any} */ (never)], off: ['routines'] })
  await noticed(A)
  B.online = true
  await read(B)
  await read(A)
  for (const one of [A, B]) {
    const there = await loadSettings(one.fs)
    assert.deepEqual([(there.guards ?? []).map((guard) => guard.id).sort(), [...there.off ?? []].sort()], [[ask.id, never.id].sort(), ['memory', 'routines']])
  }
  // Never a capability of B's own, or Your devices, which B would never hear turned on again, nor a guard Jean didn't make.
  const fromA = /** @type {any} */ ((await recordsOf(B.fs)).find((one) => one.id === A.me.id))
  await receive(B.ctx, fromA, { kind: 'settings', snapshot: { fields: { off: { value: ['devices', 'machine', 'tables'], at: T + 700_000 }, guards: { value: [{ id: 'x', kind: 'send', then: 'never' }, 'all'], at: T + 700_000 } }, brains: {}, connections: {} } })
  const there = await loadSettings(B.fs)
  assert.deepEqual([there.guards?.length, [...there.off ?? []].sort()], [2, ['memory', 'routines', 'tables']])
})

test('a device removed and filled again in place keeps the removals it made itself, which the device that adds it may never have heard of', async (t) => {
  t.mock.method(console, 'warn', () => {})
  const { devices: [A, B, D, E], clock, read, boxes } = await mesh(4, { brains: [BRAINS[0]] }, { TYPED000000000000000000000: 'sk1' })
  // On B, offline, D (stolen) is removed, Jean kept there; then A removes B, which hears it back online and keeps Jean on its own.
  clock.now = T + 10
  B.online = false
  await removal(B.ctx, D.me.id, false)
  clock.now = T + 20
  await removal(A.ctx, B.me.id, false)
  B.online = true
  await read(B)
  await alone(B.fs, A.me.id, clock.now, B.me.id)
  // Another tab of B's, which took a notice that came again, runs it again: what B had then stays as it was.
  await alone(B.fs, A.me.id, clock.now, B.me.id)
  // A adds B again in place.
  clock.now = T + 30
  const b = await identity()
  const you = recordFor(b, 'iPhone', clock.now, A.me.id)
  boxes.set(you.id, [])
  const again = { ...context(B.fs, { ...b, id: you.id }, clock.now).ctx, send: async (/** @type {any} */ to, /** @type {any} */ value) => boxes.get(to.id)?.push({ from: you.id, value: structuredClone(value) }) }
  await refill(again, await bundleOf(A.ctx, { dir: `profiles/${ulid(T)}-ada`, name: 'Ada' }, you))
  await writeRecord(A.fs, you)
  await share(A.ctx)
  const kept = await listOf(B.fs)
  assert.deepEqual([D, E].map((dev) => Boolean(kept.find((one) => one.id === dev.me.id)?.removedAt)), [true, false], 'D stays removed on B, and E, which alone() set aside, is back')
  // What waits on B goes: its list to A, then D's removal, and nothing else to D.
  await share(again)
  assert.deepEqual((boxes.get(D.me.id) ?? []).filter((one) => one.from === you.id).map((one) => one.value.kind), ['removed'])
  await read(A)
  assert.ok((await listOf(A.fs)).find((one) => one.id === D.me.id)?.removedAt, 'and A learns of it')
  // Removed and filled again once more, a device added since among those it had: that one is back too.
  const f = recordFor(await identity(), 'iPad', clock.now, A.me.id)
  for (const fs of [A.fs, B.fs]) await writeRecord(fs, f)
  await alone(B.fs, A.me.id, clock.now, you.id)
  const c = await identity()
  const third = recordFor(c, 'iPhone', clock.now, A.me.id)
  await refill(context(B.fs, { ...c, id: third.id }, clock.now).ctx, await bundleOf(A.ctx, { dir: `profiles/${ulid(T)}-ada`, name: 'Ada' }, third))
  assert.equal(Boolean((await listOf(B.fs)).find((one) => one.id === f.id)?.removedAt), false)
})

test('a removed device that knows only the devices removed with it hears of it from the one it knows, which passes the removals on before it goes', async (t) => {
  t.mock.method(console, 'warn', () => {})
  const { devices: [Y, C, A], read, again, boxes } = await mesh(3, {}, {})
  // C, in a drawer, never took the list naming A, which Y added. On A, the person removes Y, then C, Erase ticked, while Y is closed.
  await changeList(C.fs, (list) => list.filter((one) => one.id !== A.me.id))
  await removal(A.ctx, Y.me.id, true)
  const { unreached: names = [] } = await removal(A.ctx, C.me.id, true) ?? {}
  assert.equal(names.length, 2, 'neither told yet: the relay taking a message is no one acting on it')
  // C can't open what A sends; Y, opened, reads both notices, takes the list naming C removed and tells C, then erases.
  await read(C)
  assert.equal(boxes.has(C.me.id), true)
  await read(Y)
  assert.equal(boxes.has(Y.me.id), false)
  assert.deepEqual((boxes.get(C.me.id) ?? []).filter((one) => one.from === Y.me.id).map((one) => one.value.kind), ['removed'])
  await read(C)
  assert.equal(boxes.has(C.me.id), false, 'C acted on it')
  // A, trying again, finds both mailboxes gone: told, and nothing owed.
  assert.deepEqual(Object.keys((await readJSON(A.fs, TIMES)).owe ?? {}).sort(), [Y.me.id, C.me.id].sort())
  await again(A)
  assert.deepEqual([(await readJSON(A.fs, TIMES)).owe, await unreached(A.fs)], [{}, false])
})

test('what a device didn’t take goes again as soon as it writes, or a while later, and two devices that took it never answer each other for ever', async (t) => {
  t.mock.method(console, 'warn', () => {})
  const { devices: [A, B, X], clock, noticed, read, again, boxes } = await mesh(3, { brains: [BRAINS[0]] }, { TYPED000000000000000000000: 'sk1' })
  // The relay doesn't answer as A removes X; A stays open, and reads B's next change: B is the one it missed, so it goes to B now.
  for (const id of [B.me.id, X.me.id]) A.refuse.add(id)
  await removal(A.ctx, X.me.id, true)
  A.refuse.clear()
  assert.deepEqual([await unreached(A.fs, B.me.id), await unreached(A.fs, X.me.id)], [true, true])
  clock.now = T + 10
  await saveSettings(B.fs, { ...await loadSettings(B.fs), name: 'Ada' })
  await noticed(B)
  await read(A)
  await read(B)
  assert.ok((await listOf(B.fs)).find((one) => one.id === X.me.id)?.removedAt, 'B stops trusting X')
  // X's message waits in its mailbox; the timer tries again until X acts on it, and only that goes, B having the list.
  const toB = boxes.get(B.me.id)?.length
  await again(A)
  assert.deepEqual([await unreached(A.fs, X.me.id), boxes.get(B.me.id)?.length], [true, toB])
  await read(X)
  await again(A)
  assert.deepEqual([await unreached(A.fs), (await readJSON(A.fs, TIMES)).owe], [false, {}])
  // L's mailbox full: both A and B leave it waiting, and each change goes once, never answered back and forth.
  const { devices: [P, Q, L], clock: time, noticed: change, read: hear, boxes: held } = await mesh(3, {}, {})
  for (const one of [P, Q]) one.refuse.add(L.me.id)
  time.now = T + 10
  await saveSettings(Q.fs, { ...await loadSettings(Q.fs), memory: false })
  await change(Q)
  await hear(P)
  time.now = T + 20
  await saveSettings(P.fs, { ...await loadSettings(P.fs), name: 'Ada' })
  await change(P)
  let count = 0
  for (let i = 0; i < 10; i++) for (const one of [Q, P]) { count += held.get(one.me.id)?.length ?? 0; await hear(one) }
  assert.ok(count <= 2, `${count} messages read`)
  assert.deepEqual([(await loadSettings(P.fs)).memory, (await loadSettings(Q.fs)).name], [false, 'Ada'])
})

test('a project a task crossed with is written down in its turn, never over what another tab writes', async () => {
  const fs = memoryFS({ 'settings.json': JSON.stringify(DEFAULT_SETTINGS) })
  const turns = /** @type {string[]} */ ([])
  await known({ fs, lock: async (name, run) => { turns.push(name); return run() } }, `${WORK}/conversations/${ulid(T)}.jsonl`)
  assert.deepEqual([turns, (await readJSON(fs, TIMES)).had], [['app-follows'], [WORK.split('/')[1]]])
})

test('a project kept on this device stays out of a bundle, and one the adding device deleted while paired stays deleted when it is filled again', async () => {
  const { fs: fsL, me: l } = await profileA()
  const THERAPY = `projects/${ulid(T + 3)}-therapy`
  await fsL.write(`${HEALTH}/project.md`, project({ name: 'Health' }))
  await fsL.write(`${THERAPY}/project.md`, project({ name: 'Therapy', cloud: false }) + 'Notes from my sessions.')
  // The laptop adds the phone: the project kept on it stays.
  const p = await identity()
  const bundle = await bundleOf(context(fsL, l).ctx, { dir: `profiles/${ulid(T)}-ada`, name: 'Ada' }, recordFor(p, 'Phone', T, l.id))
  const fsP = memoryFS()
  await adopt(fsP, bundle, { settings: { ...DEFAULT_SETTINGS }, catalogue: CATALOGUE, me: p, now: T })
  assert.deepEqual([await fsP.exists(THERAPY), await fsP.exists(`${HEALTH}/project.md`)], [false, true])
  // The laptop deletes Health while paired, is removed with Jean kept, and added again in place from the phone: Health stays deleted.
  await fsL.remove(HEALTH)
  await alone(fsL, p.id, T + 10, l.id)
  const again = await identity()
  await refill(context(fsL, again, T + 20).ctx, await bundleOf(context(fsP, p, T + 20).ctx, { dir: `profiles/${ulid(T)}-ada`, name: 'Ada' }, recordFor(again, 'Laptop', T + 20, p.id)))
  assert.deepEqual([await fsL.exists(HEALTH), await fsL.exists(THERAPY)], [false, true])
})

test('a service’s Ask first and Never follow its connection, the stricter winning, never its Always allow', async (t) => {
  t.mock.method(console, 'warn', () => {})
  const WIKI = { id: 'WK000000000000000000000000', name: 'Client wiki', url: 'https://wiki.example/', auth: 'key' }
  const LOCAL = { id: 'LCL00000000000000000000000', name: 'Mine', url: 'http://localhost:3000/', auth: 'none' }
  const { devices: [A, B], clock, noticed, read } = await mesh(2, { connections: [WIKI, LOCAL] }, { [WIKI.id]: 'sk' })
  // B lets the wiki act without asking; A has it ask before reading and never act, and lets its own local service read.
  clock.now = T + 10
  await saveSettings(B.fs, { ...await loadSettings(B.fs), services: { [WIKI.id]: { other: 'allow', send: 'never' } } })
  await look(B.ctx)
  clock.now = T + 20
  await saveSettings(A.fs, { ...await loadSettings(A.fs), services: { [WIKI.id]: { fetch: 'ask', other: 'never', send: 'allow' }, [LOCAL.id]: { fetch: 'allow', other: 'never' } } })
  await noticed(A)
  assert.deepEqual(following(await loadSettings(A.fs)).services, { [WIKI.id]: { fetch: 'ask', other: 'never' } }, 'what goes: no Always allow, nothing of a local service')
  await read(B)
  // Its Never and its Ask first come, kept as they are; what they do here, the stricter of each and its kind's rule (connections.js).
  assert.deepEqual((await loadSettings(B.fs)).services, { [WIKI.id]: { fetch: 'ask', other: 'never', send: 'never' } })
  // Nor does an Always allow, or what isn't a rule, come from elsewhere.
  const fromA = /** @type {any} */ ((await recordsOf(B.fs)).find((one) => one.id === A.me.id))
  await receive(B.ctx, fromA, { kind: 'settings', snapshot: { fields: { services: { value: { [WIKI.id]: { fetch: 'allow', copy: 'allow', other: 'toString' }, x: 'never' }, at: T + 30 } }, brains: {}, connections: {} } })
  assert.deepEqual((await loadSettings(B.fs)).services, { [WIKI.id]: { fetch: 'ask', other: 'never', send: 'never' } })
})

test('a device removed, paired anew from itself, then removed and added again in place keeps every device of its second pairing', async () => {
  const [laptop, phone, again, tablet, second, last] = await Promise.all(Array.from({ length: 6 }, () => identity()))
  const fs = memoryFS({ 'settings.json': JSON.stringify(DEFAULT_SETTINGS) })
  for (const one of [laptop, phone]) await writeRecord(fs, recordOfIt(one, 'Device'))
  // The laptop removes the phone, Jean kept there; on the phone, Add a device makes it a new identity, which pairs a tablet and a second phone.
  await alone(fs, laptop.id, T, phone.id)
  await writeOwn(fs, recordFor(again, 'Phone', T + 10))
  for (const one of [tablet, second]) await writeRecord(fs, recordFor(one, 'Device', T + 20, again.id))
  // The tablet removes it, Jean kept, and adds it again in place.
  await alone(fs, tablet.id, T + 30, again.id)
  const bundle = { devices: [recordOfIt(tablet, 'Tablet'), recordFor(second, 'Device', T + 20, again.id), recordFor(last, 'Phone', T + 40, tablet.id)] }
  await refill(context(fs, last, T + 40).ctx, bundle)
  const list = await listOf(fs)
  assert.deepEqual([tablet, second, last].map((one) => Boolean(list.find((held) => held.id === one.id)?.removedAt)), [false, false, false])
})

test('a removed device whose mailbox the relay let go is told again as soon as it writes, and acts on it', async (t) => {
  t.mock.method(console, 'warn', () => {})
  const { devices: [A, B, X], read, again, boxes } = await mesh(3, {}, {})
  // X's mailbox, unread for months, is gone as A removes it: nothing reaches it, so nothing is owed.
  boxes.delete(X.me.id)
  assert.deepEqual((await removal(A.ctx, X.me.id, true))?.unreached, [])
  await read(B)
  assert.deepEqual([(await readJSON(A.fs, TIMES)).owe, (await readJSON(B.fs, TIMES)).owe ?? {}], [{}, {}])
  // X opens, its mailbox opened again, and asks after its quiet months: A and B owe it its removal again, and tell it.
  boxes.set(X.me.id, [])
  await tell(X.ctx, { kind: 'ask' })
  await read(A)
  await read(B)
  assert.deepEqual((boxes.get(X.me.id) ?? []).map((one) => one.value.kind), ['removed', 'removed'])
  await read(X)
  assert.equal(boxes.has(X.me.id), false, 'X acted on it')
  await again(A)
  assert.deepEqual((await readJSON(A.fs, TIMES)).owe, {})
})

test('who answers, chosen while a device keeps messages on itself, is never stamped, so it never goes once it lets them go again', async (t) => {
  t.mock.method(console, 'warn', () => {})
  const { devices: [A, B], clock, noticed, read } = await mesh(2, { brains: [BRAINS[0]], activeBrain: BRAINS[0].id }, {})
  // A picks its brain by hand; B keeps messages on itself, Jean setting Auto, then lets them go, Auto put back as it was.
  clock.now = T + 10
  await saveSettings(A.fs, { ...await loadSettings(A.fs), auto: false })
  await noticed(A)
  await read(B)
  const before = (await readJSON(B.fs, TIMES)).fields?.auto
  clock.now = T + 20
  await saveSettings(B.fs, { ...await loadSettings(B.fs), cloud: false, auto: true, wasAuto: false })
  assert.equal((await look(B.ctx)).changed, false, 'nothing stamped while kept')
  // Meanwhile the person turns Auto on on A, which B, kept, hears and leaves aside.
  clock.now = T + 25
  await saveSettings(A.fs, { ...await loadSettings(A.fs), auto: true })
  await noticed(A)
  await read(B)
  clock.now = T + 30
  await saveSettings(B.fs, { ...await loadSettings(B.fs), cloud: true, auto: false, wasAuto: undefined, name: 'Ada' })
  await noticed(B)
  await read(A)
  assert.deepEqual([(await readJSON(B.fs, TIMES)).fields?.auto, (await loadSettings(A.fs)).auto, (await loadSettings(A.fs)).name], [before, true, 'Ada'])
})

test('a device whose clock falls behind never lowers a key it took below when it heard it, so a key replaced elsewhere never wins back there', async (t) => {
  t.mock.method(console, 'warn', () => {})
  const MIN = 60_000
  const { devices: [A, B, C], clock, noticed, read, settled } = await mesh(3, { brains: [BRAINS[0]] }, { TYPED000000000000000000000: 'sk0' })
  await saveSettings(A.fs, { ...await loadSettings(A.fs), name: 'Ada' })
  await noticed(A)
  for (const one of [B, C]) await read(one)
  // C, offline, types sk1; A, later, types sk2, which B takes; then B looks offline, its clock two hours behind.
  C.online = false
  clock.now = T + 10 * MIN
  await setSecret(C.fs, 'TYPED000000000000000000000', 'sk1')
  await noticed(C)
  clock.now = T + 50 * MIN
  await setSecret(A.fs, 'TYPED000000000000000000000', 'sk2')
  await noticed(A)
  await read(B)
  B.online = false
  clock.now = T + 55 * MIN
  B.ctx.now = () => clock.now - 120 * MIN
  await look(B.ctx)
  // Its clock right, back online; C too.
  B.ctx.now = () => clock.now
  clock.now = T + 60 * MIN
  for (const one of [B, C]) one.online = true
  await noticed(C, true)
  await noticed(B, true)
  await settled()
  for (const one of [A, B, C]) assert.equal(await getSecret(one.fs, 'TYPED000000000000000000000'), 'sk2')
})

test('two devices that removed each other never answer each other’s notice, and owe each other nothing then', async (t) => {
  t.mock.method(console, 'warn', () => {})
  const { devices: [A, X], read, again, boxes } = await mesh(2, {}, {})
  await removal(A.ctx, X.me.id, true)
  await removal(X.ctx, A.me.id, true)
  let count = 0
  for (let i = 0; i < 5; i++) for (const one of [A, X]) { count += boxes.get(one.me.id)?.length ?? 0; await read(one); await again(one) }
  assert.ok(count <= 2, `${count} notices read`)
  assert.deepEqual([(await readJSON(A.fs, TIMES)).owe, (await readJSON(X.fs, TIMES)).owe], [{}, {}])
})

test('a tab still listening as an identity this device no longer has acts on nothing sent to it', async (t) => {
  t.mock.method(console, 'warn', () => {})
  const { devices: [A, B, C], clock, read, boxes } = await mesh(3, {}, {})
  // A removes B, Jean kept; B acts on it, then A adds it again in place, as a new identity. C, closed meanwhile, hears of it only later.
  clock.now = T + 10
  await removal(A.ctx, B.me.id, false)
  await read(B)
  const b2 = await identity()
  const you = recordFor(b2, 'Desktop', clock.now, A.me.id)
  boxes.set(you.id, [])
  await refill(context(B.fs, { ...b2, id: you.id }, clock.now).ctx, await bundleOf(A.ctx, { dir: `profiles/${ulid(T)}-ada`, name: 'Ada' }, you))
  await writeRecord(A.fs, you)
  await share(A.ctx)
  // Another tab of B, hidden throughout, opens the old mailbox again; C's late notice to the old identity lands there.
  boxes.set(B.me.id, [])
  await read(C)
  assert.ok((boxes.get(B.me.id) ?? []).some((one) => one.value.kind === 'removed'))
  await read(B)
  assert.deepEqual([JSON.parse(await getSecret(B.fs, SECRET) ?? 'null')?.id, (await recordsOf(B.fs)).some((one) => one.id === A.me.id)], [you.id, true])
})

test('of the removals a batch brings, the one acted on is from a device still had once all its lists are taken, which may add it again', async (t) => {
  t.mock.method(console, 'warn', () => {})
  const { devices: [A, D, X], read } = await mesh(3, {}, {})
  // A removes X, Jean kept, its notice lost to the network once; D, hearing of it, tells X; then A removes D too, and tells X again.
  A.refuse.add(X.me.id)
  await removal(A.ctx, X.me.id, false)
  A.refuse.clear()
  await read(D)
  await removal(A.ctx, D.me.id, false)
  await read(X)
  assert.deepEqual([await inPlace(X.fs, A.me.public), await inPlace(X.fs, D.me.public)], [true, false])
})

test('Home kept on this device goes as Home alone, its front matter without a word of it, so the other device makes no Home of its own', async () => {
  const { fs: fsA, me: a } = await profileA()
  await fsA.write(`${HOME}/project.md`, project({ default: true, name: 'Home', colour: 'blue', cloud: false, assistantName: 'Jo' }) + 'My private instructions.')
  const p = await identity()
  const bundle = await bundleOf(context(fsA, a).ctx, { dir: `profiles/${ulid(T)}-ada`, name: 'Ada' }, recordFor(p, 'Phone', T, a.id))
  const fsP = memoryFS()
  await adopt(fsP, bundle, { settings: { ...DEFAULT_SETTINGS }, catalogue: CATALOGUE, me: p, now: T })
  const home = await fsP.read(`${HOME}/project.md`) ?? ''
  assert.deepEqual([home.includes('My private'), home.includes('Jo'), /default: true/.test(home), /cloud: false/.test(home), /colour: blue/.test(home)], [false, false, true, true, true])
})

test('a brain this device has never takes headers from elsewhere, and none of them ever goes in place of the key held', async (t) => {
  t.mock.method(console, 'warn', () => {})
  const OTHER = { ...brain('NRR00000000000000000000000', 'openrouter', 'https://openrouter.ai/api/v1'), headers: { 'X-Title': 'Jean' } }
  const { devices: [A, M], clock, noticed, read } = await mesh(2, { brains: [BRAINS[0]], activeBrain: BRAINS[0].id }, { TYPED000000000000000000000: 'sk' })
  // M, a thief's device before it is removed, gives the brain an Authorization of its own, and adds another brain with its headers.
  clock.now = T + 10
  await saveSettings(M.fs, { ...await loadSettings(M.fs), brains: [{ ...BRAINS[0], headers: { Authorization: 'Bearer thief' } }, OTHER] })
  await noticed(M)
  await read(A)
  const brains = (await loadSettings(A.fs)).brains
  assert.deepEqual([brains[0].headers, brains.find((one) => one.id === OTHER.id)?.headers], [undefined, OTHER.headers])
  assert.equal(headersFor({ ...brains[0], headers: { Authorization: 'Bearer thief' } }, await getSecret(A.fs, BRAINS[0].id) ?? undefined).authorization, 'Bearer sk')
})

test('joining brings the open profile’s own settings only when it is the first run’s, never those of one with work, maybe another person’s', async () => {
  const { fs, me } = await profileA()
  const dad = /** @type {any} */ ({ ...DEFAULT_SETTINGS, rules: { delete: 'allow' }, services: { KEYED000000000000000000000: { send: 'allow' } }, forget: 30, brains: [brain('plan', 'claudecode', 'http://127.0.0.1:23001/v1')],
    connections: [{ id: 'LCL00000000000000000000000', name: 'Mail', url: 'http://localhost:3000/', auth: 'key' }], unlocked: ['files', 'machine'] })
  const open = memoryFS({ 'settings.json': JSON.stringify(dad), '.secrets/keys.json': JSON.stringify({ 'computer-bridge': '{"port":1}', LCL00000000000000000000000: 'dad-mail' }), [`${WORK}/project.md`]: project({ name: 'Work' }) })
  assert.equal(await broughtFrom(open, dad), null)
  const mom = await identity()
  const bundle = await bundleOf(context(fs, me).ctx, { dir: `profiles/${ulid(T)}-mom`, name: 'Mom' }, recordFor(mom, 'Computer', T, me.id))
  const made = memoryFS()
  await adopt(made, bundle, { settings: await broughtFrom(open, dad) ?? DEFAULT_SETTINGS, catalogue: CATALOGUE, me: mom, now: T })
  const there = await loadSettings(made)
  assert.deepEqual([there.rules, there.services, there.forget, there.brains.some((one) => one.id === 'plan'), (there.connections ?? []).some((one) => one.id === 'LCL00000000000000000000000')], [DEFAULT_SETTINGS.rules, undefined, undefined, false, false])
  assert.deepEqual([await getSecret(made, 'computer-bridge'), await getSecret(made, 'LCL00000000000000000000000')], [null, null])
  // From the first run's profile, which holds nothing, its own settings come.
  const first = memoryFS({ 'settings.json': JSON.stringify({ ...DEFAULT_SETTINGS, voice: 'Kyoko' }) })
  assert.equal((await broughtFrom(first, { ...DEFAULT_SETTINGS, voice: 'Kyoko' }))?.voice, 'Kyoko')
})

test('a list that changes this one is marked as waiting, with what it owes, before it is written, so a tab closed between still sends both as Jean opens', async (t) => {
  t.mock.method(console, 'warn', () => {})
  for (const written of [true, false]) {
    const { fs, me, c, d } = await three()
    const { ctx, sent } = context(fs, me)
    const from = /** @type {any} */ ((await recordsOf(fs)).find((one) => one.id === c.id))
    const gone = { ...recordOfIt(d, 'Windows · Edge'), removedAt: new Date(T).toISOString() }
    // The tab closes the moment the list is written, or just before.
    const closing = { ...ctx, lock: async (/** @type {string} */ name, /** @type {() => Promise<any>} */ run) => {
      if (name !== 'app-device-list') return run()
      if (written) await run()
      throw new Error('closed')
    } }
    await assert.rejects(receive(closing, from, { kind: 'devices', records: [gone] }), /closed/)
    assert.equal((await readJSON(fs, TIMES)).owe?.[d.id], false, `owed, the list written: ${written}`)
    // Jean opens again: what waits goes (listening() in devices.js), the list to the others and, written, D's removal after it.
    if ((await look(ctx)).pending || await unreached(fs)) await share(ctx, false)
    const toD = () => sent.filter((one) => one.value.kind === 'removed' && one.to === d.id).length
    assert.deepEqual([sent.some((one) => one.to === c.id && one.value.kind === 'settings'), toD()], [true, written ? 1 : 0], `the list written: ${written}`)
    // Not written, the batch, never read past, comes again: the list changes now, and D is told.
    if (!written) await receive(ctx, from, { kind: 'devices', records: [gone] })
    assert.equal(toD(), 1)
  }
})

test('a removal is owed, and marked as waiting, before the list removing it is written', async (t) => {
  t.mock.method(console, 'warn', () => {})
  const { fs, me, c } = await three()
  const { ctx } = context(fs, me)
  const closing = { ...ctx, lock: async (/** @type {string} */ name, /** @type {() => Promise<any>} */ run) => { if (name === 'app-device-list') throw new Error('closed'); return run() } }
  await assert.rejects(removal(closing, c.id, true), /closed/)
  assert.deepEqual([(await readJSON(fs, TIMES)).owe, Boolean((await readJSON(fs, TIMES)).pending)], [{ [c.id]: true }, true])
})

test('approvals follow as services do: an Ask first or a Never goes, the stricter winning against what each device has, never an Always allow', async (t) => {
  t.mock.method(console, 'warn', () => {})
  const { devices: [A, B], clock, noticed, read } = await mesh(2, {}, {})
  clock.now = T + 10
  await saveSettings(B.fs, { ...await loadSettings(B.fs), rules: { other: 'allow', read: 'never' } })
  await look(B.ctx)
  clock.now = T + 20
  await saveSettings(A.fs, { ...await loadSettings(A.fs), rules: { delete: 'never', other: 'never', read: 'ask', fetch: 'allow', move: 'ask' } })
  await noticed(A)
  assert.deepEqual(following(await loadSettings(A.fs)).rules, { delete: 'never', other: 'never', read: 'ask' }, 'no Always allow goes, nor an Ask first that is the usual rule (move)')
  await read(B)
  // Never comes, and wins over an Always allow; B's own Never stays; an Ask first already B's usual rule (move) adds nothing.
  assert.deepEqual((await loadSettings(B.fs)).rules, { other: 'never', read: 'never', delete: 'never' })
})

test('a profile locked, or set up, is never untouched: joining neither brings its settings nor removes it; the first run’s, a voice or this device’s brain picked, still is', async () => {
  const first = { ...DEFAULT_SETTINGS, voice: 'Kyoko', brains: [{ id: ulid(T), provider: 'device', api: 'device', baseURL: '', model: 'gemma' }] }
  const home = { [`${HOME}/project.md`]: project({ default: true, name: 'Home' }) }
  const fresh = memoryFS({ 'settings.json': JSON.stringify(first), '.secrets/vault.json': JSON.stringify({ format: 1, slots: [{ kind: 'device' }] }), ...home })
  assert.deepEqual([await untouched(fresh), (await broughtFrom(fresh, /** @type {any} */ (first)))?.voice], [true, 'Kyoko'])
  const locked = memoryFS({ 'settings.json': JSON.stringify(first), '.secrets/vault.json': JSON.stringify({ format: 1, slots: [{ kind: 'password' }, { kind: 'recovery' }] }), ...home })
  assert.equal(await untouched(locked), false, 'a lock set')
  const setUps = /** @type {Record<string, any>[]} */ ([{ rules: { delete: 'allow' } }, { services: { X: { send: 'allow' } } }, { forget: 30 }, { limit: 5 }, { pages: { sites: ['*'] } }, { films: true },
    { brains: [{ id: ulid(T), provider: 'ollama', api: 'openai', baseURL: 'http://localhost:11434/v1', model: 'q' }] }, { connections: [{ id: ulid(T), name: 'Mail', url: 'http://localhost:3333/mcp', auth: 'none' }] }])
  for (const change of setUps) assert.equal(await untouched(memoryFS({ 'settings.json': JSON.stringify({ ...first, ...change }), ...home })), false, JSON.stringify(change))
  // An approval as it is anyway, set by hand, is no change.
  assert.equal(await untouched(memoryFS({ 'settings.json': JSON.stringify({ ...first, rules: { fetch: 'ask' } }), ...home })), true)
})

test('alone() writes down the devices it sets aside before marking any removed, one tab at a time, and refill() forgets them only once its list is written', async (t) => {
  t.mock.method(console, 'warn', () => {})
  const [a, p, c, d, again] = await Promise.all(Array.from({ length: 5 }, () => identity()))
  const fresh = async () => {
    const fs = memoryFS({ 'settings.json': JSON.stringify(DEFAULT_SETTINGS), '.secrets/keys.json': JSON.stringify({ [SECRET]: JSON.stringify(p) }) })
    for (const one of [a, p, c, d]) await writeRecord(fs, recordOfIt(one, 'Device'))
    return fs
  }
  /** The profile's files, closed as soon as `after` says so, every write then refused, or, `before`, that write itself.
   * @param {any} fs @param {(path: string, text: string) => boolean} after @param {boolean} [before] */
  const closing = (fs, after, before = false) => { let closed = false; return new Proxy(fs, { get: (target, key) => (key !== 'write' ? target[key] : async (/** @type {string} */ path, /** @type {string} */ text) => {
    if (closed || (before && after(path, text))) throw new Error('closed')
    await target.write(path, text)
    closed = after(path, text)
  }) }) }
  const left = async (/** @type {any} */ fs) => [...(await readJSON(fs, TIMES)).left ?? []].sort()
  const expected = [p.id, c.id, d.id].sort()
  // The tab closes the moment the list is written: what was set aside is already written down.
  const one = await fresh()
  await alone(closing(one, (path, text) => path === '.secrets/keys.json' && text.includes('removedAt')), a.id, T, p.id).catch(() => {})
  assert.deepEqual(await left(one), expected)
  // Two tabs at once, the second slow to read the list, which it would read once the first marked every device removed: one at a time,
  // it reads after, and keeps what the first set aside.
  const two = await fresh()
  // Locks by name, as Web Locks are.
  const chains = new Map()
  const turn = async (/** @type {string} */ name, /** @type {() => Promise<any>} */ run) => { const next = (chains.get(name) ?? Promise.resolve()).then(run, run); chains.set(name, next); return next }
  let ended = () => {}
  const firstDone = new Promise((resolve) => { ended = () => resolve(undefined) })
  const slow = new Proxy(two, { get: (target, key) => (key !== 'read' ? target[key] : async (/** @type {string} */ path) => { if (path === '.secrets/keys.json') await firstDone; return target.read(path) }) })
  await Promise.all([alone(two, a.id, T, p.id, turn).then(ended), alone(slow, a.id, T, p.id, turn)])
  assert.deepEqual(await left(two), expected)
  // Added again in place, the refill failing as it writes the new list, then tried again: C and D, set aside, are back.
  const bundle = { devices: [recordOfIt(a, 'Device'), recordOfIt(c, 'Device'), recordOfIt(d, 'Device'), recordFor(again, 'Phone', T + 10, a.id)] }
  await assert.rejects(refill(context(closing(one, (path) => path === '.secrets/keys.json', true), { ...again, id: bundle.devices[3].id }, T + 10).ctx, bundle))
  await refill(context(one, { ...again, id: bundle.devices[3].id }, T + 10).ctx, bundle)
  const list = await listOf(one)
  assert.deepEqual([c, d].map((dev) => Boolean(list.find((held) => held.id === dev.id)?.removedAt)), [false, false])
})

test('joining from a profile with a lock unlocks Lock in the new one, whatever came, so that it opens on it', async () => {
  const { fs, me } = await profileA()
  const b = await identity()
  const bundle = await bundleOf(context(fs, me).ctx, { dir: `profiles/${ulid(T)}-ada`, name: 'Ada' }, recordFor(b, 'Laptop', T, me.id))
  assert.equal((await loadSettings(fs)).unlocked.includes('lock'), false)
  const made = memoryFS()
  await adopt(made, bundle, { settings: DEFAULT_SETTINGS, catalogue: CATALOGUE, me: b, now: T, lock: true })
  const unlocked = (await loadSettings(made)).unlocked
  assert.deepEqual([unlocked.includes('devices'), unlocked.includes('lock')], [true, true])
  const plain = memoryFS()
  await adopt(plain, bundle, { settings: DEFAULT_SETTINGS, catalogue: CATALOGUE, me: b, now: T })
  assert.equal((await loadSettings(plain)).unlocked.includes('lock'), false)
})

test('a service’s Ask first is kept as it comes, whatever this device’s rule for its kind then, so an Always allow of the kind set here later never loosens it', async (t) => {
  t.mock.method(console, 'warn', () => {})
  const MAIL = { id: 'ML000000000000000000000000', name: 'Mail', url: 'https://mail.example/', auth: 'key' }
  const { fs, me, c } = await three()
  await saveSettings(fs, { ...await loadSettings(fs), connections: [MAIL], rules: { other: 'never' } })
  const { ctx } = context(fs, me, T + 10)
  await look(ctx)
  const from = /** @type {any} */ ((await recordsOf(fs)).find((one) => one.id === c.id))
  await receive(ctx, from, { kind: 'settings', snapshot: { fields: { services: { value: { [MAIL.id]: { other: 'ask', fetch: 'allow' } }, at: T + 5 } }, brains: {}, connections: {} } })
  assert.deepEqual((await loadSettings(fs)).services, { [MAIL.id]: { other: 'ask' } }, 'kept though the kind’s Never holds now, never an Always allow')
  // The person allows acting always here later: Mail still asks, as on the other device.
  await saveSettings(fs, { ...await loadSettings(fs), rules: { other: 'allow' } })
  await look(ctx)
  assert.deepEqual((await loadSettings(fs)).services, { [MAIL.id]: { other: 'ask' } })
})

test('alone() run again keeps what it set aside then and what it has now: a device paired meanwhile is never taken for one of its removals', async (t) => {
  t.mock.method(console, 'warn', () => {})
  const [a, x, c, y, again] = await Promise.all(Array.from({ length: 5 }, () => identity()))
  const fs = memoryFS({ 'settings.json': JSON.stringify(DEFAULT_SETTINGS), '.secrets/keys.json': JSON.stringify({ [SECRET]: JSON.stringify(x) }) })
  for (const one of [a, x, c]) await writeRecord(fs, recordOfIt(one, 'Device'))
  // A tab closed in alone() once it wrote what it set aside: its identity stays, and the batch comes again with Y, which C added meanwhile.
  await fs.write(TIMES, JSON.stringify({ format: 1, left: [x.id, c.id], leftAs: x.id }))
  await writeRecord(fs, recordFor(y, 'Device', T, c.id))
  await alone(fs, a.id, T + 10, x.id)
  assert.deepEqual([...(await readJSON(fs, TIMES)).left].sort(), [x.id, c.id, y.id].sort())
  // Added again in place by A: Y is live, never one of its removals.
  const you = recordFor(again, 'Phone', T + 20, a.id)
  await refill(context(fs, { ...again, id: you.id }, T + 20).ctx, { devices: [recordOfIt(a, 'Device'), recordOfIt(c, 'Device'), recordFor(y, 'Device', T, c.id), you] })
  assert.equal(Boolean((await listOf(fs)).find((one) => one.id === y.id)?.removedAt), false)
})

test('alone() forgets its identity and marks the others removed in one write, so that a stop between never leaves it to be filled in place by any device', async () => {
  const [a, x, c] = await Promise.all(Array.from({ length: 3 }, () => identity()))
  const fs = memoryFS({ 'settings.json': JSON.stringify(DEFAULT_SETTINGS), '.secrets/keys.json': JSON.stringify({ [SECRET]: JSON.stringify(x) }) })
  for (const one of [a, x, c]) await writeRecord(fs, recordOfIt(one, 'Device'))
  // The tab stops after the first write of the keys.
  let writes = 0
  const stopping = new Proxy(fs, { get: (target, key) => (key !== 'write' ? target[key] : async (/** @type {string} */ path, /** @type {string} */ text) => {
    if (path === '.secrets/keys.json' && writes++ > 0) throw new Error('stopped')
    return target.write(path, text)
  }) })
  await alone(stopping, a.id, T, x.id).catch(() => {})
  assert.deepEqual([await inPlace(fs, a.public), await inPlace(fs, c.public)], [true, false])
})

test('a device that keeps refusing is the only one told again: the others, which took this mark, never get it twice', async (t) => {
  t.mock.method(console, 'warn', () => {})
  const { devices: [A, B, L], clock, noticed, again, boxes } = await mesh(3, {}, {})
  A.refuse.add(L.me.id)
  clock.now = T + 10
  await saveSettings(A.fs, { ...await loadSettings(A.fs), name: 'Ada' })
  await noticed(A)
  for (let i = 0; i < 5; i++) { await again(A); await noticed(A, true) }
  assert.deepEqual([boxes.get(B.me.id)?.length, boxes.get(L.me.id)?.length], [1, 0])
  // L takes it at last: it is told, once, and nothing waits.
  A.refuse.clear()
  await again(A)
  assert.deepEqual([boxes.get(B.me.id)?.length, boxes.get(L.me.id)?.length, (await readJSON(A.fs, TIMES)).pending], [1, 1, undefined])
})

test('a removed device that writes again is owed its removal, with a mark only while the list removing it hasn’t reached every device', async (t) => {
  t.mock.method(console, 'warn', () => {})
  for (const missed of [false, true]) {
    const { fs, me, c, d } = await three()
    const { ctx, sent } = context(fs, me)
    // Its mailbox gone as it is removed; D, the other, takes the list, or doesn't.
    await removal({ ...ctx, send: async (/** @type {any} */ to) => { throw Object.assign(new Error('refused'), { status: to.id === c.id ? 404 : missed ? 507 : undefined }) } }, c.id, true)
    if (!missed) await share(ctx)
    sent.length = 0
    const gone = /** @type {any} */ ((await listOf(fs)).find((one) => one.id === c.id))
    assert.equal(await back(ctx, gone, { kind: 'ask' }), true)
    assert.deepEqual([(await readJSON(fs, TIMES)).owe, Boolean((await readJSON(fs, TIMES)).pending)], [{ [c.id]: true }, missed], `D missed it: ${missed}`)
    // The timer's retry: the list to D first where it missed it, then the notice.
    await share(ctx, false)
    assert.deepEqual(sent.map((one) => [one.to === d.id ? 'D' : 'C', one.value.kind]), [...(missed ? [['D', 'settings']] : []), ['C', 'removed']], `D missed it: ${missed}`)
  }
})

test('a removed device that keeps writing costs the others nothing but its notice, at most hourly', async (t) => {
  t.mock.method(console, 'warn', () => {})
  const { devices: [A, B, X], clock, read, again, boxes } = await mesh(3, {}, {})
  // A removes X, which never acts on it and writes every 18 seconds for an hour.
  await removal(A.ctx, X.me.id, true)
  await read(B)
  const between = () => [...boxes.get(A.me.id) ?? [], ...boxes.get(B.me.id) ?? []].filter((one) => one.from !== X.me.id).length
  let sent = 0
  for (let i = 0; i < 200; i++) {
    clock.now += 18_000
    await tell(X.ctx, { kind: 'ask' })
    sent += between()
    for (const one of [A, B]) await read(one)
  }
  assert.ok(sent <= 2, `${sent} messages between the two`)
  assert.equal((boxes.get(X.me.id) ?? []).filter((one) => one.value.kind === 'removed').length, 2, 'each told X once, never again at its messages')
  // The hourly retry tells X again.
  const before = (boxes.get(X.me.id) ?? []).length
  await again(A)
  assert.equal((boxes.get(X.me.id) ?? []).length, before + 1)
})

test('alone() writes the times under their own lock too, within the list’s, so that a share at once never writes over them', async () => {
  const [a, x] = await Promise.all([identity(), identity()])
  const fs = memoryFS({ 'settings.json': JSON.stringify(DEFAULT_SETTINGS), '.secrets/keys.json': JSON.stringify({ [SECRET]: JSON.stringify(x) }) })
  for (const one of [a, x]) await writeRecord(fs, recordOfIt(one, 'Device'))
  const taken = /** @type {string[]} */ ([])
  await alone(fs, a.id, T, x.id, async (name, run) => { taken.push(name); return run() })
  assert.deepEqual(taken, ['app-device-list', 'app-follows'])
})
