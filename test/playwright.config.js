// Smoke tests, one per capability (AGENTS.md), in a real browser engine: the sandbox needs
// one (an opaque-origin frame running a classic worker). Jean is served as written, or as a web
// deploy serves it with SITE=dist/web after npm run build:web (D318), and a deterministic fake
// brain answers (D37). Each is a <capability>.spec.js, beside the unit tests'
// *.test.js, which node --test runs (D247). Usage: npm run e2e
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defineConfig, devices } from '@playwright/test'
import { ISSUER, JWKS, POLICY } from './fixtures/fake-issuer.js'

const APP = 4180
const BRAIN = 4181
const MAIL = 4182
const GATEWAY = 4183
const CSP = 4184
const SHARE = 4185
const HOME = 4186
const RELAY = 4187
// The gateway (D191) serves Jean's origin, and holds the app the fake mail's closed service registered.
// WebKit runs what can differ between engines: frames and the sandbox, storage, editing, the keyboard, media, drawing. These
// specs check what Jean decides, the same JavaScript in every engine (protocols, policy, offers, skills, routines, the site's
// pages through axe), so Chromium alone runs them; discover.spec.js still loads every capability's modules in WebKit. And a
// language's run is Chromium's alone: a language changes the words and the layout, which are style sheets, not the engine's logic.
const CHROMIUM_ONLY = ['out', 'people', 'colleagues', 'about', 'approvals', 'ask', 'audit', 'authority', 'away', 'compact', 'compare', 'delegate', 'demo', 'dlp', 'find', 'flows', 'google', 'session',
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
  // Longer than Playwright's 5 s: what these wait for is never a matter of time, and on a busy runner a page's slower steps take that long.
  expect: { timeout: 10_000 },
  fullyParallel: true,
  // Half of the cores, Playwright's own default, said here because each worker's browser takes several: at 85% a run took
  // hardly less time, the processor well over-committed, and tests that wait on timers failed by the handful.
  workers: '50%',
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
    // The share host (D361), for Jean's origin, keeping its shares in a folder of the run's; its viewer from the render package's address, which the test serves,
    // under /s/ as jean.is's, so that each link made at its root opens there.
    { command: 'node scripts/host.js --serve', cwd: '..', port: SHARE, reuseExistingServer: false,
      env: { PORT: String(SHARE), HOST_DIR: join(tmpdir(), `jean-shares-${process.pid}`), HOST_CONFIG: JSON.stringify({ origins: [`http://127.0.0.1:${APP}`], app: `http://127.0.0.1:${APP}/`, legal: 'https://legal.example/', name: 'Jean', shares: `http://127.0.0.1:${SHARE}/s/`, sites: { address: `http://{name}.localhost:${SHARE}/` } }) } },
    // The relay (D45 · D226), for Jean's origin by either name, keeping its mailboxes in a folder of the run's (test/devices.spec.js). Every
    // device of every test opens mailboxes from this one address, past the hour's limit a network has.
    { command: 'node relay/serve.js', cwd: '..', port: RELAY, reuseExistingServer: false,
      env: { PORT: String(RELAY), RELAY_DIR: join(tmpdir(), `jean-mailboxes-${process.pid}`), RELAY_CONFIG: JSON.stringify({ origins: [`http://127.0.0.1:${APP}`, `http://localhost:${APP}`], limits: { opens: 10_000 }, stores: { made: 10_000 }, journals: { opens: 10_000 },
        // The fake organisation's people, by the ID tokens its sign-in signs (test/colleagues.spec.js, D731).
        issuers: [{ issuer: ISSUER, audience: POLICY.signIn.clientId, jwks: JWKS }] }) } },
    // Jean as jean.is's deploy has it, its page under the first screen and its pages in other languages (test/home.spec.js, D397).
    { command: 'node scripts/serve.js --home', cwd: '..', port: HOME, env: { PORT: String(HOME) }, reuseExistingServer: false },
    // Jean again, each page's policy also a report-only header that says what it refused (test/csp.spec.js).
    { command: 'node scripts/serve.js --csp-reports', cwd: '..', port: CSP, env: { PORT: String(CSP) }, reuseExistingServer: false },
  ],
})
