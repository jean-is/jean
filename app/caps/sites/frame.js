// SPDX-License-Identifier: MIT
// A site's pages in frames (D720): each page put together as a host would serve it, by the folders' sitePage over its files (D156),
// in a frame of a file pane's kind (preview.html, D126) under the policy Settings give web pages, never reaching the internet.
// Out of sight, at a phone's and a computer's width, a probe ahead of each page says what only a page shows: a sideways scroll and
// what overflows, a band below its foot, a picture that won't show, a script's errors, and words whose contrast is too low. Beside
// the task, <app-site> shows the site at a phone's, a tablet's or a computer's width, its links leading to its other pages; its words
// retyped in place and its parts pointed at for the brain by Jean's own script in its frame (./hand.js, D741), and the brain's
// version, while one waits, with Before, Reject and Accept. A prototype's pane is one too (D742): its bar led by what the prototype gives, its
// looks behind one button, the pages it left kept to go back to, and what can be pressed outlined when a press lands on nothing.
import { html, svg, nothing, render } from 'lit-html'
import { ref } from 'lit-html/directives/ref.js'
import { computed, effect, untracked } from '@preact/signals-core'
import { app, effective, theme, notify, assistantName } from '../../ui/state.js'
import { pageRights, pagePolicy, pageAllow, PAGE_SANDBOX } from '../../ui/csp.js'
import { memoryFS } from '../../core/fs.js'
import { t, locale } from '../../core/i18n.js'
import { icon, icons } from '../../ui/menu-icons.js'
import { sitePage, SITE } from '../folders/site.js'
import { reach } from './file.js'
import { WIDTHS } from './check.js'
import { LOOK, cssOf } from './look.js'

/** @typedef {import('./look.js').Look} Look */
/** A part pointed at in a page: its element's name, its place as a selector and its words. @typedef {{ page: string, name: string, place: string, words: string }} Pointed */
/**
 * A site on show, and the brain's with its looks, the one it wears and what picking one does; while the brain's version waits, the
 * person's files as `mine` and what accepting or rejecting it does; words retyped, the site's files after, or null when they can't be;
 * Ask Jean; the frame's name, when it isn't a site's; and a prototype's: the shape it was made for, what leads its bar and ends it, what a press on
 * nothing says, and what its own look is called; and whether the brain still writes it. @typedef {{ path: string, name: string, files: Map<string, Uint8Array>, label?: string, open?: boolean, looks?: Look[], look?: Look, pick?: (look: Look) => unknown,
 *   mine?: Map<string, Uint8Array>, decide?: (yes: boolean) => unknown, retype?: (page: string, changes: { old: string, new: string }[]) => Promise<Map<string, Uint8Array> | null>,
 *   ask?: (asked: { site: Shown, page: string, pointed: Pointed | null }) => unknown, shape?: 'phone' | 'computer', lead?: (view: HTMLElement, last?: boolean) => unknown, hint?: string, own?: string }} Shown
 */

const FRAME = new URL('../../preview.html', import.meta.url).href
/** An arrow that points: Point at a part. A disc half in the dark: by night. */
const POINT = icon(svg`<path d="M6 4l12 6-5 2-2 5z"/>`, 'flip-rtl'), NIGHT = icon(svg`<circle cx="12" cy="12" r="7.5"/><path d="M12 4.5a7.5 7.5 0 0 0 0 15z" fill="currentColor"/>`)
/** A look's paper, ink and accent, on its swatch. @param {Look} look */
const colours = ({ day }) => ref((swatch) => swatch instanceof HTMLElement && Object.entries({ '--swatch-paper': day.paper, '--swatch-ink': day.ink, '--swatch-accent': day.accent }).forEach(([name, value]) => swatch.style.setProperty(name, value)))
/** Jean's own script, ahead of the page on show in the pane (./hand.js). */
const HAND = fetch(new URL('hand.js', import.meta.url)).then((response) => response.text()).then((code) => `<script>${code}</script>`, () => '')
/**
 * Jean's script ahead of a page whose choices travel in its address (D742): the address it was reached at given back to it, and a form
 * sent to another of its pages told to Jean as a link is, its fields as that page's address, which the policy would refuse. @param {string} search
 */
