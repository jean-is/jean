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
/** @typedef {{ brain: BrainConfig, model: string } | { device: true }} Engine */

await Promise.all([useStrings('pictures'), styleSheet(new URL('pictures.css', import.meta.url))])

/** Models by provider, preferred first: provider identities (D33) that policy replaces (`images`, `films`). */
const MODELS = /** @type {Record<'picture' | 'film', Record<string, string[]>>} */ ({
  picture: { openai: ['gpt-image-1.5', 'gpt-image-1'], gemini: ['gemini-3-pro-image-preview', 'gemini-2.5-flash-image'], openrouter: ['google/gemini-2.5-flash-image', 'openai/gpt-5-image'] },
  film: { openai: ['sora-2', 'sora-2-pro'], gemini: ['veo-3.1-fast-generate-preview', 'veo-3.1-generate-preview'], openrouter: ['google/veo-3.1', 'openai/sora-2-pro'] },
})
/** Otherwise, a model that says it makes them (OpenRouter's list), or whose name does. */
const MAKES = { picture: /image|dall-e|flux/i, film: /sora|veo|video/i }
/** Servers that list picture models without the API to run them: LM Studio has no Images API. */
const UNABLE = ['lmstudio']

/** A model of the brain's provider that makes pictures or films, if its list has one. @param {BrainConfig} brain @param {'picture' | 'film'} kind */
async function modelOf(brain, kind) {
  if (UNABLE.includes(brain.provider)) return undefined
  await loadModels(brain)
  const models = app.models.value[brain.id] ?? []
  const preferred = /** @type {string[]} */ ((app.policy[kind === 'film' ? 'films' : 'images'] ?? MODELS[kind])[brain.provider] ?? [])
  const output = kind === 'film' ? 'video' : 'image'
  return preferred.find((id) => models.some((info) => info.id === id)) ?? models.find((info) => info.output?.includes(output) || MAKES[kind].test(info.id))?.id
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
  for (const brain of near) await modelOf(brain, kind).then((model) => model && found.push({ brain, model }))
  if (kind === 'picture' && !changing && await device.here()) found.push({ device: true })
  for (const brain of far) await modelOf(brain, kind).then((model) => model && found.push({ brain, model }))
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
      made = 'device' in engine ? await device.paint(description) : await cloud[kind]({ ...engine, apiKey: (await getSecret(app.fs, engine.brain.id)) ?? undefined,
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

/** Whether this device can make pictures, and whether their files are here, for Settings. */
const fits = signal(false)
const here = signal(false)
Promise.all([device.fits(), device.here()]).then(([fit, kept]) => { [fits.value, here.value] = [fit, kept] })

/** Its part of Settings › Brains: films made without asking, and pictures on this device, downloaded once when asked. */
function panel() {
  const progress = device.download.value
  return html`${effective.value.settings.films ? html`<section class="setting">
    <div><h3>${t('pictures.films')}</h3><p class="muted">${t('pictures.filmsText')}</p></div>
    <button class="button" @click=${() => updateSettings({ films: false })}>${t('pictures.filmsAsk')}</button>
  </section>` : nothing}
  ${fits.value ? html`<section class="setting pictures-device">
    <div><h3>${t('pictures.device')}</h3><p class="muted">${t('pictures.deviceText')}</p></div>
    ${progress.state === 'downloading' ? html`<progress max=${progress.total} value=${progress.loaded} aria-label=${t('pictures.device')}></progress>`
      : progress.state === 'loading' ? html`<progress aria-label=${t('pictures.device')}></progress>`
      : here.value || progress.state === 'ready' ? html`<p class="muted">${icons.check} ${t('pictures.deviceReady')}</p>`
      : html`<button class="button" @click=${() => device.prepare().then(() => { here.value = true }, () => {})}>${icons.download} ${t('pictures.deviceAction', { size: formatBytes(device.BYTES) })}</button>`}
    ${progress.state === 'failed' ? html`<p class="status is-error" role="alert">${t('pictures.deviceFailed')}</p>` : nothing}
  </section>` : nothing}`
}

/** Whether anything here can make a picture: once on, Settings › Brains is where one comes from if not. */
export const ready = async () => (await engines('picture', false)).length > 0 || fits.value

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
