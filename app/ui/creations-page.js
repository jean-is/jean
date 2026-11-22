// SPDX-License-Identifier: MIT
// The Creations page (D497), loaded once it shows: the project's creations, a card each, in one grid, those pinned first, each with
// its pin, then the latest changed, those of a month before this one under its name, or by when they were made, or by name; found
// by their words, every one of them, in any order, which each card found marks, in its name and
// in a passage of its words, those found in one grid with no month's name, and those of one kind alone picked from the chips over them, one for each kind that holds some, with its
// count of those found, which Show's menu holds where the page is narrow, beside Sort's; a kind that holds none says so, or, when
// other kinds hold what was found, that it alone is shown, beside All's count, which shows them; words that nothing has, where nothing is made too, are said to match none, beside Clear. Create is the one way to make one here: its menu names each
// kind with its few words, in groups, or, a kind picked, it names that kind and makes one at once; with nothing made yet, the page
// says so around it, once the project's have been read. One is asked for in the box too (D542). Each card has a menu, as a task has, which a right click opens too: Pin, Rename in place, Duplicate (a
// document, a collection) or Another like this (asked for in the box), and Delete, which takes it off at once and deletes it five
// seconds later unless Undo is pressed first; what an answer holds (a score, an app, a deck) is only taken off the page, its answer
// keeping it. Each kind does them through its `creations` slot. On a wide window, a card dragged onto the screen opens there, as a
// row of the drawer does, and its menu opens it side by side (caps/split, D635).
import { html, nothing, svg } from 'lit-html'
import { signal } from '@preact/signals-core'
import { Element, define } from './base.js'
import { app, held, notify } from './state.js'
import { slots, unlock } from './caps.js'
import { all, read, reread, show, query as words, kind, order, SHAPES } from './creations.js'
import { icons, icon } from './menu-icons.js'
import { virtual } from './virtual.js'
import { fold, ranges, passage } from '../core/search.js'
import { t, relativeTime, intlLocales, useStrings } from '../core/i18n.js'

await useStrings('creations')

/** @typedef {import('./creations.js').Creation & { kind: import('./caps.js').Slot }} Item */
/** The one whose name is being changed, and those deleted but for Undo; the kind picked, the order and the words typed are creations.js's, which the address and a tag set. */
const renaming = signal(''), gone = signal(/** @type {Set<string>} */ (new Set()))
/** The orders, which creations.js checks an address's against, the last how they link, the map composition draws once there is one, named by it (caps/compose); Sort's glyph, an arrow up beside an arrow down, and Show's, three lines narrowing. */
export const ORDERS = /** @type {Record<string, string>} */ ({ changed: 'creations.changed', made: 'creations.made', name: 'creations.name', links: '' }), SORT = icon(svg`<path d="M8 19V5M4.5 8.5 8 5l3.5 3.5M16 5v14M12.5 15.5 16 19l3.5-3.5"/>`), SHOW = icon(svg`<path d="M4 6.5h16M7 12h10M10 17.5h4"/>`)
/** Create's groups, by what a kind is for: what is written and planned, pictures and sound, and the rest, which works when pressed. @type {[string, string[]][]} */
const GROUPS = [['write', ['documents', 'tables', 'slides', 'whiteboards']], ['picture', ['pictures', 'designs', 'films', 'music']], ['use', []]]
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
  event.preventDefault(), event.stopPropagation()
  const name = /** @type {HTMLInputElement} */ (event.target).value.trim().replace(/\s+/g, ' ')
  renaming.value = ''
  const back = () => key && requestAnimationFrame(() => /** @type {HTMLElement | null} */ (document.querySelector(`[data-path="${CSS.escape(item.path)}"] .creation-open`))?.focus())
  back()
  // Read again, it may have moved, and its card be another's.
  if (key !== 'Escape' && name && name !== item.name) change(item, { name }, () => item.kind.rename(item, name)).then(back)
}

/** A copy, first after those pinned, its name in a box for one of its own. @param {Item} item */
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

