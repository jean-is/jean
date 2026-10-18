// The pages' policies checked in browsers Playwright doesn't drive (test/csp.spec.js does the others):
// Safari itself, through the safaridriver it ships with once Safari › Settings › Developer › Allow
// remote automation is on, and Firefox itself, through geckodriver when it is installed. Jean is
// served with each page's policy again as a report-only header (scripts/serve.js --csp-reports), a
// fake brain answers, and the same steps as the spec are taken over WebDriver: what a policy
// refused is what the browser reported.
// Usage: npm run csp                     every engine: Playwright's (test/browsers.config.js), then these
//        node scripts/csp.js safari      one of these
import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { line, expected } from '../test/fixtures/csp.js'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const APP = 4187
const BRAIN = 4188
const DRIVER = 4189
const BASE = `http://127.0.0.1:${APP}/`
/** The WebDriver servers, and what each needs. */
const DRIVERS = {
  safari: { command: 'safaridriver', args: ['-p', String(DRIVER)], capabilities: { browserName: 'safari' } },
  firefox: { command: 'geckodriver', args: ['--port', String(DRIVER)], capabilities: { browserName: 'firefox', 'moz:firefoxOptions': { args: ['-headless'] } } },
}
const ELEMENT = 'element-6066-11e4-a52e-4f735466cecf'

/** @param {string} command @param {string[]} args @param {Record<string, string>} [env] */
const run = (command, args, env = {}) => spawn(command, args, { cwd: ROOT, env: { ...process.env, ...env }, stdio: 'ignore' })
const sleep = (/** @type {number} */ ms) => new Promise((resolve) => setTimeout(resolve, ms))
const has = (/** @type {string} */ command) => spawnSync(command, ['--version']).status === 0

/** Waits until a server answers. @param {string} url */
async function up(url) {
  for (let i = 0; i < 100; i++) {
    if (await fetch(url).then(() => true, () => false)) return
    await sleep(100)
  }
  throw new Error(`${url} never answered`)
}

