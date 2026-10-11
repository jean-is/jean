// Which brain answers outside the browser: the one named (`--brain anthropic`, `openrouter:<name>`,
// `ollama:<name>`, `custom:<name>` with `--address`, `claudecode`, `copilot`, `chatgpt:<name>`), else the
// first whose key the environment holds, else the user's own Claude Code with their Claude plan (D235).
// A plan's brain answers through a bridge (bridge/bridge.js) started here on a free port, as This
// computer's: Copilot is the user's own too, ChatGPT the sign-in Jean's bridge keeps on this computer
// (D262). Keys come from the environment only: none is ever written down.
import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { PROVIDERS } from '../app/core/llm.js'

/** @import { BrainConfig, ProviderId } from '../app/core/types.js' */
/** @typedef {{ brain: BrainConfig, apiKey?: string, close?: () => Promise<void> }} Chosen */

/** Where each provider's key is: `<PROVIDER>_API_KEY`, unless its own tools name it otherwise. @type {Partial<Record<string, string>>} */
const KEYS = { huggingface: 'HF_TOKEN', vercel: 'AI_GATEWAY_API_KEY' }
/** @param {string} id */
export const keyOf = (id) => KEYS[id] ?? `${id.toUpperCase().replace(/\W/g, '_')}_API_KEY`
/** Where each plan's brain answers on the bridge, and its name in errors. @type {Partial<Record<ProviderId, string[]>>} */
const PLANS = { claudecode: ['/v1', 'Claude Code'], copilot: ['/copilot/v1', 'GitHub Copilot'], chatgpt: ['/chatgpt/v1', 'ChatGPT'] }
// Looked for in the environment: not the browser's own, one that needs a Google Cloud project, a
// server on this computer (named), nor a plan's (Claude Code's last); those that have a brain of their own first.
const LOOKED = /** @type {ProviderId[]} */ (Object.keys(PROVIDERS))
  .filter((id) => !['device', 'vertex', 'ollama', 'lmstudio', 'custom'].includes(id) && !PLANS[id])
  .sort((a, b) => Number(!PROVIDERS[a].defaultModel) - Number(!PROVIDERS[b].defaultModel))

/** @param {ProviderId} provider @param {string} model @param {string} [address] @returns {BrainConfig} */
const config = (provider, model, address) => ({ id: `cli-${provider}`, provider, api: PROVIDERS[provider].api, baseURL: address || PROVIDERS[provider].baseURL, model, label: model })

/**
 * @param {{ named?: string, address?: string, env?: Record<string, string | undefined>, claude?: string[] }} options
 *   named: `<provider>[:<name>]`; claude: how Claude Code runs
 * @returns {Promise<Chosen | { needs: string } | null>} needs: the provider whose brain must be named
 */
export async function chooseBrain({ named = '', address, env = process.env, claude = ['claude'] }) {
  const [id, ...rest] = named.split(':')
  const name = rest.join(':')
  if (id) {
    const provider = /** @type {ProviderId} */ (id)
    if (!(provider in PROVIDERS) || provider === 'device') return null
    const model = name || PROVIDERS[provider].defaultModel
    if (PLANS[provider] && model) return planned(provider, model, claude)
    if (!model || !(address || PROVIDERS[provider].baseURL)) return { needs: provider }
    return { brain: config(provider, model, address), apiKey: env[keyOf(provider)] }
  }
  const found = LOOKED.find((provider) => env[keyOf(provider)])
  if (found) {
    const model = PROVIDERS[found].defaultModel
    return model ? { brain: config(found, model), apiKey: env[keyOf(found)] } : { needs: found }
  }
  return (await signedIn(claude)) ? planned('claudecode', 'opus', claude) : null
}

/** Whether Claude Code is here and signed in. @param {string[]} claude */
const signedIn = ([program, ...before]) => new Promise((done) => execFile(program, [...before, 'auth', 'status', '--json'], { timeout: 15_000 }, (_, stdout) => {
  try { done(Boolean(JSON.parse(stdout).loggedIn)) } catch { done(false) }
}))

/**
 * A plan's brain: a bridge of its own on 127.0.0.1, which only this process can call, with a key made
 * for it. @param {ProviderId} provider @param {string} model @param {string[]} claude @returns {Promise<Chosen>}
 */
async function planned(provider, model, claude) {
  const { bridge } = await import('../app/bridge/bridge.js')
  const [path, label] = PLANS[provider] ?? []
  const key = randomUUID()
  const server = createServer()
  await new Promise((ready, failed) => server.once('error', failed).listen(0, '127.0.0.1', () => ready(undefined)))
  const { port } = /** @type {import('node:net').AddressInfo} */ (server.address())
  const work = await bridge({ folder: tmpdir(), origins: [], key, port, claude })
  server.on('request', (req, res) => work.handle(req, res).catch((error) => { if (!res.headersSent) res.writeHead(500).end(String(error?.message ?? error)) }))
  return {
    brain: { id: `cli-${provider}`, provider, api: PROVIDERS[provider].api, baseURL: `http://127.0.0.1:${port}${path}`, model, label },
    apiKey: key,
    close: async () => {
      server.close()
      await work.close()
    },
  }
}
