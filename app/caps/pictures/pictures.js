// Pictures and films (D251): made from a description, or from pictures of the conversation, by the
// provider of a connected brain (OpenAI, Gemini, OpenRouter…), by Ollama, or by this device; kept
// in the project's files as Things Jean made are, a name made again being a new version (D164),
// and shown in the answer, ready to save. No studio: they are made where the work is.
import { html, nothing } from 'lit-html'
import { signal } from '@preact/signals-core'
import { register } from '../../ui/caps.js'
import { app, effective, activeBrain, brainsHere, loadModels, cloudAllowed, conversationOf, updateSettings } from '../../ui/state.js'
import { getSecret } from '../../ui/secrets.js'
import { isLocal } from '../../ui/auto.js'
import { styleSheet } from '../../ui/sheet.js'
import { Element, define } from '../../ui/base.js'
import { icons } from '../../ui/icons.js'
import { addFile } from '../../core/files.js'
import { callsIn, filesMade, linkedFiles, isPicture, nextVersion } from '../../core/events.js'
import { slug } from '../../core/settings.js'
import { t, locale, useStrings, formatBytes } from '../../core/i18n.js'
import * as device from './device.js'

/** @typedef {import('../../core/types.js').BrainConfig} BrainConfig */
/** @typedef {import('./device.js').Maker} Maker */
/** @typedef {{ brain: BrainConfig, model: string, lengths?: number[] } | { device: true }} Engine */

await Promise.all([useStrings('pictures'), styleSheet(new URL('pictures.css', import.meta.url))])

/** Models by provider, preferred first: provider identities (D33) that policy replaces (`images`, `films`). */
const MODELS = /** @type {Record<'picture' | 'film', Record<string, string[]>>} */ ({
  picture: { openai: ['gpt-image-1.5', 'gpt-image-1'], gemini: ['gemini-nano-banana-2.1', 'gemini-3-pro-image'], openrouter: ['google/gemini-nano-banana-2.1', 'openai/gpt-5-image'] },
  film: { openai: ['sora-2', 'sora-2-pro'], gemini: ['gemini-omni-1.1-flash'], openrouter: ['google/veo-3.1', 'google/veo-3.1-fast'] },
})
/** Otherwise, a model that says it makes them (OpenRouter's lists), or whose name does. */
const MAKES = { picture: /image|banana|dall-e|flux/i, film: /sora|veo|video|gemini-omni/i }
/** Servers that list picture models without the API to run them: LM Studio has no Images API. */
const UNABLE = ['lmstudio']

/**
 * A model of the brain's provider that makes pictures or films, if its list has one, with the seconds
 * a film can last where the list says. OpenRouter lists its film models apart from the others.
 * @param {BrainConfig} brain @param {'picture' | 'film'} kind @returns {Promise<{ model: string, lengths?: number[] } | undefined>}
 */
async function modelOf(brain, kind) {
  if (UNABLE.includes(brain.provider)) return undefined
  /** @type {{ id: string, output?: string[], lengths?: number[] }[]} */
  const models = kind === 'film' && brain.provider === 'openrouter'
    ? await import('./cloud.js').then(async ({ filmModels }) => filmModels({ brain, apiKey: (await getSecret(app.fs, brain.id)) ?? undefined })).catch(() => [])
    : await loadModels(brain).then(() => app.models.value[brain.id] ?? [])
  const preferred = /** @type {string[]} */ ((app.policy[kind === 'film' ? 'films' : 'images'] ?? MODELS[kind])[brain.provider] ?? [])
  const output = kind === 'film' ? 'video' : 'image'
  const info = preferred.map((id) => models.find((model) => model.id === id)).find(Boolean) ?? models.find((model) => model.output?.includes(output) || MAKES[kind].test(model.id))
  return info && { model: info.id, lengths: info.lengths }
}

/**
 * Who can make it, first to ask first: with a brain on this computer or device answering, the
 * brains on this computer, then this device, then the cloud's; otherwise the brain answering, the
 * others, then this device. This device makes pictures from a description only.
 * @param {'picture' | 'film'} kind @param {boolean} changing @returns {Promise<Engine[]>}
 */