/** Taken off at once, then deleted, or a score taken off the page, five seconds later unless Undo is pressed, its toast saying what still uses it (caps/compose). @param {Item} item @param {boolean} [keyed] pressed from the keyboard */
function drop(item, keyed = false) {
  const back = () => { gone.value = new Set([...gone.value].filter((path) => path !== item.path)) }
  const now = () => {
    clearTimeout(timer), waiting.delete(item.path)
    import('./preview.js').then(({ unshow }) => unshow(item.link.uri)).then(() => (item.kind.remove ?? item.kind.hide)(item)).catch(console.warn).finally(() => reread().then(back))
  }
  // Kept while the toast has the keyboard, which goes to its Undo rather than falling to the page when it pressed Delete.
  const later = () => { timer = setTimeout(held() ? later : now, held() ? 1000 : 0) }
  let timer = setTimeout(later, 5000)
  gone.value = new Set(gone.value).add(item.path)
  waiting.set(item.path, now)
  notify(slots('touched').reduce((said, part) => part.said(said, item.path), t(item.kind.remove ? 'creations.deleted' : 'creations.removed', { name: item.name })), { label: t('memory.undo'), run: () => { clearTimeout(timer); waiting.delete(item.path); back(); requestAnimationFrame(() => /** @type {HTMLElement | null} */ (document.querySelector(`.creation[data-path="${CSS.escape(item.path)}"] .creation-open`))?.focus()) }, undo: true }, 5000)
  if (keyed) requestAnimationFrame(() => /** @type {HTMLElement | null} */ (document.querySelector('app-toasts .toast .button'))?.focus())
}

/**
 * The month each goes under by when, with its year before this one, and none for this month's, whose card says when; made for
 * one drawing, each month worked out once, the formats made once, not for each of a thousand cards.
 */
function months() {
  const now = new Date(), here = now.getFullYear() * 12 + now.getMonth(), known = new Map()
  const formats = /** @type {Intl.DateTimeFormatOptions[]} */ ([{}, { year: 'numeric' }]).map((year) => new Intl.DateTimeFormat(intlLocales(), { month: 'long', ...year }))
  /** @param {Date} at */
  const of = (at) => { const month = formats[Number(at.getFullYear() !== now.getFullYear())].format(at); return month.charAt(0).toLocaleUpperCase(intlLocales()) + month.slice(1) }
  return (/** @type {string} */ when) => { const at = new Date(when), key = at.getFullYear() * 12 + at.getMonth(); if (!known.has(key)) known.set(key, key < here ? of(at) : ''); return /** @type {string} */ (known.get(key)) }
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

/**
 * A card dragged, carrying what a document takes of it, and lifted until it is let go (creations.css): its picture, taken once this
 * returns, is the card at rest, as wide and as tall as it whatever it holds, with its own corners. @param {DragEvent} event @param {string} type @param {string} data
 */
const lift = (event, type, data) => { const card = /** @type {HTMLElement} */ (event.currentTarget); event.dataTransfer?.setData(type, data); card.toggleAttribute('data-lifted', true); card.addEventListener('dragend', () => card.removeAttribute('data-lifted'), { once: true }) }
/** One of a menu's rows, which closes it. @param {string} menu @param {unknown} icon @param {string} label @param {(event: MouseEvent) => unknown} act */
const action = (menu, icon, label, act) => html`<li><button type="button" popovertarget=${menu} popovertargetaction="hide" @click=${act}>${icon}${label}</button></li>`
/**
 * Show or Sort: a button of its glyph and what is chosen, its name saying which of the two it is, marked once that isn't the first,
 * and its menu, the one chosen checked, each with its count if it has one. @param {string} id @param {unknown} glyph @param {string} tip
 * @param {string[][]} choices each one's value, words and count @param {string} chosen @param {(one: string) => void} choose
 */
const choice = (id, glyph, tip, choices, chosen, choose) => html`<button class="button subtle ${id} ${chosen === choices[0][0] ? '' : 'is-on'}" popovertarget=${id} aria-label=${tip}>${glyph}${choices.find(([one]) => one === chosen)?.[1]}${icons.chevron}</button>
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
/**
 * What takes the card away, and the button its menu was placed at with it (Pin draws it in another group, Delete takes it off): done
 * once a frame has been drawn with the menu closed. In the frame it closes, the menu's fallbacks (`position-try-fallbacks`) could keep
 * Linux WebKit resolving styles for ever.
 * @param {(e: MouseEvent) => unknown} act
 */
const away = (act) => (/** @type {MouseEvent} */ e) => requestAnimationFrame(() => setTimeout(act, 0, e))
/** That menu: Pin, Rename, Duplicate or Another like this, Open side by side once tiles are found, and Delete. @param {Item} item */
const menu = (item) => [
  action('creation-menu', icons.pin, t(item.pinned ? 'action.unpin' : 'action.pin'), away(() => change(item, { pinned: !item.pinned }, () => item.kind.pin(item, !item.pinned)))),
  action('creation-menu', icons.compose, t('action.rename'), () => rename(item.path)),
  item.kind.copy ? action('creation-menu', icons.copy, t('creations.duplicate'), () => copy(item)) : item.kind.like ? action('creation-menu', icons.fork, t('creations.like'), () => like(item)) : nothing,
  ...slots('kept').map((part) => part.draw(item, action.bind(null, 'creation-menu'))), action('creation-menu', icons.trash, t(item.kind.remove ? 'action.delete' : 'creations.remove'), away((e) => drop(item, e.detail === 0)))]

/** A creation's name and its words, Markdown's marks aside but a tag's, and its name aside where they start with it, as a document's do, as they show, then as they are searched, folded, which keeps every place: worked out once for each. @type {WeakMap<Item, string[]>} */
const texts = new WeakMap()
/** @param {Item} item */
const textsOf = (item) => texts.get(item) ?? (() => { const name = item.name.normalize('NFC'), plain = item.text.normalize('NFC').replace(/[*`|]+|#+(?=\s)/g, ' ').trimStart(), text = plain.startsWith(name) ? plain.slice(name.length).trimStart() : plain, four = [name, text, fold(name), fold(text)]; texts.set(item, four); return four })()
/** Whether one has every word typed, in its name or in its words, in any order. @param {Item} item @param {string[]} sought */
const has = (item, sought) => { const [, , name, text] = textsOf(item); return sought.every((word) => name.includes(word) || text.includes(word)) }
/** A text with places in it marked. @param {string} text @param {[number, number][]} places */
function marks(text, places) {
  const parts = []
  let at = 0
  for (const [from, to] of places) { parts.push(text.slice(at, from), html`<mark>${text.slice(from, to)}</mark>`); at = to }
  return [...parts, text.slice(at)]
}
/**
 * A creation's name with the words typed marked in it, as Search marks them, and, unless its name has them all, a passage of its words
 * from a few words before the first of those its name lacks, which a narrow card's two lines still show, marked too. @param {Item} item @param {string[]} sought
 */
