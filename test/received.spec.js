// What another app gives Jean once installed (D714): a share, which the service worker holds in memory until the page it
// opens asks for it, its words then in the box and its files shared; and the manifests that offer both.
import { test, expect } from '@playwright/test'
import { start } from './helpers.js'

test('a share from another app lands in the box: its words to send or not, its file shared as a dropped one', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ serviceWorkers: 'allow', baseURL })
  const page = await context.newPage()
  await start(page)
  await page.waitForFunction(() => navigator.serviceWorker.controller)
  // As the system sends it: a POST to the share target, which the worker answers with the address that asks for it.
  const address = await page.evaluate(async () => {
    const form = new FormData()
    form.append('title', 'Bakery invoice')
    form.append('text', 'Can you check this one?')
    form.append('files', new File(['Total due: 412 euros'], 'invoice.txt', { type: 'text/plain' }))
    return (await fetch('share-target', { method: 'POST', body: form })).url
  })
  expect(address).toMatch(/\?shared=[\w-]+$/)
  await page.goto(address)
  await expect(page.locator('#prompt')).toHaveValue('Bakery invoice\nCan you check this one?')
  await expect(page.locator('.attachment[data-status="ready"]')).toContainText('invoice.txt')
  // Gone from the address, and from the worker once given.
  expect(new URL(page.url()).search).toBe('')
  expect(await page.evaluate(async (id) => new Promise((resolve) => {
    const channel = new MessageChannel()
    channel.port1.onmessage = ({ data }) => resolve(data)
    navigator.serviceWorker.controller?.postMessage({ type: 'SHARED', id }, [channel.port2])
  }), new URL(address).searchParams.get('shared'))).toBeNull()
  await context.close()
})

test('each manifest offers the share target and opening files, inside its own scope', async ({ request }) => {
  for (const path of ['manifest.webmanifest', 'manifests/fr.webmanifest']) {
    const manifest = await (await request.get(path)).json()
    const up = path.includes('/') ? '../' : './'
    expect(manifest.share_target).toMatchObject({ action: `${up}share-target`, method: 'POST', enctype: 'multipart/form-data' })
    expect(manifest.file_handlers[0].action).toBe(up)
    expect(manifest.file_handlers[0].accept['application/pdf']).toEqual(['.pdf'])
  }
})
