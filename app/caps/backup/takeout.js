// Gemini's part of what Restore brings in (D340, imports.js): Google Takeout's export, or
// MyActivity.json alone. My Activity's Gemini Apps, in JSON (Takeout's other format, web pages,
// isn't read), has an activity per request: the request in `title` behind a word such as
// "Prompted", the answer as HTML (`safeHtmlItem`), its time, the conversation's gemini.google.com/app/
// link when it has one (else requests less than half an hour apart are one conversation), and the
// files shared with it, beside the JSON (`imageFile`, `attachedFiles`). Gems (Gemini/gemini_gems_data.html,
// its labels read by their place, since their words are the account's language) become projects
// with their instructions, and Drive's files the project's.
import { decodeEntities } from '../files/extract.js'

/** @import { Entry, Found, Shared } from './imports.js' */
/** @typedef {{ time: string, request: string, answer: string, files: string[], dir: string, link: string }} Activity */

const decoder = new TextDecoder()
const PROMPTED = /^(Prompted|Asked|Said|Submitted query|送信したメッセージ[:：]|已提示[:：]?|Has dicho:|Preguntado:?)\s*/
const LINK = /https?:\/\/(?:gemini|bard)\.google\.com\/(?:u\/\d+\/)?(?:app|chat)\/(?:c\/)?([\w-]{6,64})/
/** Gemini's folders, whatever the language ("Gemini Apps", "Applications Gemini"), or a file on its own. @param {string} path */
const ofGemini = (path) => /(Gemini|Bard)[^/]*\/[^/]+$/i.test(path) || !path.includes('/')

/**
 * An answer's HTML in Markdown, as Jean's answers are: paragraphs, headings, lists, emphasis, code,
 * links, quotes and tables; any other tag keeps its text. A scanner reads it, never a DOM.
 * @param {string} html
 */
