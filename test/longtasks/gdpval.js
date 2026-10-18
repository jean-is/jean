// GDPval's gold subset (OpenAI, arXiv 2510.04374; openai/gdpval on Hugging Face): 220 tasks of 44 occupations, each a
// request, reference files and a rubric, with the deliverable an expert made. Fetched at run time into .cache/, never
// committed: its card states no licence. The slice is the tasks Jean's tools can do: reference files Jean reads, a
// deliverable Jean can make (Word, Excel or text). Graded as GDPval grades, pairwise and blind, with the task's rubric,
// by a brain asked twice with the two deliverables swapped.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname } from 'node:path'
import { extract } from '../documents/formats.js'
import { pageText } from '../../app/caps/files/extract.js'
import { languageName } from '../../app/core/i18n.js'
import { say } from './people.js'
import { bothOrders, jsonIn, verdictOf } from './score.js'

/** @import { Brain } from './jean.js' */
/**
 * @typedef {{ task_id: string, sector: string, occupation: string, prompt: string, reference_files: string[], reference_file_urls: string[],
 *   deliverable_files: string[], deliverable_file_urls: string[], rubric_pretty: string, rubric_json: string }} Row
 * @typedef {{ name: string, bytes: Uint8Array, pages?: string[] }} File
 * @typedef {{ score: number, criterion: string }} Item
 */

const ROWS = 'https://datasets-server.huggingface.co/rows?dataset=openai/gdpval&config=default&split=train'
const READ = /\.(docx|xlsx|pptx|pdf|csv|txt|md)$/i
const MADE = /\.(docx|xlsx|csv|txt|md)$/i
// What a judge reads of each deliverable, and of the request's files' names.
const SHOWN = 40_000

/** Every task, fetched once into the cache. @param {string} cache @returns {Promise<Row[]>} */
export async function rows(cache) {
  const path = `${cache}gdpval/rows.json`
  if (existsSync(path)) return JSON.parse(await readFile(path, 'utf8'))
  /** @type {Row[]} */
  const all = []
  for (let offset = 0; ; offset += 100) {
    const res = await fetch(`${ROWS}&offset=${offset}&length=100`)
    if (!res.ok) throw new Error(`Hugging Face answered ${res.status} for GDPval's rows`)
    const page = await res.json()
    all.push(...page.rows.map((/** @type {any} */ row) => row.row))
    if (all.length >= page.num_rows_total) break
  }
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify(all))
  return all
}

/**
 * The slice: the tasks whose reference files Jean reads and whose deliverable it can make, one sector after another so
 * that every sector is in it, in an order fixed by the tasks' ids. @param {Row[]} all @param {number} count
 */
export function slice(all, count) {
  const fit = all.filter((row) => row.reference_files.every((file) => READ.test(file)) && row.deliverable_files.length && row.deliverable_files.every((file) => MADE.test(file)))
  /** @type {Map<string, Row[]>} */
  const sectors = new Map()
  for (const row of fit.toSorted((a, b) => (a.task_id < b.task_id ? -1 : 1))) sectors.set(row.sector, [...sectors.get(row.sector) ?? [], row])
  const lists = [...sectors.keys()].sort().map((sector) => /** @type {Row[]} */ (sectors.get(sector)))
  /** @type {Row[]} */
  const out = []
  for (let i = 0; out.length < Math.min(count, fit.length); i++) for (const list of lists) if (list[i] && out.length < count) out.push(list[i])
  return out
}

/** Files of a task, fetched once, with their text as Jean reads it. @param {string} cache @param {string[]} paths @param {string[]} urls @returns {Promise<File[]>} */
export async function filesOf(cache, paths, urls) {
  return Promise.all(paths.map(async (path, i) => {
    const local = `${cache}gdpval/${path}`
    if (!existsSync(local)) {
      const res = await fetch(urls[i])
      if (!res.ok) throw new Error(`Hugging Face answered ${res.status} for ${path}`)
      await mkdir(dirname(local), { recursive: true })
      await writeFile(local, new Uint8Array(await res.arrayBuffer()))
    }
    const bytes = new Uint8Array(await readFile(local))
    const name = decodeURIComponent(path.split('/').pop() ?? path)
    const pages = await extract(name, bytes, pageText).catch(() => [`(${name} could not be read)`])
    return { name, bytes, pages }
  }))
}

