// A game's play-test (D648), after each call that makes or changes one: the game played out of sight twice as it starts, then once
// for each action it uses, held a second, each run the same frames from the same seed, 20 s at most; what it saw said in words
// for the brain (./report.js), and the picture for its card: of the runs' last frames, the one that holds most while it plays, by
// its bytes.
import { languageOf } from '../../ui/language.js'
import { locale } from '../../core/i18n.js'
import { run } from './frame.js'
import { say, FRAMES, START, HELD } from './report.js'
import { actionsOf } from './file.js'

const SECONDS = 20

/** @param {import('./frame.js').Kept} game @param {import('../../core/loop.js').ToolContext} ctx */
export async function playtest(game, ctx) {
  const lang = locale.peek()
  const once = (/** @type {{ action: string, from: number, to: number }[]} */ press) => run(game, { frames: FRAMES, seed: 7, press: [START, ...press] }, SECONDS * 1000, ctx.signal)
  ctx.progress({ title: `Play ${game.name}` })
  const base = await once([]), again = base.timeout ? base : await once([]), runs = /** @type {Record<string, any>} */ ({})
  if (!base.timeout) for (const action of actionsOf(game.meta.actions)) runs[action] = await once([{ action, from: HELD[0], to: HELD[1] }])
  const shots = [base, ...Object.values(runs)].filter((one) => one.picture), playing = shots.filter((one) => one.states.at(-1)?.[1] === 'play')
  return { ...say({ base, again, runs, lang, langOf: (words) => languageOf(words, lang), seconds: SECONDS }), picture: /** @type {string} */ ((playing.length ? playing : shots).map((one) => one.picture).sort((a, b) => b.length - a.length)[0] ?? '') }
}
