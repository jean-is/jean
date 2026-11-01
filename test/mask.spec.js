// Masked requests (D681, ee/): a brain in the cloud reads what the organisation hides as marks, on every road a request
// takes, and the person sees it real. Each engine runs it: its patterns are the engine's. A brain on this computer keeps it
// here, so these answer from elsewhere; on localhost no key is needed.
import { readFile } from 'node:fs/promises'
import { test, expect } from '@playwright/test'
import { readZip } from '../app/core/zip.js'
import { start, ask, withPolicy, openData } from './helpers.js'

const FAR = 'https://ai.corp.example/v1'
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }
const BRAIN = { provider: 'custom', api: 'openai', baseURL: FAR, model: 'fake-brain-1' }
const SECRET = 'Projet Hermès'
const PERSON = 'Marie Dupont'
const EMAIL = 'marie.dupont@acme.example'
const CARD = '4111 1111 1111 1111'
const POLICY = { dlp: { detect: ['card'], mask: { words: [SECRET, PERSON], hide: ['email'] } }, brains: [{ ...BRAIN, id: 'corp', label: 'Corp AI' }] }
const MARKS = /⟦[A-Z][0-9a-f]{6,}⟧/g

/** What a far brain answers, as an OpenAI-compatible stream, a chunk of its own for each delta. @param {any[]} deltas @param {string} [finish] */
const stream = (deltas, finish = 'stop') => [...deltas.map((delta) => ({ choices: [{ index: 0, delta }] })), { choices: [{ index: 0, delta: {}, finish_reason: finish }] }].map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join('') + 'data: [DONE]\n\n'

/**
 * A far brain, noting each request; what it says comes from `answer`, or the fake brain's. @param {import('@playwright/test').Page} page
 * @param {(body: any) => string | undefined} [answer]
 */
async function farBrain(page, answer = () => undefined) {
  const asked = /** @type {string[]} */ ([])
  await page.route(`${FAR}/**`, async (route) => {
    const request = route.request()
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    const chat = request.url().endsWith('/chat/completions')
    if (chat) asked.push(String(request.postData()))
    const said = chat ? answer(JSON.parse(String(request.postData()))) : undefined
    if (said !== undefined) return route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'text/event-stream' }, body: said })
    // A reply can come after a test has moved on.
    const response = await route.fetch({ url: request.url().replace(FAR, 'http://127.0.0.1:4181/v1') }).catch(() => null)
    return response && route.fulfill({ response, headers: { ...response.headers(), ...CORS } }).catch(() => {})
  })
  return asked
}
const useCorp = (/** @type {import('@playwright/test').Page} */ page) => page.evaluate(async () => { await (await import('/ui/state.js')).updateSettings({ activeBrain: 'corp' }) })
const quiet = (/** @type {import('@playwright/test').Page} */ page) => expect(page.locator('.msg-jean.is-streaming')).toHaveCount(0)

