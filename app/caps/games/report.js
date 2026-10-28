// What the brain hears of a game it made (D648): what its play-test saw, in words, after each call that makes or changes one. The
// shell's own report of each run (./shell.js), a baseline played twice and each action held in a run of its own: errors at their
// lines with a hint for the frequent ones, what the page's rules blocked, the moments reached, which controls changed the picture
// beyond what two baselines differ by, the words the player sees, their language and those over others, and the work a frame takes. Pure.

/** @typedef {{ message: string, name?: string, line?: number, col?: number, frame?: number }} Fault */
/**
 * @typedef {{ errors: Fault[], states: [number, string][], scores: [number, number][], violations: string[], alerts: string[], words: string[],
 *   text: string, prints: (number[] | string)[], work: { mean: number, worst: number }, frames: number, timeout?: boolean, crowded?: string[], picture?: string }} Run
 */

/** Where the actions are held in a run, by frame. */
export const HELD = [200, 260]
/** The run's frames, and the start pressed to leave a title. */
export const FRAMES = 420, START = { action: 'a', from: 20, to: 24 }

/** What a frequent error usually means. */
const HINTS = /** @type {[RegExp, string][]} */ ([
  [/Unexpected reserved word/, 'often `await` outside an `async` function; `host.load()` needs no `await`'],
  [/does not provide an export named/, "not in what this engine lends: its sheet says what is"],
  [/is not a function/, "that method doesn't exist here: check its name, and what the sheet says changed"],
  [/is not defined|Can't find variable/, 'declared nowhere, or misspelt'],
  [/Cannot read properties of (undefined|null)|(undefined|null) is not an object/, 'used before it was made: check the order things are made in'],
  [/Unexpected token|Unexpected identifier|missing \)/, 'check brackets, commas and quotes on that line and the one before'],
  [/A loop ran for a second/, 'a loop whose condition never turns false: make it end, or spread the work over frames'],
])

/** How far two pictures of a run are apart: the mean difference of their areas, or 0 and 1 for a page without a canvas. @param {number[] | string} a @param {number[] | string} b */
export const apart = (a, b) => (Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.length > 3 ? a.reduce((sum, value, i) => sum + Math.abs(value - b[i]), 0) / a.length : JSON.stringify(a) === JSON.stringify(b) ? 0 : 1)

/** Whether a run's picture moved away from the baseline's once its action was held, beyond what two baselines differ by. @param {Run} run @param {Run} base @param {Run} again */
export const changed = (run, base, again) => run.prints.some((print, k) => k * 10 > HELD[0] && apart(print, base.prints[k] ?? '') > apart(base.prints[k] ?? '', again.prints[k] ?? '') + 0.01)

/**
 * The report, and whether it leaves anything to fix.
 * @param {{ base: Run, again: Run, runs: Record<string, Run>, lang: string, langOf: (text: string) => string, seconds: number }} played
 */
export function say({ base, again, runs, lang, langOf, seconds }) {
  const lines = /** @type {string[]} */ ([]), fix = /** @type {string[]} */ ([])
  const both = (/** @type {string} */ line) => (lines.push(line), fix.push(line))
  if (base.timeout) {
    both(base.frames ? `Too slow: ${base.frames} frames of ${FRAMES} in ${seconds} s, about ${Math.round((seconds * 1000) / base.frames)} ms a frame against 16.7. Draw less: fewer objects, smaller textures, fewer effects.` : `The game froze: no frame came in ${seconds} s.`)
    return { clean: false, text: lines.join('\n') }
  }
  for (const [i, fault] of base.errors.entries()) {
    if (base.errors.findIndex((one) => one.message === fault.message && (one.line ?? 0) === (fault.line ?? 0)) !== i || (!fault.line && base.errors.some((one) => one.line && one.message === fault.message))) continue
    const hint = HINTS.find(([pattern]) => pattern.test(fault.message))?.[1]
    both(`${fault.line ? `Error at line ${fault.line}` : 'Error'}${fault.frame ? ` (frame ${fault.frame})` : ''}: ${fault.name ? `${fault.name}: ` : ''}${fault.message}${hint ? ` (${hint})` : ''}.`)
  }
  if (base.violations.length) both(`Blocked: ${[...new Set(base.violations)].join(', ')}. Nothing loads from the internet or from files: draw and sound everything from code.`)
  if (base.alerts.length) both('alert(), confirm() and prompt() show nothing here: put the words on the screen.')
  const moments = base.states.map(([, name]) => name)
  if (moments.includes('play')) lines.push(`Moments: ${moments.slice(0, 8).join(' → ')}.`)
  else both(`It never called host.state('play') after a was pressed${moments.length ? ` (moments: ${moments.join(' → ')})` : ''}.`)
  const did = Object.keys(runs).filter((action) => !runs[action].timeout && changed(runs[action], base, again)), not = Object.keys(runs).filter((action) => !did.includes(action))
  if (did.length) lines.push(`${did.join(', ')} changed the picture${not.length ? `; ${not.join(', ')} changed nothing` : ''}.`)
  else both(`No control changed the picture (${not.join(', ')}).`)
  const playing = base.prints.slice(Math.ceil(START.to / 10))
  if (playing.length > 1 && playing.every((print) => apart(print, playing[0]) === 0)) lines.push('During play, nothing moved by itself.')
  const words = [...base.words, base.text].join(' ').trim()
  if (words) lines.push(`Words seen: ${[...base.words.slice(0, 6), base.text.slice(0, 80)].filter(Boolean).join(' · ').replace(/\s+/g, ' ')}.`)
  // Without lone letters, which a game's words name keys with ("Press A"), and which read as Czech's and Hungarian's "a".
  if (base.crowded?.length) both(`Words over other words, where the player reads them: ${base.crowded.join('; ')}. Move them apart, or show one at a time.`)
  if (words && langOf(words.replace(/(?<!\p{L})\p{Script=Latin}(?!\p{L})/gu, ' ')) !== lang.split('-')[0]) both(`The words the player sees aren't in ${new Intl.DisplayNames(['en'], { type: 'language' }).of(lang) ?? lang}, the user's language.`)
  lines.push(`Work per frame: ${base.work.mean.toFixed(1)} ms on average, ${Math.round(base.work.worst)} ms at worst; a frame is 16.7 ms.`)
  if (!moments.includes('over') && !moments.includes('won')) lines.push("Not reached while testing: over or won, fine if the tester just survived.")
  lines.push(fix.length ? `To fix: ${fix.length}.` : 'Nothing to fix.')
  return { clean: !fix.length, text: lines.join('\n') }
}