export const ahead = (search) => `<script>${search ? `history.replaceState(null,'',${JSON.stringify(search)});` : ''}document.addEventListener('submit',(e)=>{const f=e.target,a=f.getAttribute('action')
if(!a||/^\\s*(javascript:|#)/i.test(a)||f.method!=='get')return;e.preventDefault();const q=new URLSearchParams(new FormData(f,e.submitter));parent.postMessage({open:a.split('?')[0]+(q.size?'?'+q:'')},'*')},true)</script>`
export const rights = computed(() => pageRights(effective.value.settings, app.policy))
/**
 * A site's policy: a web page's in a folder, offline, but for the https origins policy lets sites take style sheets, pictures and
 * fonts from (`sites.sources`), as their host's header does (host/sites.js); anything else there is dropped.
 */
export const policy = () => pagePolicy({ ...rights.peek().allows, web: false, network: false }, [], true).split('; ').map((part) => {
  const name = part.split(' ')[0], more = /^(style|img|font)-src$/.test(name) ? [app.policy.sites?.sources?.[name] ?? []].flat() : []
  return [part, ...more.filter((origin) => /^https:\/\/(\*\.)?[a-z0-9-]+(\.[a-z0-9-]+)+(:\d{1,5})?$/.test(String(origin)))].join(' ')
}).join('; ')

/** A page of the site as one document, its style sheets, scripts and pictures in it. @param {Map<string, Uint8Array>} files @param {string} path */
export const pageOf = async (files, path) => ((shown) => ('html' in shown ? shown.html : ''))(await sitePage(memoryFS(Object.fromEntries(files)), path))

/**
 * A page running where it lies, out of reach of the pointer and the keys: a prototype's on its board (../prototypes/board.js), and the
 * first of a site or a prototype on its card among the creations. A frame of a file pane's kind (D126) given the page as one document,
 * the address it was first reached at ahead of it. While more of it is to come it is written on, cut after its last whole tag; changed
 * any other way, it begins again in a new frame.
 */
