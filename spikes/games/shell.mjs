// Spike of the games shell: runs inside the sandboxed frame, before the game.
// window.__test: null to play, or { frames, seed, press: [{ action, from, to }] } to test in virtual time.
(() => {
  const T = window.__test
  const realNow = performance.now.bind(performance)
  const realRaf = requestAnimationFrame.bind(window)
  const realSetTimeout = setTimeout.bind(window)
  const post = (message) => parent.postMessage(message, '*')
  const report = { errors: [], states: [], scores: [], violations: [], alerts: [], words: [], prints: [], work: [], frames: 0, started: null, storage: null }
  let gameUrl = ''
  const where = (stack) => {
    const at = gameUrl && new RegExp(`${gameUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:(\\d+):(\\d+)`).exec(String(stack ?? ''))
    return at ? { line: +at[1], col: +at[2] } : {}
  }
  const error = (e, line, col) => { if (report.errors.length < 20) report.errors.push({ message: String(e?.message ?? e), name: e?.name, line, col, ...where(e?.stack), frame: report.frames }) }
  addEventListener('error', (e) => error(e.error ?? e.message, e.filename === gameUrl ? e.lineno : undefined, e.filename === gameUrl ? e.colno : undefined))
  addEventListener('unhandledrejection', (e) => error(e.reason))
  document.addEventListener('securitypolicyviolation', (e) => report.violations.push(`${e.effectiveDirective} ${e.blockedURI}`))
  for (const name of ['alert', 'confirm', 'prompt']) window[name] = (text) => { report.alerts.push(String(text)); return name === 'confirm' ? true : null }

  // A loop that runs a second without the frame's task ending throws, at its own line.
  let loops = 0, since = 0, armed = false
  const rearm = new MessageChannel()
  rearm.port1.onmessage = () => { loops = 0; armed = false }
  window.__loop = () => {
    if (!armed) { armed = true; since = realNow(); rearm.port2.postMessage(0) }
    if (++loops % 4096 === 0 && realNow() - since > 1000) throw new Error('A loop ran for a second without ending')
    return true
  }

  // Seeded randomness and virtual time, so that a run is the same run every time.
  if (T) {
    let s = (T.seed >>> 0) || 1
    Math.random = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296 }
    Object.defineProperty(document, 'hidden', { get: () => false })
    Object.defineProperty(document, 'visibilityState', { get: () => 'visible' })
  }
  let now = 0, started = false
  const base = T ? 1767225600000 : Date.now()
  const RealDate = Date
  globalThis.Date = class extends RealDate {
    constructor (...args) { if (args.length) super(...args); else super(base + now) }
    static now () { return base + now }
  }
  performance.now = () => now
  let rafs = new Map(), rafId = 0
  window.requestAnimationFrame = (cb) => { rafs.set(++rafId, cb); return rafId }
  window.cancelAnimationFrame = (id) => { rafs.delete(id) }
  const timers = new Map()
  let timerId = 0
  window.setTimeout = (cb, ms = 0, ...args) => {
    if (!started) return realSetTimeout(cb, ms, ...args)
    const id = ++timerId; timers.set(id, { at: now + Math.max(0, +ms || 0), cb, args }); return id
  }
  window.setInterval = (cb, ms = 0, ...args) => { const id = ++timerId, every = Math.max(1, +ms || 0); timers.set(id, { at: now + every, every, cb, args }); return id }
  window.clearTimeout = window.clearInterval = (id) => { timers.delete(id) }

  // Actions, from keys, and keys sent for them.
  const KEYS = { left: ['ArrowLeft', 37, 'ArrowLeft'], right: ['ArrowRight', 39, 'ArrowRight'], up: ['ArrowUp', 38, 'ArrowUp'], down: ['ArrowDown', 40, 'ArrowDown'], a: [' ', 32, 'Space'], b: ['x', 88, 'KeyX'], pause: ['Escape', 27, 'Escape'] }
  const OF = new Map([['ArrowLeft', 'left'], ['KeyA', 'left'], ['ArrowRight', 'right'], ['KeyD', 'right'], ['ArrowUp', 'up'], ['KeyW', 'up'], ['ArrowDown', 'down'], ['KeyS', 'down'], ['Space', 'a'], ['KeyZ', 'a'], ['Enter', 'a'], ['KeyX', 'b'], ['ShiftLeft', 'b'], ['Escape', 'pause'], ['KeyP', 'pause']])
  const down = new Set(), pressed = new Set(), on = new Map()
  addEventListener('keydown', (e) => { const a = OF.get(e.code); if (!a) return; if (!down.has(a)) { pressed.add(a); for (const fn of on.get(a) ?? []) try { fn() } catch (x) { error(x) } } down.add(a) }, true)
  addEventListener('keyup', (e) => { const a = OF.get(e.code); if (a) down.delete(a) }, true)
  const send = (type, action) => {
    const [key, code, name] = KEYS[action]
    const event = new KeyboardEvent(type, { key, code: name, bubbles: true, cancelable: true })
    Object.defineProperties(event, { keyCode: { get: () => code }, which: { get: () => code } })
    ;(document.activeElement ?? document.body).dispatchEvent(event)
  }

  let saved = window.__saved ?? null, muted = false
  const listeners = { pause: [], resume: [] }
  const store = new Map(Object.entries(JSON.parse(window.__storage ?? '{}')))
  const keepStore = () => { report.storage = Object.fromEntries(store); post({ keepStorage: JSON.stringify(report.storage) }) }
  const storage = {
    getItem: (k) => (store.has(String(k)) ? store.get(String(k)) : null),
    setItem: (k, v) => { store.set(String(k), String(v)); keepStore() },
    removeItem: (k) => { store.delete(String(k)); keepStore() },
    clear: () => { store.clear(); keepStore() },
    key: (i) => [...store.keys()][i] ?? null,
    get length () { return store.size },
  }
  try { Object.defineProperty(window, 'localStorage', { value: storage, configurable: true }) } catch (e) { report.errors.push({ message: `shim: ${e.message}` }) }
  let lastScore
  window.jean = {
    stage: null,
    input: { down: (a) => down.has(a), pressed: (a) => pressed.has(a), on: (a, fn) => on.set(a, [...(on.get(a) ?? []), fn]) },
    state: (s) => { report.states.push([Math.round(now), String(s)]) },
    score: (n) => { if (n !== lastScore) { lastScore = n; if (report.scores.length < 500) report.scores.push([Math.round(now), +n]) } },
    save: (value) => { const json = JSON.stringify(value); if (json.length > 65536) throw new RangeError('A save holds 64 KB at most'); saved = json; post({ keep: json }) },
    load: () => JSON.parse(saved ?? 'null'),
    sound: async (...p) => { if (muted) return; const { zzfx } = await import('zzfx'); zzfx(...p) },
    reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
    lang: document.documentElement.lang,
    dir: document.documentElement.dir || 'ltr',
    on: (name, fn) => listeners[name]?.push(fn),
  }

  // Words the game draws.
  const words = new Set()
  for (const P of [CanvasRenderingContext2D.prototype, globalThis.OffscreenCanvasRenderingContext2D?.prototype].filter(Boolean)) {
    const fill = P.fillText
    P.fillText = function (text, ...rest) { if (words.size < 200) words.add(String(text)); return fill.call(this, text, ...rest) }
  }

  // A picture of the screen: the largest canvas at 160×90, read in the task that drew it, averaged by areas of 5×5 into 32×18.
  const thumb = new OffscreenCanvas(160, 90), tctx = thumb.getContext('2d', { willReadFrequently: true })
  const print = () => {
    const canvas = [...document.querySelectorAll('canvas')].sort((a, b) => b.width * b.height - a.width * a.height)[0]
    // Without a canvas, the page's markup: a highlight that moves changes a class, not the text.
    if (!canvas) { const markup = document.getElementById('stage')?.innerHTML ?? ''; return [markup.length, [...markup].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7)] }
    try {
      tctx.clearRect(0, 0, 160, 90)
      tctx.drawImage(canvas, 0, 0, 160, 90)
      const d = tctx.getImageData(0, 0, 160, 90).data, out = new Array(576).fill(0)
      for (let y = 0; y < 90; y++) for (let x = 0; x < 160; x++) { const i = (y * 160 + x) * 4; out[((y / 5) | 0) * 32 + ((x / 5) | 0)] += (d[i] * 3 + d[i + 1] * 4 + d[i + 2]) / 200 }
      return out.map((v) => Math.round(v * 100) / 100)
    } catch (e) { return [`unreadable: ${e.message}`] }
  }

  const step = (dt) => {
    now += dt
    for (const [id, t] of [...timers]) {
      if (t.at > now || !timers.has(id)) continue
      if (t.every) t.at += t.every; else timers.delete(id)
      if (typeof t.cb === 'function') try { t.cb(...t.args) } catch (e) { error(e) }
    }
    const due = rafs
    rafs = new Map()
    for (const cb of due.values()) try { cb(now) } catch (e) { error(e) }
    pressed.clear()
  }

  const start = () => {
    if (started) return
    started = true
    report.started = Math.round(realNow() - t0)
    if (!T) {
      let last = realNow()
      const tick = (t) => { const dt = Math.min(50, t - last); last = t; step(dt); realRaf(tick) }
      return realRaf(tick)
    }
    const channel = new MessageChannel()
    const presses = T.press ?? []
    channel.port1.onmessage = () => {
      const f = report.frames
      for (const p of presses) { if (p.from === f) send('keydown', p.action); if (p.to === f) send('keyup', p.action) }
      const w = realNow()
      step(1000 / 60)
      if (f % 10 === 0) report.prints.push(print())
      report.work.push(realNow() - w)
      report.frames++
      if (report.frames % 60 === 0) post({ progress: report.frames })
      if (report.frames < T.frames) channel.port2.postMessage(0)
      else finish()
    }
    channel.port2.postMessage(0)
  }
  const t0 = realNow()
  const finish = () => {
    const work = report.work.slice().sort((a, b) => a - b)
    post({ report: { ...report, work: { median: work[work.length >> 1], worst: work[work.length - 1], mean: work.reduce((a, b) => a + b, 0) / Math.max(1, work.length) }, words: [...words], text: document.body.innerText.slice(0, 500), wall: Math.round(realNow() - t0) } })
  }

  addEventListener('DOMContentLoaded', () => {
    window.jean.stage = document.getElementById('stage')
    const code = document.getElementById('game')?.textContent ?? ''
    gameUrl = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }))
    // Chromium reports a module's syntax error with its line on the element; WebKit on import()'s error.
    const script = document.createElement('script')
    script.type = 'module'
    script.src = gameUrl
    document.body.append(script)
    import(gameUrl).then(() => realSetTimeout(start, rafs.size ? 0 : 300), (e) => {
      if (!report.errors.some((one) => one.name === 'SyntaxError')) error(e, e?.line, e?.column)
      start()
    })
    // The clock starts with the game's first frame, or once its module has run.
    if (T) realSetTimeout(function poll () { if (rafs.size) start(); else if (!started) realSetTimeout(poll, 5) }, 5)
    else { const wait = () => { if (rafs.size) start(); else if (!started) realRaf(wait) }; wait() }
  })
})()
