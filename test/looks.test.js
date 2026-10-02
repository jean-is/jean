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
  test(`every rule of ui/looks/${id}.css starts with :root[data-look='${id}']`, async () => {
    const css = (await readFile(new URL(`../ui/looks/${id}.css`, import.meta.url), 'utf8')).replace(/\/\*[\s\S]*?\*\//g, '')
    const preludes = [...css.matchAll(/([^{};]+)\{/g)].map((match) => match[1].trim()).filter((prelude) => !prelude.startsWith('@'))
    assert.ok(preludes.length > 10)
    for (const prelude of preludes) {
      for (const selector of selectors(prelude)) assert.ok(selector.startsWith(`:root[data-look='${id}']`), selector)
    }
  })
}

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
