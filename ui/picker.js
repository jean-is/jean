// The brain picker behind the chip in the box (docs/product.md, "Brains: picker and Auto"):
// Auto, this device, Fast / Smart / Best from the connected provider with the real name in
// small print and a plain cost, every other brain, and "never send to the cloud": those of the
// room's project (D194).
import { html, nothing } from 'lit-html'
import { Element, define } from './base.js'
import { app, effective, activeBrain, brainsHere, brainLabel, setBrainMode, loadModels } from './state.js'
import { useBrain } from './brains.js'
import { syncDialog, closed, close, backdrop, head, openSettings } from './dialogs.js'
import { TIERS, isLocal } from './auto.js'
import { t, locale } from '../core/i18n.js'
import { icons } from './icons.js'

/** @typedef {import('../core/types.js').BrainConfig} BrainConfig */

const TIER_NAMES = ['fast', 'smart', 'best']
// A typical answer: about 3,000 tokens read and 600 written.
const READ = 3000
const WRITTEN = 600

/** @param {BrainConfig} brain @param {string} model */
async function pick(brain, model) {
  await setBrainMode({ auto: false })
  await useBrain(brain.id, model)
  close()
}

/** "about $0.003 per answer", from the provider's own prices. @param {import('../core/types.js').ModelInfo | undefined} info */
function cost(info) {
  const { prompt, completion } = info?.pricing ?? {}
  if (prompt === undefined || completion === undefined || Number.isNaN(prompt + completion)) return ''
  const amount = new Intl.NumberFormat(locale.value, { style: 'currency', currency: 'USD', maximumSignificantDigits: 2 }).format(READ * prompt + WRITTEN * completion)
  return t('picker.cost', { cost: amount })
}

/**
 * @param {string} label @param {string} detail small print @param {boolean} selected
 * @param {() => void} choose @param {unknown} [icon]
 */
const option = (label, detail, selected, choose, icon = icons.spark) => html`<li>
  <button class="choice-option ${selected ? 'is-selected' : ''}" aria-pressed=${selected ? 'true' : 'false'} @click=${choose}>
    ${icon}<span><strong>${label}</strong>${detail ? html`<small dir="auto">${detail}</small>` : nothing}</span>${selected ? icons.check : nothing}
  </button>
</li>`

class Picker extends Element {
  render() {
    const { settings } = effective.value
    const active = activeBrain.value
    const brains = brainsHere.value
    const remote = [active, ...brains].find((brain) => brain && !isLocal(brain))
    const models = remote ? app.models.value[remote.id] ?? [] : []
    const tiers = remote ? /** @type {Record<string, string[]>} */ (app.policy.tiers ?? TIERS)[remote.provider] ?? [] : []
    const offered = tiers.filter((model) => models.some((info) => info.id === model))
    const manual = (/** @type {BrainConfig} */ brain, /** @type {string} */ model) => !settings.auto && active?.id === brain.id && active.model === model
    return html`<dialog class="sheet picker" @close=${closed('picker')} @click=${backdrop}>
      ${head(t('picker.title'))}
      <ul class="choices">
        ${option(t('auto.name'), t('auto.text'), settings.auto, () => setBrainMode({ auto: true }).then(close))}
        ${remote ? offered.map((model) => option(t(`picker.${TIER_NAMES[tiers.indexOf(model)]}`), [model, cost(models.find((info) => info.id === model))].filter(Boolean).join(' · '),
          manual(remote, model), () => pick(remote, model))) : nothing}
        ${brains.filter((brain) => !(brain === remote && offered.includes(brain.model))).map((brain) => option(
          brain.api === 'device' ? t('brain.device.title') : brainLabel(brain),
          brain.api === 'device' ? t('brain.device.private') : isLocal(brain) ? t('picker.local') : '',
          manual(brain, brain.model), () => pick(brain, brain.model), brain.api === 'device' ? icons.chip : icons.computer))}
      </ul>
      <label class="toggle">
        <input type="checkbox" .checked=${!settings.cloud} @change=${(/** @type {Event} */ e) => setBrainMode({ cloud: !(/** @type {HTMLInputElement} */ (e.target).checked) })}>
        <span>${t('picker.neverCloud')}</span>
      </label>
      <button class="button subtle wide" @click=${() => openSettings('brains')}>${t('picker.all')} ${icons.arrow}</button>
    </dialog>`
  }

  updated() {
    syncDialog(this, 'picker')
    if (app.dialog.value === 'picker') for (const brain of brainsHere.value) if (!isLocal(brain)) loadModels(brain)
  }
}

define('app-picker', Picker)
