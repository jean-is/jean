// The request service (requests/, D446): a request from the page's form is kept and mailed to Warehouse SAS with the lines
// that sign its keys, and the page told so; what isn't a request, a robot's or too many asks are not passed on; and
// the mail goes over SMTP as a mail server expects it.
import assert from 'node:assert/strict'
import { createServer, connect } from 'node:net'
import { test } from 'node:test'
import { originsOf, read, requests } from '../requests/requests.js'
import { message, smtp } from '../requests/serve.js'

const NOW = Date.parse('2026-10-20T10:00:00Z')
const FORM = { back: 'enterprise/key', lang: 'fr', kind: 'trial', organisation: 'O’Brien & Fils', origins: 'jean.acme.example, https://ai.acme.example/path', people: '120', name: 'Ada Lovelace', email: 'ada@acme.example' }

/** A service whose store says what it got. @param {{ failing?: boolean }} [at] */
function service({ failing = false } = {}) {
  const kept = /** @type {string[]} */ ([])
  const mailed = /** @type {Array<{ subject: string, text: string, replyTo: string }>} */ ([])
  const handle = requests({ keep: async (line) => { kept.push(line) }, mail: async (mail) => { if (failing) throw new Error('down'); mailed.push(mail) } }, { now: () => NOW })
  /** @param {Record<string, string>} fields @param {string} [address] */
  const post = (fields, address = '192.0.2.1') => {
    const body = new URLSearchParams(fields).toString()
    return handle(new Request('https://jean.is/keys', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'content-length': String(body.length) }, body }), { address })
  }
  return { handle, post, kept, mailed }
}

test('the addresses Jean is served from are read as origins, https:// added where none is said, and nothing else', () => {
  assert.deepEqual(originsOf('jean.acme.example https://ai.acme.example/path, jean.acme.example'), ['https://jean.acme.example', 'https://ai.acme.example'])
  assert.deepEqual(originsOf('https://jean.acme.example:8443'), ['https://jean.acme.example:8443'])
  for (const text of ['', 'http://jean.acme.example', 'ftp://jean.acme.example', 'https://user:pass@jean.acme.example', 'https://', Array.from({ length: 11 }, (_, i) => `a${i}.example`).join(' ')]) assert.equal(originsOf(text), null, text)
})

test('a request is read whole, and one missing what it needs, or holding what it can’t, is none', () => {
  const asked = read(new URLSearchParams({ ...FORM, kind: 'subscription', country: 'eu', vat: 'DE123456789', trial: 'on', quote: '20261020-K3F9', address: 'Hauptstraße 1\r\n10115 Berlin' }))
  assert.deepEqual(asked, { kind: 'subscription', organisation: 'O’Brien & Fils', origins: ['https://jean.acme.example', 'https://ai.acme.example'], people: 120, name: 'Ada Lovelace', email: 'ada@acme.example',
    country: 'eu', vat: 'DE123456789', address: 'Hauptstraße 1\n10115 Berlin', trial: true, quote: '20261020-K3F9', message: '', lang: 'fr' })
  assert.equal(read(new URLSearchParams({ ...FORM, trial: 'on' }))?.trial, false, 'a trial key meanwhile only comes with a subscription')
  for (const [key, value] of Object.entries({ kind: 'forever', organisation: '', email: 'ada@acme', people: '0', name: 'Ada\nBcc: eve@example.com', country: 'mars', vat: 'FR<script>', quote: '../x', lang: 'french' })) {
    assert.equal(read(new URLSearchParams({ ...FORM, [key]: value })), null, key)
  }
})

