// npm run csp: the pages' policies checked (csp.spec.js) in every engine this computer has, beyond the
// smoke tests' Chromium and WebKit: Firefox (once: npx playwright install firefox), and Chrome and
// Edge themselves where they are installed. Safari itself has no Playwright: scripts/serve.js
// --csp-reports says what it refuses as anyone uses Jean there.
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { devices } from '@playwright/test'
import base from './playwright.config.js'

/** Where each browser installs itself, by system. */
const PLACES = {
  chrome: ['/Applications/Google Chrome.app', '/opt/google/chrome/chrome', join(process.env.PROGRAMFILES ?? '', 'Google/Chrome/Application/chrome.exe')],
  msedge: ['/Applications/Microsoft Edge.app', '/opt/microsoft/msedge/msedge', join(process.env['PROGRAMFILES(X86)'] ?? '', 'Microsoft/Edge/Application/msedge.exe')],
}

export default {
  ...base,
  testMatch: 'csp.spec.js',
  projects: [
    ...(base.projects ?? []),
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    ...Object.entries(PLACES).filter(([, places]) => places.some((place) => existsSync(place)))
      .map(([channel]) => ({ name: channel, use: { ...devices['Desktop Chrome'], channel } })),
  ],
}
