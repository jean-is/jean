// SPDX-License-Identifier: MIT
// A prototype pressed through and drawn, in the tab (D742): each page in one frame of a file pane's kind at a time, out of sight at a
// phone's width, under a site's policy, with Jean's script ahead of it (../sites/frame.js's ahead(): the address's choices, a form sent to
// another page). From index.html, each plain link is followed and every other control pressed on a fresh page, its fields filled first,
// once more one level deeper where a press brought new controls out; what leads to a page reaches it, the first that did kept with its name, what changes the page does something,
// what does neither does nothing, and what leaves by its own script can't be followed. A page's still picture, for the strip and the board, is drawn by
// the frame itself through an SVG foreignObject, as a game's is, at a phone's width or a computer's, as the prototype is made. Never two frames at once: the board's live page is the other.
import { pageOf, ahead, policy, rights } from '../sites/frame.js'
import { PAGE_SANDBOX } from '../../ui/csp.js'
import { reach } from '../sites/file.js'
import { SITE } from '../folders/site.js'

/** @typedef {import('./check.js').Flow} Flow */
/** A control as the probe lists it. @typedef {{ at: number, name: string, kind: string, to: string | null, off: boolean, invalid: boolean, key: string }} Control */

const FRAME = new URL('../../preview.html', import.meta.url).href, PAGES = 16, PRESSES = 30, DEEPER = 12
const PRESSABLE = 'a[href],button,input[type=submit],input[type=button],input[type=image],[role=button],[role=tab],[role=link],[role=menuitem],[role=option],summary'

/**
 * The probe ahead of a page: once it is loaded, its fields filled, its controls listed and marked; given presses, each pressed in turn
 * and what the last one changed said, with the controls it brought out. A page leaving by its own script says so.
 * @param {number[] | null} presses
 */
const probe = (presses) => `<script>{const S=${JSON.stringify(PRESSABLE)},T=${JSON.stringify(presses)},post=(m)=>parent.postMessage(m,'*'),wait=(ms)=>new Promise((r)=>setTimeout(r,ms))
addEventListener('pagehide',()=>post({left:true}))
const list=()=>{let at=0;return[...document.querySelectorAll(S)].flatMap((e)=>{const b=e.getBoundingClientRect();if(!b.width||!b.height||!e.checkVisibility({visibilityProperty:true}))return[];e.dataset.probe=String(at)
const a=e instanceof HTMLAnchorElement?e:null,raw=a?a.getAttribute('href'):null,f=e.form,sub=!!f&&(e instanceof HTMLButtonElement?e.type==='submit':['submit','image'].includes(e.type)),kind=a?'link':e.getAttribute('role')||e.tagName.toLowerCase()
const said=(e.getAttribute('aria-label')??e.innerText??'').trim().split('\\n'),name=((said.find((l)=>/[\\p{L}\\p{N}]{2}/u.test(l))??said[0])||e.value||e.title||kind).replace(/\\s+/g,' ').slice(0,40)
return[{at:at++,name,kind,to:a&&raw&&!/^\\s*(#|javascript:)/i.test(raw)?raw:null,off:e.matches(':disabled')||e.getAttribute('aria-disabled')==='true',invalid:sub&&!f.checkValidity(),key:kind+' '+name+' '+(raw??'')}]})}
const fill=()=>{const set=(f,v)=>{f.value=v;f.dispatchEvent(new Event('input',{bubbles:true}));f.dispatchEvent(new Event('change',{bubbles:true}))},seen=new Set(),day=new Date(Date.now()+7*864e5).toISOString().slice(0,10)
for(const f of document.querySelectorAll('input,select,textarea')){if(f.disabled||f.readOnly||['hidden','file','submit','button','reset','image','range','color'].includes(f.type))continue
if(f.type==='checkbox'){if(f.required&&!f.checked){f.checked=true;f.dispatchEvent(new Event('change',{bubbles:true}))}continue}
if(f.type==='radio'){if(!seen.has(f.name)&&!document.querySelector('input[type=radio][name="'+CSS.escape(f.name)+'"]:checked')){f.checked=true;f.dispatchEvent(new Event('change',{bubbles:true}))}seen.add(f.name);continue}
if(f.value)continue;if(f instanceof HTMLSelectElement){const o=[...f.options].find((o)=>o.value&&!o.disabled);if(o)set(f,o.value);continue}
const v={email:'sara@example.com',tel:'0612345678',url:'https://example.com',number:f.min||'1',date:day,time:'10:00','datetime-local':day+'T10:00',month:day.slice(0,7)}[f.type]??(f.placeholder||'Sara Martin');set(f,f.minLength>v.length?v.padEnd(f.minLength,'.'):v)}}
const shown=()=>[document.body.innerText,document.body.outerHTML.replace(/ data-probe="\\d+"/g,''),[...document.querySelectorAll('input,select,textarea')].map((f)=>f.type==='checkbox'||f.type==='radio'?f.checked:f.value).join('|')].join('#')
addEventListener('load',async()=>{await wait(100);fill();let L=list();if(!T)return post({listed:L})
for(const n of T.slice(0,-1)){document.querySelector('[data-probe="'+n+'"]')?.click();await wait(250);L=list()}
const e=document.querySelector('[data-probe="'+T.at(-1)+'"]');if(!e)return post({pressed:{gone:true}})
const was=shown(),keys=new Set(L.filter((o)=>!o.off).map((o)=>o.key));e.click();await wait(350)
post({pressed:{changed:shown()!==was,newly:list().filter((o)=>!o.off&&!keys.has(o.key))}})})}</script>`

