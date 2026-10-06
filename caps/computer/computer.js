// The Computer (D162): a computer of Jean's own, in a sandbox in this tab, never the user's machine.
// Calculations and the data toolkit fold into it (D13, D48, D80): `javascript` (QuickJS, codemode),
// `python` (Pyodide) and `bash` (just-bash, with python3, pip and node as commands) run in one worker
// (computer-worker.js), each conversation on a computer of its own. /workspace is the conversation's
// folder (Folders) or else its project's workspace (`<project>/workspace/`), brought up to date
// before each run (mount.js); what a run changed there is kept after it through `save_workspace`,
// which asks first, with the diff, in the user's folder. The computer reaches the internet through
// Jean only, as Settings › Computer and policy allow (net.js): a new site is asked about first.
import { html, nothing } from 'lit-html'
import { signal, effect } from '@preact/signals-core'
import { register, loaded } from '../../ui/caps.js'
import { sandbox } from '../../ui/sandbox.js'
import { Element, define } from '../../ui/base.js'
import { app, conversationOf, updateSettings } from '../../ui/state.js'
import { getSecret, setSecret, deleteSecret } from '../../ui/secrets.js'
import { icons } from '../../ui/icons.js'
import { serviceURL } from '../../core/settings.js'
import { join, walk } from '../../core/fs.js'
import { addFile, sha256Hex } from '../../core/files.js'
import { callsIn, filesMade, nextVersion } from '../../core/events.js'
import { t, tParts, useStrings, locale } from '../../core/i18n.js'
import { memoryTotal } from '../../ui/host.js'
import { computerRights, judge, registryOf, reach, REGISTRIES } from './net.js'
import { outgoing, incoming, preview, decline, within } from './mount.js'
import { exactText } from '../folders/work.js'
import { sitePage } from '../folders/site.js'
import { imageTool } from './images.js'

/** @typedef {import('../../core/loop.js').Tool} Tool */
/** @typedef {import('../../core/loop.js').ToolContext} ToolContext */
/** @typedef {import('./net.js').ComputerSettings} ComputerSettings */

await useStrings('computer')

// The shell comes with every run (its files are the computer's); QuickJS and Pyodide when one needs them.
const box = sandbox({
  capability: 'computer',
  worker: new URL('./computer-worker.js', import.meta.url),
  page: new URL('../../sandbox.html', import.meta.url),
  engines: {
    shell: { runtime: 'vendor/just-bash/', bootMs: 20_000 },
    quickjs: { runtime: 'vendor/quickjs/', bootMs: 20_000 },
    pyodide: { runtime: 'vendor/pyodide/', bootMs: 60_000 },
  },
})

// 64 MB of memory and 20 s of computing time for a JavaScript script (waiting on Jean or on the
// user doesn't count), 6,000 characters of log, 8,000 of output (D65).
const SCRIPT = { memory: 64 * 1024 * 1024, cpu: 20_000, output: 6000 }
const MAX_OUTPUT = 8000

/** Settings › Computer, under policy, with the registries' default addresses. */
const rightsNow = () => computerRights(app.settings.value, app.policy, Object.fromEntries(REGISTRIES.map((kind) => [kind, serviceURL(kind, app.settings.value, app.policy)])))

// ─── /workspace ──────────────────────────────────────────────────────────────

/**
 * What each conversation's computer holds of its /workspace: in which sandbox (its epoch), of what
 * (a folder, or a project's workspace), file by file.
 * @type {Map<string, { epoch: number, of: string, held: import('./mount.js').Held }>}
 */
const holding = new Map()

/** The conversation's /workspace: its folder, open (Folders), or else its project's workspace. @param {AbortSignal | undefined} signal */
async function mountOf(signal) {
  const conversation = conversationOf(signal)
  const folders = loaded.peek().has('folders') ? await import('../folders/folders.js') : null
  const open = await folders?.computerFolder(signal)
  if (open) return { of: `folder:${open.folder.name}`, fs: open.fs, folder: open.folder, always: open.always, conversation, project: '' }
  const project = conversation?.path?.replace(/\/conversations\/[^/]*$/, '') || app.projectDir
  return { of: `workspace:${project}`, fs: within(app.fs, join(project, 'workspace')), folder: null, always: true, conversation, project }
}

/** Before a run, in a folder not open yet: Folders' card, whose click lets the browser open it (D141). @param {any} args @param {ToolContext} ctx */
const opening = async (args, ctx) => (loaded.peek().has('folders') ? (await import('../folders/folders.js')).opening(args, ctx) : undefined)

/** Changes waiting to be kept, by batch. @type {Map<string, { changes: { put: Record<string, ArrayBuffer>, gone: string[] }, mount: Awaited<ReturnType<typeof mountOf>>, held: import('./mount.js').Held }>} */
const batches = new Map()

/** Each computer's last run: the brain's, a helper's and the user's in the terminal take turns on its shell (D166). @type {Map<string, Promise<unknown>>} */
const turns = new Map()

