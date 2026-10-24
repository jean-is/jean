// Composes the film in Safari itself, over safaridriver, and saves what it made.
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
const DRIVER = 47393
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
  await call('POST', `/session/${sessionId}/timeouts`, { script: 120000 })
  await call('POST', `/session/${sessionId}/url`, { url: 'http://127.0.0.1:47392/' })
  console.log(await call('POST', `/session/${sessionId}/execute/sync`, { script: 'return navigator.userAgent', args: [] }))
  const probe = async (name, body, arg) => console.log(name, JSON.stringify(await call('POST', `/session/${sessionId}/execute/async`, { script: `const done = arguments[arguments.length - 1]; (async (arg) => { ${body} })(arguments[0]).then(done, (e) => done('threw ' + (e && e.message || e)))`, args: [arg] }).catch((e) => 'driver ' + e.message)))
  for (const size of [{ width: 1280, height: 720, codecString: 'avc1.42001f' }, { width: 1920, height: 1080, codecString: 'avc1.42002a' }, { width: 1920, height: 1080, codecString: 'avc1.4d4028' }]) {
    const result = await call('POST', `/session/${sessionId}/execute/async`, { script: 'const done = arguments[arguments.length - 1]; window.run(arguments[0]).then(async (r) => { const b = window.bytes; let s = ""; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); done({ ...r, base64: btoa(s) }) }, (e) => done({ error: String(e && e.message || e) }))', args: [size] }).catch((e) => ({ error: e.message }))
    const { base64, ...rest } = result
    console.log(JSON.stringify({ browser: 'safari', codec: size.codecString, ...rest }))
    if (base64) writeFileSync(`film-safari-${size.height}-${size.codecString}.mp4`, Buffer.from(base64, 'base64'))
  }
  await call('DELETE', `/session/${sessionId}`)
} finally {
  driver.kill()
}