customElements.define('app-site-page', class extends HTMLElement {
  #given = /** @type {unknown[]} */ ([]); #wrote = ''; #more = false; #ready = false
  /** Its files, or what reads them, its page, the address it was reached at, and whether more is to come. @param {[Map<string, Uint8Array> | Promise<Map<string, Uint8Array>>, string, string, boolean]} given */
  set page(given) {
    if (given.every((one, i) => one === this.#given[i])) return
    const [files, path, search, more] = (this.#given = given)
    Promise.resolve(files).then((all) => pageOf(all, path)).then((page) => {
      if (given !== this.#given) return
      const now = ahead(search) + (more ? page.slice(0, page.lastIndexOf('>') + 1) : page), frame = this.querySelector('iframe'), on = frame && this.#more && now.startsWith(this.#wrote)
      if (on && this.#ready) frame.contentWindow?.postMessage({ page: now.slice(this.#wrote.length), open: more }, '*')
      if (frame && !this.#more && !more && now === this.#wrote) return
      ;[this.#wrote, this.#more, this.#ready] = [now, more, !!on && this.#ready]
      if (on) return
      const next = Object.assign(document.createElement('iframe'), { src: FRAME, tabIndex: -1, sandbox: PAGE_SANDBOX })
      next.addEventListener('load', () => { this.#ready = true; next.contentWindow?.postMessage({ page: this.#wrote, policy: policy(), open: this.#more }, '*') }, { once: true })
      this.replaceChildren(next)
    }).catch(console.warn)
  }
})

/**
 * What a page shows once loaded, posted to Jean: its width and what overflows, what shows below its foot, pictures that don't show,
 * its script's errors, and words whose contrast is below WCAG AA (large words 3:1, others 4.5:1), colours read through a canvas so
 * that any CSS colour compares, over the backgrounds behind them; a background picture leaves words unjudged.
 */
const PROBE = /* html */ `<script>{const faults=[],fault=(w)=>{w=String(w);if(!faults.includes(w))faults.push(w)}
addEventListener('error',(e)=>{if(e instanceof ErrorEvent)fault(e.message)},true);addEventListener('unhandledrejection',(e)=>fault('Unhandled: '+(e.reason?.message??e.reason)))
const c=document.createElement('canvas').getContext('2d',{willReadFrequently:true}),rgba=(v)=>{c.clearRect(0,0,1,1);c.fillStyle='#000';c.fillStyle=v;c.fillRect(0,0,1,1);return[...c.getImageData(0,0,1,1).data].map((n,i)=>i<3?n:n/255)}
const over=(f,b)=>[0,1,2].map((i)=>f[i]*f[3]+b[i]*(1-f[3])).concat(1),lum=(v)=>v.slice(0,3).map((n)=>(n/=255)<=0.03928?n/12.92:((n+0.055)/1.055)**2.4).reduce((s,n,i)=>s+n*[0.2126,0.7152,0.0722][i],0)
const back=(e)=>{const layers=[];for(let n=e;n;n=n.parentElement){const s=getComputedStyle(n);if(s.backgroundImage!=='none')return null;const v=rgba(s.backgroundColor);if(v[3]>0)layers.push(v);if(v[3]>=1)break}return layers.reverse().reduce((b,l)=>over(l,b),[255,255,255,1])}
addEventListener('load',()=>setTimeout(()=>{const d=document.documentElement,w=innerWidth,seen={faults,wide:d.scrollWidth,broken:[],low:[]}
if(seen.wide>w+1){const out=[...document.body.querySelectorAll('*')].filter((e)=>{const b=e.getBoundingClientRect();return b.width>0&&(b.right>w+1||b.left<-1)}),leaf=out.find((e)=>!out.some((o)=>o!==e&&e.contains(o)))??out[0];if(leaf)seen.widest='<'+leaf.tagName.toLowerCase()+(typeof leaf.className==='string'&&leaf.className.trim()?' class="'+leaf.className.trim().split(/\\s+/).slice(0,2).join(' ')+'"':'')+'> '+Math.round(leaf.getBoundingClientRect().width)+' px wide'}
for(const i of document.images)if(i.complete&&!i.naturalWidth)seen.broken.push(i.alt||i.getAttribute('src')?.slice(0,40))
const f=document.querySelector('body > footer')??[...document.querySelectorAll('footer')].pop();seen.below=f?Math.round(Math.max(d.scrollHeight,innerHeight)-(f.getBoundingClientRect().bottom+scrollY)):0
for(const e of document.body.querySelectorAll('*')){if(seen.low.length>4)break;if(![...e.childNodes].some((n)=>n.nodeType===3&&n.textContent.trim()))continue;const s=getComputedStyle(e),b=back(e);if(!b||!e.getBoundingClientRect().width||s.visibility==='hidden'||+s.opacity===0)continue
const L=[lum(over(rgba(s.color),b)),lum(b)].sort((x,y)=>y-x),ratio=(L[0]+0.05)/(L[1]+0.05),size=parseFloat(s.fontSize),need=size>=24||(size>=18.66&&+s.fontWeight>=700)?3:4.5;if(ratio<need)seen.low.push({words:e.textContent.trim().replace(/\\s+/g,' ').slice(0,40),ratio:Math.round(ratio*100)/100,need})}
parent.postMessage({checked:seen},'*')},300))}</script>`

/** One page seen out of sight at a width: what its probe says, or null when it doesn't answer. @param {string} page @param {number} width @param {AbortSignal} [signal] */
function seen(page, width, signal) {
  const box = Object.assign(document.createElement('div'), { className: 'site-test', inert: true }), frame = Object.assign(document.createElement('iframe'), { src: FRAME })
  frame.setAttribute('sandbox', PAGE_SANDBOX)
  box.setAttribute('aria-hidden', 'true')
  box.style.inlineSize = `${width}px`
  return new Promise((resolve) => {
    const done = (/** @type {any} */ found) => { clearTimeout(timer); removeEventListener('message', heard); box.remove(); resolve(found) }
    const heard = (/** @type {MessageEvent} */ { source, data }) => { if (source === frame.contentWindow && data?.checked) done(data.checked) }
    const timer = setTimeout(() => done(null), 6000)
    signal?.addEventListener('abort', () => done(null), { once: true })
    addEventListener('message', heard)
    frame.addEventListener('load', () => frame.contentWindow?.postMessage({ page: PROBE + page, policy: policy() }, '*'), { once: true })
    box.append(frame)
    document.body.append(box)
  })
}

/**
 * What each page shows at each width, said as the check says it, and by night, the contrast of words that read by day; nothing when
 * pages may run no script, which the probe needs. @param {Map<string, Uint8Array>} files @param {string[]} pages @param {AbortSignal} [signal]
 * @param {Map<string, Uint8Array>} [night] its files with its look's night as its day (./look.js) @returns {Promise<string[]>}
 */
export async function shown(files, pages, signal, night) {
  if (!rights.peek().allows.scripts) return []
  const problems = /** @type {string[]} */ ([])
  for (const width of WIDTHS) {
    for (const path of pages.slice(0, 16)) {
      const one = await seen(await pageOf(files, path), width, signal)
      if (!one) continue
      if (one.wide > width + 1) problems.push(`${path}: at ${width} px it scrolls sideways to ${one.wide} px${one.widest ? `; ${one.widest}` : ''}`)
      if (one.below > 8) problems.push(`${path}: at ${width} px, ${one.below} px of empty page show below the footer; keep the foot at the bottom (a body in a column, main growing)`)
      for (const picture of new Set(one.broken)) problems.push(`${path}: the picture “${picture}” doesn't show`)
      for (const fault of one.faults) problems.push(`${path}: its script failed: ${fault}`)
      if (width === Math.max(...WIDTHS)) for (const low of one.low) problems.push(`${path}: “${low.words}” has a contrast of ${low.ratio}:1, not ${low.need}:1`)
    }
  }
  for (const path of night ? pages.slice(0, 16) : []) for (const low of (await seen(await pageOf(/** @type {Map<string, Uint8Array>} */ (night), path), Math.max(...WIDTHS), signal))?.low ?? []) {
    if (!problems.some((one) => one.startsWith(`${path}: “${low.words}”`))) problems.push(`${path}: by night, “${low.words}” has a contrast of ${low.ratio}:1, not ${low.need}:1`)
  }
  return [...new Set(problems)]
}

/** Panes made, and the site whose pane, drawn again once its brain's version is accepted or rejected, takes the keys back to its bar. */
let made = 0, refocus = ''
customElements.define('app-site', class extends HTMLElement {
  #site = /** @type {Shown | null} */ (null)
  #page = 'index.html'
  #search = ''
  #width = 'computer'
  #id = `site-${++made}`
  #stop = () => {}
  /**
   * Retyping, pointing or neither (./hand.js); the part pointed at; the person's version on show while the brain's waits; what the pane
   * gave last, which lit gives again each time the pane is drawn, as it does any object: no reason to load its frame again; the pages it left,
   * each with its address, to go back to; whether a press on nothing was said; and whether it shows by night, the room's theme until the person says.
   */
  #hand = ''; #pointed = /** @type {Pointed | null} */ (null); #before = false; #given = /** @type {Shown | null} */ (null); #trail = /** @type {[string, string][]} */ ([]); #hinted = false; #night = /** @type {boolean | null} */ (null)
  set site(site) {
    if (site !== this.#given) site?.path !== this.#site?.path && ((this.#page = 'index.html'), (this.#search = ''), (this.#hand = ''), (this.#pointed = null), (this.#trail = []), (this.#width = site?.shape ?? 'computer')), (this.#given = this.#site = site), (this.#before = false), this.isConnected && this.draw()
  }
  /** Another of its pages on show, at the address given, the one it leaves kept unless it goes back. @param {string} page @param {string} [search] @param {boolean} [back] */
  go(page, search = '', back = false) { back || this.#trail.push([this.#page, this.#search]); this.#page = page; this.#search = search; this.#pointed = null; this.draw(); this.dispatchEvent(new Event('input', { bubbles: true })) }
  /** The page it left last, or its first page with nothing chosen. @param {boolean} [first] */
  back(first = false) { this.go(...(/** @type {[string, string]} */ ((first ? (this.#trail = []) : this.#trail).pop() ?? ['index.html', ''])), true) }
  /** How many pages back it can go. */
  get went() { return this.#trail.length }
  get site() { return this.#site }
  /** The page on show, for the note a message comes with. */
  get page() { return this.#page }
  /** The part pointed at on the page on show, for that note too. */
  get pointed() { return this.#pointed?.page === this.#page ? this.#pointed : null }

  connectedCallback() {
    addEventListener('message', this.heard)
    this.#stop = effect(() => { void [rights.value, locale.value]; untracked(() => this.draw()) })
  }

  disconnectedCallback() { removeEventListener('message', this.heard); this.#stop() }

  /** Its frame's window. */
  get #frame() { return this.querySelector('iframe')?.contentWindow }
  /** Whether its page shows by night. */
  get #dark() { return this.#night ?? theme.peek() === 'dark' }
  /** What Jean's script in the frame does now: no retyping while the brain's version waits. */
  get #does() { return this.#hand === 'edit' && this.#site?.mine ? '' : this.#hand }

  /** A look worn: the page on show again in it, its frame reloaded and the radios left as they are, then kept. @param {Look} look */
  wear(look) {
    const site = this.#site
    if (site) (this.#site = { ...site, look, files: new Map(site.files).set(LOOK, new TextEncoder().encode(cssOf(look))) }), this.querySelector('.site-view iframe')?.setAttribute('src', FRAME), site.pick?.(look), this.bar()
  }

  /** Retyping, pointing or neither, the frame told and the bar drawn again; leaving pointing forgets the part. @param {string} hand */
  use(hand) {
    if ((this.#hand = hand) !== 'point') this.#pointed = null
    this.#frame?.postMessage({ hand: this.#does }, '*'), this.bar()
  }

  /** Its looks (D739), the rows of its button's menu, each a radio with its colours. @param {Shown} site */
  #looks(site) {
    return site.looks ? html`<span class="site-looks" role="radiogroup" aria-label=${t('sites.looks')}>${site.looks.map((look, i) => html`<label for=${`${this.#id}-look-${i}`}><input id=${`${this.#id}-look-${i}`}
      type="radio" name=${`${this.#id}-look`} .checked=${look === site.look} @change=${() => this.wear(look)}><span><i class="site-swatch" aria-hidden="true" ${colours(look)}></i>${(look.id === 'own' && site.own) || t(`sites.palette.${look.id}`)}</span></label>`)}</span>` : nothing
  }

  /** Its bar, and the page on show in a frame as wide as the one picked. */
  draw() {
    const site = this.#site, { allows } = rights.peek()
    if (!site) return
    this.dataset.width = this.#width
    const begin = async (/** @type {Event} */ event) => {
      const frame = /** @type {HTMLIFrameElement} */ (event.target).contentWindow, now = this.#site ?? site, scripts = rights.peek().allows.scripts, files = this.#before && now.mine ? now.mine : now.files, when = this.#dark ? 'night' : 'day'
      // By day or by night as its bar says, whatever the device prefers: its look's colours of then, as both.
      frame?.postMessage({ page: (scripts ? ahead(this.#search) + await HAND : '') + await pageOf(now.look ? new Map(files).set(LOOK, new TextEncoder().encode(cssOf({ ...now.look, day: now.look[when], night: now.look[when] }))) : files, this.#page), policy: policy() }, '*')
      if (scripts) frame?.postMessage({ hand: this.#does, at: this.pointed?.place ?? '', hint: !!now.hint }, '*')
    }
    render(nothing, this)
    render(html`<div class="site-bar"></div><div class="site-view"><iframe sandbox=${PAGE_SANDBOX} allow=${pageAllow(allows)} src=${FRAME} title=${site.label ?? t('sites.frame', { name: site.name })} @load=${begin}></iframe></div>`, this)
    this.bar()
    if (refocus === site.path && !site.mine) (refocus = ''), /** @type {HTMLElement | null} */ (this.querySelector('.site-hand [data-hand]'))?.focus()
  }

  /**
   * What leads a prototype's bar, its widths as drawings, then one group of drawings, each named by its tip: its looks' button, by day or by night where its look has both, and retyping and pointing
   * where pages may run a script, which they need; what ends a prototype's bar, the brain's version waiting with Before, Reject and Accept, and what retyping or pointing does now, or the part
   * pointed at with Ask Jean.
   */
  bar() {
    const site = this.#site, at = /** @type {HTMLElement | null} */ (this.querySelector('.site-bar'))
    if (!site || !at) return
    const name = assistantName(), pointed = this.pointed, decide = (/** @type {boolean} */ yes) => { refocus = site.path; site.decide?.(yes) }
    const pick = (/** @type {string} */ width) => { this.#width = width; this.dataset.width = width }
    const toggle = (/** @type {string} */ hand, /** @type {unknown} */ glyph) => html`<button type="button" class="icon-button subtle" data-hand=${hand} aria-label=${t(`sites.${hand}`)} aria-pressed=${String(this.#hand === hand)} @click=${() => this.use(this.#hand === hand ? '' : hand)}>${glyph}</button>`
    const again = (/** @type {() => void} */ change) => () => { change(); this.querySelector('.site-view iframe')?.setAttribute('src', FRAME); this.bar() }, before = again(() => { this.#before = !this.#before })
    render(html`${site.lead?.(this) ?? nothing}<span class="segmented site-widths" role="radiogroup" aria-label=${t('sites.width')}>${(site.shape ? ['phone', 'computer'] : ['phone', 'tablet', 'computer']).map((width) => html`<label for=${`${this.#id}-${width}`} title=${t(`sites.${width}`)}><input id=${`${this.#id}-${width}`}
      type="radio" name=${this.#id} title=${t(`sites.${width}`)} .checked=${width === this.#width} @change=${() => pick(width)}><span>${/** @type {any} */ (icons)[width]}</span></label>`)}</span>
      <span class="icon-group site-hand">${site.looks ? html`<button type="button" class="icon-button subtle" popovertarget=${`${this.#id}-looks`} aria-label=${t('sites.looks')}><i class="site-swatch" aria-hidden="true" ${colours(site.look ?? site.looks[0])}></i></button><div id=${`${this.#id}-looks`} class="menu site-fold" popover>${this.#looks(site)}</div>` : nothing}
        ${site.look && site.look.day.paper !== site.look.night.paper ? html`<button type="button" class="icon-button subtle" aria-label=${t('theme.dark')} aria-pressed=${String(this.#dark)} @click=${again(() => { this.#night = !this.#dark })}>${NIGHT}</button>` : nothing}
        ${rights.peek().allows.scripts ? html`${site.mine ? nothing : toggle('edit', icons.compose)}${toggle('point', POINT)}` : nothing}</span>${site.mine ? nothing : site.lead?.(this, true) ?? nothing}
      ${site.mine ? html`<p class="site-jean"><span>${t('sites.jean', { name })}</span><button type="button" class="button subtle" aria-pressed=${String(this.#before)} @click=${before}>${t('sites.before')}</button>
        <button type="button" class="button" @click=${() => decide(false)}>${t('sites.reject')}</button><button type="button" class="button primary" @click=${() => decide(true)}>${t('sites.accept')}</button></p>` : nothing}
      <div class="site-said"><p role="status">${this.#does === 'edit' ? t('sites.editing') : this.#does !== 'point' ? '' : !pointed ? t('sites.pointing', { name }) : pointed.words ? html`<q dir="auto">${pointed.words.length > 80 ? `${pointed.words.slice(0, 80)}…` : pointed.words}</q>` : t('sites.part')}</p>
        ${pointed ? html`<button type="button" class="button" @click=${() => site.ask?.({ site, page: this.#page, pointed })}>${t('sites.askJean', { name })}</button>` : nothing}</div>`, at)
  }

  /**
   * What its frame says: a press that landed on nothing, said once; a link its page followed, another of its pages shown here, or another site, in a tab of its own; words retyped,
   * kept in its files or put back, said either way; markup a key took away, put back; a part pointed at. Untrusted, since the page's
   * own script could say the same: words only while retyping, each a passage its page has once, a part only while pointing.
   * @param {MessageEvent} event
   */
  heard = async (event) => {
    const site = this.#site, data = event.data
    if (!site || event.source !== this.#frame || !data || typeof data !== 'object') return
    const page = this.#page, does = this.#does, changes = data.edited?.changes
    if (typeof data.open === 'string') {
      const base = new URL(page, SITE), to = new URL(data.open, base), found = to.origin === base.origin ? reach(site.files, decodeURIComponent(to.pathname.slice(1))) : null
      if (found?.endsWith('.html')) this.go(found, to.search)
      else if (!found && /^https?:$/.test(to.protocol)) open(to.href, '_blank', 'noopener')
    } else if (data.nothing === true && site.hint) { if (!this.#hinted) (this.#hinted = true), notify(site.hint) }
    else if (does === 'edit' && data.refused === true) notify(t('sites.onlyWords'), { alert: true })
    else if (does === 'edit' && Number.isInteger(data.edited?.id) && Array.isArray(changes) && changes.length && changes.length <= 20 && changes.every((one) => typeof one?.old === 'string' && typeof one?.new === 'string')) {
      const files = await site.retype?.(page, changes.map((one) => ({ old: one.old, new: one.new })))
      if (files && this.#site?.path === site.path) this.#site = { ...this.#site, files }
      this.#frame?.postMessage(files ? { kept: data.edited.id } : { undo: data.edited.id }, '*')
      notify(t(files ? 'sites.retyped' : 'sites.notHere', { name: assistantName() }), files ? { quiet: true } : { alert: true })
    } else if (does === 'point' && data.pointed && ['name', 'place', 'words'].every((key) => typeof data.pointed[key] === 'string' && data.pointed[key].length <= 400)) (this.#pointed = { page, name: data.pointed.name, place: data.pointed.place, words: data.pointed.words }), this.bar()
  }
})
