// The Creations page (D497, D502, D544), loaded once it shows: the project's creations, a card each, those pinned first, then
// the latest changed under Today, Yesterday, This week, Earlier this month and the months before, or by when they were made,
// or by name, found by their words and their kind. New, and a card for each kind above them, make one, or ask for it in the box (D542). Each card has a
// menu, as a task has, which a right click opens too: Pin, Rename in place, Duplicate (a document, a collection) or Another
// like this (asked for in the box), and Delete, which takes it off at once and deletes it five seconds later unless Undo is
// pressed first; a score is only taken off the page, its answer keeping it. Each kind does them through its `creations` slot.
import { html, nothing, svg } from 'lit-html'
import { signal } from '@preact/signals-core'
import { Element, define } from './base.js'
import { app, notify } from './state.js'
import { slots } from './caps.js'
import { all, reread, show } from './creations.js'
import { icons, icon } from './menu-icons.js'
import { searchable } from './mentions.js'
import { styleSheet } from './sheet.js'
import { t, relativeTime, intlLocales, useStrings } from '../core/i18n.js'

// The kinds are a segmented choice, as Settings' are.
await Promise.all([useStrings('creations'), styleSheet(new URL('dialogs.css', import.meta.url))])

/** @typedef {import('./creations.js').Creation & { kind: any }} Item */
/** The kind picked, the words typed, the order, the one whose name is being changed, and those deleted but for Undo. */
const kind = signal(''), words = signal(''), order = signal('changed'), renaming = signal(''), gone = signal(/** @type {Set<string>} */ (new Set()))
/** The orders, and Sort's glyph, an arrow up beside an arrow down. */
const ORDERS = /** @type {Record<string, string>} */ ({ changed: 'creations.changed', made: 'creations.made', name: 'creations.name' }), SORT = icon(svg`<path d="M8 19V5M4.5 8.5 8 5l3.5 3.5M16 5v14M12.5 15.5 16 19l3.5-3.5"/>`)
/** Deletions waiting for their five seconds, done at once if the page goes away first. @type {Map<string, () => void>} */
const waiting = new Map()
addEventListener('pagehide', () => { for (const now of waiting.values()) now() })

/** One changed on its card at once, then by its kind, and all read again. @param {Item} item @param {Partial<Item>} patch @param {() => Promise<unknown>} work */
const change = (item, patch, work) => { all.value = all.value.map((one) => (one === item ? { ...one, ...patch } : one)); return work().catch(console.warn).finally(reread) }

/** A box in place of its name, the name selected, the keyboard in it before the menu it was picked from closes. @param {string} path */
function rename(path) {
  renaming.value = path
  const box = /** @type {HTMLInputElement | null} */ (document.querySelector('.creation-rename'))
  box?.focus(); box?.select()
}
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

