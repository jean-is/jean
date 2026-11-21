// SPDX-License-Identifier: MIT
// A collection's own form (caps/collect/form.js): the columns it can ask, what asks each, and the page a published site's script reads (D751).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { askable, partsOf, pageOf } from '../app/caps/collect/form.js'
import { createTable } from '../app/caps/tables/table.js'
import { formed } from '../app/caps/sites/replies.js'

const table = createTable({ name: 'Sign-ups', columns: [{ name: 'Name', type: 'text' }, { name: 'Email', type: 'email' }, { name: 'Session', type: 'select', options: ['5 Dec', '12 Dec'] }, { name: 'Places', type: 'number' },
  { name: 'When', type: 'date', time: true }, { name: 'Note', type: 'text' }, { name: 'Paid', type: 'checkbox' }, { name: 'Who', type: 'person' }, { name: 'Tags', type: 'multi-select' }, { name: 'Files', type: 'files' },
  { name: 'Step', type: 'status', options: ['To do', 'Done'] }, { name: 'Town', type: 'select', options: ['a', 'b', 'c', 'd', 'e', 'f'] }, { name: 'Other', type: 'select' }] }, { id: '01JD0000000000000000000000', author: 'user', at: '2026-11-20T10:00:00.000Z' })
const words = { pick: 'Choose', send: 'Send', sent: 'Thank you.', unsent: 'Not sent.' }

test('askable: words, numbers, days, one choice, boxes, links, emails and phones, in their order; the row\'s name marked; nobody\'s, several choices, files and steps left', () => {
  assert.deepEqual(askable(table).map(({ name, title }) => [name, title]), [['Name', true], ['Email', false], ['Session', false], ['Places', false], ['When', false], ['Note', false], ['Paid', false], ['Town', false], ['Other', false]])
  assert.deepEqual(askable({ ...table, properties: table.properties.map((property) => (property.name === 'Email' ? { ...property, deleted: '2026-11-20T10:00:00.000Z' } : property)) }).length, 8)
})

test('partsOf: the name on one line, required; other words on several; a box; five choices at most side by side, more in a list, none yet as words; each kind its field', () => {
  assert.deepEqual(partsOf(askable(table)).map(({ as, id, attrs }) => [as, id, attrs]), [['input', 'f0', { required: true }], ['input', 'f1', { type: 'email', autocomplete: 'email' }], ['radios', 'f2', {}],
    ['input', 'f3', { type: 'number', step: 'any', inputmode: 'decimal' }], ['input', 'f4', { type: 'datetime-local' }], ['area', 'f5', { rows: '3' }], ['tick', 'f6', { value: 'true' }], ['select', 'f7', {}], ['input', 'f8', {}]])
})

test('pageOf: one page and its style sheet; a form whose replies go to the host, each field under its column\'s name, as the site\'s script reads labels; names escaped', () => {
  const files = pageOf({ name: 'Sign-ups <b>& "co"', lang: 'ar', dir: 'rtl', parts: partsOf(askable(table)), words }), page = files.get('index.html') ?? ''
  assert.deepEqual([...files.keys()], ['index.html', 'form.css'])
  assert.ok(formed(page))
  assert.match(page, /<html lang="ar" dir="rtl">/)
  assert.match(page, /<title>Sign-ups &#60;b&#62;&#38; &#34;co&#34;<\/title>/)
  assert.ok(!page.includes('<b>'))
  assert.match(page, /<label for="f0">Name<\/label><input id="f0" name="f0" required>/)
  assert.match(page, /<fieldset><legend>Session<\/legend><label for="f2-0"><input id="f2-0" name="f2" type="radio" value="5 Dec"> 5 Dec<\/label>/)
  assert.match(page, /<label for="f6"><input id="f6" name="f6" type="checkbox" value="true"> Paid<\/label>/)
  assert.match(page, /<select id="f7" name="f7"><option value="">Choose<\/option><option>a<\/option>/)
  assert.match(page, /<textarea id="f5" name="f5" rows="3"><\/textarea>/)
  assert.match(page, /<button>Send<\/button>\n<p data-sent hidden>Thank you\.<\/p>\n<p data-unsent hidden>Not sent\.<\/p>/)
  // Nothing loaded from elsewhere, no script of its own: the host adds the one that seals.
  assert.ok(!/<script|https?:/.test(page))
})
