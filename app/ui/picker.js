// The brain picker, a menu above the chip in the box (docs/product.md, "Brains: picker and Auto"):
// Auto, Fast / Smart / Best from the connected provider, every other brain of the room's project
// (D194), then "Keep on this device" while one is in the cloud, and all brains. One line each,
// an icon and a name; the real name and a plain cost show on hover. Kept on this device, the cloud's brains aren't offered,
// and a project kept there keeps the switch on.
import { html, nothing } from 'lit-html'
import { signal } from '@preact/signals-core'
import { Element, define } from './base.js'
import { app, effective, activeBrain, brainsHere, updateSettings, loadModels, cloudAllowed } from './state.js'
import { useBrain, keepOnDevice } from './brains.js'
import { openSettings } from './dialogs.js'
import { TIERS, isLocal } from './auto.js'
import { t, intlLocales } from '../core/i18n.js'
import { icons } from './menu-icons.js'
import { priceOf, PLANS } from './prices.js'
import { mayRead } from '../core/llm.js'

/** @typedef {import('../core/types.js').BrainConfig} BrainConfig */
/** @typedef {import('../core/types.js').Envelope} Envelope */

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
const pick = (brain, model) => updateSettings({ auto: false }).then(() => useBrain(brain.id, model))

/** "about $0.003 per answer", from the provider's own prices, or models.dev's. @param {import('../core/types.js').ModelInfo['pricing']} pricing */
export function cost(pricing) {
  const { prompt, completion } = pricing ?? {}
  if (prompt === undefined || completion === undefined || Number.isNaN(prompt + completion)) return ''
  const amount = new Intl.NumberFormat(intlLocales(), { style: 'currency', currency: 'USD', maximumSignificantDigits: 2 }).format(READ * prompt + WRITTEN * completion)
  return t('picker.cost', { cost: amount })
}

/**
 * What the picker offers besides Auto, as a routine's own brain does too (D303): Fast, Smart and Best from the
 * connected provider, then every other brain of the room's project (D194), each with what is behind it, its
 * price once `priced`; none in the cloud while messages are kept on this device, and for a task's records,
 * only those that may read it (D440). @param {boolean} [priced] @param {Envelope[]} [records]
 * @returns {{ icon: unknown, label: string, behind: string, brain: BrainConfig, model: string, tier?: boolean }[]}
 */
export function choices(priced = false, records = []) {
  const cloud = cloudAllowed()
  const may = (/** @type {BrainConfig | null} */ brain) => brain && (cloud || isLocal(brain)) && mayRead(brain, records, app.policy)
  const brains = brainsHere.value.filter(may)
  const remote = cloud ? [activeBrain.value, ...brains].find((brain) => may(brain) && !isLocal(brain)) : undefined
  const models = remote ? app.models.value[remote.id] ?? [] : []
  const tiers = remote ? /** @type {Record<string, string[]>} */ (app.policy.tiers ?? TIERS)[remote.provider] ?? [] : []
  const offered = tiers.filter((model) => models.some((info) => info.id === model))
  const plan = remote && PLANS[remote.provider]
  return [
    ...(remote ? offered.map((model) => ({ icon: TIER_ICONS[tiers.indexOf(model)], label: t(`picker.${TIER_NAMES[tiers.indexOf(model)]}`), brain: remote, model, tier: true,
      behind: [short(model), plan ? t('picker.plan', { plan }) : priced && cost(priceOf(remote.provider, model, models.find((info) => info.id === model)?.pricing))].filter(Boolean).join(' · ') })) : []),
    ...brains.filter((brain) => !(brain === remote && offered.includes(brain.model))).map((brain) => (brain.api === 'device'
      ? { icon: icons['brain-device'], label: t('brain.device.title'), behind: t('brain.device.private'), brain, model: brain.model }
      : { icon: isLocal(brain) ? icons['brain-device'] : icons.cloud, label: short(brain.model), behind: t(`provider.${brain.provider}`), brain, model: brain.model })),
  ]
}

/**
 * One choice: its icon and its name, what is behind it on hover; the one answering is ticked.
 * @param {unknown} icon @param {string} label @param {string} behind @param {boolean} selected @param {() => unknown} choose
 */
const option = (icon, label, behind, selected, choose) => html`<button type="button" popovertarget="brain-menu" popovertargetaction="hide"
  title=${behind || nothing} aria-current=${selected ? 'true' : 'false'} @click=${choose}>${icon}<span><bdi>${label}</bdi></span>${selected ? icons.check : nothing}</button>`

class Picker extends Element {
  /** Prices are read once the menu opens, never before. */
  #open = signal(false)

  render() {
    const { settings } = effective.value
    const active = activeBrain.value
    const brains = brainsHere.value
    const manual = (/** @type {BrainConfig} */ brain, /** @type {string} */ model) => !settings.auto && active?.id === brain.id && active.model === model
    const kept = app.project.value.data.cloud === false
    return html`<div id="brain-menu" class="menu brain-menu" popover
      @toggle=${(/** @type {ToggleEvent} */ e) => (this.#open.value = e.newState === 'open') && brains.forEach((brain) => isLocal(brain) || loadModels(brain))}>
      ${option(icons.brain, t('auto.name'), t('auto.text'), settings.auto, () => updateSettings({ auto: true }))}
      ${choices(this.#open.value, app.current.value?.records).map(({ icon, label, behind, brain, model }) => option(icon, label, behind, manual(brain, model), () => pick(brain, model)))}
      <hr>
      ${[active, ...brains].some((brain) => brain && !isLocal(brain)) ? html`<button type="button" role="switch" aria-checked=${kept || !settings.cloud ? 'true' : 'false'}
        ?disabled=${kept} title=${kept ? t('picker.projectKept') : nothing} @click=${() => keepOnDevice(settings.cloud)}>${icons.shield}<span>${t('picker.keepOnDevice')}</span></button>` : nothing}
      <button type="button" popovertarget="brain-menu" popovertargetaction="hide" @click=${() => openSettings('brains')}>${icons.gear}<span>${t('picker.all')}</span></button>
    </div>`
  }
}

define('app-picker', Picker)
