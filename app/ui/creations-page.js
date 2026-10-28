// The Creations page (D497, D502, D544), loaded once it shows: the project's creations, a card each, those pinned first, then
// the latest changed under Today, Yesterday, This week, Earlier this month and the months before, or by when they were made,
// or by name, found by their words, and those of one kind alone picked from Show's menu, beside Sort's, which lists every kind,
// those with none yet too (D559). Create, its menu naming each kind, and a card for each kind above them, make one, or ask for it
// in the box (D542). Each card has a menu, as a task has, which a right click opens too: Pin, Rename in place, Duplicate (a
// document, a collection) or Another like this (asked for in the box), and Delete, which takes it off at once and deletes it five
// seconds later unless Undo is pressed first; what an answer holds (a score, an app, a deck) is only taken off the page, its answer
// keeping it. Each kind does them through its `creations` slot.
import { html, nothing, svg } from 'lit-html'
import { signal } from '@preact/signals-core'
import { Element, define } from './base.js'
import { app, notify } from './state.js'
import { slots } from './caps.js'
import { all, reread, show, query as words, kind, order } from './creations.js'
import { icons, icon } from './menu-icons.js'
import { searchable } from './mentions.js'
import { virtual } from './virtual.js'
import { folding } from './inbox.js'
import { t, relativeTime, intlLocales, useStrings } from '../core/i18n.js'

await useStrings('creations')

/** @typedef {import('./creations.js').Creation & { kind: any }} Item */
/** The one whose name is being changed, and those deleted but for Undo; the kind picked, the order and the words typed are creations.js's, which the address and a tag set. */
const renaming = signal(''), gone = signal(/** @type {Set<string>} */ (new Set()))
/** The orders, which creations.js checks an address's against, Sort's glyph, an arrow up beside an arrow down, and Show's, three lines narrowing. */
export const ORDERS = /** @type {Record<string, string>} */ ({ changed: 'creations.changed', made: 'creations.made', name: 'creations.name' }), SORT = icon(svg`<path d="M8 19V5M4.5 8.5 8 5l3.5 3.5M16 5v14M12.5 15.5 16 19l3.5-3.5"/>`), SHOW = icon(svg`<path d="M4 6.5h16M7 12h10M10 17.5h4"/>`)
/** Deletions waiting for their five seconds, done at once if the page goes away first. @type {Map<string, () => void>} */
const waiting = new Map()
addEventListener('pagehide', () => { for (const now of waiting.values()) now() })

/** One changed on its card at once, then by its kind, and all read again. @param {Item} item @param {Partial<Item>} patch @param {() => Promise<unknown>} work */
const change = (item, patch, work) => { all.value = all.value.map((one) => (one === item ? { ...one, ...patch } : one)); return work().catch(console.warn).finally(reread) }

/**
 * A box in place of its name, the name selected, the keyboard in it before the menu it was picked from closes, or once its card is
 * drawn: a copy's comes with the creations read again, which another reading can overtake. @param {string} path
 */
function rename(path) { renaming.value = path; naming = true; focusName() }
let naming = false
const focusName = () => { const box = /** @type {HTMLInputElement | null} */ (document.querySelector('.creation-rename')); if (naming && box) { naming = false; box.focus(); box.select() } }
/** Enter or leaving the box renames it, Escape doesn't, and the keyboard goes back to its card. @param {KeyboardEvent | FocusEvent} event @param {Item} item */
function named(event, item) {
  const key = event instanceof KeyboardEvent ? event.key : ''
  if (renaming.peek() !== item.path || (event instanceof KeyboardEvent && (event.isComposing || !['Enter', 'Escape'].includes(key)))) return
  event.preventDefault()
  event.stopPropagation()
  const name = /** @type {HTMLInputElement} */ (event.target).value.trim().replace(/\s+/g, ' ')
  renaming.value = ''
  const back = () => key && requestAnimationFrame(() => /** @type {HTMLElement | null} */ (document.querySelector(`[data-path="${CSS.escape(item.path)}"] .creation-open`))?.focus())
  back()
  // Read again, it may have moved, and its card be another's.
  if (key !== 'Escape' && name && name !== item.name) change(item, { name }, () => item.kind.rename(item, name)).then(back)
}

/** A copy, first under Today, its name in a box for one of its own. @param {Item} item */
async function copy(item) {
  const path = await item.kind.copy(item, t('creations.copy', { name: item.name }))
  await reread()
  rename(path)
}

