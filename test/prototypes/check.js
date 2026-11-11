// The check of a prototype, for npm run prototypes (a canvas for prototypes, phase 0): a few screens of an app or a flow,
// each its own page, which a person clicks through. From the files, Sites' check (app/caps/sites/check.js) less what only a
// site for strangers needs (a description, a card, a header and a foot, forms its host receives), plus a prototype's own
// rules: a screen per step, nothing kept but the address, no alert(). In Chromium, every screen reached from index.html
// by pressing what it shows, at 390 pixels: each link, button, tab and summary, its fields filled first, one level deeper
// where a press opened something; what leads nowhere, what does nothing, what can't be pressed, and the screens nobody
// reaches. Then each screen at 390 and 1280 pixels (and 320, for what scrolls sideways): a sideways scroll, pictures that
// don't load, a script's errors, what it reached elsewhere, and its words' contrast (axe-core) by day and by night.
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { checkFiles } from '../../app/caps/sites/check.js'
import { parse, elements } from '../../app/caps/sites/html.js'
import { reach } from '../../app/caps/sites/file.js'
import { serve } from '../sites/check.js'

/** @typedef {Map<string, Uint8Array>} Files */
/** @typedef {{ screens: string[], reached: string[], followed: number, pressed: number, dead: string[], unsure: number, leads: [string, string[]][], errors: number }} Flow */
/**
 * @typedef {Object} Report
 * @property {string[]} problems   each said whole, its screen first
 * @property {string[]} fill       placeholders left
 * @property {string[]} pages      its screens
 * @property {string[]} languages
 * @property {number} weight       what the first screen loads, in bytes
 * @property {string[]} outline    each screen in a line: its title, headings and forms
 * @property {Flow} [flow]         what pressing every control found
 * @property {{ wide: Buffer, sheet: Buffer }} [shots] the first screen at 1280 pixels, and every screen reached at 390 side by side
 */

export const WIDTHS = [390, 1280]
const NARROWEST = 320
const AXE = fileURLToPath(new URL('../../node_modules/axe-core/axe.min.js', import.meta.url))
const SCREENS = 16, PRESSES = 30, DEEPER = 12, AT_ONCE = 4

/** What only a site for strangers needs, which a prototype's screens don't. */
const SITE_ONLY = [/: its description is /, /: its card for shared links/, /top \(header\), not one/, /foot \(footer\), not one/, /a form sends to /, /a form doesn’t send with method="post"/,
  /a form has no data-form name/, /nothing leads to it from index\.html/, /navigations has no name/]

/** Sites' words, said of a prototype. @param {string} problem */
const said = (problem) => problem
  .replace('a field asks for a password; a site never does', 'a field asks for a password; a prototype never does: show signing in as a button such as “Continue as Sara”')
  .replace('a field asks for a card or bank number; a site never takes payments', 'a field asks for a card or bank number; a prototype never does: write the card as words (“Visa ending 4242, sample”) above a Pay button that leads to the next screen')
  .replace('the page a visitor lands on', 'its first screen')
  .replace(/\bsite\.js\b/g, 'prototype.js').replace(/\bthe site’s\b/g, 'the prototype’s').replace(/\bthe site has\b/g, 'the prototype has').replace(/\ba site\b/g, 'a prototype').replace(/\bthe site\b/g, 'the prototype')

const decode = (/** @type {Uint8Array} */ bytes) => new TextDecoder().decode(bytes)
const extension = (/** @type {string} */ path) => path.toLowerCase().split('.').pop() ?? ''