async function engines(kind, changing) {
  const answering = activeBrain.value
  const local = !answering || isLocal(answering)
  const brains = brainsHere.value.filter((brain) => brain.api === 'openai' && (isLocal(brain) || cloudAllowed()))
    .sort((a, b) => Number(b.id === answering?.id) - Number(a.id === answering?.id))
  const [near, far] = local ? [brains.filter(isLocal), brains.filter((brain) => !isLocal(brain))] : [brains, []]
  /** @type {Engine[]} */
  const found = []
  for (const brain of near) await modelOf(brain, kind).then((model) => model && found.push({ brain, ...model }))
  if (kind === 'picture' && !changing && (await looked, device.used())) found.push({ device: true })
  for (const brain of far) await modelOf(brain, kind).then((model) => model && found.push({ brain, ...model }))
  return found
}

/** The conversation's pictures, shared or made, newest first. @param {AbortSignal} [signal] */
function pictures(signal) {
  const conversation = conversationOf(signal)
  const records = conversation?.records ?? []
  return [...linkedFiles(records).filter(isPicture), ...filesMade(callsIn(records, conversation?.turn?.steps)).filter((file) => file.mimeType.startsWith('image/'))].reverse()
}

/** A picture of the conversation by its name, to start from. @param {string} name @param {AbortSignal} [signal] */
async function named(name, signal) {
  const found = pictures(signal).find((file) => file.name.toLowerCase() === name.trim().toLowerCase())
  if (!found) throw new Error(`No picture named "${name}" in this conversation. Pictures: ${[...new Set(pictures(signal).map((file) => file.name))].join(', ') || 'none'}.`)
  const bytes = await app.fs.readBytes(`${app.projectDir}/${found.uri}`)
  if (!bytes) throw new Error(`${found.name} is no longer on this device.`)
  return { name: found.name, mimeType: found.mimeType ?? 'image/png', bytes }
}

/** @param {{ seconds?: unknown }} [args] */
const secondsOf = (args) => Math.min(12, Math.max(4, Math.round(Number(args?.seconds) || 8)))

/**
 * Makes a picture or a film, keeps it in the project's files with its description as its text,
 * and shows it in the answer. @param {'picture' | 'film'} kind @param {any} args @param {import('../../core/loop.js').ToolContext} ctx
 */
async function make(kind, args, ctx) {
  const description = String(args?.description ?? '').trim()
  if (!description) throw new Error(`Describe the ${kind} to make.`)
  const from = await Promise.all([args?.from ?? []].flat().filter(Boolean).map((name) => named(String(name), ctx.signal)))
  const found = await engines(kind, from.length > 0)
  if (!found.length) throw new Error(`None of the connected brains can ${kind === 'film' ? 'make films' : from.length ? 'change pictures' : 'make pictures'}, and this device has none of its own. OpenAI, Gemini and OpenRouter make them, added in Settings › Brains${kind === 'film' ? '' : ', where pictures on this device can be downloaded too'}.`)
  const shape = ['wide', 'tall'].includes(args?.shape) ? args.shape : kind === 'film' ? 'wide' : 'square'
  const cloud = await import('./cloud.js')
  /** @type {{ bytes: Uint8Array, mimeType: string } | undefined} */
  let made
  const failed = []
  // A picture that fails is asked of the next who can make it; a film, which costs, never.
  for (const engine of kind === 'film' ? found.slice(0, 1) : found) {
    try {
      made = 'device' in engine ? await device.paint(description, shape) : await cloud[kind]({ ...engine, apiKey: (await getSecret(app.fs, engine.brain.id)) ?? undefined,
        prompt: description, from, shape, seconds: secondsOf(args), signal: ctx.signal })
      break
    } catch (error) {
      if (ctx.signal?.aborted) throw error
      failed.push(`${'device' in engine ? 'This device' : `${engine.brain.provider} (${engine.model})`}: ${error instanceof Error ? error.message : error}`)
    }
  }
  if (!made) throw new Error(failed.join('\n'))
  const name = `${String(args?.name ?? '').trim().replace(/\.\w+$/, '') || slug(description).slice(0, 40) || kind}.${made.mimeType.split('/')[1].replace('jpeg', 'jpg').replace('quicktime', 'mov')}`
  const link = await addFile(app.fs, { projectDir: app.projectDir, name, mimeType: made.mimeType, bytes: made.bytes, pages: [description], by: 'jean' })
  const conversation = conversationOf(ctx.signal)
  const version = nextVersion(filesMade(callsIn(conversation?.records ?? [], conversation?.turn?.steps)), name, link.uri)
  ctx.meta.picture = { uri: link.uri, name, mimeType: made.mimeType, size: made.bytes.length, version }
  return `Made ${name}${version > 1 ? `, version ${version}: the earlier ones stay` : ''}. The user sees it in your answer.`
}

