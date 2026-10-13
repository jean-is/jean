// Search by meaning (D302): when words find nothing in the project's files, the brain offers it; once
// the user agrees, its weights download, with their progress shown, the files are read into vectors,
// and search_files finds a passage in other words than the question's. The embedder is replaced by
// a fake whose vectors give income, earnings and revenue one meaning.
import { test, expect } from '@playwright/test'
import { start, connectFakeBrain, ask } from './helpers.js'

/** The fake embedder: a loaded event, then for each text a vector of 64 bytes, words folded into them by meaning. */
const WORKER = `
const SAME = { revenue: 'money', earnings: 'money', income: 'money' }
const DIMS = 64
const slot = (word) => [...word].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % (DIMS - 1) + 1
self.onmessage = ({ data }) => {
  if (data.type === 'load') {
    self.postMessage({ id: data.id, type: 'progress', loaded: 1, total: 1 })
    self.postMessage({ id: data.id, type: 'ready' })
  } else if (data.type === 'embed') {
    const vectors = new Int8Array(data.texts.length * DIMS)
    data.texts.forEach((text, row) => {
      const counts = new Float32Array(DIMS)
      for (const word of text.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 3)) counts[SAME[word] ? 0 : slot(word)] += SAME[word] ? 4 : 1
      const norm = Math.hypot(...counts) || 1
      counts.forEach((x, i) => { vectors[row * DIMS + i] = Math.round((x / norm) * 127) })
    })
    self.postMessage({ id: data.id, type: 'vectors', vectors, dims: DIMS }, [vectors.buffer])
  }
}
`

test('the brain offers search by meaning when words find nothing, and then finds the passage', async ({ page }) => {
  await page.route('**/caps/meaning/embed-worker.js', (route) => route.fulfill({ contentType: 'text/javascript', body: WORKER }))
  await start(page)
  await connectFakeBrain(page)
  await page.locator('.composer input[type="file"]').setInputFiles({ name: 'Quarterly notes.txt', mimeType: 'text/plain', buffer: Buffer.from('Revenue grew 12% in Q3, led by the North region.') })
  await expect(page.locator('.attachment[data-status="ready"]')).toHaveCount(1)
  await ask(page, 'Summarize this')
  await expect(page.locator('.msg-jean .prose').last()).toContainText('Quarterly notes.txt')

  // Another task: the question's words aren't the file's.
  await page.locator('.wordmark').click()
  await expect(page.locator('.hero-question')).toBeVisible()
  await ask(page, 'What do the files say about earnings?')
  const offer = page.locator('.msg-jean .approval')
  await expect(offer).toContainText('Search by meaning')
  await offer.getByRole('button', { name: 'Turn it on' }).click()
  await expect(page.locator('.msg-jean .prose').last()).toContainText('Revenue grew 12% in Q3')
  // The file's vectors are kept for the next visit.
  const kept = await page.evaluate(async () => {
    const { app } = await import('/ui/state.js')
    return (await app.fs.list('.cache/meaning')).length
  })
  expect(kept).toBeGreaterThan(0)
})