/** Another like it asked for in the box, the user's words to come at its end. @param {Item} item */
async function like(item) {
  await item.kind.like()
  app.draft.value = t(`creations.like.${item.kind.id}`, { name: item.name })
  await new Promise(requestAnimationFrame)
  const box = /** @type {HTMLTextAreaElement} */ (document.getElementById('prompt'))
  box.focus(); box.setSelectionRange(box.value.length, box.value.length)
}

/** Taken off at once, then deleted, or a score taken off the page, five seconds later unless Undo is pressed. @param {Item} item */
function drop(item) {
  const back = () => { gone.value = new Set([...gone.value].filter((path) => path !== item.path)) }
  const now = () => {
    clearTimeout(timer)
    waiting.delete(item.path)
    import('./preview.js').then(({ unshow }) => unshow(item.link.uri)).then(() => (item.kind.remove ?? item.kind.hide)(item)).catch(console.warn).finally(() => reread().then(back))
  }
  const timer = setTimeout(now, 5000)
  gone.value = new Set(gone.value).add(item.path)
  waiting.set(item.path, now)
  notify(t(item.kind.remove ? 'creations.deleted' : 'creations.removed', { name: item.name }), { label: t('memory.undo'), run: () => { clearTimeout(timer); waiting.delete(item.path); back() } }, 5000)
}

/**
 * Where each goes by when: Today, Yesterday, This week, Earlier this month, else its month, with its year before this one; made
 * for one drawing, each day worked out once, the formats made once, not for each of a thousand cards.
 */
function headings() {
  const now = new Date(), day = (/** @type {Date} */ date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime(), today = day(now), known = new Map()
  const here = /** @type {any} */ (new Intl.Locale(intlLocales()[0])), week = (now.getDay() - ((here.getWeekInfo?.() ?? here.weekInfo)?.firstDay ?? 1) + 7) % 7
  const months = /** @type {Intl.DateTimeFormatOptions[]} */ ([{}, { year: 'numeric' }]).map((year) => new Intl.DateTimeFormat(intlLocales(), { month: 'long', ...year }))
  /** @param {Date} at @param {number} days */
  const of = (at, days) => {
    if (Number.isNaN(days)) return ''
    if (days < 1) return t('creations.today')
    if (days < 2) return t('creations.yesterday')
    if (days <= week) return t('creations.week')
    if (at.getFullYear() === now.getFullYear() && at.getMonth() === now.getMonth()) return t('creations.month')
    const month = months[Number(at.getFullYear() !== now.getFullYear())].format(at)
    return month.charAt(0).toLocaleUpperCase(intlLocales()) + month.slice(1)
  }
  return (/** @type {string} */ when) => { const at = new Date(when), key = day(at); if (!known.has(key)) known.set(key, of(at, Math.round((today - key) / 864e5))); return /** @type {string} */ (known.get(key)) }
}

/** A card's preview, drawn once the card comes near the screen, after the page has shown: its picture read, its score drawn then. */
class Later extends Element {
  seen = signal(false)
  what = signal(/** @type {() => unknown} */ (() => nothing))
  set draw(/** @type {() => unknown} */ draw) { this.what.value = draw }
  connectedCallback() { super.connectedCallback(); near.observe(this) }
  disconnectedCallback() { near.unobserve(this); super.disconnectedCallback() }
  render() { return this.seen.value ? this.what.value() : nothing }
}
const near = new IntersectionObserver((all) => { for (const { target, isIntersecting } of all) if (isIntersecting) (near.unobserve(target), (/** @type {Later} */ (target)).seen.value = true) }, { rootMargin: '50%' })
define('app-later', Later)

/** One of a menu's rows, which closes it. @param {string} menu @param {unknown} icon @param {string} label @param {() => unknown} act */
const action = (menu, icon, label, act) => html`<button type="button" popovertarget=${menu} popovertargetaction="hide" @click=${act}>${icon}${label}</button>`
/**
 * Show or Sort: a button of its glyph alone, its tip saying what is chosen, marked once that isn't the first, and its menu, the
 * one chosen checked, each with its count if it has one. @param {string} id @param {unknown} glyph @param {string} tip
 * @param {string[][]} choices each one's value, words and count @param {string} chosen @param {(one: string) => void} choose
 */
const choice = (id, glyph, tip, choices, chosen, choose) => html`<button class="icon-button subtle ${id} ${chosen === choices[0][0] ? '' : 'is-on'}" popovertarget=${id} aria-label=${tip}>${glyph}</button>
  <div id=${id} class="menu creations-menu" role="menu" popover>${choices.map(([one, words, many]) => html`<button type="button" role="menuitemradio" aria-checked=${String(chosen === one)}
    popovertarget=${id} popovertargetaction="hide" @click=${() => choose(one)}>${icons.check}${words}${many ? html` <span class="menu-value">${many}</span>` : nothing}</button>`)}</div>`

/** Its menu on a right click too, once the button is up, which would close it otherwise. @param {MouseEvent} event */
function context(event) {
  event.preventDefault()
  const more = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (event.currentTarget).querySelector('.creation-more')), open = () => setTimeout(() => more?.click())
  if (event.buttons) addEventListener('pointerup', open, { once: true }); else open()
}

