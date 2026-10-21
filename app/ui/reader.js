// A task saved as a web page (D305), drawn as Jean draws it: the page's own conversation, each request
// and each answer, its Markdown with its layouts, formulas, charts, scores, slides, diagrams, maps and
// pages, the pictures it made, and its files, each opened as Jean's preview shows it (ui/view.js), in
// the language and the look it was saved in, light or dark as the system is. It comes from
// the render package, @jean-is/render, with ui/reader-state.js in ui/state.js's place; until
// it has drawn, or where it can't come, the page's own lines show the words as they were written.
import { html, nothing, render } from 'lit-html'
import { effect } from '@preact/signals-core'
import { app, theme, effective } from './reader-state.js'
import { markdown, withFormulas, declared } from './markdown.js'
import { styleSheet } from './sheet.js'
import { icons } from './icons.js'
import { pageRights, pagePolicy, pageAllow } from './csp.js'
import { foldTurns, splitSuggestions, filesMade } from '../core/events.js'
import { locale } from '../core/i18n.js'
import '../caps/layouts/layouts.js'
import '../caps/math/math.js'
import '../caps/charts/charts.js'
import '../caps/scores/scores.js'
import '../caps/slides/slides.js'
import '../caps/interactive/interactive.js'

const root = document.documentElement
const saved = JSON.parse(document.getElementById('settings')?.textContent || '{}')
/** The files the task made and was given, by their addresses in its project, as `data:` addresses (ui/export.js). @type {Record<string, string>} */
const held = JSON.parse(document.getElementById('files')?.textContent || '{}')
const [header, ...records] = (document.querySelector('script[type="application/jsonl"]')?.textContent ?? '').split('\n').flatMap((line) => {
  try {
    return [JSON.parse(line)]
  } catch {
    return []
  }
})
app.current.value = { id: String(header?.id ?? ''), path: '', records }
// The kinds of block the room drew when it was saved, those its skills declared (D196); pages, diagrams and maps always.
declared.value = new Set([...declared.peek(), ...(saved.kinds ?? [])])
effect(() => { root.dataset.theme = theme.value })
const look = app.look.peek()
if (look !== 'room' && /^[a-z]+$/.test(look)) root.dataset.look = look
await Promise.all([styleSheet(new URL('style.css', import.meta.url)), styleSheet(new URL('view.css', import.meta.url)), ...(root.dataset.look ? [styleSheet(new URL(`looks/${look}.css`, import.meta.url))] : [])])

/**
 * Files shared or made, once each: one the page holds opens under its name, drawn the first time as Jean's preview draws it, doing
 * what the page was saved to let pages do; the others are their names alone. @typedef {{ uri: string, name: string, mimeType?: string }} Held @param {Held[]} list
 */
const files = (list) => (list.length ? html`<ul class="msg-files">${[...new Map(list.map((file) => [file.uri || file.name, file])).values()].map((file) => html`<li>${held[file.uri]
  ? html`<details class="file-open" @toggle=${(/** @type {Event} */ event) => opened(/** @type {HTMLDetailsElement} */ (event.currentTarget), file)}><summary class="file-chip">${icons.file}<span dir="auto">${file.name}</span></summary><div class="view"></div></details>`
  : html`<span class="file-chip">${icons.file}<span dir="auto">${file.name}</span></span>`}</li>`)}</ul>` : nothing)
const opened = async (/** @type {HTMLDetailsElement} */ box, /** @type {Held} */ { uri, name, mimeType }) => {
  if (!box.open || box.dataset.drawn) return
  box.dataset.drawn = 'yes'
  const { allows, sites } = pageRights(effective.peek().settings, app.policy), data = held[uri]
  render(await (await import('./view.js')).viewOf({ name, bytes: Uint8Array.from(atob(data.slice(data.indexOf(',') + 1)), (char) => char.charCodeAt(0)), type: mimeType }, [],
    { allows, sites, policy: pagePolicy(allows, sites), allow: pageAllow(allows) }), /** @type {HTMLElement} */ (box.lastElementChild))
}

const main = document.body.appendChild(document.createElement('main'))
effect(() => {
  const when = new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short' })
  const time = (/** @type {string} */ at) => html`<time class="msg-time" datetime=${at}>${when.format(new Date(at))}</time>`
  render(html`<ol class="turns">${foldTurns(app.current.value?.records ?? []).map((turn) => {
    const { text } = splitSuggestions(turn.steps.map((step) => step.text).filter(Boolean).join('\n\n'))
    // A picture made shows in the answer, saying what it shows, as its description did; the other files open under it.
    const made = turn.steps.flatMap((step) => step.tools).flatMap((tool) => filesMade([tool]).map((file) => ({ ...file, alt: String(tool.rawInput?.description ?? file.name) })))
    const shown = [...new Map(made.filter((file) => held[file.uri] && file.mimeType.startsWith('image/')).map((file) => [file.uri, file])).values()]
    return html`<li class="turn">
      ${files(turn.user?.files ?? [])}
      ${turn.user?.text ? html`<p class="msg msg-user" dir="auto">${withFormulas(turn.user.text)}</p>` : nothing}
      ${turn.user ? html`<div class="msg-actions is-request">${time(turn.user.at)}</div>` : nothing}
      ${text || made.length ? html`<article class="msg msg-jean">
        ${text ? html`<div class="prose" dir="auto">${markdown(text)}</div>` : nothing}
        ${shown.map((file) => html`<img class="made" src=${held[file.uri]} alt=${file.alt}>`)}
        ${files(made.filter((file) => !shown.some((one) => one.uri === file.uri)))}
        <div class="msg-actions">${time(turn.end ?? turn.at)}</div>
      </article>` : nothing}
    </li>`
  })}</ol>`, main)
})
// The page's own lines step aside once the task is drawn, and its name takes the room's type.
for (const line of document.querySelectorAll('body > section')) line.remove()
document.querySelector('h1')?.classList.add('conversation-title')