/** The check from the files alone. @param {Files} files @returns {Report} */
export function checkScreens(files) {
  const found = checkFiles(files)
  const problems = found.problems.filter((problem) => !SITE_ONLY.some((pattern) => pattern.test(problem))).map(said)
  if (found.pages.length === 1) problems.push('it has one screen; a prototype shows its flow as a screen per step, each its own .html, linked from the one before')
  for (const [path, bytes] of files) {
    const scripts = extension(path) === 'js' ? [decode(bytes)] : extension(path) === 'html' ? elements(parse(decode(bytes))).filter((element) => element.name === 'script').map((element) => element.children.join('')) : []
    for (const code of scripts) {
      const kept = /\b(localStorage|sessionStorage|indexedDB)\b|document\.cookie/.exec(code)?.[0]
      if (kept) problems.push(`${path}: it keeps choices in ${kept}, which Jean's frame doesn't have; carry them in the address (confirm.html?time=10:30) and read them with URLSearchParams`)
      // The browser's own alert(), confirm() and prompt(), not a function of the script's that bears the name.
      const own = new Set([...code.matchAll(/(?:function\s+|(?:const|let|var)\s+)(alert|confirm|prompt)\b/g)].map((match) => match[1]))
      for (const shown of new Set([...code.matchAll(/(?<![\w$.])(?<!function\s+)(window\.)?(alert|confirm|prompt)\s*\(/g)].filter((match) => match[1] || !own.has(match[2])).map((match) => match[2]))) {
        problems.push(`${path}: it calls ${shown}(), which Jean's frame doesn't show; write the message on the screen`)
      }
    }
  }
  return { ...found, problems: [...new Set(problems)] }
}

/** The controls a person presses on a screen, as the page shows them. */
const PRESSABLE = 'a[href], button, input[type=submit], input[type=button], input[type=image], [role=button], [role=tab], [role=link], [role=menuitem], [role=option], summary'

/**
 * Lists what can be pressed on the page, each marked with its number, its name, and where a plain link leads. Run in the page.
 * @param {string} selector @returns {{ at: number, name: string, kind: string, href: string | null, to: string | null, disabled: boolean, invalid: boolean, key: string }[]}
 */
function listed(selector) {
  const out = []
  let at = 0
  for (const element of /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll(selector))) {
    const box = element.getBoundingClientRect()
    if (!box.width || !box.height || !element.checkVisibility({ visibilityProperty: true })) continue
    element.setAttribute('data-probe', String(at))
    const anchor = element instanceof HTMLAnchorElement ? element : null
    const raw = anchor?.getAttribute('href') ?? null
    // A plain link to a page leads there with no press: only a link to # or a script needs pressing.
    const to = anchor && raw && !/^\s*(#|javascript:)/i.test(raw) ? anchor.href : null
    const form = /** @type {HTMLButtonElement | HTMLInputElement} */ (element).form
    const submits = !!form && (element instanceof HTMLButtonElement ? element.type === 'submit' : element instanceof HTMLInputElement && ['submit', 'image'].includes(element.type))
    const name = (element.getAttribute('aria-label') ?? element.innerText ?? '').trim() || /** @type {HTMLInputElement} */ (element).value || element.title || element.querySelector('img')?.alt || element.tagName.toLowerCase()
    const kind = anchor ? 'link' : element.getAttribute('role') ?? element.tagName.toLowerCase()
    out.push({ at, name: name.replace(/\s+/g, ' ').slice(0, 40), kind, href: raw, to, disabled: element.matches(':disabled') || element.getAttribute('aria-disabled') === 'true', invalid: submits && !form?.checkValidity(), key: `${kind} ${name} ${raw ?? ''}` })
    at++
  }
  return out
}

/** What the page shows, to tell whether a press changed it. Run in the page. */
function shown() {
  const values = [...document.querySelectorAll('input, select, textarea')].map((field) => (field instanceof HTMLInputElement && ['checkbox', 'radio'].includes(field.type) ? field.checked : /** @type {HTMLInputElement} */ (field).value)).join('\u0001')
  return [document.body?.innerText ?? '', (document.body?.outerHTML ?? '').replace(/ data-probe="\d+"/g, ''), values, document.querySelector('dialog[open]') ? 'dialog' : ''].join('\u0002')
}

/** What a tester types where a field gives no sample of its own: a name and a sentence in the screen's language. The judge is told. */
export const TYPED = /** @type {Record<string, [string, string]>} */ ({ en: ['Sara Martin', 'Thank you, see you soon.'], fr: ['Camille Durand', 'Merci, à bientôt.'], ar: ['سارة أحمد', 'شكرًا، إلى اللقاء.'], ja: ['佐藤 花子', 'よろしくお願いします。'] })

/** Fills every field as a person would before pressing on: a sample for each kind, the first of each radio group, required boxes ticked. Run in the page. @param {{ day: string, typed: typeof TYPED }} given */
function filled({ day, typed }) {
  const set = (/** @type {HTMLInputElement} */ field, /** @type {string} */ value) => {
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(field), 'value')?.set
    setter ? setter.call(field, value) : (field.value = value)
    field.dispatchEvent(new Event('input', { bubbles: true }))
    field.dispatchEvent(new Event('change', { bubbles: true }))
  }
  const groups = new Set()
  for (const field of /** @type {NodeListOf<HTMLInputElement>} */ (document.querySelectorAll('input, select, textarea'))) {
    if (field.disabled || field.readOnly || ['hidden', 'file', 'submit', 'button', 'reset', 'image', 'range', 'color'].includes(field.type)) continue
    if (field.type === 'checkbox') { if (field.required && !field.checked) { field.checked = true; field.dispatchEvent(new Event('change', { bubbles: true })) } continue }
    if (field.type === 'radio') {
      if (!groups.has(field.name) && !document.querySelector(`input[type=radio][name="${CSS.escape(field.name)}"]:checked`)) { field.checked = true; field.dispatchEvent(new Event('input', { bubbles: true })); field.dispatchEvent(new Event('change', { bubbles: true })) }
      groups.add(field.name)
      continue
    }
    if (field.value) continue
    if (field instanceof HTMLSelectElement) { const option = [...field.options].find((one) => one.value && !one.disabled); if (option) set(/** @type {any} */ (field), option.value); continue }
    // What a person would type, so that the screens after show words of the prototype's own: its placeholder, else a name or a
    // sentence in the screen's language.
    const lang = (document.documentElement.lang || 'en').slice(0, 2)
    const [name, sentence] = typed[lang] ?? typed.en
    const own = field.placeholder?.replace(/^\s*(e\.\s?g\.|eg|ex\.?|par ex(emple)?\.?|例|مثال|مثلًا|مثلا)\s*[:：,،]?\s*/i, '').trim()
    const value = /** @type {Record<string, string>} */ ({ email: 'sara@example.com', tel: '0612345678', url: 'https://example.com', number: field.min || '1', date: day, time: '10:00', 'datetime-local': `${day}T10:00`, month: day.slice(0, 7), password: 'sample' })[field.type]
      ?? (own || (field instanceof HTMLTextAreaElement ? sentence : name))
    set(field, field.minLength > value.length ? value.padEnd(field.minLength, '.') : value)
  }
}