/**
 * The request in another language, written once by the brain given and kept in the cache; the files stay as they are.
 * @param {string} cache @param {Brain} translator @param {Row} row @param {string} lang
 */
export async function translated(cache, translator, row, lang) {
  const path = `${cache}gdpval/translated/${row.task_id}.${lang}.txt`
  if (existsSync(path)) return readFile(path, 'utf8')
  const text = await say(translator, 'You translate requests for work, faithfully and completely, keeping file names, numbers and formatting as they are. Reply with the translation only.',
    `Translate this request into ${languageName(lang, 'en')}:\n\n${row.prompt}`, { maxTokens: 8192 })
  if (!text) throw new Error(`No translation of ${row.task_id}`)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, text)
  return text
}

/** The rubric's items, numbered from 1. @param {Row} row @returns {Item[]} */
export const rubricOf = (row) => JSON.parse(row.rubric_json).map((/** @type {any} */ item) => ({ score: Number(item.score) || 0, criterion: String(item.criterion) }))

/** The share of the rubric's points that items met earn. @param {Item[]} rubric @param {unknown} met numbers of items, from 1 */
export function rubricScore(rubric, met) {
  const most = rubric.reduce((sum, item) => sum + Math.max(item.score, 0), 0)
  const numbers = new Set((Array.isArray(met) ? met : []).map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= rubric.length))
  return most ? Math.max(0, [...numbers].reduce((sum, n) => sum + rubric[n - 1].score, 0)) / most : NaN
}

const JUDGE = `You grade work deliverables as GDPval's expert graders do: for one task, you compare two deliverables, blind, against the task's rubric, and say which one better meets the request, as the client who asked would see it, or that they are as good as each other. A deliverable that is missing, unreadable or in the wrong form loses to one that is there. Length is no merit in itself. Judge the content, not the file's looks: you see each file's text only.`

/**
 * One verdict on two deliverables, asked twice, the second time with them swapped: A, B or a tie, whether it held both
 * ways, and each one's rubric score, the mean of the two readings.
 * @param {Brain} judge @param {{ request: string, references: string[], rubric: Item[] }} task
 * @param {{ name: string, text: string }[]} a @param {{ name: string, text: string }[]} b
 */
export async function judged(judge, task, a, b) {
  const ask = async (/** @type {typeof a} */ first, /** @type {typeof a} */ second) => {
    const text = await say(judge, JUDGE, [
      `<task>\n${task.request}\n</task>`,
      `<reference_files>${task.references.join(', ') || 'none'}</reference_files>`,
      `<rubric>\n${task.rubric.map((item, i) => `${i + 1}. [${item.score > 0 ? '+' : ''}${item.score}] ${item.criterion}`).join('\n')}\n</rubric>`,
      `<deliverable name="A">\n${shown(first)}\n</deliverable>`,
      `<deliverable name="B">\n${shown(second)}\n</deliverable>`,
      'Reply with JSON only: {"A": [the numbers of the rubric items A meets], "B": [those B meets], "better": "A" or "B" or "tie", "why": "one sentence"}',
    ].join('\n\n'), { maxTokens: 8192 })
    return { said: jsonIn(text) ?? {}, verdict: verdictOf(text) }
  }
  const [first, swapped] = [await ask(a, b), await ask(b, a)]
  const { verdict, consistent } = bothOrders(first.verdict, swapped.verdict)
  const score = (/** @type {any} */ x, /** @type {any} */ y) => [rubricScore(task.rubric, x), rubricScore(task.rubric, y)].filter((n) => !Number.isNaN(n))
  const mean = (/** @type {number[]} */ list) => (list.length ? list.reduce((s, n) => s + n, 0) / list.length : NaN)
  return { verdict, consistent, a: mean(score(first.said.A, swapped.said.B)), b: mean(score(first.said.B, swapped.said.A)), why: [first.said.why, swapped.said.why].filter(Boolean) }
}

/** A deliverable's files as the judge reads them. @param {{ name: string, text: string }[]} files */
const shown = (files) => (files.length ? files.map((file) => `<file name="${file.name}">\n${file.text.length > SHOWN ? `${file.text.slice(0, SHOWN)}\n(cut here)` : file.text}\n</file>`).join('\n') : '(nothing was delivered)')
