// Boot: storage, settings, language, default project, then the room.
import { effect } from '@preact/signals-core'
import { BRAND } from '../brand.js'
import { memoryFS } from '../core/fs.js'
import { loadSettings, ensureHome, listProjects } from '../core/settings.js'
import { setLoader, useLocale, pickLocale, locale, dir } from '../core/i18n.js'
import { ulid } from '../core/ulid.js'
import { opfsFS, mine } from './opfs.js'
import { app, effective, activeBrain, theme, sidebarOpen, THEME_KEY, SIDEBAR_KEY, SEEN_KEY, AWAY_MS, LOCALES, refreshConversations, refreshProjects, rememberUnlocked, send } from './state.js'
import { LOOKS, LOOK_KEY, lookId, touched } from './looks.js'
import { configureCapabilities, unlock, loaded } from './caps.js'
import './shell.js'
import { focusComposer } from './composer.js'
import { startRouter } from './router.js'

// The desktop app's key, taken before any other page asks (D169, D211), and its addresses (D260).
const nearby = location.hostname === '127.0.0.1' ? import('./host.js').then((host) => host.addresses()).catch(() => []) : []
// Titles show as tips (D233), loaded by the first pointer or focus.
for (const type of ['pointerover', 'focusin']) addEventListener(type, (event) => import('./tips.js').then((tips) => tips.first(event)), { once: true })