/** The card whose menu is open, and whether it is: one menu for every card, filled for the one it opens from. */
const menuOf = signal(/** @type {Item | null} */ (null)), opened = signal(false)
/** That menu: Pin, Rename, Duplicate or Another like this, and Delete. @param {Item} item */
const menu = (item) => [
  action('creation-menu', icons.pin, t(item.pinned ? 'action.unpin' : 'action.pin'), () => change(item, { pinned: !item.pinned }, () => item.kind.pin(item, !item.pinned))),
  action('creation-menu', icons.compose, t('action.rename'), () => rename(item.path)),
  item.kind.copy ? action('creation-menu', icons.copy, t('creations.duplicate'), () => copy(item)) : item.kind.like ? action('creation-menu', icons.fork, t('creations.like'), () => like(item)) : nothing,
  action('creation-menu', icons.trash, t(item.kind.remove ? 'action.delete' : 'creations.remove'), () => drop(item))]

/**
 * A card: what it holds, its name, which opens it from anywhere on the card, its menu's button, and when it changed; dragged, what a
 * document beside the task holds of it: a block (`held`, a collection's view or a picture, D573), or else a reference to it (D575).
 * Its place among its group's, which a screen reader says, as the group draws only those in view (D627). @param {Item[]} items @param {number} i
 */
function card(items, i) {
  const item = items[i], held = item.kind.held?.(item) ?? `[[${item.link.uri}|${item.name.replace(/[[\]|\n]+/g, ' ')}]]`
  return html`<li class="creation ${opened.value && menuOf.value?.path === item.path ? 'is-open' : ''}" data-path=${item.path} aria-posinset=${i + 1} aria-setsize=${items.length} @contextmenu=${context}
    draggable=${renaming.value === item.path ? nothing : 'true'} @dragstart=${(/** @type {DragEvent} */ e) => e.dataTransfer?.setData(item.kind.held ? 'text/x-creation-block' : 'text/x-creation', held)}>
    <app-later class="creation-preview" aria-hidden="true" inert .draw=${() => item.kind.preview?.(item) ?? item.kind.draw()}></app-later>
    ${renaming.value === item.path ? html`<div class="creation-naming">${item.kind.draw()}<input class="creation-rename" dir="auto" aria-label=${t('action.rename')} .value=${item.name}
      @keydown=${(/** @type {KeyboardEvent} */ e) => named(e, item)} @blur=${(/** @type {FocusEvent} */ e) => named(e, item)}></div>`
      : html`<button class="creation-open" @click=${show(item)} @dblclick=${() => rename(item.path)}>${item.kind.draw()}<span dir="auto">${item.name}</span></button>`}
    <button class="icon-button subtle creation-more" popovertarget="creation-menu" aria-label=${t('action.more')} @click=${() => { menuOf.value = item }}>${icons.more}</button>
    <span class="creation-when">${item.changed && relativeTime(item.changed)}</span>
  </li>`
}

/** Every creation here, under the bar that finds (from five), shows one kind and orders (from two) and makes them and a card to start
 * one of each kind, unfolded while there is none yet, in groups, Pinned's folded as the user left it (D651). */
