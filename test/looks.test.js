// Looks (D111): each one's style sheet stays within it, and the user's touches only ever write
// checked values into CSS.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { LOOKS, LOOK_KEY, lookId, touched } from '../ui/looks.js'
import { customCSS, FONTS } from '../ui/touches.js'

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8')

/** Selectors split at their top-level commas, not those inside :is(). @param {string} list */
function selectors(list) {
  const found = []
  let depth = 0
  let start = 0
  for (let i = 0; i < list.length; i++) {
    if (list[i] === '(') depth++
    else if (list[i] === ')') depth--
    else if (list[i] === ',' && !depth) [found[found.length], start] = [list.slice(start, i), i + 1]
  }
  return [...found, list.slice(start)].map((selector) => selector.trim())
}

for (const id of Object.keys(LOOKS).filter((id) => id !== 'room')) {
  test(`every rule of ui/looks/${id}.css starts with :root[data-look='${id}'], and its keyframes with ${id}-`, async () => {
    const css = (await readFile(new URL(`../ui/looks/${id}.css`, import.meta.url), 'utf8')).replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/@keyframes\s+([\w-]+)\s*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, (_, name) => (assert.ok(name.startsWith(`${id}-`), `@keyframes ${name}`), ''))
    const preludes = [...css.matchAll(/([^{};]+)\{/g)].map((match) => match[1].trim()).filter((prelude) => !prelude.startsWith('@'))
    assert.ok(preludes.length > 10)
    for (const prelude of preludes) {
      for (const selector of selectors(prelude)) assert.ok(selector.startsWith(`:root[data-look='${id}']`), selector)
    }
  })
}

// Text meets WCAG AA (4.5:1) on both surfaces, by night and by day: every look's own tokens.
/** sRGB, 0–1, gamma-encoded, of an oklch() colour. @param {number} L @param {number} C @param {number} H */
function srgb(L, C, H) {
  const [a, b] = [C * Math.cos((H * Math.PI) / 180), C * Math.sin((H * Math.PI) / 180)]
  const [l, m, s] = [L + 0.3963377774 * a + 0.2158037573 * b, L - 0.1055613458 * a - 0.0638541728 * b, L - 0.0894841775 * a - 1.291485548 * b].map((v) => v ** 3)
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s]
    .map((v) => Math.min(1, Math.max(0, v))).map((v) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055))
}
/** @param {number[]} rgb */
const luminance = (rgb) => rgb.map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)).reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0)
/** A token's colour over a background, its alpha blended in. @param {Record<string, string>} tokens @param {string} name @param {number[]} [under] */
function colour(tokens, name, under) {
  const value = tokens[name]?.trim() ?? ''
  const ref = /^var\(--([\w-]+)\)$/.exec(value)
  if (ref) return colour(tokens, ref[1], under)
  const [, L, C, H, A = '1'] = /^oklch\(([\d.]+) ([\d.]+) ([\d.]+)(?: \/ ([\d.]+))?\)$/.exec(value) ?? assert.fail(`--${name}: ${value}`)
  return srgb(+L, +C, +H).map((v, i) => v * +A + (under?.[i] ?? 0) * (1 - +A))
}
/** @param {number[]} a @param {number[]} b */
const contrast = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }
/** The custom properties a rule sets. @param {string} css @param {string} selector */
const tokensOf = (css, selector) => Object.fromEntries([...(css.split(`${selector} {`)[1]?.split('}')[0] ?? '').matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2]]))

for (const id of Object.keys(LOOKS).filter((id) => id !== 'room')) {
  test(`ui/looks/${id}.css reads at AA contrast in light and dark`, async () => {
    const css = (await readFile(new URL(`../ui/looks/${id}.css`, import.meta.url), 'utf8')).replace(/\/\*[\s\S]*?\*\//g, '')
    const dark = tokensOf(css, `:root[data-look='${id}']`)
    for (const [mode, tokens] of [['dark', dark], ['light', { ...dark, ...tokensOf(css, `:root[data-look='${id}'][data-theme='light']`) }]]) {
      const room = colour(tokens, 'room')
      for (const surface of [room, colour(tokens, 'room-2', room)]) {
        for (const text of ['ink', 'ink-soft', 'ink-faint', 'flame']) {
          const ratio = contrast(colour(tokens, text, surface), surface)
          assert.ok(ratio >= 4.5, `${mode} --${text}: ${ratio.toFixed(2)}`)
        }
      }
      const flame = colour(tokens, 'flame', room)
      assert.ok(contrast(colour(tokens, 'on-flame', flame), flame) >= 4.5, `${mode} --on-flame`)
    }
  })
}

// Its name is in the room's catalogue, for the user's menu too (D153).
test('every look has a name and a thumbnail in Settings', async () => {
  const room = JSON.parse(await readFile(new URL('../locales/en.json', import.meta.url), 'utf8'))
  const sheet = await readFile(new URL('../ui/dialogs.css', import.meta.url), 'utf8')
  for (const id of Object.keys(LOOKS)) {
    assert.ok(room[`look.${id}.name`], id)
    assert.ok(sheet.includes(`[data-look-preview='${id}'] {`) && sheet.includes(`[data-theme='light'] [data-look-preview='${id}'] {`), id)
  }
})

test('a look is applied before the first paint, with the key ui/looks.js uses', () => {
  const script = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1] ?? ''
  assert.ok(script.includes(`localStorage.getItem('${LOOK_KEY}')`))
  assert.ok(script.includes('ui/looks/${look}.css'))
})

test('an unknown look is the room', () => {
  assert.equal(lookId('mail'), 'mail')
  assert.equal(lookId('../style'), 'room')
  assert.equal(lookId('toString'), 'room')
  assert.equal(lookId(undefined), 'room')
})

test('no touches, no CSS', () => {
  assert.equal(customCSS(), '')
  assert.equal(customCSS({ id: 'mail' }), '')
  assert.equal(touched({ id: 'paper' }), false)
  assert.equal(touched({ id: 'paper', size: 1.1 }), true)
})

test('colours keep their hue at readable lightnesses, by night and by day', () => {
  const css = customCSS({ accent: '#3366ff', background: '#102030' })
  assert.match(css, /:root \{ --tint: #3366ff; --flame: oklch\(from #3366ff 0\.78 /)
  assert.match(css, /:root\[data-theme='light'\] \{ --flame: oklch\(from #3366ff 0\.5 /)
  assert.match(css, /--room: oklch\(from #102030 clamp\(0\.1, l, 0\.22\)/)
  assert.match(css, /--room: oklch\(from #102030 clamp\(0\.93, l, 0\.99\)/)
  // A project's light, an inline --tint, still wins over the accent's.
  assert.doesNotMatch(css, /--tint: [^;]+!important/)
})

test('only checked values are written into CSS', () => {
  const css = customCSS({ accent: 'red; } body { display: none', background: 'url(https://example.com/x)', size: 9, font: 'Comic Sans', css: '' })
  assert.equal(css, '')
  assert.equal(customCSS({ size: 1 }), '', 'the browser’s own size')
  assert.equal(customCSS({ size: 1.15 }), 'html { font-size: 115%; }')
  assert.equal(customCSS({ font: 'serif' }), `:root { --sans: ${FONTS.serif} !important; }`)
})

test('the user’s own CSS comes last, as they wrote it', () => {
  const own = '.msg-user { border-radius: 0; }'
  const css = customCSS({ accent: '#aa3300', css: own })
  assert.ok(css.endsWith(own))
})
