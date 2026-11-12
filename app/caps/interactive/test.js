// SPDX-License-Identifier: MIT
// Apps played before the turn ends (D689): each page with a script that a step of an answer wrote is played out of sight, as
// Games plays a game (D648), in a frame of its kind (preview.html), given what it kept: what goes wrong is caught as it starts,
// then as each of its controls is used once, its buttons pressed and its fields changed; nothing it sends or saves goes anywhere.
// What broke, in the browser's words, goes back to the brain, which writes it again (turn.answer, core/loop.js).
import { app } from '../../ui/state.js'
import { pagePolicy, pageRights, PAGE_SANDBOX } from '../../ui/csp.js'
import { lex } from '../../ui/markdown.js'
import { head, library, part, LENT, named, keptAt } from './interactive.js'
import { parse } from './parts.js'

/** How long a page has to start, before its controls are used, and in all. */
const [START, ALL] = [800, 6000]
/** The notes each turn may give, so that a page the brain can't mend doesn't take all its steps. @type {WeakMap<AbortSignal, number>} */
const told = new WeakMap()

/**
 * What catches what goes wrong, ahead of the page, and uses its controls when told (its buttons pressed, its fields but a file's
 * changed): errors and failures left unhandled, each said once, in the browser's words. Its listeners' errors are caught as they
 * run, as WebKit tells the page no more than "Script error." of what a written script throws. What its policy blocks isn't a
 * fault: a fetch the page catches works offline, and WebKit's policy refuses every <select>'s style.
 */
const PROBE = /* html */ `<script>{const faults=[],fault=(words)=>{words=String(words);if(!faults.includes(words))faults.push(words)},add=EventTarget.prototype.addEventListener,remove=EventTarget.prototype.removeEventListener,own=new WeakMap()
EventTarget.prototype.addEventListener=function(type,run,...rest){if(typeof run==='function'&&!own.has(run))own.set(run,function(...args){try{return run.apply(this,args)}catch(e){fault(e?.message??e)}});return add.call(this,type,own.get(run)??run,...rest)}
EventTarget.prototype.removeEventListener=function(type,run,...rest){return remove.call(this,type,own.get(run)??run,...rest)}
add.call(window,'error',(e)=>fault(e.message))
add.call(window,'unhandledrejection',(e)=>fault('Unhandled: '+(e.reason?.message??e.reason)))
for(const name of['alert','confirm','prompt'])globalThis[name]=()=>fault(name+'() is never shown')
add.call(window,'message',({data,source})=>{if(source!==parent||!data?.play)return
for(const one of document.querySelectorAll('button,input:not([type=file]),select,textarea'))one.matches('button')?one.click():(one.dispatchEvent(new Event('input',{bubbles:true})),one.dispatchEvent(new Event('change',{bubbles:true})))
setTimeout(()=>parent.postMessage({faults},'*'),400)})}</script>`

/**
 * One page played: what went wrong, each once; nothing when it played clean or didn't answer in time.
 * @param {string} source @param {Record<string, string>} storage what it kept @param {AbortSignal} [signal] @returns {Promise<string[]>}
 */
function play(source, storage, signal) {
  const { allows, sites } = pageRights(app.settings.peek(), app.policy)
  const box = Object.assign(document.createElement('div'), { className: 'page-test', inert: true }), frame = Object.assign(document.createElement('iframe'), { src: new URL('../../preview.html', import.meta.url).href })
  frame.setAttribute('sandbox', PAGE_SANDBOX)
  box.setAttribute('aria-hidden', 'true')
  return new Promise((resolve) => {
    const done = (/** @type {string[]} */ faults) => { clearTimeout(timer); removeEventListener('message', heard); box.remove(); resolve(faults) }
    const heard = (/** @type {MessageEvent} */ { source: from, data }) => {
      if (from !== frame.contentWindow) return
      const answer = (/** @type {object} */ reply) => frame.contentWindow?.postMessage({ ...reply, id: data.id }, '*')
      if (Array.isArray(data?.faults)) done(data.faults.map(String))
      else if (data?.need === 'echarts') void library().then(({ text }) => frame.contentWindow?.postMessage({ echarts: text }, '*'))
      else if (Object.hasOwn(LENT, data?.need)) void part(LENT[data.need]).then((text) => answer({ text }))
      else if (typeof data?.diagram === 'string') answer({})
    }
    const timer = setTimeout(() => done([]), ALL)
    signal?.addEventListener('abort', () => done([]), { once: true })
    addEventListener('message', heard)
    frame.addEventListener('load', async () => {
      const { url } = await library(), ahead = head(getComputedStyle(document.documentElement), url)
      frame.contentWindow?.postMessage({ page: PROBE + ahead + source, policy: pagePolicy(allows, sites, true), storage }, '*')
      setTimeout(() => frame.contentWindow?.postMessage({ play: true }, '*'), START)
    }, { once: true })
    box.append(frame)
    document.body.append(box)
  })
}

/**
 * What the brain is told of the pages with a script its answer just wrote, played; nothing when they all played clean.
 * @param {{ text: string, task?: string, signal?: AbortSignal }} e @returns {Promise<string>}
 */
export async function played({ text, task = '', signal }) {
  const pages = lex(text).flatMap((token) => (token.type === 'code' && token.lang === 'html' && /<script\b/i.test(token.text) && !parse(token.text) ? [token.text] : []))
  if (!pages.length || !signal || (told.get(signal) ?? 0) >= 2) return ''
  const at = keptAt(task), kept = at ? JSON.parse((await app.fs.read(at).catch(() => null)) ?? '{}').apps ?? {} : {}
  const broke = (await Promise.all(pages.map(async (source) => ({ name: named(source), faults: await play(source, kept[named(source)] ?? {}, signal) })))).filter(({ faults }) => faults.length)
  if (!broke.length) return ''
  told.set(signal, (told.get(signal) ?? 0) + 1)
  return `Played out of sight, ${broke.length > 1 ? 'pages you wrote' : 'the page you wrote'} broke:\n${broke.map(({ name, faults }) => `${name ? `${name}:\n` : ''}${faults.map((fault) => `- ${fault}`).join('\n')}`).join('\n')}\nWrite it again whole, fixed, after a sentence saying what you fixed.`
}