class Page extends Element {
  updated() { focusName() }
  render() {
    const kinds = slots('creations'), picked = kinds.find((one) => one.id === kind.value), here = all.value.filter((item) => !gone.value.has(item.path)), count = new Intl.NumberFormat(intlLocales())
    // Those made include a kind not kept here yet: its `starts` slot, Apps' until the project holds one (D553).
    const found = searchable(words.value.trim()), collator = new Intl.Collator(intlLocales()), makers = [...kinds, ...slots('starts')].filter((one) => one.make).sort((a, b) => a.at - b.at), starts = found ? [] : makers
    const makes = picked?.make ? [picked] : makers, make = (/** @type {any} */ one) => () => one.make().then(reread)
    const when = (/** @type {Item} */ item) => (order.value === 'made' ? item.created || item.changed : item.changed)
    const list = here.filter((item) => (!picked || item.kind === picked) && (!found || searchable(`${item.name} ${item.text}`).includes(found)))
      .sort(order.value === 'name' ? (a, b) => collator.compare(a.name, b.name) : (a, b) => (when(a) < when(b) ? 1 : -1))
    /** @type {[string, Item[]][]} */
    const groups = [[t('history.pinned'), list.filter((item) => item.pinned)]], heading = headings()
    for (const item of list.filter((one) => !one.pinned)) {
      const name = order.value === 'name' ? '' : heading(when(item)), last = groups[groups.length - 1]
      if (groups.length > 1 && last[0] === name) last[1].push(item)
      else groups.push([name, [item]])
    }
    return html`<h1 class="conversation-title">${t('creations.title')}</h1>
    <div class="creations-bar">
      ${here.length > 4 || words.value ? html`<label class="creations-find">${icons.search}<input type="search" dir="auto" placeholder=${t('creations.find')} aria-label=${t('creations.find')} .value=${words.value} @input=${(/** @type {InputEvent} */ e) => { words.value = /** @type {HTMLInputElement} */ (e.target).value }}></label>` : nothing}
      ${here.length > 1 && kinds.length > 1 ? choice('creations-kinds', SHOW, t('creations.showing', { what: t(picked ? `creations.kind.${picked.id}` : 'creations.all') }), [['', t('creations.all'), count.format(here.length)],
        ...kinds.map((one) => [one.id, t(`creations.kind.${one.id}`), count.format(here.filter((item) => item.kind === one).length)])], picked?.id ?? '', (one) => { kind.value = one }) : nothing}
      ${here.length > 1 ? choice('creations-order', SORT, t('creations.sorted', { how: t(ORDERS[order.value]) }), Object.entries(ORDERS).map(([one, label]) => [one, t(label)]), order.value, (one) => { order.value = one }) : nothing}
      ${!makes.length ? nothing : makes.length === 1 ? html`<button class="button primary" title=${t(`creations.one.${makes[0].id}`)} @click=${make(makes[0])}>${icons.plus}${t('creations.create')}</button>`
      : html`<button class="button primary" popovertarget="creations-new">${icons.plus}${t('creations.create')}${icons.chevron}</button>
        <div id="creations-new" class="menu creations-menu" popover>${makes.map((one) => action('creations-new', one.draw(), t(`creations.one.${one.id}`), make(one)))}</div>`}
    </div>
    ${starts.length ? html`<ul class=${here.length ? 'creations-start' : 'creations-start is-empty'} aria-label=${t('creations.create')}>${starts.map((one) => html`<li><button class="creation-start" data-kind=${one.id} @click=${make(one)}>
      <span>${one.draw()}</span><span><b>${t(`creations.one.${one.id}`)}</b> <small>${t(`creations.start.${one.id}`)}</small></span>${icons.plus}<span class="creation-blank"></span></button></li>`)}</ul>` : nothing}
    ${found && !list.length ? html`<p class="creations-none">${t('creations.none', { words: words.value.trim() })}<button class="button" @click=${() => { words.value = ''; kind.value = '' }}>${t('creations.clear')}</button></p>` : nothing}
    ${groups.map(([name, items], at) => { const words = html`${name}<span>${count.format(items.length)}</span>`; return !items.length ? nothing : html`${name ? html`<h2 class="creations-group">${at ? words : folding('creations', words)}</h2>` : nothing}
      ${!at && app.folded.value.has('creations') ? nothing : html`<ul class="creations-cards">${virtual({ count: items.length, key: (i) => items[i].path,
      at: items.findIndex((item) => item.path === renaming.value), draw: (i) => card(items, i) })}</ul>`}` })}
    <div id="creation-menu" class="menu task-menu" popover @toggle=${(/** @type {ToggleEvent} */ e) => { opened.value = e.newState === 'open' }}>${menuOf.value ? menu(menuOf.value) : nothing}</div>`
  }
}

define('app-creations', Page)
