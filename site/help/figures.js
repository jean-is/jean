// What a help article shows beside a part or a step (D612), so the reader sees what the words say: a part of Jean
// drawn with the app's own classes and strings, over the app's style sheet the page already has (the box, the first
// step, an offer, a card that asks first), a page of Settings in Jean's words with what the step names ringed, as Show
// me rings it, a drawing of where the work stays, or another page's replay of a task, framed still with Play
// (site/demo.js, D462). Each is a Figure, which help.js puts in a <figure> under its part or step, with the article's
// caption for it; a drawing is hidden from screen readers, which read the caption, and nothing in it can be pressed.
import { demoFrame } from '../demo.js'
import { ICONS, fill, glyph, xml } from '../site.js'

/**
 * What shows a part: its drawing, as HTML, and whether it frames a replay, which the page's policy then allows.
 * @typedef {{ draw: (kit: import('../site.js').Kit, caption: string) => string, frames?: boolean }} Figure
 */

/** One of the app's strings, with the brand's name and any other params. @param {import('../site.js').Kit} kit @param {string} key @param {Record<string, string>} [params] */
const app = (kit, key, params = {}) => {
  const text = kit.appText(key)
  if (!text) throw new Error(`site/${kit.name}: its figure names ${key}, which isn't one of the app's strings`)
  return xml(fill(text, { name: kit.brand.name, ...params }))
}

/** The box's own drawing (ui/composer.js): its words, + to add, the microphone, the brain, send. @param {import('../site.js').Kit} kit */
const composer = (kit) => /* html */ `<div class="composer"><p class="help-box-words">${app(kit, 'composer.placeholder')}</p>
      <div class="composer-row"><div class="composer-tools"><span class="icon-button">${ICONS.plus}</span><span class="icon-button">${ICONS.mic}</span></div>
      <span class="brain-chip">${ICONS.brain}<span>${app(kit, 'auto.name')}</span>${ICONS.down}</span><span class="send">${ICONS.send}</span></div>
    </div>`

/** Jean's box as a new task shows it, with the line under it. */
export const box = {
  draw: (kit) => /* html */ `<div class="help-drawn help-box" aria-hidden="true">
    ${composer(kit)}
    <p class="help-box-note">${app(kit, 'composer.ai')}</p>
  </div>`,
}

/** An offer in one sentence above the box (ui/composer.js's offerAside): what it does, its own yes, and No thanks. @param {string} id */
export const offered = (id) => ({
  draw: (/** @type {import('../site.js').Kit} */ kit) => /* html */ `<div class="help-drawn help-box" aria-hidden="true">
    <div class="offer"><p>${app(kit, `cap.${id}.offer`)}</p><div class="row"><span class="button primary help-ring">${app(kit, `cap.${id}.yes`)}</span><span class="button subtle">${app(kit, 'offer.no')}</span></div></div>
    ${composer(kit)}
  </div>`,
})

/**
 * A card that asks first, as the task shows it (ui/chat.js's approval()): the action, in the article's words (`key`),
 * then Allow once, Always allow, Not now and Never. @param {string} key
 */
export const asking = (key) => ({
  draw: (/** @type {import('../site.js').Kit} */ kit) => /* html */ `<div class="help-drawn help-offer" aria-hidden="true">
    <div class="approval"><p>${app(kit, 'approval.question', { action: kit.text(key) })}</p>
      <div class="approval-actions"><span class="button primary">${app(kit, 'approval.allowOnce')}</span><span class="button">${app(kit, 'approval.allowAlways')}</span><span class="button">${app(kit, 'approval.rejectOnce')}</span><span class="button subtle">${app(kit, 'approval.rejectAlways')}</span></div>
    </div>
  </div>`,
})

