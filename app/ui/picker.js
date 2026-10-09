// The brain picker, a menu above the chip in the box (docs/product.md, "Brains: picker and Auto"):
// Auto, Fast / Smart / Best from the connected provider, every other brain of the room's project
// (D194), then "never send to the cloud" while one is in the cloud, and all brains. One line each,
// an icon and a name; the real name and a plain cost show on hover.
import { html, nothing } from 'lit-html'
import { Element, define } from './base.js'
import { app, effective, activeBrain, brainsHere, brainLabel, setBrainMode, loadModels } from './state.js'
import { useBrain } from './brains.js'
import { openSettings } from './dialogs.js'
import { TIERS, isLocal } from './auto.js'
import { t, locale } from '../core/i18n.js'
import { icons } from './icons.js'

/** @typedef {import('../core/types.js').BrainConfig} BrainConfig */

const TIER_NAMES = ['fast', 'smart', 'best']
const TIER_ICONS = [icons.bolt, icons.lamp, icons.star]
// A typical answer: about 3,000 tokens read and 600 written.
const READ = 3000
const WRITTEN = 600

/** Opens the menu; once this module is in, the chip opens and closes it on its own. */
export const openPicker = () => document.getElementById('brain-menu')?.showPopover()

/** A model's own name, without its maker's: "claude-sonnet-5.5". @param {string} model */
const short = (model) => model.slice(model.lastIndexOf('/') + 1)

/** @param {BrainConfig} brain @param {string} model */
const pick = (brain, model) => setBrainMode({ auto: false }).then(() => useBrain(brain.id, model))

/** "about $0.003 per answer", from the provider's own prices. @param {import('../core/types.js').ModelInfo | undefined} info */
function cost(info) {
  const { prompt, completion } = info?.pricing ?? {}
  if (prompt === undefined || completion === undefined || Number.isNaN(prompt + completion)) return ''
  const amount = new Intl.NumberFormat(locale.value, { style: 'currency', currency: 'USD', maximumSignificantDigits: 2 }).format(READ * prompt + WRITTEN * completion)
  return t('picker.cost', { cost: amount })
}

/**
 * One choice: its icon and its name, what is behind it on hover; the one answering is ticked.
 * @param {unknown} icon @param {string} label @param {string} behind @param {boolean} selected @param {() => unknown} choose
 */
const option = (icon, label, behind, selected, choose) => html`<button type="button" popovertarget="brain-menu" popovertargetaction="hide"
  title=${behind || nothing} aria-current=${selected ? 'true' : 'false'} @click=${choose}>${icon}<span><bdi>${label}</bdi></span>${selected ? icons.check : nothing}</button>`

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
    return html`<div id="brain-menu" class="menu brain-menu" popover
      @toggle=${(/** @type {ToggleEvent} */ e) => e.newState === 'open' && brains.forEach((brain) => isLocal(brain) || loadModels(brain))}>
      ${option(icons.spark, t('auto.name'), t('auto.text'), settings.auto, () => setBrainMode({ auto: true }))}
      ${remote ? offered.map((model) => option(TIER_ICONS[tiers.indexOf(model)], t(`picker.${TIER_NAMES[tiers.indexOf(model)]}`),
        [short(model), cost(models.find((info) => info.id === model))].filter(Boolean).join(' · '), manual(remote, model), () => pick(remote, model))) : nothing}
      ${brains.filter((brain) => !(brain === remote && offered.includes(brain.model))).map((brain) => brain.api === 'device'
        ? option(icons.chip, t('brain.device.title'), t('brain.device.private'), manual(brain, brain.model), () => pick(brain, brain.model))
        : option(isLocal(brain) ? icons.computer : icons.globe, short(brain.model), brainLabel(brain), manual(brain, brain.model), () => pick(brain, brain.model)))}
      <hr>
      ${remote ? html`<button type="button" role="switch" aria-checked=${settings.cloud ? 'false' : 'true'}
        @click=${() => setBrainMode({ cloud: !settings.cloud })}>${icons.shield}<span>${t('picker.neverCloud')}</span></button>` : nothing}
      <button type="button" popovertarget="brain-menu" popovertargetaction="hide" @click=${() => openSettings('brains')}>${icons.gear}<span>${t('picker.all')}</span></button>
    </div>`
  }
}

define('app-picker', Picker)