export function markdownOf(html) {
  let out = ''
  let link = ''
  let code = false
  let quote = 0
  /** The lists it is in: null for bullets, else the last number. @type {(number | null)[]} */
  const lists = []
  const row = { cells: 0, head: false }
  const source = html.replace(/<!--[\s\S]*?-->/g, '').replace(/&nbsp;/gi, '&#160;')
  for (const match of source.matchAll(/([^<]+)|<(\/?)([a-z][a-z\d]*)\b([^>]*)>|</gi)) {
    const [, text, close, name = '', attrs] = match
    if (text !== undefined || name === '') {
      const words = decodeEntities(code ? text ?? '<' : (text ?? '<').replace(/\s+/g, ' '))
      out += !code && /(^|\n)$/.test(out) ? words.trimStart() : words
      continue
    }
    const tag = name.toLowerCase()
    const at = (/** @type {string[]} */ ...tags) => tags.includes(tag)
    if (at('p', 'div', 'table')) out += '\n\n'
    else if (at('br')) out += '\n'
    else if (at('hr')) out += '\n\n---\n\n'
    else if (/^h[1-6]$/.test(tag)) out += close ? '\n\n' : `\n\n${'#'.repeat(Number(tag[1]))} `
    else if (at('strong', 'b')) out += '**'
    else if (at('em', 'i')) out += '*'
    else if (at('pre')) {
      code = !close
      out += close ? `${out.endsWith('\n') ? '' : '\n'}\`\`\`\n\n` : `\n\n\`\`\`${/^<pre[^>]*>\s*<code[^>]*language-([\w+-]+)/i.exec(source.slice(match.index))?.[1] ?? ''}\n`
    } else if (at('code') && !code) out += '`'
    else if (at('ul', 'ol') && !close) lists.push(tag === 'ol' ? Number(/start="?(\d+)/.exec(attrs)?.[1] ?? 1) - 1 : null)
    else if (at('ul', 'ol')) out += lists.pop() !== undefined && !lists.length ? '\n\n' : ''
    else if (at('li') && !close) {
      const number = lists.at(-1)
      if (typeof number === 'number') lists[lists.length - 1] = number + 1
      out += `\n${'   '.repeat(Math.max(0, lists.length - 1))}${typeof number === 'number' ? `${number + 1}.` : '-'} `
    } else if (at('a') && !close) {
      link = decodeEntities(/href="([^"]*)"/i.exec(attrs)?.[1] ?? '')
      if (/^(https?:|mailto:)/i.test(link)) out += '['
      else link = ''
    } else if (at('a') && link) {
      out += `](${link})`
      link = ''
    } else if (at('blockquote') && !close) {
      out += '\n\n'
      quote = out.length
    } else if (at('blockquote')) out = `${out.slice(0, quote)}${out.slice(quote).trim().replace(/\n{3,}/g, '\n\n').replace(/^/gm, '> ')}\n\n`
    else if (at('tr') && !close) {
      out += '\n'
      Object.assign(row, { cells: 0, head: false })
    } else if (at('th', 'td') && !close) {
      out = `${out.replace(/ +$/, '')}${row.cells++ ? ' | ' : '| '}`
      row.head ||= tag === 'th'
    } else if (at('tr')) out = `${out.replace(/ +$/, '')} |${row.head ? `\n${'| --- '.repeat(row.cells)}|` : ''}`
    else if (at('img')) out += decodeEntities(/alt="([^"]*)"/i.exec(attrs)?.[1] ?? '')
  }
  return out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

/** Gems: a name, then instructions, by the place of their labels. @param {string} html */
export function gemsOf(html) {
  return html.replace(/^\s*<div>|<\/div>\s*$/g, '').split(/<br><br>(?=<b>)/).flatMap((chunk) => {
    const [name = '', instructions = ''] = chunk.split(/<b>[^<]*<\/b>/).slice(1)
      .map((part) => decodeEntities(part.replace(/(<br>)+$/, '').replace(/<br>/g, '\n').replace(/<[^>]*>/g, '')).trim())
    return name || instructions ? [{ name, instructions }] : []
  })
}

/**
 * Gemini's requests in a My Activity JSON, oldest first; anything else gives none. What isn't a
 * request (feedback given, a draft chosen) has neither its word nor an answer.
 * @param {string} text @param {string} dir where the files it names are @returns {Activity[]}
 */
export function activitiesOf(text, dir) {
  let list
  try {
    list = JSON.parse(text)
  } catch {
    return []
  }
  return (Array.isArray(list) ? list : []).flatMap((item) => {
    if (!item || ![item.header, ...(Array.isArray(item.products) ? item.products : [])].some((name) => /Gemini|Bard/.test(String(name)))) return []
    const title = String(item.title ?? '')
    const answer = (Array.isArray(item.safeHtmlItem) ? item.safeHtmlItem : []).map((/** @type {any} */ part) => markdownOf(String(part?.html ?? ''))).filter(Boolean).join('\n\n')
    const time = Date.parse(item.time)
    if ((!PROMPTED.test(title) && !answer) || Number.isNaN(time)) return []
    const files = [item.imageFile, ...(Array.isArray(item.attachedFiles) ? item.attachedFiles : [])].filter((name) => typeof name === 'string' && name)
    // Its conversation, anywhere but in what was asked and answered.
    const link = LINK.exec(JSON.stringify({ ...item, title: '', safeHtmlItem: [] }))?.[1] ?? ''
    return [{ time: new Date(time).toISOString(), request: title.replace(PROMPTED, '').trim(), answer, files, dir, link }]
  }).sort((a, b) => Date.parse(a.time) - Date.parse(b.time))
}

/** Requests as conversations: by their link, else those less than half an hour apart. @param {Activity[]} activities oldest first */
export function conversationsOf(activities) {
  /** @type {Map<string, Activity[]>} */
  const groups = new Map()
  let last = { key: '', time: 0 }
  for (const activity of activities) {
    const time = Date.parse(activity.time)
    const key = activity.link || (time - last.time < 30 * 60 * 1000 ? last.key : `at ${activity.time}`)
    if (!activity.link) last = { key, time }
    groups.set(key, [...(groups.get(key) ?? []), activity])
  }
  return [...groups]
}

/**
 * What an export holds of Gemini's: its requests as conversations, its Gems and Drive's files. Null
 * when it holds nothing of Gemini's, 'html' when its activity is there as web pages only.
 * @param {Entry[]} entries @returns {Promise<Found | 'html' | null>}
 */
export async function geminiOf(entries) {
  const read = async (/** @type {Entry} */ entry) => decoder.decode(await entry.read())
  /** @type {Activity[]} */
  const activities = []
  /** @type {{ name: string, instructions: string }[]} */
  const gems = []
  let html = false
  for (const entry of entries) {
    const dir = entry.path.slice(0, entry.path.lastIndexOf('/') + 1)
    if (/(^|\/)gemini_gems_data\.html$/i.test(entry.path)) gems.push(...gemsOf(await read(entry)))
    else if (ofGemini(entry.path) && /\.json$/i.test(entry.path)) activities.push(...activitiesOf(await read(entry), dir))
    else if (ofGemini(entry.path) && /\.html$/i.test(entry.path) && !/scheduled_actions/.test(entry.path)) html = true
  }
  if (!activities.length && !gems.length) return html ? 'html' : null
  const byPath = new Map(entries.map((entry) => [entry.path, entry]))
  /** A file of the export, if it is there. @param {string} path @returns {Shared[]} */
  const file = (path) => [byPath.get(path)].flatMap((entry) => (entry ? [{ name: path.slice(path.lastIndexOf('/') + 1), read: entry.read }] : []))
  return {
    chats: conversationsOf(activities.sort((a, b) => Date.parse(a.time) - Date.parse(b.time))).map(([key, list]) => ({ key: `gemini ${key}`, title: '', turns: list.map((activity) => ({ ...activity, files: activity.files.flatMap((name) => file(activity.dir + name)) })) })),
    rooms: gems.map((gem) => ({ ...gem, files: [] })),
    files: entries.flatMap((entry) => (/(^|\/)Drive\//.test(entry.path) ? file(entry.path) : [])),
  }
}