/** A screen's place in the prototype from an address on its origin, or null for none of its screens. @param {Files} files @param {string} origin @param {string} href */
const screenOf = (files, origin, href) => {
  const url = new URL(href, `${origin}/`)
  if (url.origin !== origin) return null
  const path = reach(files, decodeURIComponent(url.pathname.slice(1)))
  return path && extension(path) === 'html' ? path : null
}

/** Runs the work on the items, `parallel` at a time. @template T @param {T[]} items @param {number} parallel @param {(item: T) => Promise<void>} work */
async function pool(items, parallel, work) {
  let next = 0
  await Promise.all(Array.from({ length: Math.min(parallel, items.length) }, async () => {
    while (next < items.length) await work(items[next++])
  }))
}

/**
 * Presses every control, from index.html on: where each leads, what does nothing, which screens nobody reaches.
 * @param {import('@playwright/test').BrowserContext} context @param {string} origin @param {Files} files @param {string[]} screens
 * @returns {Promise<{ flow: Flow, firsts: Map<string, string>, problems: string[] }>}
 */
async function explore(context, origin, files, screens) {
  const day = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
  /** @type {Map<string, string>} each screen reached, by the address it was first reached at */
  const firsts = new Map([['index.html', `${origin}/index.html`]])
  /** @type {Map<string, Set<string>>} */
  const leads = new Map()
  const problems = /** @type {string[]} */ ([]), dead = /** @type {string[]} */ ([])
  let [followed, pressed, unsure, errors] = [0, 0, 0, 0]
  /** @type {Set<string>} screens whose fields lead on by themselves when filled */
  const leadsWhenFilled = new Set()
  const lead = (/** @type {string} */ from, /** @type {string} */ href) => {
    const to = screenOf(files, origin, href)
    if (!to || to === from) return to
    leads.set(from, (leads.get(from) ?? new Set()).add(to))
    if (!firsts.has(to)) { firsts.set(to, href); queue.push(to) }
    return to
  }
  /** A page at the screen's address, its fields filled unless filling leads on; null when it failed to load. @param {string} screen */
  const opened = async (screen) => {
    const page = await context.newPage()
    page.on('pageerror', () => errors++)
    page.on('dialog', (dialog) => dialog.dismiss().catch(() => {}))
    try {
      await page.goto(/** @type {string} */ (firsts.get(screen)), { waitUntil: 'load', timeout: 10_000 })
      if (!leadsWhenFilled.has(screen)) {
        const before = page.url()
        await page.evaluate(filled, { day, typed: TYPED })
        for (const input of await page.locator('input[type=file]').all()) await input.setInputFiles({ name: 'note.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%sample\n') }).catch(() => {})
        await page.waitForTimeout(60)
        if (page.url() !== before) {
          leadsWhenFilled.add(screen)
          lead(screen, page.url())
          await page.goto(/** @type {string} */ (firsts.get(screen)), { waitUntil: 'load', timeout: 10_000 })
        }
      }
      return page
    } catch {
      await page.close()
      return null
    }
  }
  /**
   * Presses one control on a fresh page, after the presses before it, and says what it did.
   * @param {string} screen @param {{ at: number, name: string, kind: string, href: string | null }[]} path @returns {Promise<{ did: 'led' | 'changed' | 'dead' | 'unsure', newly?: ReturnType<typeof listed> }>}
   */
  const press = async (screen, path) => {
    const page = await opened(screen)
    if (!page) return { did: 'unsure' }
    const control = /** @type {(typeof path)[number]} */ (path.at(-1))
    try {
      let list = await page.evaluate(listed, PRESSABLE)
      for (const step of path.slice(0, -1)) {
        const found = list.find((one) => one.at === step.at)
        if (!found) return { did: 'unsure' }
        await page.locator(`[data-probe="${step.at}"]`).click({ timeout: 1500 })
        await page.waitForTimeout(250)
        list = await page.evaluate(listed, PRESSABLE)
      }
      const target = list.find((one) => one.key === `${control.kind} ${control.name} ${control.href ?? ''}`) ?? list.find((one) => one.at === control.at)
      if (!target) return { did: 'unsure' }
      const locator = page.locator(`[data-probe="${target.at}"]`)
      await locator.scrollIntoViewIfNeeded({ timeout: 1500 }).catch(() => {})
      const before = await page.evaluate(shown), from = page.url()
      const popup = page.waitForEvent('popup', { timeout: 400 }).catch(() => null)
      try {
        await locator.click({ timeout: 1500 })
      } catch {
        problems.push(`${screen}: “${control.name}” can't be pressed: something covers it or it is off the screen`)
        return { did: 'dead' }
      }
      const moved = await page.waitForURL((url) => url.href !== from, { timeout: 350, waitUntil: 'commit' }).then(() => true, () => false)
      const popped = await popup
      if (popped) { const href = popped.url(); await popped.close().catch(() => {}); return lead(screen, href) ? { did: 'led' } : { did: 'changed' } }
      if (moved) {
        await page.waitForLoadState('load', { timeout: 5000 }).catch(() => {})
        const now = new URL(page.url()), was = new URL(from)
        if (now.origin !== origin) return { did: 'led' }
        const to = screenOf(files, origin, now.href)
        if (!to) { problems.push(`${screen}: “${control.name}” leads to ${decodeURIComponent(now.pathname.slice(1))}, which isn't in the prototype`); return { did: 'dead' } }
        if (to !== screen) { lead(screen, now.href); return { did: 'led' } }
        if (now.pathname === was.pathname && now.search === was.search && now.hash.length > 1) return { did: 'changed' }
        await page.waitForTimeout(100)
        return (await page.evaluate(shown)).split('\u0002')[0] === before.split('\u0002')[0] ? { did: 'dead' } : { did: 'changed' }
      }
      await page.waitForTimeout(150)
      if (page.url() !== from) { lead(screen, page.url()); return { did: 'led' } }
      if ((await page.evaluate(shown)) === before) return { did: 'dead' }
      const after = await page.evaluate(listed, PRESSABLE)
      const keys = new Set(list.filter((one) => !one.disabled).map((one) => one.key))
      return { did: 'changed', newly: after.filter((one) => !one.disabled && !keys.has(one.key)) }
    } catch {
      return { did: 'unsure' }
    } finally {
      await page.close()
    }
  }

  const queue = ['index.html']
  while (queue.length && firsts.size <= SCREENS) {
    const screen = /** @type {string} */ (queue.shift())
    const page = await opened(screen)
    if (!page) { problems.push(`${screen}: it didn't load`); continue }
    const list = await page.evaluate(listed, PRESSABLE).catch(() => [])
    await page.close()
    const toPress = []
    for (const control of list) {
      if (control.to) { if (!/^(mailto|tel|sms):/i.test(control.href ?? '')) { followed++; lead(screen, control.to) } continue }
      if (control.disabled) continue
      if (control.invalid) { unsure++; continue }
      toPress.push(control)
    }
    /** @type {{ path: typeof toPress, name: string }[]} */
    const deeper = []
    const judged = async (/** @type {typeof toPress} */ path) => {
      const control = /** @type {(typeof toPress)[number]} */ (path.at(-1))
      const { did, newly } = await press(screen, path)
      pressed++
      if (did === 'unsure') unsure++
      if (did === 'dead') dead.push(`${screen}: “${control.name}” (${control.kind}) does nothing a person sees; make it lead to a screen or change this one`)
      if (did === 'changed' && newly && path.length === 1) for (const one of newly) deeper.push({ path: [...path, one], name: one.name })
    }
    await pool(toPress.slice(0, PRESSES).map((control) => [control]), AT_ONCE, judged)
    // Controls a press brought out (a panel's, a menu's, a button enabled once a time is picked), pressed once each.
    const seen = new Set()
    const more = deeper.filter(({ path }) => { const last = /** @type {any} */ (path.at(-1)); if (last.to) { lead(screen, last.to); return false } if (seen.has(last.key)) return false; seen.add(last.key); return true }).slice(0, DEEPER)
    await pool(more.map(({ path }) => path), AT_ONCE, judged)
  }
  const reached = [...firsts.keys()]
  for (const screen of screens) if (!firsts.has(screen)) problems.push(`${screen}: nobody reaches it from index.html; lead to it from the screen before`)
  const flow = { screens, reached, followed, pressed, dead: [...new Set(dead)], unsure, leads: /** @type {[string, string[]][]} */ (reached.map((screen) => [screen, [...leads.get(screen) ?? []]])), errors }
  return { flow, firsts, problems: [...new Set([...problems, ...flow.dead])] }
}

