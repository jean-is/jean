// Measures the reflexes (Kev-0.6B fine-tuned for them, D328) on the multilingual test set, language by language (D41):
// the questions Jean asks (caps/reflexes/questions.js), packed the way Jean packs them
// (core/decide.js), judged with Jean's own thresholds. Runs on the CPU through Transformers.js;
// the first run downloads Kev (~375 MB) into its cache.
// Usage: npm run reflexes                   every language in test/reflexes/
//        npm run reflexes -- --lang fr,ja   some of them
//        npm run reflexes -- --write        also write test/reflexes/results.md
//        npm run reflexes -- --model <dir>  a checkpoint on this computer instead (its config.json, tokenizer and onnx/)
// With BRAIN=<provider>:<model> (jean-cli's --brain, its key in <PROVIDER>_API_KEY, BRAIN_ADDRESS and BRAIN_BODY as npm run
// tutor's), a child's danger alone, asked of that brain as Jean asks it where Kev isn't on (D661); --write adds its section
// to test/reflexes/brains.md.
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { env, AutoTokenizer, PreTrainedModel, Tensor } from '@huggingface/transformers'
import { pack, answers } from '../app/core/decide.js'
import { streamChat } from '../app/core/llm.js'
import { REFLEXES, CAPABILITIES, FOLLOW_UPS, YES, likeliest, exchange, dangerOf, dangerAsked, dangerSaid } from '../app/caps/reflexes/questions.js'
import { tierFor } from '../app/ui/auto.js'
import { chooseBrain } from '../cli/brain.js'

const DIR = fileURLToPath(new URL('../test/reflexes/', import.meta.url))
const MODEL = 'jean-is/kev-0.6b-reflexes-ONNX'
const KINDS = ['personal', 'unhappy', 'demand', 'capability', 'lasting', 'table', 'email', 'danger']

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
  if (process.env.BRAIN) return brainDangers(argv, process.env, english, langs)

  const local = argv.includes('--model') ? resolve(argv[argv.indexOf('--model') + 1]) : null
  if (local) Object.assign(env, { localModelPath: `${dirname(local)}/`, allowRemoteModels: false })
  const name = local ? basename(local) : MODEL
  const tokenizer = await AutoTokenizer.from_pretrained(name)
  const model = await PreTrainedModel.from_pretrained(name, { dtype: 'q4', device: 'cpu' })
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
      // A child's danger is two questions in one pass, read as Jean reads them (D228).
      const questions = kind === 'danger' ? { danger: REFLEXES.danger, home: REFLEXES.home } : { [kind]: QUESTIONS[kind] }
      const { ids, ends } = pack(state, questions, encode)
      const { logits } = await model({
        input_ids: new Tensor('int64', BigInt64Array.from(ids, BigInt), [1, ids.length]),
        attention_mask: new Tensor('int64', new BigInt64Array(ids.length).fill(1n), [1, ids.length]),
      })
      const got = answers(questions, ends, logits.data)
      const answer = kind === 'danger' ? { read: dangerOf(got) ?? 'none', ...got } : got[kind]
      const score = scores[lang][kind]
      score[1]++
      if (kind === 'danger' ? answer.read === label : correct(answer, label)) score[0]++
      else misses.push(`${lang} ${id} (${kind}, expected ${label}): ${JSON.stringify(answer)}`)
    }
    const total = Object.values(scores[lang]).reduce((sum, [right, all]) => [sum[0] + right, sum[1] + all], [0, 0])
    console.log(`${lang.padEnd(8)} ${KINDS.map((kind) => `${kind} ${scores[lang][kind][0]}/${scores[lang][kind][1]}`).join('  ')}  total ${(total[0] / total[1] * 100).toFixed(0)}%`)
  }
  if (argv.includes('--verbose')) for (const miss of misses) console.log(miss)
  if (argv.includes('--write')) await writeFile(`${DIR}results.md`, report(scores, name))
}

const percent = (/** @type {[number, number]} */ [right, total]) => (total ? `${Math.round(right / total * 100)}%` : '—')
const sum = (/** @type {[number, number][]} */ pairs) => /** @type {[number, number]} */ (pairs.reduce((a, b) => [a[0] + b[0], a[1] + b[1]], [0, 0]))

/** @param {Record<string, Record<string, [number, number]>>} scores @param {string} name the model's */
function report(scores, name) {
  const rows = Object.entries(scores).map(([lang, byKind]) => `| ${lang} | ${KINDS.map((kind) => percent(byKind[kind])).join(' | ')} | **${percent(sum(Object.values(byKind)))}** |`)
  const all = KINDS.map((kind) => percent(sum(Object.values(scores).map((byKind) => byKind[kind]))))
  return `# Reflexes: ${name} on the multilingual test set

Written by \`npm run reflexes -- --write\`. Each cell is the share of examples where Jean would act
as the label says, with its own threshold (yes at ${YES}); demand counts as right when its most
likely level leads to the right tier of brain. ${Object.keys(scores).length} languages, ${sum(Object.values(scores.en ?? {})).at(1)} examples each, q4 weights on the CPU.

| Language | ${KINDS.join(' | ')} | All |
|---|${KINDS.map(() => '---:').join('|')}|---:|
${rows.join('\n')}
| **All** | ${all.join(' | ')} | **${percent(sum(Object.values(scores).flatMap((byKind) => Object.values(byKind))))}** |
`
}

