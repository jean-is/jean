// A Word document changed in place (D141): one passage, within one paragraph, takes the new text in
// the runs it spanned, in the first one's formatting. The rest of the document stays as it was: the
// other runs, paragraphs and parts, unchanged once unzipped.
import { readZip, writeZip } from '../../core/zip.js'
import { decodeEntities as decode } from '../files/extract.js'

const PARAGRAPH = /<w:p[\s>][\s\S]*?<\/w:p>/g
const TEXT = /<w:t(\s[^>]*)?>([^<]*)<\/w:t>/g
const ESCAPES = /** @type {Record<string, string>} */ ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })

/** The texts of a paragraph's runs, where each is in its XML. @param {string} source */
function runs(source) {
  return [...source.matchAll(TEXT)].map((match) => ({ at: /** @type {number} */ (match.index), length: match[0].length, attrs: match[1] ?? '', text: decode(match[2]) }))
}

/**
 * The document with one passage of its text replaced: quoted exactly, found once, within a paragraph.
 * @param {Uint8Array} bytes the .docx @param {string} old @param {string} replacement @param {string} name
 * @param {(text: string, old: string, replacement: string, name: string) => string} replaceOnce
 *   says whether the passage is there once, and how to quote it better when it isn't
 * @returns {Promise<Uint8Array>}
 */
export async function replaceInWord(bytes, old, replacement, name, replaceOnce) {
  if (/[\r\n]/.test(old + replacement)) throw new Error(`In ${name}, change one paragraph at a time: no line breaks in the passage or the new text.`)
  const entries = readZip(bytes)
  const main = entries.find((entry) => entry.name === 'word/document.xml')
  if (!main) throw new Error(`${name} isn't a Word document.`)
  const xml = new TextDecoder().decode(await main.read())
  const paragraphs = [...xml.matchAll(PARAGRAPH)].map((match) => {
    const found = runs(match[0])
    return { at: /** @type {number} */ (match.index), source: match[0], runs: found, text: found.map((run) => run.text).join('') }
  })
  // The passage has no line break, so it can't run over two paragraphs here.
  replaceOnce(paragraphs.map((paragraph) => paragraph.text).join('\n'), old, replacement, name)
  const paragraph = /** @type {(typeof paragraphs)[number]} */ (paragraphs.find((candidate) => candidate.text.includes(old)))
  const start = paragraph.text.indexOf(old)
  const end = start + old.length
  let offset = 0
  let first = true
  let source = paragraph.source
  const changed = paragraph.runs.map((run) => {
    const from = offset
    offset += run.text.length
    if (offset <= start || from >= end) return run.text
    const kept = run.text.slice(0, Math.max(0, start - from)) + (first ? replacement : '') + run.text.slice(Math.max(0, end - from))
    first = false
    return kept
  })
  // From the last run back, so the places of the others hold.
  for (let i = paragraph.runs.length - 1; i >= 0; i--) {
    const run = paragraph.runs[i]
    if (changed[i] === run.text) continue
    const attrs = /^\s|\s$/.test(changed[i]) && !/xml:space=/.test(run.attrs) ? `${run.attrs} xml:space="preserve"` : run.attrs
    source = `${source.slice(0, run.at)}<w:t${attrs}>${changed[i].replace(/[&<>]/g, (char) => ESCAPES[char])}</w:t>${source.slice(run.at + run.length)}`
  }
  const document = new TextEncoder().encode(xml.slice(0, paragraph.at) + source + xml.slice(paragraph.at + paragraph.source.length))
  return writeZip(await Promise.all(entries.map(async (entry) => ({ name: entry.name, bytes: entry === main ? document : await entry.read() }))))
}