/** The frame's own picture of its page, as a phone shows its first screen: WebP, or JPEG where the browser writes none (WebKit). */
const SHOOT = `<script>addEventListener('load',()=>setTimeout(async()=>{try{const copy=document.documentElement.cloneNode(true);for(const s of copy.querySelectorAll('script,noscript'))s.remove()
const w=innerWidth,h=innerHeight,image=new Image();image.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="'+w+'" height="'+h+'"><foreignObject width="100%" height="100%">'+new XMLSerializer().serializeToString(copy)+'</foreignObject></svg>')
await image.decode();const c=new OffscreenCanvas(w,h),p=c.getContext('2d');p.fillStyle='#fff';p.fillRect(0,0,w,h);for(const e of [document.documentElement,document.body]){p.fillStyle=getComputedStyle(e).backgroundColor;p.fillRect(0,0,w,h)}p.drawImage(image,0,0)
let b=await c.convertToBlob({type:'image/webp',quality:0.7});if(b.type!=='image/webp')b=await c.convertToBlob({type:'image/jpeg',quality:0.75});const r=new FileReader();r.onload=()=>parent.postMessage({shot:String(r.result)},'*');r.readAsDataURL(b)}catch{parent.postMessage({shot:''},'*')}},250))</script>`

/**
 * One page in a frame out of sight, its probe and Jean's script ahead of it; what its frame said until it answered, or nothing after a while.
 * @param {string} page @param {string} search @param {string} script @param {AbortSignal} [signal] @param {boolean} [wide] at a computer's width, for a picture @returns {Promise<Record<string, any>>}
 */
function framed(page, search, script, signal, wide) {
  const box = Object.assign(document.createElement('div'), { className: 'site-test proto-test', inert: true }), frame = Object.assign(document.createElement('iframe'), { src: FRAME })
  frame.setAttribute('sandbox', PAGE_SANDBOX)
  box.setAttribute('aria-hidden', 'true')
  box.style.inlineSize = wide ? '1280px' : '390px', box.style.blockSize = wide ? '800px' : '844px'
  const said = /** @type {Record<string, any>} */ ({})
  return new Promise((resolve) => {
    const done = () => { clearTimeout(timer); removeEventListener('message', heard); signal?.removeEventListener('abort', done); box.remove(); resolve(said) }
    const heard = (/** @type {MessageEvent} */ { source, data }) => {
      if (source !== frame.contentWindow || !data || typeof data !== 'object') return
      Object.assign(said, data.open ? { open: String(data.open) } : data)
      if (data.listed || data.pressed || data.left || 'shot' in data) done()
    }
    const timer = setTimeout(done, 4000)
    signal?.addEventListener('abort', done)
    addEventListener('message', heard)
    frame.addEventListener('load', () => frame.contentWindow?.postMessage({ page: script + ahead(search) + page, policy: policy() }, '*'), { once: true })
    box.append(frame)
    document.body.append(box)
  })
}

/**
 * Pressing every control from index.html on: where each leads, what does nothing, the pages nobody reaches; nothing when pages may run
 * no script, which pressing needs. @param {Map<string, Uint8Array>} files @param {string[]} screens its pages @param {AbortSignal} [signal]
 * @returns {Promise<{ flow?: Flow, problems: string[] }>}
 */