/**
 * Runs a message on the conversation's computer, once its run before has ended: /workspace brought
 * up to date first, the internet reached through `online`, and what changed in /workspace kept after.
 * @param {{ engine: string } & Record<string, any>} message @param {ToolContext} ctx
 * @returns {Promise<{ done: any, left: string[], kept: string }>}
 */
async function execute(message, ctx) {
  const mount = await mountOf(ctx.signal)
  const key = mount.conversation?.id ?? 'none'
  const before = turns.get(key)
  const turn = (async () => {
    await before?.catch(() => {})
    if (ctx.signal?.aborted) throw new Error('Stopped.')
    return executeNow(message, ctx, mount, key)
  })()
  turns.set(key, turn)
  try {
    return await turn
  } finally {
    if (turns.get(key) === turn) turns.delete(key)
  }
}

/** @param {{ engine: string } & Record<string, any>} message @param {ToolContext} ctx @param {Awaited<ReturnType<typeof mountOf>>} mount @param {string} key */
async function executeNow(message, ctx, mount, key) {
  const { rights, relay } = rightsNow()
  const what = String(message.command ?? message.code ?? '').trim().split('\n')[0].slice(0, 120)
  /** @type {{ epoch: number, of: string, held: import('./mount.js').Held }} */
  let state = { epoch: 0, of: '', held: new Map() }
  /** @type {string[]} */
  let left = []
  /** Sites asked about in this run, and the answer. @type {Map<string, Promise<string>>} */
  const asked = new Map()
  const done = await box.execute({ ...message, computer: key, registries: rights.registries, limits: { ...message.limits, time: rights.timeMs } }, ctx, {
    quietMs: message.engine === 'shell' ? rights.timeMs + 20_000 : undefined,
    prepare: async (epoch) => {
      const known = holding.get(key)
      // Another folder in the same sandbox: its /workspace is emptied first.
      const fresh = known?.epoch === epoch && known.of !== mount.of
      state = known && known.epoch === epoch && !fresh ? known : { epoch, of: mount.of, held: new Map() }
      holding.set(key, state)
      const sent = await outgoing(mount.fs, state.held, { limit: rights.workspaceMB * 1e6 })
      left = sent.left
      return { put: sent.put, gone: sent.gone, fresh }
    },
    handle: (request) => online(request, ctx, { rights, relay, asked, what }),
  })
  return { done, left, kept: await keep(done.changes, mount, state.held, ctx) }
}

/** What a run changed in /workspace, kept through `save_workspace` (asked first in the user's folder). @param {any} changes @param {Awaited<ReturnType<typeof mountOf>>} mount @param {import('./mount.js').Held} held @param {ToolContext} ctx */
async function keep(changes, mount, held, ctx) {
  if (!changes || (!Object.keys(changes.put).length && !changes.gone.length)) return ''
  const batch = crypto.randomUUID()
  batches.set(batch, { changes, mount, held })
  try {
    return await ctx.call('save_workspace', { batch, files: Object.keys(changes.put), removed: changes.gone })
  } catch (error) {
    decline(held, changes)
    return `What changed in /workspace was not kept: ${error instanceof Error ? error.message : String(error)}`
  } finally {
    batches.delete(batch)
  }
}

/** What the preview shows, pages and pictures first (those open by themselves), by extension, with its type. */
const SHOWN = /** @type {Record<string, string>} */ ({ html: 'text/html', htm: 'text/html', svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', pdf: 'application/pdf',
  csv: 'text/csv', tsv: 'text/tab-separated-values', md: 'text/markdown', txt: 'text/plain' })
const OPENS = new Set(['html', 'htm', 'svg', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'pdf'])
/** @param {string} path */
const extension = (path) => /\.([a-z0-9]+)$/i.exec(path)?.[1].toLowerCase() ?? ''
/** @param {string} path */
const order = (path) => Object.keys(SHOWN).indexOf(extension(path))

/** @param {Awaited<ReturnType<typeof preview>>} shown @returns {import('../../core/types.js').ToolCallContent[]} */
const diffs = (shown) => shown.flatMap((each) => (each.binary || each.newText === null ? [] : [{ type: /** @type {const} */ ('diff'), path: each.path, oldText: each.oldText, newText: each.newText }]))

