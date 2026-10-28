// The play-test and its report, as the `game` tool will give them: a start on `a`, then each action held in turn.
export const ACTIONS = ['left', 'right', 'up', 'down', 'a', 'b']
const diff = (a, b) => {
  if (!a || !b) return 999
  if (a.length === 576 && b.length === 576) return a.reduce((s, v, i) => s + Math.abs(v - b[i]), 0) / 576
  return JSON.stringify(a) === JSON.stringify(b) ? 0 : 999
}
const SCRIPT = { ja: /[぀-ヿ一-鿿]/, ar: /[؀-ۿ]/, fr: /[àâçéèêëîïôûùüÿœ]|\b(le|la|les|un|une|et|pour|jouer|appuie|perdu|gagné)\b/i }
const NAMES = { ja: 'Japanese', ar: 'Arabic', fr: 'French', en: 'English' }
// What a frequent error usually means, said after it.
const HINTS = [
  [/Unexpected reserved word/, 'often `await` outside an `async` function; `jean.load()` needs no `await`'],
  [/does not provide an export named/, 'not in what this engine lends: the sheet lists it'],
  [/is not a function/, "that method doesn't exist here: check its name, and what the sheet says changed"],
  [/is not defined|Can't find variable/, 'declared nowhere, or misspelt'],
  [/Cannot read properties of (undefined|null)|(undefined|null) is not an object/, 'used before it was made: check the order things are created in'],
  [/Unexpected token|Unexpected identifier|missing \)/, 'check brackets, commas and quotes on that line and the one before'],
]

/** Plays a game in the spike's page and words what it saw. */
export async function playtest (page, { code, engine, actions = ACTIONS, lang = 'en', frames = 420, timeout = engine === 'babylon' ? 60000 : 20000 }) {
  const start = [{ action: 'a', from: 20, to: 24 }]
  const run = async (press) => {
    const go = page.evaluate((a) => window.run(a), { game: 'brain', code, engine, lang, timeout, test: { frames, seed: 7, press } })
    return Promise.race([go, new Promise((resolve) => setTimeout(() => resolve({ froze: true }), timeout + 5000))])
  }
  const base = await run(start)
  if ((base.froze || base.timeout) && base.frames > 0) {
    const ms = Math.round(timeout / base.frames)
    const text = `Too slow: ${base.frames} frames of ${frames} in ${timeout / 1000} s, about ${ms} ms a frame against 16.7. Draw less: fewer meshes or sprites, smaller shadows, no glow.`
    return { clean: false, text, problems: [text], base }
  }
  if (base.froze || base.timeout) return { clean: false, froze: true, text: `The game froze: no frame came back in ${timeout / 1000} s. A loop may never end, or the page is stuck.`, problems: ['froze'], base }
  const effects = {}
  for (const action of actions) {
    const r = await run([...start, { action, from: 200, to: 260 }])
    if (r.froze || (r.timeout && !r.frames)) { effects[action] = 'froze'; continue }
    if (r.timeout) { effects[action] = 'slow'; continue }
    const i = r.prints?.findIndex((p, k) => k * 10 > 200 && diff(p, base.prints[k]) > 0)
    effects[action] = i > 0
  }
  return { ...say(base, effects, lang), base, effects }
}

/** The report, in words for the brain. */
export function say (r, effects, lang) {
  const lines = [], problems = []
  const seen = new Set()
  for (const e of r.errors ?? []) {
    const key = `${e.message}${e.line}`
    if (seen.has(key) || (!e.line && r.errors.some((one) => one.line && one.message === e.message))) continue
    seen.add(key)
    const hint = HINTS.find(([pattern]) => pattern.test(e.message))?.[1]
    const line = `${e.line ? `Error at line ${e.line}` : 'Error'}${e.frame ? ` (frame ${e.frame})` : ''}: ${e.name ? `${e.name}: ` : ''}${e.message}${hint ? ` (${hint})` : ''}`
    lines.push(line), problems.push(line)
  }
  const blocked = [...new Set(r.violations ?? [])]
  if (blocked.length) { const line = `Blocked: ${blocked.join(', ')}. Nothing loads from the internet or from files: draw and sound everything from code.`; lines.push(line), problems.push(line) }
  if (r.alerts?.length) { const line = 'alert(), confirm() and prompt() show nothing here: put the words on the screen.'; lines.push(line), problems.push(line) }
  const moments = (r.states ?? []).map(([, s]) => s)
  if (moments.includes('play')) lines.push(`Moments: ${moments.slice(0, 8).join(' → ')}.`)
  else { const line = `It never called jean.state('play') after a was pressed${moments.length ? ` (moments: ${moments.join(' → ')})` : ''}.`; lines.push(line), problems.push(line) }
  const prints = r.prints ?? []
  const canvas = prints[0]?.length === 576
  const did = Object.entries(effects).filter(([, v]) => v === true).map(([k]) => k)
  if (canvas && !did.length && prints.every((p) => diff(p, prints[0]) === 0)) { const line = 'The picture never changed.'; lines.push(line), problems.push(line) }
  const not = Object.entries(effects).filter(([, v]) => v === false).map(([k]) => k)
  const froze = Object.entries(effects).filter(([, v]) => v === 'froze').map(([k]) => k)
  if (did.length) lines.push(`${did.join(', ')} changed the picture${not.length ? `; ${not.join(', ')} changed nothing` : ''}.`)
  else if (not.length) { const line = `No control changed the picture (${not.join(', ')}).`; lines.push(line), problems.push(line) }
  if (froze.length) { const line = `It froze while ${froze.join(', ')} was held.`; lines.push(line), problems.push(line) }
  const words = [...(r.words ?? []), r.text ?? ''].join(' ')
  if (words.trim()) lines.push(`Words seen: ${[...(r.words ?? [])].slice(0, 6).join(' · ')}${r.text ? ` ${r.text.slice(0, 80).replace(/\s+/g, ' ')}` : ''}.`)
  if (SCRIPT[lang] && !SCRIPT[lang].test(words)) { const line = `No ${NAMES[lang]} in the words the player sees.`; lines.push(line), problems.push(line) }
  if (r.work) lines.push(`Work per frame: ${r.work.mean.toFixed(2)} ms on average, ${r.work.worst.toFixed(0)} ms at worst (a frame is 16.7 ms).`)
  if (moments.includes('over')) lines.push('A round ended and the game went on.')
  else lines.push('Not reached while testing: over (fine if the bot just survived).')
  lines.push(problems.length ? `To fix: ${problems.length}.` : 'Nothing to fix.')
  return { clean: !problems.length, text: lines.join('\n'), problems }
}