async function start() {
  // Plain HTTP reaches this computer alone (D260).
  const reach = ['localhost', '127.0.0.1', ...await nearby]
  document.head.append(Object.assign(document.createElement('meta'), { httpEquiv: 'Content-Security-Policy', content: `connect-src 'self' https: wss: ${reach.map((name) => `http://${name}:*`).join(' ')}` }))
  setLoader(async (lang, part) => {
    const response = await fetch(`locales/${part && `${part}/`}${lang}.json`)
    return response.ok ? response.json() : null
  })
  const fs = await opfsFS().catch(() => null)
  app.fs = fs ?? memoryFS()
  app.whole = fs?.whole ?? null
  app.ephemeral.value = !fs
  if (!fs) sessionStorage.removeItem('app.profile')
  app.deviceId = localStorage.getItem('app.device') ?? ulid()
  localStorage.setItem('app.device', app.deviceId)
  // Organisations opt in with <meta name="app-policy"> (docs/enterprise.md). The last one read
  // holds while the site can't be reached, so what one set never comes undone.
  const policyURL = document.querySelector('meta[name="app-policy"]')?.getAttribute('content') ?? ''
  const kept = policyURL ? await globalThis.caches?.open('app-policy').catch(() => undefined) : undefined
  const fresh = policyURL ? await fetch(policyURL).then((response) => (response.ok ? response : null), () => null) : null
  ;(fresh && kept?.put(policyURL, fresh.clone()))?.catch(() => {})
  const policy = fresh ?? await kept?.match(policyURL)
  app.policy = policy ? await policy.json().catch(() => ({})) : {}
  // As it is for the person signed in, by their groups (D429) and places (D434).
  if (app.policy.groups || app.policy.jurisdictions) await import('../caps/enterprise/enterprise.js').then((m) => m.groups(), console.warn)
  // Several profiles here (D228): their menu, and in a child's, what a parent set, in policy's shape.
  if (fs && (await fs.whole.list('profiles')).length > 1) await unlock('profiles')
  app.settings.value = await loadSettings(app.fs)
  // Policy names capabilities by today's ids: `routines` are the tasks on a schedule (D122).
  const [deny, preUnlock] = ['deny', 'preUnlock'].map((list) => /** @type {string[]} */ (app.policy.capabilities?.[list] ?? []))
  configureCapabilities({ deny: [...deny, ...app.settings.value.off ?? []], remember: rememberUnlocked }) // and what the user turned off (D433)

  // On a language's own address on jean.is, its language, unless one was chosen (D397).
  const asked = document.querySelector('meta[name="app-language"]')?.getAttribute('content')
  await useLocale(effective.value.settings.locale ?? pickLocale(LOCALES, asked ? [asked] : navigator.languages))
  // The organisation's sign-in (D385), then ee/ (D139).
  if (app.policy.signIn) await import('../caps/signin/signin.js').then((m) => m.start(), console.warn)
  if (['key', 'audit', 'retention', 'groups', 'jurisdictions', 'seal', 'trust'].some((part) => part in app.policy)) await import('../caps/enterprise/enterprise.js').then((m) => m.start(), console.warn)

  const root = document.documentElement
  effect(() => {
    Object.assign(root, { lang: locale.value, dir: dir(locale.value) })
    // The install dialog's screenshots in Jean's language (D396): index.html names English's.
    document.querySelector('link[rel="manifest"]')?.setAttribute('href', locale.value === 'en' ? 'manifest.webmanifest' : `manifests/${locale.value}.webmanifest`)
    document.title = locale.value === (asked ?? 'en') && document.title || BRAND.name
  })
  effect(() => { root.dataset.presence = app.presence.value })
  // Light or dark: the device's, until the user picks the other (index.html applies it before the
  // first paint), switched at once, or the text would change colour before the room's fade.
  // Printing says light, and the print sheet makes the paper light: the screen stays as it was.
  const daylight = matchMedia('(prefers-color-scheme: light)')
  const printing = matchMedia('print')
  const follow = () => { if (!printing.matches) app.deviceTheme.value = daylight.matches ? 'light' : 'dark' }
  daylight.addEventListener('change', follow)
  follow()
  const chosen = localStorage.getItem(mine(THEME_KEY))
  app.chosenTheme.value = chosen === 'light' || chosen === 'dark' ? chosen : null
  const browserBar = document.querySelector('meta[name="theme-color"]')
  app.look.value = lookId(root.dataset.look ?? 'room')
  effect(() => {
    root.style.transition = 'none'
    root.dataset.theme = theme.value
    if (app.look.value === 'room') delete root.dataset.look
    else root.dataset.look = app.look.value
    void getComputedStyle(root).backgroundColor // switched, before the fade comes back
    root.style.removeProperty('transition')
    browserBar?.setAttribute('content', LOOKS[app.look.value].bar[theme.value === 'light' ? 1 : 0])
  })
  // On a wide window the drawer stays as the user left it (D165).
  const wide = matchMedia('(min-width: 48rem)')
  const measure = () => { app.wide.value = wide.matches }
  wide.addEventListener('change', measure)
  measure()
  const side = localStorage.getItem(mine(SIDEBAR_KEY))
  app.sidebar.value = side === 'open' ? true : side === 'closed' ? false : null
  effect(() => { root.toggleAttribute('data-sidebar', sidebarOpen.value) })
  // A look (D111) switches once its sheet is in. Its id, the room's too, stays for index.html,
  // since a device without one starts in Tilde (D373); the user's touches go over it in a sheet
  // of their own (CSSOM), their code loaded once there are some.
  let dressing = Promise.resolve()
  effect(() => {
    const id = lookId(effective.value.settings.look?.id)
    localStorage.setItem(mine(LOOK_KEY), id)
    dressing = lookSheet(id).then(() => { if (id === lookId(app.settings.value.look?.id)) app.look.value = id })
  })
  const touches = new CSSStyleSheet()
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, touches]
  let touching = Promise.resolve()
  effect(() => {
    if (!touched(effective.value.settings.look)) {
      touches.replaceSync('')
      return
    }
    touching = import('./touches.js').then(({ customCSS }) => touches.replaceSync(customCSS(effective.peek().settings.look)))
  })
  await Promise.all([dressing, touching])
  // The room warms a step with each discovery (docs/design.md): a brain, a first
  // conversation, then every capability, but not what is always there (CSSOM, as above).
  effect(() => {
    const discovered = [...loaded.value.keys()].filter((id) => !['discovery', 'voice', 'ask', 'you', 'signin', 'audit', 'groups', 'authority', 'residency'].includes(id)).length
    root.style.setProperty('--warmth', String((activeBrain.value ? 1 : 0) + (app.conversations.value.length ? 1 : 0) + discovered))
  })

  const home = await ensureHome(app.fs, { by: app.deviceId })
  app.projects.value = await listProjects(app.fs)
  app.project.value = app.projects.value.find((project) => project.dir === home) ?? app.project.value
  // A project's light tints the little light and the room (D78), any CSS colour from project.md.
  effect(() => {
    const colour = app.project.value.data.colour
    if (typeof colour === 'string' && CSS.supports('color', colour)) root.style.setProperty('--tint', colour)
    else root.style.removeProperty('--tint')
  })
  await refreshConversations()
  await startRouter()
  app.fs.watch?.((path) => (path.endsWith('project.md') ? refreshProjects() : refreshConversations()))

  // Opened after time away: "Since last time" (an event with no language), each device its own.
  const seen = Number(localStorage.getItem(mine(SEEN_KEY))) || 0
  if (seen && Date.now() - seen > AWAY_MS) app.back.value = seen
  const stamp = () => localStorage.setItem(mine(SEEN_KEY), String(Date.now()))
  stamp()
  addEventListener('pagehide', stamp)
  document.addEventListener('visibilitychange', stamp)

  // First, before what jean.is has under it (D397).
  document.body.prepend(document.createElement('app-shell'))
  root.classList.add('is-ready')
  // The box has the keyboard, but not on a touchscreen, where it would cover the welcome.
  if (matchMedia('(pointer: fine)').matches) focusComposer()
  // What the user discovered (and policy unlocks) comes back, after first paint.
  app.ready = Promise.all([import('./discovery.js'), ...[...new Set([...app.settings.value.unlocked, ...preUnlock])].map(unlock)])
  // A search from the browser's bar (D353) is sent, the family page's ?child begins a profile (D424),
  // or back from signing in: to a connection (?state=…), or to OpenRouter or ChatGPT.
  const back = new URLSearchParams(location.search)
  if (back.has('q')) { history.replaceState(null, '', location.pathname + location.hash); send(back.get('q') ?? '') }
  else if (back.has('child')) { history.replaceState(null, '', location.pathname + location.hash); if (!app.ephemeral.value && await unlock('profiles')) (await import('../caps/profiles/dialog.js')).open(true) }
  else if (!(back.has('state') && await (await import('../caps/connections/connections.js')).finishSignIn()) && back.size) await (await import('./brains.js')).finishSignIn()
  // Watching for a new version, or finishing to bring one in.
  import('./update.js').then((update) => update.start())
}

/**
 * A look's style sheet, loaded once (index.html adds the first). It goes before ui/style.css,
 * whose rules it outranks with :root[data-look]; ties go to the room's (print, more contrast).
 * @param {import('./looks.js').LookId} id
 */
function lookSheet(id) {
  const href = `ui/looks/${id}.css`
  if (id === 'room' || [...document.styleSheets].some((sheet) => sheet.href?.endsWith(href))) return Promise.resolve()
  const link = Object.assign(document.createElement('link'), { rel: 'stylesheet', href })
  const loaded = new Promise((resolve) => {
    link.addEventListener('load', resolve, { once: true })
    link.addEventListener('error', resolve, { once: true })
  })
  document.querySelector('link[href="ui/style.css"]')?.before(link)
  return loaded
}

start().catch((error) => {
  console.error(error)
  document.body.dataset.failed = 'true'
})