/** @type {Tool} */
const saveTool = {
  spec: {
    name: 'save_workspace',
    description: 'Keeps what a run changed in /workspace. For the computer itself.',
    parameters: { type: 'object', properties: { batch: { type: 'string' }, files: { type: 'array', items: { type: 'string' } }, removed: { type: 'array', items: { type: 'string' } } }, required: ['batch'] },
  },
  kind: 'edit',
  hidden: true,
  title: (args) => `Keep ${[...(args?.files ?? []), ...(args?.removed ?? [])].join(', ')}`,
  locations: (args) => [...(args?.files ?? []), ...(args?.removed ?? [])].map((path) => ({ path: String(path) })),
  // In the user's folder, the changes are asked first with their diffs, unless it is always allowed (D141).
  check: async (args) => {
    const batch = batches.get(args?.batch)
    if (!batch?.mount.folder) return
    return { ask: !batch.mount.always, meta: { folder: batch.mount.folder.name }, content: diffs(await preview(batch.mount.fs, batch.changes)) }
  },
  run: async (args, ctx) => {
    const batch = batches.get(args?.batch)
    if (!batch) throw new Error('These changes are no longer there.')
    const { mount, changes, held } = batch
    const shown = mount.folder ? await preview(mount.fs, changes) : []
    const done = await incoming(mount.fs, held, changes)
    // A page, a picture, a PDF, a table or a text made in the project's workspace shows under the
    // answer, and the first page or picture opens beside the conversation on screen (D163). Each is
    // kept as it is now, a version of its own, by its content, as Things Jean made keeps its files:
    // the next run may change the workspace's, never this one (D164). The user's folder has its own ways (D156).
    /** @type {import('../../core/events.js').MadeFile[]} */
    const made = []
    const before = filesMade(callsIn(mount.conversation?.records ?? [], mount.conversation?.turn?.steps))
    for (const path of mount.folder ? [] : done.saved.filter((each) => SHOWN[extension(each)]).sort((a, b) => order(a) - order(b)).slice(0, 4)) {
      const bytes = new Uint8Array(changes.put[path])
      const mimeType = SHOWN[extension(path)]
      const text = /^text\//.test(mimeType) ? exactText(bytes) : null
      const link = await addFile(app.fs, { projectDir: mount.project, name: path, mimeType, bytes, pages: text === null ? [] : [text], by: 'jean' })
      made.push({ uri: link.uri, name: path, mimeType, size: bytes.length, version: nextVersion([...before, ...made], path, link.uri) })
    }
    const here = mount.conversation?.id === app.current.peek()?.id
    // A page opens in the browser once it is on, where the other files of the workspace it uses come
    // along (D167), as its card opens it there (D172); the preview shows a file on its own.
    const browsed = here && /\.html?$/i.test(made[0]?.name ?? '') && loaded.peek().has('browser') ? made[0].name : ''
    if (made.length) {
      ctx.meta.files = made
      if (OPENS.has(extension(made[0].name)) && here && !browsed) (await import('../../ui/preview.js')).preview(made[0])
    }
    // The browser's page of the workspace comes again when a file it was made of changed (D167).
    if (!mount.folder && here) for (const path of done.saved) document.dispatchEvent(new CustomEvent('app-workspace-changed', { detail: { path, open: path === browsed } }))
    if (mount.folder) {
      ctx.content.push(...diffs(shown.filter((each) => done.saved.includes(each.path))))
      if (ctx.answer === 'allow_always') await (await import('../folders/folders.js')).trust(mount.folder)
      // A page made or changed in the conversation on screen shows in the browser, or has it offered (D156).
      if (mount.conversation?.id === app.current.peek()?.id) for (const path of done.saved) document.dispatchEvent(new CustomEvent('app-folder-changed', { detail: { folder: mount.folder.name, path } }))
    }
    return [
      done.saved.length ? `Kept in /workspace: ${done.saved.join(', ')}.` : '',
      made.some((file) => (file.version ?? 1) > 1) ? `New versions, the earlier ones still under their answers: ${made.flatMap((file) => ((file.version ?? 1) > 1 ? [`${file.name} (version ${file.version})`] : [])).join(', ')}.` : '',
      done.removed.length ? `Removed from /workspace: ${done.removed.join(', ')}.` : '',
      done.refused.length ? `Not kept, as they changed meanwhile (the computer has them as they are now): ${done.refused.join(', ')}.` : '',
    ].filter(Boolean).join(' ')
  },
}

// ─── /workspace in the browser ───────────────────────────────────────────────

// The project's workspace shows in the browser at "/workspace/<path>" when the conversation has no
// folder (D167), its pages put together as a folder's are (D156, caps/folders/site.js).
const workspace = () => within(app.fs, join(app.projectDir, 'workspace'))

/** What a path of the project's workspace shows in the browser. @param {string} path */
export const workspacePage = (path) => sitePage(workspace(), path, '/workspace')

/** Whether the project's workspace holds anything. */
export const workspaceHolds = async () => (await workspace().list('').catch(() => [])).length > 0

/** Whether a file a page of the workspace was made of changed since. @param {Record<string, string>} files */
export async function workspaceMoved(files) {
  const fs = workspace()
  for (const [path, stamp] of Object.entries(files)) {
    const now = await fs.stat?.(path).catch(() => null)
    if (`${now?.size}:${now?.lastModified}` !== stamp) return true
  }
  return false
}

/** Whether the project's workspace still holds a file as a card of it has it (D172), by its content, which names the card's file. @param {string} path @param {string} uri */
export async function workspaceKeeps(path, uri) {
  const bytes = await workspace().readBytes(path).catch(() => null)
  return Boolean(bytes && uri.startsWith(`files/sha256-${await sha256Hex(bytes)}.`))
}

// ─── The internet ────────────────────────────────────────────────────────────