const shape = { type: 'string', enum: ['square', 'wide', 'tall'] }

/** @type {import('../../core/loop.js').Tool} */
const pictureTool = {
  spec: {
    name: 'picture',
    description: 'Make a picture from a description, or change pictures of this conversation (shared or made) named in from. The user sees it in your answer; making one under the same name again makes a new version.',
    parameters: {
      type: 'object',
      properties: {
        description: { type: 'string', description: 'What it shows, in detail: subject, style, light, colours, any words in it' },
        from: { type: 'array', items: { type: 'string' }, description: 'Names of pictures of this conversation to change or start from' },
        name: { type: 'string', description: 'Its file name, in the user\'s language' },
        shape,
      },
      required: ['description'],
    },
  },
  kind: 'edit',
  title: (args) => `${t('pictures.picture')} · ${args?.description ?? ''}`,
  run: (args, ctx) => make('picture', args, ctx),
}

/** @type {import('../../core/loop.js').Tool} */
const filmTool = {
  spec: {
    name: 'film',
    description: 'Make a short film from a description, or starting from a picture of this conversation. It takes a few minutes and costs far more than a picture, so the user may be asked first. They see it in your answer.',
    parameters: {
      type: 'object',
      properties: {
        description: { type: 'string', description: 'What happens, in detail: subject, action, camera, light, sound' },
        from: { type: 'string', description: 'The name of a picture of this conversation to start from' },
        seconds: { type: 'number', description: 'How long, 4 to 12 seconds; 8 if unsaid' },
        name: { type: 'string', description: 'Its file name, in the user\'s language' },
        shape,
      },
      required: ['description'],
    },
  },
  kind: 'edit',
  title: (args) => `${t('pictures.film')} · ${new Intl.NumberFormat(locale.value, { style: 'unit', unit: 'second', unitDisplay: 'long' }).format(secondsOf(args))} · ${args?.description ?? ''}`,
  // Asked first unless the user said always: then films only, never every change Jean makes (D251).
  check: async () => ({ ask: !effective.value.settings.films, meta: { film: true } }),
  run: async (args, ctx) => {
    if (ctx.answer === 'allow_always') await updateSettings({ films: true })
    return make('film', args, ctx)
  },
}

/** A picture or a film Jean made, read from the project's files, in the user's language as it changes. Attributes, so they survive the upgrade. */
class Picture extends Element {
  #url = signal('')

