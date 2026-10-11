// The answer eval: a brain answers each question through Jean's own loop, prompt and file tools
// (core/loop.js, core/prompt.js, core/files.js), under one condition or another, and its answer is
// graded without a brain: the last "Answer:" line against the gold, and whether what it was shown
// held the evidence. Brains are OpenRouter's free ones; the key comes from OPENROUTER_API_KEY.
import { runTurn } from '../../app/core/loop.js'
import { buildSystemPrompt } from '../../app/core/prompt.js'
import { addFile, documentPart, estimateTokens, pagesThatFit, preselect, readTool, searchTool } from '../../app/core/files.js'
import { memoryFS } from '../../app/core/fs.js'
import { PROVIDERS } from '../../app/core/llm.js'
import { lookup } from '../../app/core/search.js'
import { norm, normalise } from './text.js'
import { fuse, nearest } from './retrieval.js'

/** @typedef {import('./corpus.js').Question} Question */

/** The brains: one with a large context, and a small one held to the device brain's 32k. */
export const BRAINS = {
  large: { model: 'nvidia/nemotron-3-super-120b-a12b:free', context: 262144 },
  small: { model: 'liquid/lfm-2.5-2.6b:free', context: 32768 },
}

const SHARE = 0.25 // a shared file's share of the context (D55)
const ASK = '\n\nEnd your reply with one line "Answer: …" giving just the answer, or "Answer: none" if the files do not say.'

/** The corpus's files in a project's library, as Jean keeps them. @param {{ name: string, pages: string[] }[]} files */
export async function library(files) {
  const fs = memoryFS()
  const enc = new TextEncoder()
  const links = []
  for (const [i, file] of files.entries()) links.push({ ...(await addFile(fs, { projectDir: 'p', name: file.name, bytes: enc.encode(`${file.name}\n${i}`), pages: file.pages, by: 'eval' })), _meta: { source: i + 1 } })
  return { fs, links }
}

/** JavaScript in QuickJS, Jean's sandbox engine, with file(name) for a file's whole text and console.log for output. */
let quickjs = /** @type {Promise<any> | null} */ (null)
/** @param {string} code @param {(name: string) => string | null} file */
export async function script(code, file) {
  quickjs ??= (async () => {
    const { newQuickJSWASMModuleFromVariant } = await import('quickjs-emscripten-core')
    const variant = (await import('@jitl/quickjs-wasmfile-release-sync')).default
    return newQuickJSWASMModuleFromVariant(variant)
  })()
  const runtime = (await quickjs).newRuntime()
  runtime.setMemoryLimit(512 * 1024 * 1024)
  const started = Date.now()
  runtime.setInterruptHandler(() => Date.now() - started > 30_000)
  const vm = runtime.newContext()
  /** @type {string[]} */
  const out = []
  try {
    const log = vm.newFunction('log', (/** @type {any[]} */ ...args) => { out.push(args.map((a) => vm.dump(a)).map((v) => (typeof v === 'string' ? v : JSON.stringify(v))).join(' ')) })
    const consoleObject = vm.newObject()
    vm.setProp(consoleObject, 'log', log)
    vm.setProp(vm.global, 'console', consoleObject)
    const fileFn = vm.newFunction('file', (/** @type {any} */ name) => {
      const text = file(String(vm.dump(name)))
      return text === null ? { error: vm.newError(`No file named "${vm.dump(name)}"`) } : vm.newString(text)
    })
    vm.setProp(vm.global, 'file', fileFn)
    for (const handle of [log, consoleObject, fileFn]) handle.dispose()
    const result = vm.evalCode(code, 'script.js')
    if (result.error) {
      out.push(`Error: ${JSON.stringify(vm.dump(result.error))}`)
      result.error.dispose()
    } else result.value.dispose()
  } finally {
    vm.dispose()
    runtime.dispose()
  }
  const text = out.join('\n') || '(nothing printed: use console.log)'
  return estimateTokens(text) > 6000 ? `${text.slice(0, 18000)}\n… (output cut)` : text
}

/**
 * The tools and the document part of a condition.
 * @param {string} condition @param {{ fs: any, links: any[] }} lib @param {{ name: string, pages: string[] }[]} files
 * @param {{ docs?: import('./retrieval.js').Doc[], vectors?: { matrix: Int8Array, dims: number, embedQuery: (text: string) => Promise<Int8Array> } }} extra
 */
