// SPDX-License-Identifier: MIT
// What Jean writes for a company's own server (D762): the first-boot block, checked as shell and against who signs
// releases, and changes signed so that the server's own keeper takes them.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { SIGNERS, cloudInit, fingerprint, isName, isReleases, ownerOf, signed } from '../app/caps/server/line.js'
import { fingerprint as keepers, keeper } from '../keeper/keeper.js'
import { checkPolicy } from '../app/caps/policy/checks.js'
import { DIRECTORY as SERVICES } from '../app/caps/connections/directory.js'
import { DIRECTORY as SKILLS } from '../app/caps/skills/directory.js'

const SHEETS = 'app/caps/skills/directory/company-server'

const pair = /** @type {CryptoKeyPair} */ (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']))
const owner = await ownerOf(pair.publicKey)

test('the block pins this Jean’s key and the release’s signer, and runs install.sh only once its signature checks', async () => {
  assert.equal(`${SIGNERS}\n`, await readFile('docs/trust/allowed_signers', 'utf8'))
  const block = cloudInit({ address: 'jean.acme.example', owner, releases: 'https://github.com/jean-is/jean/releases/' })
  assert.match(block, /^#cloud-config\nwrite_files:\n {2}- path: \/root\/allowed_signers\n {4}content: \|\n {6}jean\.is /)
  const script = block.slice(block.indexOf('  - |\n') + 6).split('\n').map((line) => line.replace(/^ {4}/, '')).join('\n')
  execFileSync('sh', ['-n'], { input: script })
  const steps = script.trim().split('\n')
  assert.equal(steps[0], 'set -e')
  assert.match(steps[2], /SHA256SUMS SHA256SUMS\.sig install\.sh; do curl -fsSLO --proto '=https' --proto-redir '=https' "https:\/\/github\.com\/jean-is\/jean\/releases\/latest\/download\/\$file"/)
  assert.equal(steps[3], 'ssh-keygen -Y verify -f allowed_signers -I jean.is -n file -s SHA256SUMS.sig < SHA256SUMS')
  assert.equal(steps[4], 'sha256sum -c --ignore-missing SHA256SUMS')
  assert.equal(steps[5], `sh install.sh --address jean.acme.example --owner ${owner} --updates "https://github.com/jean-is/jean/releases/latest/download/server.env"`)
  assert.match(cloudInit({ address: 'jean.acme.example', gateway: 'gw.acme.example', owner, releases: 'https://r.example' }), /--address jean\.acme\.example --gateway-address gw\.acme\.example --owner/)
})

test('what the block names is what install.sh and the release take', async () => {
  const install = await readFile('deploy/company/install.sh', 'utf8')
  for (const option of ['--address)', '--gateway-address)', '--owner)', '--updates)']) assert.ok(install.includes(`    ${option}`), option)
  const release = await readFile('scripts/release.js', 'utf8')
  for (const file of ["'install.sh'", "'server.env'", "'SHA256SUMS'"]) assert.ok(release.includes(file), file)
})

test('a change Jean signs is one the server’s keeper takes, and names the key as the keeper does', async () => {
  /** @type {object | undefined} */
  let policy
  const handle = keeper({ owner, origins: ['https://jean.acme.example'] }, {
    read: async () => null, write: async () => {}, policy: async (one) => { policy = one }, gateway: async () => {},
  })
  const answer = await handle(new Request('https://jean.acme.example/keeper', { method: 'POST', body: await signed(pair.privateKey, { format: 1, seq: 1, policy: { name: 'Acme' } }) }))
  assert.equal(answer.status, 200)
  assert.deepEqual(policy, { name: 'Acme' })
  assert.equal(await fingerprint(owner), await keepers(owner))
})

test('the Small office pack is a policy Jean reads, in each of its variants, naming only services and skills Jean has', async () => {
  const sheet = await readFile(`${SHEETS}/small-office.md`, 'utf8')
  const pack = JSON.parse(String(/```json\n([\s\S]*?)\n```/.exec(sheet)?.[1]).replace(/<[^>]*>/g, 'filled in'))
  const variant = (/** @type {object[]} */ directory) => ({ ...pack, directory })
  for (const policy of [pack, variant([{ id: 'google', connected: true }]), variant([...pack.directory, { id: 'slack', connected: true }])]) {
    assert.deepEqual(checkPolicy(policy).problems, [], JSON.stringify(policy.directory))
    for (const { id } of policy.directory) assert.ok(SERVICES.some((service) => service.id === id), `${id} is a service Jean knows`)
  }
  for (const id of [...sheet.matchAll(/\{ "id": "([\w-]+)", "connected": true \}/g)].map(([, id]) => id)) assert.ok(SERVICES.some((service) => service.id === id), id)
  for (const { skill } of pack.starters.list) if (skill) assert.ok(SKILLS.some((one) => one.name === skill), `${skill} is a ready-made skill`)
  const entry = SKILLS.find((one) => one.name === 'company-server')
  assert.deepEqual(entry?.beside, ['recipes.md', 'small-office.md'])
})

test('each recipe sends the app Jean’s directory expects of its service, through the gateway', async () => {
  const recipes = await readFile(`${SHEETS}/recipes.md`, 'utf8')
  const sections = Object.fromEntries(recipes.split(/^## /m).slice(1).map((part) => [part.slice(0, part.indexOf('\n')), part]))
  const apps = { 'Google Workspace': 'google', Docusign: 'docusign', Slack: 'slack' }
  for (const [title, id] of Object.entries(apps)) {
    const issuer = /"issuer": "([^"]+)", "tokenEndpoint": "(https:\/\/[^"]+)"/.exec(sections[title] ?? '')
    assert.ok(issuer, `${title} sends an issuer and a token endpoint`)
    assert.equal(issuer?.[1], SERVICES.find((service) => service.id === id)?.app, `${title}'s issuer is the one its entry signs in with`)
    assert.match(sections[title], new RegExp(`\\{ "id": "${id}", "connected": true \\}`))
  }
  // Microsoft 365 signs in from the browser, as its entry says: a client id in policy, no secret, no gateway.
  assert.equal(SERVICES.find((service) => service.id === 'microsoft-365')?.app, 'https://login.microsoftonline.com/common/v2.0')
  assert.match(sections['Microsoft 365'], /\{ "id": "microsoft-365", "clientId": "<the client id>", "connected": true \}/)
  assert.doesNotMatch(sections['Microsoft 365'], /"issuer"/)
})

test('only names and https addresses go into the shell line', () => {
  assert.equal(isName('jean.acme.example'), true)
  for (const name of ['jean', 'Jean.Acme.example', 'jean.acme.example; rm -rf /', '-jean.acme.example', 'jean..acme']) assert.equal(isName(name), false, name)
  assert.equal(isReleases('https://github.com/jean-is/jean/releases'), true)
  for (const url of ['http://releases.example', 'https://releases.example/"; rm -rf /', 'https://releases.example/$(id)', '']) assert.equal(isReleases(url), false, url)
})
