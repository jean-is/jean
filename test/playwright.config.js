// Smoke tests, one per capability (AGENTS.md), in a real browser engine: the sandbox needs
// one (an opaque-origin frame running a classic worker). Jean is served as written, or as a web
// deploy serves it with SITE=dist/web after npm run build:web (D318), and a deterministic fake
// brain answers (D37). Each is a <capability>.spec.js, beside the unit tests'
// *.test.js, which node --test runs (D247). Usage: npm run e2e
import { defineConfig, devices } from '@playwright/test'

const APP = 4180
const BRAIN = 4181
const MAIL = 4182
const GATEWAY = 4183
const CSP = 4184
// The gateway (D191) serves Jean's origin, and holds the app the fake mail's closed service registered.
const RELAYED = { origins: [`http://127.0.0.1:${APP}`], hosts: ['127.0.0.1'],
  clients: [{ issuer: `http://127.0.0.1:${MAIL}/closed`, tokenEndpoint: `http://127.0.0.1:${MAIL}/token`, clientId: 'gateway-app', clientSecret: 'gateway-secret' }] }

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.js',
  timeout: 60_000,
  fullyParallel: true,
  // The tests mostly wait, on the fake brain and on timers, so more of them than the default half
  // of the cores run at once; past this, they compete for the processor and flake.
  workers: '85%',
  reporter: 'list',
  // Without motion: Jean's light and face move for as long as a page is open, and with a few
  // pages at once that alone kept the processor busy. Depth's test turns it back on for its pages.
  use: { baseURL: `http://127.0.0.1:${APP}/`, serviceWorkers: 'block', reducedMotion: 'reduce' },
  projects: [
    // Muted: a score's test plays music (WebKit has no such flag: start() in helpers.js silences it).
    { name: 'chromium', use: { ...devices['Desktop Chrome'], launchOptions: { args: ['--mute-audio'] } } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: [
    { command: 'node scripts/serve.js', cwd: '..', port: APP, env: { PORT: String(APP) }, reuseExistingServer: false },
    { command: 'node test/fixtures/fake-brain.js', cwd: '..', port: BRAIN, env: { PORT: String(BRAIN), PACE: process.env.PACE ?? '5' }, reuseExistingServer: false },
    { command: 'node test/fixtures/fake-mail.js', cwd: '..', port: MAIL, env: { PORT: String(MAIL) }, reuseExistingServer: false },
    { command: 'node gateway/serve.js', cwd: '..', port: GATEWAY, env: { PORT: String(GATEWAY), GATEWAY_CONFIG: JSON.stringify(RELAYED) }, reuseExistingServer: false },
    // Jean again, each page's policy also a report-only header that says what it refused (test/csp.spec.js).
    { command: 'node scripts/serve.js --csp-reports', cwd: '..', port: CSP, env: { PORT: String(CSP) }, reuseExistingServer: false },
  ],
})