  render() {
    const [url, name, alt, type] = [this.#url.value, this.getAttribute('name') ?? '', this.getAttribute('alt') ?? '', this.getAttribute('type') ?? '']
    const film = type.startsWith('video/')
    return url ? html`<figure>
      ${film ? html`<video src=${url} controls playsinline aria-label=${alt}></video>` : html`<img src=${url} alt=${alt}>`}
      <a class="icon-button subtle" href=${url} download=${name} aria-label=${t(film ? 'pictures.saveFilm' : 'pictures.savePicture')}>${icons.download}</a>
    </figure>` : nothing
  }

  async connectedCallback() {
    super.connectedCallback()
    const bytes = await app.fs.readBytes(`${app.projectDir}/${this.getAttribute('uri')}`)
    if (bytes && this.isConnected && !this.#url.peek()) this.#url.value = URL.createObjectURL(new Blob([/** @type {BlobPart} */ (bytes)], { type: this.getAttribute('type') ?? '' }))
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    URL.revokeObjectURL(this.#url.peek())
    this.#url.value = ''
  }
}

define('app-picture', Picture)

/** Which of the two this device can run, and whose files are here, looked for once. */
const fit = signal(/** @type {Maker[]} */ ([]))
const looked = Promise.all([device.fitting(), device.look()]).then(([makers]) => { fit.value = makers }, () => {})

/**
 * SD-Turbo's picture (D263), in the Computer's view (D250): an instant camera, its print rising out of the top, a sun
 * over hills on it, and a bolt, quick. The print and the lens light up once it is here; its flash blinks while it comes.
 */
const CAMERA = html`<svg class="art" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
  <path d="M30 43 40.4 37.8V22L30 27.2Z" fill="currentColor" fill-opacity=".5"/><path d="M30 43 9.2 32.6V16.8L30 27.2Z" fill="currentColor" fill-opacity=".32"/>
  <path d="M33.6 25.4 40.4 22 19.6 11.6 12.8 15Z" fill="currentColor" fill-opacity=".18"/><path d="M30 27.2 33.6 25.4 12.8 15 9.2 16.8Z" fill="currentColor" fill-opacity=".18"/>
  <path d="M29.2 23.2 16.8 17V4L29.2 10.2Z" fill="currentColor" fill-opacity=".1"/><path class="screen" d="M28 19.9 18 14.9V5.9L28 10.9Z" fill="currentColor" fill-opacity=".12"/>
  <ellipse cx="24.8" cy="12.4" rx="1.8" ry="1.1" transform="rotate(57.4 24.8 12.4)" fill="currentColor" fill-opacity=".55" stroke="none"/>
  <path d="M18 14.9V13.8L20.2 11 22.8 14.7 25.4 14.2 28 17.9V19.9Z" fill="currentColor" fill-opacity=".45" stroke="none"/><path d="M29.2 23.2V10.2L16.8 4V17"/>
  <path d="M30 36.6 9.2 26.2V24.5L30 34.9Z" fill="currentColor" fill-opacity=".22" stroke="none"/>
  <ellipse cx="19.6" cy="30.3" rx="7.1" ry="4.4" transform="rotate(57.4 19.6 30.3)" fill="currentColor" fill-opacity=".6"/>
  <ellipse class="screen" cx="19.6" cy="30.3" rx="4" ry="2.5" transform="rotate(57.4 19.6 30.3)" fill="currentColor" fill-opacity=".12"/>
  <path class="cursor" d="M14 23.3 11 21.8V19.2L14 20.7Z" fill="currentColor"/><path d="M28.2 30.2 25.6 28.9V26.5L28.2 27.8Z"/>
  <path d="M30 43 40.4 37.8V22L19.6 11.6 9.2 16.8V32.6ZM30 43V27.2L40.4 22M30 27.2 9.2 16.8"/>
  <circle class="badge link" cx="38" cy="38.5" r="5.2" fill="currentColor" fill-opacity=".18"/><path class="on link" d="M38.9 34.9 36.4 38.9H39.6L37.1 42.1" stroke-width="1.2"/>
</svg>`

/**
 * FLUX.2 [klein]'s picture (D263), in the same view: an easel, its canvas leaning on it, hills and a sun painted on it,
 * and a sparkle, fine. The canvas lights up once it is here; the brush's last stroke blinks while it comes.
 */
const EASEL = html`<svg class="art" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
  <path d="M27.4 3 28.7 9.4M32 25.4 33.2 31.3M28.8 43.1 28.2 31.6M27.1 8.5 26.8 2M9.6 33.5 14.4 24.7M24 7 26.8 2" stroke-width="1.4"/>
  <path d="M29.4 32.1 31 31.3 34.4 10.7 32.8 11.5Z" fill="currentColor" fill-opacity=".5"/><path d="M29.4 32.1 12.2 23.5 15.6 2.9 32.8 11.5Z" fill="currentColor" fill-opacity=".14"/>
  <path class="screen" d="M28.1 29.4 14.1 22.4 16.9 5.6 30.9 12.6Z" fill="currentColor" fill-opacity=".12"/>
  <ellipse cx="26.4" cy="14.8" rx="2.5" ry="1.8" transform="rotate(69 26.4 14.8)" fill="currentColor" fill-opacity=".55" stroke="none"/>
  <path d="M29 24.4 26.4 19.2 23.4 20.3 20.4 13.3 15.1 16.6 14.1 22.4 28.1 29.4Z" fill="currentColor" fill-opacity=".3" stroke="none"/>
  <path d="M28.6 26.8 24.4 21.8 18.2 22.4 14.8 18.6 14.1 22.4 28.1 29.4Z" fill="currentColor" fill-opacity=".55" stroke="none"/>
  <path d="M29 24.4 26.4 19.2 23.4 20.3 20.4 13.3 15.1 16.6" stroke-width="1"/><path class="cursor" d="M22 10.5 18.6 9.8" stroke-width="1.4"/>
  <path d="M29.4 32.1 12.2 23.5 15.6 2.9 32.8 11.5ZM29.4 32.1 31 31.3 34.4 10.7 32.8 11.5"/>
  <path d="M31.4 32.9 10.6 22.5 7.8 23.9 28.6 34.3Z" fill="currentColor" fill-opacity=".6"/><path d="M28.6 34.3 7.8 23.9V25.5L28.6 35.9Z" fill="currentColor" fill-opacity=".35"/>
  <circle class="badge link" cx="38" cy="38.5" r="5.2" fill="currentColor" fill-opacity=".18"/>
  <path class="on link" d="M38 34.6Q38.5 37.9 41.9 38.5 38.5 39.1 38 42.4 37.5 39.1 34.1 38.5 37.5 37.9 38 34.6Z" stroke-width="1.2"/>
</svg>`

/**
 * Z-Image-Turbo's picture (D263), in the same view: a billboard on two posts, a sun over hills on its left and lines of
 * words on its right, and a letter, as it spells them right. The picture lights up once it is here; the last line blinks while it comes.
 */
const BILLBOARD = html`<svg class="art" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
  <path d="M30.6 41.3V30.3M17 34.5V23.5" stroke-width="1.6"/>
  <path d="M34 33 36 32V15.3L34 16.3Z" fill="currentColor" fill-opacity=".5"/><path d="M34 16.3 36 15.3 13.6 4.1 11.6 5.1Z" fill="currentColor" fill-opacity=".3"/>
  <path d="M34 33 11.6 21.8V5.1L34 16.3Z" fill="currentColor" fill-opacity=".14"/><path class="screen" d="M22 25 13.4 20.7V8L22 12.3Z" fill="currentColor" fill-opacity=".12"/>
  <ellipse cx="16.2" cy="12.7" rx="2.1" ry="1.3" transform="rotate(57.4 16.2 12.7)" fill="currentColor" fill-opacity=".55" stroke="none"/>
  <path d="M22 25V21.3L19.2 16.4 17.2 18.2 15 14.7 13.4 15.4V20.7Z" fill="currentColor" fill-opacity=".45" stroke="none"/><path d="M22 25 13.4 20.7V8L22 12.3Z"/>
  <path d="M24.2 15.1 31.8 18.9" stroke-width="2"/><path d="M24.2 19.7 30.6 22.9" stroke-width="1.2"/><path class="cursor" d="M24.2 23 28.8 25.3" stroke-width="1.2"/>
  <path d="M34 33 11.6 21.8V5.1L13.6 4.1 36 15.3V32ZM34 33V16.3L36 15.3"/>
  <circle class="badge link" cx="38" cy="38.5" r="5.2" fill="currentColor" fill-opacity=".18"/><path class="on link" d="M35.8 41.6 38 35.4 40.2 41.6M36.6 39.5H39.4" stroke-width="1.2"/>
</svg>`

/** Each one's picture. */
const ART = { 'sd-turbo': CAMERA, 'flux2-klein': EASEL, 'z-image-turbo': BILLBOARD }

/** Which one Settings shows under the cards: the one the user picked, kept for the visit, else the one used, else the finest. */
const viewing = signal(/** @type {Maker | null} */ (null))
const viewed = () => viewing.value ?? device.used() ?? fit.value.at(-1)

/** One's light and state, on its card: in use, here, coming, or what it weighs. @param {Maker} maker @returns {[string, string]} */
function state(maker) {
  const { state } = device.downloads[maker].value
  if (state === 'downloading' || state === 'loading') return ['waking', t('pictures.downloading')]
  if (!device.kept.value.has(maker)) return ['asleep', formatBytes(device.BYTES[maker])]
  return device.used() === maker ? ['ready', t('pictures.used')] : ['asleep', t('pictures.kept')]
}

/** One's card, a tab: its picture, its name, its light and its state. @param {Maker} maker @param {Maker} shown */
function card(maker, shown) {
  const [light, text] = state(maker)
  return html`<button role="tab" id=${`pictures-${maker}`} aria-selected=${String(maker === shown)} aria-controls="pictures-shown"
    tabindex=${maker === shown ? 0 : -1} @click=${() => { viewing.value = maker }}>
    <span class="item-icon" aria-hidden="true" data-state=${light}>${ART[maker]}</span>
    <span class="item-text"><span>${t(`pictures.${maker}`)}</span><small><span class="ember" data-state=${light} aria-hidden="true"></span>${text}</small></span>
  </button>`
}

/**
 * Between the cards, an arrow goes to the next or the one before, as the language reads, around the ends;
 * Home and End to the first and the last. @param {KeyboardEvent} event
 */
function move(event) {
  const makers = fit.value
  const at = makers.indexOf(/** @type {Maker} */ (viewed()))
  const back = getComputedStyle(/** @type {Element} */ (event.currentTarget)).direction === 'rtl'
  const by = /** @type {Record<string, number>} */ ({ ArrowDown: 1, ArrowUp: -1, ArrowRight: back ? -1 : 1, ArrowLeft: back ? 1 : -1 })[event.key]
  const to = by ? makers.at((at + by) % makers.length) : event.key === 'Home' ? makers[0] : event.key === 'End' ? makers.at(-1) : null
  if (!to) return
  event.preventDefault()
  viewing.value = to
  document.getElementById(`pictures-${to}`)?.focus()
}

/** What the one shown does, then its action: download it, use it, or remove it; its download's bar as it comes. @param {Maker} maker */
function shown(maker) {
  const progress = device.downloads[maker].value
  const remove = html`<button class="button subtle danger" @click=${() => device.remove(maker)}>${icons.trash} ${t('action.remove')}</button>`
  return html`<section class="setting">
      <p class="muted">${t(`pictures.${maker}.text`)}</p>
      <div class="row">${progress.state === 'downloading' ? html`<progress max=${progress.total} value=${progress.loaded} aria-label=${t(`pictures.${maker}`)}></progress>`
        : progress.state === 'loading' ? html`<progress aria-label=${t(`pictures.${maker}`)}></progress>`
        : !device.kept.value.has(maker) ? html`<button class="button" @click=${() => device.prepare(maker).catch(() => {})}>${icons.download} ${t('pictures.deviceAction', { size: formatBytes(device.BYTES[maker]) })}</button>`
        : device.used() === maker ? remove : html`<button class="button" @click=${() => device.use(maker)}>${t('pictures.use')}</button>${remove}`}</div>
    </section>
    ${progress.state === 'failed' ? html`<p class="status is-error" role="alert">${t('pictures.deviceFailed')}</p>` : nothing}`
}

/**
 * Its part of Settings › Brains: films made without asking, then pictures on this device (D263), the three that can make
 * them a card each as tabs, as the Computer's two computers are (D248), the quickest first; under them, the one shown.
 */
function panel() {
  const makers = fit.value
  const chosen = viewed()
  return html`${effective.value.settings.films ? html`<section class="setting">
    <div><h3>${t('pictures.films')}</h3><p class="muted">${t('pictures.filmsText')}</p></div>
    <button class="button" @click=${() => updateSettings({ films: false })}>${t('pictures.filmsAsk')}</button>
  </section>` : nothing}
  ${chosen ? html`<section class="pictures-device">
    <h3>${t('pictures.device')}</h3>
    <p class="muted">${t('pictures.deviceText')}</p>
    <div class="makers" role="tablist" aria-label=${t('pictures.device')} @keydown=${move}>${makers.map((maker) => card(maker, chosen))}</div>
    <div role="tabpanel" id="pictures-shown" aria-labelledby=${`pictures-${chosen}`}>${shown(chosen)}</div>
  </section>` : nothing}`
}

/** Whether anything here can make a picture: once on, Settings › Brains is where one comes from if not. */
export const ready = async () => (await engines('picture', false)).length > 0 || (await looked, fit.value.length > 0)

register({
  id: 'pictures',
  tools: [pictureTool, filmTool],
  lines: [
    { name: 'picture', line: 'make or change a picture the user asks for' },
    { name: 'film', line: 'make a short film the user asks for, which costs more' },
  ],
  rules: ['Make the pictures and films the user asks for with picture and film, not by drawing them in code.'],
  panel,
})
