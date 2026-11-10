// A link for a phone's camera or another device, the same wherever one goes out (D361, D700, D720, D727): its QR code, the field it is
// copied from, whose button says Copied for two seconds, and the six digits that match two devices or two people, shown on one and typed
// on the other. Only capabilities import this module, so lean-qr's smallest build, their runtime (vendor/lean-qr), loads with them; where
// it isn't installed, there is no code. Its look is dialogs.css's.
import { html, nothing } from 'lit-html'
import { signal } from '@preact/signals-core'
import { icons } from './menu-icons.js'
import { t } from '../core/i18n.js'

const qr = await import(new URL('../vendor/lean-qr/lean-qr.mjs', import.meta.url).href).catch(() => null)
/** Each QR code drawn, by what it holds. @type {Map<string, { size: number, d: string } | null>} */
const codes = new Map()
/** A QR code for an address or words: how many modules to a side, and its dark ones as one path, a square each; null for nothing, too much, or no lean-qr. @param {string} [text] */
export function codeOf(text = '') {
  if (text && qr && !codes.has(text)) try { const { size, get } = qr.generate(text), d = []; for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (get(x, y)) d.push(`M${x} ${y}h1v1h-1z`); codes.set(text, { size, d: d.join('') }) } catch { codes.set(text, null) }
  return codes.get(text) ?? null
}
/** A link's QR code, dark on light in every look, or nothing. @param {string} link @param {string} label what it is, for a screen reader */
export const qrOf = (link, label) => ((code) => (code ? html`<svg class="qr" role="img" aria-label=${label} viewBox="-4 -4 ${code.size + 8} ${code.size + 8}"><path d=${code.d}/></svg>` : nothing))(codeOf(link))

/** What was just copied, which its button says for two seconds; copying words, a link or a password, its button saying so. */
export const [copied, copyText] = [signal(''), (/** @type {string} */ text) => navigator.clipboard.writeText(text).then(() => { copied.value = text; setTimeout(() => { if (copied.peek() === text) copied.value = '' }, 2000) })]
/** A button that copies, its label Copied for a moment. @param {string} text @param {string} label @param {string} [kind] its classes */
export const copyButton = (text, label, kind = 'button') => html`<button type="button" class=${kind} @click=${() => copyText(text)}>${copied.value === text ? icons.check : icons.copy} <span aria-live="polite">${copied.value === text ? t('toast.copied') : label}</span></button>`
/** The link in its box, selected as it is focused, the buttons given before Copy. @param {string} link @param {string} title @param {string} label Copy's @param {...unknown} also */
export const linkField = (link, title, label, ...also) => html`<div class="link-field"><input readonly dir="ltr" title=${title} .value=${link} @focus=${(/** @type {Event} */ e) => /** @type {HTMLInputElement} */ (e.target).select()}>${also}${copyButton(link, label, 'button primary')}</div>`

/** Enter while an IME composes ends the word, never sends. @param {KeyboardEvent} e */
export const composing = (e) => { if (e.isComposing && e.key === 'Enter') e.preventDefault() }
/** Six digits shown, in two threes. @param {string} code */
export const digitsOf = (code) => html`<p class="digits" dir="ltr">${code.slice(0, 3)} ${code.slice(3)}</p>`
/** Only digits, six at most, sent at the sixth unless an IME composes. @param {InputEvent} e */
const digitsIn = (e) => { const box = /** @type {HTMLInputElement} */ (e.target); box.value = box.value.replace(/\D/g, '').slice(0, 6); if (box.value.length === 6 && !e.isComposing) box.form?.requestSubmit() }
/**
 * Six digits typed, in six boxes, sent at the sixth; wrong, selected to type again. @param {string} id @param {string} label @param {string} button
 * @param {(code: string) => Promise<boolean>} check @param {unknown} hint under the boxes, `${id}-hint` @param {...unknown} also beside the button
 */
export const sixDigits = (id, label, button, check, hint, ...also) => html`<form class="stack" @submit=${async (/** @type {SubmitEvent} */ e) => { e.preventDefault(); const box = /** @type {HTMLInputElement} */ (/** @type {HTMLFormElement} */ (e.target).elements.namedItem('code')); if (!(await check(box.value))) box.select() }}>
  <label for=${id}>${label}</label><input id=${id} class="digits-type" name="code" inputmode="numeric" autocomplete="one-time-code" spellcheck="false" dir="ltr" required aria-describedby=${`${id}-wrong ${id}-hint`} @keydown=${composing} @input=${digitsIn}>${hint}<div class="row"><button class="button primary">${button}</button>${also}</div></form>`
