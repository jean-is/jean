// A share, opened (D361, docs/sharing.md): the host's viewer, which the render package carries. It
// reads the share's id from the address and its secret from after the `#`, which never left the
// browser, asks for the password when there is one, opens the sealed copy, and draws it as a task
// saved as a web page draws itself (D305), in the host's frame, an opaque origin, with nothing from the
// internet but the render package, a score's instruments and the host's map service. A share reaches
// nothing its sharer chose. Continue in Jean brings it into the person's own Jean.
import { html, render, nothing } from 'lit-html'
import { t, useLocale, useStrings, setLoader, pickLocale, LOCALES, locale, dir } from '../../core/i18n.js'
import { pageOf, readerAt } from '../../ui/export.js'
import { openValue, materialOf, keysOf, bytesOf, base64url, isPart } from './seal.js'

/** What the host says of itself (host/host.js): where shares' packages are, the map service, where Continue opens, the legal notice, its name. */
const host = JSON.parse(document.getElementById('host')?.textContent || '{}')
setLoader(async (lang, part) => {
  const response = await fetch(new URL(`../../locales/${part && `${part}/`}${lang}.json`, import.meta.url))
  return response.ok ? response.json() : null
})
await useLocale(pickLocale(LOCALES, navigator.languages))
await useStrings('share')
const root = document.documentElement
root.lang = locale.value
root.dir = dir()

const id = location.pathname.slice(1)
const secret = location.hash.slice(1)
/**
 * Where the viewer is: opening; asking for the password, after a wrong one perhaps; the share drawn,
 * with what opens it again, until when, and what its certificates showed; or what went wrong; and
 * whether a report is being written or was sent.
 * @typedef {{ count: number, kept: boolean, seals: string[] }} Sealed
 * @typedef {{ at: 'opening' } | { at: 'password', wrong?: boolean } | { at: 'shown', material: Uint8Array, expires: string, sealed?: Sealed | null } | { at: 'error', error: string }} Step
 */
let step = /** @type {Step} */ ({ at: 'opening' })
let reporting = /** @type {'' | 'writing' | 'sent'} */ ('')
const main = document.body.appendChild(document.createElement('main'))
const frame = Object.assign(document.createElement('iframe'), { title: '', src: '/frame' })
frame.setAttribute('sandbox', 'allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox')
// The page goes to the frame once both are ready: the frame's relay says when it is.
let page = ''
let ready = false
const send = () => { if (ready && page) frame.contentWindow?.postMessage(page, '*') }
addEventListener('message', ({ source, data }) => { if (source === frame.contentWindow && data === 'ready') ready = true, send() })

const STYLE = `:root{color-scheme:light dark;font:1rem/1.5 system-ui,sans-serif}body{margin:0;display:flex;flex-direction:column;height:100dvh}
header{display:flex;flex-wrap:wrap;gap:.5rem 1rem;align-items:center;padding:.5rem 1rem;border-block-end:1px solid #8884}header strong{margin-inline-end:auto}
main{flex:1;display:flex;flex-direction:column}iframe{flex:1;border:0;width:100%}form,.said{max-width:28rem;margin:3rem auto;padding-inline:1rem;display:grid;gap:.75rem}
button,a.button{font:inherit;padding:.4rem .9rem;border-radius:.6rem;border:1px solid #8886;background:none;color:inherit;text-decoration:none;cursor:pointer}
.primary{background:CanvasText;color:Canvas}input,textarea{font:inherit;padding:.4rem;border-radius:.4rem;border:1px solid #8886}small{opacity:.75}[hidden]{display:none}`

/** The sealed copy, with the proof a password's share asks for. @param {string} [access] */
async function fetchCopy(access) {
  const response = await fetch(`/v1/${id}`, { headers: access ? { authorization: `Share ${access}` } : {} })
  if (response.ok) return { sealed: new Uint8Array(await response.arrayBuffer()), expires: response.headers.get('share-expires') ?? '' }
  return { status: response.status, said: await response.json().catch(() => ({})) }
}

/** Opens the share, with its password when it has one. @param {string} [password] */
async function open(password) {
  if (!isPart(id) || !isPart(secret)) return show({ at: 'error', error: 'share.broken' })
  let material = /** @type {Uint8Array} */ (bytesOf(secret))
  let got = await fetchCopy().catch(() => ({ status: 0, said: {} }))
  if ('status' in got && got.status === 401 && typeof got.said.salt === 'string') {
    if (!password) return show({ at: 'password' })
    const salt = bytesOf(got.said.salt)
    material = await materialOf(material, salt, password)
    got = await fetchCopy((await keysOf(material, salt)).access).catch(() => ({ status: 0, said: {} }))
    if ('status' in got && got.status === 401) return show({ at: 'password', wrong: true })
  }
  if ('status' in got) return show({ at: 'error', error: /** @type {Record<number, string>} */ ({ 404: 'share.gone', 410: 'share.removed', 429: 'share.tooMany' })[got.status ?? 0] ?? 'share.unreachable' })
  const value = await openValue(got.sealed, material).catch(() => null)
  if (value?.format !== 1) return show({ at: 'error', error: 'share.broken' })
  show({ at: 'shown', material, expires: got.expires })
  await drawn(value)
  if (step.at === 'shown') show({ ...step, sealed: await sealedOf(value) })
}

/**
 * What its answers' certificates show (D274): each intact, its seal's, proving the words of a request
 * and its answer as the share shows them. Null when it carries none. @param {any} value @returns {Promise<Sealed | null>}
 */