export function tools(condition, lib, files, extra = {}) {
  const read = readTool({ fs: lib.fs, projectDir: () => 'p', files: () => lib.links })
  const search = searchTool({ fs: lib.fs, projectDir: () => 'p', files: () => lib.links })
  /** @type {import('../../app/core/loop.js').Tool[]} */
  const list = [read]
  /** @type {{ name: string, line: string }[]} */
  const lines = [{ name: 'read', line: 'read pages of a file the user shared' }]
  const rules = ['Shared files are in the message, sometimes only their first pages. Use read for the others.']
  // Search comes with the conditions named for it (and summaries, which it searches); pages and preselect differ only in the pages shown.
  if (condition.startsWith('search') || condition === 'summaries') {
    lines.push({ name: 'search_files', line: 'find passages in the files by the words they hold' })
    rules.push('For a file too long to read whole, search it, then read the pages that matter.')
    list.push(condition === 'search+meaning' ? hybrid(search, lib, extra) : search)
  }
  if (condition === 'search+script') {
    lines.push({ name: 'javascript', line: 'run JavaScript; file(name) returns a file’s whole text' })
    rules.push('Compute totals and counts with code instead of estimating them.')
    list.push({
      spec: { name: 'javascript', description: 'Run JavaScript in a sandbox. file(name) returns a shared file’s whole text; print results with console.log.', parameters: { type: 'object', properties: { code: { type: 'string' } }, required: ['code'] } },
      kind: 'execute',
      title: () => 'Run JavaScript',
      run: async (args) => script(String(args?.code ?? ''), (name) => files.find((f) => f.name.toLowerCase() === name.trim().toLowerCase())?.pages.join('\n') ?? null),
    })
  }
  return { list, lines, rules }
}

/**
 * search_files ranking by meaning as well: BM25 and the embedder's nearest passages, fused (RRF),
 * in the same words as the lexical tool so that only the ranking differs.
 * @param {import('../../app/core/loop.js').Tool} lexical @param {{ links: any[] }} lib @param {any} extra
 * @returns {import('../../app/core/loop.js').Tool}
 */
function hybrid(lexical, lib, { docs, vectors }) {
  return {
    ...lexical,
    run: async (args, ctx) => {
      if (args?.every) return lexical.run(args, ctx)
      const query = String(args?.query ?? '')
      const all = docs.flatMap((/** @type {any} */ d, /** @type {number} */ doc) => d.index.passages.map((/** @type {any} */ p, /** @type {number} */ passage) => ({ doc, passage, p })))
      const words = lookup(docs.map((/** @type {any} */ d) => d.index.lexicon), query).slice(0, 200).map((hit) => all.find((a) => a.doc === hit.doc && a.passage === hit.passage))
      const meaning = nearest(vectors.matrix, vectors.dims, await vectors.embedQuery(query), 200).map((i) => all[i])
      let out = ''
      for (const a of fuse([words, meaning])) {
        if (!a) continue
        const d = docs[a.doc]
        const block = `${out ? '\n\n' : ''}Source [${lib.links[a.doc]._meta.source}]: ${d.name}, page ${a.p.page}${a.p.head && !/^#/.test(d.pages[a.p.page - 1].slice(a.p.start)) ? ` — ${a.p.head.split('\n')[0]}` : ''}\n${d.pages[a.p.page - 1].slice(a.p.start, a.p.end).trim()}`
        if (out && estimateTokens(out + block) > 6000) break
        out += block
      }
      return out || `Nothing in the files matches "${query}".`
    },
  }
}

/**
 * One question asked of one brain under one condition, through Jean's loop.
 * @param {{ question: Question, condition: string, brain: keyof typeof BRAINS, files: { name: string, pages: string[] }[], lib: { fs: any, links: any[] }, extra?: any, apiKey: string, maxSteps?: number }} options
 */
