// SPDX-License-Identifier: MIT
// Report a problem (D771): a request held before the brain's first words says what it waits for, in the person's language, then
// offers a report that names that stage, copied and saved; a capability that never comes back holds a request only a while, and a
// report names it; a send the box gave back says so; Settings opens a report with no task;
// a report becomes a sealed link whose page holds it, and, opened by support, a stand-in that restores.
import { readFile } from 'node:fs/promises'
import { test, expect, start, connectFakeBrain, ask, answered, holdAnswers, openSettings, SHARE_URL } from './helpers.js'
import { bytesOf, openValue } from '../app/caps/share/seal.js'
import { readZip } from '../app/core/zip.js'

/** @param {string} lang @returns {Promise<Record<string, any>>} */
const strings = async (lang) => ({ ...JSON.parse(await readFile(new URL(`../app/locales/report/${lang}.json`, import.meta.url), 'utf8')),
  ...JSON.parse(await readFile(new URL(`../app/locales/${lang}.json`, import.meta.url), 'utf8')) })

const HELLO = { en: 'Hello', ar: 'مرحبا', ja: 'こんにちは' }

/** The report the dialog shows, all of it. @param {import('@playwright/test').Locator} dialog */
const reportIn = async (dialog) => JSON.parse(await dialog.locator('.report-json pre').textContent() ?? '{}')

for (const lang of /** @type {const} */ (['en', 'ar', 'ja'])) {
  test(`a request held before the brain's first words says what it waits for, then offers a report naming that stage (${lang})`, async ({ page, context }) => {
    const words = await strings(lang)
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.clock.install()
    await start(page, lang)
    await connectFakeBrain(page)
    const go = await holdAnswers(page)
    const step = page.waitForRequest((request) => request.url().endsWith('/chat/completions') && Boolean(request.postDataJSON()?.tools?.length))
    await ask(page, HELLO[lang])
    await step
    const line = page.locator('.msg-jean.is-streaming .stretch-line')
    await expect(line).not.toContainText(words['report.stage.ask'].replace('{brain}', words['provider.custom']))
    // Five seconds on: what it waits for, in the line, with the seconds since.
    await page.clock.fastForward(6000)
    await expect(line).toContainText(words['report.stage.ask'].replace('{brain}', words['provider.custom']))
    await expect(page.locator('.report-slow')).toHaveCount(0)
    // Twenty: a report is offered under the answer.
    await page.clock.fastForward(15_000)
    const offer = page.locator('.report-slow')
    await expect(offer).toContainText(words['report.slow'])
    await offer.getByRole('button', { name: words['report.title'] }).click()
    const dialog = page.locator('dialog.report[open]')
    await expect(dialog.getByRole('heading', { name: words['report.title'] })).toBeVisible()
    await expect(dialog.locator('.report-facts')).toContainText(words['report.stage.ask'].replace('{brain}', words['provider.custom']))
    const report = await reportIn(dialog)
    expect(report.now.trail.stages.at(-1)).toMatchObject({ id: 'ask', brain: 'custom' })
    const request = (/** @type {Record<string, any>} */ one) => one.task.last.find((/** @type {{ type: string }} */ record) => record.type === 'user_message_chunk')
    expect(request(report).text).toEqual({ text: [...HELLO[lang]].length, script: { en: 'Latin', ar: 'Arabic', ja: 'Japanese' }[lang] })
    expect(JSON.stringify(report)).not.toContain(HELLO[lang])
    if (lang === 'en') {
      await dialog.getByRole('button', { name: 'Copy' }).click()
      await expect(dialog.locator('.report-said')).toHaveText(words['toast.copied'])
      expect(JSON.parse(await page.evaluate(() => navigator.clipboard.readText())).now.trail.stages.at(-1).id).toBe('ask')
      const download = page.waitForEvent('download')
      await dialog.getByRole('button', { name: words['report.save'] }).click()
      expect((await download).suggestedFilename()).toMatch(/^report-\d{4}-\d{2}-\d{2}\.json$/)
      // The task's words go only when asked for.
      await dialog.getByLabel(words['report.words']).check()
      await expect.poll(async () => request(await reportIn(dialog)).text).toBe(HELLO[lang])
    }
    await dialog.getByRole('button', { name: words['action.close'] }).click()
    go()
    await answered(page)
  })
}

