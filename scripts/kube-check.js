// SPDX-License-Identifier: MIT
// Jean's chart (deploy/helm/jean) as an organisation's hardened cluster runs it: CI's containers job installs it in kind,
// in a namespace held to Pod Security's "restricted" level, every pod as a random user in group 0 as OpenShift runs it
// (deploy/helm/ci-values.yaml), then runs this. It asks each pod who it runs as, whether its root can be written and, but
// for Jean's, whether it holds a shell; each service what it answers, the share host a share's page with the viewer its
// image ships; has the relay keep a message on its volume, and stops the relay's pod: the message is still there in the
// next one, and stopping took the time SIGTERM takes, not the orchestrator's patience.
//   node scripts/kube-check.js [release] [namespace]      both "jean" by default; kubectl must reach the cluster
import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { idOf } from '../host/host.js'

/** Seconds a pod of the relay may take to go: preStop's five, then what SIGTERM takes, far under the 30 it would wait. */
const STOPPED_WITHIN = 20

/** @param {string} release @param {string} namespace */
export function cluster(release, namespace) {
  /** @param {string[]} args */
  const kubectl = (...args) => execFileSync('kubectl', ['-n', namespace, ...args], { encoding: 'utf8' }).trim()
  /** @param {string} component */
  const selector = (component) => `app.kubernetes.io/instance=${release},app.kubernetes.io/component=${component}`
  /** The running pod of a component. @param {string} component */
  const pod = (component) => kubectl('get', 'pod', '-l', selector(component), '--field-selector=status.phase=Running', '-o', 'jsonpath={.items[0].metadata.name}')
  /**
   * What a script prints in a component's pod: its shell's in Jean's, Node's in the others', which hold nothing else.
   * @param {string} component @param {{ sh: string, node: string }} script
   */
  const inside = (component, script) => kubectl('exec', pod(component), '--', ...(component === 'jean' ? ['sh', '-c', script.sh] : ['node', '-e', script.node]))

  /**
   * A component's service on a port of this computer while `run` runs. @template T
   * @param {string} component @param {(address: string) => Promise<T>} run @returns {Promise<T>}
   */
  async function forwarded(component, run) {
    const service = kubectl('get', 'svc', '-l', selector(component), '-o', 'jsonpath={.items[0].metadata.name}')
    const port = kubectl('get', 'svc', service, '-o', 'jsonpath={.spec.ports[0].port}')
    const forward = spawn('kubectl', ['-n', namespace, 'port-forward', `svc/${service}`, `:${port}`], { stdio: ['ignore', 'pipe', 'inherit'] })
    try {
      const local = await new Promise((resolve, reject) => {
        forward.stdout.on('data', (chunk) => { const found = /127\.0\.0\.1:(\d+)/.exec(String(chunk)); if (found) resolve(Number(found[1])) })
        forward.once('exit', (code) => reject(new Error(`kubectl port-forward to ${service} ended (${code})`)))
      })
      return await run(`http://127.0.0.1:${local}`)
    } finally {
      forward.kill()
    }
  }
  return { kubectl, selector, pod, inside, forwarded }
}

/** @param {string} [release] @param {string} [namespace] */
export async function check(release = 'jean', namespace = 'jean') {
  const { kubectl, selector, pod, inside, forwarded } = cluster(release, namespace)

  for (const component of ['jean', 'gateway', 'relay', 'share']) {
    // A user OpenShift could have picked, in group 0, as ci-values.yaml asks, on a root nothing writes to.
    const [user, group] = inside(component, { sh: 'id -u; id -g', node: 'console.log(process.getuid()); console.log(process.getgid())' }).split('\n').map(Number)
    assert.ok(user >= 100_000, `${component} runs as ${user}, not a random user`)
    assert.equal(group, 0, `${component} runs in group ${group}, not 0`)
    const write = { sh: 'touch /written 2>/dev/null && echo written || echo refused', node: "try { require('node:fs').writeFileSync('/written', ''); console.log('written') } catch { console.log('refused') }" }
    assert.equal(inside(component, write), 'refused', `${component}'s root is written to`)
    // Nothing to run but Node in the gateway, the relay and the share host.
    if (component !== 'jean') assert.throws(() => execFileSync('kubectl', ['-n', namespace, 'exec', pod(component), '--', 'sh', '-c', 'true'], { stdio: 'pipe' }), `${component} holds a shell`)
    console.log(`${component}: user ${user} in group 0, its root read-only`)
  }

  await forwarded('jean', async (address) => {
    const page = await fetch(`${address}/`)
    assert.equal(page.status, 200)
    assert.match(await page.text(), /<meta name="app-policy" content="policy\.json">/)
    assert.equal(typeof (await (await fetch(`${address}/policy.json`)).json()), 'object')
    console.log('jean: answers its page and its policy')
  })

  await forwarded('gateway', async (address) => {
    assert.equal((await (await fetch(`${address}/`)).json()).format, 1)
    console.log('gateway: answers')
  })

  await forwarded('share', async (address) => {
    assert.equal((await (await fetch(`${address}/`)).json()).format, 1)
    // Any share's address answers with the viewer, the same page for every one, which only a viewer.json beside serve.js gives.
    const page = await fetch(`${address}/${'A'.repeat(22)}`)
    assert.equal(page.status, 200, `a share's page: ${await page.clone().text()}`)
    assert.match(await page.text(), /<script type="importmap">/)
    console.log("share: answers, and a share's page with its viewer")
  })

  const [origin] = JSON.parse(inside('relay', { sh: 'printenv RELAY_CONFIG', node: 'console.log(process.env.RELAY_CONFIG)' })).origins
  const token = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url')
  const mailbox = `/v1/m/${await idOf(token)}`
  const owner = { origin, authorization: `Bearer ${token}` }
  /** What the relay holds for the mailbox, read without taking it. @param {string} address */
  const held = async (address) => (await (await fetch(`${address}${mailbox}?after=0`, { headers: owner })).json()).messages
  await forwarded('relay', async (address) => {
    assert.equal((await fetch(`${address}${mailbox}`, { method: 'PUT', headers: owner, body: '{}' })).status, 201, 'the relay opens a mailbox')
    const sent = await fetch(`${address}${mailbox}`, { method: 'POST', headers: { origin }, body: new Uint8Array([1, 2, 3]) })
    assert.equal(sent.status, 201, `the relay keeps a message: ${await sent.text()}`)
    assert.equal((await held(address)).length, 1)
    console.log('relay: keeps a message on its volume')
  })

  const from = Date.now()
  kubectl('delete', 'pod', pod('relay'), '--wait=true', '--timeout=60s')
  const took = (Date.now() - from) / 1000
  assert.ok(took < STOPPED_WITHIN, `the relay's pod took ${took} s to stop`)
  // The next pod, once there is one to wait for and it is ready.
  for (let tries = 60; ; tries--) {
    try { kubectl('wait', 'pod', '-l', selector('relay'), '--for=condition=Ready', '--timeout=60s'); break } catch (error) {
      if (!tries) throw error
      await new Promise((resolve) => setTimeout(resolve, 2_000))
    }
  }
  await forwarded('relay', async (address) => assert.equal((await held(address)).length, 1, 'the message outlives the pod'))
  console.log(`relay: stopped in ${took.toFixed(1)} s, and its next pod still holds the message`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await check(...process.argv.slice(2))
