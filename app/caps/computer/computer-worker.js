// SPDX-License-Identifier: MIT
// The Computer (D162), in a worker started from a blob in the sandbox's frame (sandbox.html): an opaque
// origin with no network. Its engines come in as files from Jean, each the first time a run needs it:
// the shell (just-bash), whose filesystem is every conversation's computer; QuickJS for JavaScript;
// Pyodide for Python. A conversation's computer keeps /home/user and /tmp for the visit; /workspace is
// a copy of its folder, or of its project's workspace, which Jean brings up to date before each run
// and takes the changes back from after it. Whatever leaves the worker, a call to one of Jean's tools,
// an engine it needs, a request to the internet, crosses to Jean as a message, and Jean makes it under
// the rules (D48) and Settings › Computer: the worker holds no key and has no network of its own.
//
// → { type: 'boot' }                                          ← { type: 'ready' }
// → { type: 'load', engine, files }                           ← { type: 'loaded', engine, error?, memory }
// → { type: 'run', run, engine, computer, put, gone, … }      ← { type: 'call' | 'need' | 'fetch', run, id, … }…,
//                                                                { type: 'done', run, ok, result, logs, error, exit, changes, memory }
// → { type: 'answer', run, id, ok, value, error }
// A classic script (no static imports): the sandbox can only start classic workers.
/** @import { QuickJSContext, QuickJSDeferredPromise, QuickJSHandle, QuickJSWASMModule } from 'quickjs-emscripten-core' */
/** @import { Bash, IFileSystem, SecureFetch } from 'just-bash' */
/** @import { PyDict } from 'pyodide/ffi' */

// QuickJS's JS_EVAL_FLAG_ASYNC (1 << 7), which quickjs-emscripten doesn't name: a global
// script where await works, evaluating to a promise of { value: <last expression> }.
const ASYNC_SCRIPT = 128
// Never resolved: the fetch below answers for them, with Pyodide's own files or through Jean.
const INDEX = 'https://sandbox.invalid/pyodide/'
const PACKAGES = 'https://packages.invalid/'
const WORKSPACE = '/workspace'
const HOME = '/home/user'
// What a server is started with, which can't work here: nothing listens on a port in the sandbox.
const SERVERS = /^(vite|next|nuxt|astro|serve|http-server|live-server|webpack-dev-server|parcel|nodemon)\b(?! build)|^webpack serve\b/
const SERVER_MODULES = /^(node:)?(http|https|http2|net)$|^express$/
// Node's own modules: those node has here (D178), and the others, which it doesn't.
const OWN = /^(?:node:)?(path|fs|fs\/promises|os|util|events|process|buffer)$/
const NODE = /^node:|^(assert|child_process|crypto|readline|stream|string_decoder|timers|tty|url|vm|worker_threads|zlib)(\/|$)/
/** Why it can't, and what does instead. @param {string} name */
const noServer = (name) => `${name}: nothing can listen on a port here, so no server runs. Write the web page in /workspace, its scripts plain JavaScript (or bundled into one file by a script of yours in node) and styles inside it, and it opens beside the conversation by itself.\n`

/** The engines, once loaded: `shell` (just-bash and fflate), `quickjs`, `pyodide`. @type {Record<string, any>} */
const engines = {}
/** Requests to Jean waiting for their answer, by id. @type {Map<number, { resolve: (value: unknown) => void, reject: (error: Error) => void }>} */
const waiting = new Map()
let asked = 0
/** The bytes of the engines' files, which the worker keeps. */
let code = 0
/** Each conversation's computer, for the visit. @type {Map<string, Computer>} */
const computers = new Map()

/**
 * python and node: the user's, at their prompt in the terminal (D180).
 * @typedef {{ fs: any, base: any, workspace: any, bash: Bash, run: number, env: Record<string, string> | null, synced: Map<string, string>,
 *   registries: Record<string, string>, limits: Record<string, number>, python?: PyDict | null, node?: JsContext | null }} Computer
 */

self.onmessage = async ({ data }) => {
  if (data.type === 'boot') return self.postMessage({ type: 'ready' })
  if (data.type === 'answer') return settle(data)
  if (data.type === 'load') {
    try {
      engines[data.engine] ??= await LOADERS[data.engine](data.files)
      for (const file of Object.values(data.files)) code += file.byteLength ?? file.length
      self.postMessage({ type: 'loaded', engine: data.engine, memory: memory() })
    } catch (error) {
      self.postMessage({ type: 'loaded', engine: data.engine, error: said(error), memory: memory() })
    }
  } else if (data.type === 'run') {
    try {
      const computer = await computerOf(data)
      await receive(computer, data.put, data.gone, data.fresh)
      const outcome = await RUNS[data.engine](data, computer)
      self.postMessage({ type: 'done', run: data.run, ...outcome, changes: await changes(computer), memory: memory() })
    } catch (error) {
      self.postMessage({ type: 'done', run: data.run, ok: false, error: said(error), logs: [], memory: memory() })
    }
  }
}

/** @param {any} error */
const said = (error) => String(error?.message ?? error)

/** What the computers hold in memory, for Settings (D176): their files, and each engine woken, its code and its heap. */
function memory() {
  let bytes = code + (engines.pyodide?._module?.HEAP8?.length ?? 0)
  for (const { base, workspace } of computers.values()) bytes += base.retainedBytes + workspace.retainedBytes
  try {
    bytes += engines.quickjs?.getWasmMemory().buffer.byteLength ?? 0
  } catch {}
  return bytes
}

/** Asks Jean for something and waits for the answer. @param {number} run @param {Record<string, unknown>} message @returns {Promise<any>} */
function ask(run, message) {
  return new Promise((resolve, reject) => {
    const id = ++asked
    waiting.set(id, { resolve, reject })
    self.postMessage({ ...message, run, id })
  })
}

/** @param {{ id: number, ok: boolean, value?: unknown, error?: string }} answer */
function settle({ id, ok, value, error }) {
  const pending = waiting.get(id)
  waiting.delete(id)
  if (ok) pending?.resolve(value)
  else pending?.reject(new Error(String(error)))
}

/** An engine, asked of Jean when this sandbox doesn't have it yet. @param {number} run @param {string} engine */
async function engine(run, engine) {
  if (!engines[engine]) await ask(run, { type: 'need', engine })
  return engines[engine]
}

// ─── Engines ─────────────────────────────────────────────────────────────────

/**
 * An engine's modules as blob URLs, leaves first, each `./name.mjs` import pointed at the URL of
 * the file it names.
 * @param {Record<string, string | ArrayBuffer>} files @returns {Record<string, string>}
 */