export async function pressed(files, screens, signal) {
  if (!rights.peek().allows.scripts || !files.has('index.html')) return { problems: [] }
  const pages = new Map(), html = async (/** @type {string} */ path) => pages.get(path) ?? pages.set(path, await pageOf(files, path)).get(path)
  /** @type {Map<string, string>} each page reached, by the address it was first reached at */
  const firsts = new Map([['index.html', '']]), leads = /** @type {Map<string, Set<string>>} */ (new Map()), queue = ['index.html'], by = /** @type {Record<string, [string, string]>} */ ({})
  const problems = /** @type {string[]} */ ([]), dead = /** @type {string[]} */ ([])
  let [followed, presses, unsure] = [0, 0, 0]
  /** Where an address from a page leads: one of its pages, reached; or a page it hasn't, said; or null, elsewhere. @param {string} from @param {string} href @param {string} name */
  const lead = (from, href, name) => {
    const base = new URL(from, SITE), to = new URL(href, base), here = to.origin === base.origin, path = here ? reach(files, decodeURIComponent(to.pathname.slice(1))) : null
    if (here && !path?.endsWith('.html')) return void problems.push(`${from}: “${name}” leads to ${decodeURIComponent(to.pathname.slice(1))}, which isn't in the prototype`)
    if (!path || path === from) return
    leads.set(from, (leads.get(from) ?? new Set()).add(path))
    if (!firsts.has(path)) firsts.set(path, to.search), (by[path] = [from, name]), queue.push(path)
  }
  while (queue.length && firsts.size <= PAGES && !signal?.aborted) {
    const page = /** @type {string} */ (queue.shift()), search = /** @type {string} */ (firsts.get(page))
    const { listed } = await framed(await html(page), search, probe(null), signal)
    if (!listed) { problems.push(`${page}: it didn't load`); continue }
    /** @type {{ path: number[], control: Control }[]} */
    const deeper = [], seen = new Set()
    const press = async (/** @type {number[]} */ path, /** @type {Control} */ control) => {
      const said = await framed(await html(page), search, probe(path), signal)
      presses++
      if (said.open) lead(page, said.open, control.name)
      else if (said.left) problems.push(`${page}: “${control.name}” leaves the page by its own script, which Jean's frame can't follow; make it a link, or a form whose action is the next page`)
      else if (!said.pressed || said.pressed.gone) unsure++
      else if (!said.pressed.changed) dead.push(`${page}: “${control.name}” (${control.kind}) does nothing a person sees; make it lead to a page or change this one`)
      else if (path.length === 1) for (const one of /** @type {Control[]} */ (said.pressed.newly)) if (!seen.has(one.key)) seen.add(one.key), deeper.push({ path: [...path, one.at], control: one })
    }
    for (const control of /** @type {Control[]} */ (listed)) {
      if (control.to) { if (!/^(mailto|tel|sms):/i.test(control.to)) followed++, lead(page, control.to, control.name) }
      else if (control.invalid) unsure++
    }
    for (const control of /** @type {Control[]} */ (listed).filter((one) => !one.to && !one.off && !one.invalid).slice(0, PRESSES)) await press([control.at], control)
    for (const { path, control } of deeper.slice(0, DEEPER)) control.to ? (followed++, lead(page, control.to, control.name)) : await press(path, control)
  }
  for (const page of screens) if (!firsts.has(page)) problems.push(`${page}: nobody reaches it from index.html; lead to it from the page before`)
  const reached = [...firsts.keys()]
  const flow = { screens, reached, followed, pressed: presses, dead: [...new Set(dead)], unsure, errors: 0, leads: /** @type {[string, string[]][]} */ (reached.map((page) => [page, [...leads.get(page) ?? []]])), at: Object.fromEntries(firsts), by }
  return { flow, problems: [...new Set([...problems, ...flow.dead])] }
}

/** Pictures drawn this session, by their page as put together: a change draws only what it changed. @type {Map<string, Promise<string>>} */
const drawn = new Map()
/** A page's still picture as a phone shows its first screen, or a computer, drawn once for what it holds. @param {Map<string, Uint8Array>} files @param {string} path @param {string} [search] @param {boolean} [wide] */
export async function picture(files, path, search = '', wide = false) {
  const page = await pageOf(files, path), key = `${wide}${search}\n${page}`
  if (!drawn.has(key)) drawn.set(key, framed(page, search, SHOOT, undefined, wide).then((said) => String(said.shot ?? ''))), drawn.size > 64 && drawn.delete(/** @type {string} */ (drawn.keys().next().value))
  return /** @type {Promise<string>} */ (drawn.get(key))
}
