// Pictures for codemode (D48): `await models.image(prompt)` in a script makes one with the
// provider of a connected brain that has an image model, keeps it in the project's files like
// a shared file (its description as its text), and shows it in the answer, ready to save.
import { html, render } from 'lit-html'
import { app, effective, loadModels, cloudAllowed } from '../../ui/state.js'
import { getSecret } from '../../ui/secrets.js'
import { isLocal } from '../../ui/auto.js'
import { addFile } from '../../core/files.js'
import { slug } from '../../core/settings.js'
import { t } from '../../core/i18n.js'
import { icons } from '../../ui/icons.js'

/** Image models by provider, preferred first: provider identities (D33) that policy can replace (`images`). */
export const IMAGES = /** @type {Record<string, string[]>} */ ({ openai: ['gpt-image-1.5', 'gpt-image-1', 'dall-e-3'], openrouter: ['google/gemini-2.5-flash-image', 'openai/gpt-5-image'] })

/** A connected brain whose provider lists an image model, and that model. */
async function painter() {
  for (const brain of effective.value.settings.brains) {
    if (brain.api !== 'openai' || !(isLocal(brain) || cloudAllowed())) continue
    await loadModels(brain)
    const models = app.models.value[brain.id] ?? []
    const preferred = /** @type {string[]} */ ((app.policy.images ?? IMAGES)[brain.provider] ?? [])
    const model = preferred.find((id) => models.some((info) => info.id === id)) ?? models.find((info) => info.output?.includes('image') || /image|dall-e/i.test(info.id))?.id
    if (model) return { brain, model }
  }
  return null
}

/** @type {import('../../core/loop.js').Tool} */
export const imageTool = {
  spec: {
    name: 'image',
    description: 'Make a picture from a description, with the provider of a connected brain. It is shown to the user.',
    parameters: { type: 'object', properties: { prompt: { type: 'string' } }, required: ['prompt'] },
  },
  kind: 'edit',
  hidden: true,
  title: (args) => `Picture: ${args?.prompt ?? ''}`,
  run: async (args, ctx) => {
    const prompt = String(args?.prompt ?? '').trim()
    if (!prompt) throw new Error('Describe the picture to make.')
    const found = await painter()
    if (!found) throw new Error('None of the connected brains can make pictures.')
    const { generateImage } = await import('./picture.js')
    const { bytes, mimeType } = await generateImage({ ...found, apiKey: (await getSecret(app.fs, found.brain.id)) ?? undefined, prompt, signal: ctx.signal })
    const name = `${slug(prompt).slice(0, 40) || 'picture'}.${mimeType.split('/')[1].replace('jpeg', 'jpg')}`
    const link = await addFile(app.fs, { projectDir: app.projectDir, name, mimeType, bytes, pages: [prompt], by: 'jean' })
    ctx.meta.image = { uri: link.uri, name }
    return JSON.stringify({ file: name, shown: true })
  },
}

/** A picture Jean made, read from the project's files. Attributes, so they survive the upgrade. */
class Picture extends HTMLElement {
  #url = ''

  async connectedCallback() {
    const bytes = this.#url ? null : await app.fs.readBytes(`${app.projectDir}/${this.getAttribute('uri')}`)
    if (!bytes || !this.isConnected) return
    this.#url = URL.createObjectURL(new Blob([/** @type {BlobPart} */ (bytes)]))
    const name = this.getAttribute('name') ?? ''
    render(html`<figure>
      <img src=${this.#url} alt=${this.getAttribute('alt') ?? ''}>
      <a class="icon-button subtle" href=${this.#url} download=${name} title=${t('made.image')} aria-label=${t('made.image')}>${icons.download}</a>
    </figure>`, this)
  }

  disconnectedCallback() {
    URL.revokeObjectURL(this.#url)
    this.#url = ''
  }
}

if (!customElements.get('app-image')) customElements.define('app-image', Picture)
