// A site's pages in frames (D720): each page put together as a host would serve it, by the folders' sitePage over its files (D156),
// in a frame of a file pane's kind (preview.html, D126) under the policy Settings give web pages, never reaching the internet.
// Out of sight, at a phone's and a computer's width, a probe ahead of each page says what only a page shows: a sideways scroll and
// what overflows, a band below its foot, a picture that won't show, a script's errors, and words whose contrast is too low. Beside
// the task, <app-site> shows the site at a phone's, a tablet's or a computer's width, its links leading to its other pages.
import { html, nothing, render } from 'lit-html'
import { computed, effect } from '@preact/signals-core'
import { app, effective } from '../../ui/state.js'
import { pageRights, pagePolicy, pageAllow, PAGE_SANDBOX } from '../../ui/csp.js'
import { memoryFS } from '../../core/fs.js'
import { t, locale } from '../../core/i18n.js'
import { sitePage, SITE } from '../folders/site.js'
import { reach } from './file.js'
import { WIDTHS } from './check.js'

/** @typedef {{ path: string, name: string, files: Map<string, Uint8Array> }} Shown */

const FRAME = new URL('../../preview.html', import.meta.url).href
const rights = computed(() => pageRights(effective.value.settings, app.policy))
/** A site's policy: a web page's in a folder, offline. */
const policy = () => pagePolicy({ ...rights.peek().allows, web: false, network: false }, [], true)

/** A page of the site as one document, its style sheets, scripts and pictures in it. @param {Map<string, Uint8Array>} files @param {string} path */
export const pageOf = async (files, path) => ((shown) => ('html' in shown ? shown.html : ''))(await sitePage(memoryFS(Object.fromEntries(files)), path))

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
 * What each page shows at each width, said as the check says it; nothing when pages may run no script, which the probe needs.
 * @param {Map<string, Uint8Array>} files @param {string[]} pages @param {AbortSignal} [signal] @returns {Promise<string[]>}
 */
export async function shown(files, pages, signal) {
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
  return [...new Set(problems)]
}

let made = 0
customElements.define('app-site', class extends HTMLElement {
  #site = /** @type {Shown | null} */ (null)
  #page = 'index.html'
  #width = 'computer'
  #id = `site-${++made}`
  #stop = () => {}
  set site(site) { if (site?.path !== this.#site?.path) this.#page = 'index.html'; this.#site = site; if (this.isConnected) this.draw() }
  get site() { return this.#site }
  /** The page on show, for the note a message comes with. */
  get page() { return this.#page }

  connectedCallback() {
    addEventListener('message', this.heard)
    this.#stop = effect(() => { void [rights.value, locale.value]; this.draw() })
  }

  disconnectedCallback() { removeEventListener('message', this.heard); this.#stop() }

  /** Its widths, and the page on show in a frame as wide as the one picked. */
  draw() {
    const site = this.#site, { allows } = rights.peek()
    if (!site) return
    this.dataset.width = this.#width
    const begin = async (/** @type {Event} */ event) => /** @type {HTMLIFrameElement} */ (event.target).contentWindow?.postMessage({ page: await pageOf(site.files, this.#page), policy: policy() }, '*')
    const pick = (/** @type {string} */ width) => { this.#width = width; this.dataset.width = width }
    render(nothing, this)
    render(html`<span class="segmented site-widths" role="radiogroup" aria-label=${t('sites.width')}>${['phone', 'tablet', 'computer'].map((width) => html`<label for=${`${this.#id}-${width}`}><input id=${`${this.#id}-${width}`}
      type="radio" name=${this.#id} .checked=${width === this.#width} @change=${() => pick(width)}><span>${t(`sites.${width}`)}</span></label>`)}</span>
      <div class="site-view"><iframe sandbox=${PAGE_SANDBOX} allow=${pageAllow(allows)} src=${FRAME} title=${t('sites.frame', { name: site.name })} @load=${begin}></iframe></div>`, this)
  }

  /** A link its page followed: another of its pages, shown here, or another site, in a tab of its own. @param {MessageEvent} event */
  heard = (event) => {
    const site = this.#site
    if (!site || event.source !== this.querySelector('iframe')?.contentWindow || typeof event.data?.open !== 'string') return
    const base = new URL(this.#page, SITE), to = new URL(event.data.open, base)
    const page = to.origin === base.origin ? reach(site.files, decodeURIComponent(to.pathname.slice(1))) : null
    if (page?.endsWith('.html')) { this.#page = page; this.draw(); this.dispatchEvent(new Event('input', { bubbles: true })) }
    else if (!page && /^https?:$/.test(to.protocol)) open(to.href, '_blank', 'noopener')
  }
})