function marked(item, sought) {
  const [name, text, inName, inText] = textsOf(item)
  const first = Math.min(...sought.filter((word) => !inName.includes(word)).map((word) => inText.indexOf(word)).filter((at) => at >= 0))
  const [from, to] = Number.isFinite(first) ? passage(text, first, 16) : [0, 0]
  return { name: marks(name, ranges(inName, sought)), passage: to ? html`<p class="creation-found" dir="auto">${from ? '…' : nothing}${marks(text.slice(from, to), ranges(inText.slice(from, to), sought))}</p>` : nothing }
}

/**
 * A card: what it holds, its name, which opens it from anywhere on the card, its menu's button, when it changed and its pin; dragged, what a
 * document beside the task holds of it: a block (`held`, a collection's view or a picture), or else a reference to it (D575), and, over
 * anything else on a wide window, the creation itself, which the screen opens where it is let go (`data-tile`, D635).
 * Its place among its group's, which a screen reader says, as the group draws only those in view (D627). Found by words, it marks them.
 * @param {Item[]} items @param {number} i @param {string[]} sought the words typed, if any were
 */
function card(items, i, sought) {
  const item = items[i], held = item.kind.held?.(item) ?? `[[${item.link.uri}|${item.name.replace(/[[\]|\n]+/g, ' ')}]]`, found = sought.length ? marked(item, sought) : null
  return html`<li class="creation ${opened.value && menuOf.value?.path === item.path ? 'is-open' : ''}" data-path=${item.path} aria-posinset=${i + 1} aria-setsize=${items.length} @contextmenu=${context}
    draggable=${renaming.value === item.path ? nothing : 'true'} data-tile=${item.path} @dragstart=${(/** @type {DragEvent} */ e) => lift(e, item.kind.held ? 'text/x-creation-block' : 'text/x-creation', held)}>
    <app-later class="creation-preview" aria-hidden="true" inert .draw=${() => item.kind.preview?.(item) ?? item.kind.draw()}></app-later>
    ${renaming.value === item.path ? html`<div class="creation-naming">${item.kind.draw()}<input class="creation-rename" dir="auto" title=${t('action.rename')} .value=${item.name}
      @keydown=${(/** @type {KeyboardEvent} */ e) => named(e, item)} @blur=${(/** @type {FocusEvent} */ e) => named(e, item)}></div>`
      : html`<button class="creation-open" aria-label=${`${t(`creations.one.${item.kind.id}`)}: ${item.name}`} @click=${show(item)} @dblclick=${() => rename(item.path)}>${item.kind.draw()}<span dir="auto">${found?.name ?? item.name}</span></button>`}
    <button class="icon-button subtle creation-more" popovertarget="creation-menu" aria-label=${t('action.more')} @click=${() => { menuOf.value = item }}>${icons.more}</button>
    ${found?.passage ?? nothing}
    <span class="creation-when">${item.changed && relativeTime(item.changed)}${item.pinned ? html`<span role="img" aria-label=${t('history.pinned')}>${icons.pin}</span>` : nothing}</span>
  </li>`
}