/** A WebDriver session, as few of its commands as these steps need. @param {object} capabilities */
async function session(capabilities) {
  const driver = `http://127.0.0.1:${DRIVER}`
  const call = async (/** @type {string} */ method, /** @type {string} */ path, /** @type {unknown} */ body) => {
    const response = await fetch(`${driver}${path}`, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
    const { value } = await response.json()
    if (value?.error) throw new Error(`${value.error}: ${value.message}`)
    return value
  }
  const { sessionId } = await call('POST', '/session', { capabilities: { alwaysMatch: capabilities } })
  const at = (/** @type {string} */ path) => `/session/${sessionId}${path}`
  const self = {
    go: (/** @type {string} */ url) => call('POST', at('/url'), { url }),
    cookie: (/** @type {string} */ name, /** @type {string} */ value) => call('POST', at('/cookie'), { cookie: { name, value, path: '/' } }),
    script: (/** @type {string} */ script, /** @type {unknown[]} */ args = []) => call('POST', at('/execute/async'), { script, args }),
    /** The first element a selector finds, once there is one. @param {string} css */
    find: async (css, timeout = 30_000) => {
      for (const end = Date.now() + timeout; Date.now() < end; await sleep(200)) {
        const found = await call('POST', at('/elements'), { using: 'css selector', value: css })
        if (found.length) return found[0][ELEMENT]
      }
      throw new Error(`${css} never showed`)
    },
    /** Until a selector finds nothing. @param {string} css */
    gone: async (css, timeout = 30_000) => {
      for (const end = Date.now() + timeout; Date.now() < end; await sleep(200)) if (!(await call('POST', at('/elements'), { using: 'css selector', value: css })).length) return
      throw new Error(`${css} never went`)
    },
    /** Clicks, once what is found can be clicked: a card fades in first. @param {string} css */
    click: async (css, timeout = 10_000) => {
      for (const end = Date.now() + timeout; ; await sleep(250)) {
        try { return await call('POST', at(`/element/${await self.find(css)}/click`), {}) } catch (error) {
          if (Date.now() > end || !/not interactable|stale/.test(String(error))) throw new Error(`${css}: ${error instanceof Error ? error.message : error}`)
        }
      }
    },
    type: async (/** @type {string} */ css, /** @type {string} */ text) => call('POST', at(`/element/${await self.find(css)}/value`), { text }).catch((error) => { throw new Error(`${css}: ${error.message}`) }),
    frame: async (/** @type {string | null} */ css) => call('POST', at('/frame'), { id: css === null ? null : { [ELEMENT]: await self.find(css) } }),
    end: () => call('DELETE', at('')),
  }
  return self
}

/** Jean, its fake brain, an answer, a page in it, the sandbox and its page, Python, and the check page, as csp.spec.js takes them. */
async function steps(/** @type {Awaited<ReturnType<typeof session>>} */ browser, /** @type {string} */ from) {
  await browser.go(BASE)
  // A Jean as on a first visit: a real browser keeps what an earlier check left at this address.
  await browser.script(`const done = arguments[0]; localStorage.clear()
    navigator.storage.getDirectory().then(async (root) => { for await (const name of root.keys()) await root.removeEntry(name, { recursive: true }) })
      .then(() => caches.keys()).then((keys) => Promise.all(keys.map((key) => caches.delete(key)))).then(() => done(), () => done())`)
  await browser.cookie('csp', from)
  await browser.go(BASE)
  await browser.find('.hero-question')
  // A refusal on purpose first, a picture from plain HTTP (img-src): its report says this browser reports at all.
  await browser.script(`new Image().src = 'http://127.0.0.1:9/canary.png'; arguments[0]()`)
  // The fake brain, in Settings' Brains, "On your computer" → Other.
  await browser.click('.brain-chip')
  await browser.click('app-settings dialog[open] .way.is-local summary')
  await browser.click('app-settings dialog[open] .way.is-local select option[value="custom"]')
  await browser.type('app-settings dialog[open] .way.is-local input[name="baseURL"]', `http://127.0.0.1:${BRAIN}/v1`)
  await browser.click('app-settings dialog[open] .way.is-local .button.primary')
  await browser.gone('app-settings dialog[open]')
  const ask = async (/** @type {string} */ text) => {
    await browser.type('#prompt', `${text}`)
    await browser.find('.msg-jean.is-streaming', 5_000).catch(() => {})
    await browser.gone('.msg-jean.is-streaming', 60_000)
  }
  await ask('Compare the phone plans')
  await browser.find('.msg-jean .prose .table.is-compare')
  await ask('Make me a sales explorer')
  await browser.frame('.msg-jean app-page iframe')
  await browser.find('#chart canvas')
  await browser.frame(null)
  // A new task, whose savings plan the sandbox works out and draws beside the conversation.
  await browser.go(BASE)
  await browser.find('.hero-question')
  // The answer waits on the computer, offered in it, until it is turned on.
  await browser.type('#prompt', 'Calculate my savings over 10 years: 200 a month at 4% a year. Show it as a chart.\uE007')
  await browser.click('.msg-jean .approval .button.primary')
  await browser.frame('app-preview iframe')
  await browser.find('#total', 60_000)
  await browser.frame(null)
  const python = await browser.script(`const done = arguments[0]
    import('/ui/caps.js').then(({ loaded }) => loaded.value.get('computer')?.tools?.find((tool) => tool.spec.name === 'python')
      ?.run({ code: 'import statistics\\nstatistics.mean([1, 2, 3, 4])' }, { declared: ['python'], declare() {}, call: async () => '' }))
      .then(done, (error) => done(String(error)))`)
  if (!String(python).includes('2.5')) throw new Error(`Python said ${python}`)
  await browser.go(`${BASE}check.html`)
  await sleep(2000)
  await browser.go(`${BASE}policy.html`)
  await sleep(2000)
}

/** @param {keyof typeof DRIVERS} name */
async function check(name) {
  const { command, args, capabilities } = DRIVERS[name]
  if (!has(command)) return console.log(`${name}: skipped, ${command} isn't installed`)
  const driver = run(command, args)
  try {
    await up(`http://127.0.0.1:${DRIVER}/status`)
    const browser = await session(capabilities).catch((error) => { throw new Error(error.message.includes('remote automation') ? 'turn on Safari › Settings › Developer › Allow remote automation' : error.message) })
    const from = `${name}-${Date.now()}`
    try { await steps(browser, from) } finally { await browser.end().catch(() => {}) }
    const lines = (await (await fetch(`${BASE}csp-reports?from=${from}`)).json()).map(line)
    if (!lines.some((/** @type {string} */ line) => line.includes('canary'))) throw new Error('it sent no report, even of the refusal made on purpose')
    const reports = lines.filter((/** @type {string} */ line) => !line.includes('canary') && !expected(line))
    for (const report of reports) console.log(`${name}: ${report}`)
    console.log(`${name}: ${reports.length ? `${reports.length} refused` : 'nothing refused'}`)
    return reports.length
  } finally {
    driver.kill()
  }
}

async function main(argv) {
  const names = /** @type {(keyof typeof DRIVERS)[]} */ (argv.length ? argv : Object.keys(DRIVERS))
  // Every engine Playwright drives first, unless one browser is named.
  const playwright = argv.length ? 0 : spawnSync('npx', ['playwright', 'test', '-c', 'test/browsers.config.js'], { cwd: ROOT, stdio: 'inherit' }).status
  const servers = [run(process.execPath, ['scripts/serve.js', '--csp-reports'], { PORT: String(APP) }), run(process.execPath, ['test/fixtures/fake-brain.js'], { PORT: String(BRAIN), PACE: '5' })]
  try {
    await Promise.all([up(BASE), up(`http://127.0.0.1:${BRAIN}/v1/models`)])
    let refused = 0
    for (const name of names) refused += (await check(name).catch((error) => { console.error(`${name}: ${error.message}`); return 1 })) ?? 0
    process.exitCode = refused || playwright ? 1 : 0
  } finally {
    for (const server of servers) server.kill()
  }
}

main(process.argv.slice(2))
