// A task saved as a web page (D305): the conversation's own file inside, each line the same JSON,
// in a page that runs nothing but its own drawing and reaches nothing.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pageOf, filesIn } from '../app/ui/export.js'
import { BRAND } from '../app/brand.js'

const lines = [
  { format: 1, kind: 'conversation', id: '01K7E0000000000000000000AA', createdAt: '2026-10-13T08:00:00.000Z', by: 'device' },
  { at: '2026-10-13T08:00:01.000Z', by: 'device', meta: { title: 'Plan the week' } },
  { at: '2026-10-13T08:00:02.000Z', by: 'device', update: { sessionUpdate: 'user_message_chunk', content: { type: 'text', text: 'Close it: </script><script>alert(1)</script> <!-- <script>' } } },
  { at: '2026-10-13T08:00:03.000Z', by: 'jean', step: 0, update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Done </SCRIPT >' } } },
]
const file = lines.map((line) => JSON.stringify(line) + '\n').join('')
const hash = async (/** @type {string} */ text) => `'sha256-${Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))).toString('base64')}'`

test('the page holds the conversation’s file, each line the same JSON, and nothing in it can end its block', async () => {
  const page = await pageOf(file, 'Plan the week', 'fr')
  const blocks = [...page.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script/gi)].map((match) => match[1])
  assert.equal(blocks.length, 2)
  assert.doesNotMatch(blocks[0], /</)
  assert.deepEqual(blocks[0].split('\n').filter(Boolean).map((line) => JSON.parse(line)), lines)
})

test('its name is text, in the language Jean speaks, right to left where it is read so', async () => {
  const page = await pageOf(file, 'Plan <b>the</b> week & "more"', 'ar')
  assert.match(page, /^<!doctype html>\n<html lang="ar" dir="rtl">\n<meta charset="utf-8">/)
  assert.match(page, /<title>Plan &lt;b&gt;the&lt;\/b&gt; week &amp; &quot;more&quot;<\/title>/)
  assert.match(page, /<h1 dir="auto">Plan &lt;b&gt;the&lt;\/b&gt; week &amp; &quot;more&quot;<\/h1>/)
  assert.match(await pageOf(file, 'x', 'ja'), /<html lang="ja" dir="ltr">/)
})

test('it names Jean as what made it', async () => {
  assert.match(await pageOf(file, 'Plan the week', 'en'), new RegExp(`\n<meta name="generator" content="${BRAND.name}">\n`))
})

test('its policy lets only its own style and drawing in, by their hashes, and its pictures, and nothing reached', async () => {
  const page = await pageOf(file, 'Plan the week', 'en')
  const policy = /<meta http-equiv="Content-Security-Policy" content="([^"]+)">/.exec(page)?.[1]
  const style = /<style>([\s\S]*?)<\/style>/.exec(page)?.[1] ?? ''
  const drawing = /<script>([\s\S]*?)<\/script>/.exec(page)?.[1] ?? ''
  assert.equal(policy, `default-src 'none'; img-src data:; style-src ${await hash(style)}; script-src ${await hash(drawing)}`)
  assert.ok(page.indexOf('Content-Security-Policy') < page.indexOf('<style>'))
})

test('with the render package, it loads Jean’s modules from there, each by its hash, and reaches nothing else but the map service and a score’s instruments', async () => {
  const base = 'https://cdn.example/npm/@jean-is/render@0.8.0-r0123456789ab/'
  const entry = `${base}ui/reader.js`
  const reader = {
    base, entry, imports: { 'lit-html': `${base}vendor/lit-html/lit-html.js`, [`${base}ui/state.js`]: `${base}ui/reader-state.js` },
    integrity: { [entry]: 'sha256-AAAA', [`${base}ui/reader-state.js`]: 'sha256-BBBB' },
    settings: { look: 'mail', kinds: ['echarts'], pages: { scripts: true, maps: true }, mapStyles: { light: 'https://maps.example/</script>' }, urls: { sounds: 'https://cdn.example/npm/@jean-is/sounds@1.0.0/' } },
    sites: ['https://maps.example', 'https://cdn.example/npm/@jean-is/sounds@1.0.0/'],
  }
  const page = await pageOf(file, 'Plan the week', 'en', { reader })
  const policy = /<meta http-equiv="Content-Security-Policy" content="([^"]+)">/.exec(page)?.[1] ?? ''
  assert.match(policy, new RegExp(`script-src 'unsafe-inline' 'wasm-unsafe-eval' data: blob: ${base}; `), 'WebAssembly for a score\'s instruments (D338)')
  assert.match(policy, new RegExp(`connect-src ${base} https://maps.example https://cdn.example/npm/@jean-is/sounds@1.0.0/; `))
  assert.match(policy, /; media-src data: blob:; /, 'its files\' sounds and films')
  assert.match(policy, /^default-src 'none'; .*form-action 'none'$/)
  const blocks = [...page.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script/gi)].map(([, attributes, text]) => ({ attributes, text }))
  assert.deepEqual(blocks.map((one) => one.attributes.trim()), ['type="application/jsonl"', '', 'type="application/json" id="settings"', 'type="importmap"',
    `type="module" src="${entry}" integrity="sha256-AAAA" crossorigin="anonymous"`])
  assert.deepEqual(JSON.parse(blocks[2].text), reader.settings)
  assert.deepEqual(JSON.parse(blocks[3].text), { imports: reader.imports, integrity: reader.integrity })
  for (const { text } of blocks.slice(2)) assert.doesNotMatch(text, /</)
})

test('the files the task made and was given are in it, by their addresses, before the lines that show them', async () => {
  const files = { 'files/sha256-ab.png': 'data:image/png;base64,iVBORw0KGgo=', 'files/sha256-cd.pdf': 'data:application/pdf;base64,JVBERi0xLjc=' }
  const page = await pageOf(file, 'Plan the week', 'en', { files })
  const blocks = [...page.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script/gi)].map(([, attributes, text]) => ({ attributes: attributes.trim(), text }))
  assert.deepEqual(blocks.map((one) => one.attributes), ['type="application/jsonl"', 'type="application/json" id="files"', ''])
  assert.deepEqual(JSON.parse(blocks[1].text), files)
  assert.doesNotMatch(await pageOf(file, 'Plan the week', 'en'), /id="files"/)
})

test('a task names the files its calls made, then those shared with it, by their places in its project', () => {
  const made = { uri: 'files/sha256-bb.docx', name: 'Letter.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: 9 }
  const picture = { uri: 'files/sha256-aa.png', name: 'Cat.png', mimeType: 'image/png', size: 3 }
  const records = [
    { update: { sessionUpdate: 'user_message_chunk', content: { type: 'resource_link', uri: 'files/sha256-cc.pdf', name: 'Notes.pdf', mimeType: 'application/pdf' } } },
    // A file a share calls "a file", with no address: not one of its own.
    { update: { sessionUpdate: 'user_message_chunk', content: { type: 'resource_link', uri: '', name: 'a file' } } },
    { update: { sessionUpdate: 'tool_call', toolCallId: 'c1', title: '', status: 'completed', _meta: { file: made } } },
    { update: { sessionUpdate: 'tool_call', toolCallId: 'c2', title: '', status: 'completed', _meta: { picture } } },
  ]
  assert.deepEqual(filesIn(records).map((one) => one.uri), ['files/sha256-bb.docx', 'files/sha256-aa.png', 'files/sha256-cc.pdf'])
})
