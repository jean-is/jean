// "What Jean can do": the house (docs/design.md). Discovered capabilities are lit rooms;
// the rest wait in the shadow, like a game's collection screen, and can be turned on early.
import { html, nothing } from 'lit-html'
import { Element, define } from './base.js'
import { app } from './state.js'
import { loaded, unlock, isDenied, SIZES } from './caps.js'
import { syncDialog, closed, close, backdrop, head } from './dialogs.js'
import { CATALOGUE, accept, begin, unlockAll } from './discovery.js'
import { BRAND } from '../brand.js'
import { t, formatBytes } from '../core/i18n.js'
import { icons } from './icons.js'

const ICONS = /** @type {Record<string, keyof typeof icons>} */ ({
  files: 'file', made: 'table', compute: 'calc', reflexes: 'lamp', memory: 'note', projects: 'rooms', routines: 'repeat', python: 'code',
  search: 'globe', connections: 'plug', live: 'wave', backup: 'download', 'brain-local': 'chip',
})
/** Where a lit room leads. */
const OPENS = /** @type {Record<string, typeof app.dialog.value>} */ ({ memory: 'knows', routines: 'knows', projects: 'history', connections: 'connections' })

/** @param {string} id */
async function turnOn(id) {
  if (id === 'reflexes') return accept('reflexes')
  if (!(await unlock(id))) return
  if (id === 'brain-local') app.dialog.value = 'brain'
  else begin(id)
}

/** Whether a lit capability still waits for a download (Intuition's weights). @param {string} id */
function waiting(id) {
  const module = loaded.value.get(id)
  return id === 'reflexes' && module && !module.decide
}

class Collection extends Element {
  render() {
    const lit = loaded.value
    const ids = CATALOGUE.filter((id) => !isDenied(id))
    const count = ids.filter((id) => lit.has(id)).length
    return html`<dialog class="sheet collection" @close=${closed('collection')} @click=${backdrop}>
      ${head(t('collection.title', { name: BRAND.name }))}
      <p class="lede">${t('collection.lede', { name: BRAND.name })}</p>
      <p class="muted small">${t('collection.count', { count, total: ids.length })}</p>
      <ul class="rooms">${ids.map((id) => html`<li class="room-card ${lit.has(id) ? 'is-lit' : ''}">
        <span class="room-icon" aria-hidden="true">${icons[ICONS[id]]}</span>
        <div class="room-text">
          <h3>${t(`cap.${id}.name`)}</h3>
          <p>${t(`cap.${id}.text`, { name: BRAND.name, size: formatBytes(SIZES[id] ?? 0) })}</p>
        </div>
        ${!lit.has(id) ? html`<button class="button" @click=${() => turnOn(id)}>${t('collection.turnOn')}</button>`
          : waiting(id) && !app.offer.value ? html`<button class="button" @click=${() => accept(id)}>${icons.download} ${t('cap.reflexes.yes', { size: formatBytes(SIZES.reflexes) })}</button>`
          : OPENS[id] ? html`<button class="button" @click=${() => { app.dialog.value = OPENS[id] }}>${t('collection.open')}</button>`
          : html`<span class="room-on">${icons.check}<span class="visually-hidden">${t('collection.on')}</span></span>`}
      </li>`)}</ul>
      ${count < ids.length ? html`<button class="button wide" @click=${unlockAll}>${t('collection.all')}</button>` : nothing}
    </dialog>`
  }

  updated() {
    syncDialog(this, 'collection')
  }
}

define('app-collection', Collection)
