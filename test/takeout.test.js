// Bringing in Gemini's export from Google Takeout (D340): its answers' HTML as Markdown, its Gems,
// its requests as conversations, and the whole of it into a project, a zip or a tgz, once only.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { memoryFS } from '../app/core/fs.js'
import { writeZip } from '../app/core/zip.js'
import { loadConversation, listConversations } from '../app/core/conversations.js'
import { listProjects, parseFrontMatter } from '../app/core/settings.js'
import { markdownOf, gemsOf, activitiesOf, conversationsOf, importTakeout, unpack } from '../app/caps/backup/takeout.js'

const encoder = new TextEncoder()
const DIR = 'Takeout/My Activity/Gemini Apps/'

/** An activity as Takeout writes Gemini's. @param {Record<string, any>} fields */
const activity = (fields) => ({ header: 'Gemini Apps', products: ['Gemini Apps'], activityControls: ['Gemini Apps Activity'], ...fields })

/** A tar of the files, a long path in a pax header, as tar writes one. @param {{ path: string, bytes: Uint8Array }[]} files */
function tar(files) {
  const blocks = []
  const header = (/** @type {string} */ name, /** @type {number} */ size, /** @type {string} */ type) => {
    const block = new Uint8Array(512)
    block.set(encoder.encode(name).subarray(0, 100), 0)
    block.set(encoder.encode(size.toString(8).padStart(11, '0')), 124)
    block.set(encoder.encode(type), 156)
    block.set(encoder.encode('ustar\u000000'), 257)
    return block
  }
  const padded = (/** @type {Uint8Array} */ bytes) => [bytes, new Uint8Array((512 - (bytes.length % 512)) % 512)]
  for (const file of files) {
    if (file.path.length > 100) {
      const body = ` path=${file.path}\n`
      const record = encoder.encode(`${body.length + 3}${body}`)
      blocks.push(header('PaxHeader', record.length, 'x'), ...padded(record))
    }
    blocks.push(header(file.path.slice(-100), file.bytes.length, '0'), ...padded(file.bytes))
  }
  blocks.push(new Uint8Array(1024))
  return new Uint8Array(blocks.flatMap((block) => [...block]))
}

/** A zip of the files. @param {{ path: string, bytes: Uint8Array }[]} files */
const zip = (files) => writeZip(files.map(({ path, bytes }) => ({ name: path, bytes })))