/** Every screen reached, at 390 pixels, side by side four to a row, each under its name. @param {{ name: string, shot: Buffer }[]} shots */
async function sheetOf(shots) {
  const [w, h, band, gap, columns] = [292, 633, 30, 16, Math.min(4, shots.length)]
  const rows = Math.ceil(shots.length / columns)
  const escape = (/** @type {string} */ text) => text.replace(/[&<>]/g, (c) => `&#${c.charCodeAt(0)};`)
  const parts = await Promise.all(shots.map(async ({ name, shot }, i) => {
    const [left, top] = [gap + (i % columns) * (w + gap), gap + Math.floor(i / columns) * (h + band + gap)]
    const image = await sharp(shot).resize(w, h, { fit: 'cover', position: 'top' }).png().toBuffer()
    const label = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${band}"><text x="2" y="21" font-family="Helvetica, Arial, sans-serif" font-size="17" fill="#222">${i + 1}. ${escape(name)}</text></svg>`)
    return [{ input: label, left, top }, { input: image, left, top: top + band }]
  }))
  return sharp({ create: { width: gap + columns * (w + gap), height: gap + rows * (h + band + gap), channels: 3, background: '#d9d9d9' } }).composite(parts.flat()).png().toBuffer()
}

/**
 * The check in Chromium: the flow first, then each screen at each width, at the address it was first reached at.
 * @param {import('@playwright/test').Browser} browser @param {Files} files @param {string[]} screens
 * @returns {Promise<{ problems: string[], flow?: Flow, shots?: Report['shots'] }>}
 */
