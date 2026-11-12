// SPDX-License-Identifier: MIT
// Jean's servers in a container: each runs under Node's permission model with the reads and writes its image's CMD
// allows (deploy/docker/Dockerfile), and stops on SIGTERM, which Node as a container's first process ignores otherwise,
// so that a rollout neither waits out the orchestrator's patience nor kills it mid-write.
import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { idOf } from '../host/host.js'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const JEAN = 'https://jean.example'

/** A port nothing listens on. @returns {Promise<number>} */
const freePort = () => new Promise((resolve) => {
  const server = createServer().listen(0, '127.0.0.1', () => {
    const { port } = /** @type {import('node:net').AddressInfo} */ (server.address())
    server.close(() => resolve(port))
  })
})

/** The flags each image's CMD gives node, from the Dockerfile, its folders made this checkout's and `data`'s. */
async function flagsOf(/** @type {string} */ target, /** @type {string} */ data) {
  const docker = await readFile(join(ROOT, 'deploy/docker/Dockerfile'), 'utf8')
  const stage = docker.split(/^FROM /m).find((part) => new RegExp(`\\bAS ${target}\\n`).test(part)) ?? ''
  const cmd = /** @type {string[]} */ (JSON.parse(/^CMD (\[.*\])$/m.exec(stage)?.[1] ?? '[]'))
  assert.equal(cmd[0], 'node', `${target}'s CMD runs node`)
  return { flags: cmd.slice(1, -1).map((flag) => flag.replace('=/app/', `=${ROOT}`).replace('=/data/', `=${data}/`)), entry: cmd.at(-1) ?? '' }
}

/**
 * A server started as its image starts it, once it answers `/`. @param {string} target
 * @param {Record<string, string>} env @param {string} data @param {string} [script] another of the image's servers, with its flags
 */
async function started(target, env, data, script) {
  const { flags, entry: own } = await flagsOf(target, data)
  const entry = script ?? own
  const port = await freePort()
  const child = spawn(process.execPath, [...flags, entry], { cwd: ROOT, env: { ...process.env, ...env, PORT: String(port), HOST: '127.0.0.1' }, stdio: ['ignore', 'pipe', 'pipe'] })
  // Whatever a test finds, the server goes with it.
  after(() => { if (child.exitCode === null) child.kill('SIGKILL') })
  let output = ''
  child.stdout.on('data', (chunk) => { output += chunk })
  child.stderr.on('data', (chunk) => { output += chunk })
  const exited = new Promise((resolve) => child.once('exit', (code, signal) => resolve({ code, signal })))
  for (let tries = 0; ; tries++) {
    const answer = await fetch(`http://127.0.0.1:${port}/`).then((response) => response.json(), () => null)
    if (answer?.format === 1) break
    if (tries > 100 || child.exitCode !== null) assert.fail(`${target} never answered:\n${output}`)
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  return { child, port, exited, output: () => output }
}

/** How long a SIGTERM takes to end it, in milliseconds. @param {Awaited<ReturnType<typeof started>>} server */
async function stopTime({ child, exited }) {
  const from = Date.now()
  child.kill('SIGTERM')
  const end = await exited
  return { ...(/** @type {object} */ (end)), took: Date.now() - from }
}

test('the gateway runs with the network alone, and stops on SIGTERM at once', async () => {
  const data = await mkdtemp(join(tmpdir(), 'jean-stop-'))
  try {
    const server = await started('gateway', { GATEWAY_CONFIG: JSON.stringify({ origins: [JEAN] }) }, data)
    const end = await stopTime(server)
    assert.equal(end.code, 0, server.output())
    assert.ok(end.took < 2_000, `stopped in ${end.took} ms`)
  } finally {
    await rm(data, { recursive: true, force: true })
  }
})

test('the relay writes only its folder, and on SIGTERM ends a read still waiting, then stops', async () => {
  const data = await mkdtemp(join(tmpdir(), 'jean-stop-'))
  try {
    const server = await started('relay', { RELAY_CONFIG: JSON.stringify({ origins: [JEAN] }), RELAY_DIR: data }, data)
    const token = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url')
    const id = await idOf(token)
    const headers = { origin: JEAN, authorization: `Bearer ${token}` }
    const opened = await fetch(`http://127.0.0.1:${server.port}/v1/m/${id}`, { method: 'PUT', headers, body: '{}' })
    assert.equal(opened.status, 201, `${await opened.text()}\n${server.output()}`)
    const sent = await fetch(`http://127.0.0.1:${server.port}/v1/m/${id}`, { method: 'POST', headers: { origin: JEAN }, body: new Uint8Array([1, 2, 3]) })
    // Under a gigabyte free, the relay takes nothing (limits.free); either way it wrote its records, under the permission model.
    assert.ok([201, 507].includes(sent.status), `${sent.status} ${await sent.text()}`)
    // A read with nothing new waits up to 25 seconds; stopping ends it within the grace.
    const waiting = fetch(`http://127.0.0.1:${server.port}/v1/m/${id}?after=999&wait=25`, { headers }).then((response) => response.text(), () => 'cut')
    await new Promise((resolve) => setTimeout(resolve, 200))
    const end = await stopTime(server)
    assert.equal(end.code, 0, server.output())
    assert.ok(end.took < 7_000, `stopped in ${end.took} ms`)
    await waiting
  } finally {
    await rm(data, { recursive: true, force: true })
  }
})

test("the share host, as the chart runs it from the relay's image, writes only its folder, and stops on SIGTERM at once", async () => {
  const data = await mkdtemp(join(tmpdir(), 'jean-stop-'))
  try {
    const server = await started('relay', { HOST_CONFIG: JSON.stringify({ origins: [JEAN] }), HOST_DIR: data }, data, 'host/serve.js')
    const token = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url')
    const kept = await fetch(`http://127.0.0.1:${server.port}/v1/${await idOf(token)}`, { method: 'PUT', headers: { origin: JEAN, authorization: `Bearer ${token}` }, body: new Uint8Array(64) })
    assert.equal(kept.status, 201, `${await kept.text()}\n${server.output()}`)
    const end = await stopTime(server)
    assert.equal(end.code, 0, server.output())
    assert.ok(end.took < 2_000, `stopped in ${end.took} ms`)
  } finally {
    await rm(data, { recursive: true, force: true })
  }
})
