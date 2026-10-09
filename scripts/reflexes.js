// Measures the reflexes (Kev-0.6B) on the multilingual test set, language by language (D41):
// the questions Jean asks (caps/reflexes/questions.js), packed the way Jean packs them
// (core/decide.js), judged with Jean's own thresholds. Runs on the CPU through Transformers.js;
// the first run downloads Kev (~375 MB) into its cache.
// Usage: npm run reflexes                   every language in test/reflexes/
//        npm run reflexes -- --lang fr,ja   some of them
//        npm run reflexes -- --write        also write test/reflexes/results.md
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { AutoTokenizer, PreTrainedModel, Tensor } from '@huggingface/transformers'
import { pack, answers } from '../app/core/decide.js'
import { REFLEXES, CAPABILITIES, FOLLOW_UPS, YES, likeliest, exchange } from '../app/caps/reflexes/questions.js'
import { tierFor } from '../app/ui/auto.js'

const DIR = fileURLToPath(new URL('../test/reflexes/', import.meta.url))
const MODEL = 'onnx-community/kev-0.6b-ONNX'
const KINDS = ['personal', 'unhappy', 'demand', 'capability', 'lasting', 'table', 'email']

/** @typedef {import('../app/core/decide.js').Question} Question */

/** The question Jean asks for each kind of label. @type {Record<string, Question>} */
const QUESTIONS = {
  personal: REFLEXES.personal,
  unhappy: REFLEXES.unhappy,
  demand: REFLEXES.demand,
  capability: REFLEXES.capability(CAPABILITIES),
  lasting: REFLEXES.lasting,
  ...FOLLOW_UPS,
}

/**
 * Whether Jean would act on the answer as the label says.
 * @param {any} answer @param {any} label
 */
function correct(answer, label) {
  if (answer.type === 'noul') return (answer.noul >= YES) === label
  if (answer.type === 'score') return tierFor(likeliest(answer.probabilities)) === tierFor(label)
  const choice = answer.choice !== 'none' && answer.probabilities[answer.choice] >= YES ? answer.choice : 'none'
  return choice === label
}

async function main(argv) {
  const only = argv.includes('--lang') ? argv[argv.indexOf('--lang') + 1].split(',') : null
  const english = JSON.parse(await readFile(`${DIR}en.json`, 'utf8'))
  const langs = (await readdir(DIR)).filter((file) => /^[\w-]+\.json$/.test(file)).map((file) => file.slice(0, -5))
    .filter((lang) => !only || only.includes(lang)).sort((a, b) => (a === 'en' ? -1 : b === 'en' ? 1 : a < b ? -1 : 1))

  const tokenizer = await AutoTokenizer.from_pretrained(MODEL)
  const model = await PreTrainedModel.from_pretrained(MODEL, { dtype: 'q4', device: 'cpu' })
  const encode = (/** @type {string} */ text) => Array.from(tokenizer(text, { add_special_tokens: false }).input_ids.data, Number)

  /** @type {Record<string, Record<string, [number, number]>>} lang → kind → [right, total] */
  const scores = {}
  /** @type {string[]} */
  const misses = []
  for (const lang of langs) {
    const { states } = lang === 'en' ? english : JSON.parse(await readFile(`${DIR}${lang}.json`, 'utf8'))
    scores[lang] = Object.fromEntries(KINDS.map((kind) => [kind, [0, 0]]))
    for (const [id, [kind, label]] of Object.entries(english.labels)) {
      const raw = states[id]
      if (raw === undefined) throw new Error(`${lang}.json has no ${id}`)
      const state = Array.isArray(raw) ? exchange(raw[0], raw[1]) : raw
      const questions = { [kind]: QUESTIONS[kind] }
      const { ids, ends } = pack(state, questions, encode)
      const { logits } = await model({
        input_ids: new Tensor('int64', BigInt64Array.from(ids, BigInt), [1, ids.length]),
        attention_mask: new Tensor('int64', new BigInt64Array(ids.length).fill(1n), [1, ids.length]),
      })
      const answer = answers(questions, ends, logits.data)[kind]
      const score = scores[lang][kind]
      score[1]++
      if (correct(answer, label)) score[0]++
      else misses.push(`${lang} ${id} (${kind}, expected ${label}): ${JSON.stringify(answer)}`)
    }
    const total = Object.values(scores[lang]).reduce((sum, [right, all]) => [sum[0] + right, sum[1] + all], [0, 0])
    console.log(`${lang.padEnd(8)} ${KINDS.map((kind) => `${kind} ${scores[lang][kind][0]}/${scores[lang][kind][1]}`).join('  ')}  total ${(total[0] / total[1] * 100).toFixed(0)}%`)
  }
  if (argv.includes('--verbose')) for (const miss of misses) console.log(miss)
  if (argv.includes('--write')) await writeFile(`${DIR}results.md`, report(scores))
}

/** @param {Record<string, Record<string, [number, number]>>} scores */
function report(scores) {
  const percent = (/** @type {[number, number]} */ [right, total]) => `${Math.round(right / total * 100)}%`
  const sum = (/** @type {[number, number][]} */ pairs) => /** @type {[number, number]} */ (pairs.reduce((a, b) => [a[0] + b[0], a[1] + b[1]], [0, 0]))
  const rows = Object.entries(scores).map(([lang, byKind]) => `| ${lang} | ${KINDS.map((kind) => percent(byKind[kind])).join(' | ')} | **${percent(sum(Object.values(byKind)))}** |`)
  const all = KINDS.map((kind) => percent(sum(Object.values(scores).map((byKind) => byKind[kind]))))
  return `# Reflexes: Kev-0.6B on the multilingual test set

Written by \`npm run reflexes -- --write\`. Each cell is the share of examples where Jean would act
as the label says, with its own threshold (yes at ${YES}); demand counts as right when its most
likely level leads to the right tier of brain. ${Object.keys(scores).length} languages, ${sum(Object.values(scores.en ?? {})).at(1)} examples each, q4 weights on the CPU.

| Language | ${KINDS.join(' | ')} | All |
|---|${KINDS.map(() => '---:').join('|')}|---:|
${rows.join('\n')}
| **All** | ${all.join(' | ')} | **${percent(sum(Object.values(scores).flatMap((byKind) => Object.values(byKind))))}** |
`
}

main(process.argv.slice(2)).catch((error) => {
  console.error(`reflexes: ${error.message}`)
  process.exit(1)
})
