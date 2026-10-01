// Boot: storage, settings, language, default project, then the room.
import { effect } from '@preact/signals-core'
import { BRAND } from '../brand.js'
import { memoryFS } from '../core/fs.js'
import { loadSettings, ensureHome } from '../core/settings.js'
import { setLoader, useLocale, pickLocale, locale, dir } from '../core/i18n.js'
import { ulid } from '../core/ulid.js'
import { opfsFS } from './opfs.js'
import { app, effective, activeBrain, LOCALES, refreshConversations, finishOpenRouter } from './state.js'
import { registerServiceWorker } from './shell.js'

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
  effect(() => { root.dataset.lit = String(activeBrain.value ? (app.conversations.value.length ? 2 : 1) : 0) })

  app.projectDir = await ensureHome(app.fs, { by: app.deviceId })
  await refreshConversations()
  app.fs.watch?.(() => refreshConversations())

  document.body.append(document.createElement('app-shell'))
  root.classList.add('is-ready')
  await finishOpenRouter()
  registerServiceWorker()
}

start().catch((error) => {
  console.error(error)
  document.body.dataset.failed = 'true'
})
