// Runs the request service (requests.js, D446) on Node 22 or later, with nothing to install:
//   REQUESTS_CONFIG='{"mail":{"host":"smtp.gmail.com","user":"arnaud@jean.is","password":"<app password>","to":"arnaud@jean.is"}}' node requests/serve.js
// PORT (8789 by default) and HOST (127.0.0.1; 0.0.0.0 to answer other machines) say where it listens, REQUESTS_DIR
// (./kept by default) where it keeps requests.jsonl, and REQUESTS_PROXIED=1 takes the address from the proxy in front.
// The site's own address sends /keys to it, through the reverse proxy that serves the site. Each request is mailed
// over SMTP from `from` (`user` by default) to `to`, after STARTTLS on port 587 by default, or over TLS from the start
// on 465, which some hosts block. With Google Workspace: smtp-relay.gmail.com, which knows the server by its address
// (Gmail's SMTP relay service, TLS required), and no `user`; or smtp.gmail.com, signed in with AUTH PLAIN as `user`
// with an app password. Without `mail`, each one is printed instead.
import { appendFile, mkdir } from 'node:fs/promises'
import { createServer } from 'node:http'
import { connect as plain } from 'node:net'
import { hostname } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { connect as tls } from 'node:tls'
import { pathToFileURL } from 'node:url'
import { listener } from '../host/serve.js'
import { requests } from './requests.js'

/**
 * @typedef {{ host: string, port?: number, user?: string, password?: string, from?: string, to: string }} Server
 * @typedef {{ subject: string, text: string, replyTo: string }} Mail
 */

/** A header's words in UTF-8, as encoded words short enough for a line each (RFC 2047). @param {string} text */
const encoded = (text) => (text.match(/.{1,11}/gsu) ?? ['']).map((part) => `=?UTF-8?B?${Buffer.from(part).toString('base64')}?=`).join('\r\n ')

/** A mail as SMTP carries it: its headers, then its text in base64. @param {Server} server @param {Mail} mail @param {Date} [date] */
export function message(server, mail, date = new Date()) {
  const from = sender(server)
  return [`From: ${from}`, `To: ${server.to}`, `Reply-To: ${mail.replyTo}`, `Subject: ${encoded(mail.subject)}`, `Date: ${date.toUTCString()}`,
    `Message-ID: <${crypto.randomUUID()}@${from.split('@')[1]}>`, 'MIME-Version: 1.0', 'Content-Type: text/plain; charset=utf-8', 'Content-Transfer-Encoding: base64', '',
    ...(Buffer.from(mail.text.replace(/\r?\n/g, '\r\n')).toString('base64').match(/.{1,76}/g) ?? [])].join('\r\n')
}

/**
 * How a mail server is reached: a connection, and TLS over it.
 * @typedef {import('node:net').Socket} Socket
 * @typedef {{ connect: (to: { host: string, port: number }) => Socket, secure: (socket: Socket, host: string) => Socket }} Ways
 * @type {Ways}
 */
const WAYS = { connect: (to) => plain(to), secure: (socket, host) => tls({ socket, servername: host }) }

/** Who the mail is from. @param {Server} server */
const sender = (server) => server.from ?? server.user ?? ''

/**
 * A mail sent over SMTP with TLS, after STARTTLS (RFC 3207) or from the start on port 465 (RFC 8314), signed in with
 * AUTH PLAIN when the server has a user, nothing said before TLS but EHLO and STARTTLS, and the sender's domain named
 * in EHLO, as a relay that knows the server by its address asks; throws, saying what the server answered, when it isn't.
 * @param {Server} server @param {Mail} mail @param {Ways} [ways]
 */
export async function smtp(server, mail, ways = WAYS) {
  const port = server.port ?? 587
  const hello = `EHLO ${sender(server).split('@')[1] || hostname()}`
  let socket = ways.connect({ host: server.host, port })
  if (port === 465) socket = ways.secure(socket, server.host)
  /** @type {Error | undefined} */
  let failed
  /** @type {import('node:readline').Interface} */
  let reader
  /** @type {AsyncIterator<string>} */
  let lines
  // What the server says, read again from the TLS connection once there is one.
  const listen = () => {
    socket.on('error', (error) => { failed = error })
    socket.setTimeout(30_000, () => socket.destroy(new Error(`${server.host} stopped answering`)))
    reader = createInterface({ input: socket, crlfDelay: Infinity })
    lines = reader[Symbol.asyncIterator]()
  }
  /** The server's answer, its last line when it has several, if it begins with `code`. @param {number} code */
  const answered = async (code) => {
    let line = ''
    do line = (await lines.next()).value ?? ''
    while (/^\d{3}-/.test(line))
    if (!line.startsWith(`${code}`)) throw failed ?? new Error(`${server.host} answered “${line}”`)
  }
  const say = (/** @type {string} */ command, /** @type {number} */ code) => (socket.write(`${command}\r\n`), answered(code))
  listen()
  try {
    await answered(220)
    await say(hello, 250)
    if (port !== 465) {
      await say('STARTTLS', 220)
      reader.close()
      socket.setTimeout(0)
      socket = ways.secure(socket, server.host)
      listen()
      await say(hello, 250)
    }
    if (server.user) await say(`AUTH PLAIN ${Buffer.from(`\0${server.user}\0${server.password ?? ''}`).toString('base64')}`, 235)
    await say(`MAIL FROM:<${sender(server)}>`, 250)
    await say(`RCPT TO:<${server.to}>`, 250)
    await say('DATA', 354)
    await say(`${message(server, mail)}\r\n.`, 250)
    socket.end('QUIT\r\n')
  } catch (error) {
    socket.destroy()
    throw error
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const PORT = Number(process.env.PORT) || 8789
  const HOST = process.env.HOST ?? '127.0.0.1'
  const dir = process.env.REQUESTS_DIR ?? 'kept'
  /** @type {{ mail?: Server }} */
  const config = JSON.parse(process.env.REQUESTS_CONFIG ?? '{}')
  await mkdir(dir, { recursive: true })
  const handle = requests({
    keep: (line) => appendFile(join(dir, 'requests.jsonl'), `${line}\n`),
    mail: async (mail) => { if (config.mail) await smtp(config.mail, mail); else console.log(`${mail.subject}\n\n${mail.text}\n`) },
  })
  createServer(listener(/** @type {any} */ (handle), process.env.REQUESTS_PROXIED === '1')).listen(PORT, HOST, () => console.log(`Request service on http://${HOST}:${PORT}/, keeping requests in ${dir}${config.mail ? `, mailing ${config.mail.to}` : ''}`))
}