/**
 * A request from the computer: refused, asked about once a run for a new site, or made, by Jean,
 * through the relay, with a registry's key when it goes to one.
 * @param {{ url: string, method?: string, headers?: Record<string, string>, body?: ArrayBuffer }} request @param {ToolContext} ctx
 * @param {{ rights: import('./net.js').ComputerRights, relay: string, asked: Map<string, Promise<string>>, what: string }} run
 */
async function online(request, ctx, { rights, relay, asked, what }) {
  const origin = location.origin
  const judged = judge(request.url, { rights, origin })
  if (judged.verdict === 'deny') throw new Error(judged.why)
  if (judged.verdict === 'ask') {
    if (!asked.has(judged.site)) asked.set(judged.site, ctx.call('reach_site', { site: judged.site, for: what }))
    await asked.get(judged.site)
  }
  const kind = registryOf(request.url, rights)
  const token = kind ? await getSecret(app.fs, `computer-${kind}`) : null
  const allowed = (/** @type {string} */ to) => {
    const again = judge(to, { rights: rightsNow().rights, origin })
    return again.verdict === 'allow' || asked.has(again.site)
  }
  const answer = await reach(request, { relay, token: token ?? undefined, limit: rights.limitMB * 1e6, allowed, signal: ctx.signal })
  if (ctx.meta) (ctx.meta.reached ??= {})[judged.site] = (ctx.meta.reached[judged.site] ?? 0) + 1
  return answer
}

/** @type {Tool} */
const reachTool = {
  spec: {
    name: 'reach_site',
    description: 'Asks the user before the computer reaches a site it has not reached yet. For the computer itself.',
    parameters: { type: 'object', properties: { site: { type: 'string' }, for: { type: 'string' } }, required: ['site'] },
  },
  kind: 'fetch',
  hidden: true,
  title: (args) => `Reach ${args?.site ?? ''}`,
  // Always asked, by site: "Always" adds the site to Settings › Computer, not a rule for every request.
  check: async (args) => ({ ask: true, meta: { site: String(args?.site ?? '') } }),
  run: async (args, ctx) => {
    const site = String(args?.site ?? '')
    if (ctx.answer === 'allow_always') {
      const own = app.settings.value.computer ?? {}
      await updateSettings({ computer: { ...own, sites: [...new Set([...(own.sites ?? []), site])] } })
    }
    return `The computer may reach ${site}.`
  },
}