/** The keyboard, once the button it pressed is gone with what it said, on the first there is of these, the page drawn again; a pointer's press moves nothing. @param {MouseEvent} event @param {...string} places */
const land = (event, ...places) => event.detail || requestAnimationFrame(() => /** @type {HTMLElement | undefined} */ (places.map((place) => document.querySelector(`app-creations ${place}`)).find(Boolean))?.focus())

/** Every creation here in one grid, those pinned first, an earlier month's under its name, under the bar that finds (from five), orders
 * (from two) and makes them, and the kinds that hold some: chips, or Show's menu where the page is narrow. With none yet, it says so around Create. */
class Page extends Element {
  updated() { focusName() }
  render() {
    const kinds = slots('creations'), picked = kinds.find((one) => one.id === kind.value), here = all.value.filter((item) => !gone.value.has(item.path)), count = new Intl.NumberFormat(intlLocales())
    // A card on a wide window drags onto the screen, beside the page (caps/split).
    if (app.wide.value && here.length) unlock('split')
    // Those made include a kind not kept here yet: its `starts` slot, Apps' until the project holds one (D553).
    // What was typed, as the words to find, each whole, a tag with its #, case and accents aside.
    const sought = [...new Set(fold(words.value.normalize('NFC')).split(/\s+/).filter(Boolean))], collator = new Intl.Collator(intlLocales()), makers = [...kinds, ...slots('starts')].filter((one) => one.make).sort((a, b) => a.at - b.at)
    const makes = picked?.make ? [picked] : makers, make = (/** @type {import('./caps.js').Slot} */ one) => () => one.make().then(reread)
    // How they link, once composition draws a map here; an address that asks for it before then shows them by when they changed.
    const map = slots('map').find((one) => one.ready()), by = order.value === 'links' && !map ? 'changed' : order.value, sorting = (/** @type {string} */ one) => (one === 'links' ? map?.named() : t(ORDERS[one]))
    const when = (/** @type {Item} */ item) => (order.value === 'made' ? item.created || item.changed : item.changed)
    // Those that have every word typed, of any kind, then those of the kind picked.
    const having = sought.length ? here.filter((item) => has(item, sought)) : here
    const list = having.filter((item) => !picked || item.kind === picked)
      .sort(order.value === 'name' ? (a, b) => collator.compare(a.name, b.name) : (a, b) => (when(a) < when(b) ? 1 : -1))
    // One grid: those pinned, then the rest, a month before this one starting a group under its name, unless words are typed: those found are few, and stay together.
    /** @type {[string, Item[]][]} */
    const groups = [['', list.filter((item) => item.pinned)]], month = months()
    for (const item of list.filter((one) => !one.pinned)) {
      const name = order.value === 'name' || sought.length ? '' : month(when(item)), last = groups[groups.length - 1]
      if (last[0] === name) last[1].push(item)
      else groups.push([name, [item]])
    }
    // What Show offers, once two kinds hold some: all, then each of those kinds and the one picked, with its count, of those that have the words typed.
    const held = kinds.filter((one) => one === picked || here.some((item) => item.kind === one)), on = picked?.id ?? '', showing = t('creations.showing', { what: t(picked ? `creations.kind.${picked.id}` : 'creations.all') })
    const shows = held.length > 1 || picked ? [['', t('creations.all'), count.format(having.length)], ...held.map((one) => [one.id, t(`creations.kind.${one.id}`), count.format(having.filter((item) => item.kind === one).length)])] : []
    // Create: the kind picked, or the only one there is, named and made at once; else its menu, each kind with its few words, in groups once there are two.
    const sets = GROUPS.map(([name, ids]) => /** @type {[string, import('./caps.js').Slot[]]} */ ([name, makes.filter((one) => (ids.length ? ids.includes(one.id) : !GROUPS.some(([, others]) => others.includes(one.id))))])).filter(([, those]) => those.length)
    const create = !makes.length ? nothing : makes.length === 1 ? html`<button class="button primary" @click=${make(makes[0])}>${icons.plus}${t(`creations.one.${makes[0].id}`)}</button>`
      : html`<button class="button primary" popovertarget="creations-new">${icons.plus}${t('creations.create')}${icons.chevron}</button>
        <div id="creations-new" class="menu creations-menu" popover>${sets.map(([name, those]) => html`<div>${sets.length > 1 ? html`<p id="creations-new-${name}">${t(`creations.group.${name}`)}</p>` : nothing}
          <ul aria-labelledby=${sets.length > 1 ? `creations-new-${name}` : nothing}>${those.map((one) => html`<li><button type="button" popovertarget="creations-new" popovertargetaction="hide" data-kind=${one.id} @click=${make(one)}>
            <span>${one.draw()}</span><span><b>${t(`creations.one.${one.id}`)}</b> <small>${t(`creations.start.${one.id}`)}</small></span></button></li>`)}</ul></div>`)}</div>`
    return html`<h1 class="conversation-title">${t('creations.title')}</h1>
    ${!here.length && !words.value ? (read.value ? html`<div class="creations-empty">${SHAPES}<h2>${t('creations.empty')}</h2><p>${t('creations.empty.text')}</p>${create}</div>` : nothing) : html`<div class="creations-bar">
      ${here.length > 4 || words.value ? html`<label class="creations-find" for="creations-find">${icons.search}<input id="creations-find" type="search" dir="auto" placeholder=${t('creations.find')} aria-label=${t('creations.find')} title=${t('creations.find')} .value=${words.value} @input=${(/** @type {InputEvent} */ e) => { words.value = /** @type {HTMLInputElement} */ (e.target).value }}></label>` : nothing}
      ${shows.length ? choice('creations-kinds', SHOW, showing, shows, on, (one) => { kind.value = one }) : nothing}
      ${here.length > 1 ? choice('creations-order', SORT, t('creations.sorted', { how: sorting(by) }), Object.keys(ORDERS).filter((one) => one !== 'links' || map).map((one) => [one, sorting(one)]), by, (one) => { order.value = one }) : nothing}
      ${create}
    </div>
    ${shows.length ? html`<div class="creations-chips" role="group" aria-label=${showing}>${shows.map(([one, name, many]) => html`<button type="button" class="button ${on === one ? 'primary' : ''}" aria-pressed=${String(on === one)} @click=${() => { kind.value = one }}>${name} <span>${many}</span></button>`)}</div>` : nothing}`}
    <div role="status">${list.length || !(here.length || (words.value && read.value)) ? nothing : html`<p class="creations-none">${!sought.length ? t('creations.empty')
      : having.length ? html`${showing}<button class="button" @click=${(/** @type {MouseEvent} */ e) => { kind.value = ''; land(e, '.creation-open') }}>${t('creations.all')} <span>${count.format(having.length)}</span></button>`
        : html`${t('creations.none', { words: `⁨${words.value.trim()}⁩` })}<button class="button" @click=${(/** @type {MouseEvent} */ e) => { words.value = ''; kind.value = ''; land(e, '#creations-find', '.creation-open', '.primary') }}>${t('creations.clear')}</button>`}</p>`}</div>
    ${by === 'links' && map ? map.draw(picked || sought.length ? new Set(list.map((item) => item.path)) : null) : groups.map(([name, items]) => (!items.length ? nothing : html`${name ? html`<h2 class="creations-group">${name}</h2>` : nothing}
      <ul class="creations-cards">${virtual({ count: items.length, key: (i) => items[i].path,
      at: items.findIndex((item) => item.path === renaming.value), draw: (i) => card(items, i, sought) })}</ul>`))}
    <div id="creation-menu" class="menu task-menu" popover @toggle=${(/** @type {ToggleEvent} */ e) => { opened.value = e.newState === 'open' }}>${menuOf.value ? html`<ul>${menu(menuOf.value)}</ul>` : nothing}</div>`
  }
}

define('app-creations', Page)