test('a request is kept and mailed to Warehouse SAS with the lines that sign its keys, and the page says it was sent', async () => {
  const { post, kept, mailed } = service()
  const answer = await post(FORM)
  assert.equal(answer.status, 303)
  assert.equal(answer.headers.get('location'), '/enterprise/key#sent')
  assert.equal(JSON.parse(kept[0]).at, '2026-10-20T10:00:00.000Z')
  const [mail] = mailed
  assert.equal(mail.replyTo, 'ada@acme.example')
  assert.equal(mail.subject, 'O’Brien & Fils: a 30-day trial key')
  assert.match(mail.text, /^node sign\.mjs --org 'O’Brien & Fils' --origin 'https:\/\/jean\.acme\.example' --origin 'https:\/\/ai\.acme\.example' --until 2026-11-19 --trial$/m)
  assert.doesNotMatch(mail.text, /--until 2027/, 'a trial is all it asked for')

  await post({ ...FORM, kind: 'subscription', organisation: "Rock'n'Roll SA", trial: 'on', quote: '20261020-K3F9' }, '192.0.2.2')
  assert.match(mailed[1].text, /^Quote: 20261020-K3F9$/m)
  assert.match(mailed[1].text, /^node sign\.mjs --org 'Rock'\\''n'\\''Roll SA' .* --until 2026-11-19 --trial$/m, 'a name is quoted for the shell, whatever it holds')
  assert.match(mailed[1].text, /^node sign\.mjs --org .* --until 2027-10-20$/m, 'the year, signed once the invoice is paid')
})

test('a robot’s request, one too many from an address, and one the mail can’t pass on are not sent', async () => {
  const robot = service()
  const trapped = await robot.post({ ...FORM, website: 'https://spam.example' })
  assert.equal(trapped.headers.get('location'), '/enterprise/key#sent', 'a robot is told what a person is')
  assert.deepEqual([robot.kept, robot.mailed], [[], []])

  const busy = service()
  for (let i = 0; i < 5; i++) assert.equal((await busy.post(FORM)).headers.get('location'), '/enterprise/key#sent')
  assert.equal((await busy.post(FORM)).headers.get('location'), '/enterprise/key#again')
  assert.equal((await busy.post(FORM, '192.0.2.9')).headers.get('location'), '/enterprise/key#sent', 'another address may still ask')

  const down = service({ failing: true })
  assert.equal((await down.post(FORM)).headers.get('location'), '/enterprise/key#again')
  assert.equal(down.kept.length, 1, 'kept all the same')
})

test('what isn’t the form is refused, and a GET says what the service is', async () => {
  const { handle, post } = service()
  assert.deepEqual(await (await handle(new Request('https://jean.is/keys'))).json(), { format: 1 })
  assert.equal((await handle(new Request('https://jean.is/keys', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }))).status, 415)
  assert.equal((await post({ ...FORM, back: 'https://evil.example/' })).status, 400)
  assert.equal((await post({ ...FORM, email: 'nobody' })).status, 400)
  assert.equal((await post({ ...FORM, message: 'x'.repeat(30_000) })).status, 413)
})

/**
 * A mail server here, answering as Google's does, STARTTLS too unless told not to; its TLS is left to the test's
 * `secure`, which keeps the same connection. @param {{ starttls?: boolean }} [at]
 */
async function mailServer({ starttls = true } = {}) {
  const said = /** @type {string[]} */ ([])
  const got = { data: '' }
  let ended = () => {}
  const closed = new Promise((resolve) => { ended = () => resolve(null) })
  const server = createServer((socket) => {
    let reading = false
    socket.on('close', ended)
    socket.write('220 mail.example ESMTP\r\n')
    socket.on('data', (chunk) => {
      for (const line of chunk.toString().split('\r\n').filter((_, i, all) => i < all.length - 1 || _)) {
        if (reading) {
          if (line === '.') { reading = false; socket.write('250 2.0.0 queued\r\n') } else got.data += `${line}\r\n`
          continue
        }
        said.push(line)
        if (line.startsWith('EHLO')) socket.write(`250-mail.example\r\n${starttls ? '250-STARTTLS\r\n' : ''}250 AUTH PLAIN\r\n`)
        else if (line === 'STARTTLS') socket.write(starttls ? '220 2.0.0 ready to start TLS\r\n' : '502 5.5.1 unrecognized command\r\n')
        else if (line.startsWith('AUTH')) socket.write('235 2.7.0 accepted\r\n')
        else if (line === 'DATA') { reading = true; socket.write('354 go on\r\n') } else if (line === 'QUIT') socket.end('221 bye\r\n')
        else socket.write('250 2.1.0 ok\r\n')
      }
    })
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(null)))
  const { port } = /** @type {import('node:net').AddressInfo} */ (server.address())
  const secured = /** @type {number[]} */ ([])
  /** How smtp() reaches it: here, whatever port it asks for, and TLS noted where it would begin. */
  const ways = {
    connect: () => connect(port, '127.0.0.1'),
    secure: (/** @type {import('node:net').Socket} */ socket) => { secured.push(said.length); return socket },
  }
  return { said, got, closed, ways, secured, close: () => server.close() }
}