const BRAINS = `${DIR}brains.md`

/**
 * A child's danger asked of a brain as Jean asks it where Kev isn't on (D661), on the examples Kev is measured on; with --write,
 * that brain's section of brains.md, replaced when it is measured again.
 * @param {string[]} argv @param {Record<string, string | undefined>} vars @param {any} english @param {string[]} langs
 */
async function brainDangers(argv, vars, english, langs) {
  const found = await chooseBrain({ named: vars.BRAIN, address: vars.BRAIN_ADDRESS, env: vars })
  if (!found || 'needs' in found) throw new Error(`no brain "${vars.BRAIN}": BRAIN=<provider>:<model>, its key in <PROVIDER>_API_KEY`)
  const extra = vars.BRAIN_BODY ? JSON.parse(vars.BRAIN_BODY) : undefined
  /** @type {typeof fetch} */
  const fetch = (url, init) => globalThis.fetch(url, extra && typeof init?.body === 'string' ? { ...init, body: JSON.stringify({ ...JSON.parse(init.body), ...extra }) } : init)
  const name = `${found.brain.model} (${[found.brain.provider, vars.BRAIN_BODY].filter(Boolean).join(', ')})`
  const dangers = /** @type {[string, [string, string]][]} */ (Object.entries(english.labels).filter(([, [kind]]) => kind === 'danger'))
  const labels = [...new Set(dangers.map(([, [, label]]) => label))]
  /** @type {Record<string, Record<string, [number, number]>>} lang → label → [right, total] */
  const scores = {}
  const misses = []
  let told = 0
  // One request alone, so that a server loading the brain on its first loads it once, then a few at a time.
  const parallel = Number(vars.PARALLEL) || 4
  for (const lang of langs) {
    const { states } = lang === 'en' ? english : JSON.parse(await readFile(`${DIR}${lang}.json`, 'utf8'))
    scores[lang] = Object.fromEntries(labels.map((label) => [label, [0, 0]]))
    const queue = [...dangers]
    const each = async (/** @type {[string, [string, string]]} */ [id, [, label]]) => {
      let reply = ''
      try {
        for await (const event of streamChat({ brain: found.brain, apiKey: found.apiKey, ...dangerAsked(states[id]), fetch })) if (event.type === 'text') reply += event.delta
      } catch (error) {
        reply = `(${/** @type {Error} */ (error).message})`
      }
      const read = dangerSaid(reply) ?? 'none'
      // A danger at home read as another would be told to a parent who may be the one hurting the child.
      if (label === 'home' && !['home', 'none'].includes(read)) told++
      scores[lang][label][1]++
      if (read === label) scores[lang][label][0]++
      else misses.push(`${lang} ${id} (expected ${label}): ${reply.trim().slice(0, 80)}`)
    }
    const work = async () => { for (let next = queue.shift(); next; next = queue.shift()) await each(next) }
    if (lang === langs[0]) await each(/** @type {[string, [string, string]]} */ (queue.shift()))
    await Promise.all(Array.from({ length: parallel }, work))
    const all = Object.values(scores[lang]).reduce((sum, [right, total]) => [sum[0] + right, sum[1] + total], [0, 0])
    console.log(`${lang.padEnd(8)} danger ${all[0]}/${all[1]}`)
  }
  await found.close?.()
  const home = sum(Object.values(scores).map((byLabel) => byLabel.home ?? [0, 0]))[1]
  console.log(`a parent told of a danger at home ${told} times in ${home}`)
  if (argv.includes('--verbose')) for (const miss of misses) console.log(miss)
  if (!argv.includes('--write')) return
  const section = `## ${name}, ${new Date().toISOString().slice(0, 10)}

Read ${percent(sum(Object.values(scores).flatMap((byLabel) => Object.values(byLabel))))} of the examples as their label; a parent would be told of a danger at home ${told} times in ${home}.

| Language | ${labels.join(' | ')} | All |
|---|${labels.map(() => '---:').join('|')}|---:|
${Object.entries(scores).map(([lang, byLabel]) => `| ${lang} | ${labels.map((label) => percent(byLabel[label])).join(' | ')} | **${percent(sum(Object.values(byLabel)))}** |`).join('\n')}
| **All** | ${labels.map((label) => percent(sum(Object.values(scores).map((byLabel) => byLabel[label])))).join(' | ')} | **${percent(sum(Object.values(scores).flatMap((byLabel) => Object.values(byLabel))))}** |
`
  const kept = (await readFile(BRAINS, 'utf8').catch(() => '')).split(/^(?=## )/m).slice(1).filter((part) => !part.startsWith(`## ${name}, `))
  await writeFile(BRAINS, `# Reflexes asked of a brain: a child's danger (D661)

Written by \`BRAIN=<provider>:<model> npm run reflexes -- --write\`, one section per brain, replaced when that brain is
measured again. Where Kev isn't on, the brain answering a child is asked the danger questions Kev is
(caps/reflexes/questions.js), in a request of its own, and its first word read as Jean reads it. Each cell is the share
of examples read as their label (${labels.join(', ')}); home is a danger from someone the child lives with,
which their parent isn't told. Kev's reading of the same examples is in [results.md](results.md).

${[section, ...kept].map((part) => part.trimEnd()).join('\n\n')}
`)
}

main(process.argv.slice(2)).catch((error) => {
  console.error(`reflexes: ${error.message}`)
  process.exit(1)
})
