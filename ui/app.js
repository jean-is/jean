// Boot: storage, settings, language, default project, then the room.
import { effect } from '@preact/signals-core'
import { BRAND } from '../brand.js'
import { memoryFS } from '../core/fs.js'
import { loadSettings, ensureHome, listProjects } from '../core/settings.js'
import { setLoader, useLocale, pickLocale, locale, dir } from '../core/i18n.js'
import { ulid } from '../core/ulid.js'
import { opfsFS } from './opfs.js'
import { app, effective, activeBrain, LOCALES, refreshConversations, refreshProjects, rememberUnlocked } from './state.js'
import { configureCapabilities, unlock, loaded } from './caps.js'
import { registerServiceWorker } from './shell.js'
import { startRouter } from './router.js'

async function start() {
  const fs = await opfsFS().catch(() => null)
  app.fs = fs ?? memoryFS()
  app.ephemeral.value = !fs
  app.deviceId = localStorage.getItem('app.device') ?? ulid()
  localStorage.setItem('app.device', app.deviceId)
  // Organisations opt in with <meta name="app-policy" content="policy.json"> (see docs/enterprise.md).
  const policyURL = document.querySelector('meta[name="app-policy"]')?.getAttribute('content')
  app.policy = policyURL ? await fetch(policyURL).then((response) => (response.ok ? response.json() : {})).catch(() => ({})) : {}
  app.settings.value = await loadSettings(app.fs)
  const { deny = [], preUnlock = [] } = app.policy.capabilities ?? {}
  configureCapabilities({ deny, remember: rememberUnlocked })

  setLoader(async (lang) => {
    const response = await fetch(`locales/${lang}.json`)
    return response.ok ? response.json() : null
  })
  await useLocale(effective.value.settings.locale ?? pickLocale(LOCALES, navigator.languages))

  const root = document.documentElement
  document.title = BRAND.name
  effect(() => {
    root.lang = locale.value
    root.dir = dir(locale.value)
  })
  effect(() => { root.dataset.presence = app.presence.value })
  // The room warms a step with each discovery (docs/design.md): a brain, a first
  // conversation, then every capability (CSSOM, which the CSP allows; style attributes it doesn't).
  effect(() => {
    const discovered = [...loaded.value.keys()].filter((id) => id !== 'discovery' && id !== 'voice').length
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

  document.body.append(document.createElement('app-shell'))
  root.classList.add('is-ready')
  // What the user discovered before (and what policy unlocks) comes back, after first paint.
  app.ready = Promise.all([import('./discovery.js'), ...[...new Set([...app.settings.value.unlocked, ...preUnlock])].map(unlock)])
  // Back from the OpenRouter sign-in with ?code=…
  if (new URLSearchParams(location.search).has('code')) await (await import('./brains.js')).finishOpenRouter()
  registerServiceWorker()
}

start().catch((error) => {
  console.error(error)
  document.body.dataset.failed = 'true'
})