/**
 * A row of a page of Settings: its glyph, its title and what it says, as the app's strings, with any params; a
 * state at its end; dashed while still to find (Capabilities); ringed where the step names it.
 * @typedef {{ icon: string, title: string, text?: string | string[], params?: Record<string, string>, state?: string, todo?: boolean, ring?: boolean }} Row
 *
 * A page of Settings, as Jean draws one (ui/dialogs.js and its pages): the way back to the page it is in, its
 * title and its button, ringed where the
 * step names it, its lede (the first sentence plain, the rest in bold), then its sections, each its head, how many
 * of its capabilities are found where it counts them, its rows, and a button, ringed (Choose a backup…).
 * @typedef {{ back?: string, title?: string, button?: { label: string, icon: string, ring?: boolean }, lede?: string[], sections: Array<{ head?: string, count?: [number, number], rows?: Row[], pick?: { label: string, icon: string } }> }} Panel
 */

/** A page of Settings, drawn. @param {Panel} panel */
export const settings = ({ back, title, button, lede = [], sections }) => ({
  draw: (/** @type {import('../site.js').Kit} */ kit) => {
    const icon = (/** @type {string} */ name) => glyph(/** @type {any} */ (name))
    const number = new Intl.NumberFormat(kit.lang)
    // Its words, or several names listed as ui/brain-pages.js lists them (Ollama, LM Studio).
    const said = (/** @type {string | string[]} */ text, /** @type {Record<string, string> | undefined} */ params) => (Array.isArray(text) ? xml(new Intl.ListFormat(kit.lang, { type: 'conjunction', style: 'narrow' }).format(text.map((key) => kit.appText(key)))) : app(kit, text, params))
    const row = (/** @type {Row} */ { icon: shown, title: named, text, params, state, todo, ring }) => /* html */ `<li${todo ? ' class="is-todo"' : ''}><span class="item${ring ? ' help-ring' : ''}"><span class="item-icon">${icon(shown)}</span><span class="item-text"><strong>${app(kit, named)}</strong>${text ? /* html */ `<small>${said(text, params)}</small>` : ''}</span>${state ? /* html */ `<span class="data-state is-wait">${app(kit, state)}</span>` : ''}${ICONS.down}</span></li>`
    const [plain, ...bold] = lede
    return /* html */ `<div class="help-drawn help-settings" aria-hidden="true">${back ? /* html */ `
    <span class="button subtle help-back">${glyph('back')}${app(kit, back)}</span>` : ''}${title || button ? /* html */ `
    <div class="help-settings-head">${title ? /* html */ `<p>${app(kit, title)}</p>` : ''}${button ? /* html */ `<span class="button${button.ring ? ' help-ring' : ''}">${icon(button.icon)}${app(kit, button.label)}</span>` : ''}</div>` : ''}${plain ? /* html */ `
    <p class="help-settings-lede">${app(kit, plain)}${bold.map((key) => /* html */ ` <strong>${app(kit, key)}</strong>`).join('')}</p>` : ''}${sections.map(({ head, count, rows = [], pick }) => /* html */ `
    <div class="help-settings-part">${head ? /* html */ `<p class="help-settings-group">${app(kit, head)}${count ? /* html */ `<span>${app(kit, 'case.of', { count: number.format(count[0]), total: number.format(count[1]) })}</span>` : ''}</p>` : ''}${rows.length ? /* html */ `<ul class="help-rows${rows.some((one) => one.todo) ? ' help-case' : ''}">${rows.map(row).join('')}</ul>` : ''}${pick ? /* html */ `<span class="button help-ring">${icon(pick.icon)}${app(kit, pick.label)}</span>` : ''}</div>`).join('')}
  </div>`
  },
})