/** Where one goes by when: Today, Yesterday, This week, Earlier this month, else its month, with its year before this one. @param {string} when */
function heading(when) {
  const at = new Date(when), now = new Date(), day = (/** @type {Date} */ date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  if (Number.isNaN(at.getTime())) return ''
  const days = Math.round((day(now) - day(at)) / 864e5), here = /** @type {any} */ (new Intl.Locale(intlLocales()[0]))
  if (days < 1) return t('creations.today')
  if (days < 2) return t('creations.yesterday')
  if (days <= (now.getDay() - ((here.getWeekInfo?.() ?? here.weekInfo)?.firstDay ?? 1) + 7) % 7) return t('creations.week')
  if (at.getFullYear() === now.getFullYear() && at.getMonth() === now.getMonth()) return t('creations.month')
  const month = new Intl.DateTimeFormat(intlLocales(), { month: 'long', ...(at.getFullYear() !== now.getFullYear() && { year: 'numeric' }) }).format(at)
  return month.charAt(0).toLocaleUpperCase(intlLocales()) + month.slice(1)
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

/** A card: what it holds, its name, which opens it from anywhere on the card, its menu's button, and when it changed. @param {Item} item */
function card(item) {
  return html`<li class="creation ${opened.value && menuOf.value?.path === item.path ? 'is-open' : ''}" data-path=${item.path} @contextmenu=${context}>
    <app-later class="creation-preview" aria-hidden="true" inert .draw=${() => item.kind.preview?.(item) ?? item.kind.draw()}></app-later>
    ${renaming.value === item.path ? html`<div class="creation-naming">${item.kind.draw()}<input class="creation-rename" dir="auto" aria-label=${t('action.rename')} .value=${item.name}
      @keydown=${(/** @type {KeyboardEvent} */ e) => named(e, item)} @blur=${(/** @type {FocusEvent} */ e) => named(e, item)}></div>`
      : html`<button class="creation-open" @click=${show(item)} @dblclick=${() => rename(item.path)}>${item.kind.draw()}<span dir="auto">${item.name}</span></button>`}
    <button class="icon-button subtle creation-more" popovertarget="creation-menu" aria-label=${t('action.more')} @click=${() => { menuOf.value = item }}>${icons.more}</button>
    <span class="creation-when">${item.changed && relativeTime(item.changed)}</span>
  </li>`
}

/** Every creation here, under the bar that finds (from five), orders (from two) and makes them and a card to start one of each kind,
 * unfolded while there is none yet, in groups. */
class Page extends Element {
  render() {
    const kinds = slots('creations'), here = all.value.filter((item) => !gone.value.has(item.path)), count = new Intl.NumberFormat(intlLocales())
    const present = kinds.filter((one) => here.some((item) => item.kind === one)), picked = present.find((one) => one.id === kind.value)
    const found = searchable(words.value.trim()), collator = new Intl.Collator(intlLocales()), starts = found ? [] : kinds.filter((one) => one.make)
    const makes = (picked?.make ? [picked] : kinds).filter((one) => one.make), make = (/** @type {any} */ one) => () => one.make.run().then(reread)
    const when = (/** @type {Item} */ item) => (order.value === 'made' ? item.created || item.changed : item.changed)
    const list = here.filter((item) => (!picked || item.kind === picked) && (!found || searchable(`${item.name} ${item.text}`).includes(found)))
      .sort(order.value === 'name' ? (a, b) => collator.compare(a.name, b.name) : (a, b) => (when(a) < when(b) ? 1 : -1))
    /** @type {[string, Item[]][]} */
    const groups = [[t('history.pinned'), list.filter((item) => item.pinned)]]
    for (const item of list.filter((one) => !one.pinned)) {
      const name = order.value === 'name' ? '' : heading(when(item)), last = groups[groups.length - 1]
      if (groups.length > 1 && last[0] === name) last[1].push(item)
      else groups.push([name, [item]])
    }
    return html`<h1 class="conversation-title">${t('creations.title')}</h1>
    <div class="creations-bar">
      ${here.length > 4 || words.value ? html`<label class="creations-find">${icons.search}<input type="search" dir="auto" placeholder=${t('creations.find')} aria-label=${t('creations.find')} .value=${words.value} @input=${(/** @type {InputEvent} */ e) => { words.value = /** @type {HTMLInputElement} */ (e.target).value }}></label>` : nothing}
      ${present.length > 1 ? html`<span class="segmented creations-kinds" role="radiogroup" aria-label=${t('creations.kinds')}>${[null, ...present].map((one) => html`<label><input type="radio" name="creations-kind"
        .checked=${one === (picked ?? null)} @change=${() => { kind.value = one?.id ?? '' }}><span>${t(one ? `creations.kind.${one.id}` : 'creations.all')} <small>${count.format(one ? here.filter((item) => item.kind === one).length : here.length)}</small></span></label>`)}</span>` : nothing}
      ${here.length > 1 ? html`<button class="icon-button subtle creations-order" popovertarget="creations-order" aria-label=${t('creations.sorted', { how: t(ORDERS[order.value]) })}>${SORT}</button>
      <div id="creations-order" class="menu creations-menu" role="menu" popover>${Object.entries(ORDERS).map(([one, label]) => html`<button type="button" role="menuitemradio" aria-checked=${String(order.value === one)}
        popovertarget="creations-order" popovertargetaction="hide" @click=${() => { order.value = one }}>${icons.check}${t(label)}</button>`)}</div>` : nothing}
      ${!makes.length ? nothing : makes.length === 1 ? html`<button class="button primary" @click=${make(makes[0])}>${icons.plus}${t(makes[0].make.label)}</button>`
      : html`<button class="button primary" popovertarget="creations-new">${icons.plus}${t('creations.new')}${icons.chevron}</button>
        <div id="creations-new" class="menu creations-menu" popover>${makes.map((one) => action('creations-new', one.draw(), t(one.make.label), make(one)))}</div>`}
    </div>
    ${starts.length ? html`<ul class=${here.length ? 'creations-start' : 'creations-start is-empty'} aria-label=${t('creations.new')}>${starts.map((one) => html`<li><button class="creation-start" data-kind=${one.id} @click=${make(one)}>
      <span>${one.draw()}</span><span><b>${t(`creations.one.${one.id}`)}</b> <small>${t(`creations.start.${one.id}`)}</small></span>${icons.plus}<span class="creation-blank"></span></button></li>`)}</ul>` : nothing}
    ${found && !list.length ? html`<p class="creations-none">${t('creations.none', { words: words.value.trim() })}<button class="button" @click=${() => { words.value = ''; kind.value = '' }}>${t('creations.clear')}</button></p>` : nothing}
    ${groups.filter(([, items]) => items.length).map(([name, items]) => html`${name ? html`<h2 class="creations-group">${name}<span>${count.format(items.length)}</span></h2>` : nothing}<ul class="creations-cards">${items.map(card)}</ul>`)}
    <div id="creation-menu" class="menu task-menu" popover @toggle=${(/** @type {ToggleEvent} */ e) => { opened.value = e.newState === 'open' }}>${menuOf.value ? menu(menuOf.value) : nothing}</div>`
  }
}

define('app-creations', Page)
