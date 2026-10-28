// A game's frame, around the game (D648): Jean's own script, written ahead of the game in its page (./frame.js), which runs in the
// frame alone, never in Jean's page. It owns the frame's clock (requestAnimationFrame, performance.now, Date and timers), so that a
// pause stops the game wherever it is, whatever its engine, and a play-test steps frames as fast as they come, through a
// MessageChannel that a frame out of sight or a tab behind another doesn't slow, the same frames each time from a seeded
// Math.random. It gives the game `host`: the element to draw in, six actions from the arrows or WASD, Space, Z or Enter (a),
// X or Shift (b), a gamepad or the buttons drawn on a touch screen, all sent as keys so that an engine's own input hears them too;
// ZzFX's sounds, silent when muted; what it saves (and localStorage, which an opaque frame lacks, kept with it); its moments and
// score; the user's language, direction and wish for less motion. To play, a cover to start it on a click, which gives the frame
// its sound and keys, pause when it loses the focus, mute and full screen; to test, a report of what each run showed (./report.js).
// A loop the guard (./guard.js) finds running a second throws at its line, since a frame shares Jean's thread in WebKit.
;(() => {
  const win = /** @type {any} */ (window)
  const given = /** @type {{ test: { frames: number, seed: number, press: { action: string, from: number, to: number }[] } | null, saved: { save: string | null, storage: Record<string, string> }, words: Record<string, string>, actions: string[], reduced: boolean, title: string }} */ (win.__game)
  const { test, words } = given
  const real = { now: performance.now.bind(performance), raf: requestAnimationFrame.bind(window), later: setTimeout.bind(window), clear: clearTimeout.bind(window) }
  const post = (/** @type {Record<string, unknown>} */ message) => parent.postMessage(message, '*')
  const report = { errors: /** @type {Record<string, unknown>[]} */ ([]), states: /** @type {[number, string][]} */ ([]), scores: /** @type {[number, number][]} */ ([]), violations: /** @type {string[]} */ ([]), alerts: /** @type {string[]} */ ([]), prints: /** @type {unknown[]} */ ([]), frames: 0 }
  const work = /** @type {number[]} */ ([]), seen = new Set()
  let url = '', stage = /** @type {HTMLElement} */ (document.body)

  // What went wrong, at its line of the game when its stack says so.
  const at = (/** @type {unknown} */ stack) => ((found) => (found ? { line: Number(found[1]), col: Number(found[2]) } : {}))(url && new RegExp(`${url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:(\\d+):(\\d+)`).exec(String(stack ?? '')))
  /** @param {any} error @param {number} [line] @param {number} [col] */
  const fault = (error, line, col) => { if (report.errors.length < 20) report.errors.push({ message: String(error?.message ?? error), name: error?.name, line, col, ...at(error?.stack), frame: report.frames }) }
  const call = (/** @type {unknown} */ fn, /** @type {unknown[]} */ args) => { if (typeof fn === 'function') try { fn(...args) } catch (error) { fault(error) } }
  addEventListener('error', (event) => fault(event.error ?? event.message, event.filename === url ? event.lineno : undefined, event.filename === url ? event.colno : undefined))
  addEventListener('unhandledrejection', (event) => fault(event.reason))
  document.addEventListener('securitypolicyviolation', (event) => report.violations.push(`${event.effectiveDirective} ${event.blockedURI}`))
  for (const name of ['alert', 'confirm', 'prompt']) win[name] = (/** @type {unknown} */ text) => (report.alerts.push(String(text)), name === 'confirm' || null)

  // The guard's check: a second without the frame's task ending, counted again from each task.
  let loops = 0, since = 0, armed = false
  const rearm = new MessageChannel()
  rearm.port1.onmessage = () => { loops = 0; armed = false }
  win.__loop = () => {
    if (!armed) armed = true, since = real.now(), rearm.port2.postMessage(0)
    if (++loops % 4096 === 0 && real.now() - since > 1000) throw new Error('A loop ran for a second without ending')
    return true
  }

  // The clock, the same each run when testing.
  let now = 0, running = false, paused = false, ids = 1e6
  const start = test ? 1767225600000 : Date.now(), RealDate = Date
  if (test) {
    let seed = test.seed >>> 0 || 1
    Math.random = () => { seed ^= seed << 13; seed >>>= 0; seed ^= seed >>> 17; seed ^= seed << 5; seed >>>= 0; return seed / 4294967296 }
    Object.defineProperties(document, { hidden: { get: () => false }, visibilityState: { get: () => 'visible' } })
  }
  win.Date = class extends RealDate {
    constructor(/** @type {any[]} */ ...args) { if (args.length) super(.../** @type {[any]} */ (args)); else super(start + now) }
    static now() { return start + now }
  }
  performance.now = () => now
  let frames = /** @type {Map<number, Function>} */ (new Map())
  const timers = /** @type {Map<number, { at: number, every?: number, fn: unknown, args: unknown[] }>} */ (new Map())
  win.requestAnimationFrame = (/** @type {Function} */ fn) => (frames.set(++ids, fn), ids)
  win.cancelAnimationFrame = (/** @type {number} */ id) => frames.delete(id)
  win.setTimeout = (/** @type {any} */ fn, ms = 0, /** @type {unknown[]} */ ...args) => (running ? (timers.set(++ids, { at: now + Math.max(0, Number(ms) || 0), fn, args }), ids) : real.later(fn, ms, ...args))
  win.setInterval = (/** @type {unknown} */ fn, ms = 0, /** @type {unknown[]} */ ...args) => ((every) => (timers.set(++ids, { at: now + every, every, fn, args }), ids))(Math.max(1, Number(ms) || 0))
  win.clearTimeout = win.clearInterval = (/** @type {number} */ id) => (id > 1e6 ? timers.delete(id) : real.clear(id))
  const step = (/** @type {number} */ ms) => {
    now += ms
    for (const [id, timer] of [...timers]) if (timer.at <= now && timers.has(id)) { if (timer.every) timer.at += timer.every; else timers.delete(id); call(timer.fn, timer.args) }
    const due = frames
    frames = new Map()
    for (const fn of due.values()) call(fn, [now])
    pressed.clear()
  }

  // Actions, from keys, and keys sent for them: by the tester, a gamepad or a touch screen's buttons.
  const KEYS = /** @type {Record<string, [string, number, string]>} */ ({ left: ['ArrowLeft', 37, 'ArrowLeft'], right: ['ArrowRight', 39, 'ArrowRight'], up: ['ArrowUp', 38, 'ArrowUp'], down: ['ArrowDown', 40, 'ArrowDown'], a: ['Space', 32, ' '], b: ['KeyX', 88, 'x'], pause: ['KeyP', 80, 'p'] })
  const OF = /** @type {Record<string, string>} */ ({ ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', Space: 'a', KeyZ: 'a', Enter: 'a', KeyX: 'b', ShiftLeft: 'b', ShiftRight: 'b', KeyP: 'pause', Escape: 'pause' })
  const down = new Set(), pressed = new Set(), on = /** @type {Map<string, unknown[]>} */ (new Map())
  addEventListener('keydown', (event) => {
    const action = OF[event.code]
    if (action === 'pause') return void (!event.repeat && toggle(!paused))
    if (action && !down.has(action)) { pressed.add(action); for (const fn of on.get(action) ?? []) call(fn, []) }
    if (action) down.add(action)
  }, true)
  addEventListener('keyup', (event) => { down.delete(OF[event.code]) }, true)
  const send = (/** @type {string} */ type, /** @type {string} */ action) => {
    const [code, which, key] = KEYS[action], event = new KeyboardEvent(type, { key, code, bubbles: true, cancelable: true })
    Object.defineProperties(event, { keyCode: { get: () => which }, which: { get: () => which } })
    ;(document.activeElement ?? document.body).dispatchEvent(event)
  }
  let pads = new Set()
  const poll = () => {
    const held = new Set()
    try {
      for (const pad of navigator.getGamepads?.() ?? []) {
        if (!pad) continue
        const [x = 0, y = 0] = pad.axes, button = (/** @type {number} */ i) => pad.buttons[i]?.pressed
        for (const [action, is] of /** @type {[string, boolean][]} */ ([['left', button(14) || x < -0.5], ['right', button(15) || x > 0.5], ['up', button(12) || y < -0.5], ['down', button(13) || y > 0.5], ['a', button(0)], ['b', button(1) || button(2)], ['pause', button(9)]])) if (is) held.add(action)
      }
    } catch {}
    for (const action of held) if (!pads.has(action)) send('keydown', action)
    for (const action of pads) if (!held.has(action)) send('keyup', action)
    pads = held
  }

  // What the game is given.
  let saved = given.saved.save, muted = false
  const store = new Map(Object.entries(given.saved.storage ?? {})), listeners = /** @type {Record<string, unknown[]>} */ ({ pause: [], resume: [] })
  const keep = () => test || post({ keep: { save: saved, storage: Object.fromEntries(store) } })
  const storage = { getItem: (/** @type {string} */ key) => store.get(String(key)) ?? null, setItem: (/** @type {string} */ key, /** @type {unknown} */ value) => (store.set(String(key), String(value)), keep()),
    removeItem: (/** @type {string} */ key) => (store.delete(String(key)), keep()), clear: () => (store.clear(), keep()), key: (/** @type {number} */ i) => [...store.keys()][i] ?? null, get length() { return store.size } }
  Object.defineProperty(window, 'localStorage', { value: storage, configurable: true })
  let score = NaN
  const LENT = 'zzfx'
  win.host = {
    get stage() { return stage },
    input: { down: (/** @type {string} */ action) => down.has(action), pressed: (/** @type {string} */ action) => pressed.has(action), on: (/** @type {string} */ action, /** @type {unknown} */ fn) => void on.set(action, [...(on.get(action) ?? []), fn]) },
    // ZzFX, lent as the engines are, by the page's import map.
    sound: (/** @type {number[]} */ ...params) => void (muted || import(/** @type {string} */ (LENT)).then(({ zzfx, ZZFX }) => (ZZFX.audioContext.resume(), zzfx(...params)), (error) => fault(error))),
    save: (/** @type {unknown} */ value) => { const json = JSON.stringify(value ?? null); if (json.length > 65536) throw new RangeError('A save holds 64 KB at most.'); saved = json; keep() },
    load: () => JSON.parse(saved ?? 'null'),
    state: (/** @type {unknown} */ name) => { report.states.push([Math.round(now), String(name)]); if (!test) post({ state: String(name) }) },
    score: (/** @type {unknown} */ n) => { if (Number(n) !== score && report.scores.length < 500) report.scores.push([Math.round(now), (score = Number(n))]) },
    on: (/** @type {string} */ name, /** @type {unknown} */ fn) => void listeners[name]?.push(fn),
    reduced: given.reduced, lang: document.documentElement.lang, dir: document.documentElement.dir || 'ltr',
  }

  // The words it draws, and a picture of the screen: the largest canvas read in the task that drew it, 160 × 90, by areas of 5 × 5;
  // without one, the stage's markup.
  for (const kind of [CanvasRenderingContext2D, win.OffscreenCanvasRenderingContext2D].filter(Boolean)) {
    const fill = kind.prototype.fillText
    kind.prototype.fillText = function (/** @type {unknown} */ text, /** @type {unknown[]} */ ...rest) { if (seen.size < 200) seen.add(String(text)); return fill.call(this, text, ...rest) }
  }
  const pen = new OffscreenCanvas(160, 90).getContext('2d', { willReadFrequently: true })
  const print = () => {
    const canvas = [...document.querySelectorAll('canvas')].sort((a, b) => b.width * b.height - a.width * a.height)[0]
    if (!canvas || !pen) return ((markup) => [markup.length, [...markup].reduce((hash, c) => (hash * 31 + c.charCodeAt(0)) | 0, 7)])(stage.innerHTML)
    try {
      pen.clearRect(0, 0, 160, 90)
      pen.drawImage(canvas, 0, 0, 160, 90)
      const data = pen.getImageData(0, 0, 160, 90).data, areas = new Array(576).fill(0)
      for (let i = 0; i < 14400; i++) areas[Math.floor(i / 800) * 32 + Math.floor((i % 160) / 5)] += (data[i * 4] * 3 + data[i * 4 + 1] * 4 + data[i * 4 + 2]) / 200
      return areas.map((value) => Math.round(value * 100) / 100)
    } catch (error) { return `unreadable: ${error}` }
  }

  // Playing: one step a frame of the screen's, none while paused. Testing: one step a message, as fast as they come.
  const play = () => {
    if (running) return
    running = true
    if (!test) {
      let last = real.now()
      const tick = (/** @type {number} */ time) => { poll(); if (!paused) step(Math.min(50, time - last)); last = time; real.raf(tick) }
      return void real.raf(tick)
    }
    const { port1, port2 } = new MessageChannel()
    port1.onmessage = () => {
      const frame = report.frames
      for (const { action, from, to } of test.press) { if (from === frame) send('keydown', action); if (to === frame) send('keyup', action) }
      const began = real.now()
      step(1000 / 60)
      work.push(real.now() - began)
      if (frame % 10 === 0) report.prints.push(print())
      if (++report.frames % 60 === 0) post({ progress: report.frames })
      if (report.frames < test.frames) port2.postMessage(0)
      else post({ report: { ...report, words: [...seen], text: stage.innerText.slice(0, 500), work: { mean: work.reduce((a, b) => a + b, 0) / work.length, worst: Math.max(...work) } } })
    }
    port2.postMessage(0)
  }

  // The cover: to start, and while paused; mute and full screen above the game; buttons for its actions on a touch screen.
  const make = (/** @type {string} */ tag, /** @type {Record<string, string>} */ attributes = {}, /** @type {(Node | string)[]} */ ...children) => {
    const element = document.createElement(tag)
    for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value)
    element.append(...children)
    return element
  }
  const glyph = (/** @type {string} */ path) => { const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'), line = document.createElementNS('http://www.w3.org/2000/svg', 'path'); svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true'); line.setAttribute('d', path); svg.append(line); return svg }
  const cover = make('div', { class: 'cover' }), button = make('button', { type: 'button' }), title = make('h1', { dir: 'auto' }, given.title)
  cover.append(title, button)
  const covered = (/** @type {string} */ what) => { button.textContent = what; document.body.append(cover); button.focus() }
  const toggle = (/** @type {boolean} */ on) => {
    if (test || !running || paused === on) return
    paused = on
    for (const fn of listeners[on ? 'pause' : 'resume']) call(fn, [])
    if (on) title.textContent = words.paused, covered(words.resume)
    else cover.remove(), stage.focus()
  }
  button.addEventListener('click', () => (running ? toggle(false) : (cover.remove(), stage.focus(), play(), post({ playing: true }))))
  addEventListener('blur', () => toggle(true))
  document.addEventListener('visibilitychange', () => { if (document.hidden) toggle(true) })
  const sound = make('button', { type: 'button', 'aria-label': words.mute, 'aria-pressed': 'false' }, glyph('M4 9.5h3.5L12 5.5v13l-4.5-4H4zM16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11'))
  sound.addEventListener('click', () => { muted = !muted; sound.setAttribute('aria-pressed', String(muted)) })
  const full = make('button', { type: 'button', 'aria-label': words.full }, glyph('M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5'))
  full.addEventListener('click', () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {}))
  const pause = make('button', { type: 'button', 'aria-label': words.pause }, glyph('M9 5v14M15 5v14'))
  pause.addEventListener('click', () => toggle(true))
  const press = (/** @type {string} */ action, /** @type {string} */ shown) => {
    const one = make('button', { type: 'button', 'aria-label': words[action] ?? action, 'data-action': action }, shown)
    one.addEventListener('pointerdown', (event) => { one.setPointerCapture(event.pointerId); send('keydown', action) })
    for (const type of ['pointerup', 'pointercancel']) one.addEventListener(type, () => send('keyup', action))
    return one
  }
  const SHOWN = /** @type {Record<string, string>} */ ({ left: '◀', right: '▶', up: '▲', down: '▼', a: 'A', b: 'B' })
  const pad = make('div', { class: 'pad', dir: 'ltr' }, make('div', { class: 'arrows' }, ...['up', 'left', 'right', 'down'].filter((action) => given.actions.includes(action)).map((action) => press(action, SHOWN[action]))),
    make('div', { class: 'buttons' }, ...['b', 'a'].filter((action) => given.actions.includes(action)).map((action) => press(action, SHOWN[action]))))

  addEventListener('DOMContentLoaded', () => {
    stage = /** @type {HTMLElement} */ (document.getElementById('stage'))
    url = URL.createObjectURL(new Blob([document.getElementById('game')?.textContent ?? ''], { type: 'text/javascript' }))
    // Chromium says where a module's syntax error is on its element, WebKit on import()'s.
    document.body.append(make('script', { type: 'module', src: url }))
    import(url).then(() => test && real.later(play, frames.size ? 0 : 300), (error) => { if (!report.errors.some((one) => one.name === 'SyntaxError')) fault(error, error?.line, error?.column); if (test) play() })
    if (test) (function wait() { if (frames.size) play(); else if (!running) real.later(wait, 5) })()
    else document.body.append(make('div', { class: 'bar' }, pause, sound, full), pad), covered(words.play)
  })
})()
