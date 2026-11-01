// SPDX-FileCopyrightText: 2026 Warehouse SAS
// SPDX-License-Identifier: Elastic-2.0

// Masked requests (D681): what policy's `dlp.mask` hides goes to a brain in the cloud as placeholders, found on the
// device, and comes back real. Only the wire changes: records, tools, files, memory and approvals keep real values, so
// the one hook sits innermost, at the edge, as a generator, which fire() can't pass over: anything failing before the
// request fails the step. Masked isn't anonymous: context can still say who, and what isn't found goes as it is.
// Host-agnostic.
import { decoded, finder, leaves, OUT, PLACES, SENT } from './detect.js'

const PLACEHOLDER = /⟦\s*([A-Z])([0-9a-f]{6,})\s*⟧/g
// A brain may drop the brackets, or write others: a known id is known without them, sparse as ids are, and any other stays as it is.
const REVEALED = /⟦\s*([A-Z])([0-9a-f]{6,})\s*⟧|(?<![\p{L}\p{N}])([A-Z])([0-9a-f]{6,})(?![\p{L}\p{N}])/gu
// Where a mark may have begun at the end of what came so far: waited for, so that it comes back whole.
const OPENING = /(?:⟦[^⟧\n]{0,40}|(?<![\p{L}\p{N}])[A-Z][0-9a-f]{0,15})$/u
// Whatever a source holds between these brackets is hidden too, so a file can't forge one.
const BRACKETED = /⟦[^⟦⟧\n]{0,40}⟧/g
const LETTERS = /** @type {Record<string, string>} */ ({ person: 'P', organisation: 'O', place: 'L', email: 'E', phone: 'T', id: 'I', word: 'W', forged: 'X' })
const RULE = 'Marks like ⟦P7f3a9c⟧ stand for real names and details that the person sees in full. Copy them exactly, in code too; never guess at them or ask what they are.'

const EMAIL = /(?<![\p{L}\p{N}._%+-])[\p{L}\p{N}._%+-]{1,64}@[\p{L}\p{N}-]{1,63}(?:\.[\p{L}\p{N}-]{1,63}){1,8}/gu
const PHONE = /(?<![\p{N}.,])(?:(?:\+|00)\d{1,3}[ .\u00a0-]?(?:\(\d{1,4}\)[ .\u00a0-]?)?\d(?:[ .\u00a0-]?\d){5,13}|0\d(?:[ .\u00a0-]?\d){7,10}|\(\d{3}\)[ .\u00a0-]?\d{3}[ .-]\d{4}|\d{3}-\d{3}-\d{4})(?!\p{N})/gu
/** What `hide` can ask for. @type {Record<string, RegExp>} */
const HIDDEN = { email: EMAIL, phone: PHONE }

// Titles, guards, summaries and answer-now slice before the hook, so a number can arrive cut, its key gone.
const CUT_END = /(?:\b[a-z]{2}\d{2}[a-z0-9 \u00a0.-]{6,}|(?<!\d)\d(?:[ \u00a0.-]?\d){7,})$/i
const CUT_START = /^[\dA-Z]{1,4}(?:[ \u00a0.-]?[\dA-Z]{1,4}){2,10}(?=\s|$)/
const NUMBERS = ['card', 'iban', 'nir', 'ssn']
const SHORTEST_CUT = 4
// What is longer than this (a private key) is found by what found it, not looked for again everywhere as a word.
const LONGEST_KNOWN = 256

// Scripts that attach words to a name, or write none apart: a name there has no edge to look for.
const ATTACHED = /[\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/u

/** @typedef {{ start: number, end: number, kind: string, value?: string }} Span */
/**
 * What is known of one task's masks.
 * @typedef {{ key: Promise<CryptoKey>, values: Map<string, string>, ids: Map<string, string>, raws: Set<string>, version: number, known?: { version: string, regex: RegExp | null, forms: Map<string, string>, bare: RegExp | null, bases: string[] }, found: Map<string, Promise<Span[]>> }} Entry
 */

const escaped = (/** @type {string} */ text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const hex = (/** @type {ArrayBuffer} */ bytes) => [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
const keyFor = (/** @type {string} */ secret) => crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
/** A `raw` as a mark to recognise it by. @param {unknown} raw */
const markOf = async (raw) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(raw))))