export async function ask({ question, condition, brain, files, lib, extra, apiKey, maxSteps = 12 }) {
  const { model, context } = BRAINS[brain]
  const budget = context * SHARE
  const { list, lines, rules } = tools(condition, lib, files, extra)
  // What the brain reads of each file with the message, decided once (D55): the first pages, or the matching ones.
  const documents = lib.links.map((link, i) => {
    const pages = files[i].pages
    const [first, last] = pagesThatFit(pages, budget / files.length)
    const chosen = condition === 'preselect' ? preselect(pages, question.text, budget / files.length) : [[first, last]]
    const shown = chosen.flatMap(([a, b]) => pages.slice(a - 1, b).map((page, j) => `[[page ${a + j}]]\n${page}`)).join('\n\n')
    const whole = chosen.length === 1 && chosen[0][0] === 1 && chosen[0][1] >= pages.length
    return whole ? documentPart(link, pages.join('\n\n')) : { ...documentPart(link, ''), text: `${shown}\n\n(Pages ${chosen.map(([a, b]) => (a === b ? a : `${a}–${b}`)).join(', ')} of ${pages.length}${condition === 'preselect' ? ', chosen as those that match the request' : ''}. Use read for the others.)` }
  })
  const system = buildSystemPrompt({ assistantName: 'Jean', uiLanguage: 'English', tools: lines, rules, now: new Date(Date.UTC(2026, 0, 15)) })
  /** @type {{ name: string, args: any, output: string }[]} */
  const calls = []
  const started = performance.now()
  const result = await runTurn({
    brain: { id: 'eval', provider: 'openrouter', api: 'openai', baseURL: PROVIDERS.openrouter.baseURL, model },
    apiKey, system, tools: list, maxSteps, rule: () => 'allow', retries: [5000, 20000, 60000],
    history: [{ role: 'user', content: question.text + ASK, documents }],
    onUpdate: (update) => {
      if (update.sessionUpdate === 'tool_call_update' && (update.status === 'completed' || update.status === 'failed') && typeof update.rawOutput === 'string') {
        const call = calls.find((c) => c.id === update.toolCallId)
        if (call) call.output = update.rawOutput
      } else if (update.sessionUpdate === 'tool_call' && update.kind !== 'think' && update.toolCallId) calls.push(/** @type {any} */ ({ id: update.toolCallId, name: update.name, args: update.rawInput, output: '' }))
    },
  })
  return { text: result.text, stopReason: result.stopReason, calls, ms: performance.now() - started, usage: result.usage, shown: documents.map((d) => d.text).join('\n\n') }
}

const NONE = /^(none|n\/a|no\b|not (found|stated|given|mentioned|specified|in)|unknown|aucun|aucune|néant|なし|不明|لا يوجد|غير)/i

/** The reply's last "Answer:" line, or else its last line. @param {string} text */
export const finalAnswer = (text) => [...text.matchAll(/^\W*(?:answer|réponse|回答|答え|الإجابة|الجواب)\s*[:：]\s*(.+)$/gim)].at(-1)?.[1].trim() ?? text.trim().split('\n').filter((line) => line.trim()).at(-1)?.trim() ?? ''

/** The numbers an answer holds, in any digits or local format. @param {string} text */
export function numbersIn(text) {
  const t = norm(text).replace(/(\d)[\s'’](?=\d{3}\b)/g, '$1')
  return [...t.matchAll(/\d+(?:[.,]\d+)*/g)].map((m) => {
    const s = m[0]
    // 12,480.00 or 12.480,00 or 12480,5: the last separator followed by one or two digits is the decimal one.
    const decimal = /[.,](\d{1,2})$/.exec(s)
    const whole = (decimal ? s.slice(0, -decimal[0].length) : s).replace(/[.,]/g, '')
    return Number(decimal ? `${whole}.${decimal[1]}` : whole)
  })
}

/**
 * A reply graded against the gold: right or not, and whether it said the files lack the answer.
 * @param {Question} q @param {string} reply
 */
export function grade(q, reply) {
  const answer = finalAnswer(reply)
  const abstained = !answer || NONE.test(answer) || /\b(do(es)? not|don't|doesn't) (say|mention|contain|state|include)|no (such|information|record)/i.test(answer)
  if (q.answer.kind === 'none') return { correct: abstained ? 1 : 0, abstained, answer }
  if (q.answer.kind === 'number') {
    const { value, tolerance = 0 } = q.answer
    return { correct: !abstained && numbersIn(answer).some((n) => Math.abs(n - value) <= tolerance + 1e-6) ? 1 : 0, abstained, answer }
  }
  const text = norm(answer)
  return { correct: !abstained && q.answer.accept.some((word) => text.includes(norm(word))) ? 1 : 0, abstained, answer }
}

/** Whether every piece of evidence was in what the brain was shown: the message or a tool's result. @param {Question} q @param {{ shown: string, calls: { output: string }[] }} run */
export function grounded(q, run) {
  const seen = normalise([run.shown, ...run.calls.map((c) => c.output)].join('\n')).text
  return q.evidence.length ? q.evidence.every((e) => seen.includes(norm(e.quote))) : true
}
