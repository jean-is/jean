#!/usr/bin/env node
// jean-cli (D241): Jean beside a terminal. `jean-cli acp` is Jean inside an editor that speaks ACP
// (cli/acp.js), on the folder Sync keeps, ~/Jean unless --folder names another; `jean-cli --login`
// signs in to Claude Code, in the terminal an editor opens for it; `jean-cli gateway` runs the
// gateway (D191) on this computer, for the services a browser can't reach. Its words are
// cli/locales/'s, in the language the terminal is set to.
import { spawn } from 'node:child_process'
import { readdir, readFile, realpath } from 'node:fs/promises'
import { createServer } from 'node:http'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { BRAND } from '../app/brand.js'
import { pickLocale, setLoader, t, useLocale, useStrings } from '../app/core/i18n.js'

const ROOT = new URL('../', import.meta.url)
/** The folder Sync keeps, unless --folder names another. */
const FOLDER = '~/Jean'

/** The languages the terminal asks for: its LC_ALL, LC_MESSAGES or LANG ("fr_FR.UTF-8"), then the system's. @param {Record<string, string | undefined>} env */
export function wanted(env) {
  const named = [env.LC_ALL, env.LC_MESSAGES, env.LANG].find((value) => value && !/^(C|POSIX)([.@]|$)/.test(value))
  return [...(named ? [named.split(/[.@]/)[0].replace('_', '-')] : []), Intl.DateTimeFormat().resolvedOptions().locale]
}

/** The gateway's configuration: GATEWAY_CONFIG's, where its secrets stay, with the origins the line names. @param {Record<string, string | undefined>} env @param {string[]} [origins] */
export function gatewayConfig(env, origins = []) {
  const config = JSON.parse(env.GATEWAY_CONFIG || '{}')
  return { ...config, origins: [...new Set([...(config.origins ?? []), ...origins])] }
}

/** @param {string[]} argv @param {Record<string, string | undefined>} [env] */
export async function main(argv, env = process.env) {
  const { values, positionals } = parseArgs({ args: argv, allowPositionals: true, options: {
    folder: { type: 'string' }, brain: { type: 'string' }, address: { type: 'string' },
    origin: { type: 'string', multiple: true }, port: { type: 'string' }, host: { type: 'string' },
    login: { type: 'boolean' }, version: { type: 'boolean', short: 'v' }, help: { type: 'boolean', short: 'h' },
  } })
  const { version } = JSON.parse(await readFile(new URL('package.json', ROOT), 'utf8'))
  if (values.version) return console.log(version)
  setLoader(async (lang, part) => (part === 'cli' ? JSON.parse(await readFile(new URL(`locales/${lang}.json`, import.meta.url), 'utf8')) : null))
  await useLocale(pickLocale((await readdir(new URL('locales/', import.meta.url))).map((file) => file.replace(/\.json$/, '')), wanted(env)))
  await useStrings('cli')
  const [command] = positionals
  // ACP adds a terminal sign-in's arguments to the editor's own (`acp --login`); an older editor puts them in their place.
  if (values.login) return login(env)
  if (command === 'acp' && !values.help) return acp(values, version, env)
  if (command === 'gateway' && !values.help) return gateway(values, env)
  console.log([
    `${BRAND.name} ${version}`,
    '',
    `  npx jean-cli acp [--folder ${FOLDER}] [--brain <brain>]`,
    `      ${t('cli.help.acp', { name: BRAND.name })}`,
    `      ${t('cli.help.brain')}`,
    '  npx jean-cli --login',
    `      ${t('cli.signIn')}`,
    '  npx jean-cli gateway --origin <address> [--port 8787] [--host 127.0.0.1]',
    `      ${t('cli.help.gateway')}`,
  ].join('\n'))
}

/**
 * Jean for an editor, on its input and output, until the editor closes them.
 * @param {{ folder?: string, brain?: string, address?: string }} values @param {string} version @param {Record<string, string | undefined>} env
 */
async function acp(values, version, env) {
  // The output is the editor's: anything else goes to the error stream, which editors keep as a log.
  console.log = console.info = console.debug = console.error
  const { agent } = await import('./acp.js')
  const folder = resolve((values.folder ?? FOLDER).replace(/^~(?=$|\/)/, homedir()))
  await agent({ input: process.stdin, write: (line) => process.stdout.write(line), folder, brain: values.brain, address: values.address, version, env }).closed
  process.exit(0)
}

/**
 * Claude Code's own sign-in, the brain that answers when the environment holds no key, in the
 * terminal it was started in; its exit code is the sign-in's, which the editor reads.
 * @param {Record<string, string | undefined>} env @returns {Promise<number>}
 */
function login(env) {
  return new Promise((done) => spawn('claude', ['auth', 'login'], { stdio: 'inherit', env })
    .once('error', () => {
      console.error(t('cli.login.missing'))
      done(1)
    })
    .once('exit', (code) => done(code ?? 1)))
}

/** @param {{ origin?: string[], port?: string, host?: string }} values @param {Record<string, string | undefined>} env */
async function gateway(values, env) {
  const config = gatewayConfig(env, values.origin)
  if (!config.origins.length) throw new Error(t('cli.gateway.origin', { domain: BRAND.domain }))
  const [{ gateway: handler }, { listener }] = await Promise.all([import('../gateway/gateway.js'), import('../gateway/serve.js')])
  const port = Number(values.port ?? env.PORT) || 8787
  const host = values.host ?? env.HOST ?? '127.0.0.1'
  const server = createServer(listener(handler(config)))
  await new Promise((ready, failed) => server.once('error', failed).listen(port, host, () => ready(undefined)))
  console.log(t('cli.gateway.ready', { address: `http://${host.includes(':') ? `[${host}]` : host}:${port}/` }))
}

// Run as a program, by its path or through npm's link to it.
if (process.argv[1] && await realpath(process.argv[1]).then((path) => path === fileURLToPath(import.meta.url), () => false)) {
  main(process.argv.slice(2)).then((code) => { if (typeof code === 'number') process.exitCode = code }).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
