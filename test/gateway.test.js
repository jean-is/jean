// The gateway's witnesses and logs (D276): those it is given, it relays to and says it serves, so
// Jean's certificates can be dated by authorities that don't answer browsers.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { gateway, covers } from '../gateway/gateway.js'

const JEAN = 'http://127.0.0.1:4180'
const AT = 'https://gateway.example/'

test('the gateway relays to the witnesses and logs it is given, and says which they are', async () => {
  const handle = gateway({ origins: [JEAN], hosts: [], timestamps: ['https://tsa.example/tsr'], logs: ['https://log.example'] })
  const served = await (await handle(new Request(AT, { headers: { origin: JEAN } }))).json()
  assert.deepEqual(served, { format: 1, hosts: ['tsa.example', 'log.example'], clients: {}, timestamps: ['https://tsa.example/tsr'], logs: ['https://log.example'] })
  assert.ok(covers(served.hosts, new URL('https://tsa.example/tsr')) && covers(served.hosts, new URL('https://log.example/api/v1/log/entries')))
  const elsewhere = await handle(new Request(`${AT}?url=${encodeURIComponent('https://other.example/tsr')}`, { method: 'POST', headers: { origin: JEAN } }))
  assert.equal(elsewhere.status, 403)
  // Given none, it says nothing of them.
  assert.deepEqual(Object.keys(await (await gateway({ origins: [JEAN], hosts: [] })(new Request(AT, { headers: { origin: JEAN } }))).json()), ['format', 'hosts', 'clients'])
})
