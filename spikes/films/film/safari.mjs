// node safari.mjs <port> <config.json>: the config's films in Safari itself, over safaridriver.
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'

const [port, configFile] = process.argv.slice(2)
const { films, ...common } = JSON.parse(readFileSync(configFile, 'utf8'))
const DRIVER = 47395
const driver = spawn('safaridriver', ['-p', String(DRIVER)], { stdio: 'ignore' })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const call = async (method, path, body) => {
  const response = await fetch(`http://127.0.0.1:${DRIVER}${path}`, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
  const { value } = await response.json()
  if (value?.error) throw new Error(`${value.error}: ${value.message}`)
  return value
}
try {
  for (let i = 0; i < 50 && !(await fetch(`http://127.0.0.1:${DRIVER}/status`).then(() => true, () => false)); i++) await sleep(100)
  const { sessionId } = await call('POST', '/session', { capabilities: { alwaysMatch: { browserName: 'safari' } } })
  await call('POST', `/session/${sessionId}/timeouts`, { script: 1_200_000 })
  await call('POST', `/session/${sessionId}/url`, { url: `http://127.0.0.1:${port}/` })
  console.log(await call('POST', `/session/${sessionId}/execute/async`, { script: 'const done = arguments[arguments.length - 1]; navigator.gpu.requestAdapter().then((a) => done({ ua: navigator.userAgent, f16: a?.features.has("shader-f16"), maxBuffer: a?.limits.maxBufferSize, Float16Array: typeof Float16Array }), (e) => done(String(e)))', args: [] }))
  for (const film of films) {
    const result = await call('POST', `/session/${sessionId}/execute/async`, { script: 'const done = arguments[arguments.length - 1]; window.film(arguments[0]).then(done, (e) => done({ error: String(e && e.message || e) }))', args: [{ ...common, ...film }] }).catch((e) => ({ error: e.message }))
    console.log(JSON.stringify({ browser: 'safari', film: film.name, ...result }))
  }
  await call('DELETE', `/session/${sessionId}`)
} finally {
  driver.kill()
}