export async function checkInBrowser(browser, files, screens) {
  const problems = /** @type {string[]} */ ([])
  const { origin, close } = await serve(files)
  /** @type {{ name: string, shot: Buffer }[]} */
  const narrow = []
  let wide = /** @type {Buffer | undefined} */ (undefined), flow = /** @type {Flow | undefined} */ (undefined)
  /** @param {number} width */
  const contextAt = async (width) => {
    const context = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 800 }, reducedMotion: 'reduce' })
    // Timers run ten times sooner, so that a screen which leads on after "Sending…" is seen to.
    await context.addInitScript(() => { const later = window.setTimeout; window.setTimeout = /** @type {any} */ ((/** @type {any} */ run, /** @type {number} */ ms = 0, /** @type {any[]} */ ...rest) => later(run, Math.min(ms / 10, 300), ...rest)) })
    const reached = new Set()
    await context.route('**/*', (route) => {
      const url = route.request().url()
      if (url.startsWith(origin)) return route.continue()
      reached.add(new URL(url).host || url.slice(0, 40))
      return route.abort()
    })
    return { context, reached }
  }
  try {
    let firsts = new Map(screens.map((screen) => [screen, `${origin}/${screen}`]))
    if (files.has('index.html')) {
      const { context } = await contextAt(WIDTHS[0])
      try {
        const found = await explore(context, origin, files, screens)
        flow = found.flow
        problems.push(...found.problems)
        firsts = new Map([...firsts, ...found.firsts])
      } finally {
        await context.close()
      }
    }
    const order = [...(flow?.reached ?? []), ...screens.filter((screen) => !flow?.reached.includes(screen))].slice(0, SCREENS)
    for (const width of WIDTHS) {
      const { context, reached } = await contextAt(width)
      try {
        for (const screen of order) {
          const page = await context.newPage()
          const errors = /** @type {string[]} */ ([])
          page.on('pageerror', (error) => errors.push(error.message.split('\n')[0]))
          page.on('console', (message) => { if (message.type() === 'error' && !/Failed to load resource|ERR_FAILED/.test(message.text())) errors.push(message.text().split('\n')[0]) })
          page.on('dialog', (dialog) => dialog.dismiss().catch(() => {}))
          try {
            await page.goto(/** @type {string} */ (firsts.get(screen)), { waitUntil: 'load', timeout: 15_000 })
            await page.waitForTimeout(120)
            for (const at of width === WIDTHS[0] ? [width, NARROWEST] : [width]) {
              if (at !== width) await page.setViewportSize({ width: at, height: 844 })
              const seen = await page.evaluate(() => {
                const wide = document.documentElement.scrollWidth
                let widest = ''
                if (wide > innerWidth + 1) {
                  const over = [...document.body.querySelectorAll('*')].filter((element) => { const box = element.getBoundingClientRect(); return box.width > 0 && (box.right > innerWidth + 1 || box.left < -1) })
                  const leaf = over.find((element) => !over.some((other) => other !== element && element.contains(other))) ?? over[0]
                  if (leaf) widest = `<${leaf.tagName.toLowerCase()}${leaf.id ? ` id="${leaf.id}"` : ''}${leaf.className && typeof leaf.className === 'string' ? ` class="${leaf.className.trim().split(/\s+/).slice(0, 2).join(' ')}"` : ''}> ${Math.round(leaf.getBoundingClientRect().width)} px wide`
                }
                const broken = [...document.images].filter((image) => image.complete && image.naturalWidth === 0 && image.getAttribute('src')).map((image) => image.getAttribute('src'))
                return { wide, widest, broken }
              })
              if (seen.wide > at + 1) problems.push(`${screen}: at ${at} px it scrolls sideways to ${seen.wide} px${seen.widest ? `; ${seen.widest}` : ''}`)
              for (const src of seen.broken) problems.push(`${screen}: the picture ${src} doesn't load`)
              if (at !== width) await page.setViewportSize({ width, height: 844 })
            }
            if (width === WIDTHS[0] && narrow.length < 8 && (!flow || flow.reached.includes(screen))) narrow.push({ name: screen, shot: await page.screenshot() })
            if (width === WIDTHS[1]) {
              await page.addScriptTag({ path: AXE })
              const low = new Set()
              for (const night of [false, true]) {
                await page.emulateMedia({ colorScheme: night ? 'dark' : 'light' })
                const found = await page.evaluate(async () => {
                  // @ts-ignore axe, added just before
                  const result = await axe.run(document, { runOnly: { type: 'rule', values: ['color-contrast'] }, resultTypes: ['violations'] })
                  return result.violations.flatMap((/** @type {any} */ violation) => violation.nodes.map((/** @type {any} */ node) => ({ where: String(node.target[0]), words: String(node.html ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40), data: node.any[0]?.data ?? {} })))
                })
                const when = night ? 'by night, ' : '', more = found.filter((one) => !low.has(one.where))
                for (const one of more) low.add(one.where)
                for (const { where, words, data } of more.slice(0, 3)) problems.push(`${screen}: ${when}${words ? `“${words}” (${where})` : where} has a contrast of ${data.contrastRatio}:1 (${data.fgColor} on ${data.bgColor}), not ${String(data.expectedContrastRatio ?? '4.5').replace(':1', '')}:1`)
                if (more.length > 3) problems.push(`${screen}: ${when}${more.length - 3} more places have too little contrast`)
              }
              await page.emulateMedia({ colorScheme: 'light' })
              if (screen === 'index.html') {
                let height = 0
                for (let tries = 0; tries < 4; tries++) {
                  const next = Math.min(2400, await page.evaluate(() => document.documentElement.scrollHeight))
                  if (next === height) break
                  await page.setViewportSize({ width, height: (height = next) })
                  await page.waitForTimeout(100)
                }
                wide = await page.screenshot()
              }
            }
          } catch (error) {
            problems.push(`${screen}: it didn’t load at ${width} px (${error instanceof Error ? error.message.split('\n')[0] : error})`)
          }
          for (const error of new Set(errors)) problems.push(`${screen}: its script failed: ${error}`)
          await page.close()
        }
      } finally {
        await context.close()
      }
      for (const host of reached) problems.push(`it reached ${host}; a prototype loads nothing from another site`)
    }
  } finally {
    close()
  }
  const sheet = narrow.length ? await sheetOf(narrow) : undefined
  return { problems: [...new Set(problems)], ...(flow && { flow }), ...(wide && sheet && { shots: { wide, sheet } }) }
}

