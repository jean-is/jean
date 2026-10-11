// Writes app/caps/pictures/concepts.json (D280): what the picture check looks for besides nudity, a
// few words for each area, read by SigLIP's text encoder into the vectors that its image encoder's
// view of a picture is compared with on the device; a picture as close as an area's limit to any of
// its words shows it. The limits were measured on photographs and look-alikes (docs/decisions.md).
// Run it after changing a word or a limit; the first run downloads the text encoder (~110 MB) into
// Transformers.js's cache.
// Usage: npm run concepts
import { writeFile } from 'node:fs/promises'
import { AutoTokenizer, SiglipTextModel } from '@huggingface/transformers'

const MODEL = 'Xenova/siglip-base-patch16-224'
const REVISION = '4649052661e53c7000355844105f8a1792088239'
const AREAS = {
  hate: { limit: 0.07, words: ['a Nazi swastika flag', 'a swastika armband', 'Nazi propaganda poster', 'an SS skull insignia', 'the black flag of the Islamic State', 'a Ku Klux Klan robe and hood', 'a neo-Nazi rally', 'a white supremacist symbol'] },
  violence: { limit: 0.1, words: ['a photo of a dead body', 'corpses on a battlefield', 'a gory bleeding wound', 'a mutilated body', 'a severed limb', 'a severe burn injury', 'graphic violence and gore', 'a gunshot wound'] },
  selfHarm: { limit: 0.12, words: ['self-harm cuts on a forearm', 'a person cutting their own wrist', 'a suicide', 'a person hanging from a noose', 'self-inflicted wounds'] },
}

const tokenizer = await AutoTokenizer.from_pretrained(MODEL, { revision: REVISION })
const model = await SiglipTextModel.from_pretrained(MODEL, { revision: REVISION, dtype: 'q8', device: 'cpu' })

/** A vector at unit length, as base64: the scale of a step, then a signed byte a value. @param {ArrayLike<number>} vector */
function packed(vector) {
  const length = Math.hypot(...Array.from(vector))
  const step = Math.max(...Array.from(vector, Math.abs)) / length / 127
  const bytes = new Uint8Array(4 + vector.length)
  new DataView(bytes.buffer).setFloat32(0, step, true)
  new Int8Array(bytes.buffer, 4).set(Array.from(vector, (value) => Math.round(value / length / step)))
  return Buffer.from(bytes).toString('base64')
}

/** @type {Record<string, { limit: number, words: string[], vectors: string[] }>} */
const areas = {}
for (const [area, { limit, words }] of Object.entries(AREAS)) {
  const vectors = []
  for (const text of words) {
    const { pooler_output } = await model(await tokenizer(text, { padding: 'max_length', max_length: 64, truncation: true }))
    vectors.push(packed(pooler_output.data))
  }
  areas[area] = { limit, words, vectors }
}
await writeFile(new URL('../app/caps/pictures/concepts.json', import.meta.url), `${JSON.stringify({ format: 1, model: `${MODEL}@${REVISION}`, areas }, null, 2)}\n`)