function modules(files) {
  // Text, as the sandbox reads every .mjs (ui/sandbox.js).
  const sources = /** @type {Record<string, string>} */ (Object.fromEntries(Object.entries(files).filter(([name]) => name.endsWith('.mjs'))))
  /** @type {Record<string, string>} */
  const urls = {}
  const pending = Object.keys(sources)
  const imports = (/** @type {string} */ name) => [...sources[name].matchAll(/["']\.\/([\w.-]+\.mjs)["']/g)].map((match) => match[1])
  while (pending.length) {
    const next = pending.findIndex((name) => imports(name).every((dep) => urls[dep] || !sources[dep]))
    if (next < 0) throw new Error('The runtime has an import cycle')
    const [name] = pending.splice(next, 1)
    const text = sources[name].replace(/(["'])\.\/([\w.-]+\.mjs)\1/g, (match, quote, dep) => (urls[dep] ? quote + urls[dep] + quote : match))
    urls[name] = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }))
  }
  return urls
}

/** @type {Record<string, (files: Record<string, string | ArrayBuffer>) => Promise<any>>} */
const LOADERS = {
  shell: async (files) => {
    // node:zlib, for gzip: fflate's, under Node's names.
    files['node-zlib.mjs'] = "export { gzipSync, gunzipSync } from './fflate.mjs'\nexport const constants = { Z_BEST_COMPRESSION: 9, Z_BEST_SPEED: 1, Z_DEFAULT_COMPRESSION: 6 }\n"
    const urls = modules(files)
    const [shell, zip] = await Promise.all([import(urls['just-bash.mjs']), import(urls['fflate.mjs'])])
    return { ...shell, zip }
  },
  quickjs: async (files) => {
    const urls = modules(files)
    const { newQuickJSWASMModuleFromVariant, newVariant } = await import(urls['index.mjs'])
    const variant = {
      type: 'sync',
      importFFI: () => import(urls['ffi.mjs']).then((module) => module.QuickJSFFI),
      importModuleLoader: () => import(urls['emscripten-module.mjs']).then((module) => module.default),
    }
    // The bytes come from Jean, so nothing is fetched; a location keeps Emscripten from
    // resolving one against import.meta.url, which a blob: URL can't be a base for. Node's Buffer
    // (feross's, D178) comes along, for each script to start with.
    return Object.assign(await newQuickJSWASMModuleFromVariant(newVariant(variant, { wasmBinary: files['emscripten-module.wasm'], wasmLocation: 'emscripten-module.wasm' })), { buffer: files['buffer.js'] })
  },
  // Pyodide's loader fetches its files: its own come from Jean in the load message, and packages
  // through Jean from the registry Settings name (D80, D162). Pyodide refuses classic workers when
  // importScripts() accepts a data: URL; the sandbox's policy refuses data: scripts, so it never does.
  pyodide: async (files) => {
    self.fetch = async (input, init) => {
      const url = String(/** @type {{ url?: string }} */ (input)?.url ?? input)
      const own = url.startsWith(INDEX) ? files[url.slice(INDEX.length)] : undefined
      if (own !== undefined) return new Response(own, { headers: { 'Content-Type': url.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream' } })
      if (!interpreter.computer) throw new TypeError('There is no network here.')
      return bridged(interpreter.computer, url.startsWith(PACKAGES) ? interpreter.computer.registries.pyodide.replace('{version}', engines.pyodide?.version ?? '') + url.slice(PACKAGES.length) : input, init)
    }
    const module = (/** @type {string} */ name) => import(URL.createObjectURL(new Blob([files[name]], { type: 'text/javascript' })))
    const [{ loadPyodide }, { default: createPyodideModule }] = await Promise.all([module('pyodide.mjs'), module('pyodide.asm.mjs')])
    // `import js` reaches only these, not the worker's globals: what pyfetch and micropip use, and
    // fetch, which goes through Jean.
    const jsglobals = { fetch: (/** @type {Parameters<typeof fetch>} */ ...args) => self.fetch(...args), AbortController, AbortSignal, Headers, Request, Response, Object, Array, Promise, Uint8Array, ArrayBuffer, JSON, URL, URLSearchParams, Blob, TextEncoder, TextDecoder, setTimeout, clearTimeout }
    return loadPyodide({ indexURL: INDEX, lockFileContents: files['pyodide-lock.json'], packageBaseUrl: PACKAGES, createPyodideModule, jsglobals })
  },
}

// ─── A conversation's computer ───────────────────────────────────────────────

/** @param {{ run: number, computer: string, registries?: Record<string, string>, limits?: Record<string, number> }} data @returns {Promise<Computer>} */
async function computerOf({ run, computer: id, registries = {}, limits = {} }) {
  const { Bash, InMemoryFs, MountableFs } = await engine(run, 'shell')
  let computer = computers.get(id)
  if (!computer) {
    const [base, workspace] = [new InMemoryFs(), new InMemoryFs()]
    const fs = new MountableFs({ base, mounts: [{ mountPoint: WORKSPACE, filesystem: workspace }] })
    for (const dir of [HOME, '/tmp']) await fs.mkdir(dir, { recursive: true })
    const owner = computer = /** @type {Computer} */ ({ fs, base, workspace, run, env: null, synced: new Map(), registries, limits })
    computer.bash = new Bash({
      fs,
      cwd: WORKSPACE,
      env: { HOME, USER: 'user', LANG: 'C.UTF-8' },
      customCommands: commands(computer),
      executionLimits: { maxExecutionTimeMs: limits.time ?? 120_000, maxOutputSize: 32 * 1024 * 1024 },
      fetch: (/** @type {string} */ url, /** @type {Parameters<SecureFetch>[1]} */ options = {}) => secureFetch(owner, url, options),
    })
    computers.set(id, computer)
  }
  Object.assign(computer, { run, registries, limits })
  return computer
}

/**
 * Files Jean sends in (paths in /workspace), and files it took away; all of them, after another
 * folder's (`fresh`). @param {Computer} computer @param {Record<string, ArrayBuffer>} [put] @param {string[]} [gone] @param {boolean} [fresh]
 */
async function receive(computer, put = {}, gone = [], fresh = false) {
  const { workspace, synced } = computer
  if (fresh) for (const path of await filesOf(workspace)) await workspace.rm(path, { force: true })
  if (fresh) synced.clear()
  for (const [path, bytes] of Object.entries(put)) {
    const full = `/${path}`
    await workspace.mkdir(full.slice(0, full.lastIndexOf('/')) || '/', { recursive: true })
    await workspace.writeFile(full, new Uint8Array(bytes))
    synced.set(full, await stampOf(workspace, full))
  }
  for (const path of gone) {
    await workspace.rm(`/${path}`, { force: true })
    synced.delete(`/${path}`)
  }
}

/** @param {IFileSystem} fs @param {string} path */
const stampOf = async (fs, path) => {
  const { size, mtime } = await fs.stat(path)
  return `${size}:${+mtime}`
}

/**
 * The files of a filesystem, `node_modules` and `.git` aside, as the folder's walk leaves them: they
 * live in the computer only, so a `.git` made here never lands on a folder's own repository, which
 * the computer never sees. @param {IFileSystem} fs
 */
async function filesOf(fs) {
  const paths = []
  for (const path of fs.getAllPaths()) if (!/\/(node_modules|\.git)(\/|$)/.test(path) && (await fs.stat(path).catch(() => null))?.isFile) paths.push(path)
  return paths
}

/** What a run changed in /workspace, for Jean to keep (D162). @param {Computer} computer */
async function changes(computer) {
  const { workspace, synced } = computer
  /** @type {Record<string, ArrayBuffer>} */
  const put = {}
  const now = new Map()
  for (const path of await filesOf(workspace)) {
    const stamp = await stampOf(workspace, path)
    now.set(path, stamp)
    if (synced.get(path) !== stamp) put[path.slice(1)] = (await workspace.readFileBuffer(path)).slice().buffer
  }
  const gone = [...synced.keys()].filter((path) => !now.has(path)).map((path) => path.slice(1))
  computer.synced = now
  return { put, gone }
}

// ─── The internet, through Jean ──────────────────────────────────────────────

/**
 * A request, made by Jean under Settings › Computer, as a Response. @param {Computer} computer
 * @param {RequestInfo | URL} input @param {RequestInit} [init]
 */
async function bridged(computer, input, init = {}) {
  const request = new Request(input, init)
  const body = /^(GET|HEAD)$/.test(request.method) ? undefined : await request.arrayBuffer()
  const answer = await ask(computer.run, { type: 'fetch', url: request.url, method: request.method, headers: Object.fromEntries(request.headers), body })
  const empty = request.method === 'HEAD' || [204, 205, 304].includes(answer.status)
  const response = new Response(empty ? null : answer.body, { status: answer.status, statusText: answer.statusText, headers: answer.headers })
  Object.defineProperty(response, 'url', { value: answer.url })
  return response
}

/** The same, as the shell's curl wants it. @param {Computer} computer @param {string} url @param {Parameters<SecureFetch>[1]} options */
async function secureFetch(computer, url, { method = 'GET', headers, body } = {}) {
  const bytes = typeof body === 'string' ? new TextEncoder().encode(body) : body
  const answer = await ask(computer.run, { type: 'fetch', url, method, headers: Object.fromEntries(new Headers(headers)), body: bytes?.slice().buffer })
  return { status: answer.status, statusText: answer.statusText, headers: answer.headers, body: new Uint8Array(answer.body ?? new ArrayBuffer(0)), url: answer.url }
}

// ─── Runs ────────────────────────────────────────────────────────────────────

/** @type {Record<string, (data: any, computer: Computer) => Promise<Record<string, unknown>>>} */
const RUNS = {
  // A command, in the conversation's shell, which keeps its directory and variables between commands.
  shell: async ({ command, repl, start }, computer) => {
    if (repl) return prompted(repl, String(command ?? ''), Boolean(start), computer)
    const env = computer.env ?? undefined
    const result = await computer.bash.exec(String(command), { ...(env && { env, cwd: env.PWD }) })
    computer.env = result.env
    return { ok: true, exit: result.exitCode, stdout: result.stdout, stderr: result.stderr, cwd: result.env?.PWD }
  },
  quickjs: (data, computer) => javascript({ ...data, cwd: WORKSPACE, tool: true }, computer),
  pyodide: (data, computer) => python({ ...data, cwd: WORKSPACE, tool: true }, computer),
}

/** @param {string | Uint8Array | undefined} stdin bytes the shell carries as latin1 text */
const text = (stdin) => (typeof stdin === 'string' ? new TextDecoder().decode(Uint8Array.from(stdin, (char) => char.charCodeAt(0))) : new TextDecoder().decode(stdin ?? new Uint8Array()))

/** @param {string} stdout @param {string} stderr @param {number} exitCode */
const exit = (stdout, stderr, exitCode) => ({ stdout, stderr, exitCode })

/** What the shell adds to its own commands: Python, pip, Node's way of running JavaScript, tar, and what git, npx and uvx can't do here. @param {Computer} computer */
function commands(computer) {
  const { defineCommand } = engines.shell
  /** @param {string} name @param {(args: string[], ctx: any) => Promise<unknown>} run */
  const command = (name, run) => defineCommand(name, async (/** @type {string[]} */ args, /** @type {any} */ ctx) => {
    try {
      return await run(args, ctx)
    } catch (error) {
      return exit('', `${name}: ${said(error)}\n`, 1)
    }
  })
  /** A program's source: -c (or -e, -p) code, a file, or what comes on stdin. @param {string[]} args @param {any} ctx @param {string[]} flags */
  const source = async (args, ctx, flags) => {
    const [first, ...rest] = args
    if (first && flags.includes(first)) return { code: rest[0] ?? '', argv: rest.slice(1), print: first === '-p', name: first }
    if (first && first !== '-') return { code: await ctx.fs.readFile(ctx.fs.resolvePath(ctx.cwd, first)), argv: rest, name: first, file: ctx.fs.resolvePath(ctx.cwd, first) }
    return { code: text(ctx.stdin), argv: rest, name: '-' }
  }
  const py = async (/** @type {string[]} */ args, /** @type {any} */ ctx) => {
    if (/^(-V|--version)$/.test(args[0] ?? '')) return exit('Python 3 (Pyodide)\n', '', 0)
    if (args[0] === '-m' && args[1] === 'pip') return pip(args.slice(2), ctx)
    if (args[0] === '-m' && /^(http\.server|SimpleHTTPServer)$/.test(args[1] ?? '')) return exit('', noServer('python3'), 1)
    const program = await source(args, ctx, ['-c'])
    const ran = await python({ ...program, run: computer.run, cwd: ctx.cwd, stdin: program.name === '-' ? '' : text(ctx.stdin) }, computer)
    return exit(ran.stdout, ran.stderr, ran.exit)
  }
  const pip = async (/** @type {string[]} */ args, /** @type {any} */ ctx) => {
    const [verb, ...names] = args.filter((arg) => !/^-/.test(arg))
    if (verb !== 'install' && verb !== 'list') return exit('', 'Only pip install and pip list work here.\n', 1)
    const code = verb === 'list' ? 'import micropip\nprint("\\n".join(f"{p.name}=={p.version}" for p in micropip.list().values()))'
      : `import micropip\nawait micropip.install(${JSON.stringify(names)}, index_urls=${JSON.stringify(computer.registries.pypi ?? '')} or None)\nprint("Installed:", ", ".join(${JSON.stringify(names)}))`
    const ran = await python({ code, run: computer.run, cwd: ctx.cwd, packages: ['micropip'] }, computer)
    return exit(ran.stdout, ran.stderr, ran.exit)
  }
  const node = async (/** @type {string[]} */ args, /** @type {any} */ ctx) => {
    if (/^(-v|--version)$/.test(args[0] ?? '')) return exit('QuickJS (JavaScript)\n', '', 0)
    const program = await source(args, ctx, ['-e', '-p'])
    const ran = await javascript({ ...program, run: computer.run, cwd: ctx.cwd, env: Object.fromEntries(ctx.env ?? []) }, computer)
    return exit(ran.stdout, ran.stderr, ran.exit)
  }
  /** npx and uvx: a package's own program, which doesn't run here, a server's least of all. @param {string} name @param {string} instead */
  const runner = (name, instead) => async (/** @type {string[]} */ args) => exit('', SERVERS.test(args.filter((arg) => !arg.startsWith('-')).join(' ')) ? noServer(name) : `${name}: a package's own programs don't run here: ${instead}.\n`, 1)
  // uv's pip is pip, and its run of Python is python3's; its projects (add, sync, venv…) aren't kept here.
  const uv = async (/** @type {string[]} */ args, /** @type {any} */ ctx) => (args[0] === 'pip' ? pip(args.slice(1), ctx)
    : args[0] === 'run' && /^python3?$|\.py$/.test(args[1] ?? '') ? py(args.slice(/\.py$/.test(args[1]) ? 1 : 2), ctx)
    : exit('', 'uv: only uv pip install, uv pip list and uv run (python, or a .py file) work here.\n', 1))
  // git, which brains type by habit, says how its work is done here; a folder on This computer runs the user's own git.
  return [command('python', py), command('python3', py), command('pip', pip), command('pip3', pip), command('uv', uv), command('node', node), command('js', node), command('tar', (args, ctx) => tarCommand(args, ctx)),
    command('npm', (args, ctx) => npm(args, ctx, computer)), command('npx', runner('npx', 'npm install it, then require or import it in node')), command('uvx', runner('uvx', 'pip install it, then import it in python3')), command('git', async () => exit('', "git: no git runs here, and no repository can be reached from here. What changes in /workspace is kept after each run, and diff compares two files; a repository is read and changed through a GitHub connection.\n", 1))]
}

// ─── tar and npm ─────────────────────────────────────────────────────────────

/** The entries of a tar archive (ustar, and pax for long names). @param {Uint8Array} bytes */
function* untar(bytes) {
  const text = (/** @type {number} */ from, /** @type {number} */ to) => new TextDecoder().decode(bytes.subarray(from, to)).replace(/\0[\s\S]*$/, '')
  let long = ''
  for (let at = 0; at + 512 <= bytes.length;) {
    const name = text(at, at + 100)
    if (!name) break
    const size = parseInt(text(at + 124, at + 136).trim() || '0', 8)
    const type = text(at + 156, at + 157)
    const prefix = text(at + 257, at + 263).startsWith('ustar') ? text(at + 345, at + 500) : ''
    const body = bytes.subarray(at + 512, at + 512 + size)
    at += 512 + Math.ceil(size / 512) * 512
    if (type === 'x') long = /(?:^|\n)\d+ path=([^\n]*)/.exec(new TextDecoder().decode(body))?.[1] ?? ''
    else {
      if (type === '0' || type === '' || type === '5') yield { path: long || (prefix ? `${prefix}/${name}` : name), bytes: body, dir: type === '5' }
      long = ''
    }
  }
}

/** A tar archive of files. @param {{ path: string, bytes: Uint8Array }[]} files */
function tarball(files) {
  const blocks = []
  const encode = (/** @type {string} */ text) => new TextEncoder().encode(text)
  for (const { path, bytes } of files) {
    const header = new Uint8Array(512)
    const put = (/** @type {string} */ text, /** @type {number} */ at, /** @type {number} */ length) => header.set(encode(text).subarray(0, length), at)
    const cut = path.length > 100 ? path.indexOf('/', path.length - 101) : -1
    put(cut > 0 ? path.slice(cut + 1) : path, 0, 100)
    if (cut > 0) put(path.slice(0, cut), 345, 155)
    put('0000644', 100, 8)
    put(`${bytes.length.toString(8).padStart(11, '0')}`, 124, 12)
    put(`${Math.floor(Date.now() / 1000).toString(8).padStart(11, '0')}`, 136, 12)
    put('        0', 148, 9)
    put('ustar\u000000', 257, 8)
    put(`${header.reduce((sum, byte) => sum + byte, 0).toString(8).padStart(6, '0')}\0 `, 148, 8)
    blocks.push(header, bytes, new Uint8Array((512 - (bytes.length % 512)) % 512))
  }
  blocks.push(new Uint8Array(1024))
  const out = new Uint8Array(blocks.reduce((sum, block) => sum + block.length, 0))
  let at = 0
  for (const block of blocks) {
    out.set(block, at)
    at += block.length
  }
  return out
}

/** tar: create (c), extract (x) or list (t) an archive, gzipped with z, in -C's folder. @param {string[]} args @param {any} ctx */
async function tarCommand(args, ctx) {
  const { fs } = ctx
  const flags = new Set()
  let file = ''
  let dir = ctx.cwd
  const paths = []
  for (let i = 0; i < args.length; i++) {
    if (/^-?[cxtzvf]+$/.test(args[i]) && (i === 0 || args[i].startsWith('-'))) for (const flag of args[i].replace('-', '')) flag === 'f' ? (file = args[++i]) : flags.add(flag)
    else if (args[i] === '-C') dir = fs.resolvePath(ctx.cwd, args[++i])
    else paths.push(args[i])
  }
  if (!file) return exit('', 'tar: name the archive with -f\n', 2)
  const archive = fs.resolvePath(ctx.cwd, file)
  const { gzipSync, gunzipSync } = engines.shell.zip
  if (flags.has('c')) {
    /** @type {{ path: string, bytes: Uint8Array }[]} */
    const files = []
    const add = async (/** @type {string} */ path) => {
      const full = fs.resolvePath(dir, path)
      if ((await fs.stat(full)).isDirectory) for (const name of await fs.readdir(full)) await add(`${path}/${name}`)
      else files.push({ path, bytes: await fs.readFileBuffer(full) })
    }
    for (const path of paths) await add(path.replace(/\/+$/, ''))
    const bytes = tarball(files)
    await fs.writeFile(archive, flags.has('z') ? gzipSync(bytes) : bytes)
    return exit(flags.has('v') ? lines(files.map((each) => each.path)) : '', '', 0)
  }
  const read = await fs.readFileBuffer(archive)
  const entries = [...untar(read[0] === 0x1f && read[1] === 0x8b ? gunzipSync(read) : read)]
  if (flags.has('x')) {
    for (const entry of entries) {
      const full = fs.resolvePath(dir, entry.path)
      if (entry.dir) await fs.mkdir(full, { recursive: true })
      else {
        await fs.mkdir(full.slice(0, full.lastIndexOf('/')) || '/', { recursive: true })
        await fs.writeFile(full, entry.bytes)
      }
    }
  }
  return exit(flags.has('t') || flags.has('v') ? lines(entries.map((entry) => entry.path)) : '', '', 0)
}

/** A version's numbers; a missing or wild one (x, *) as NaN. @param {string} version */
const numbers = (version) => version.replace(/^[v=\s]+/, '').split(/[-+]/)[0].split('.').slice(0, 3).map((part) => (/^\d+$/.test(part) ? Number(part) : NaN))

/** Whether a version is in a range of npm's: exact, x, ^, ~, comparisons (">= 3.1.0 < 4" too), and their unions with ||. @param {string} version @param {string} [range] */
function satisfies(version, range = '*') {
  if (/-/.test(version.split('+')[0]) && !range.includes('-')) return false
  const v = numbers(version)
  const compare = (/** @type {number[]} */ base) => {
    for (let i = 0; i < 3; i++) if ((v[i] || 0) !== (base[i] || 0)) return Math.sign((v[i] || 0) - (base[i] || 0))
    return 0
  }
  return String(range).replace(/(\^|~|[<>]=?|=)\s+/g, '$1').split('||').some((part) => part.trim().split(/\s+/).every((comparator) => {
    if (!comparator || /^(\*|x|latest)$/i.test(comparator)) return true
    const [, op = '', rest = ''] = /^(\^|~|>=|<=|>|<|=)?(.*)$/.exec(comparator) ?? []
    const given = numbers(rest)
    const fixed = given.filter((n) => !isNaN(n)).length
    const base = given.map((n) => (isNaN(n) ? 0 : n))
    const order = compare(base)
    if (op === '>=') return order >= 0
    if (op === '>') return order > 0
    if (op === '<=') return order <= 0
    if (op === '<') return order < 0
    const same = op === '^' ? (base[0] || fixed === 1 ? 1 : base[1] || fixed === 2 ? 2 : 3) : op === '~' ? (fixed >= 2 ? 2 : 1) : fixed
    return order >= 0 && v.slice(0, same).every((n, i) => n === base[i])
  }))
}

/**
 * npm install: packages from the npm registry Settings name, into ./node_modules, flat, with their
 * dependencies, those already there too; checked against their integrity; none that runs a script
 * as it installs. With no name, those package.json lists. The names asked for are added to
 * package.json. And init, ls, and run (start, test): a script of package.json's, in the same shell,
 * unless it starts a server.
 * @param {string[]} args @param {any} ctx @param {Computer} computer
 */
async function npm(args, ctx, computer) {
  const dashes = args.indexOf('--')
  const [verb, ...specs] = args.slice(0, dashes < 0 ? undefined : dashes).filter((arg) => !arg.startsWith('-'))
  const { fs, cwd } = ctx
  const manifestPath = `${cwd}/package.json`
  const manifest = (await fs.exists(manifestPath)) ? JSON.parse(await fs.readFile(manifestPath)) : {}
  if (!verb && args.some((arg) => /^(-v|--version)$/.test(arg))) return exit('npm for this sandbox: install, init, ls and run\n', '', 0)
  if (verb === 'init' && !specs.length) {
    if (!manifest.name) {
      Object.assign(manifest, { name: cwd.split('/').pop()?.toLowerCase().replace(/[^a-z0-9._~-]+/g, '-') || 'project', version: '1.0.0', main: 'index.js', ...manifest })
      await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
    }
    return exit(`Wrote to ${manifestPath}:\n\n${JSON.stringify(manifest, null, 2)}\n`, '', 0)
  }
  if (/^(ls|list)$/.test(verb ?? '')) {
    /** @type {string[]} */
    const names = (await fs.exists(`${cwd}/node_modules`)) ? await fs.readdir(`${cwd}/node_modules`) : []
    const found = []
    for (const name of names.filter((name) => !name.startsWith('.'))) {
      if (!name.startsWith('@')) found.push(name)
      else for (const inner of await fs.readdir(`${cwd}/node_modules/${name}`)) found.push(`${name}/${inner}`)
    }
    const versions = await Promise.all(found.map(async (name) => `${name}@${JSON.parse(await fs.readFile(`${cwd}/node_modules/${name}/package.json`).catch(() => '{}')).version ?? '?'}`))
    return exit(lines(versions.sort()), '', 0)
  }
  if (/^(run|run-script|start|test)$/.test(verb ?? '')) {
    const name = /^run/.test(verb) ? specs[0] : verb
    const scripts = manifest.scripts ?? {}
    if (!name) return exit(lines(Object.entries(scripts).map(([each, line]) => `  ${each}: ${line}`)), '', 0)
    if (!scripts[name]) return exit('', `npm: package.json has no script named ${name}\n`, 1)
    if (SERVERS.test(scripts[name])) return exit('', noServer(`npm run ${name}`), 1)
    const line = [scripts[name], ...(dashes < 0 ? [] : args.slice(dashes + 1))].join(' ')
    const ran = await ctx.exec(line, { cwd })
    return exit(`> ${line}\n${ran.stdout}`, ran.stderr, ran.exitCode)
  }
  if (!/^(install|i|add)$/.test(verb ?? '')) return exit('', "npm: only install, init, ls and run work here; a package's own programs (create-…, npx) don't run.\n", 1)
  const registry = (computer.registries.npm || 'https://registry.npmjs.org/').replace(/\/?$/, '/')
  const wanted = specs.length ? specs.map((spec) => /^(@?[^@]+)(?:@(.+))?$/.exec(spec)?.slice(1) ?? [spec]) : Object.entries(manifest.dependencies ?? {})
  // Sixteen requests at once for metadata, as npm and pnpm make them, and sixteen for tarballs, which
  // never hold up the metadata that decides the next level. Each name's metadata is asked for once, in
  // npm's short form; each tarball as soon as its version is chosen.
  const [gate, downloads] = [limiter(16), limiter(16)]
  /** @type {Map<string, Promise<any>>} */
  const metas = new Map()
  const metaOf = (/** @type {string} */ name) => metas.get(name) ?? metas.set(name, gate(async () => (await bridged(computer, `${registry}${name.replace('/', '%2f')}`, { headers: { accept: 'application/vnd.npm.install-v1+json; q=1.0, application/json; q=0.8, */*' } })).json())).get(name)
  /** What each folder of node_modules holds: a package from an earlier install (old), or from this one. @type {Map<string, { at: string, version: string, dependencies?: Record<string, string>, old?: boolean } | null>} */
  const held = new Map()
  const holds = async (/** @type {string} */ at) => held.get(at) ?? held.set(at, (await fs.exists(`${at}/package.json`)) ? { ...JSON.parse(await fs.readFile(`${at}/package.json`)), at, old: true } : null).get(at)
  // Where node looks from the package that needs one: its own node_modules, then each one above it;
  // what it finds there, and whether that will do.
  const look = async (/** @type {{ from: string, name: string, range: string, any: boolean }} */ { from, name, range, any }) => {
    const chain = from.slice(cwd.length).split('/node_modules/').map((_, i, parts) => `${cwd}${parts.slice(0, parts.length - i).join('/node_modules/')}/node_modules/${name}`)
    let found = null
    for (const at of chain) if ((found = await holds(at))) break
    return { chain, found, ok: Boolean(found && (any || range === 'latest' || satisfies(found.version, range))) }
  }
  const needs = (/** @type {string} */ from, /** @type {Record<string, string>} */ dependencies = {}, any = false) => Object.entries(dependencies).map(([name, range]) => ({ from, name, range: String(range), any }))
  /** The packages this install writes, by folder. @type {Map<string, string>} */
  const added = new Map()
  const writes = /** @type {Promise<void>[]} */ ([])
  const visited = new Set()
  let level = wanted.map(([name, range]) => ({ from: cwd, name, range: range || 'latest', any: false }))
  // A level at a time, so where a package goes never depends on which answer came first.
  let failed = await (async () => {
    while (level.length) {
      const next = []
      // What this level lacks, asked for at once: nothing, when node_modules has it all.
      for (const edge of level) if (!(await look(edge)).ok) metaOf(edge.name).catch(() => {})
      for (const edge of level) {
        const { from, name, range } = edge
        const { chain, found, ok } = await look(edge)
        // There already, and so is what it needs, in any version.
        if (found && ok) {
          if (found.old && !visited.has(found.at) && visited.add(found.at)) next.push(...needs(found.at, found.dependencies, true))
          continue
        }
        // At the top of node_modules, unless another version is there: then in its dependent's own.
        const at = found ? chain[0] : /** @type {string} */ (chain.at(-1))
        if (found?.at === at && !found.old) continue
        const meta = await metaOf(name)
        if (!meta?.versions) throw new Error(`${name} isn't in the registry`)
        const version = meta['dist-tags']?.[range] ?? Object.keys(meta.versions).filter((each) => satisfies(each, range)).sort((a, b) => (satisfies(a, `>${b}`) ? 1 : -1)).at(-1)
        if (!version) throw new Error(`No version of ${name} matches ${range}`)
        const info = meta.versions[version]
        if (info.hasInstallScript || Object.keys(info.scripts ?? {}).some((script) => /^(pre|post)?install$/.test(script))) throw new Error(`${name}@${version} runs a script as it installs, which can't run here`)
        held.set(at, { at, version, dependencies: info.dependencies })
        added.set(at, version)
        await fs.rm(at, { recursive: true, force: true })
        writes.push(downloads(() => bridged(computer, info.dist.tarball)).then(async (response) => unpack(fs, at, new Uint8Array(await response.arrayBuffer()), `${name}@${version}`, info.dist.integrity)))
        next.push(...needs(at, info.dependencies))
      }
      level = next
    }
  })().catch((error) => error)
  // Every download ends before npm answers, so nothing is written after it.
  for (const result of await Promise.allSettled(writes)) if (result.status === 'rejected') failed ??= result.reason
  if (failed) throw failed
  const top = (/** @type {string} */ name) => added.get(`${cwd}/node_modules/${name}`)
  if (specs.length) {
    manifest.dependencies = { ...manifest.dependencies, ...Object.fromEntries(wanted.map(([name]) => [name, top(name) ? `^${top(name)}` : manifest.dependencies?.[name] ?? '*'])) }
    await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  }
  if (!added.size) return exit('up to date\n', '', 0)
  return exit(`added ${added.size} package${added.size === 1 ? '' : 's'}\n${lines([...added].map(([at, version]) => `${at.slice(at.lastIndexOf('/node_modules/') + 14)}@${version}`))}`, '', 0)
}

/**
 * A package's tarball, checked against the registry's integrity, into its folder, its package.json
 * last, so a package cut short is fetched again by the next install.
 * @param {IFileSystem} fs @param {string} at @param {Uint8Array<ArrayBuffer>} tgz @param {string} what @param {string} [integrity]
 */
async function unpack(fs, at, tgz, what, integrity = '') {
  const [, algorithm, expected] = /^sha(512|256|1)-(.+)$/.exec(integrity) ?? []
  if (algorithm && crypto.subtle && btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest(`SHA-${algorithm}`, tgz)))) !== expected) throw new Error(`${what} isn't what the registry says it is`)
  const tar = new Uint8Array(await new Response(new Blob([tgz]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer())
  const last = (/** @type {{ path: string }} */ entry) => Number(/^[^/]+\/package\.json$/.test(entry.path))
  for (const entry of [...untar(tar)].filter((entry) => !entry.dir).sort((a, b) => last(a) - last(b))) {
    const path = `${at}/${entry.path.replace(/^[^/]+\//, '')}`
    await fs.mkdir(dirOf(path), { recursive: true })
    await fs.writeFile(path, entry.bytes)
  }
}

/** Runs what it is given at most `size` at a time, the others in turn. @param {number} size */
function limiter(size) {
  let busy = 0
  /** @type {(() => void)[]} */
  const waiting = []
  // A job that ends hands its place to the next one waiting, or frees it.
  const done = () => (waiting.length ? waiting.shift()?.() : busy--)
  /** @template T @param {() => Promise<T>} job @returns {Promise<T>} */
  return async (job) => {
    if (busy < size) busy++
    else await new Promise((resolve) => waiting.push(() => resolve(undefined)))
    return job().finally(done)
  }
}

// ─── Packages, for node ──────────────────────────────────────────────────────

/** @param {string} path */
const dirOf = (path) => path.slice(0, path.lastIndexOf('/')) || '/'

/** A path without its . and .. parts. @param {string} path */
function normal(path) {
  const parts = []
  for (const part of path.split('/')) {
    if (part === '..') parts.pop()
    else if (part && part !== '.') parts.push(part)
  }
  return `/${parts.join('/')}`
}

/**
 * Where an import or a require leads, as Node finds it: one of Node's own modules here, a relative
 * path with its extension or index, or a package in the nearest node_modules, by its exports, module or main.
 * @param {Map<string, string>} files @param {string} base the importing file @param {string} spec @param {'import' | 'require'} kind
 */
function resolve(files, base, spec, kind) {
  const own = OWN.exec(spec)
  if (own) return `node:${own[1]}`
  const file = (/** @type {string} */ path) => ['', '.js', '.mjs', '.cjs', '.json', '/index.js', '/index.mjs', '/index.cjs'].map((end) => path + end).find((each) => files.has(each))
  if (/^\.{0,2}\//.test(spec)) return file(normal(spec.startsWith('/') ? spec : `${dirOf(base)}/${spec}`))
  const [, name = '', sub] = /^((?:@[^/]+\/)?[^/]+)(?:\/(.*))?$/.exec(spec) ?? []
  for (let dir = dirOf(base); ; dir = dirOf(dir)) {
    const at = `${dir === '/' ? '' : dir}/node_modules/${name}`
    const manifest = files.get(`${at}/package.json`)
    if (manifest) {
      const pkg = JSON.parse(manifest)
      /** @param {any} entry @returns {string | undefined} */
      const pick = (entry) => (typeof entry === 'string' ? entry : Array.isArray(entry) ? pick(entry[0]) : entry && (pick(entry[kind]) ?? pick(entry.node) ?? pick(entry.default)))
      const exported = pkg.exports && (typeof pkg.exports === 'string' || Array.isArray(pkg.exports) || !Object.keys(pkg.exports)[0]?.startsWith('.') ? (sub ? undefined : pkg.exports) : pkg.exports[sub ? `./${sub}` : '.'])
      const entry = pick(exported) ?? (sub ? sub : (kind === 'import' && pkg.module) || pkg.main || 'index.js')
      return file(normal(`${at}/${entry}`))
    }
    if (dir === '/') return undefined
  }
}

/** Why a module isn't there. @param {string} spec */
const missing = (spec) => new Error(SERVER_MODULES.test(spec) ? noServer('node').trim()
  : NODE.test(spec) ? `Cannot find module '${spec}': of Node's own modules, only path, fs, os, util, events, process and buffer are here`
  : `Cannot find module '${spec}': install it with npm install in bash, or name it by its path`)

/** Whether a file is an ES module rather than CommonJS. @param {string} path @param {string} source */
const isModule = (path, source) => path.endsWith('.mjs') || (!path.endsWith('.cjs') && /^\s*(import\s*[\w{*'"]|export\s)/m.test(source))


// ─── JavaScript (QuickJS) ────────────────────────────────────────────────────

// What a script can use, besides plain JavaScript. Every call goes through __call, or __host for
// the computer's files and the internet. csv() reads a CSV as csvRows (caps/made/formats.js) does,
// its header the first row of two filled cells or more, so a title line above the table is left out.
const PRELUDE = `
globalThis.tools = new Proxy({}, { get: (_, name) => (args = {}) => __call(String(name), JSON.stringify(args)) })
globalThis.searchTools = (query) => tools.find_tools({ query })
globalThis.models = {
  decide: async (state, questions) => JSON.parse(await tools.decide({ state, questions })),
}
globalThis.file = (name) => tools.file({ file: name })
globalThis.fs = {
  readFile: (path) => __host('read', String(path)),
  writeFile: async (path, text) => { await __host('write', JSON.stringify([String(path), String(text)])) },
  readdir: async (path = '.') => JSON.parse(await __host('list', String(path))),
  exists: async (path) => (await __host('exists', String(path))) === 'true',
}
// Timers, as Node's (D178): each waits on the worker's, which isn't computing time, and the run lasts
// until none is left; a cleared one's wait ends at once. What a callback throws is printed.
let __timer = 0
const __timers = new Set()
const __later = (fn, ms, args, again, id = ++__timer) => {
  const tick = () => __sleep(String(Math.max(0, Number(ms) || 0)), String(id)).then(() => __timers.has(id) && (again || __timers.delete(id)) && (fn(...args), again && tick()))
    .catch((error) => '__exit' in Object(error) || console.error(error))
  __timers.add(id).size && tick()
  return { ref() { return this }, unref() { return this }, hasRef: () => true, [Symbol.toPrimitive]: () => id }
}
Object.assign(globalThis, { setTimeout: (fn, ms, ...args) => __later(fn, ms, args, false), setInterval: (fn, ms, ...args) => __later(fn, ms, args, true),
  setImmediate: (fn, ...args) => __later(fn, 0, args, false), queueMicrotask: (fn) => { Promise.resolve().then(fn) } })
globalThis.clearTimeout = globalThis.clearInterval = globalThis.clearImmediate = (timer) => { if (__timers.delete(Number(timer))) __wake(String(Number(timer))) }
globalThis.fetch = async (url, init = {}) => {
  const r = JSON.parse(await __host('fetch', JSON.stringify({ url: String(url), method: init.method, headers: init.headers, body: init.body })))
  const headers = { get: (name) => r.headers[String(name).toLowerCase()] ?? null }
  return { ok: r.status >= 200 && r.status < 300, status: r.status, statusText: r.statusText, url: r.url, headers, text: async () => r.body, json: async () => JSON.parse(r.body) }
}
globalThis.csv = (text) => {
  const rows = (source, separator) => {
    const rows = [[]]
    let cell = '', quoted = false
    for (let i = 0; i < source.length; i++) {
      const c = source[i]
      if (quoted) { if (c === '"' && source[i + 1] === '"') cell += source[i++]; else if (c === '"') quoted = false; else cell += c }
      else if (c === '"' && !cell.trim()) quoted = true
      else if (c === separator || c === '\\n') { rows.at(-1).push(cell.trim()); cell = ''; if (c === '\\n') rows.push([]) }
      else cell += c
    }
    rows.at(-1).push(cell.trim())
    return rows.filter((row) => row.some(Boolean))
  }
  const alike = (rows) => Math.max(0, ...rows.map((row) => (row.length > 1 ? rows.filter((other) => other.length === row.length).length : 0)))
  const source = String(text).replace(/^\\ufeff/, '').replace(/\\r\\n?/g, '\\n'), named = /^"?sep=(.)"?\\n/i.exec(source)
  const all = rows(source.slice(named?.[0].length ?? 0), named?.[1] ?? [...'\\t;,'].map((s) => [s, alike(rows(source.slice(0, 65536), s).slice(0, 100))]).reduce((a, b) => (b[1] > a[1] ? b : a))[0])
  const [head, ...body] = all.slice(Math.max(0, all.findIndex((row) => row.filter(Boolean).length > 1)))
  return body.map((row) => Object.fromEntries(row.map((value, i) => [head[i] ?? 'column ' + (i + 1), /^-?\\d+(\\.\\d+)?$/.test(value) ? Number(value) : value])))
}
`
// require(), Node's way, from Node's own modules, the computer's files and node_modules (resolved by the worker).
const REQUIRE = `
const __cache = {}
globalThis.__requireFrom = (base) => (spec) => {
  const path = __resolve(base, String(spec))
  if (path.startsWith('node:')) return __node[path.slice(5)]
  if (__cache[path]) return __cache[path].exports
  const module = { exports: {} }
  __cache[path] = module
  const source = __source(path)
  if (path.endsWith('.json')) module.exports = JSON.parse(source)
  else new Function('module', 'exports', 'require', '__filename', '__dirname', source)(module, module.exports, __requireFrom(path), path, path.slice(0, path.lastIndexOf('/')))
  return module.exports
}
globalThis.require = __requireFrom(__cwd + '/[eval]')
`
// As a command, Node's way: process, which says it is Node, so packages take their Node ways (D178),
// and console to stdout and stderr, as util.format writes it.
const PROCESS = `
globalThis.process = { argv: JSON.parse(__argv), env: JSON.parse(__env), cwd: () => __cwd, exit: (code = 0) => { throw { __exit: Number(code) } }, platform: 'browser',
  version: 'v22.0.0', versions: { node: '22.0.0' }, release: { name: 'node' }, nextTick: (fn, ...args) => queueMicrotask(() => fn(...args)) }
for (const level of ['log', 'info', 'warn', 'error']) {
  const write = console[level]
  console[level] = (...args) => write(__node.util.format(...args))
}
`

/**
 * What `__fs` (fileSync) answers inside QuickJS, by operation: its bytes cross as an ArrayBuffer.
 * @typedef {{ stat: string, list: string, read: string, bytes: ArrayBuffer, write: undefined, mkdir: undefined, rm: undefined }} FileOps
 */
/**
 * Node's path, as nodeModules makes it.
 * @typedef {object} NodePath
 * @property {string} sep
 * @property {string} delimiter
 * @property {(p: string) => boolean} isAbsolute
 * @property {(p: string) => string} normalize
 * @property {(...parts: string[]) => string} join
 * @property {(...parts: string[]) => string} resolve
 * @property {(p: string) => string} dirname
 * @property {(p: string, ext?: string) => string} basename
 * @property {(p: string) => string} extname
 * @property {(from: string, to: string) => string} relative
 * @property {(p: string) => { root: string, dir: string, base: string, ext: string, name: string }} parse
 * @property {NodePath} [posix]
 */
/**
 * The encodings Buffer knows: feross's names, which Node's types know too.
 * @typedef {'hex' | 'utf8' | 'utf-8' | 'ascii' | 'latin1' | 'binary' | 'base64' | 'ucs2' | 'ucs-2' | 'utf16le' | 'utf-16le'} Encoding
 */
/** @typedef {Encoding | { encoding?: Encoding } | null} NodeEncoding */
/** @typedef {{ size: number, mtime: Date, mtimeMs: number, isFile: () => boolean, isDirectory: () => boolean }} NodeStats */
/**
 * Node's fs, as nodeModules makes it: each …Sync function, then the same under its name without
 * Sync, with a callback, and in `promises`.
 * @typedef {{
 *   [name: string]: unknown,
 *   readFileSync: (p: string, options?: NodeEncoding) => string | InstanceType<typeof Buffer>,
 *   writeFileSync: (p: string, data: string | ArrayBufferView | ArrayBuffer, options?: NodeEncoding) => undefined,
 *   appendFileSync: (p: string, data: string | ArrayBufferView | ArrayBuffer, options?: NodeEncoding) => undefined,
 *   existsSync: (p: string) => boolean,
 *   statSync: (p: string) => NodeStats,
 *   lstatSync: (p: string) => NodeStats,
 *   readdirSync: (p: string, options?: { withFileTypes?: boolean }) => (string | NodeStats & { name: string })[],
 *   mkdirSync: (p: string, options?: { recursive?: boolean }) => undefined,
 *   rmSync: (p: string, options?: { recursive?: boolean, force?: boolean }) => undefined,
 *   unlinkSync: (p: string) => undefined,
 *   promises: Record<string, (...args: unknown[]) => Promise<unknown>>,
 * }} NodeFs
 */
/**
 * Node's util, as nodeModules makes it.
 * @typedef {object} NodeUtil
 * @property {(value: unknown) => string} inspect
 * @property {(first: unknown, ...args: unknown[]) => string} format
 * @property {(fn: (...args: unknown[]) => void) => (...args: unknown[]) => Promise<unknown>} promisify
 * @property {(child: Function, parent: Function) => void} inherits
 * @property {<T>(fn: T) => T} deprecate
 * @property {(a: unknown, b: unknown) => boolean} isDeepStrictEqual
 */
/**
 * An event's listener; `listener` is the one `once` wraps.
 * @typedef {((...args: unknown[]) => void) & { listener?: Listener }} Listener
 */
/**
 * Node's EventEmitter's methods, on every emitter's prototype, as nodeModules makes them.
 * @typedef {object} Emitter
 * @property {Record<string | symbol, Listener[]>} [_events]
 * @property {(name: string | symbol, listener: Listener) => Emitter} on
 * @property {(name: string | symbol, listener: Listener) => Emitter} once
 * @property {(name: string | symbol, listener: Listener) => Emitter} off
 * @property {(name: string | symbol, ...args: unknown[]) => boolean} emit
 * @property {(name: string | symbol) => Listener[]} listeners
 * @property {(name: string | symbol) => number} listenerCount
 * @property {(name?: string | symbol) => Emitter} removeAllListeners
 * @property {() => Emitter} setMaxListeners
 */

// Node's own modules here (D178): path, fs (at once, or with a callback or a promise), os, util,
// events, process and buffer. Its source runs in QuickJS, with fileSync as `file`, from `cwd`.
/** @param {<Op extends keyof FileOps>(op: Op, path: string, data: string | ArrayBufferLike) => FileOps[Op]} file @param {string} cwd */
function nodeModules(file, cwd) {
  /** @type {NodePath} */
  const path = {
    sep: '/',
    delimiter: ':',
    isAbsolute: (p) => p.startsWith('/'),
    normalize(p) {
      const parts = []
      for (const part of p.split('/')) {
        if (part === '..' && parts.length && parts.at(-1) !== '..') parts.pop()
        else if (part === '..' ? !p.startsWith('/') : part && part !== '.') parts.push(part)
      }
      return ((p.startsWith('/') ? '/' : '') + parts.join('/') || '.') + (parts.length && p.endsWith('/') ? '/' : '')
    },
    join: (...parts) => path.normalize(parts.filter(Boolean).join('/')),
    resolve(...parts) {
      let resolved = cwd
      for (const part of parts) if (part) resolved = part.startsWith('/') ? part : `${resolved}/${part}`
      return path.normalize(resolved).replace(/(.)\/$/, '$1')
    },
    dirname(p) {
      const trimmed = p.replace(/(.)\/+$/, '$1')
      return trimmed.includes('/') ? trimmed.slice(0, trimmed.lastIndexOf('/')) || '/' : '.'
    },
    basename(p, ext = '') {
      const base = /** @type {string} */ (p.replace(/(.)\/+$/, '$1').split('/').pop())
      return ext && base !== ext && base.endsWith(ext) ? base.slice(0, -ext.length) : base
    },
    extname(p) {
      const base = path.basename(p)
      return base.lastIndexOf('.') > 0 ? base.slice(base.lastIndexOf('.')) : ''
    },
    relative(from, to) {
      const [a, b] = [from, to].map((p) => path.resolve(p).split('/').filter(Boolean))
      let same = 0
      while (same < a.length && a[same] === b[same]) same++
      return [...a.slice(same).fill('..'), ...b.slice(same)].join('/')
    },
    parse(p) {
      const [base, ext] = [path.basename(p), path.extname(p)]
      return { root: p.startsWith('/') ? '/' : '', dir: path.dirname(p), base, ext, name: base.slice(0, base.length - ext.length) }
    },
  }
  path.posix = path

  // Errors carry Node's code. A file's bytes cross as an ArrayBuffer: text as UTF-8, or in the encoding named.
  /** @template {keyof FileOps} Op @param {Op} op @param {unknown} p @param {string | ArrayBufferView} [data] @returns {FileOps[Op]} */
  const call = (op, p, data = '') => {
    try {
      return file(op, path.resolve(String(p)), typeof data === 'string' ? data : data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength))
    } catch (error) {
      throw Object.assign(/** @type {Error} */ (error), { code: /^E[A-Z]+/.exec(/** @type {Error} */ (error).message)?.[0] })
    }
  }
  const encoding = (/** @type {NodeEncoding | undefined} */ options) => (typeof options === 'string' ? options : options?.encoding)
  const bytes = (/** @type {string | ArrayBufferView | ArrayBuffer} */ data, /** @type {NodeEncoding | undefined} */ options) => (typeof data === 'string' ? Buffer.from(data, encoding(options)) : ArrayBuffer.isView(data) ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength) : new Uint8Array(data))
  /** @param {string} p @returns {NodeStats} */
  const stat = (p) => {
    const { folder, size, mtime } = /** @type {{ folder: boolean, size: number, mtime: number }} */ (JSON.parse(call('stat', p)))
    return { size, mtime: new Date(mtime), mtimeMs: mtime, isFile: () => !folder, isDirectory: () => folder }
  }
  /** @type {NodeFs} */
  const fs = {
    readFileSync: (p, options) => (/^utf-?8$/i.test(encoding(options) ?? '') ? call('read', p) : encoding(options) ? Buffer.from(call('bytes', p)).toString(encoding(options)) : Buffer.from(call('bytes', p))),
    writeFileSync: (p, data, options) => call('write', p, bytes(data, options)),
    appendFileSync: (p, data, options) => call('write', p, Buffer.concat([fs.existsSync(p) ? /** @type {InstanceType<typeof Buffer>} */ (fs.readFileSync(p)) : Buffer.alloc(0), bytes(data, options)])),
    existsSync: (p) => {
      try {
        return Boolean(call('stat', p))
      } catch {
        return false
      }
    },
    statSync: stat,
    lstatSync: stat,
    readdirSync: (p, options) => /** @type {string[]} */ (JSON.parse(call('list', p))).map((name) => (options?.withFileTypes ? { name, ...stat(path.join(p, name)) } : name)),
    mkdirSync: (p, options) => call('mkdir', p, options?.recursive ? 'recursive' : ''),
    rmSync: (p, options) => (options?.force && !fs.existsSync(p) ? undefined : call('rm', p, options?.recursive ? 'recursive' : '')),
    unlinkSync: (p) => call('rm', p),
    promises: {},
  }
  for (const [name, sync] of Object.entries(fs)) {
    if (!name.endsWith('Sync') || name === 'existsSync') continue
    const promised = (fs.promises[name.slice(0, -4)] = async (...args) => /** @type {(...args: unknown[]) => unknown} */ (sync)(...args))
    fs[name.slice(0, -4)] = (/** @type {unknown[]} */ ...args) => {
      const done = /** @type {(error: unknown, value?: unknown) => void} */ (typeof args.at(-1) === 'function' ? args.pop() : () => {})
      promised(...args).then((value) => done(null, value), done)
    }
  }

  const os = { EOL: '\n', platform: () => 'browser', arch: () => 'wasm32', hostname: () => 'computer', homedir: () => '/home/user', tmpdir: () => '/tmp', cpus: () => [{ model: 'QuickJS' }] }

  // As Node shows a value, on one line: strings quoted, objects as { key: value }, a class's by its name.
  /** @param {unknown} value @param {unknown[]} [seen] @returns {string} */
  const inspect = (value, seen = []) => {
    if (typeof value === 'string') return `'${JSON.stringify(value).slice(1, -1).replaceAll('\\"', '"').replaceAll("'", "\\'")}'`
    if (typeof value === 'function') return `[${/^class\b/.test(String(value)) ? 'class' : 'Function'}: ${value.name || '(anonymous)'}]`
    if (typeof value === 'bigint') return `${value}n`
    if (!value || typeof value !== 'object') return String(value)
    if (seen.includes(value)) return '[Circular]'
    if (typeof /** @type {Record<symbol, unknown>} */ (value)[Symbol.for('nodejs.util.inspect.custom')] === 'function') return String(/** @type {Record<symbol, () => unknown>} */ (value)[Symbol.for('nodejs.util.inspect.custom')]())
    if (value instanceof Error) return value.stack ? `${value}\n${value.stack.trimEnd()}` : String(value)
    if (value instanceof Date) return value.toISOString()
    if (value instanceof RegExp) return String(value)
    const inner = (/** @type {unknown} */ each) => inspect(each, [...seen, value])
    const items = Array.isArray(value) ? value.map(inner)
      : value instanceof Map ? [...value].map(([key, each]) => `${inner(key)} => ${inner(each)}`)
      : value instanceof Set ? [...value].map(inner)
      : Object.entries(value).map(([key, each]) => `${/^[A-Za-z_$][\w$]*$/.test(key) ? key : inspect(key)}: ${inner(each)}`)
    const kind = value instanceof Map || value instanceof Set ? `${value.constructor.name}(${value.size}) `
      : Array.isArray(value) || value.constructor === Object ? '' : `${value.constructor?.name ?? '[Object: null prototype]'} `
    const [open, close] = Array.isArray(value) ? ['[', ']'] : ['{', '}']
    return items.length ? `${kind}${open} ${items.join(', ')} ${close}` : `${kind}${open}${close}`
  }
  const shown = (/** @type {unknown} */ value) => (typeof value === 'string' ? value : inspect(value))
  /** @type {NodeUtil} */
  const util = {
    inspect: (value) => inspect(value),
    format: (first, ...args) => [typeof first === 'string' ? first.replace(/%[sdifjoO%]/g, (match) => (match === '%%' ? '%' : !args.length ? match
      : match === '%s' ? shown(args.shift()) : match === '%j' ? JSON.stringify(args.shift()) : /%[dif]/.test(match) ? String(Number(args.shift())) : inspect(args.shift()))) : shown(first), ...args.map(shown)].join(' '),
    promisify: (fn) => (...args) => new Promise((resolve, reject) => fn(...args, (/** @type {unknown} */ error, /** @type {unknown} */ value) => (error ? reject(error) : resolve(value)))),
    inherits: (child, parent) => Object.setPrototypeOf(child.prototype, parent.prototype),
    deprecate: (fn) => fn,
    isDeepStrictEqual: (a, b) => JSON.stringify(a) === JSON.stringify(b),
  }

  // A function, not a class, for the packages that call it on their own `this`.
  function EventEmitter() {}
  Object.assign(EventEmitter.prototype, /** @type {Emitter} */ ({
    on(name, listener) {
      this._events ??= {}
      ;(this._events[name] ??= []).push(listener)
      return this
    },
    once(name, listener) {
      const once = (/** @type {unknown[]} */ ...args) => {
        this.off(name, once)
        listener.apply(this, args)
      }
      once.listener = listener
      return this.on(name, once)
    },
    off(name, listener) {
      if (this._events?.[name]) this._events[name] = this._events[name].filter((each) => each !== listener && each.listener !== listener)
      return this
    },
    emit(name, ...args) {
      const listeners = [...(this._events?.[name] ?? [])]
      if (name === 'error' && !listeners.length) throw args[0]
      for (const listener of listeners) listener.apply(this, args)
      return listeners.length > 0
    },
    listeners(name) {
      return (this._events?.[name] ?? []).map((each) => each.listener ?? each)
    },
    listenerCount(name) {
      return this.listeners(name).length
    },
    removeAllListeners(name) {
      if (name === undefined) this._events = {}
      else delete this._events?.[name]
      return this
    },
    setMaxListeners() {
      return this
    },
  }))
  EventEmitter.prototype.addListener = EventEmitter.prototype.on
  EventEmitter.prototype.removeListener = EventEmitter.prototype.off
  EventEmitter.EventEmitter = EventEmitter

  return { path, fs, 'fs/promises': fs.promises, os, util, events: EventEmitter, process: globalThis.process, buffer: globalThis.__buffer }
}
// After process; with the names each exports, for import.
const NODE_MODULES = `
globalThis.__node = (${nodeModules})(__fs, __cwd)
Object.fromEntries(Object.entries(__node).map(([name, module]) => [name, Object.keys(Object(module)).join()]))
`

/**
 * What jsContext makes. `settle` ends in a handle, or in the exit a script asked for (process.exit).
 * @typedef {object} JsContext
 * @property {QuickJSContext} vm
 * @property {number} run
 * @property {boolean} alive
 * @property {string[]} logs
 * @property {string[]} errors
 * @property {number} logged
 * @property {number} spent
 * @property {number} started
 * @property {(value?: unknown) => void} [moved] what `idle` waits on, called as something the script started settles
 * @property {(work: () => void) => void} step
 * @property {(run: number) => Promise<void>} begin
 * @property {() => Promise<void>} idle
 * @property {(handle: QuickJSHandle) => Promise<QuickJSHandle | { exit: number, dispose?: undefined }>} settle
 * @property {() => void} dispose
 */

/**
 * QuickJS, ready for JavaScript on a computer: the console, Jean's tools and the computer's files,
 * require and import, Node's own modules. Each run `begin`s on it: its id, its output and computing
 * time from naught, and the computer's scripts and packages read anew, as require and import are
 * synchronous. The user's node keeps one between lines (D180); a run's own goes with it.
 * @param {{ run: number, cwd: string, tool?: boolean, argv?: string[], name?: string, env?: Record<string, string>, limits?: Record<string, number> }} options
 * @param {Computer} computer
 */
async function jsContext({ run, cwd, tool = false, argv = [], name = '-', env = {}, limits = {} }, computer) {
  // Its loader adds feross's Buffer, as text.
  const quickjs = /** @type {QuickJSWASMModule & { buffer: string }} */ (await engine(run, 'quickjs'))
  const cpu = limits.cpu ?? 20_000
  const output = limits.output ?? 6000
  const runtime = quickjs.newRuntime()
  runtime.setMemoryLimit(limits.memory ?? 64 * 1024 * 1024)
  runtime.setMaxStackSize(512 * 1024)
  const vm = runtime.newContext()
  /** @type {Set<QuickJSDeferredPromise>} */
  const pending = new Set()
  /** The timers' waits, by id, which clearing a timer ends early. @type {Map<string, (value?: unknown) => void>} */
  const waits = new Map()
  /** @type {Map<string, string>} */
  const files = new Map()
  /** @type {JsContext} */
  const js = {
    vm,
    run,
    alive: true,
    /** @type {string[]} */
    logs: [],
    /** @type {string[]} */
    errors: [],
    logged: 0,
    // Computing time only: waiting for Jean (or for the user's approval) doesn't count.
    spent: 0,
    started: Date.now(),
    /** @param {() => void} work */
    step(work) {
      js.started = Date.now()
      try {
        work()
      } finally {
        js.spent += Date.now() - js.started
      }
    },
    /** @param {number} run */
    async begin(run) {
      Object.assign(js, { run, logs: [], errors: [], logged: 0, spent: 0 })
      files.clear()
      for (const path of computer.fs.getAllPaths()) {
        if (/\/node_modules\/.*\.(m?js|cjs|json)$|\.(m?js|cjs)$|\/package\.json$/.test(path)) files.set(path, await computer.fs.readFile(path).catch(() => ''))
      }
    },
    /** Waits, as Node does, until nothing the script started is pending (timers, Jean's answers, the internet), told by `moved`. */
    async idle() {
      while (js.alive && pending.size) await new Promise((resolve) => { js.moved = resolve })
    },
    /** Waits for a value in the script's world, a promise or not. @param {QuickJSHandle} handle */
    async settle(handle) {
      const settled = vm.resolvePromise(handle)
      handle.dispose()
      js.step(() => runtime.executePendingJobs())
      const outcome = await settled
      if (outcome.error) {
        const error = vm.dump(outcome.error)
        outcome.error.dispose()
        if (error && typeof error === 'object' && '__exit' in error) return { exit: error.__exit }
        throw new Error(typeof error === 'object' && error ? `${error.name ?? 'Error'}: ${error.message}` : String(error))
      }
      return outcome.value
    },
    dispose() {
      js.alive = false
      for (const deferred of pending) deferred.dispose()
      try {
        vm.dispose()
        runtime.dispose()
      } catch {
        // A script stopped mid-way can leave QuickJS unusable: ask for a fresh sandbox.
        engines.quickjs = null
        self.postMessage({ type: 'reset' })
      }
    },
  }
  runtime.setInterruptHandler(() => js.spent + Date.now() - js.started > cpu)
  try {
    /** @param {string} label @param {'logs' | 'errors'} into */
    const writer = (label, into) => vm.newFunction(label, (/** @type {QuickJSHandle[]} */ ...args) => {
      const line = args.map((handle) => show(vm.dump(handle))).join(' ')
      js.logged += line.length
      if (!tool || js.logged < output) js[into].push(line)
    })
    const console = vm.newObject()
    for (const [label, into] of /** @type {const} */ ([['log', 'logs'], ['info', 'logs'], ['error', tool ? 'logs' : 'errors'], ['warn', tool ? 'logs' : 'errors']])) {
      const write = writer(label, into)
      vm.setProp(console, label, write)
      write.dispose()
    }
    vm.setProp(vm.global, 'console', console)
    console.dispose()
    /** A function whose promise settles when Jean, or the computer, answers. @param {string} label @param {(...args: string[]) => Promise<unknown>} work */
    const promised = (label, work) => {
      const handle = vm.newFunction(label, (/** @type {QuickJSHandle[]} */ ...args) => {
        const deferred = vm.newPromise()
        pending.add(deferred)
        work(...args.map((arg) => vm.getString(arg))).then((value) => [true, value], (error) => [false, said(error)]).then(([ok, value]) => {
          if (!js.alive || !pending.delete(deferred)) return
          const answer = ok ? vm.newString(String(value ?? '')) : vm.newError(String(value))
          ok ? deferred.resolve(answer) : deferred.reject(answer)
          answer.dispose()
          js.step(() => runtime.executePendingJobs())
          js.moved?.()
        })
        return deferred.handle
      })
      vm.setProp(vm.global, label, handle)
      handle.dispose()
    }
    promised('__call', (name, args) => ask(js.run, { type: 'call', name, args: JSON.parse(args) }))
    promised('__host', (op, arg) => host(computer, cwd, op, arg))
    promised('__sleep', (ms, id) => new Promise((resolve) => setTimeout(/** @type {(value?: unknown) => void} */ (waits.set(id, resolve).get(id)), Number(ms))).finally(() => waits.delete(id)))
    for (const [label, value] of Object.entries({ __argv: JSON.stringify(['node', name, ...argv]), __env: JSON.stringify(env), __cwd: cwd })) {
      const handle = vm.newString(value)
      vm.setProp(vm.global, label, handle)
      handle.dispose()
    }
    /** @param {string} base @param {string} spec */
    const required = (base, spec) => {
      const found = resolve(files, base, spec, 'require')
      if (!found) throw missing(spec)
      return found
    }
    for (const [label, work] of /** @type {const} */ ([['__resolve', required], ['__source', (/** @type {string} */ path) => files.get(path)], ['__wake', (/** @type {string} */ id) => waits.get(id)?.()],
      ['__fs', (/** @type {string} */ op, /** @type {string} */ path, /** @type {string | Uint8Array} */ data) => fileSync(computer, op, path, data)]])) {
      const handle = vm.newFunction(label, (/** @type {QuickJSHandle[]} */ ...args) => {
        const found = /** @type {(...args: (string | Uint8Array)[]) => string | Uint8Array | void} */ (work)(...args.map((arg) => (vm.typeof(arg) === 'object' ? vm.getArrayBuffer(arg).consume((/** @type {{ value: Uint8Array }} */ bytes) => bytes.value.slice()) : vm.getString(arg))))
        // newArrayBuffer copies a view as well (new Uint8Array(buffer)), though its types name only buffers.
        return found === undefined ? vm.undefined : found instanceof Uint8Array ? vm.newArrayBuffer(/** @type {ArrayBufferLike} */ (/** @type {unknown} */ (found))) : vm.newString(found)
      })
      vm.setProp(vm.global, label, handle)
      handle.dispose()
    }
    /** @type {Record<string, string>} */
    let named = {}
    runtime.setModuleLoader((/** @type {string} */ path) => {
      if (path.startsWith('node:')) return `const m = globalThis.__node[${JSON.stringify(path.slice(5))}]\nexport default m\nexport const { ${named[path.slice(5)]} } = m`
      const source = files.get(path) ?? ''
      if (path.endsWith('.json')) return `export default ${source}`
      if (isModule(path, source)) return source
      return `const __m = { exports: {} }\n;(function (module, exports, require, __filename, __dirname) {\n${source}\n})(__m, __m.exports, globalThis.__requireFrom(${JSON.stringify(path)}), ${JSON.stringify(path)}, ${JSON.stringify(dirOf(path))})\nexport default __m.exports`
    }, (/** @type {string} */ base, /** @type {string} */ spec) => resolve(files, base.startsWith('/') ? base : `${cwd}/${base}`, spec, 'import') ?? { error: missing(spec) })
    const prelude = vm.unwrapResult(vm.evalCode(`${quickjs.buffer}\n${PRELUDE}${REQUIRE}${tool ? '' : PROCESS}${NODE_MODULES}`, 'prelude.js'))
    named = vm.dump(prelude)
    prelude.dispose()
  } catch (error) {
    js.dispose()
    throw error
  }
  return js
}

/** Why a script stopped, as people say it. @param {unknown} error */
const stopped = (error) => (/interrupted/i.test(String(error)) ? 'The script used all its computing time and was stopped.'
  : /out of memory/i.test(String(error)) ? 'The script ran out of memory and was stopped.'
  : said(error))

/**
 * Runs JavaScript in QuickJS: as the `javascript` tool (its result is the value it returns or ends
 * on, as JSON), or as `node` (what it prints, and its exit code).
 * @param {Parameters<typeof jsContext>[0] & { code: string, print?: boolean }} options
 * @param {Computer} computer
 */
async function javascript(options, computer) {
  const { code, cwd, tool = false, print = false, name = '-' } = options
  const js = await jsContext(options, computer)
  const { vm } = js
  try {
    await js.begin(options.run)
    const { logs, errors } = js
    // The result is what the script returns or, as in a console, its last expression
    // (small brains write `Math.cos(9)` and expect its value). First as a script with
    // top-level await, which resolves to { value: <last expression> }; a top-level return
    // doesn't parse there, and nothing ran, so then as the body of an async function.
    /** @type {any} */
    let evaluated
    const exited = (/** @type {{ exit: number }} */ value) => ({ ok: true, exit: value.exit, stdout: lines(logs), stderr: lines(errors) })
    // A program with import or export is a module, whose value is nothing.
    if (!tool && isModule(name, code)) {
      js.step(() => { evaluated = vm.evalCode(code, name.startsWith('/') ? name : `${cwd}/[eval].mjs`, { type: 'module' }) })
      const done = await js.settle(vm.unwrapResult(evaluated))
      if (!done.dispose) return exited(done)
      done.dispose()
      await js.idle()
      return { ok: true, result: null, logs, exit: 0, stdout: lines(logs), stderr: lines(errors) }
    }
    js.step(() => { evaluated = vm.evalCode(code, name, ASYNC_SCRIPT) })
    const asScript = !evaluated.error
    if (!asScript) {
      evaluated.error.dispose()
      js.step(() => { evaluated = vm.evalCode(`(async () => {\n${code}\n})()`, name) })
    }
    let value = await js.settle(vm.unwrapResult(evaluated))
    if (!value.dispose) return exited(value)
    if (asScript) {
      const completion = value
      value = await js.settle(vm.getProp(completion, 'value'))
      completion.dispose()
      if (!value.dispose) return exited(value)
    }
    const result = vm.dump(value)
    value.dispose()
    if (print) logs.push(show(result))
    await js.idle()
    return { ok: true, result: result === undefined ? null : result, logs, exit: 0, stdout: lines(logs), stderr: lines(errors) }
  } catch (error) {
    const message = stopped(error)
    return { ok: false, error: message, logs: js.logs, exit: 1, stdout: lines(js.logs), stderr: lines([...js.errors, message]) }
  } finally {
    js.dispose()
  }
}

/** @param {string[]} printed */
const lines = (printed) => (printed.length ? `${printed.join('\n')}\n` : '')

/** @param {unknown} value */
function show(value) {
  return typeof value === 'string' ? value : JSON.stringify(value)
}

/**
 * What node's fs asks, at once (D178): just-bash keeps the files in maps. @param {Computer} computer @param {string} op @param {string} path @param {string | Uint8Array} text
 * @returns {string | Uint8Array | undefined}
 */
function fileSync({ fs }, op, path, text) {
  if (op === 'write') return fs.writeFileSync(path, text)
  if (op === 'mkdir') return fs.mkdirSync(path, { recursive: Boolean(text) })
  const { fs: inner, relativePath } = fs.routePath(path)
  const at = inner.resolvePathWithSymlinks(relativePath)
  const entry = inner.data.get(at)
  if (!entry) throw new Error(`ENOENT: no such file or directory, '${path}'`)
  const folder = entry.type === 'directory'
  if (op === 'stat') return JSON.stringify({ folder, size: entry.content?.length ?? 0, mtime: +entry.mtime })
  if (op === 'list') return JSON.stringify([...[...inner.data.keys()].filter((key) => key !== at && dirOf(key) === at).map((key) => key.slice(key.lastIndexOf('/') + 1)), ...fs.getChildMountPoints(path)])
  if (folder && (op === 'read' || op === 'bytes' || !text)) throw new Error(`EISDIR: illegal operation on a directory, '${path}'`)
  if (op === 'read') return typeof entry.content === 'string' ? entry.content : new TextDecoder().decode(entry.content)
  if (op === 'bytes') return typeof entry.content === 'string' ? new TextEncoder().encode(entry.content) : entry.content
  for (const key of [...inner.data.keys()]) if (key === at || key.startsWith(`${at}/`)) inner.deleteEntry(key)
}

/** What a script asks of the computer: its files, or the internet. @param {Computer} computer @param {string} cwd @param {string} op @param {string} arg */
async function host(computer, cwd, op, arg) {
  const { fs } = computer
  const at = (/** @type {string} */ path) => fs.resolvePath(cwd, path)
  if (op === 'read') return fs.readFile(at(arg))
  if (op === 'list') return JSON.stringify(await fs.readdir(at(arg)))
  if (op === 'exists') return String(await fs.exists(at(arg)))
  if (op === 'write') {
    const [path, content] = JSON.parse(arg)
    const full = at(path)
    await fs.mkdir(full.slice(0, full.lastIndexOf('/')) || '/', { recursive: true })
    return fs.writeFile(full, content)
  }
  const { url, method = 'GET', headers, body } = JSON.parse(arg)
  const response = await bridged(computer, url, { method, headers, body })
  return JSON.stringify({ status: response.status, statusText: response.statusText, url: response.url, headers: Object.fromEntries(response.headers), body: await response.text() })
}

// ─── Python (Pyodide) ────────────────────────────────────────────────────────

// What a script can use, besides Python and its packages. Every call goes through _call.
const PYTHON = `
import json as _json

class _Tools:
    def __getattr__(self, name):
        async def call(**args):
            return await _call(name, _json.dumps(args))
        return call

tools = _Tools()

async def file(name):
    return await tools.file(file=name)

async def search_tools(query):
    return await tools.find_tools(query=query)
`

/**
 * Python, one run at a time: its interpreter, and the files it sees, are shared. The computer the
 * run belongs to answers its requests to the internet; `owner` is the one whose files it holds.
 * @type {{ computer: Computer | null, owner: Computer | null, copied: Map<string, { from: string, to: string }>, turn: Promise<unknown> }}
 */
const interpreter = { computer: null, owner: null, copied: new Map(), turn: Promise.resolve() }
const ROOTS = [WORKSPACE, HOME, '/tmp']

/**
 * Runs Python: as the `python` tool (the value of its last line, as JSON), or as `python3` (what it
 * prints, and its exit code), or a line at its prompt (`repl`, D180), in the names the computer keeps
 * for it. The computer's files are copied in first, and what it changed back.
 * @param {{ run: number, code: string, cwd: string, tool?: boolean, repl?: boolean, argv?: string[], name?: string, file?: string, stdin?: string, packages?: string[], limits?: Record<string, number> }} options
 * @param {Computer} computer
 */
function python(options, computer) {
  const work = interpreter.turn.then(() => runPython(options, computer))
  interpreter.turn = work.catch(() => {})
  return work
}

/**
 * A line typed at the user's python or node in the terminal (D180), in an interpreter the computer
 * keeps between lines, afresh from each bare `python3` or `node` (`start`), as a new process would
 * be, and gone at the end of what is typed (Ctrl+D, \x04): what it prints, whether the statement
 * wants more lines (`more`), and whether it ended (`ended`).
 * @param {string} language node or python @param {string} source what was typed since its prompt was last > or >>>
 * @param {boolean} start @param {Computer} computer
 */
async function prompted(language, source, start, computer) {
  if (start || source === '\x04') {
    if (language === 'node') computer.node?.dispose()
    else computer.python?.destroy()
    computer[language === 'node' ? 'node' : 'python'] = null
  }
  if (source === '\x04') return { ok: true, exit: 0, ended: true, stdout: '', stderr: '' }
  if (language === 'node') return nodeLine(source, computer)
  return python({ code: source, run: computer.run, cwd: computer.env?.PWD ?? WORKSPACE, repl: true, name: '' }, computer)
}

/** @param {string} source @param {Computer} computer */
async function nodeLine(source, computer) {
  const banner = computer.node ? '' : 'Welcome to node (QuickJS).\nType ".help" for more information.\n'
  const js = (computer.node ??= await jsContext({ run: computer.run, cwd: computer.env?.PWD ?? WORKSPACE, name: '[repl]' }, computer))
  const { vm } = js
  const answer = (/** @type {{ stdout?: string, stderr?: string, more?: boolean, ended?: boolean }} */ more) => ({ ok: true, exit: 0, ...more, stdout: banner + lines(js.logs) + (more.stdout ?? ''), stderr: lines(js.errors) + (more.stderr ?? '') })
  const ended = () => {
    js.dispose()
    computer.node = null
    return answer({ ended: true })
  }
  await js.begin(computer.run)
  const command = source.split('\n').at(-1)?.trim()
  if (command === '.exit') return ended()
  if (command === '.help') return answer({ stdout: '.break    Sometimes you get stuck, this gets you out\n.clear    Alias for .break\n.exit     Exit the REPL\n.help     Print this help message\n\nPress Ctrl+C to abort current expression, Ctrl+D to exit the REPL\n' })
  if (!source.trim() || command === '.break' || command === '.clear') return answer({})
  /** @type {any} */
  let evaluated
  js.step(() => { evaluated = vm.evalCode(source, '[repl]', ASYNC_SCRIPT) })
  if (evaluated.error) {
    const error = vm.dump(evaluated.error)
    evaluated.error.dispose()
    // A statement cut short at its end, as `function f() {`, wants more lines.
    const [, row, column] = /:(\d+):(\d+)\s*$/.exec(error?.stack ?? '') ?? []
    const rows = source.split('\n')
    if (Number(row) === rows.length && Number(column) > (rows.at(-1)?.length ?? 0)) return answer({ more: true })
    return answer({ stderr: `Uncaught ${error?.name}: ${error?.message}\n` })
  }
  try {
    const completion = await js.settle(evaluated.value)
    if (!completion.dispose) return ended()
    const value = await js.settle(vm.getProp(completion, 'value'))
    completion.dispose()
    if (!value.dispose) return ended()
    // Its value, as Node shows it, and kept as _.
    vm.setProp(vm.global, '_', value)
    const inspect = vm.unwrapResult(vm.evalCode('__node.util.inspect'))
    const shown = vm.unwrapResult(vm.callFunction(inspect, vm.undefined, value))
    const text = vm.getString(shown)
    for (const handle of [shown, inspect, value]) handle.dispose()
    return answer({ stdout: `${text}\n` })
  } catch (error) {
    return answer({ stderr: `Uncaught ${stopped(error)}\n` })
  }
}

/** @param {Parameters<typeof python>[0]} options @param {Computer} computer */
async function runPython({ run, code, cwd, tool = false, repl = false, argv = [], name = '<string>', file, stdin = '', packages = [], limits = {} }, computer) {
  const pyodide = await engine(run, 'pyodide')
  interpreter.computer = computer
  const output = limits.output ?? 6000
  /** @type {string[]} */
  const logs = []
  /** @type {string[]} */
  const errors = []
  let logged = 0
  const write = (/** @type {string[]} */ into) => (/** @type {string} */ line) => {
    logged += line.length
    if (!tool || logged < output) into.push(line)
  }
  pyodide.setStdout({ batched: write(logs) })
  pyodide.setStderr({ batched: write(tool ? logs : errors) })
  let input = /** @type {string | null} */ (stdin)
  pyodide.setStdin({ stdin: () => { const given = input; input = null; return given || null } })
  const banner = repl && !computer.python ? `Python ${pyodide.runPython('import sys\nsys.version')} on emscripten\nType "help", "copyright", "credits" or "license" for more information.\n` : ''
  const scope = repl ? (computer.python ??= pyodide.globals.get('dict')()) : pyodide.globals.get('dict')()
  try {
    await toPython(pyodide, computer)
    pyodide.FS.mkdirTree(cwd)
    pyodide.FS.chdir(cwd)
    if (packages.length) await pyodide.loadPackage(packages, { messageCallback: () => {}, errorCallback: write(errors) })
    scope.set('_call', (/** @type {string} */ name, /** @type {string} */ args) => ask(run, { type: 'call', name, args: JSON.parse(args) }))
    scope.set('__name__', '__main__')
    if (file) scope.set('__file__', file)
    pyodide.runPython(`import sys\nsys.argv = ${JSON.stringify([name, ...argv])}`)
    await pyodide.runPythonAsync(PYTHON, { globals: scope })
    // At the prompt, as Python's own reads a line: True while the statement wants more.
    if (repl) {
      const more = pyodide.runPython(`__import__('code').InteractiveInterpreter(globals()).runsource(${JSON.stringify(code)}, '<stdin>')`, { globals: scope })
      return { ok: true, exit: 0, more, stdout: banner + lines(logs), stderr: lines(errors) }
    }
    // The result is the value of the last line, as in a console, as JSON (anything else as text).
    const value = await pyodide.runPythonAsync(code, { globals: scope, filename: name })
    scope.set('_result', value)
    value?.destroy?.()
    const json = tool ? pyodide.runPython('_json.dumps(_result, default=str, ensure_ascii=False)', { globals: scope }) : 'null'
    return { ok: true, result: JSON.parse(json), logs, exit: 0, stdout: lines(logs), stderr: lines(errors) }
  } catch (error) {
    const exited = /SystemExit: ?(\d*)/.exec(String(/** @type {{ message?: unknown } | null | undefined} */ (error)?.message))
    if (exited && repl) {
      scope.destroy()
      computer.python = null
    }
    if (exited && !tool) return { ok: true, exit: Number(exited[1] || 0), ended: repl, stdout: lines(logs), stderr: lines(errors) }
    const message = explain(error)
    return { ok: false, error: message, logs, exit: 1, stdout: lines(logs), stderr: lines([...errors, message]) }
  } finally {
    if (!repl) scope.destroy()
    await fromPython(pyodide, computer).catch(() => {})
    interpreter.computer = null
  }
}

/** Python's files: the computer's, copied in when they changed since, removed when gone. @param {any} pyodide @param {Computer} computer */
async function toPython({ FS }, computer) {
  if (interpreter.owner !== computer) for (const root of ROOTS) wipe(FS, root)
  interpreter.owner = computer
  const { fs } = computer
  const seen = new Set()
  for (const path of await filesOf(fs)) {
    if (!ROOTS.some((root) => path.startsWith(`${root}/`))) continue
    seen.add(path)
    const from = await stampOf(fs, path)
    if (interpreter.copied.get(path)?.from === from) continue
    FS.mkdirTree(path.slice(0, path.lastIndexOf('/')))
    FS.writeFile(path, await fs.readFileBuffer(path))
    interpreter.copied.set(path, { from, to: pyStamp(FS, path) })
  }
  for (const path of interpreter.copied.keys()) {
    if (seen.has(path)) continue
    try { FS.unlink(path) } catch {}
    interpreter.copied.delete(path)
  }
}

/** What Python made, changed or took away, back in the computer. @param {any} pyodide @param {Computer} computer */
async function fromPython({ FS }, computer) {
  const { fs } = computer
  const now = new Set()
  for (const path of ROOTS.flatMap((root) => walk(FS, root))) {
    now.add(path)
    const to = pyStamp(FS, path)
    if (interpreter.copied.get(path)?.to === to) continue
    await fs.mkdir(path.slice(0, path.lastIndexOf('/')), { recursive: true })
    await fs.writeFile(path, FS.readFile(path))
    interpreter.copied.set(path, { from: await stampOf(fs, path), to })
  }
  for (const path of [...interpreter.copied.keys()]) {
    if (now.has(path)) continue
    await fs.rm(path, { force: true })
    interpreter.copied.delete(path)
  }
}

/** @param {any} FS @param {string} path */
const pyStamp = (FS, path) => {
  const { size, mtime } = FS.stat(path)
  return `${size}:${+mtime}`
}

/** Every file under a folder of Python's filesystem, `node_modules` aside. @param {any} FS @param {string} dir @returns {string[]} */
function walk(FS, dir) {
  /** @type {string[]} */
  let names
  try {
    names = FS.readdir(dir)
  } catch {
    return []
  }
  return names.filter((name) => name !== '.' && name !== '..' && name !== 'node_modules').flatMap((name) => {
    const path = `${dir}/${name}`
    return FS.isDir(FS.stat(path).mode) ? walk(FS, path) : [path]
  })
}

/** @param {any} FS @param {string} dir */
function wipe(FS, dir) {
  for (const path of walk(FS, dir)) try { FS.unlink(path) } catch {}
  interpreter.copied.clear()
}

/**
 * A Python error carries its whole traceback: keep where it happened and what happened, and
 * replace Pyodide's advice to install a package by how it is done here.
 * @param {any} error
 */
function explain(error) {
  const lines = String(error?.message ?? error).trim().split('\n')
  const frame = lines.findLastIndex((line) => /^\s*File "/.test(line))
  const what = lines.slice(frame + 1).filter((line) => !/^\s/.test(line))
  const advice = what.findIndex((line) => /^You can install it/.test(line))
  if (advice >= 0) what.splice(advice, what.length, 'Install it first: pip install <package> in bash, or `import micropip` then `await micropip.install("<package>")`.')
  return [lines[frame]?.trim(), ...what].filter(Boolean).join('\n')
}