async function sealedOf(value) {
  const proofs = /** @type {string[]} */ ((Array.isArray(value.certificates) ? value.certificates : []).filter((/** @type {unknown} */ one) => typeof one === 'string'))
  if (!proofs.length) return null
  const [{ check }, { foldTurns, splitSuggestions }] = await Promise.all([import('../receipt/certificate.js'), import('../../core/events.js')])
  const turns = foldTurns(String(value.file ?? '').split('\n').slice(1).flatMap((line) => { try { return [JSON.parse(line)] } catch { return [] } }))
  const read = await Promise.all(proofs.map((proof) => check({ proof }).catch(() => null)))
  const kept = read.every((one) => {
    const turn = turns.find((each) => each.at === one?.says?.credentialSubject?.request?.at)
    return Boolean(one?.intact && one.proven && turn) && one?.words?.request === (turn?.user?.text ?? '')
      && one?.words?.answer === splitSuggestions(turn?.steps.map((each) => each.text).filter(Boolean).join('\n\n') ?? '').text
  })
  return { count: read.length, kept, seals: [...new Set(read.flatMap((one) => (one ? [one.fingerprint] : [])))] }
}

/**
 * The share's page, as its saved copy would be (D305), drawn with the render package at the host's
 * address for the version it names, its pages offline whatever the sharer allowed, maps through the
 * host's own service; then sent to the frame once it is ready. @param {any} value
 */
async function drawn(value) {
  const { drawing } = value
  const known = drawing && host.render && /^[\w.+-]+$/.test(drawing.render?.version ?? '')
  const reader = known ? readerAt(host.render.replace('{version}', drawing.render.version), { ...drawing, settings: { ...drawing.settings, pages: { ...drawing.settings?.pages, web: false, network: false } } }, {
    instruments: host.sounds && /^[\w.+-]+$/.test(drawing.sounds ?? '') ? host.sounds.replace('{version}', drawing.sounds) : null,
    styles: drawing.maps && host.maps ? host.maps : null,
  }) : null
  frame.title = String(value.title ?? '')
  document.title = String(value.title || host.name)
  page = await pageOf(String(value.file ?? ''), String(value.title ?? ''), LOCALES.includes(value.lang) ? value.lang : 'en', { reader, pictures: value.pictures ?? {} })
  send()
}

/** @param {Step} next */
function show(next) {
  step = next
  draw()
}

/** A report: what is wrong, and the whole link when the reporter agrees, so whoever runs the host can see it. @param {SubmitEvent} event */
async function report(event) {
  event.preventDefault()
  const typed = new FormData(/** @type {HTMLFormElement} */ (event.target))
  const sent = await fetch(`/v1/${id}/report`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ words: typed.get('words'), ...(typed.get('link') && { link: location.href }) }) }).catch(() => null)
  reporting = sent?.ok ? 'sent' : 'writing'
  draw()
}

/** Continue in Jean: the person's own Jean brings it in, with what opens it, after `#` again. */
const elsewhere = () => (step.at === 'shown' && host.app ? `${host.app.replace(/#.*$/, '')}#/shared/${id}/${base64url(step.material)}` : '')

function draw() {
  const when = step.at === 'shown' && step.expires ? new Intl.DateTimeFormat(locale.value, { dateStyle: 'long' }).format(new Date(step.expires)) : ''
  render(html`<style>${STYLE}</style>
    <header>
      <strong>${t('share.from', { name: host.name ?? '' })}</strong>
      ${when ? html`<small>${t('share.until', { date: when })}</small>` : nothing}
      ${step.at === 'shown' && step.sealed ? html`<small role="status">${step.sealed.kept ? t('share.sealed', { count: step.sealed.count }) : t('share.unsealed')}
        ${step.sealed.seals.map((seal) => html`<code dir="ltr" title=${t('share.seal')}>${seal.slice(0, 16).match(/.{1,4}/g)?.join(' ')}</code>`)}</small>` : nothing}
      ${elsewhere() ? html`<a class="button primary" href=${elsewhere()} target="_blank" rel="noopener noreferrer">${t('share.continue', { name: host.name ?? '' })}</a>` : nothing}
      ${step.at === 'shown' ? html`<button @click=${() => { reporting = reporting ? '' : 'writing'; draw() }}>${t('share.report')}</button>` : nothing}
      ${host.legal ? html`<a href=${host.legal} target="_blank" rel="noopener noreferrer">${t('share.legal')}</a>` : nothing}
    </header>
    ${reporting === 'writing' ? html`<form @submit=${report}>
      <label for="words">${t('share.reportWhat')}</label>
      <textarea id="words" name="words" rows="4" required maxlength="5000" dir="auto"></textarea>
      <label><input type="checkbox" name="link" checked> ${t('share.reportLink')}</label>
      <button class="primary">${t('share.reportSend')}</button>
    </form>` : reporting === 'sent' ? html`<p class="said" role="status">${t('share.reportSent')}</p>` : nothing}
    ${step.at === 'password' ? html`<form @submit=${(/** @type {SubmitEvent} */ event) => { event.preventDefault(); show({ at: 'opening' }); open(String(new FormData(/** @type {HTMLFormElement} */ (event.target)).get('password'))) }}>
      <label for="password">${t('share.password')}</label>
      <input id="password" name="password" type="password" autocomplete="off" required autofocus>
      ${step.wrong ? html`<p role="alert">${t('share.wrong')}</p>` : nothing}
      <button class="primary">${t('share.open')}</button>
    </form>` : step.at === 'error' ? html`<p class="said" role="alert">${t(step.error)}</p>` : step.at === 'opening' ? html`<p class="said" role="status">${t('share.opening')}</p>` : nothing}`, document.body, { renderBefore: main })
  main.hidden = step.at !== 'shown'
  if (step.at === 'shown' && !frame.isConnected) main.append(frame)
}

draw()
await open()