/** The argument that holds code, and its language, by tool. @type {Record<string, [string, 'shell' | 'js' | 'py']>} */
const CODE = { bash: ['command', 'shell'], javascript: ['code', 'js'], python: ['code', 'py'] }

/**
 * A value as it goes in code, by where it lands: a string, a comment, a heredoc, or bare.
 * @param {string} value @param {string | null} state @param {'shell' | 'js' | 'py'} lang
 */
export function inCode(value, state, lang) {
  if (state === 'comment') return value.replace(/\s*\n\s*/g, ' ')
  if (lang === 'shell') {
    if (state === "'") return value.replaceAll("'", "'\\''")
    if (state === '"') return value.replace(/[\\"$`]/g, '\\$&')
    if (state === 'here') return value.replace(/[\\$`]/g, '\\$&')
    if (state === 'here-raw') return value
    return `'${value.replaceAll("'", "'\\''")}'`
  }
  if (state === null) return JSON.stringify(value)
  const lines = (/** @type {string} */ text) => text.replace(/\n/g, '\\n').replace(/\r/g, '\\r')
  if (state === '`') return lines(value.replace(/[\\`$]/g, '\\$&'))
  if (state.length === 3) return lines(value.replace(/\\/g, '\\\\').replaceAll(state[0], `\\${state[0]}`))
  return lines(value.replace(/\\/g, '\\\\').replaceAll(state, `\\${state}`))
}

/**
 * Code with each placeholder made real, escaped for where it stands: a small lexer, as a quote in a comment or a heredoc
 * mustn't count, and `L'Oréal` must not end the string it lands in.
 * @param {string} code @param {'shell' | 'js' | 'py'} lang @param {(whole: string, kind: string, id: string) => string | undefined} valueOf
 */
export function revealInCode(code, lang, valueOf) {
  let out = ''
  /** @type {string | null} */
  let state = null
  /** @type {{ end: string, raw: boolean }[]} */
  const pending = []
  /** @type {string} */
  let closing = ''
  const shape = new RegExp(REVEALED.source, 'uy')
  for (let i = 0; i < code.length;) {
    const char = code[i]
    if (char === '⟦' || (char >= 'A' && char <= 'Z')) {
      shape.lastIndex = i
      const found = shape.exec(code)
      const value = found ? valueOf(found[0], found[1] ?? found[3], found[2] ?? found[4]) : undefined
      if (found && value !== undefined) {
        out += inCode(value, state, lang)
        i += found[0].length
        continue
      }
      if (found && char === '⟦') {
        out += found[0]
        i += found[0].length
        continue
      }
    }
    const take = (/** @type {number} */ length) => { out += code.slice(i, i + length); i += length }
    if (state === null) {
      const three = code.slice(i, i + 3)
      if (lang === 'py' && (three === "'''" || three === '"""')) { state = three; take(3) }
      else if (char === "'" || char === '"' || (char === '`' && lang === 'js')) { state = char; take(1) }
      else if (lang === 'js' && code.startsWith('//', i)) { state = 'comment'; closing = '\n'; take(2) }
      else if (lang === 'js' && code.startsWith('/*', i)) { state = 'comment'; closing = '*/'; take(2) }
      else if (char === '#' && lang !== 'js' && (lang === 'py' || /(^|\s)$/.test(code.slice(Math.max(0, i - 1), i)))) { state = 'comment'; closing = '\n'; take(1) }
      else if (lang === 'shell' && code.startsWith('<<', i) && code[i + 2] !== '<') {
        const here = /^<<-?\s*(?:'(\w+)'|"(\w+)"|\\?(\w+))/.exec(code.slice(i, i + 80))
        if (here) { pending.push({ end: here[1] ?? here[2] ?? here[3], raw: Boolean(here[1] ?? here[2]) }); take(here[0].length) }
        else take(2)
      } else if (lang === 'shell' && char === '\n' && pending.length) { take(1); state = pending[0].raw ? 'here-raw' : 'here' }
      else if (char === '\\') take(2)
      else take(1)
    } else if (state === 'comment') {
      if (code.startsWith(closing, i)) { take(closing.length); state = null } else take(1)
    } else if (state === 'here' || state === 'here-raw') {
      const eol = code.indexOf('\n', i)
      const line = code.slice(i, eol < 0 ? code.length : eol)
      if ((i === 0 || code[i - 1] === '\n') && line.trim() === pending[0].end) {
        pending.shift()
        take(line.length)
        state = pending.length ? (pending[0].raw ? 'here-raw' : 'here') : null
        if (state && code[i] === '\n') take(1)
      } else {
        // A placeholder on the line stops the taking at it.
        const mark = line.indexOf('⟦')
        if (mark > 0) take(mark)
        else if (mark === 0) take(1)
        else take(line.length + (eol < 0 ? 0 : 1))
      }
    } else if (char === '\\' && !(lang === 'shell' && state === "'")) take(2)
    else if (code.startsWith(state, i)) { const length = state.length; state = null; take(length) }
    else take(1)
  }
  return out
}

/** Each form a value can arrive in, as an earlier call's arguments keep it, encoded or escaped. @param {string} value @returns {Set<string>} */
export function variants(value) {
  const forms = new Set([value, value.normalize('NFC'), value.normalize('NFD')])
  for (const form of [...forms]) {
    const json = JSON.stringify(form).slice(1, -1)
    forms.add(json)
    forms.add(json.replace(/[\u0080-\uffff]/g, (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`))
    for (const [lang, states] of /** @type {const} */ ([['shell', ["'", '"', 'here']], ['js', ["'", '"', '`']], ['py', ["'", '"', "'''", '"""']]])) for (const state of states) forms.add(inCode(form, state, lang))
    forms.add(form.replace(/&/g, '&amp;').replace(/'/g, '&#39;').replace(/"/g, '&quot;').replace(/</g, '&lt;'))
    forms.add(form.replace(/'/g, '&apos;'))
    try {
      const url = encodeURIComponent(form)
      for (const one of [url, url.replace(/%20/g, '+'), url.replace(/'/g, '%27'), url.replace(/'/g, '%27').replace(/%20/g, '+')]) forms.add(one)
    } catch {}
  }
  return forms
}

/** A text as a person reads it, whatever encoded it: what the last sweep looks at. @param {string} text */
const plainly = (text) => decoded(text).replace(/\\u([0-9a-f]{4})/gi, (_, code) => String.fromCharCode(Number.parseInt(code, 16))).replace(/'\\''/g, "'").replace(/\\(['"$`\\])/g, '$1')
  .replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&amp;/g, '&').normalize('NFC')

/** A form as a pattern that finds it whole, where its script has words to be whole in. @param {string} form */
function whole(form) {
  const [first, last] = [[...form][0], [...form].at(-1)]
  return `${ATTACHED.test(first) ? '' : '(?<![\\p{L}\\p{N}])'}${escaped(form)}${ATTACHED.test(last ?? '') ? '' : '(?![\\p{L}\\p{N}])'}`
}

/** A copy of a value with each string, key and number as `each` gives it, by a list, however deep what a brain wrote goes. @param {any} given @param {(text: string) => string} each */
export function mapped(given, each) {
  const out = /** @type {any} */ ({})
  const set = (/** @type {any} */ into, /** @type {string | number} */ key, /** @type {unknown} */ value) => Object.defineProperty(into, key, { value, enumerable: true, writable: true, configurable: true })
  /** @type {[any, any, string | number][]} */
  const stack = [[given, out, 'value']]
  while (stack.length) {
    const [value, into, key] = /** @type {[any, any, string | number]} */ (stack.pop())
    if (typeof value === 'string') set(into, key, each(value))
    else if (typeof value === 'number' || typeof value === 'bigint') {
      const said = each(String(value))
      set(into, key, said === String(value) ? value : said)
    } else if (Array.isArray(value)) {
      const list = new Array(value.length)
      set(into, key, list)
      for (let i = 0; i < value.length; i++) stack.push([value[i], list, i])
    } else if (value && typeof value === 'object') {
      const object = {}
      set(into, key, object)
      for (const [name, one] of Object.entries(value)) {
        const named = each(name)
        set(object, named, undefined)
        stack.push([one, object, named])
      }
    } else set(into, key, value)
  }
  return out.value
}

/** What goes on the wire of a step, each string through `each`: a list of what's sent, so that a field added later goes nowhere until it's named here. @param {any} e @param {(text: string) => string} each */
function onWire(e, each) {
  const text = (/** @type {any} */ value) => (typeof value === 'string' ? each(value) : value)
  return {
    ...e,
    system: text(e.system),
    messages: e.messages.map((/** @type {any} */ { role, content, documents, toolCalls, raw, rawModel, toolCallId, name, isError }) => ({
      role,
      content: text(content),
      ...(documents && { documents: documents.map((/** @type {any} */ part) => ({ ...part, name: text(part.name), text: text(part.text) })) }),
      ...(toolCalls && { toolCalls: toolCalls.map((/** @type {any} */ call) => ({ ...call, args: mapped(call.args, each) })) }),
      ...(raw && { raw, rawModel }),
      ...(toolCallId !== undefined && { toolCallId, name }),
      ...(isError && { isError }),
    })),
    ...(e.tools && { tools: e.tools.map((/** @type {any} */ tool) => ({ ...tool, description: text(tool.description), parameters: mapped(tool.parameters, each) })) }),
  }
}

/**
 * The hooks. What each case says and where things are kept come from `say`.
 * @param {import('./detect.js').Dlp} dlp
 * @param {{
 *   isLocal: (brain: any) => boolean,
 *   load: (task: string) => Promise<{ id: string, records: any[] } | null>,
 *   keep: (task: string, meta: Record<string, any>) => Promise<void>,
 *   assistant: () => string,
 *   open: () => boolean,
 *   refused: (why: string, e: any) => AsyncIterable<any>,
 *   held?: () => void,
 *   heldReason: () => string,
 *   why: (values: string[]) => string,
 *   mayGo: () => string,
 *   reason: () => string,
 *   names?: (text: string) => Promise<Span[]>,
 *   more?: () => string[],
 *   told?: (letters: string[], task?: string) => void,
 *   sent?: (task: string | undefined, step: any) => void,
 * }} say
 * @returns {import('../core/hooks.js').Hook[]}
 */
export function maskHooks(dlp, say) {
  const { hide = [], words: policyWords = [], keep = [], pictures = 'hold' } = dlp.mask ?? {}
  // The organisation's, and what the person added: only ever more.
  const wordsNow = () => [...policyWords, ...say.more?.() ?? []]
  const known = (dlp.detect ?? []).flatMap((one) => (typeof one === 'string' ? [one] : []))
  const patterns = (dlp.detect ?? []).flatMap((one) => (typeof one === 'string' ? [] : [new RegExp(one.pattern, [...new Set(`${one.flags ?? ''}g`)].join(''))]))
  const sweepFinder = finder({ detect: dlp.detect })
  const cuts = known.some((id) => NUMBERS.includes(id))
  /** @param {string} value */
  const kept = (value) => [...keep, say.assistant()].some((word) => word.toLowerCase() === value.toLowerCase())
  /** @type {Map<string, Promise<Entry>>} */
  const entries = new Map()

  /** @param {string | undefined} secret */
  const blank = (secret) => /** @type {Entry} */ ({ key: keyFor(secret ?? crypto.randomUUID()), values: new Map(), ids: new Map(), raws: new Set(), version: 0, found: new Map() })

  /** What is known of a task, read from its records once. @param {string | undefined} task @returns {Promise<Entry>} */
  function entryOf(task) {
    if (!task) return Promise.resolve(blank(undefined))
    const had = entries.get(task)
    if (had) return had
    const loading = say.load(task).then((loaded) => {
      const entry = blank(loaded?.id)
      for (const { meta } of loaded?.records ?? []) {
        for (const [id, value] of Object.entries(meta?.masked ?? {})) {
          entry.values.set(id, /** @type {string} */ (value))
          entry.ids.set(/** @type {string} */ (value), id)
        }
        if (meta?.maskedRaw) entry.raws.add(meta.maskedRaw)
      }
      entry.version = 1
      return entry
    })
    loading.catch(() => entries.delete(task))
    entries.set(task, loading)
    return loading
  }

  /** The forms of all that's known, and of `words`, as one pattern, built again as the map grows. @param {Entry} entry */
  function knownOf(entry) {
    const words = wordsNow()
    const version = `${entry.version}/${words.length}/${say.assistant()}`
    if (entry.known?.version === version) return entry.known
    /** @type {Map<string, string>} */
    const forms = new Map()
    const bases = [...entry.values.values(), ...words].filter((value) => value.length <= LONGEST_KNOWN && !kept(value))
    for (const base of bases) for (const form of variants(base)) if (!forms.has(form.toLowerCase())) forms.set(form.toLowerCase(), base)
    const alternatives = [...forms.keys()].sort((a, b) => b.length - a.length).map(whole)
    const bare = bases.length ? new RegExp(bases.map((base) => whole(base.normalize('NFC'))).join('|'), 'iu') : null
    entry.known = { version, regex: alternatives.length ? new RegExp(alternatives.join('|'), 'giu') : null, forms, bare, bases }
    return entry.known
  }

  /** What finding doesn't depend on the map for: `detect`, `hide`, a source's brackets and the names on this device; read once per text. @param {Entry} entry @param {string} text */
  function foundIn(entry, text) {
    const had = entry.found.get(text)
    if (had) return had
    /** @type {Span[]} */
    const spans = []
    const add = (/** @type {string} */ kind, /** @type {Iterable<[number, number]>} */ places) => { for (const [start, end] of places) if (end > start) spans.push({ start, end, kind }) }
    const by = (/** @type {RegExp} */ shape) => [...text.matchAll(shape)].map((match) => /** @type {[number, number]} */ ([match.index, match.index + match[0].length]))
    for (const id of known) add('id', PLACES[id](text))
    for (const pattern of patterns) add('id', by(pattern))
    for (const kind of hide) if (HIDDEN[kind]) add(kind, by(HIDDEN[kind]))
    add('forged', by(BRACKETED))
    if (cuts) {
      // An end is short: what could be cut there is looked for there alone, however long the text.
      const from = Math.max(0, text.length - 60)
      const end = CUT_END.exec(text.slice(from))
      if (end) add('id', [[from + end.index, text.length]])
      const start = CUT_START.exec(text)
      if (start && start[0].replace(/\D/g, '').length >= 8) add('id', [[0, start[0].length]])
    }
    const found = say.names ? say.names(text).then((names) => [...spans, ...names]) : Promise.resolve(spans)
    // Kept while they last: a brain's window of text, read again at each step.
    if (entry.found.size > 4000) entry.found.clear()
    entry.found.set(text, found)
    found.catch(() => entry.found.delete(text))
    return found
  }

  /** All that hides in a text, overlaps as one, longest kind first. @param {Entry} entry @param {string} text @returns {Promise<Span[]>} */
  async function spansIn(entry, text) {
    const spans = [...await foundIn(entry, text)]
    const { regex, forms, bases } = knownOf(entry)
    if (regex) {
      for (const match of text.matchAll(regex)) {
        const lower = match[0].toLowerCase()
        const base = forms.get(lower) ?? match[0]
        // Another case of a value is a value of its own, put back as it was; an escaped one is that value.
        const value = base.toLowerCase() === lower && base !== match[0] ? match[0] : base
        spans.push({ start: match.index, end: match.index + match[0].length, kind: entry.ids.get(base)?.[0] ?? 'W', value })
      }
    }
    // A text cut before the hook may end in part of a value, or start with the rest of one.
    for (const value of bases) {
      if (value.length <= SHORTEST_CUT) continue
      for (let length = value.length - 1; length >= SHORTEST_CUT; length--) {
        if (text.endsWith(value.slice(0, length)) && !/[\p{L}\p{N}]/u.test(text[text.length - length - 1] ?? '')) { spans.push({ start: text.length - length, end: text.length, kind: 'W', value: value.slice(0, length) }); break }
      }
      for (let length = value.length - 1; length >= SHORTEST_CUT; length--) {
        if (text.startsWith(value.slice(-length)) && !/[\p{L}\p{N}]/u.test(text[length] ?? '')) { spans.push({ start: 0, end: length, kind: 'W', value: value.slice(-length) }); break }
      }
    }
    spans.sort((a, b) => a.start - b.start || b.end - a.end)
    /** @type {Span[]} */
    const merged = []
    for (const span of spans) {
      const last = merged.at(-1)
      if (last && span.start < last.end) {
        // Nested: the longest stands. Overlapping: both, so no part of either goes as it is.
        if (span.end > last.end) merged[merged.length - 1] = { start: last.start, end: span.end, kind: last.end - last.start >= span.end - span.start ? last.kind : span.kind }
      } else merged.push({ ...span })
    }
    return merged.filter((span) => span.kind === 'id' || !kept(text.slice(span.start, span.end)))
  }

  /** The id of a value, kept in `fresh` when new: sparse, so a brain's slip lands on nobody, and the same in whoever asks, helpers and other tabs included. @param {Entry} entry @param {string} kind @param {string} value @param {Record<string, string>} fresh */
  async function idOf(entry, kind, value, fresh) {
    const had = entry.ids.get(value)
    if (had) return had
    const letter = LETTERS[kind] ?? (Object.values(LETTERS).includes(kind) ? kind : 'W')
    const hash = hex(await crypto.subtle.sign('HMAC', await entry.key, new TextEncoder().encode(value)))
    for (let length = 6; ; length += 2) {
      const id = `${letter}${hash.slice(0, length)}`
      const other = entry.values.get(id)
      if (other !== undefined && other !== value) continue
      if (entry.ids.has(value)) return /** @type {string} */ (entry.ids.get(value))
      entry.values.set(id, value)
      entry.ids.set(value, id)
      entry.version++
      fresh[id] = value
      return id
    }
  }

  /** `raw` goes back only as the brain wrote it to this mask, whose mark was kept: a signature can't be read, and an earlier turn's can hold anything. From the first that doesn't, none does. @param {any[]} messages @param {Entry} entry @param {any} brain */
  async function replayable(messages, entry, brain) {
    let dropped = false
    const out = []
    for (const message of messages) {
      if (!message.raw) { out.push(message); continue }
      const { raw, rawModel, ...rest } = message
      if (rawModel && rawModel !== brain.model) { out.push(rest); continue }
      dropped ||= !entry.raws.has(await markOf(raw))
      out.push(dropped ? rest : message)
    }
    // A brain paused in its own search can't go on from part of what it wrote.
    if (dropped && messages.at(-1)?.role === 'assistant' && messages.at(-1).raw) throw new Error('a paused step can\'t go on masked')
    return out
  }

  /** Any picture out of the step, unless policy sends them, with a line saying so: they aren't read. @param {any} e */
  function held(e) {
    if (pictures === 'send' || !e.messages.some((/** @type {any} */ message) => message.documents?.some((/** @type {any} */ part) => part.images?.length))) return e
    say.held?.()
    return { ...e, messages: e.messages.map((/** @type {any} */ message) => (message.documents ? { ...message, documents: message.documents.map((/** @type {any} */ { images, ...part }) => (images?.length ? { ...part, text: `${part.text ? `${part.text}\n` : ''}${say.heldReason()}` } : part)) } : message)) }
  }

  /** The last look, by other means than masking's: nothing found may go, whatever put it there. @param {any} e @param {Entry} entry */
  function sweep(e, entry) {
    const { bare } = knownOf(entry)
    onWire(e, (text) => {
      const without = text.replace(PLACEHOLDER, 'x')
      const plain = plainly(without)
      const hits = [...sweepFinder(without), ...sweepFinder(plain)]
      for (const kind of hide) if (HIDDEN[kind] && without.search(HIDDEN[kind]) >= 0) hits.push(kind)
      if (bare?.test(plain)) hits.push('value')
      if (hits.length) throw new Error(`what should be masked is still there: ${[...new Set(hits)].join(', ')}`)
      return text
    })
  }

  /** The step as it goes. @param {any} e @param {Entry} entry */
  async function masked(e, entry) {
    const step = held(e)
    /** @type {Set<string>} */
    const strings = new Set()
    onWire(step, (text) => { strings.add(text); return text })
    /** @type {Record<string, string>} */
    const fresh = {}
    /** @type {Map<string, Span[]>} */
    let spans = new Map()
    // Whatever a text is found to hold is hidden in all of them: until nothing new turns up.
    for (let round = 0; ; round++) {
      if (round > 6) throw new Error('masking did not settle')
      const before = entry.version
      spans = new Map()
      for (const text of strings) {
        if (e.signal?.aborted) throw new Error('aborted')
        const found = await spansIn(entry, text)
        spans.set(text, found)
        for (const span of found) await idOf(entry, span.kind, span.value ?? text.slice(span.start, span.end), fresh)
      }
      if (entry.version === before) break
    }
    const replaced = onWire(step, (text) => {
      let [out, at] = ['', 0]
      for (const span of spans.get(text) ?? []) {
        out += `${text.slice(at, span.start)}⟦${entry.ids.get(span.value ?? text.slice(span.start, span.end))}⟧`
        at = span.end
      }
      return out + text.slice(at)
    })
    const going = { ...replaced, messages: await replayable(replaced.messages, entry, e.brain) }
    sweep(going, entry)
    if (Object.keys(fresh).length) {
      if (e.task) await say.keep(e.task, { masked: fresh })
      say.told?.(Object.keys(fresh).map((id) => id[0]), e.task)
    }
    say.sent?.(e.task, going)
    return { ...going, system: [going.system, RULE].filter(Boolean).join('\n\n') }
  }

  /** What came back, real: `raw` as the brain wrote it, its mark kept. @param {AsyncIterable<any>} events @param {Entry} entry @param {any} e */
  async function* revealed(events, entry, e) {
    const real = (/** @type {string} */ text) => text.replace(REVEALED, (found, kind, id, bareKind, bareId) => entry.values.get(`${kind ?? bareKind}${id ?? bareId}`) ?? found)
    const argsOf = (/** @type {any} */ call) => {
      const args = mapped(call.args, real)
      const code = Object.hasOwn(CODE, call.name) ? CODE[call.name] : null
      if (!code || typeof call.args?.[code[0]] !== 'string') return args
      return { ...args, [code[0]]: revealInCode(call.args[code[0]], code[1], (_, kind, id) => entry.values.get(`${kind}${id}`)) }
    }
    /** @type {Record<string, string>} */
    const waiting = { text: '', thinking: '' }
    /** Text up to a placeholder that may not have ended yet. @param {'text' | 'thinking'} type @param {string} delta */
    const ready = (type, delta) => {
      const all = waiting[type] + delta
      const open = OPENING.exec(all)
      waiting[type] = open ? open[0] : ''
      return real(open ? all.slice(0, open.index) : all)
    }
    const flush = function* () {
      for (const type of /** @type {const} */ (['thinking', 'text'])) {
        if (waiting[type]) yield { type, delta: real(waiting[type]) }
        waiting[type] = ''
      }
    }
    for await (const event of events) {
      if (event.type === 'text' || event.type === 'thinking') {
        const delta = ready(event.type, event.delta)
        if (delta) yield { ...event, delta }
        continue
      }
      yield* flush()
      if (event.type === 'tool_call') yield { ...event, call: { ...event.call, args: argsOf(event.call) } }
      else if (event.type === 'done') {
        const raw = event.message?.raw
        if (raw && e.task) {
          const mark = await markOf(raw)
          entry.raws.add(mark)
          await say.keep(e.task, { maskedRaw: mark }).catch((error) => console.warn('Mask', error))
        } else if (raw) entry.raws.add(await markOf(raw))
        yield { ...event, message: event.message && { ...event.message, content: real(event.message.content ?? ''), ...(event.message.toolCalls && { toolCalls: event.message.toolCalls.map((/** @type {any} */ call) => ({ ...call, args: argsOf(call) })) }) } }
      } else yield event
    }
    yield* flush()
  }

  return [
    { on: 'turn.step', tier: 'edge', by: 'dlp', run: async function* (/** @type {any} */ e, /** @type {(e?: any) => Promise<any>} */ next) {
      if (say.isLocal(e.brain) || dlp.brains?.includes(e.brain.id)) return yield* await next(e)
      /** @type {Entry} */
      let entry
      /** @type {any} */
      let going
      try {
        entry = await entryOf(e.task)
        going = await masked(e, entry)
      } catch (error) {
        return yield* say.refused(/** @type {Error} */ (error).message, e)
      }
      yield* revealed(await next(going), entry, e)
    } },
    { on: 'tool.check', tier: 'policy', by: 'dlp', run: async (/** @type {any} */ e, /** @type {(e?: any) => Promise<any>} */ next) => {
      const said = await next(e)
      if (said?.refuse || said?.decision === 'never') return said
      if ((e.name === 'picture' || e.name === 'film') && pictures !== 'send' && [e.args?.from ?? []].flat().filter(Boolean).length) return { decision: 'never', reason: say.heldReason() }
      const entry = await entryOf(e.task).catch(() => null)
      if (entry && e.name === 'reach_site') return entry.values.size ? { ...said, meta: { ...said?.meta, why: say.mayGo() } } : said
      if (!(OUT.includes(e.kind) || SENT.includes(e.name) || said?.meta?.machine || (e.kind === 'execute' && say.open()))) return said
      const texts = [e.title ?? '', ...leaves(e.args)].map(plainly)
      const values = !entry ? [] : [...entry.values.values()].filter((value) => !kept(value) && texts.some((text) => text.toLowerCase().includes(value.normalize('NFC').toLowerCase())))
      if (entry && !values.length) return said
      return dlp.then === 'never' ? { decision: 'never', reason: say.reason() }
        : { decision: 'ask', meta: { ...said?.meta, guard: 'dlp', why: say.why(values) } }
    } },
    { on: 'remove', tier: 'policy', by: 'dlp', run: async (/** @type {any} */ e, /** @type {(e?: any) => Promise<any>} */ next) => {
      const said = await next(e)
      if (e.task) entries.delete(e.task)
      return said
    } },
  ]
}