/** The whole check. @param {Files} files @param {import('@playwright/test').Browser} browser @returns {Promise<Report>} */
export async function check(files, browser) {
  const found = checkScreens(files)
  const seen = await checkInBrowser(browser, files, found.pages)
  const more = seen.problems.filter((problem) => { const host = /^it reached ([^;]+);/.exec(problem)?.[1]; return !host || !found.problems.some((one) => one.includes(host)) })
  return { ...found, problems: [...new Set([...found.problems, ...more])], ...(seen.flow && { flow: seen.flow }), ...(seen.shots && { shots: seen.shots }) }
}

/** Whether its flow works: every screen reached from the first, no control that does nothing, no script failing. @param {Report} report */
export const flows = (report) => !!report.flow && report.flow.reached.length >= report.flow.screens.length && !report.flow.dead.length && !report.flow.errors
  && !report.problems.some((problem) => /can't be pressed|isn't in the prototype|nobody reaches it|its script failed/.test(problem))

/** The report as the brain reads it. @param {Report} report @param {{ name: string, place: string }} prototype */
export function told(report, { name, place }) {
  const shown = report.problems.slice(0, 30), flow = report.flow
  return [
    `Prototype "${name}" is at ${place}: ${report.pages.length} ${report.pages.length === 1 ? 'screen' : 'screens'}${report.languages.length ? ` in ${report.languages.join(', ')}` : ''}.`,
    ...(flow ? [`Pressed through at 390 pixels from index.html: ${flow.reached.length} of ${flow.screens.length} screens reached, ${flow.followed} links followed and ${flow.pressed} controls pressed, ${flow.dead.length} doing nothing.`] : []),
    report.problems.length ? `Checked at ${WIDTHS.join(' and ')} pixels, for screen readers: ${report.problems.length} to fix.` : `Checked at ${WIDTHS.join(' and ')} pixels, for screen readers: nothing to fix.`,
    ...shown.map((problem) => `- ${problem}`),
    ...(report.problems.length > shown.length ? [`- and ${report.problems.length - shown.length} more`] : []),
    ...(report.fill.length ? [`Left to fill in: ${report.fill.join('; ')}.`] : []),
  ].join('\n')
}