test('a brain in the cloud reads marks, and the person the real thing', async ({ page }) => {
  const asked = await farBrain(page)
  await withPolicy(page, POLICY)
  await start(page)
  await useCorp(page)
  // Settings says so, and that it isn't anonymous.
  const settings = await openData(page, 'organization')
  await expect(settings).toContainText('That isn’t anonymous')
  await page.keyboard.press('Escape')

  await ask(page, `Say hello to ${EMAIL} about ${SECRET}, card ${CARD}`)
  await expect.poll(() => asked.length).toBeGreaterThan(0)
  await quiet(page)
  const { id } = await page.evaluate(async () => (await import('/ui/state.js')).app.current.value?.header ?? {})
  for (const body of asked) {
    for (const value of [SECRET, 'Herm', EMAIL, 'marie.dupont', CARD, '4111']) expect(body, value).not.toContain(value)
    // Nor the task's own id, which keys its marks.
    if (id) expect(body).not.toContain(id)
  }
  expect(asked.join()).toMatch(/⟦W[0-9a-f]{6,}⟧/)
  expect(asked.join()).toMatch(/⟦E[0-9a-f]{6,}⟧/)
  expect(asked.join()).toMatch(/⟦I[0-9a-f]{6,}⟧/)
  // What the person asked stays as they wrote it, in their task.
  await expect(page.locator('.msg-user').last()).toContainText(SECRET)

  // The card under the answer says what the brain didn't see, and what it read.
  await page.getByRole('button', { name: 'What the brain didn’t see' }).last().click()
  const card = page.locator('.receipt:popover-open')
  await expect(card).toContainText(SECRET)
  await expect(card).toContainText(EMAIL)
  await expect(card).toContainText('That isn’t anonymous')
  await card.locator('summary').first().click()
  await expect(card.locator('.receipt-read')).toContainText(/⟦W[0-9a-f]{6,}⟧/)
  await expect(card.locator('.receipt-read')).not.toContainText(SECRET)

  // One thing more to hide: from the next request on.
  await card.locator('input[name="word"]').fill('Mélusine')
  await card.getByRole('button', { name: 'Hide it' }).click()
  await expect(page.locator('.toast')).toContainText('Hidden from the next request on')
  await page.keyboard.press('Escape')
  asked.length = 0
  await ask(page, 'And to Mélusine too')
  await expect.poll(() => asked.length).toBeGreaterThan(0)
  await quiet(page)
  for (const body of asked) expect(body).not.toContain('Mélusine')
})

test('on every road, a shared file, memory, a call and its result, a title and a guard’s question, nothing real goes, and what it makes is real', async ({ page }) => {
  // It writes a file with the marks it read, its chunks cutting them in two, then says so.
  const answer = (/** @type {any} */ body) => {
    // A title, with a mark whose brackets it dropped, as a brain may; a guard's question.
    if (!body.tools?.length) return stream([{ content: JSON.stringify(body.messages).includes('Is it about') ? 'yes' : (JSON.stringify(body.messages.filter((/** @type {any} */ message) => message.role === 'user')).match(MARKS)?.[0] ?? '').replace(/[⟦⟧]/g, '') }])
    const last = body.messages.at(-1)
    const said = JSON.stringify(body.messages.filter((/** @type {any} */ message) => message.role === 'user'))
    const mark = said.match(MARKS)?.[0] ?? ''
    if (last.role !== 'tool') return stream([{ tool_calls: [{ index: 0, id: 'call-1', type: 'function', function: { name: 'write', arguments: JSON.stringify({ name: 'Note.docx', content: `Dear ${mark},` }) } }] }], 'tool_calls')
    const cut = Math.floor(mark.length / 2)
    return stream([{ content: `Written for ${mark.slice(0, cut)}` }, { content: `${mark.slice(cut)}.` }])
  }
  const asked = await farBrain(page, answer)
  await withPolicy(page, POLICY)
  await start(page)
  await useCorp(page)
  await page.evaluate(async ({ person }) => {
    const { app } = await import('/ui/state.js')
    await app.fs.write('memory.md', `---\nformat: 1\nkind: memory\n---\n- Works with ${person} <!-- at=${new Date().toISOString()} by=jean -->\n- Prefers tea <!-- at=${new Date().toISOString()} by=jean -->\n`)
    await (await import('/ui/caps.js')).unlock('memory')
  }, { person: PERSON })
  await page.locator('.composer input[type="file"]').setInputFiles({ name: `${PERSON}.txt`, mimeType: 'text/plain', buffer: Buffer.from(`${EMAIL} pays with ${CARD}.`) })
  await expect(page.locator('.composer')).toContainText('Marie')
  await ask(page, `Write to ${PERSON} about ${SECRET}`)
  await expect(page.locator('.msg-jean .prose').last()).toContainText(`Written for ${PERSON}.`)
  await quiet(page)
  expect(asked.length).toBeGreaterThan(1)
  // A guard's question goes the same way.
  const question = await page.evaluate(async ({ person }) => {
    const { app } = await import('/ui/state.js')
    return (await import('/ui/yes.js')).yes('Is it about a client?', `About ${person}`, app.current.value?.path)
  }, { person: PERSON })
  expect(question).toBe(true)

  const everything = asked.join('\n')
  expect(everything).toContain('Prefers tea')
  expect(everything).toContain('Is it about a client?')
  for (const value of [SECRET, 'Herm', PERSON, 'Dupont', EMAIL, CARD, '4111']) expect(everything, value).not.toContain(value)
  // Requests were read on from the call the brain made: the second holds its result.
  expect(asked.some((body) => JSON.parse(body).messages.some((/** @type {any} */ message) => message.role === 'tool'))).toBe(true)

  // In the task, the call and its title are real, and what the brain didn't see is kept with them.
  await expect.poll(() => page.evaluate(async () => { const { titleOf } = await import('/core/events.js'); return titleOf((await import('/ui/state.js')).app.current.value?.records ?? []) })).toMatch(/Marie Dupont|Projet Hermès/)
  const records = JSON.parse(await page.evaluate(async () => JSON.stringify((await import('/ui/state.js')).app.current.value?.records)))
  const call = records.find((/** @type {any} */ record) => record.update?.name === 'write')
  expect(call.update.rawInput.content).toBe(`Dear ${PERSON},`)
  expect(records.some((/** @type {any} */ record) => Object.values(record.meta?.masked ?? {}).includes(SECRET))).toBe(true)
  // And so it is in the Word document it made.
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Save Note.docx' }).first().click()
  const word = readZip(new Uint8Array(await readFile(await (await download).path())))
  const xml = new TextDecoder().decode(await word.find((/** @type {any} */ entry) => entry.name === 'word/document.xml').read())
  expect(xml).toContain(PERSON)
  expect(xml).not.toContain('⟦')

  // Through a reload the same marks stand for the same things, in a browser that keeps what it has.
  const ephemeral = await page.evaluate(async () => (await import('/ui/state.js')).app.ephemeral.value)
  if (ephemeral) return
  const before = `⟦${Object.entries(Object.assign({}, ...records.map((/** @type {any} */ record) => record.meta?.masked))).find(([, value]) => value === PERSON)?.[0]}⟧`
  await page.reload()
  await expect(page.locator('.msg-jean .prose').last()).toContainText(`Written for ${PERSON}.`)
  asked.length = 0
  await ask(page, `Once more for ${PERSON}`)
  await expect.poll(() => asked.length).toBeGreaterThan(0)
  await expect(page.locator('.msg-jean')).toHaveCount(2)
  await quiet(page)
  expect(asked.join()).toContain(before)
  expect(asked.join()).not.toContain('Dupont')
})