/** The card for a site the computer hasn't reached yet: once, always (Settings › Computer lists it), or no. */
class SiteApproval extends Element {
  #decision = signal(/** @type {any} */ (null))
  #helper = signal(/** @type {string | undefined} */ (undefined))
  /** @param {Extract<import('../../ui/state.js').Decision, { toolCall: any }>} value */
  set decision(value) { this.#decision.value = value }
  /** @param {string | undefined} value the helper asking, if one is */
  set helper(value) { this.#helper.value = value }

  render() {
    const decision = this.#decision.value
    if (!decision) return nothing
    const { toolCall, resolve } = decision
    const site = String(toolCall._meta?.site ?? '')
    const asked = t('computer.reach.question', { site })
    const what = String(toolCall.rawInput?.for ?? '')
    return html`<div class="approval" role="group" aria-label=${asked}>
      ${this.#helper.value ? html`<p class="approval-from">${icons.helpers}<span dir="auto">${this.#helper.value}</span></p>` : nothing}
      <p>${asked}</p>
      ${what ? html`<pre class="approval-for" dir="ltr">${what}</pre>` : nothing}
      <div class="approval-actions">
        <button class="button primary" @click=${() => resolve('allow_once')}>${t('computer.reach.once')}</button>
        <button class="button" @click=${() => resolve('allow_always')}>${t('computer.reach.always', { site })}</button>
        <button class="button subtle" @click=${() => resolve('reject_once')}>${t('computer.reach.no')}</button>
      </div>
    </div>`
  }
}
define('app-site-approval', SiteApproval)

// ─── Tools ───────────────────────────────────────────────────────────────────

/** @param {string} text @param {number} [max] the start and the end of a long text */
export const clip = (text, max = 6000) => (text.length > max ? `${text.slice(0, max * 0.7)}\n… (${text.length - Math.round(max * 0.7) - Math.round(max * 0.3)} characters cut) …\n${text.slice(-Math.round(max * 0.3))}` : text)

/** What the brain reads of a command: its exit code, what it printed, what changed in /workspace. @param {Awaited<ReturnType<typeof execute>>} ran */
function commandReport({ done, left, kept }) {
  if (!done.ok) throw new Error(`The command couldn't run: ${done.error}`)
  const parts = [`Exit code: ${done.exit}`]
  if (done.stdout) parts.push(clip(done.stdout))
  if (done.stderr) parts.push(`stderr:\n${clip(done.stderr, 2000)}`)
  if (kept) parts.push(kept)
  if (left.length) parts.push(`Too large for the computer, left out of /workspace: ${left.join(', ')}`)
  return parts.join('\n\n')
}

/** What the brain reads of a script: the result, then the log; a failure as an error. @param {Awaited<ReturnType<typeof execute>>} ran */
function scriptReport({ done, kept }) {
  const { ok, result, error, logs = [] } = done
  // "Result: null" reads like an answer, and a small brain then makes one up.
  const empty = result === null && !logs.length
  const parts = [!ok ? `The script failed: ${error}`
    : empty ? 'The script gave no result: end it with the value you need, or return it.'
    : `Result: ${typeof result === 'string' ? result : JSON.stringify(result, null, 1)}`]
  if (logs.length) parts.push(`Log:\n${logs.join('\n')}`)
  if (kept) parts.push(kept)
  const text = parts.join('\n\n')
  const cut = text.length > MAX_OUTPUT ? `${text.slice(0, MAX_OUTPUT)}\n… (cut here: return less)` : text
  if (!ok) throw new Error(cut)
  return cut
}

/** @type {Tool} */
const bashTool = {
  spec: {
    name: 'bash',
    description: [
      "Run a command on your computer: bash, in a sandbox in this tab, never the user's machine.",
      "/workspace holds the conversation's folder, or the project's workspace when it has none, and what commands change there is kept (in the user's folder, once they agree); /home/user and /tmp last until the tab closes.",
      'Most commands are there (ls, cat, grep, sed, awk, jq, find, sort, diff, gzip, curl…), with python3, pip install and node (JavaScript).',
      'A web page, a picture or a PDF you make in /workspace opens beside the conversation for the user: a chart is best a small HTML page with inline SVG.',
      'The internet works as Settings › Computer allows; the user is asked first for a new site. The shell keeps its directory and variables between commands.',
    ].join(' '),
    parameters: { type: 'object', properties: { command: { type: 'string', description: 'The command, or several lines of them' } }, required: ['command'] },
  },
  kind: 'execute',
  title: (args) => `Command: ${String(args?.command ?? '').trim().split('\n')[0].slice(0, 80)}`,
  check: opening,
  run: async (args, ctx) => commandReport(await execute({ engine: 'shell', command: String(args?.command ?? '') }, ctx)),
}

/** @type {Tool} */
const javascriptTool = {
  spec: {
    name: 'javascript',
    description: [
      'Run JavaScript on your computer, in a sandbox. Top-level await works; return the result, which comes back as JSON with anything logged.',
      'Available in scripts: await file(name) returns the whole text of a shared file (spreadsheets as tab-separated rows under "Sheet:" lines);',
      'csv(text) turns CSV or tab-separated text into rows, objects keyed by the header, numbers as numbers;',
      "await fs.readFile(path), fs.writeFile(path, text) and fs.readdir(path) work in /workspace, where the conversation's files are, and a web page or a picture written there opens beside the conversation;",
      'await fetch(url, init) reaches the internet as Settings allow;',
      'await tools.<name>({ … }) calls any tool, including ones found with await searchTools(query) and those of connected services;',
      'await models.decide(state, questions) asks the on-device decision helper, when it is on (types noul, choice, score);',
      'await models.image(description) makes a picture, which the user sees.',
    ].join(' '),
    parameters: { type: 'object', properties: { code: { type: 'string', description: 'The script' } }, required: ['code'] },
  },
  kind: 'execute',
  title: () => 'Calculate',
  check: opening,
  run: async (args, ctx) => scriptReport(await execute({ engine: 'quickjs', code: String(args?.code ?? ''), limits: SCRIPT }, ctx)),
}

/** @type {Tool} */
const pythonTool = {
  spec: {
    name: 'python',
    description: [
      "Run Python 3 on your computer, in a sandbox, in /workspace, where the conversation's files are.",
      'Its standard library is there; packages install with `import micropip` then `await micropip.install("pandas")` when the internet is allowed.',
      'Top-level await works; the value of the last line comes back as JSON, with anything printed. For the internet, `from pyodide.http import pyfetch` (requests and urllib wait for a reply, which the sandbox can\'t).',
      'Available in scripts: await file(name) returns the whole text of a shared file (spreadsheets as tab-separated rows under "Sheet:" lines);',
      'await tools.<name>(**args) calls any tool, including ones found with await search_tools(query).',
    ].join(' '),
    parameters: { type: 'object', properties: { code: { type: 'string', description: 'The script' } }, required: ['code'] },
  },
  kind: 'execute',
  title: () => 'Python',
  check: opening,
  run: async (args, ctx) => scriptReport(await execute({ engine: 'pyodide', code: String(args?.code ?? ''), limits: { output: SCRIPT.output } }, ctx)),
}


// ─── The terminal ────────────────────────────────────────────────────────────

/**
 * A command the user types in the terminal (D166), on the conversation's computer, as theirs: what it
 * changes in /workspace is kept at once, in their folder too, and a new site is asked about there
 * (`ask`), as Settings › Computer has it. Tools aren't called from there. With `repl`, a line typed at
 * node's or python's prompt (D180), the first one `start`ing it afresh.
 * @param {string} command @param {{ signal: AbortSignal, ask: (site: string) => Promise<import('../../core/loop.js').PermissionOption>, repl?: string, start?: boolean }} options
 */
export async function typed(command, { signal, ask, repl, start }) {
  /** @type {string[]} */
  let refused = []
  const ctx = /** @type {ToolContext} */ (/** @type {unknown} */ ({
    signal,
    meta: {},
    call: async (/** @type {string} */ name, /** @type {any} */ args) => {
      if (name === 'reach_site') {
        const answer = await ask(String(args.site))
        if (!answer.startsWith('allow')) throw new Error('The user declined this action.')
        return reachTool.run(args, /** @type {ToolContext} */ (/** @type {unknown} */ ({ answer })))
      }
      const batch = batches.get(args?.batch)
      if (name !== 'save_workspace' || !batch) throw new Error(`${name} can't be used from the terminal.`)
      const done = await incoming(batch.mount.fs, batch.held, batch.changes)
      refused = done.refused
      // A page changed in the conversation's folder shows in the browser, or has it offered (D156).
      if (batch.mount.folder) for (const path of done.saved) document.dispatchEvent(new CustomEvent('app-folder-changed', { detail: { folder: batch.mount.folder.name, path } }))
      return ''
    },
  }))
  const { done } = await execute({ engine: 'shell', command, repl, start }, ctx)
  return { ...done, refused }
}

/** What Tab offers in the terminal (D170): `compgen`'s commands, or files, a folder's ending in /. Nobody is told. @param {string} word @param {boolean} commands */
export async function completions(word, commands) {
  const quoted = `'${word.replaceAll("'", "'\\''")}'`
  const command = commands ? `compgen -A command -- ${quoted}` : `compgen -d -S / -- ${quoted}; compgen -f -- ${quoted}`
  const { done } = await execute({ engine: 'shell', command }, /** @type {ToolContext} */ (/** @type {unknown} */ ({ signal: new AbortController().signal, meta: {} })))
  const found = new Set(String(done.stdout ?? '').split('\n').filter(Boolean))
  return [...found].filter((name) => !found.has(`${name}/`)).sort()
}

/** The terminal's key, left to right in any language: Control, which a Mac writes ⌃ (D166). */
export const keys = html`<kbd><bdi dir="ltr">${/Mac|iPhone|iPad/.test(navigator.platform) ? '⌃`' : 'Ctrl+`'}</bdi></kbd>`
/** The terminal's prompt, the shell's: ">_". */
export const prompt = html`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m4.5 7 5 5-5 5M12 17.5h7.5"/></svg>`

/** The computer's light (D176): unlit asleep, steady once ready, breathing while it wakes or works. @param {string} state */
const light = (state) => html`<span class="ember" data-state=${state} aria-hidden="true"></span>`

/** At the main area's top, once the terminal has been opened: it opens or closes it (D170), with the computer's light. */
class TerminalToggle extends Element {
  render() {
    if (!app.settings.value.terminal) return nothing
    const { state } = box.status.value
    return html`<button class="icon-button terminal-toggle" aria-label=${t('computer.terminal')} title=${t('computer.terminal')} aria-keyshortcuts="Control+\`"
      @click=${() => import('./terminal.js').then((module) => module.toggle())}>${prompt}${state === 'asleep' ? nothing : light(state)}</button>`
  }
}
define('app-terminal-toggle', TerminalToggle)

// ─── Settings › Computer ─────────────────────────────────────────────────────

// Settings is open when its panel shows, so its module is there to be had: imported, not loaded with the computer.
const dialogs = signal(/** @type {typeof import('../../ui/dialogs.js') | null} */ (null))
/** The project's workspace, measured when the panel shows. */
const used = signal(/** @type {number | null} */ (null))

/** @param {ComputerSettings} change */
async function setComputer(change) {
  await updateSettings({ computer: { ...app.settings.value.computer, ...change } })
  // A command's time is the shell's, set when it starts: the computer starts again.
  if ('timeMs' in change) restart()
}

function restart() {
  box.stop()
  holding.clear()
}

/** The project's workspace and how much it holds. */
async function measure() {
  const fs = within(app.fs, join(app.projectDir, 'workspace'))
  let size = 0
  for (const path of await walk(fs)) size += (await fs.stat?.(path))?.size ?? 0
  used.value = size
}
// Once Settings has shown it, measured again as the computer comes back from a run.
effect(() => { if (box.status.value.state === 'ready' && used.peek() !== null) measure() })

async function empty() {
  if (!confirm(t('computer.workspace.confirm'))) return
  await app.fs.remove(join(app.projectDir, 'workspace'))
  restart()
  measure()
}

/** @param {string} name @param {string} label @param {string[]} options @param {string} current @param {boolean} locked @param {(value: string) => void} set */
const choice = (name, label, options, current, locked, set) => html`<span class="segmented" role="radiogroup" aria-label=${label}>
  ${options.map((option) => html`<label><input type="radio" name=${name} .checked=${current === option} ?disabled=${locked} @change=${() => set(option)}><span>${t(`computer.${name}.${option}`)}</span></label>`)}
</span>`

/** What the computer runs (D176), each with a line Try types in the terminal, for the user to run with Enter. Python's files are about 14 MB. */
const ENGINES = /** @type {const} */ ([['shell', prompt, 'tree /workspace'], ['quickjs', 'JS', 'node -p "(1000 * 1.05 ** 10).toFixed(2)"'], ['pyodide', 'Py', 'python3 -c "print(2 ** 100)"']])

/** Settings closes and the terminal opens, with a line typed on it if one is given. @param {string} [line] */
function terminal(line) {
  app.dialog.value = null
  import('./terminal.js').then((module) => module.show(line))
}

/**
 * This device's memory, in bytes (D176): exactly, as the system tells the desktop app; otherwise at
 * least what Chromium's `deviceMemory` says (GiB rounded down to a power of two, at most 32); or 0, unknown.
 */
const deviceMemory = signal({ bytes: (/** @type {any} */ (navigator).deviceMemory ?? 0) * 2 ** 30, exact: false })
memoryTotal().then((bytes) => { if (bytes) deviceMemory.value = { bytes, exact: true } }, () => {})

/** "0.02 MB", "1.5 GB": never less than a megabyte; memory by 1,024, as systems count it. @param {number} bytes @param {number} [k] */
function amount(bytes, k = 1000) {
  const mb = bytes / k / k
  const [unit, size] = mb >= k ? ['gigabyte', mb / k] : ['megabyte', mb]
  return new Intl.NumberFormat(locale.value, { style: 'unit', unit, maximumFractionDigits: size && size < 1 ? 2 : 1 }).format(size)
}

/**
 * A share of a limit as a ring, how far it goes in its middle, then what it is (D176); with no
 * limit known, an empty ring. @param {string} label @param {unknown} value @param {number | null} part
 */
const gauge = (label, value, part) => html`<li>
  <span class="ring" aria-hidden="true"><svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="15.5"/><circle cx="18" cy="18" r="15.5" pathLength="100"
    stroke-dasharray=${`${Math.min(1, part ?? 0) * 100} 100`} opacity=${part ? 1 : 0}/></svg>${part === null ? nothing : new Intl.NumberFormat(locale.value, { style: 'percent', maximumFractionDigits: part && part < 0.01 ? 1 : 0 }).format(part)}</span>
  <span class="muted">${label}</span><span>${value}</span>
</li>`

/**
 * The computer itself, at the top of Settings › Computer (D176), after DEVS's Device and HappyCapy's
 * Sandbox: its light, with Restart; the core it computes on, of this device's, the memory it holds, of
 * this device's, and the workspace, of what it takes in; then what it runs, each engine asleep or ready, with Try.
 */
function itself() {
  const { state, engines, computing, memory } = box.status.value
  const cores = navigator.hardwareConcurrency || 1
  const limit = rightsNow().rights.workspaceMB * 1e6
  const { bytes: total, exact } = deviceMemory.value
  const strong = (/** @type {string} */ text) => html`<strong>${text}</strong>`
  return html`<section class="computer">
      <div class="setting">
        <div><h3>${light(state)}<span role="status">${t(`computer.state.${state}`)}</span></h3><p class="muted">${t('computer.text')}</p></div>
        <button class="button subtle" ?disabled=${state === 'asleep'} @click=${restart}>${icons.retry} ${t('computer.restart')}</button>
      </div>
      <ul class="gauges">
        ${gauge(t('computer.processor'), tParts('computer.cores', { count: cores, used: strong(new Intl.NumberFormat(locale.value).format(computing ? 1 : 0)) }), computing ? 1 / cores : 0)}
        ${gauge(t('computer.memory'), total ? tParts(exact ? 'computer.of' : 'computer.of.least', { used: strong(amount(memory, 1024)), total: amount(total, 1024) }) : strong(amount(memory, 1024)), total ? memory / total : null)}
        ${gauge(t('computer.workspace.short'), tParts('computer.of', { used: strong(amount(used.value ?? 0)), total: amount(limit) }), (used.value ?? 0) / limit)}
      </ul>
    </section>
    <section>
      <h3>${t('computer.engines')}</h3>
      <ul class="list engines">${ENGINES.map(([id, mark, line]) => html`<li>
        <span class="item-icon" aria-hidden="true">${mark}</span>
        <span class="item-text"><span id=${`engine-${id}`}>${t(`computer.engine.${id}`)}</span><small>${t(`computer.engine.${id}.text`, { size: amount(14e6) })}</small></span>
        <small class="muted">${light(engines[id] ?? 'asleep')} ${t(`computer.state.${engines[id] ?? 'asleep'}`)}</small>
        <button class="button subtle" aria-describedby=${`engine-${id}`} @click=${() => terminal(line)}>${t('computer.try')}</button>
      </li>`)}</ul>
    </section>`
}

/** Settings › Computer: the computer itself, the internet, the sites, the relay, where packages come from, the limits, the terminal and the workspace. */
function panel() {
  if (!dialogs.value) import('../../ui/dialogs.js').then((module) => { dialogs.value = module })
  if (used.value === null) measure()
  const { rights, locked, global } = rightsNow()
  const held = (/** @type {string} */ key) => (locked.has(key) ? html`<p class="muted small">${t('computer.locked')}</p>` : nothing)
  const minutes = [60_000, 120_000, 300_000, 600_000]
  return html`${itself()}
    <section class="setting">
      <div><h3>${t('computer.internet')}</h3><p class="muted">${t('computer.internet.text')}</p>${held('internet')}</div>
      ${choice('internet', t('computer.internet'), ['off', 'ask', 'any'], rights.internet, locked.has('internet'), (internet) => setComputer({ internet: /** @type {any} */ (internet) }))}
    </section>
    ${rights.internet === 'off' ? nothing : html`<section>
      <h3>${t('computer.sites')}</h3>
      ${dialogs.value?.siteList({ sites: rights.sites, fixed: locked.has('sites'), set: (sites) => setComputer({ sites }) }) ?? nothing}
    </section>
    <section class="setting">
      <div><h3>${t('computer.relay')}</h3><p class="muted">${global ? t('computer.relay.globalText', { relay: global }) : t('computer.relay.noneText')}</p>${held('relay')}</div>
      <select aria-label=${t('computer.relay')} ?disabled=${locked.has('relay')} @change=${(/** @type {Event} */ e) => setComputer({ relay: /** @type {any} */ (/** @type {HTMLSelectElement} */ (e.target).value) })}>
        ${['global', 'own', 'none'].map((option) => html`<option value=${option} ?selected=${rights.relay === option}>${t(`computer.relay.${option}`)}</option>`)}
      </select>
      ${rights.relay === 'own' ? html`<input dir="ltr" type="url" spellcheck="false" placeholder="https://…?url={url}" aria-label=${t('computer.relay.address')} .value=${rights.ownRelay}
        ?disabled=${locked.has('ownRelay')} @change=${(/** @type {Event} */ e) => setComputer({ ownRelay: /** @type {HTMLInputElement} */ (e.target).value.trim() })}>` : nothing}
    </section>
    <details class="other">
      <summary>${t('computer.registries')}</summary>
      <p class="muted">${t('computer.registries.text')}</p>
      ${REGISTRIES.map((kind) => html`<div class="stack">
        <label>${t(`computer.registry.${kind}`)}<input dir="ltr" type="url" spellcheck="false" .value=${app.settings.value.computer?.registries?.[kind] ?? ''}
          placeholder=${serviceURL(kind, app.settings.value, app.policy)} ?disabled=${locked.has(`registries.${kind}`)}
          @change=${(/** @type {Event} */ e) => setComputer({ registries: { ...app.settings.value.computer?.registries, [kind]: /** @type {HTMLInputElement} */ (e.target).value.trim() } })}></label>
        <label>${t('computer.registry.key')}<input type="password" autocomplete="off" spellcheck="false" dir="ltr" placeholder="••••"
          @change=${async (/** @type {Event} */ e) => { const value = /** @type {HTMLInputElement} */ (e.target).value.trim(); await (value ? setSecret(app.fs, `computer-${kind}`, value) : deleteSecret(app.fs, `computer-${kind}`)) }}></label>
      </div>`)}
    </details>`}
    <section class="setting">
      <div><h3>${t('computer.time')}</h3>${held('timeMs')}</div>
      <select aria-label=${t('computer.time')} ?disabled=${locked.has('timeMs')} @change=${(/** @type {Event} */ e) => setComputer({ timeMs: Number(/** @type {HTMLSelectElement} */ (e.target).value) })}>
        ${minutes.map((ms) => html`<option value=${ms} ?selected=${rights.timeMs === ms}>${t('computer.minutes', { count: ms / 60_000 })}</option>`)}
      </select>
    </section>
    <section class="setting">
      <div><h3>${t('computer.terminal')}</h3><p class="muted">${tParts('computer.terminal.text', { keys })}</p></div>
      <button class="button subtle" aria-keyshortcuts="Control+\`" @click=${() => terminal()}>${prompt} ${t('computer.terminal.open')}</button>
    </section>
    <section class="setting">
      <div><h3>${t('computer.workspace')}</h3><p class="muted">${t('computer.workspace.text')}</p></div>
      <button class="button subtle danger" ?disabled=${!used.value} @click=${empty}>${icons.trash} ${t('computer.workspace.empty')}</button>
    </section>`
}

register({
  id: 'computer',
  tools: [bashTool, javascriptTool, pythonTool, imageTool, saveTool, reachTool],
  lines: [
    { name: 'bash', line: 'commands on your own computer, a sandbox: /workspace holds the files; python3, pip, node, curl' },
    { name: 'javascript', line: 'JavaScript to work things out exactly; scripts read files and call tools' },
    { name: 'python', line: 'Python, for data work' },
  ],
  rules: ['Compute numbers with code instead of estimating them.'],
  panel,
})
