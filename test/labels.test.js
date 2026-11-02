import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'

// RGAA 11.1 names a field by a <label for>, aria-labelledby, a title or aria-label, and asks a field
// named by aria-label alone to carry a title too, or visible words beside it. So every <label> in
// Jean's templates points at its field, and a field never leans on aria-label alone.
const ROOT = new URL('../', import.meta.url)
const FIELD = /^(input|select|textarea)$/
const TYPED = /\brole=["'](textbox|combobox|searchbox|spinbutton)["']|\scontenteditable\b/

/** Every .js of app/ (not its vendor/) and site/. */
async function files() {
  const found = []
  for (const dir of ['app', 'site']) {
    for (const entry of await readdir(new URL(`${dir}/`, ROOT), { recursive: true, withFileTypes: true })) {
      const path = `${entry.parentPath}/${entry.name}`.slice(new URL(ROOT).pathname.length)
      if (entry.isFile() && entry.name.endsWith('.js') && !path.startsWith('app/vendor/')) found.push(path)
    }
  }
  return found
}

/**
 * The tags a template writes, each with its name, its attributes' text and its line: a scan that steps
 * over quotes and ${…}, whose arrows and comparisons hold a '>'.
 * @param {string} text
 */
export function* tags(text) {
  for (const match of text.matchAll(/<([a-z][a-z0-9-]*)(?=[\s>/])/g)) {
    let depth = 0, quote = '', end = -1
    for (let i = match.index + match[0].length; i < text.length && i < match.index + 4000; i++) {
      const c = text[i]
      if (depth) { if (c === '{') depth++; else if (c === '}') depth--; continue }
      if (quote) { if (c === quote) quote = ''; continue }
      if (c === '$' && text[i + 1] === '{') { depth = 1; i++ } else if (c === '"' || c === "'") quote = c
      else if (c === '>') { end = i; break } else if (c === '<' || c === '`') break
    }
    if (end < 0) continue
    yield { name: match[1], attributes: text.slice(match.index + match[0].length, end), line: text.slice(0, match.index).split('\n').length }
  }
}

/** What fails 11.1 in one module's text. @param {string} text */
export function unlabelled(text) {
  const found = []
  for (const { name, attributes, line } of tags(text)) {
    const has = (/** @type {string} */ attribute) => new RegExp(`(^|\\s)${attribute}=`).test(attributes)
    if (name === 'label' && !has('for')) found.push(`${line}: <label> with no for`)
    const field = FIELD.test(name) || TYPED.test(attributes)
    const hidden = /\btype=["']hidden["']|aria-hidden=["']true["']|tabindex=["']-1["']/.test(attributes)
    if (field && !hidden && has('aria-label') && !has('title')) found.push(`${line}: <${name}> named by aria-label alone`)
  }
  return found
}

test('the scan reads a template as a browser would', () => {
  assert.deepEqual(unlabelled('html`<label>Name<input name="n"></label>`'), ['1: <label> with no for'])
  assert.deepEqual(unlabelled('html`<label for=${id}>Name</label><input id=${id} @input=${(e) => e.a > 1 && go()}>`'), [])
  assert.deepEqual(unlabelled('html`\n<input type="search"\n  aria-label=${t("find")}>`'), ['2: <input> named by aria-label alone'])
  assert.deepEqual(unlabelled('html`<input aria-label="Find" title="Find"><input type="file" aria-label="x" aria-hidden="true" tabindex="-1">`'), [])
  assert.deepEqual(unlabelled('html`<div role="textbox" contenteditable aria-label=${name}></div>`'), ['1: <div> named by aria-label alone'])
  assert.deepEqual(unlabelled('if (a <label) b()'), [])
})

test('every label points at its field, and no field is named by aria-label alone', async () => {
  const failures = []
  for (const path of await files()) {
    for (const failure of unlabelled(await readFile(new URL(path, ROOT), 'utf8'))) failures.push(`${path}:${failure}`)
  }
  assert.deepEqual(failures, [])
})
