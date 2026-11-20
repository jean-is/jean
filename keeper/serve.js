// SPDX-License-Identifier: MIT
// Runs the keeper (keeper.js, D762) on Node 22 or later, with nothing to install, writing what it applies in KEEPER_DIR:
//   state.json           the last change applied and the owner's key, the keeper's alone
//   public/policy.json   the company's policy, which Caddy serves beside Jean's files
//   secret/gateway.json  the gateway's configuration, its apps' secrets included, which only the gateway reads
//
//   KEEPER_CONFIG='{"owner":"<base64url of a P-256 key's raw point>","origins":["https://jean.example"]}' KEEPER_DIR=/data node keeper/serve.js
//
// PORT (8792 by default) and HOST (127.0.0.1; 0.0.0.0 to answer other machines) say where it listens.
import { createServer } from 'node:http'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { listener, stopping } from '../gateway/serve.js'
import { keeper } from './keeper.js'

/** Writes a file whole or not at all, so that a reader never sees half of one. @param {string} path @param {string} text @param {number} mode */
async function replace(path, text, mode) {
  const next = `${path}.next`
  await rm(next, { force: true })
  await writeFile(next, text, { mode })
  await rename(next, path)
}

/** The keeper's files in a folder. @param {string} dir @returns {import('./keeper.js').Files} */
export const files = (dir) => ({
  async read() {
    try { return JSON.parse(await readFile(join(dir, 'state.json'), 'utf8')) } catch (error) {
      if (/** @type {NodeJS.ErrnoException} */ (error).code === 'ENOENT') return null
      throw error
    }
  },
  write: (state) => replace(join(dir, 'state.json'), `${JSON.stringify(state)}\n`, 0o600),
  async policy(policy) {
    await mkdir(join(dir, 'public'), { recursive: true })
    await replace(join(dir, 'public', 'policy.json'), `${JSON.stringify(policy, null, 2)}\n`, 0o644)
  },
  async gateway(config) {
    await mkdir(join(dir, 'secret'), { recursive: true, mode: 0o700 })
    await replace(join(dir, 'secret', 'gateway.json'), `${JSON.stringify(config)}\n`, 0o600)
  },
})

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const PORT = Number(process.env.PORT) || 8792
  const HOST = process.env.HOST ?? '127.0.0.1'
  const handle = keeper(JSON.parse(process.env.KEEPER_CONFIG ?? '{}'), files(process.env.KEEPER_DIR ?? '/data'))
  stopping(createServer(listener(handle))).listen(PORT, HOST, () => console.log(`Keeper on http://${HOST}:${PORT}/`))
}
