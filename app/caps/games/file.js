// A game's file (D648): `games/<ulid>-<slug>.game.html`, named once and never renamed, a page whose head holds Jean's facts (its
// format, engine, the actions it uses, author, when it was made and changed, whether it is pinned, the task it came from), its
// title its name, its body a picture of it being played and the design card, and the game itself as one module in an inert script,
// which only a game's frame runs. Changed by exact passages, each found once (replaceOnce, as `edit` changes a file). Pure.

export const PLACE = /^games\/[^/]+\.game\.html$/
export const ENGINES = ['phaser', 'babylon', 'none']
export const ACTIONS = ['left', 'right', 'up', 'down', 'a', 'b']
/** A picture of the game for its card, as its play-test or its first seconds played took it (./shell.js): WebP or JPEG, 200 KB at most. */
export const PICTURE = /^data:image\/(?:webp|jpeg);base64,[A-Za-z0-9+/]{100,266000}={0,2}$/
const KEYS = ['format', 'engine', 'actions', 'author', 'created', 'changed', 'pinned', 'source']

/** @typedef {{ format?: string, engine: string, actions: string, author: string, created: string, changed: string, pinned?: string, source?: string }} Meta */
/** @typedef {{ name: string, card: string, code: string, meta: Meta, picture?: string }} Game */

/** @param {string} text */
const escaped = (text) => text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
/** @param {string} text */
const unescaped = (text) => text.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')

/** The page a game is kept as. @param {Game} game @param {string} lang */
export function fileOf({ name, card, code, meta, picture = '' }, lang) {
  const facts = KEYS.flatMap((key) => (key === 'format' ? ['<meta name="format" content="1">'] : meta[/** @type {keyof Meta} */ (key)] ? [`<meta name="${key}" content="${escaped(String(meta[/** @type {keyof Meta} */ (key)]))}">`] : []))
  return [`<!doctype html>\n<html lang="${escaped(lang)}">\n<meta charset="utf-8">`, ...facts, `<title>${escaped(name)}</title>`, ...(PICTURE.test(picture) ? [`<img id="picture" src="${picture}" alt="">`] : []),
    `<article id="card" dir="auto">${escaped(card)}</article>`, `<script type="text/x-game" id="game">\n${code.replace(/<\/(script)/gi, '<\\/$1')}\n</script>\n`].join('\n')
}

/** A game as its page holds it; null when it isn't one. @param {string} page @returns {Game | null} */
export function gameOf(page) {
  const code = /<script type="text\/x-game" id="game">\n([\s\S]*)\n<\/script>/.exec(page)?.[1]
  if (code === undefined) return null
  const meta = /** @type {Meta} */ (Object.fromEntries([...page.matchAll(/<meta name="(\w+)" content="([^"]*)">/g)].filter(([, key]) => KEYS.includes(key)).map(([, key, value]) => [key, unescaped(value)])))
  const picture = /<img id="picture" src="([^"]*)" alt="">\n<article id="card"/.exec(page)?.[1] ?? ''
  return { name: unescaped(/<title>([^<]*)<\/title>/.exec(page)?.[1] ?? ''), card: unescaped(/<article id="card" dir="auto">([^<]*)<\/article>/.exec(page)?.[1] ?? ''),
    code: code.replace(/<\\\/(script)/gi, '</$1'), meta: { ...meta, engine: ENGINES.includes(meta.engine) ? meta.engine : 'none' }, ...(PICTURE.test(picture) ? { picture } : {}) }
}

/** A game's page with its picture, the one before gone; as it was when either isn't one. @param {string} page @param {string} picture */
export const pictured = (page, picture) => ((game) => (game && PICTURE.test(picture) ? fileOf({ ...game, picture }, /<html lang="([^"]*)">/.exec(page)?.[1] ?? 'en') : page))(gameOf(page))

/** The actions a game says it uses, those Jean knows, all of them when it says none. @param {unknown} list */
export const actionsOf = (list) => ((known) => (known.length ? known : ACTIONS))((Array.isArray(list) ? list : String(list ?? '').split(/[\s,]+/)).map(String).filter((one, i, all) => ACTIONS.includes(one) && all.indexOf(one) === i))

/**
 * The code with each passage replaced, each found once, or why one can't be.
 * @param {string} code @param {{ old: string, new: string }[]} changes @returns {{ code: string } | { error: string }}
 */
export function replaceOnce(code, changes) {
  for (const [i, change] of changes.entries()) {
    const at = code.indexOf(change.old)
    if (!change.old || at < 0) return { error: `Change ${i + 1}: its old passage isn't in the game, word for word.` }
    if (code.indexOf(change.old, at + 1) >= 0) return { error: `Change ${i + 1}: its old passage is in the game more than once; give more of it.` }
    code = code.slice(0, at) + change.new + code.slice(at + change.old.length)
  }
  return { code }
}
