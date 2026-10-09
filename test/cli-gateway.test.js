import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { gatewayConfig, wanted } from '../cli/main.js'
import { gateway } from '../gateway/gateway.js'

test('the gateway takes the origins on the line with GATEWAY_CONFIG, whose secrets stay in the environment', () => {
  const env = { GATEWAY_CONFIG: JSON.stringify({ origins: ['https://jean.example'], hosts: ['slack.com'], clients: [{ issuer: 'https://a', clientSecret: 's' }] }) }
  assert.deepEqual(gatewayConfig(env, ['http://localhost:4173', 'https://jean.example']), {
    origins: ['https://jean.example', 'http://localhost:4173'], hosts: ['slack.com'], clients: [{ issuer: 'https://a', clientSecret: 's' }],
  })
  assert.deepEqual(gatewayConfig({}, ['https://jean.cx']), { origins: ['https://jean.cx'] })
  assert.deepEqual(gatewayConfig({ GATEWAY_CONFIG: '' }), { origins: [] })
})

test('a page of Jean asking to reach a gateway on this computer is let through, and only Jean', async () => {
  const handle = gateway({ origins: ['https://jean.cx'] })
  const ask = (/** @type {string} */ origin) => handle(new Request('http://127.0.0.1:8787/?url=https%3A%2F%2Fslack.com%2Fapi', {
    method: 'OPTIONS', headers: { origin, 'access-control-request-method': 'POST', 'access-control-request-private-network': 'true' },
  }))
  const jean = await ask('https://jean.cx')
  assert.equal(jean.status, 204)
  assert.equal(jean.headers.get('access-control-allow-private-network'), 'true')
  const other = await ask('https://elsewhere.example')
  assert.equal(other.headers.get('access-control-allow-private-network'), null)
  // What it serves, asked from Jean's page, says so too.
  const served = await handle(new Request('http://127.0.0.1:8787/', { method: 'OPTIONS', headers: { origin: 'https://jean.cx', 'access-control-request-private-network': 'true' } }))
  assert.equal(served.headers.get('access-control-allow-private-network'), 'true')
})

test('the terminal’s language is LC_ALL, LC_MESSAGES or LANG, then the system’s', () => {
  const system = Intl.DateTimeFormat().resolvedOptions().locale
  assert.deepEqual(wanted({ LANG: 'fr_FR.UTF-8' }), ['fr-FR', system])
  assert.deepEqual(wanted({ LC_ALL: 'ja_JP.UTF-8', LANG: 'de_DE.UTF-8' }), ['ja-JP', system])
  assert.deepEqual(wanted({ LANG: 'C.UTF-8' }), [system])
  assert.deepEqual(wanted({}), [system])
})

test('npx jean-cli gateway answers on the port it is given, then says where to name it', async (t) => {
  const port = await new Promise((resolve) => {
    const probe = createServer().listen(0, '127.0.0.1', () => {
      const { port } = /** @type {import('node:net').AddressInfo} */ (probe.address())
      probe.close(() => resolve(port))
    })
  })
  const child = spawn(process.execPath, ['cli/main.js', 'gateway', '--origin', 'http://localhost:4173', '--port', String(port)], { env: { ...process.env, LANG: 'en_US.UTF-8', GATEWAY_CONFIG: '' } })
  t.after(() => child.kill())
  const said = await new Promise((resolve, reject) => {
    child.stdout.once('data', (chunk) => resolve(String(chunk)))
    child.once('exit', (code) => reject(new Error(`exit ${code}`)))
  })
  assert.match(said, new RegExp(`The gateway answers at http://127\\.0\\.0\\.1:${port}/\\. Name it in Settings › Connections\\.`))
  const served = await (await fetch(`http://127.0.0.1:${port}/`, { headers: { origin: 'http://localhost:4173' } })).json()
  assert.equal(served.format, 1)
  assert.ok(served.hosts.includes('slack.com'))
})
