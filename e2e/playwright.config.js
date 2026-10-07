// Smoke tests, one per capability (AGENTS.md), in a real browser engine: the sandbox needs
// one (an opaque-origin frame running a classic worker). Jean is served as written, and a
// deterministic fake brain answers (D37). Usage: npm run e2e
import { defineConfig, devices } from '@playwright/test'

const APP = 4180
const BRAIN = 4181
const MAIL = 4182
const GATEWAY = 4183
// The gateway (D191) serves Jean's origin, and holds the app the fake mail's closed service registered.
const RELAYED = { origins: [`http://127.0.0.1:${APP}`], hosts: ['127.0.0.1'],
  clients: [{ issuer: `http://127.0.0.1:${MAIL}/closed`, tokenEndpoint: `http://127.0.0.1:${MAIL}/token`, clientId: 'gateway-app', clientSecret: 'gateway-secret' }] }

export default defineConfig({
  testDir: '.',
  timeout: 60_000,
  fullyParallel: true,
  reporter: 'list',
  use: { baseURL: `http://127.0.0.1:${APP}/`, serviceWorkers: 'block' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: [
    { command: 'node scripts/serve.js', cwd: '..', port: APP, env: { PORT: String(APP) }, reuseExistingServer: false },
    { command: 'node test/fixtures/fake-brain.js', cwd: '..', port: BRAIN, env: { PORT: String(BRAIN) }, reuseExistingServer: false },
    { command: 'node test/fixtures/fake-mail.js', cwd: '..', port: MAIL, env: { PORT: String(MAIL) }, reuseExistingServer: false },
    { command: 'node gateway/serve.js', cwd: '..', port: GATEWAY, env: { PORT: String(GATEWAY), GATEWAY_CONFIG: JSON.stringify(RELAYED) }, reuseExistingServer: false },
  ],
})