/** Settings › Approvals' three rules (ui/approval-pages.js): each its name, what Jean then does, and its kinds, the rule `ring` names ringed. @param {'allow' | 'ask' | 'never'} [ring] */
export const rules = (ring) => ({
  draw: (/** @type {import('../site.js').Kit} */ kit) => {
    const KINDS = { allow: ['read', 'edit', 'search', 'execute'], ask: ['fetch', 'move', 'delete', 'other'], never: [] }
    return /* html */ `<div class="help-drawn help-settings" aria-hidden="true">
    <div class="help-settings-head"><p>${app(kit, 'settings.approvals')}</p></div>
    <ul class="help-rows help-rules">${Object.entries(KINDS).map(([rule, kinds]) => /* html */ `<li${rule === ring ? ' class="help-ring"' : ''}><p><b>${app(kit, `rules.${rule}`)}</b><small>${app(kit, `approvals.${rule}Text`)}</small></p>
      <span class="help-kinds">${kinds.map((kind) => /* html */ `<span>${app(kit, `kind.${kind}.label`)}</span>`).join('')}${kinds.length ? '' : /* html */ `<span class="is-fixed">${ICONS.lock}${app(kit, 'approvals.reserved')}</span>`}</span></li>`).join('')}</ul>
  </div>`
  },
})

/** The first step, before a first answer (caps/first/first.js): the free way, then a plan or a key one already has. */
export const first = {
  draw: (kit) => {
    const door = (/** @type {string} */ to) => /* html */ `<li><span class="help-door"><span><b>${app(kit, `first.${to}`)}</b><small>${app(kit, `first.${to}Text`)}</small></span>${ICONS.arrow}</span></li>`
    return /* html */ `<div class="help-drawn help-sheet" aria-hidden="true">
    <p class="help-sheet-title">${app(kit, 'first.title')}</p>
    <p class="help-sheet-lede">${app(kit, 'first.text')}</p>
    <span class="button primary">${app(kit, 'first.free')}${ICONS.external}</span>
    <p class="help-sheet-hint">${app(kit, 'first.freeText')}</p>
    <ul class="help-doors">${door('plans')}${door('choose')}</ul>
  </div>`
  },
}

/** An offer, as the brain makes it in its answer (ui/chat.js's offerCard): the capability's name, what it does, and the two answers. @param {string} id */
export const offer = (id) => ({
  draw: (/** @type {import('../site.js').Kit} */ kit) => /* html */ `<div class="help-drawn help-offer" aria-hidden="true">
    <div class="approval"><p><strong>${app(kit, `cap.${id}.name`)}</strong></p><p>${app(kit, `cap.${id}.offer`)}</p>
      <div class="approval-actions"><span class="button primary">${app(kit, 'offer.yes')}</span><span class="button subtle">${app(kit, 'offer.no')}</span></div>
    </div>
  </div>`,
})

/**
 * Where the work stays: this device, holding the tasks and files sealed, and maybe a brain of its own that sends
 * nothing; a brain in the cloud, which a request reaches and an answer comes back from; and no server of Jean's.
 * Its words are Help's (kept.*).
 */
export const kept = {
  draw: (kit) => /* html */ `<div class="help-kept" aria-hidden="true">
    <div class="help-kept-here"><p class="help-kept-head">${ICONS.computer}${kit.say('kept.device')}</p>
      <p>${ICONS.lock}<span>${kit.say('kept.work')}</span></p>
      <p>${ICONS.brain}<span>${kit.say('kept.local')}</span></p>
    </div>
    <div class="help-kept-way"><span>${kit.say('kept.request')}<i class="flip-rtl">→</i></span><span><i class="flip-rtl">←</i>${kit.say('kept.answer')}</span></div>
    <div class="help-kept-there"><p class="help-kept-head">${ICONS.brain}${kit.say('kept.cloud')}</p><p>${kit.say('kept.reads')}</p></div>
    <p class="help-kept-none">${ICONS.never}<span>${kit.say('kept.none')}</span></p>
  </div>`,
}

/**
 * Another page's replay of its task, framed still with Play, its words the caption; that page must be built in this
 * language. @param {string} page
 */
export const replay = (page) => ({
  frames: true,
  draw: (/** @type {import('../site.js').Kit} */ kit, /** @type {string} */ caption) => {
    if (!kit.link(page)) throw new Error(`site/${kit.name}: its figure replays ${page}'s task, which isn't built in ${kit.lang}`)
    return /* html */ `<div class="help-demo">${demoFrame(kit, false, { page, title: caption, play: kit.from(page).text('pane.play') })}</div>`
  },
})