test('what can’t be masked isn’t sent, and the person is told', async ({ page }) => {
  const asked = await farBrain(page)
  // A tool's name can't be masked: a word in it stops the request.
  await withPolicy(page, { ...POLICY, dlp: { mask: { words: ['write'] } } })
  await start(page)
  await useCorp(page)
  await ask(page, 'Hello')
  await expect(page.locator('.toast')).toContainText('This wasn’t sent')
  // A title, which declares no tools, can go; the request itself didn't.
  expect(asked.filter((body) => JSON.parse(body).tools?.length)).toEqual([])
})

test('in Arabic and Japanese, the words stand and what’s hidden stays hidden', async ({ page }) => {
  const asked = await farBrain(page)
  await withPolicy(page, { ...POLICY, dlp: { mask: { words: ['مشروع هرمس', '田中商事'] } } })
  for (const [lang, word, attached, button] of [['ar', 'مشروع هرمس', 'ومشروع هرمس', 'ما لم يره العقل'], ['ja', '田中商事', '田中商事は', '頭脳に見せなかった内容']]) {
    await start(page, lang)
    await useCorp(page)
    asked.length = 0
    await ask(page, attached)
    await expect.poll(() => asked.length).toBeGreaterThan(0)
    await quiet(page)
    for (const body of asked) expect(body, lang).not.toContain(word)
    await page.getByRole('button', { name: button }).last().click()
    await expect(page.locator('.receipt:popover-open')).toContainText(word)
    await expect(page.locator('.receipt:popover-open')).toHaveCSS('direction', lang === 'ar' ? 'rtl' : 'ltr')
  }
})