test('a capability that never comes back holds a request five seconds at most, and a report names it', async ({ page }) => {
  await page.clock.install()
  await start(page)
  await connectFakeBrain(page)
  // Formulas, found on an earlier visit, whose module never arrives, as a capability stuck on what the browser never answers.
  await page.route('**/caps/math/math.js', () => {})
  await page.evaluate(async () => { const { app, updateSettings } = await import('/ui/state.js'); await updateSettings({ unlocked: [...app.settings.value.unlocked, 'math'] }) })
  await page.reload()
  await expect(page.locator('#prompt')).toBeFocused()
  let asked = false
  page.on('request', (request) => { if (request.url().endsWith('/chat/completions') && request.postDataJSON()?.tools?.length) asked = true })
  await ask(page, 'Hello')
  await expect(async () => { await page.clock.fastForward(1000); expect(asked).toBe(true) }).toPass()
  await answered(page)
  const settings = await openSettings(page)
  await settings.getByRole('button', { name: 'Report a problem' }).click()
  const dialog = page.locator('dialog.report[open]')
  await expect(async () => { await page.clock.fastForward(1000); expect((await reportIn(dialog)).now?.capabilities.coming).toEqual(['math']) }).toPass()
  expect((await reportIn(dialog)).now.probes.ready).toBe('no answer')
})

test('a send the box gave back says it wasn’t sent, and offers a report', async ({ page }) => {
  const words = await strings('en')
  await start(page)
  await connectFakeBrain(page)
  // As when a request before it never reached its answer: the box is busy, with nothing under way.
  await page.evaluate(async () => { (await import('/ui/state.js')).app.busy.value = true })
  await ask(page, 'Hello')
  const line = page.locator('.composer .report-line')
  await expect(line).toContainText(words['report.unsent.held'])
  await expect(page.locator('#prompt')).toHaveValue('Hello')
  await line.getByRole('button', { name: words['report.title'] }).click()
  const dialog = page.locator('dialog.report[open]')
  const report = await reportIn(dialog)
  expect(report.now.attempts.at(-1)).toMatchObject({ busy: true, outcome: 'held' })
  expect(report.now.busy).toBe(true)
  await expect(dialog.locator('.report-facts')).toContainText(words['report.unsent.held'])
})

test('Settings opens a report with no task, which leaves as a sealed link its page holds, and a report opened by support saves a stand-in', async ({ page }) => {
  const words = await strings('en')
  await start(page)
  await connectFakeBrain(page)
  await page.evaluate(async (host) => {
    const { app, updateSettings } = await import('/ui/state.js')
    await updateSettings({ urls: { ...app.settings.value.urls, share: host } })
  }, SHARE_URL)
  const settings = await openSettings(page)
  await settings.getByRole('button', { name: 'Report a problem' }).click()
  const dialog = page.locator('dialog.report[open]')
  await expect(dialog.locator('.report-facts')).toContainText(words['report.idle'])
  await expect(dialog.getByLabel(words['report.words'])).toBeDisabled()
  const report = await reportIn(dialog)
  expect(report.task).toBeNull()
  expect(report.settings.brains).toMatchObject([{ provider: 'custom', address: 'local:4181', key: false }])

  await dialog.getByRole('button', { name: words['report.link'] }).click()
  await expect(dialog.locator('.report-said')).toContainText(words['report.linked'])
  const link = new URL(String(await dialog.locator('.report-said a').getAttribute('href')))
  const sealed = new Uint8Array(await (await fetch(new URL(`v1/${link.pathname.split('/').pop()}`, new URL('./', link)))).arrayBuffer())
  const copy = await openValue(sealed, bytesOf(link.hash.slice(1)))
  const answer = String(copy.file).split('\n').map((line) => { try { return JSON.parse(line) } catch { return null } }).find((record) => record?.update?.sessionUpdate === 'agent_message_chunk')
  const shared = JSON.parse(/```json\n([\s\S]*?)\n```/.exec(answer.update.content.text)?.[1] ?? '{}')
  expect(shared.settings.brains).toEqual(report.settings.brains)
  await dialog.getByRole('button', { name: words['action.close'] }).click()

  // Support's side: the report pasted, its facts shown, the stand-in saved as a backup.
  await settings.getByRole('button', { name: 'Open a report' }).click()
  const taken = page.locator('dialog.report-take[open]')
  await taken.getByLabel(words['report.paste']).fill('not a report')
  await expect(taken.getByRole('alert')).toHaveText(words['report.notReport'])
  await taken.getByLabel(words['report.paste']).fill(answer.update.content.text)
  await expect(taken.locator('.report-facts')).toContainText(words['report.idle'])
  const download = page.waitForEvent('download')
  await taken.getByRole('button', { name: words['report.standIn'] }).click()
  const saved = await download
  expect(saved.suggestedFilename()).toMatch(/^stand-in-\d{4}-\d{2}-\d{2}\.zip$/)
  const names = readZip(new Uint8Array(await readFile(/** @type {string} */ (await saved.path())))).map((entry) => entry.name)
  expect(names).toEqual(expect.arrayContaining(['backup.json', 'settings.json']))
  await expect(taken.locator('.report-said')).toContainText('Restore it in a new profile')
})
