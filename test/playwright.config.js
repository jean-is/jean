// Smoke tests, one per capability (AGENTS.md), in a real browser engine: the sandbox needs
// one (an opaque-origin frame running a classic worker). Jean is served as written, or as a web
// deploy serves it with SITE=dist/web after npm run build:web (D318), and a deterministic fake
// brain answers (D37). Each is a <capability>.spec.js, beside the unit tests'
// *.test.js, which node --test runs (D247). Usage: npm run e2e
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defineConfig, devices } from '@playwright/test'

const APP = 4180
const BRAIN = 4181
const MAIL = 4182
const GATEWAY = 4183
const CSP = 4184
const SHARE = 4185
const HOME = 4186
// The gateway (D191) serves Jean's origin, and holds the app the fake mail's closed service registered.
// WebKit runs what can differ between engines: frames and the sandbox, storage, editing, the keyboard, media, drawing. These
// specs check what Jean decides, the same JavaScript in every engine (protocols, policy, offers, skills, routines, the site's
// pages through axe), so Chromium alone runs them; discover.spec.js still loads every capability's modules in WebKit. And a
// language's run is Chromium's alone: a language changes the words and the layout, which are style sheets, not the engine's logic.
const CHROMIUM_ONLY = ['about', 'approvals', 'ask', 'audit', 'authority', 'away', 'compact', 'compare', 'delegate', 'demo', 'find', 'flows', 'google',
  'guards', 'help', 'learn', 'lists', 'meaning', 'microsoft', 'notifications', 'panes', 'plan', 'policy', 'reach', 'remember', 'retention', 'signin', 'site', 'steer',
  'thinking', 'you']
const RELAYED = { origins: [`http://127.0.0.1:${APP}`], hosts: ['127.0.0.1'],
  clients: [{ issuer: `http://127.0.0.1:${MAIL}/closed`, tokenEndpoint: `http://127.0.0.1:${MAIL}/token`, clientId: 'gateway-app', clientSecret: 'gateway-secret' }] }

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.js',
  // Not the specs a session leaves among the evals' git-ignored output (test/documents/.cache/…): a config of their own runs
  // them, spreading this one with `testIgnore: []`.
  testIgnore: '**/.cache/**',
  timeout: 60_000,
  fullyParallel: true,
  // The tests mostly wait, on the fake brain and on timers, so more of them than the default half
  // of the cores run at once; past this, they compete for the processor and flake.
  workers: '85%',
  reporter: 'list',
  // Without motion: Jean's light and face move for as long as a page is open, and with a few
  // pages at once that alone kept the processor busy. A test that needs it turns it back on for its page.
  // Service workers blocked: Playwright's script for it reads navigator.serviceWorker in every frame, which throws
  // in an opaque one (a page's, the sandbox's), a page error with no file of Jean's in its stack. A test that
  // reads a page's errors while it has frames blocks nothing (share.spec.js).
  use: { baseURL: `http://127.0.0.1:${APP}/`, serviceWorkers: 'block', reducedMotion: 'reduce' },
  projects: [
    // Muted: a score's test plays music (WebKit has no such flag: start() in helpers.js silences it).
    { name: 'chromium', use: { ...devices['Desktop Chrome'], launchOptions: { args: ['--mute-audio'] } } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] }, testIgnore: ['**/.cache/**', ...CHROMIUM_ONLY.map((name) => `**/${name}.spec.js`)],
      grepInvert: /\((?:[^)]*, )?(?:ar|ja)[,)]|\bin (?:ar|ja|Arabic|Japanese)\b/ },
  ],
  webServer: [
    { command: 'node scripts/serve.js', cwd: '..', port: APP, env: { PORT: String(APP) }, reuseExistingServer: false },
    { command: 'node test/fixtures/fake-brain.js', cwd: '..', port: BRAIN, env: { PORT: String(BRAIN), PACE: process.env.PACE ?? '5' }, reuseExistingServer: false },
    { command: 'node test/fixtures/fake-mail.js', cwd: '..', port: MAIL, env: { PORT: String(MAIL) }, reuseExistingServer: false },
    { command: 'node gateway/serve.js', cwd: '..', port: GATEWAY, env: { PORT: String(GATEWAY), GATEWAY_CONFIG: JSON.stringify(RELAYED) }, reuseExistingServer: false },
    // The share host (D361), for Jean's origin, keeping its shares in a folder of the run's; its viewer from the render package's address, which the test serves.
    { command: 'node scripts/host.js --serve', cwd: '..', port: SHARE, reuseExistingServer: false,
      env: { PORT: String(SHARE), HOST_DIR: join(tmpdir(), `jean-shares-${process.pid}`), HOST_CONFIG: JSON.stringify({ origins: [`http://127.0.0.1:${APP}`], app: `http://127.0.0.1:${APP}/`, legal: 'https://legal.example/', name: 'Jean' }) } },
    // Jean as jean.is's deploy has it, its page under the first screen and its pages in other languages (test/home.spec.js, D397).
    { command: 'node scripts/serve.js --home', cwd: '..', port: HOME, env: { PORT: String(HOME) }, reuseExistingServer: false },
    // Jean again, each page's policy also a report-only header that says what it refused (test/csp.spec.js).
    { command: 'node scripts/serve.js --csp-reports', cwd: '..', port: CSP, env: { PORT: String(CSP) }, reuseExistingServer: false },
  ],
})
