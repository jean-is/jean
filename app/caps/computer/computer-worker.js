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
const SERVERS = /^(vite|next|nuxt|astro|serve|http-server|live-server|webpack-dev-server|parcel|nodemon)\b(?! build)|^webpack serve\b|^expo(\s+(start|web|run:\S*)\b.*)?$|^(react-native|metro) start\b/
// Node's own modules: those node has here (D178, D745), and the others, which it doesn't.
const OWN = new RegExp(`^(?:node:)?(${['path', 'path/posix', 'path/win32', 'fs', 'fs/promises', 'os', 'util', 'util/types', 'sys', 'events', 'process', 'buffer', 'assert', 'assert/strict', 'url', 'module', 'tty',
  'readline', 'readline/promises', 'stream', 'stream/promises', 'stream/consumers', 'string_decoder', 'child_process', 'crypto', 'http', 'https', 'http2', 'net', 'tls', 'dns', 'dns/promises',
  'dgram', 'zlib', 'worker_threads', 'perf_hooks', 'timers', 'timers/promises', 'vm', 'v8', 'querystring', 'async_hooks', 'diagnostics_channel', 'constants', 'console'].join('|')})$`)
const NODE = /^node:|^(cluster|domain|inspector|repl|sqlite|test|trace_events|wasi)(\/|$)/
// Where node finds Node's stream, readable-stream's (scripts/vendor.js).
const STREAM = '/usr/lib/node/stream.mjs'
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
    // (feross's, D178) comes along, for each script to start with, and readable-stream for those that ask (D745).
    return Object.assign(await newQuickJSWASMModuleFromVariant(newVariant(variant, { wasmBinary: files['emscripten-module.wasm'], wasmLocation: 'emscripten-module.wasm' })), { buffer: files['buffer.js'], stream: files['stream.js'] })
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
    const ran = await javascript({ ...program, run: computer.run, cwd: ctx.cwd, env: Object.fromEntries(ctx.env ?? []), stdin: program.name === '-' ? '' : text(ctx.stdin) }, computer)
    return exit(ran.stdout, ran.stderr, ran.exit)
  }
  // npx: a package's program, from ./node_modules, else installed once beside the others npx has, then run by node (D745).
  const npx = async (/** @type {string[]} */ args, /** @type {any} */ ctx) => {
    const rest = [...args]
    let pkg = ''
    while (rest[0]?.startsWith('-')) {
      const flag = String(rest.shift())
      if (/^(-p|--package)$/.test(flag)) pkg = String(rest.shift() ?? '')
      else if (flag.startsWith('--package=')) pkg = flag.slice(10)
    }
    const [spec = '', ...argv] = rest
    if (!spec) return exit('', 'npx: name the package whose program to run\n', 1)
    if (SERVERS.test(rest.join(' '))) return exit('', noServer('npx'), 1)
    const want = pkg || spec
    const name = /^@?[^@]+/.exec(want)?.[0] ?? want
    const bin = pkg ? spec : name.split('/').pop() ?? name
    const home = `${HOME}/.npm/_npx/${want.replace(/[^\w.@-]+/g, '+')}`
    let found = (await binOf(ctx.fs, ctx.cwd, name, bin)) ?? (await binOf(ctx.fs, home, name, bin))
    if (!found) {
      await ctx.fs.mkdir(home, { recursive: true })
      const installed = /** @type {{ exitCode: number }} */ (await npm(['install', want], { ...ctx, cwd: home }, computer))
      if (installed.exitCode) return installed
      found = await binOf(ctx.fs, home, name, bin)
    }
    return found ? node([found, ...argv], ctx) : exit('', `npx: ${want} has no program named ${bin}\n`, 1)
  }
  /** uvx: a package's own program, which doesn't run here, a server's least of all. @param {string} name @param {string} instead */
  const runner = (name, instead) => async (/** @type {string[]} */ args) => exit('', SERVERS.test(args.filter((arg) => !arg.startsWith('-')).join(' ')) ? noServer(name) : `${name}: a package's own programs don't run here: ${instead}.\n`, 1)
  // uv's pip is pip, and its run of Python is python3's; its projects (add, sync, venv…) aren't kept here.
  const uv = async (/** @type {string[]} */ args, /** @type {any} */ ctx) => (args[0] === 'pip' ? pip(args.slice(1), ctx)
    : args[0] === 'run' && /^python3?$|\.py$/.test(args[1] ?? '') ? py(args.slice(/\.py$/.test(args[1]) ? 1 : 2), ctx)
    : exit('', 'uv: only uv pip install, uv pip list and uv run (python, or a .py file) work here.\n', 1))
  // git, which brains type by habit, says how its work is done here; a folder on This computer runs the user's own git.
  return [command('python', py), command('python3', py), command('pip', pip), command('pip3', pip), command('uv', uv), command('node', node), command('js', node), command('tar', (args, ctx) => tarCommand(args, ctx)),
    command('npm', (args, ctx) => npm(args, ctx, computer)), command('npx', npx), command('uvx', runner('uvx', 'pip install it, then import it in python3')), command('git', async () => exit('', "git: no git runs here, and no repository can be reached from here. What changes in /workspace is kept after each run, and diff compares two files; a repository is read and changed through a GitHub connection.\n", 1))]
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
  if (/-/.test(version.split('+')[0]) && !/\d-\w/.test(range)) return false
  const v = numbers(version)
  const compare = (/** @type {number[]} */ base) => {
    for (let i = 0; i < 3; i++) if ((v[i] || 0) !== (base[i] || 0)) return Math.sign((v[i] || 0) - (base[i] || 0))
    return 0
  }
  // A hyphen range ("1 - 2", d3's) is its two ends, the upper one's missing parts any.
  return String(range).replace(/(\S+)\s+-\s+(\S+)/g, (_, low, high) => (high.split('.').length < 3 ? `>=${low} <${high.replace(/\d+$/, (/** @type {string} */ n) => Number(n) + 1)}` : `>=${low} <=${high}`)).replace(/(\^|~|[<>]=?|=)\s+/g, '$1').split('||').some((part) => part.trim().split(/\s+/).every((comparator) => {
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
  if (!verb && args.some((arg) => /^(-v|--version)$/.test(arg))) return exit('npm for this sandbox: install, init, ls, run, exec and create\n', '', 0)
  // exec and create (init with a name) as npx runs them: create-<name>'s program, with what follows it.
  if (/^(exec|x|create)$/.test(verb ?? '') || (verb === 'init' && specs.length)) {
    const words = args.slice(args.indexOf(/** @type {string} */ (verb)) + 1).filter((arg) => arg !== '--')
    if (!/^(exec|x)$/.test(verb ?? '')) words[0] = words[0]?.replace(/^(@[^/@]+)(?:\/([^@]+))?|^[^@]+/, (plain, scope, sub) => (scope ? `${scope}/create${sub ? `-${sub}` : ''}` : `create-${plain}`))
    const ran = await ctx.exec(['npx', ...words].map((word) => `'${word.replaceAll("'", "'\\''")}'`).join(' '), { cwd })
    return exit(ran.stdout, ran.stderr, ran.exitCode)
  }
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
  if (!/^(install|i|add)$/.test(verb ?? '')) return exit('', 'npm: only install, init, ls, run, exec and create work here.\n', 1)
  const registry = (computer.registries.npm || 'https://registry.npmjs.org/').replace(/\/?$/, '/')
  const wanted = specs.length ? specs.map((spec) => /^(@?[^@]+)(?:@(.+))?$/.exec(spec)?.slice(1) ?? [spec]) : Object.entries(manifest.dependencies ?? {})
  // Sixteen requests at once for metadata, as npm and pnpm make them, and sixteen for tarballs, which
  // never hold up the metadata that decides the next level. Each name's metadata is asked for once, in
  // npm's short form; each tarball as soon as its version is chosen.
  const [gate, downloads] = [limiter(16), limiter(16)]
  /** @type {Map<string, Promise<any>>} */
  const metas = new Map()
  const metaOf = (/** @type {string} */ name) => /** @type {Promise<any>} */ (metas.get(name) ?? metas.set(name, gate(async () => (await bridged(computer, `${registry}${name.replace('/', '%2f')}`, { headers: { accept: 'application/vnd.npm.install-v1+json; q=1.0, application/json; q=0.8, */*' } })).json())).get(name))
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
  // What a package needs: its dependencies, and its peers that aren't optional, as npm installs them (vitest's vite).
  const wants = (/** @type {{ dependencies?: Record<string, string>, peerDependencies?: Record<string, string>, peerDependenciesMeta?: Record<string, { optional?: boolean }> }} */ pkg) => ({
    ...Object.fromEntries(Object.entries(pkg.peerDependencies ?? {}).filter(([name]) => !pkg.peerDependenciesMeta?.[name]?.optional)), ...pkg.dependencies })
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
          if (found.old && !visited.has(found.at) && visited.add(found.at)) next.push(...needs(found.at, wants(found), true))
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
        held.set(at, { at, version, dependencies: wants(info) })
        added.set(at, version)
        await fs.rm(at, { recursive: true, force: true })
        writes.push(downloads(() => bridged(computer, info.dist.tarball)).then(async (response) => unpack(fs, at, new Uint8Array(await response.arrayBuffer()), `${name}@${version}`, info.dist.integrity)))
        next.push(...needs(at, wants(info)))
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
 * Where an import or a require leads, as Node finds it: one of Node's own modules here, a file: address, a path with its
 * extension or index, a folder by its main, a package's own #imports, or a package in the nearest node_modules, by its
 * exports (their * patterns too), module or main.
 * @param {Map<string, string>} files @param {string} base the importing file @param {string} spec @param {'import' | 'require'} kind
 * @returns {string | undefined}
 */
function resolve(files, base, spec, kind) {
  if (spec.startsWith('file:')) spec = decodeURIComponent(new URL(spec).pathname)
  const own = OWN.exec(spec)
  if (own) return `node:${own[1]}`
  const file = (/** @type {string} */ path) => ['', '.js', '.mjs', '.cjs', '.json', '/index.js', '/index.mjs', '/index.cjs'].map((end) => path + end).find((each) => files.has(each))
  /** @param {any} entry @returns {string | undefined} */
  const pick = (entry) => (typeof entry === 'string' ? entry : Array.isArray(entry) ? pick(entry[0]) : entry && (pick(entry[kind]) ?? pick(entry.node) ?? pick(entry.default)))
  /** @param {Record<string, any>} map @param {string} key */
  const mapped = (map, key) => {
    if (key in map) return pick(map[key])
    for (const [pattern, target] of Object.entries(map)) {
      const [head, tail = ''] = pattern.split('*')
      if (pattern.includes('*') && key.startsWith(head) && key.endsWith(tail) && key.length >= head.length + tail.length) return pick(target)?.replaceAll('*', key.slice(head.length, key.length - tail.length))
    }
  }
  if (/^\.{0,2}\/|^\.{1,2}$/.test(spec)) {
    const at = normal(spec.startsWith('/') ? spec : `${dirOf(base)}/${spec}`)
    const manifest = files.get(`${at}/package.json`)
    return file(at) ?? (manifest ? file(normal(`${at}/${JSON.parse(manifest).main ?? 'index.js'}`)) : undefined)
  }
  for (let dir = dirOf(base); spec.startsWith('#'); dir = dirOf(dir)) {
    const manifest = files.get(`${dir === '/' ? '' : dir}/package.json`)
    if (manifest) {
      const target = mapped(JSON.parse(manifest).imports ?? {}, spec)
      return target?.startsWith('.') ? file(normal(`${dir}/${target}`)) : target && resolve(files, `${dir}/package.json`, target, kind)
    }
    if (dir === '/') return undefined
  }
  const [, name = '', sub] = /^((?:@[^/]+\/)?[^/]+)(?:\/(.*))?$/.exec(spec) ?? []
  for (let dir = dirOf(base); ; dir = dirOf(dir)) {
    const at = `${dir === '/' ? '' : dir}/node_modules/${name}`
    const manifest = files.get(`${at}/package.json`)
    if (manifest) {
      const pkg = JSON.parse(manifest)
      const exported = pkg.exports && (typeof pkg.exports === 'string' || Array.isArray(pkg.exports) || !Object.keys(pkg.exports)[0]?.startsWith('.') ? (sub ? undefined : pick(pkg.exports)) : mapped(pkg.exports, sub ? `./${sub}` : '.'))
      return file(normal(`${at}/${exported ?? (sub ? sub : (kind === 'import' && pkg.module) || pkg.main || 'index.js')}`))
    }
    if (dir === '/') return undefined
  }
}

/** Why a module isn't there. @param {string} spec */
const missing = (spec) => new Error(NODE.test(spec) ? `Cannot find module '${spec}': it is one of the few of Node's own modules node hasn't here`
  : `Cannot find module '${spec}': install it with npm install in bash, or name it by its path`)

/** Whether a script the user wrote is an ES module rather than CommonJS. @param {string} path @param {string} source */
const isModule = (path, source) => path.endsWith('.mjs') || (!path.endsWith('.cjs') && /^\s*(import\s*[\w{*'"]|export\s)/m.test(source))

/**
 * Whether a package's file is an ES module, as Node tells: .mjs or .cjs, else its package.json's type, else whether it
 * fails to `parse` as CommonJS where it has an import or export statement (tsc.js has words that only look like them).
 * @param {Map<string, string>} files @param {string} path @param {string} source @param {(source: string) => boolean} parses
 */
function moduleIn(files, path, source, parses) {
  if (/\.(mjs|cjs|json)$/.test(path)) return path.endsWith('.mjs')
  for (let dir = dirOf(path); ; dir = dirOf(dir)) {
    const manifest = files.get(`${dir === '/' ? '' : dir}/package.json`)
    const type = manifest && /** @type {{ type?: string }} */ (JSON.parse(manifest)).type
    if (type === 'module' || type === 'commonjs') return type === 'module'
    if (manifest || dir === '/') break
  }
  return /^\s*(?:import\s*(?:[\w*{][^\n]*?\bfrom\s*['"]|['"{])|export\s*(?:default|const|let|var|function|class|async\s+function)\b|export\s*[{*])/m.test(source) && !parses(source)
}

/** A module's own address, which QuickJS leaves out of import.meta: in its code, never in its strings or comments (vite's say "import.meta.url"). @param {string} source @param {string} path */
const meta = (source, path) => source.replace(/(\/\/[^\n]*|\/\*[\s\S]*?\*\/|'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|`(?:\\[\s\S]|[^`\\])*`)|\bimport\.meta\.(url|filename|dirname)\b/g,
  (found, kept, key) => kept ?? JSON.stringify(key === 'url' ? `file://${path}` : key === 'filename' ? path : dirOf(path)))

const RESERVED = new Set('break case catch class const continue debugger default delete do else enum export extends false finally for function if import in instanceof new null return super switch this throw true try typeof var void while with yield let static implements interface package private protected public await arguments eval __esModule'.split(' '))

/**
 * The names a CommonJS module exports, read as Node's cjs-module-lexer reads them, for `import { name }` from it.
 * @param {Map<string, string>} files @param {string} path @param {string} source @param {Set<string>} [seen] @returns {string[]}
 */
function cjsNames(files, path, source, seen = new Set()) {
  const names = new Set()
  if (seen.has(path) || !seen.add(path)) return []
  for (const [, a, b] of source.matchAll(/(?:^|[^.\w$])(?:module\.)?exports\.([A-Za-z_$][\w$]*)\s*=(?!=)|Object\.defineProperty\(\s*(?:module\.)?exports\s*,\s*['"]([A-Za-z_$][\w$]*)['"]/g)) names.add(a ?? b)
  for (const [, list] of source.matchAll(/__export\(\s*[\w$]+\s*,\s*\{([^}]*)\}/g)) for (const [, name] of list.matchAll(/([A-Za-z_$][\w$]*)\s*:/g)) names.add(name)
  for (const [, name] of /module\.exports\s*=\s*\{([^}]*)\}/.exec(source)?.[1].matchAll(/(?:^|,)\s*([A-Za-z_$][\w$]*)\s*(?=[,:]|$)/g) ?? []) names.add(name)
  for (const [, a, b] of source.matchAll(/module\.exports\s*=\s*require\(\s*['"]([^'"]+)['"]\s*\)|__exportStar\(\s*require\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    const target = resolve(files, path, a ?? b, 'require')
    if (target && files.has(target)) for (const name of cjsNames(files, target, files.get(target) ?? '', seen)) names.add(name)
  }
  return [...names].filter((name) => !RESERVED.has(name))
}

/** A package's program in root's node_modules: the one `bin` names, or its only one. @param {any} fs @param {string} root @param {string} name @param {string} bin */
async function binOf(fs, root, name, bin) {
  const at = `${root === '/' ? '' : root}/node_modules/${name}`
  if (!(await fs.exists(`${at}/package.json`))) return null
  const pkg = JSON.parse(await fs.readFile(`${at}/package.json`))
  const bins = typeof pkg.bin === 'string' ? { [name.split('/').pop() ?? name]: pkg.bin } : pkg.bin ?? {}
  const found = bins[bin] ?? (Object.keys(bins).length === 1 ? Object.values(bins)[0] : null)
  return found && normal(`${at}/${found}`)
}


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
// until none is left; a cleared one's wait ends at once. What a callback, or a microtask, throws is printed and the exit code
// is 1, as Node has it; its process.exit() ends the timers.
let __timer = 0
const __timers = new Set()
globalThis.__uncaught = (error) => {
  const exit = '__exit' in Object(error)
  if (!exit) console.error(error)
  if (globalThis.process) process.exitCode = exit ? error.__exit : 1
  if (exit) for (const id of __timers) __timers.delete(id) && __wake(String(id))
}
const __later = (fn, ms, args, again, id = ++__timer) => {
  const tick = () => __sleep(String(Math.max(0, Number(ms) || 0)), String(id)).then(() => __timers.has(id) && (again || __timers.delete(id)) && (fn(...args), again && tick()))
    .catch(__uncaught)
  __timers.add(id).size && tick()
  return { ref() { return this }, unref() { return this }, hasRef: () => true, [Symbol.toPrimitive]: () => id }
}
Object.assign(globalThis, { setTimeout: (fn, ms, ...args) => __later(fn, ms, args, false), setInterval: (fn, ms, ...args) => __later(fn, ms, args, true),
  setImmediate: (fn, ...args) => __later(fn, 0, args, false), queueMicrotask: (fn) => { Promise.resolve().then(fn).catch(__uncaught) } })
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
// require(), Node's way, from Node's own modules, the computer's files and node_modules (resolved by the worker): an ES
// module evaluated at once (D745), CommonJS compiled under its own name, so import() inside it resolves from its folder.
const REQUIRE = `
const __cache = {}
globalThis.__requireFrom = (base) => {
  const require = (spec) => {
    const path = __resolve(base, String(spec))
    if (path.startsWith('node:')) return __node[path.slice(5)]
    if (__cache[path]) return __cache[path].exports
    const module = { exports: {}, id: path, filename: path, path: path.slice(0, path.lastIndexOf('/')), loaded: false, children: [], paths: [] }
    module.require = __requireFrom(path)
    __cache[path] = module
    if (path === globalThis.__mainPath) globalThis.__main = module
    if (path.endsWith('.json')) module.exports = JSON.parse(__source(path))
    else if (__isModule(path) === 'true') module.exports = __esm(path)
    else __compile(path)(module, module.exports, module.require, path, module.path)
    module.loaded = true
    return module.exports
  }
  const resolve = (spec) => __resolve(base, String(spec)).replace(/^node:/, '')
  return Object.defineProperty(Object.assign(require, { resolve: Object.assign(resolve, { paths: () => [] }), cache: __cache, extensions: {} }), 'main', { get: () => globalThis.__main })
}
globalThis.__runMain = (path) => { globalThis.__mainPath = path; return __requireFrom(path)(path) }
globalThis.require = __requireFrom(__cwd + '/[eval]')
`
// As a command, Node's way: process, which says it is Node, Jean's own (.nvmrc), so packages take their Node ways and those
// asking for a recent one run (D178, D745), and console to stdout and stderr, as util.format writes it.
const PROCESS = `
globalThis.process = { argv: JSON.parse(__argv), env: JSON.parse(__env), cwd: () => __cwd, exit: (code = 0) => { throw { __exit: Number(code) } }, platform: 'browser',
  version: 'v26.0.0', versions: { node: '26.0.0' }, release: { name: 'node', lts: true }, nextTick: (fn, ...args) => queueMicrotask(() => fn(...args)) }
for (const level of ['log', 'info', 'warn', 'error']) {
  const write = console[level]
  console[level] = (...args) => globalThis.__exited === undefined && write(args.length ? __node.util.format(...args) : '')
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
// Node's other modules, and the globals, process streams and parts of path, fs, os, util and events that tools reach for (D745):
// where Node's own is a server, a thread or another program, it says why not when it is used, not when it is required.
const NODE_MORE = String.raw`
;(() => {
  const N = globalThis.__node, g = globalThis, EE = N.events, B = g.Buffer, P = g.process, U = N.util, F = N.fs
  const stdinText = typeof g.__stdin === 'string' ? g.__stdin : ''
  g.global = g
  // Globals QuickJS lacks: text, base64, copies, events and aborts, time, randomness, addresses, and Intl (the browser's own).
  g.TextEncoder ??= class TextEncoder { get encoding() { return 'utf-8' } encode(s = '') { return new Uint8Array(B.from(String(s))) } encodeInto(s, into) { const b = this.encode(s); into.set(b.subarray(0, into.length)); return { read: s.length, written: Math.min(b.length, into.length) } } }
  g.TextDecoder ??= class TextDecoder { constructor(enc = 'utf-8') { this.encoding = String(enc).toLowerCase() } decode(b) { return b ? B.from(b instanceof ArrayBuffer ? b : new Uint8Array(b.buffer, b.byteOffset, b.byteLength)).toString(/latin1|ascii/.test(this.encoding) ? 'latin1' : /16/.test(this.encoding) ? 'utf16le' : 'utf8') : '' } }
  g.Blob ??= class Blob {
    #bytes
    constructor(parts = [], o = {}) { this.#bytes = B.concat(parts.map((p) => (p instanceof Blob ? p.#bytes : B.from(typeof p === 'string' || p instanceof ArrayBuffer ? p : new Uint8Array(p.buffer, p.byteOffset, p.byteLength))))); this.type = String(o.type ?? '').toLowerCase() }
    get size() { return this.#bytes.length }
    async arrayBuffer() { return new Uint8Array(this.#bytes).buffer }
    async bytes() { return new Uint8Array(this.#bytes) }
    async text() { return this.#bytes.toString() }
    slice(start, end, type) { return new Blob([this.#bytes.subarray(start, end)], { type }) }
  }
  g.File ??= class File extends g.Blob { constructor(parts, name, o = {}) { super(parts, o); Object.assign(this, { name: String(name), lastModified: o.lastModified ?? Date.now() }) } }
  Object.assign(N.buffer, { Blob: g.Blob, File: g.File })
  g.atob ??= (s) => B.from(String(s), 'base64').toString('latin1')
  g.btoa ??= (s) => B.from(String(s), 'latin1').toString('base64')
  g.structuredClone ??= function clone(v, seen = new Map()) {
    if (v === null || typeof v !== 'object') return v
    if (seen.has(v)) return seen.get(v)
    if (v instanceof Date || v instanceof RegExp || ArrayBuffer.isView(v)) return new v.constructor(v)
    if (v instanceof ArrayBuffer) return v.slice(0)
    const out = Array.isArray(v) ? [] : v instanceof Map ? new Map() : v instanceof Set ? new Set() : {}
    seen.set(v, out)
    if (v instanceof Map) for (const [k, x] of v) out.set(clone(k, seen), clone(x, seen))
    else if (v instanceof Set) for (const x of v) out.add(clone(x, seen))
    else for (const k of Object.keys(v)) out[k] = clone(v[k], seen)
    return out
  }
  g.Event ??= class Event { constructor(type, o = {}) { Object.assign(this, { type, bubbles: !!o.bubbles, cancelable: !!o.cancelable, defaultPrevented: false, timeStamp: Date.now() }) } preventDefault() { this.defaultPrevented = true } stopPropagation() {} stopImmediatePropagation() {} }
  g.EventTarget ??= class EventTarget {
    #on = {}
    addEventListener(type, fn, o) { if (fn) (this.#on[type] ??= []).push({ fn, once: !!o?.once }) }
    removeEventListener(type, fn) { this.#on[type] = (this.#on[type] ?? []).filter((each) => each.fn !== fn) }
    dispatchEvent(e) {
      Object.defineProperty(e, 'target', { value: this, configurable: true })
      for (const { fn, once } of [...(this.#on[e.type] ?? [])]) { if (once) this.removeEventListener(e.type, fn); typeof fn === 'function' ? fn.call(this, e) : fn.handleEvent(e) }
      if (typeof this['on' + e.type] === 'function') this['on' + e.type](e)
      return !e.defaultPrevented
    }
  }
  g.AbortSignal ??= class AbortSignal extends g.EventTarget {
    aborted = false
    reason = undefined
    throwIfAborted() { if (this.aborted) throw this.reason }
    static abort(reason) { const c = new g.AbortController(); c.abort(reason); return c.signal }
    static timeout(ms) { const c = new g.AbortController(); setTimeout(() => c.abort(new Error('The operation timed out')), ms); return c.signal }
    static any(signals) { const c = new g.AbortController(); for (const s of signals) s.addEventListener('abort', () => c.abort(s.reason)); return c.signal }
  }
  g.AbortController ??= class AbortController { signal = new g.AbortSignal(); abort(reason = new Error('This operation was aborted')) { if (!this.signal.aborted) { Object.assign(this.signal, { aborted: true, reason }); this.signal.dispatchEvent(new g.Event('abort')) } } }
  const began = Date.now()
  g.performance ??= { now: () => Date.now() - began, timeOrigin: began, mark() {}, measure() {}, clearMarks() {}, clearMeasures() {}, getEntriesByName: () => [], getEntriesByType: () => [], toJSON: () => ({}) }
  const random = (view) => { new Uint8Array(view.buffer, view.byteOffset, view.byteLength).set(new Uint8Array(__random(String(view.byteLength)))); return view }
  const uuid = () => { const h = B.from(random(new Uint8Array(16)).map((b, i) => (i === 6 ? (b & 15) | 64 : i === 8 ? (b & 63) | 128 : b))).toString('hex'); return [h.slice(0, 8), h.slice(8, 12), h.slice(12, 16), h.slice(16, 20), h.slice(20)].join('-') }
  g.crypto ??= { getRandomValues: random, randomUUID: uuid }
  if (!g.URL) {
    const dots = (p) => { const out = []; for (const s of p.split('/')) s === '..' ? out.length > 1 && out.pop() : s !== '.' && out.push(s); return out.join('/') + (/\/\.\.?$/.test(p) && out.length > 1 ? '/' : '') }
    g.URLSearchParams = class URLSearchParams {
      #all = []
      constructor(init = '') {
        if (typeof init === 'string') for (const part of init.replace(/^\?/, '').split('&').filter(Boolean)) { const [k, v = ''] = part.split(/=(.*)/s).map((x) => decodeURIComponent(x.replace(/\+/g, ' '))); this.#all.push([k, v]) }
        else for (const [k, v] of Symbol.iterator in Object(init) ? init : Object.entries(init)) this.#all.push([String(k), String(v)])
      }
      get(k) { return this.#all.find((e) => e[0] === k)?.[1] ?? null }
      getAll(k) { return this.#all.filter((e) => e[0] === k).map((e) => e[1]) }
      has(k) { return this.#all.some((e) => e[0] === k) }
      set(k, v) { const i = this.#all.findIndex((e) => e[0] === k); this.#all = this.#all.filter((e, j) => e[0] !== k || j === i); i < 0 ? this.#all.push([k, String(v)]) : (this.#all[i] = [k, String(v)]) }
      append(k, v) { this.#all.push([k, String(v)]) }
      delete(k) { this.#all = this.#all.filter((e) => e[0] !== k) }
      sort() { this.#all.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)) }
      forEach(fn) { for (const [k, v] of this.#all) fn(v, k, this) }
      keys() { return this.#all.map((e) => e[0]).values() }
      values() { return this.#all.map((e) => e[1]).values() }
      entries() { return this.#all.values() }
      [Symbol.iterator]() { return this.entries() }
      get size() { return this.#all.length }
      toString() { return this.#all.map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('&') }
    }
    g.URL = class URL {
      constructor(input, base) {
        input = String(input)
        let m = /^([a-z][a-z0-9+.-]*):(?:\/\/([^/?#]*))?([^?#]*)(\?[^#]*)?(#.*)?$/i.exec(input)
        if (!m && base !== undefined) {
          const b = base instanceof URL ? base : new URL(String(base).startsWith('/') ? 'file://' + base : base)
          const [, path = '', search = '', hash = ''] = /^([^?#]*)(\?[^#]*)?(#.*)?$/.exec(input)
          if (path.startsWith('//')) return new URL(b.protocol + input)
          m = [null, b.protocol.slice(0, -1), b.host, dots(path.startsWith('/') ? path : path ? b.pathname.replace(/[^/]*$/, '') + path : b.pathname), search || (path ? '' : b.search), hash]
        }
        if (!m) throw Object.assign(new TypeError('Invalid URL: ' + input), { code: 'ERR_INVALID_URL', input })
        const [, user = '', password = '', host] = /^(?:([^:@]*)(?::([^@]*))?@)?(.*)$/.exec(m[2] ?? '')
        Object.assign(this, { protocol: m[1].toLowerCase() + ':', username: user, password, host: host.toLowerCase(), hash: m[5] && m[5] !== '#' ? m[5] : '' })
        this.hostname = this.host.replace(/:\d+$/, '')
        this.port = /:(\d+)$/.exec(this.host)?.[1] ?? ''
        this.pathname = m[2] !== undefined ? dots(m[3] || '/') : m[3]
        this.searchParams = new g.URLSearchParams(m[4] ?? '')
      }
      get search() { const q = this.searchParams.toString(); return q ? '?' + q : '' }
      set search(s) { this.searchParams = new g.URLSearchParams(s) }
      get origin() { return /^(https?|wss?|ftp):$/.test(this.protocol) ? this.protocol + '//' + this.host : 'null' }
      get href() { return this.protocol + (this.host || this.protocol === 'file:' ? '//' : '') + (this.username ? this.username + (this.password ? ':' + this.password : '') + '@' : '') + this.host + this.pathname + this.search + this.hash }
      toString() { return this.href }
      toJSON() { return this.href }
      static canParse(u, b) { try { return !!new URL(u, b) } catch { return false } }
    }
  }
  if (!g.Intl) {
    const call = (kind, args, method, values) => JSON.parse(__intl(JSON.stringify([kind, args, method, values.map((v) => (v instanceof Date ? { $date: +v } : v))])))
    g.Intl = { getCanonicalLocales: (l) => call('', [], 'getCanonicalLocales', [l]), supportedValuesOf: (k) => call('', [], 'supportedValuesOf', [k]) }
    for (const kind of ['NumberFormat', 'DateTimeFormat', 'Collator', 'PluralRules', 'ListFormat', 'RelativeTimeFormat', 'DisplayNames', 'Segmenter']) {
      const Kind = (g.Intl[kind] = class { constructor(locales, options) { this.args = [locales, options]; this.compare = (a, b) => call(kind, this.args, 'compare', [a, b]) } static supportedLocalesOf(l) { return call(kind, [], 'supportedLocalesOf', [l]) } })
      for (const method of ['format', 'formatToParts', 'formatRange', 'formatRangeToParts', 'resolvedOptions', 'select', 'selectRange', 'of']) Kind.prototype[method] = function (...values) { return call(kind, this.args, method, values) }
    }
    g.Intl.Segmenter.prototype.segment = function (s) { const parts = call('Segmenter', this.args, 'segment', [s]).map((p) => ({ ...p, input: s })); return Object.assign(parts, { containing: (i) => parts.find((p) => p.index <= i && i < p.index + p.segment.length) }) }
    const dated = (fields) => function (l, o = {}) { return new g.Intl.DateTimeFormat(l, /(year|month|day|hour|minute|second|Style)\b/.test(Object.keys(o).join()) ? o : { ...fields, ...o }).format(this) }
    const date = { year: 'numeric', month: 'numeric', day: 'numeric' }, time = { hour: 'numeric', minute: 'numeric', second: 'numeric' }
    Object.assign(Date.prototype, { toLocaleString: dated({ ...date, ...time }), toLocaleDateString: dated(date), toLocaleTimeString: dated(time) })
    Number.prototype.toLocaleString = function (l, o) { return new g.Intl.NumberFormat(l, o).format(Number(this)) }
    String.prototype.localeCompare = function (that, l, o) { return call('Collator', [l, o], 'compare', [String(this), String(that)]) }
  }
  // process: its streams, exit code and events.
  if (P) {
    Object.setPrototypeOf(P, EE.prototype)
    // Never a terminal; a pipeline that ends it is told it finished, and what comes after still shows.
    const writer = (log, fd) => Object.assign(Object.create(EE.prototype), {
      isTTY: false, columns: 80, rows: 24, fd, writable: true, held: '',
      write(chunk, enc, done) { const lines = (this.held + (typeof chunk === 'string' ? chunk : B.from(chunk).toString())).split('\n'); this.held = lines.pop(); lines.forEach(log); [enc, done].find((f) => typeof f === 'function')?.(); return true },
      end(chunk, ...rest) {
        if (chunk && typeof chunk !== 'function') this.write(chunk)
        this.flush()
        if (!this.writableFinished) queueMicrotask(() => { this.emit('finish'); this.emit('close') })
        this.writableEnded = this.writableFinished = true
        ;[chunk, ...rest].find((f) => typeof f === 'function')?.()
        return this
      },
      flush() { if (this.held) log(this.held); this.held = '' },
      getWindowSize: () => [80, 24], hasColors: () => false, getColorDepth: () => 1, cork() {}, uncork() {}, setDefaultEncoding() { return this },
    })
    P.stdout = writer((line) => console.log(line), 1)
    P.stderr = writer((line) => console.error(line), 2)
    g.__flush = () => { P.stdout.flush(); P.stderr.flush() }
    const stdin = Object.assign(Object.create(EE.prototype), {
      isTTY: false, fd: 0, readable: true, encoding: null, flowing: false,
      setEncoding(e) { this.encoding = e; return this }, pause() { return this }, setRawMode() { return this }, ref() { return this }, unref() { return this }, destroy() { return this }, read: () => null,
      resume() { if (!this.flowing) { this.flowing = true; setTimeout(() => { if (stdinText) this.emit('data', this.encoding ? stdinText : B.from(stdinText)); this.emit('end'); this.emit('close') }, 0) } return this },
      pipe(to) { this.on('data', (d) => to.write(d)).on('end', () => to.end?.()); return to },
      async *[Symbol.asyncIterator]() { if (stdinText) yield this.encoding ? stdinText : B.from(stdinText) },
    })
    stdin.on = stdin.addListener = function (name, fn) { EE.prototype.on.call(this, name, fn); if (name === 'data' || name === 'end') this.resume(); return this }
    const exit = P.exit
    // Its exit ends the program, even from a promise nobody waits on: its code kept, its timers ended, nothing written after it.
    P.exit = (code) => {
      const c = Number(code ?? P.exitCode ?? 0)
      if (g.__exited === undefined) {
        try { P.emit('exit', c) } catch {}
        g.__flush()
        g.__exited = c
        for (const id of __timers) __timers.delete(id) && __wake(String(id))
      }
      return exit(c)
    }
    P.hrtime = (prev) => { const t = g.performance.now(), s = Math.floor(t / 1000) - (prev?.[0] ?? 0), ns = Math.floor((t % 1000) * 1e6) - (prev?.[1] ?? 0); return ns < 0 ? [s - 1, ns + 1e9] : [s, ns] }
    P.hrtime.bigint = () => BigInt(Math.floor(g.performance.now() * 1e6))
    P.memoryUsage = Object.assign(() => ({ rss: 3e7, heapTotal: 2e7, heapUsed: 1e7, external: 0, arrayBuffers: 0 }), { rss: () => 3e7 })
    Object.assign(P, { stdin, argv0: 'node', execPath: '/usr/local/bin/node', execArgv: [], pid: 1, ppid: 0, arch: 'wasm32', title: 'node', config: { variables: {} }, features: {}, exitCode: undefined, report: {}, allowedNodeEnvironmentFlags: new Set(),
      versions: { ...P.versions, v8: '14.1.146', uv: '1.51.0', modules: '141' }, getBuiltinModule: (id) => N[String(id).replace(/^node:/, '')], umask: () => 0o22, getuid: () => 1000, getgid: () => 1000, geteuid: () => 1000, getegid: () => 1000, emitWarning() {}, chdir() {}, binding: () => ({}),
      cpuUsage: () => ({ user: 0, system: 0 }), resourceUsage: () => ({}), kill: () => true, uptime: () => g.performance.now() / 1000, setUncaughtExceptionCaptureCallback() {}, hasUncaughtExceptionCaptureCallback: () => false, setSourceMapsEnabled() {} })
  }
  // util, fs, os, path and events: what node didn't have of them.
  const ansi = /[\u001B\u009B][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[-a-zA-Z\d/#&.:=?%@~_]*)*)?\u0007)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-ntqry=><~]))/g
  const is = (C) => (v) => v instanceof C
  const types = { isPromise: is(Promise), isDate: is(Date), isRegExp: is(RegExp), isMap: is(Map), isSet: is(Set), isWeakMap: is(WeakMap), isWeakSet: is(WeakSet), isNativeError: is(Error), isUint8Array: is(Uint8Array), isArrayBuffer: is(ArrayBuffer), isAnyArrayBuffer: is(ArrayBuffer), isDataView: is(DataView),
    isArrayBufferView: ArrayBuffer.isView, isTypedArray: (v) => ArrayBuffer.isView(v) && !(v instanceof DataView), isAsyncFunction: (f) => f?.constructor?.name === 'AsyncFunction', isGeneratorFunction: (f) => /GeneratorFunction/.test(f?.constructor?.name ?? ''), isProxy: () => false, isBoxedPrimitive: () => false, isExternal: () => false }
  const muted = () => Object.assign(() => {}, { enabled: false })
  Object.assign(U, { types, TextEncoder: g.TextEncoder, TextDecoder: g.TextDecoder, stripVTControlCharacters: (s) => String(s).replace(ansi, ''), styleText: (format, text) => text, debuglog: muted, debug: muted, toUSVString: String, getSystemErrorName: (n) => 'E' + n, formatWithOptions: (o, ...a) => U.format(...a),
    callbackify: (fn) => (...a) => { const done = a.pop(); fn(...a).then((v) => done(null, v), done) }, aborted: () => new Promise(() => {}), isArray: Array.isArray, isError: is(Error), isDate: is(Date), isRegExp: is(RegExp), isBuffer: (b) => B.isBuffer(b),
    isFunction: (f) => typeof f === 'function', isString: (s) => typeof s === 'string', isNumber: (n) => typeof n === 'number', isBoolean: (b) => typeof b === 'boolean', isSymbol: (s) => typeof s === 'symbol', isUndefined: (v) => v === undefined, isNullOrUndefined: (v) => v == null,
    isObject: (o) => o !== null && typeof o === 'object', isPrimitive: (v) => v === null || (typeof v !== 'object' && typeof v !== 'function'),
    parseArgs({ args = P?.argv.slice(2) ?? [], options = {} } = {}) {
      const values = {}, positionals = [], short = Object.fromEntries(Object.entries(options).filter(([, o]) => o.short).map(([name, o]) => [o.short, name]))
      for (let i = 0; i < args.length; i++) {
        const a = args[i]
        if (a === '--') { positionals.push(...args.slice(i + 1)); break }
        if (!/^-./.test(a)) { positionals.push(a); continue }
        let [name, value] = a.startsWith('--') ? a.slice(2).split(/=(.*)/s) : [short[a[1]] ?? a[1], a.slice(2) || undefined]
        const o = options[name] ?? {}
        if (o.type === 'string' && value === undefined) value = args[++i]
        o.multiple ? (values[name] ??= []).push(o.type === 'string' ? value : true) : (values[name] = o.type === 'string' ? value : true)
      }
      for (const [name, o] of Object.entries(options)) if (o.default !== undefined) values[name] ??= o.default
      return { values, positionals }
    },
  })
  // A .env file's variables, as Node reads them.
  U.parseEnv = (text) => Object.fromEntries([...String(text).matchAll(/^\s*(?:export\s+)?([\w.-]+)\s*=\s*("(?:\\.|[^"])*"|'[^']*'|[^#\n]*)/gm)].map(([, k, v]) => [k, /^"/.test(v) ? v.slice(1, -1).replace(/\\n/g, '\n') : /^'/.test(v) ? v.slice(1, -1) : v.trim()]))
  if (P) P.loadEnvFile = (path = '.env') => Object.assign(P.env, U.parseEnv(F.readFileSync(path, 'utf8')))
  U.inspect.custom = Symbol.for('nodejs.util.inspect.custom')
  U.inspect.defaultOptions = {}
  U.promisify.custom = Symbol.for('nodejs.util.promisify.custom')
  const stat = F.statSync, list = F.readdirSync
  const fuller = (s) => Object.assign(s, { isSymbolicLink: () => false, isFIFO: () => false, isSocket: () => false, isBlockDevice: () => false, isCharacterDevice: () => false, mode: s.isDirectory() ? 0o40755 : 0o100644,
    atime: s.mtime, ctime: s.mtime, birthtime: s.mtime, atimeMs: s.mtimeMs, ctimeMs: s.mtimeMs, birthtimeMs: s.mtimeMs, dev: 1, ino: 0, nlink: 1, uid: 1000, gid: 1000, rdev: 0, blksize: 4096, blocks: Math.ceil(s.size / 512) })
  const fileURLToPath = (u) => { const s = typeof u === 'string' ? u : u?.href; if (typeof s !== 'string') throw Object.assign(new TypeError('The "path" argument must be of type string or an instance of URL'), { code: 'ERR_INVALID_ARG_TYPE' }); return decodeURIComponent(s.startsWith('file:') ? new g.URL(s).pathname : s) }
  const toPath = (p) => (p instanceof g.URL || (typeof p === 'string' && p.startsWith('file:')) ? fileURLToPath(p) : p)
  const fds = new Map()
  let fd = 10
  const handle = (n) => fds.get(n) ?? (() => { throw Object.assign(new Error('EBADF: bad file descriptor'), { code: 'EBADF' }) })()
  const glob = (pattern) => new RegExp('^' + pattern.replace(/[.+^$(){}|[\]\\]/g, '\\$&').replace(/\*\*\/|\*\*|\*|\?/g, (m) => ({ '**/': '(?:.*/)?', '**': '.*', '*': '[^/]*' })[m] ?? '[^/]') + '$')
  Object.assign(F, {
    statSync: (p, o) => { try { return fuller(stat(p)) } catch (e) { if (o?.throwIfNoEntry !== false) throw e } },
    readdirSync: (p, o) => (o?.withFileTypes ? list(p, o).map((d) => Object.assign(fuller(d), { parentPath: String(p), path: String(p) })) : list(p, o)),
    openSync(p, flags = 'r') { const w = /[wa+]/.test(flags), data = /^w/.test(flags) || (w && !F.existsSync(p)) ? B.alloc(0) : F.readFileSync(p); fds.set(++fd, { p, data, at: /a/.test(flags) ? data.length : 0, w }); return fd },
    closeSync(n) { const h = handle(n); if (h.w) F.writeFileSync(h.p, h.data); fds.delete(n) },
    readSync(n, buf, off = 0, len, pos = null) {
      if (off && typeof off === 'object') ({ offset: off = 0, length: len, position: pos = null } = off)
      const h = n === 0 ? { data: B.from(stdinText), at: 0 } : handle(n), at = pos ?? h.at, read = h.data.copy(buf, off, at, at + (len ?? buf.length - off))
      if (pos == null) h.at = at + read
      return read
    },
    writeSync(n, data) {
      const b = typeof data === 'string' ? B.from(data) : B.from(data.buffer, data.byteOffset, data.byteLength)
      if (n === 1 || n === 2) return (n === 1 ? P?.stdout : P?.stderr)?.write(b.toString()), b.length
      const h = handle(n), out = B.alloc(Math.max(h.data.length, h.at + b.length))
      h.data.copy(out)
      b.copy(out, h.at)
      Object.assign(h, { data: out, at: h.at + b.length })
      return b.length
    },
    fstatSync: (n) => ({ ...F.statSync(handle(n).p), size: handle(n).data.length }),
    realpathSync: (p) => N.path.resolve(String(p)), accessSync: (p) => { stat(p) }, copyFileSync: (a, b) => F.writeFileSync(b, F.readFileSync(a)), rmdirSync: (p, o) => F.rmSync(p, o),
    cpSync: (a, b) => { if (stat(a).isDirectory()) { F.mkdirSync(b, { recursive: true }); for (const name of list(a)) F.cpSync(a + '/' + name, b + '/' + name) } else F.copyFileSync(a, b) },
    renameSync: (a, b) => { F.cpSync(a, b); F.rmSync(a, { recursive: true }) }, mkdtempSync: (prefix) => (F.mkdirSync((prefix += Math.random().toString(36).slice(2, 8)), { recursive: true }), prefix),
    readlinkSync: (p) => { throw Object.assign(new Error("EINVAL: invalid argument, readlink '" + p + "'"), { code: 'EINVAL' }) }, symlinkSync: (t, p) => { throw Object.assign(new Error("EPERM: no links here, symlink '" + p + "'"), { code: 'EPERM' }) },
    linkSync: (t, p) => { throw Object.assign(new Error("EPERM: no links here, link '" + p + "'"), { code: 'EPERM' }) }, truncateSync: (p, n = 0) => F.writeFileSync(p, F.readFileSync(p).subarray(0, n)),
    statfsSync: () => ({ type: 0, bsize: 4096, blocks: 262144, bfree: 131072, bavail: 131072, files: 65536, ffree: 32768 }),
    chmodSync() {}, chownSync() {}, lchownSync() {}, fchmodSync() {}, fchownSync() {}, utimesSync() {}, lutimesSync() {}, futimesSync() {}, fsyncSync() {}, fdatasyncSync() {}, watchFile() {}, unwatchFile() {}, watch: () => Object.assign(Object.create(EE.prototype), { close() {}, ref() { return this }, unref() { return this } }),
    exists: (p, done) => setTimeout(() => done(F.existsSync(p)), 0),
    globSync(patterns, o = {}) {
      const cwd = String(o.cwd ?? P?.cwd() ?? '/'), want = [].concat(patterns).map(glob), skip = [].concat(typeof o.exclude === 'function' ? [] : o.exclude ?? []).map(glob), found = []
      const walk = (rel) => {
        for (const name of list(N.path.join(cwd, rel || '.'))) {
          const path = rel ? rel + '/' + name : name, s = stat(N.path.join(cwd, path))
          if (skip.some((re) => re.test(path))) continue
          if (want.some((re) => re.test(path))) found.push(o.withFileTypes ? Object.assign(fuller(s), { name, parentPath: N.path.join(cwd, rel || '.') }) : path)
          if (s.isDirectory() && name !== 'node_modules' && name !== '.git') walk(path)
        }
      }
      walk('')
      return found
    },
    createReadStream: (p, o) => N.stream.Readable.from([F.readFileSync(p, typeof o === 'string' ? o : o?.encoding)]),
    createWriteStream(p) { const chunks = []; return new N.stream.Writable({ write(c, e, done) { chunks.push(B.from(c)); done() }, final(done) { F.writeFileSync(p, B.concat(chunks)); done() } }) },
    constants: { F_OK: 0, R_OK: 4, W_OK: 2, X_OK: 1, O_RDONLY: 0, O_WRONLY: 1, O_RDWR: 2, O_CREAT: 64, O_EXCL: 128, O_TRUNC: 512, O_APPEND: 1024, S_IFMT: 61440, S_IFREG: 32768, S_IFDIR: 16384, S_IFLNK: 40960, COPYFILE_EXCL: 1 },
    F_OK: 0, R_OK: 4, W_OK: 2, X_OK: 1, Dirent: class Dirent {}, Stats: class Stats {},
  })
  F.lstatSync = F.statSync
  F.opendirSync = (p) => { const items = F.readdirSync(p, { withFileTypes: true }); return { path: p, readSync: () => items.shift() ?? null, closeSync() {}, async *[Symbol.asyncIterator]() { yield* items } } }
  F.glob = (p, o, done) => setTimeout(() => { try { (done ?? o)(null, F.globSync(p, typeof o === 'object' ? o : {})) } catch (e) { (done ?? o)(e) } }, 0)
  for (const name of Object.keys(F)) {
    const sync = F[name], base = name.slice(0, -4)
    if (!name.endsWith('Sync') || name === 'existsSync') continue
    if (F.promises[base] && !/^(l?stat|readdir)$/.test(base)) continue
    F.promises[base] = async (...args) => sync(...args)
    F[base] = (...args) => { const done = typeof args.at(-1) === 'function' ? args.pop() : () => {}; F.promises[base](...args).then((v) => done(null, v), done) }
  }
  Object.assign(F.promises, { constants: F.constants, glob: async function* (p, o) { yield* F.globSync(p, o) }, open: async (p, flags) => { const n = F.openSync(p, flags); return { fd: n, readFile: async (o) => F.readFileSync(p, o), writeFile: async (d) => F.writeFileSync(p, d), stat: async () => F.fstatSync(n), close: async () => F.closeSync(n) } } })
  // Every function of fs takes a file: address too, as Node's does.
  for (const box of [F, F.promises]) for (const [name, fn] of Object.entries(box)) if (typeof fn === 'function' && /^[a-z]/.test(name)) box[name] = (a, b, ...rest) => fn(toPath(a), /^(copyFile|rename|cp|symlink)/.test(name) ? toPath(b) : b, ...rest)
  F.realpathSync.native = F.realpathSync
  Object.assign(N.os, { type: () => 'Linux', release: () => '6.0.0', version: () => '', machine: () => 'wasm32', totalmem: () => 64 * 2 ** 20, freemem: () => 32 * 2 ** 20, availableParallelism: () => 1, loadavg: () => [0, 0, 0], uptime: () => 1, endianness: () => 'LE', networkInterfaces: () => ({}),
    userInfo: () => ({ username: 'user', homedir: '/home/user', shell: '/bin/bash', uid: 1000, gid: 1000 }), devNull: '/dev/null', constants: { signals: { SIGINT: 2, SIGTERM: 15, SIGKILL: 9 }, errno: {}, priority: {} } })
  Object.assign(N.path, { win32: N.path, toNamespacedPath: (p) => p, format: (o) => (o.dir ? o.dir + '/' : o.root ?? '') + (o.base ?? (o.name ?? '') + (o.ext ?? '')), matchesGlob: (p, pattern) => glob(pattern).test(p) })
  Object.assign(EE, { defaultMaxListeners: 10, errorMonitor: Symbol('events.errorMonitor'), captureRejectionSymbol: Symbol.for('nodejs.rejection'), captureRejections: false, setMaxListeners() {},
    once: (em, name) => new Promise((resolve, reject) => { em.once(name, (...a) => resolve(a)); if (name !== 'error') em.once('error', reject) }), listenerCount: (em, name) => em.listenerCount(name), getEventListeners: (em, name) => em.listeners?.(name) ?? [],
    addAbortListener: (signal, fn) => (signal.addEventListener('abort', fn, { once: true }), { [Symbol.dispose ?? 'dispose']: () => signal.removeEventListener('abort', fn) }) })
  Object.assign(EE.prototype, { prependListener(name, fn) { ((this._events ??= {})[name] ??= []).unshift(fn); return this }, prependOnceListener(name, fn) { return this.once(name, fn) }, eventNames() { return Object.keys(this._events ?? {}) }, getMaxListeners: () => 10, rawListeners(name) { return this._events?.[name] ?? [] } })
  // Node's other modules.
  class AssertionError extends Error { constructor(o = {}) { super(typeof o === 'string' ? o : o.message ?? 'Assertion failed'); Object.assign(this, { name: 'AssertionError', code: 'ERR_ASSERTION', actual: o.actual, expected: o.expected, operator: o.operator }) } }
  const fail = (m, said) => { throw m instanceof Error ? m : new AssertionError({ message: m ?? said }) }
  const same = U.isDeepStrictEqual
  function assert(v, m) { if (!v) fail(m, 'The expression evaluated to a falsy value') }
  Object.assign(assert, { ok: assert, AssertionError, fail: (m) => fail(m, 'Failed'), ifError: (v) => { if (v != null) throw v },
    equal: (a, b, m) => a == b || fail(m, U.inspect(a) + ' == ' + U.inspect(b)), notEqual: (a, b, m) => a != b || fail(m, U.inspect(a) + ' != ' + U.inspect(b)),
    strictEqual: (a, b, m) => Object.is(a, b) || fail(m, 'Expected values to be strictly equal: ' + U.inspect(a) + ' !== ' + U.inspect(b)), notStrictEqual: (a, b, m) => !Object.is(a, b) || fail(m, 'Expected "actual" to be strictly unequal to: ' + U.inspect(b)),
    deepEqual: (a, b, m) => same(a, b) || fail(m, 'Expected values to be loosely deep-equal'), deepStrictEqual: (a, b, m) => same(a, b) || fail(m, 'Expected values to be strictly deep-equal'),
    notDeepEqual: (a, b, m) => !same(a, b) || fail(m, 'Expected values not to be deep-equal'), notDeepStrictEqual: (a, b, m) => !same(a, b) || fail(m, 'Expected values not to be deep-equal'),
    throws: (fn, e, m) => { try { fn() } catch { return } fail(typeof e === 'string' ? e : m, 'Missing expected exception.') }, doesNotThrow: (fn) => { fn() },
    rejects: async (p, e, m) => { try { await (typeof p === 'function' ? p() : p) } catch { return } fail(typeof e === 'string' ? e : m, 'Missing expected rejection.') }, doesNotReject: async (p) => { await (typeof p === 'function' ? p() : p) },
    match: (s, re, m) => re.test(s) || fail(m, 'The input did not match ' + re), doesNotMatch: (s, re, m) => !re.test(s) || fail(m, 'The input was expected not to match ' + re) })
  assert.strict = assert
  const url = { URL: g.URL, URLSearchParams: g.URLSearchParams, fileURLToPath, pathToFileURL: (p) => new g.URL('file://' + encodeURI(N.path.resolve(String(p))).replace(/[?#]/g, encodeURIComponent)), domainToASCII: (d) => d, domainToUnicode: (d) => d,
    format: (u) => (typeof u === 'string' ? u : u.href ?? (u.protocol ?? '') + '//' + (u.host ?? u.hostname ?? '') + (u.pathname ?? '') + (u.search ?? '') + (u.hash ?? '')), urlToHttpOptions: (u) => ({ ...u }),
    parse: (s) => { try { const u = new g.URL(s); return { ...u, href: u.href, search: u.search, path: u.pathname + u.search, query: u.search.slice(1), slashes: true } } catch { const [pathname, query = ''] = String(s).split('?'); return { pathname, path: s, query, search: query && '?' + query, href: s } } },
    resolve: (from, to) => new g.URL(to, new g.URL(from, 'resolve://')).href.replace(/^resolve:\/\//, '') }
  const builtinModules = ['assert', 'async_hooks', 'buffer', 'child_process', 'crypto', 'diagnostics_channel', 'dns', 'events', 'fs', 'http', 'https', 'module', 'net', 'os', 'path', 'perf_hooks', 'process', 'querystring', 'readline', 'stream', 'string_decoder', 'timers', 'tty', 'url', 'util', 'v8', 'vm', 'worker_threads', 'zlib']
  function Module() {}
  Object.assign(Module, { Module, builtinModules, createRequire: (f) => g.__requireFrom(fileURLToPath(f)), isBuiltin: (s) => builtinModules.includes(String(s).replace(/^node:/, '')), register() {}, syncBuiltinESMExports() {}, findSourceMap: () => undefined, enableCompileCache: () => ({}), getCompileCacheDir() {},
    flushCompileCache() {}, constants: { compileCacheStatus: {} }, _cache: {}, _extensions: { '.js': () => {}, '.json': () => {} }, _resolveFilename: (s, parent) => g.__requireFrom(parent?.filename ?? g.__cwd + '/[eval]').resolve(s) })
  const readlineOf = (promised) => (input, output) => {
    const o = input && 'input' in Object(input) ? input : { input, output }, rl = Object.create(EE.prototype)
    const lines = o.input === P?.stdin ? stdinText.split('\n').filter((l, i, all) => i < all.length - 1 || l) : []
    Object.assign(rl, { terminal: false, line: '', input: o.input, output: o.output, prompted: '> ', closed: false,
      setPrompt(p) { this.prompted = p }, getPrompt() { return this.prompted }, prompt() {}, write() {}, pause() { return this }, resume() { return this }, getCursorPos: () => ({ rows: 0, cols: 0 }),
      close() { if (!this.closed) { this.closed = true; this.emit('close') } },
      question(q, o, done) { const answer = lines.shift() ?? ''; if (promised) return Promise.resolve(answer); setTimeout(() => [o, done].find((f) => typeof f === 'function')?.(answer), 0) },
      async *[Symbol.asyncIterator]() { while (lines.length) yield lines.shift() } })
    setTimeout(() => { if (rl.listenerCount('line')) { while (lines.length) rl.emit('line', lines.shift()); rl.close() } }, 0)
    return rl
  }
  const readline = { createInterface: readlineOf(false), Interface: class Interface {}, emitKeypressEvents() {}, clearLine: (s, d, done) => (done?.(), true), clearScreenDown: (s, done) => (done?.(), true),
    cursorTo: (s, x, y, done) => ([y, done].find((f) => typeof f === 'function')?.(), true), moveCursor: (s, x, y, done) => (done?.(), true), promises: { createInterface: readlineOf(true) } }
  const noChild = 'child_process: node starts no other program here; run it from bash instead'
  const child = () => { const c = Object.assign(Object.create(EE.prototype), { stdout: Object.create(EE.prototype), stderr: Object.create(EE.prototype), stdin: { write() {}, end() {} }, kill: () => false }); setTimeout(() => { c.emit('error', new Error(noChild)); c.emit('close', 1) }, 0); return c }
  const later = (...a) => (setTimeout(() => a.find((f) => typeof f === 'function')?.(new Error(noChild), '', ''), 0), child())
  const noServer = (what) => () => { throw new Error(what + ': ' + __noServer) }
  // A server is made, as Node's are; it is listening that fails, told as Node tells it, so a tool's optional socket doesn't stop it.
  class Server extends EE { listen(...a) { const failed = Object.assign(new Error('listen EACCES: ' + __noServer), { code: 'EACCES' }); setTimeout(() => this.emit('error', failed), 0); return this } address() { return null } close(done) { setTimeout(() => done?.(), 0); return this } ref() { return this } unref() { return this } }
  const net = (name) => ({ ...Object.fromEntries(['request', 'get', 'connect', 'createConnection', 'lookup', 'resolve'].map((f) => [f, noServer(name + '.' + f)])), createServer: (...a) => new Server(), Server, Agent: class Agent {}, globalAgent: {}, Socket: class Socket {},
    IncomingMessage: class IncomingMessage {}, ServerResponse: class ServerResponse {}, STATUS_CODES: { 200: 'OK', 201: 'Created', 204: 'No Content', 301: 'Moved Permanently', 302: 'Found', 304: 'Not Modified', 400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found', 500: 'Internal Server Error' },
    METHODS: ['DELETE', 'GET', 'HEAD', 'OPTIONS', 'PATCH', 'POST', 'PUT'], isIP: () => 0, isIPv4: () => false, isIPv6: () => false, constants: {} })
  const delay = (ms, v) => new Promise((resolve) => setTimeout(() => resolve(v), ms))
  const timers = { setTimeout: delay, setImmediate: (v) => delay(0, v), setInterval: async function* (ms, v) { for (;;) yield await delay(ms, v) }, scheduler: { wait: delay, yield: () => delay(0) } }
  const vm = { runInThisContext: (c) => (0, eval)(c), runInNewContext: (c, scope = {}) => new Function(...Object.keys(scope), 'return eval(' + JSON.stringify(c) + ')')(...Object.values(scope)), createContext: (o = {}) => o, isContext: () => true, compileFunction: (code, params = []) => new Function(...params, code) }
  vm.runInContext = vm.runInNewContext
  vm.Script = class Script { constructor(c) { this.c = c } runInThisContext() { return vm.runInThisContext(this.c) } runInNewContext(s) { return vm.runInNewContext(this.c, s) } runInContext(s) { return vm.runInNewContext(this.c, s) } createCachedData() { return B.alloc(0) } }
  const querystring = { parse: (s, sep = '&', eq = '=') => { const o = {}; for (const part of String(s).split(sep).filter(Boolean)) { const [k, v = ''] = part.split(eq).map((x) => decodeURIComponent(x.replace(/\+/g, ' '))); o[k] = k in o ? [].concat(o[k], v) : v } return o },
    stringify: (o, sep = '&', eq = '=') => Object.entries(o ?? {}).flatMap(([k, v]) => [].concat(v).map((x) => encodeURIComponent(k) + eq + encodeURIComponent(x))).join(sep), escape: encodeURIComponent, unescape: decodeURIComponent }
  Object.assign(querystring, { decode: querystring.parse, encode: querystring.stringify })
  const channel = () => ({ hasSubscribers: false, publish() {}, subscribe() {}, unsubscribe() {}, bindStore() {}, unbindStore() {}, runStores: (d, fn, t, ...a) => fn.apply(t, a) })
  class StringDecoder {
    constructor(e = 'utf8') { this.encoding = String(e).toLowerCase().replace('-', ''); this.rest = B.alloc(0) }
    write(b) {
      b = B.concat([this.rest, B.from(b)])
      let end = b.length, i = end - 1
      while (this.encoding === 'utf8' && i > end - 4 && i >= 0 && (b[i] & 0xc0) === 0x80) i--
      if (this.encoding === 'utf8' && i >= 0 && (b[i] >= 0xf0 ? 4 : b[i] >= 0xe0 ? 3 : b[i] >= 0xc0 ? 2 : 1) > end - i) end = i
      this.rest = b.subarray(end)
      return b.subarray(0, end).toString(this.encoding)
    }
    end(b) { const s = b ? this.write(b) : '', r = this.rest.toString(this.encoding); this.rest = B.alloc(0); return s + r }
  }
  Object.assign(N, {
    assert, 'assert/strict': assert, url, module: Module, tty: { isatty: () => false, ReadStream: class ReadStream {}, WriteStream: class WriteStream {} }, readline, 'readline/promises': readline.promises,
    child_process: { exec: later, execFile: later, spawn: child, fork: child, execSync() { throw new Error(noChild) }, execFileSync() { throw new Error(noChild) }, spawnSync: () => ({ status: 1, error: new Error(noChild), stdout: B.alloc(0), stderr: B.alloc(0), output: [] }) },
    crypto: { webcrypto: g.crypto, randomUUID: uuid, getRandomValues: random, randomFillSync: random, randomBytes: (n, done) => { const b = random(B.alloc(n)); if (done) setTimeout(() => done(null, b), 0); return b },
      randomInt: (a, b) => (b === undefined ? 0 : a) + Math.floor((new Uint32Array(random(new Uint8Array(4)).buffer)[0] / 2 ** 32) * (b === undefined ? a : b - a)), timingSafeEqual: (a, b) => B.compare(B.from(a), B.from(b)) === 0, getHashes: () => [], constants: {},
      createHash() { throw new Error("crypto: node has no hashes here; python3's hashlib has them") }, createHmac() { throw new Error("crypto: node has no hashes here; python3's hmac has them") } },
    http: net('http'), https: net('https'), http2: net('http2'), net: net('net'), tls: net('tls'), dns: { ...net('dns'), promises: net('dns') }, 'dns/promises': net('dns'), dgram: net('dgram'),
    worker_threads: { isMainThread: true, parentPort: null, workerData: null, threadId: 0, resourceLimits: {}, Worker: class Worker { constructor() { throw new Error('worker_threads: no threads here') } }, MessageChannel: class MessageChannel {}, MessagePort: class MessagePort {}, setEnvironmentData() {}, getEnvironmentData() {} },
    perf_hooks: { performance: g.performance, PerformanceObserver: class PerformanceObserver { observe() {} disconnect() {} }, monitorEventLoopDelay: () => ({ enable() {}, disable() {}, percentile: () => 0 }), constants: {} },
    timers: { setTimeout, clearTimeout, setInterval, clearInterval, setImmediate, clearImmediate, promises: timers }, 'timers/promises': timers, vm, querystring,
    v8: { getHeapStatistics: () => ({ total_heap_size: 64e6, heap_size_limit: 64e6, used_heap_size: 1e7, total_available_size: 54e6 }), getHeapSpaceStatistics: () => [], setFlagsFromString() {}, cachedDataVersionTag: () => 0, serialize: (v) => B.from(JSON.stringify(v)), deserialize: (b) => JSON.parse(String(b)) },
    async_hooks: {
      AsyncLocalStorage: class AsyncLocalStorage { getStore() { return this.store } run(store, fn, ...a) { const was = this.store; this.store = store; try { return fn(...a) } finally { this.store = was } } enterWith(store) { this.store = store } exit(fn, ...a) { return fn(...a) } disable() {} static bind(fn) { return fn } static snapshot() { return (fn, ...a) => fn(...a) } },
      AsyncResource: class AsyncResource { runInAsyncScope(fn, t, ...a) { return fn.apply(t, a) } bind(fn) { return fn } emitDestroy() { return this } asyncId() { return 1 } triggerAsyncId() { return 0 } static bind(fn) { return fn } },
      createHook: () => ({ enable() { return this }, disable() { return this } }), executionAsyncId: () => 1, triggerAsyncId: () => 0, executionAsyncResource: () => ({}) },
    diagnostics_channel: { channel, hasSubscribers: () => false, subscribe() {}, unsubscribe() {}, tracingChannel: () => ({ hasSubscribers: false, subscribe() {}, unsubscribe() {}, start: channel(), end: channel(), asyncStart: channel(), asyncEnd: channel(), error: channel(),
      traceSync: (fn, c, t, ...a) => fn.apply(t, a), tracePromise: (fn, c, t, ...a) => fn.apply(t, a), traceCallback: (fn, p, c, t, ...a) => fn.apply(t, a) }) },
    console: Object.assign(Object.create(console), { Console: class Console { constructor(out, err) { const [o, e] = [out?.stdout ?? out, out?.stderr ?? err ?? out?.stdout ?? out]; for (const level of ['log', 'info', 'debug', 'error', 'warn', 'trace']) this[level] = (...a) => (/^(log|info|debug)$/.test(level) ? o : e).write(U.format(...a) + '\n') } } }),
    string_decoder: { StringDecoder }, constants: { ...F.constants, ...N.os.constants },
    'path/posix': N.path, 'path/win32': N.path, 'util/types': types, sys: U,
  })
  // stream is readable-stream's, and zlib fflate's under Node's names, both made when a program first asks for them.
  const made = {}
  const lazy = (name, names, make) => { Object.defineProperty(N, name, { get: () => (made[name] ??= make()) }); g.__lazyNames[name] = names }
  g.__lazyNames = {}
  lazy('stream', 'Readable,Writable,Duplex,Transform,PassThrough,Stream,pipeline,finished,addAbortSignal,promises,compose,isReadable,isErrored,isDisturbed,duplexPair,getDefaultHighWaterMark,setDefaultHighWaterMark', () => g.__requireFrom('/')(g.__streamPath).default)
  lazy('stream/promises', 'pipeline,finished', () => N.stream.promises)
  const drain = async (s) => { const all = []; for await (const c of s) all.push(B.from(c)); return B.concat(all) }
  lazy('stream/consumers', 'buffer,text,json,arrayBuffer', () => ({ buffer: drain, text: async (s) => (await drain(s)).toString(), json: async (s) => JSON.parse((await drain(s)).toString()), arrayBuffer: async (s) => new Uint8Array(await drain(s)).buffer }))
  const ZIP = { gzip: 'gzipSync', gunzip: 'gunzipSync', deflate: 'zlibSync', inflate: 'unzlibSync', deflateRaw: 'deflateSync', inflateRaw: 'inflateSync', unzip: 'decompressSync' }
  const Up = (s) => s[0].toUpperCase() + s.slice(1)
  lazy('zlib', Object.keys(ZIP).flatMap((n) => [n, n + 'Sync', Up(n), 'create' + Up(n)]).concat('constants', 'brotliCompressSync', 'brotliDecompressSync').join(), () => {
    const zlib = { constants: { Z_NO_FLUSH: 0, Z_SYNC_FLUSH: 2, Z_FULL_FLUSH: 3, Z_FINISH: 4, Z_BEST_SPEED: 1, Z_BEST_COMPRESSION: 9, Z_DEFAULT_COMPRESSION: -1 } }
    zlib.brotliCompressSync = zlib.brotliDecompressSync = () => { throw new Error('zlib: no brotli here; gzip and deflate are') }
    for (const [name, op] of Object.entries(ZIP)) {
      const sync = (data) => { const b = B.from(data); return B.from(__zip(op, b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength))) }
      const Kind = class extends N.stream.Transform { chunks = []; _transform(c, e, done) { this.chunks.push(B.from(c)); done() } _flush(done) { try { done(null, sync(B.concat(this.chunks))) } catch (e) { done(e) } } }
      Object.assign(zlib, { [name + 'Sync']: sync, [Up(name)]: Kind, ['create' + Up(name)]: (o) => new Kind(o), [name]: (data, o, done) => setTimeout(() => { try { (done ?? o)(null, sync(data)) } catch (e) { (done ?? o)(e) } }, 0) })
    }
    return zlib
  })
})()
globalThis.__exportNames = (m) => Object.keys(Object(m)).filter((k) => /^[A-Za-z_$][\w$]*$/.test(k)).join()
`
// After process; with the names each exports, for import.
const NODE_MODULES = `
globalThis.__node = (${nodeModules})(__fs, __cwd)
${NODE_MORE}
Object.assign(Object.fromEntries(Object.entries(__node).map(([name, module]) => [name, __exportNames(module)])), __lazyNames)
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
 * @property {Map<string, string>} files the computer's scripts and packages, by path, which require and import read
 * @property {string} compiled the CommonJS file compiled last, where import() resolves from in code that has no name of its own
 * @property {(source: string) => boolean} parses whether a source parses as a script, which an ES module's import doesn't
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
 * @param {{ run: number, cwd: string, tool?: boolean, argv?: string[], name?: string, env?: Record<string, string>, limits?: Record<string, number>, stdin?: string }} options
 * @param {Computer} computer
 */
async function jsContext({ run, cwd, tool = false, argv = [], name = '-', env = {}, limits = {}, stdin = '' }, computer) {
  // Its loader adds feross's Buffer and readable-stream, as text.
  const quickjs = /** @type {QuickJSWASMModule & { buffer: string, stream: string }} */ (await engine(run, 'quickjs'))
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
    files,
    compiled: '',
    parses: (source) => {
      const text = vm.newString(source.replace(/^#!.*/, ''))
      vm.setProp(vm.global, '__parsed', text)
      text.dispose()
      const parsed = vm.evalCode('new Function(globalThis.__parsed)')
      ;(parsed.error ?? parsed.value).dispose()
      return !parsed.error
    },
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
      files.set(STREAM, quickjs.stream)
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
        // With where it came from, as Node prints it, when that is a program's or a package's file.
        throw new Error(typeof error === 'object' && error ? `${error.name ?? 'Error'}: ${error.message}${/\(\//.test(error.stack ?? '') ? `\n${error.stack.trimEnd()}` : ''}` : String(error))
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
    for (const [label, value] of Object.entries({ __argv: JSON.stringify(['node', name, ...argv]), __env: JSON.stringify(env), __cwd: cwd, __stdin: stdin, __streamPath: STREAM, __noServer: noServer('node').replace(/^node: /, '').trim() })) {
      const handle = vm.newString(value)
      vm.setProp(vm.global, label, handle)
      handle.dispose()
    }
    // A CommonJS file as a function under its own name; an ES module, evaluated at once, as its namespace.
    for (const [label, work] of /** @type {const} */ ([['__compile', (/** @type {string} */ path) => vm.evalCode(`(function (module, exports, require, __filename, __dirname) {${(files.get(js.compiled = path) ?? '').replace(/^#!.*/, '')}\n})`, path)],
      ['__esm', (/** @type {string} */ path) => {
        const started = vm.evalCode(`import * as ns from ${JSON.stringify(path)}; globalThis.__esmNs = ns`, `${path}#require`, { type: 'module' })
        if (started.error) return started
        runtime.executePendingJobs()
        const state = vm.getPromiseState(started.value)
        started.value.dispose()
        return state.type === 'rejected' ? { error: state.error } : { value: vm.getProp(vm.global, '__esmNs') }
      }]])) {
      const handle = vm.newFunction(label, (/** @type {QuickJSHandle} */ path) => work(vm.getString(path)))
      vm.setProp(vm.global, label, handle)
      handle.dispose()
    }
    /** @param {string} base @param {string} spec */
    const required = (base, spec) => {
      const found = resolve(files, base, spec, 'require')
      if (!found) throw missing(spec)
      return found
    }
    // Intl is the browser's own, in its time zone, which QuickJS's dates keep too.
    const intl = (/** @type {string} */ asked) => {
      const [kind, [locales, options] = [], method, values] = JSON.parse(asked)
      const args = values.map((/** @type {any} */ value) => (value?.$date === undefined ? value : new Date(value.$date)))
      const Kind = /** @type {any} */ (Intl)[kind]
      const made = kind && method !== 'supportedLocalesOf' ? new Kind(locales ?? undefined, options ?? undefined) : (Kind ?? Intl)
      return JSON.stringify(method === 'segment' ? [...made.segment(args[0])].map(({ segment, index, isWordLike }) => ({ segment, index, isWordLike })) : made[method](...args))
    }
    for (const [label, work] of /** @type {const} */ ([['__resolve', required], ['__source', (/** @type {string} */ path) => files.get(path)], ['__wake', (/** @type {string} */ id) => waits.get(id)?.()],
      ['__isModule', (/** @type {string} */ path) => String(moduleIn(files, path, files.get(path) ?? '', js.parses))], ['__intl', intl], ['__random', (/** @type {string} */ size) => {
        const bytes = new Uint8Array(Number(size))
        for (let at = 0; at < bytes.length; at += 65536) crypto.getRandomValues(bytes.subarray(at, at + 65536))
        return bytes
      }],
      ['__zip', (/** @type {string} */ op, /** @type {Uint8Array} */ data) => { if (!/^(g?unzip|gzip|(un)?zlib|deflate|inflate|decompress)Sync$/.test(op)) throw new Error(`zlib: no ${op}`); return engines.shell.zip[op](data) }],
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
      if (path.startsWith('node:')) return `const m = globalThis.__node[${JSON.stringify(path.slice(5))}]\nexport default m\nexport const { ${named[path.slice(5)] ?? ''} } = m`
      const source = (files.get(path) ?? '').replace(/^#!.*/, '')
      if (path.endsWith('.json')) return `export default ${source}`
      if (moduleIn(files, path, source, js.parses)) return meta(source, path)
      // CommonJS through require, so both share it; its names importable, as Node reads them.
      const names = cjsNames(files, path, source)
      return `const m = globalThis.__requireFrom(${JSON.stringify(path)})(${JSON.stringify(path)})\nexport default m\nexport const { ${names.join(', ')} } = m`
    // import() in code with no name of its own (new Function's, as prettier's bin makes) resolves from the file that made it.
    }, (/** @type {string} */ base, /** @type {string} */ spec) => resolve(files, base.startsWith('/') ? base : /^(<input>)?$/.test(base) && js.compiled ? js.compiled : `${cwd}/${base}`, spec, 'import') ?? { error: missing(spec) })
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
 * @param {Parameters<typeof jsContext>[0] & { code: string, print?: boolean, file?: string }} options
 * @param {Computer} computer
 */
async function javascript(options, computer) {
  const { code, cwd, tool = false, print = false, name = '-' } = options
  // A program's file (node's, or npx's bin/tsc, whatever its name) runs from its own folder, its package's kind of module.
  const file = tool ? undefined : options.file
  const js = await jsContext(options, computer)
  const { vm } = js
  try {
    await js.begin(options.run)
    if (file && !js.files.has(file)) js.files.set(file, code)
    const { logs, errors } = js
    // What a program wrote without its line's end yet, and the exit code it set (process.exitCode).
    const finish = () => {
      let exit = 0
      js.step(() => {
        const ended = vm.evalCode('globalThis.__flush?.(); Number(globalThis.__exited ?? globalThis.process?.exitCode ?? 0)')
        if (ended.error) ended.error.dispose()
        else exit = ended.value.consume((/** @type {QuickJSHandle} */ value) => vm.dump(value))
      })
      return exit || 0
    }
    // The result is what the script returns or, as in a console, its last expression
    // (small brains write `Math.cos(9)` and expect its value). First as a script with
    // top-level await, which resolves to { value: <last expression> }; a top-level return
    // doesn't parse there, and nothing ran, so then as the body of an async function.
    /** @type {any} */
    let evaluated
    const exited = (/** @type {{ exit: number }} */ value) => ({ ok: true, exit: value.exit, stdout: lines(logs), stderr: lines(errors) })
    // A program with import or export is a module, whose value is nothing.
    if (!tool && (file ? moduleIn(js.files, file, code, js.parses) : isModule(name, code))) {
      js.step(() => { evaluated = file ? vm.evalCode(meta(code.replace(/^#!.*/, ''), file), file, { type: 'module' }) : vm.evalCode(code, name.startsWith('/') ? name : `${cwd}/[eval].mjs`, { type: 'module' }) })
      const done = await js.settle(vm.unwrapResult(evaluated))
      if (!done.dispose) return exited(done)
      done.dispose()
      await js.idle()
      return { ok: true, result: null, logs, exit: finish(), stdout: lines(logs), stderr: lines(errors) }
    }
    // A CommonJS program is the main module, with its own require, module and __dirname.
    const script = file ? `globalThis.__runMain(${JSON.stringify(file)}), undefined` : code
    js.step(() => { evaluated = vm.evalCode(script, name, ASYNC_SCRIPT) })
    const asScript = !evaluated.error
    if (!asScript) {
      evaluated.error.dispose()
      js.step(() => { evaluated = vm.evalCode(`(async () => {\n${script}\n})()`, name) })
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
    return { ok: true, result: result === undefined ? null : result, logs, exit: finish(), stdout: lines(logs), stderr: lines(errors) }
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