const SERVER = { host: 'mail.example', user: 'arnaud@jean.is', password: 'secret', to: 'arnaud@jean.is' }
const AUTH = `AUTH PLAIN ${Buffer.from('\0arnaud@jean.is\0secret').toString('base64')}`

test('the mail goes over SMTP, signed in after STARTTLS, its subject and text in UTF-8 a mail server carries as they are', async () => {
  const at = await mailServer()
  const mail = { subject: 'Établissement Ünïcode et fils, très long nom: a free key', text: 'Première ligne\nSeconde ligne', replyTo: 'ada@acme.example' }
  await smtp(SERVER, mail, /** @type {any} */ (at.ways))
  await at.closed
  at.close()
  assert.deepEqual(at.said, ['EHLO jean.is', 'STARTTLS', 'EHLO jean.is', AUTH, 'MAIL FROM:<arnaud@jean.is>', 'RCPT TO:<arnaud@jean.is>', 'DATA', 'QUIT'])
  assert.deepEqual(at.secured, [2], 'TLS begins once the server is ready for it, before anything but EHLO and STARTTLS')
  const [head, body] = at.got.data.split('\r\n\r\n')
  assert.match(head, /^Reply-To: ada@acme\.example$/m)
  const subject = /^Subject: ([\s\S]*?)\r\n(?=\S)/m.exec(head)?.[1] ?? ''
  assert.ok(subject.split('\r\n ').every((word) => word.length <= 75), 'encoded words short enough for a line each')
  assert.equal(subject.split('\r\n ').map((word) => Buffer.from(word.slice(10, -2), 'base64').toString()).join(''), mail.subject)
  assert.equal(Buffer.from(body.replaceAll('\r\n', ''), 'base64').toString(), 'Première ligne\r\nSeconde ligne')
  assert.match(message(SERVER, mail), /^Message-ID: <[\w-]+@jean\.is>$/m)
})

test('on port 465 TLS comes first, and a server that can’t start TLS never gets the password', async () => {
  const first = await mailServer()
  await smtp({ ...SERVER, port: 465 }, { subject: 's', text: 't', replyTo: 'ada@acme.example' }, /** @type {any} */ (first.ways))
  await first.closed
  first.close()
  assert.deepEqual(first.secured, [0])
  assert.deepEqual(first.said.slice(1, 2), [AUTH])

  const clear = await mailServer({ starttls: false })
  await assert.rejects(smtp(SERVER, { subject: 's', text: 't', replyTo: 'ada@acme.example' }, /** @type {any} */ (clear.ways)), /502 5\.5\.1/)
  clear.close()
  assert.ok(!clear.said.some((line) => line.startsWith('AUTH')))
})

test('through a relay that knows the server by its address, the mail goes with no sign-in, from the sender named', async () => {
  const at = await mailServer()
  await smtp({ host: 'smtp-relay.example', from: 'arnaud@jean.is', to: 'arnaud@jean.is' }, { subject: 's', text: 't', replyTo: 'ada@acme.example' }, /** @type {any} */ (at.ways))
  await at.closed
  at.close()
  assert.deepEqual(at.said, ['EHLO jean.is', 'STARTTLS', 'EHLO jean.is', 'MAIL FROM:<arnaud@jean.is>', 'RCPT TO:<arnaud@jean.is>', 'DATA', 'QUIT'])
  assert.match(at.got.data, /^From: arnaud@jean\.is$/m)
})
