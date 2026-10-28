import { guard } from './guard.mjs'
// Spike parent: Jean's side. Writes a game's page into preview.html, lends engines, collects the report.
const POLICY = "default-src 'none'; script-src 'unsafe-inline' data: blob: 'wasm-unsafe-eval'; style-src 'unsafe-inline'; img-src data: blob:; media-src data:; font-src data:; connect-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'"
const ENGINES = { phaser: 'vendor/phaser.mjs', phaser3: 'vendor/phaser3.mjs', zzfx: 'vendor/zzfx.mjs', babylon: 'vendor/babylon.mjs' }
const texts = new Map()
const text = (path) => texts.get(path) ?? texts.set(path, fetch(path).then((r) => r.text())).get(path)
const names = (source) => {
  const at = source.lastIndexOf('export{') >= 0 ? source.lastIndexOf('export{') : source.lastIndexOf('export {')
  const list = source.slice(source.indexOf('{', at) + 1, source.indexOf('}', at))
  return list.split(',').map((one) => one.trim().split(/\s+as\s+/).pop()).filter((n) => /^[\w$]+$/.test(n))
}
const stands = new Map()
const stand = async (need) => {
  if (stands.has(need)) return stands.get(need)
  const exported = names(await text(ENGINES[need]))
  const own = exported.filter((n) => n !== 'default')
  const code = `const text=await new Promise((r)=>{addEventListener('message',function got({data,source}){if(source===parent&&data?.lent===${JSON.stringify(need)})removeEventListener('message',got),r(data.text)});parent.postMessage({need:${JSON.stringify(need)}},'*')})
const m=await import(URL.createObjectURL(new Blob([text],{type:'text/javascript'})))
export const {${own.join(',')}}=m
export default ${exported.includes('default') ? 'm.default' : 'm'}`
  const url = `data:text/javascript;charset=utf-8,${encodeURIComponent(code)}`
  stands.set(need, url)
  return url
}

const host = document.getElementById('host')
let shell
window.kept = { keep: null, storage: null }
window.run = async ({ game, code: given, engine = 'phaser', test = null, visible = false, allow = 'fullscreen *; gamepad *', saved = null, storage = null, timeout = 20000, lang = 'en' }) => {
  shell ??= await text('shell.mjs')
  const code = guard(given ?? await fetch(`games/${game}.mjs`, { cache: 'no-store' }).then((r) => r.text()), '__loop()')
  const imports = {}
  for (const need of Object.keys(ENGINES)) imports[need] = await stand(need)
  imports.phaser = await stand(engine === 'phaser3' ? 'phaser3' : 'phaser')
  host.className = visible ? 'visible' : 'clip'
  const frame = document.createElement('iframe')
  frame.setAttribute('sandbox', 'allow-scripts allow-forms')
  frame.setAttribute('allow', allow)
  frame.src = 'preview.html'
  host.replaceChildren(frame)
  await new Promise((resolve) => { frame.onload = resolve })
  const dir = ['ar', 'he', 'fa', 'ur'].includes(lang) ? 'rtl' : 'ltr'
  const page = `<html lang="${lang}" dir="${dir}"><meta charset="utf-8"><script type="importmap">${JSON.stringify({ imports })}</script><script>window.__test=${JSON.stringify(test)};window.__saved=${JSON.stringify(saved)};window.__storage=${JSON.stringify(storage)}</script><script>${shell}</script><style>html,body{margin:0;block-size:100%;overflow:hidden;background:#111}#stage{position:fixed;inset:0}</style><body><div id="stage"></div><script type="text/x-game" id="game">${code.replaceAll('</script', '<\\/script')}</script>`
  const t0 = performance.now()
  return new Promise((resolve) => {
    let progress = 0
    const done = (r) => { removeEventListener('message', on); clearTimeout(timer); resolve({ ...r, ...(r.timeout && { frames: progress }), parentWall: Math.round(performance.now() - t0) }) }
    const on = ({ data, source }) => {
      if (source !== frame.contentWindow) return
      if (typeof data?.need === 'string' && ENGINES[data.need]) void text(ENGINES[data.need]).then((t) => source.postMessage({ lent: data.need, text: t }, '*'))
      else if (typeof data?.keep === 'string') window.kept.keep = data.keep
      else if (typeof data?.keepStorage === 'string') window.kept.storage = data.keepStorage
      else if (Number.isFinite(data?.progress)) progress = data.progress
      else if (data?.report) done(data.report)
    }
    addEventListener('message', on)
    const timer = setTimeout(() => done({ timeout: true }), timeout)
    frame.contentWindow.postMessage({ page, policy: POLICY }, '*')
  })
}
window.ready = true
