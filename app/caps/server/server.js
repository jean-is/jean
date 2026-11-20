// SPDX-License-Identifier: MIT
// A company's own server (D762): Jean writes the block its owner pastes at a host, keeps the owner's key on this device,
// where it never leaves, and signs and sends the company's policy and its gateway's apps to the server's keeper.
// An app's secret never passes through the brain: the person types it in a masked field, it is kept sealed under
// `company:<address>:<issuer>`, and only the server receives it. Brought by the ready-made skill company-server.
import { register } from '../../ui/caps.js'
import { app } from '../../ui/state.js'
import { askUser } from '../../ui/send.js'
import { deviceKey, getSecret, setSecret } from '../../ui/secrets.js'
import { serviceURL } from '../../core/settings.js'
import { cloudInit, fingerprint, gatewayOf, isName, isReleases, ownerOf, signed } from './line.js'

/** The owner's key, made once on this device, non-extractable. */
const key = async () => {
  const pair = /** @type {CryptoKeyPair | null} */ (await deviceKey('company-server', () => crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify'])))
  if (!pair) throw new Error('This browser can’t keep a key on this device, so it can’t own a server.')
  return pair
}

/** @param {unknown} name */
const named = (name) => {
  const address = String(name ?? '').trim().toLowerCase()
  if (!isName(address)) throw new Error('Give the address of the company’s Jean, a name such as jean.acme.example.')
  return address
}

/** @type {import('../../core/loop.js').Tool} */
const line = {
  spec: {
    name: 'company_line',
    description: 'Write what the person pastes as the first-boot user data (cloud-init) of a server their company rents in its own name, Ubuntu 22.04 or later, so it serves Jean at its address (e.g. jean.acme.example) and its gateway at gateway.<address> unless `gateway` is given. Then they point both names at the server.',
    parameters: { type: 'object', properties: { address: { type: 'string' }, gateway: { type: 'string' } }, required: ['address'] },
  },
  kind: 'edit',
  title: (args) => `A server for ${args?.address ?? ''}`,
  run: async (args) => {
    const address = named(args?.address)
    const gateway = args?.gateway ? named(args.gateway) : undefined
    const releases = serviceURL('releases', app.settings.peek(), app.policy)
    if (!isReleases(releases)) throw new Error('No address for Jean’s releases: policy or settings name one as urls.releases.')
    const owner = await ownerOf((await key()).publicKey)
    return `Paste this as the server's user data, then point ${address} and ${gateway ?? gatewayOf(address)} at the server's address. Only this Jean, on this device, can change the server.\n\n\`\`\`yaml\n${cloudInit({ address, gateway, owner, releases })}\`\`\``
  },
}

/** @typedef {{ issuer: string, tokenEndpoint: string, clientId: string, auth?: 'post' | 'basic', ask?: string }} App */

/** @type {import('../../core/loop.js').Tool} */
const server = {
  spec: {
    name: 'company_server',
    description: 'Check the company’s own server at an address, or sign and send it a change: `policy`, the whole policy.json, and `apps`, the apps its gateway holds. An app’s secret is never an argument: give `ask`, the question to show the person, in their language, and they type it where only the server receives it; without `ask`, the one they typed before is sent again.',
    parameters: {
      type: 'object',
      properties: {
        address: { type: 'string' }, gateway: { type: 'string' }, policy: { type: 'object' },
        apps: { type: 'array', items: { type: 'object', properties: { issuer: { type: 'string' }, tokenEndpoint: { type: 'string' }, clientId: { type: 'string' }, auth: { type: 'string', enum: ['post', 'basic'] }, ask: { type: 'string' } }, required: ['issuer', 'tokenEndpoint', 'clientId'] } },
      },
      required: ['address'],
    },
  },
  kind: 'other',
  title: (args) => `${args?.policy || args?.apps ? 'Change' : 'Check'} the server at ${args?.address ?? ''}`,
  // Secrets about to leave for a server: asked each time, whatever was allowed before.
  check: async (args) => ({ ask: Boolean(args?.apps) }),
  run: async (args, ctx) => {
    const address = named(args?.address)
    const pair = await key()
    const keeper = `https://${address}/keeper`
    /** @type {{ owner?: string, seq?: number }} */
    const now = await fetch(keeper, { signal: ctx?.signal }).then((answer) => answer.json()).catch(() => ({}))
    if (now.owner === undefined || !Number.isSafeInteger(now.seq)) return `The server at ${address} doesn't answer yet: its names may not point at it, or it may still be starting.`
    if (now.owner !== await fingerprint(await ownerOf(pair.publicKey))) return `The server at ${address} obeys another key: only the Jean that wrote its line, on that device, can change it.`
    if (!args?.policy && !args?.apps) return `The server at ${address} answers and obeys this Jean's key, ${now.seq} changes applied.`
    /** @type {Record<string, unknown>} */
    const change = { format: 1, seq: Number(now.seq) + 1 }
    const gateway = `https://${args.gateway ? named(args.gateway) : gatewayOf(address)}`
    if (args.policy) change.policy = { ...args.policy, urls: { gateway, ...args.policy.urls } }
    if (args.apps) {
      const clients = []
      for (const { issuer, tokenEndpoint, clientId, auth, ask } of /** @type {App[]} */ (args.apps)) {
        const id = `company:${address}:${issuer}`
        let secret = ask ? '' : await getSecret(app.fs, id)
        if (ask) {
          const [answer] = (await askUser([{ question: String(ask), options: [], multiple: false, secret: true }], undefined, ctx?.signal)) ?? []
          secret = answer && !answer.skipped ? answer.own.trim() : ''
          if (secret) await setSecret(app.fs, id, secret)
        }
        if (!secret) throw new Error(`No secret was typed for ${issuer}: give \`ask\` so the person types it.`)
        clients.push({ issuer, tokenEndpoint, clientId, clientSecret: secret, ...(auth && { auth }) })
      }
      change.gateway = { clients }
    }
    const answer = await fetch(keeper, { method: 'POST', body: await signed(pair.privateKey, change), signal: ctx?.signal })
    const result = await answer.json().catch(() => ({}))
    if (!answer.ok) throw new Error(`The server refused the change: ${result.error ?? answer.status}`)
    return `The server at ${address} applied change ${change.seq}. People see the new policy the next time they open ${address}.`
  },
}

register({
  id: 'server',
  tools: [line, server],
  lines: [{ name: 'company_line', line: 'write the first-boot block of a company’s own server' }, { name: 'company_server', line: 'check that server, or send it its policy and apps' }],
})
