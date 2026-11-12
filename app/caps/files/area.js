// SPDX-License-Identifier: MIT
// A picture's area the person points at (D715): drawn over it with the pointer or a finger, or with the keyboard in thirds
// (the arrows move it, with Shift they size it, Enter asks), then Ask Jean tells the brain of it with the next message, as a
// passage is (D690): its place in percent from the top left, which the brain can cite back as [n: x,y,w,h].
import { html, render, nothing } from 'lit-html'
import { app, notify, assistantName } from '../../ui/state.js'
import { t, useStrings } from '../../core/i18n.js'
import { point } from './files.js'

/** A share of a size, rounded to a tenth. @param {number} n */
const tenth = (n) => Math.round(n * 10) / 10

/** @param {HTMLElement} view what viewOf drew @param {{ uri: string, name: string }} file */
export async function pointable(view, file) {
  const picture = /** @type {HTMLImageElement | null} */ (view.matches('.view-picture') ? view : view.querySelector('.view-picture'))
  if (!picture || picture.closest('.view-marked')) return
  await useStrings('files')
  // Drawn before the pane puts it on the page: wrapped once it is there.
  for (let frames = 0; frames < 120 && !picture.isConnected; frames++) await new Promise(requestAnimationFrame)
  if (!picture.isConnected) return
  const box = Object.assign(document.createElement('div'), { className: 'view-marked area-box', tabIndex: 0 })
  box.setAttribute('role', 'group')
  box.setAttribute('aria-label', t('files.area'))
  picture.replaceWith(box)
  /** The area, [x, y, w, h] in percent, and where a drag began. @type {number[] | null} */
  let area = null, from = /** @type {number[] | null} */ (null)
  const at = (/** @type {PointerEvent} */ e) => { const r = picture.getBoundingClientRect(); return [Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100)), Math.min(100, Math.max(0, ((e.clientY - r.top) / r.height) * 100))] }
  const ask = () => {
    if (!area) return
    const [x, y, w, h] = area.map(tenth)
    point({ text: `The user points at an area of the picture ${file.name} (${file.uri}): ${w}% wide and ${h}% high, ${x}% from its left and ${y}% from its top. Cite it as [n: ${x},${y},${w},${h}], n its source number.`, uri: file.uri, task: app.current.peek()?.path })
    area = null
    draw()
    document.getElementById('prompt')?.focus()
    notify(t('files.pointed', { words: file.name }))
  }
  const draw = () => render(html`${picture}${area ? html`<svg class="view-mark" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
    <path fill-rule="evenodd" d=${`M0 0H100V100H0ZM${area[0]} ${area[1]}h${area[2]}v${area[3]}h${-area[2]}Z`}></path><rect x=${area[0]} y=${area[1]} width=${area[2]} height=${area[3]} vector-effect="non-scaling-stroke"></rect></svg>` : nothing}
    ${area && !from ? html`<div class="area-bar"><button type="button" class="button primary" @click=${ask}>${t('files.askJean', { name: assistantName() })}</button></div>` : nothing}`, box)
  box.addEventListener('pointerdown', (e) => { if (e.target === picture) { e.preventDefault(); box.setPointerCapture(e.pointerId); from = at(e); area = [...from, 0, 0]; draw() } })
  box.addEventListener('pointermove', (e) => { if (!from) return; const [x, y] = at(e); area = [Math.min(x, from[0]), Math.min(y, from[1]), Math.abs(x - from[0]), Math.abs(y - from[1])]; draw() })
  box.addEventListener('pointerup', () => { if (!from) return; from = null; if (area && (area[2] < 2 || area[3] < 2)) area = null; draw() })
  // The keyboard: a third of the picture, moved and sized by thirds, so that a drag is never the only way (RGAA 13.1).
  box.addEventListener('keydown', (e) => {
    const third = 100 / 3, moves = /** @type {Record<string, number[]>} */ ({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] })[e.key]
    if (e.key === 'Enter' && area) return e.preventDefault(), ask()
    if (e.key === 'Escape' && area) return e.preventDefault(), e.stopPropagation(), (area = null), draw()
    if (!moves || e.target !== box) return
    e.preventDefault()
    const [x, y, w, h] = area ?? [third, third, third, third]
    const flip = getComputedStyle(box).direction === 'rtl' && moves[0] ? -1 : 1
    area = e.shiftKey ? [x, y, Math.min(100 - x, Math.max(third, w + flip * moves[0] * third)), Math.min(100 - y, Math.max(third, h + moves[1] * third))]
      : [Math.min(100 - w, Math.max(0, x + flip * moves[0] * third)), Math.min(100 - h, Math.max(0, y + moves[1] * third)), w, h]
    draw()
  })
  draw()
}