const gzip = async (/** @type {Uint8Array} */ bytes) => new Uint8Array(await new Response(new Blob([/** @type {BlobPart} */ (bytes)]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer())

test('an answer’s HTML is Markdown: paragraphs, headings, emphasis, lists, code, links, quotes, tables', () => {
  assert.equal(markdownOf('<p>The capital is <strong>Paris</strong> &amp; <em>not</em> Lyon.</p>\n<p>Second.</p>'), 'The capital is **Paris** & *not* Lyon.\n\nSecond.')
  assert.equal(markdownOf('<h2>Plan</h2><ul><li>Morning<ul><li>Louvre</li></ul></li><li>Lunch</li></ul><ol start="3"><li>Three</li><li>Four</li></ol>'),
    '## Plan\n\n- Morning\n   - Louvre\n- Lunch\n\n3. Three\n4. Four')
  assert.equal(markdownOf('<p>Run <code>npm&nbsp;test</code>:</p><pre><code class="language-js">const a = 1 &lt; 2\n  b()\n</code></pre>'), 'Run `npm test`:\n\n```js\nconst a = 1 < 2\n  b()\n```')
  assert.equal(markdownOf('<p>See <a href="https://example.org/?a=1&amp;b=2">this</a> and <a href="javascript:alert(1)">that</a>.</p>'), 'See [this](https://example.org/?a=1&b=2) and that.')
  assert.equal(markdownOf('<blockquote><p>One</p><p>Two</p></blockquote><hr><p>After <img src="x.png" alt="a cat"></p>'), '> One\n>\n> Two\n\n---\n\nAfter a cat')
  assert.equal(markdownOf('<table><thead><tr><th>City</th><th>Days</th></tr></thead><tbody><tr><td>Paris</td><td>2</td></tr></tbody></table>'),
    '| City | Days |\n| --- | --- |\n| Paris | 2 |')
  assert.equal(markdownOf('a < b, <!-- note --><script>x</script>'), 'a < b, x')
})

test('Gems are read by the place of their labels, in any language', () => {
  const html = '<div><b>Name:</b>Recipe Helper<br><b>Custom instructions:</b>Suggest a dinner.<br><br>Keep it &lt;30 minutes.<br><b>Number of files:</b><br><a href="https://example.org/f">pantry.pdf</a><br><br><br><b>Nom :</b>Voyages<br><b>Instructions personnalisées :</b>Trois jours.<br><br><b>Name:</b><br><b>Custom instructions:</b><br><br></div>'
  assert.deepEqual(gemsOf(html), [
    { name: 'Recipe Helper', instructions: 'Suggest a dinner.\n\nKeep it <30 minutes.' },
    { name: 'Voyages', instructions: 'Trois jours.' },
  ])
  assert.deepEqual(gemsOf('<div></div>'), [])
})

test('requests are Gemini’s activities that ask or answer, oldest first, grouped by their link or by time', () => {
  const json = JSON.stringify([
    activity({ title: 'Prompted And dinner?', time: '2026-01-02T10:10:00Z', titleUrl: 'https://gemini.google.com/app/abc123def' }),
    activity({ title: 'Gave feedback', time: '2026-01-02T10:09:00Z' }),
    { header: 'Search', title: 'Searched for Paris', time: '2026-01-02T10:08:00Z' },
    activity({ title: 'Prompted Plan a day in Paris', time: '2026-01-02T10:00:00Z', titleUrl: 'https://gemini.google.com/app/abc123def', safeHtmlItem: [{ html: '<p>Start at the <b>Louvre</b>.</p>' }], imageFile: 'map.png', attachedFiles: ['notes.txt'] }),
    activity({ title: 'Prompted Hello', time: '2026-01-01T08:00:00Z' }),
    activity({ title: 'Prompted A poem', time: '2026-01-01T08:20:00Z', safeHtmlItem: [{ html: '<p>See https://gemini.google.com/app/notThisOne</p>' }] }),
    activity({ title: 'Prompted Later', time: '2026-01-01T09:00:00Z' }),
  ])
  const activities = activitiesOf(json, DIR)
  assert.deepEqual(activities.map((item) => item.request), ['Hello', 'A poem', 'Later', 'Plan a day in Paris', 'And dinner?'])
  assert.deepEqual(activities[3], { time: '2026-01-02T10:00:00.000Z', request: 'Plan a day in Paris', answer: 'Start at the **Louvre**.', files: ['map.png', 'notes.txt'], dir: DIR, link: 'abc123def' })
  assert.equal(activities[1].link, '', 'a link in the answer is not its conversation')
  assert.deepEqual(conversationsOf(activities).map(([, list]) => list.map((item) => item.request)), [['Hello', 'A poem'], ['Later'], ['Plan a day in Paris', 'And dinner?']])
  assert.deepEqual(activitiesOf('not json', DIR), [])
  assert.deepEqual(activitiesOf('{"conversations":[]}', DIR), [])
})

/** An export as Takeout makes it, its parts as files. */
function exportFiles() {
  const activities = [
    activity({ title: 'Prompted What is in this picture?', time: '2026-01-02T10:00:00Z', titleUrl: 'https://gemini.google.com/app/c1c1c1', imageFile: 'cat.png', safeHtmlItem: [{ html: '<p>A <strong>cat</strong>.</p>' }] }),
    activity({ title: 'Prompted Its name?', time: '2026-01-02T10:01:00Z', titleUrl: 'https://gemini.google.com/app/c1c1c1', safeHtmlItem: [{ html: '<p>Felix.</p>' }] }),
    activity({ title: 'Prompted Summarise my notes', time: '2026-01-03T09:00:00Z', titleUrl: 'https://gemini.google.com/app/c2c2c2', attachedFiles: ['notes.txt'] }),
  ]
  return [
    { path: `${DIR}MyActivity.json`, bytes: encoder.encode(JSON.stringify(activities.reverse())) },
    { path: `${DIR}cat.png`, bytes: new Uint8Array([137, 80, 78, 71]) },
    { path: `${DIR}notes.txt`, bytes: encoder.encode('Buy milk') },
    { path: 'Takeout/Gemini/gemini_gems_data.html', bytes: encoder.encode('<div><b>Name:</b>Chef<br><b>Custom instructions:</b>Cook with what I have.<br><br></div>') },
    { path: 'Takeout/Gemini/gemini_scheduled_actions_data.html', bytes: encoder.encode('<div></div>') },
    { path: 'Takeout/Drive/Docs/plan.md', bytes: encoder.encode('# Plan') },
    { path: 'Takeout/Mail/All mail.mbox', bytes: encoder.encode('From nobody') },
  ]
}

test('an export comes in once: its conversations, their files, its Gems as projects and its Drive', async () => {
  const fs = memoryFS()
  const projectDir = 'projects/01HOME-home'
  await fs.write(`${projectDir}/project.md`, '---\nformat: 1\ndefault: true\nname: Home\n---\n')
  const entries = await unpack(await zip(exportFiles()), 'takeout-20260103T000000Z-001.zip')
  assert.deepEqual(await importTakeout(fs, entries, { projectDir, by: 'device-1' }), { conversations: 2, gems: 1, files: 3 })

  const list = await listConversations(fs, projectDir)
  assert.deepEqual(list.map((item) => [item.title, item.createdAt, item.updatedAt]), [
    ['Summarise my notes', '2026-01-03T09:00:00.000Z', '2026-01-03T09:00:00.000Z'],
    ['What is in this picture?', '2026-01-02T10:00:00.000Z', '2026-01-02T10:01:00.000Z'],
  ])
  const picture = await loadConversation(fs, list[1].path)
  assert.ok(picture)
  assert.deepEqual(picture.records.filter((record) => record.update).map((record) => {
    const update = /** @type {any} */ (record.update)
    return [record.by, update.sessionUpdate, update.content.text ?? `${update.content.name} ${update.content.mimeType}`, record.at]
  }), [
    ['device-1', 'user_message_chunk', 'cat.png image/png', '2026-01-02T10:00:00.000Z'],
    ['device-1', 'user_message_chunk', 'What is in this picture?', '2026-01-02T10:00:00.000Z'],
    ['jean', 'agent_message_chunk', 'A **cat**.', '2026-01-02T10:00:00.000Z'],
    ['device-1', 'user_message_chunk', 'Its name?', '2026-01-02T10:01:00.000Z'],
    ['jean', 'agent_message_chunk', 'Felix.', '2026-01-02T10:01:00.000Z'],
  ])
  // A conversation's file is a ULID of its start.
  assert.equal(new Date(picture.header.createdAt).getTime(), Date.parse('2026-01-02T10:00:00Z'))
  const notes = await loadConversation(fs, list[0].path)
  const link = /** @type {any} */ (notes?.records.find((record) => /** @type {any} */ (record.update)?.content?.type === 'resource_link')?.update).content
  assert.equal(await fs.read(`${projectDir}/${link.uri.replace(/\.txt$/, '.md')}`), '[[page 1]]\nBuy milk')

  const chef = (await listProjects(fs)).find((project) => project.data.name === 'Chef')
  assert.ok(chef)
  assert.equal(parseFrontMatter((await fs.read(`${chef.dir}/instructions.md`)) ?? '').body.trim(), 'Cook with what I have.')
  const files = (await fs.list(`${projectDir}/files`)).map((entry) => entry.name)
  assert.equal(files.filter((name) => name.endsWith('.meta.json')).length, 3, 'the picture, the notes and the plan, not the mail')

  // Again: nothing new.
  assert.deepEqual(await importTakeout(fs, entries, { projectDir, by: 'device-1' }), { conversations: 0, gems: 0, files: 1 })
  assert.equal((await listConversations(fs, projectDir)).length, 2)
  assert.equal((await listProjects(fs)).length, 2)
})

test('a tgz, a long path in a pax header, reads as a zip does; what isn’t Gemini’s is not brought in', async () => {
  const deep = `Takeout/Drive/${'folder/'.repeat(15)}deep.md`
  const entries = await unpack(await gzip(tar([...exportFiles(), { path: deep, bytes: encoder.encode('# Deep') }])), 'takeout.tgz')
  assert.ok(entries.some((entry) => entry.path === deep))
  const fs = memoryFS()
  assert.deepEqual(await importTakeout(fs, entries, { projectDir: 'projects/p', by: 'd' }), { conversations: 2, gems: 1, files: 4 })

  const alone = await unpack(encoder.encode(JSON.stringify([activity({ title: 'Prompted Hi', time: '2026-01-01T00:00:00Z' })])), 'MyActivity.json')
  assert.deepEqual(await importTakeout(memoryFS(), alone, { projectDir: 'projects/p', by: 'd' }), { conversations: 1, gems: 0, files: 0 })
  const pages = [{ path: `${DIR}MyActivity.html`, bytes: encoder.encode('<div class="outer-cell">Gemini Apps</div>') }]
  assert.equal(await importTakeout(memoryFS(), await unpack(await zip(pages), 'takeout.zip'), { projectDir: 'projects/p', by: 'd' }), 'html')
  const other = [{ path: 'Takeout/Drive/a.md', bytes: encoder.encode('a') }]
  assert.equal(await importTakeout(memoryFS(), await unpack(await zip(other), 'takeout.zip'), { projectDir: 'projects/p', by: 'd' }), null)
})
