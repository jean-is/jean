// Help (D612), served as jean.is's deploy has it (scripts/serve.js --home): its home lists the articles by moment;
// an article answers first, names Jean's menus and buttons as Jean does, and leads to Show me, which opens Jean
// where its steps start and points at each part they name, by Jean's own words, until its end or Escape; its pane
// replays a request whose call waits on its card for the viewer; a brain whose key was refused, or that couldn't be
// reached, links to its fix; and the user's menu has Help.
import { test, expect } from '@playwright/test'
import { BRAIN_URL, connectFakeBrain, openProfile } from './helpers.js'

const JEAN_IS = 'http://127.0.0.1:4186/'

test('Help’s home lists every article under its moment, and an article answers first, in Jean’s words for its buttons, with Show me', async ({ page }) => {
  await page.goto(`${JEAN_IS}help`)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Help')
  await expect(page.locator('.help-chips a')).toHaveText(['Jean couldn’t reach a brain', 'A brain refused the key', 'My tasks are gone'])
  await expect(page.locator('.help-path a')).toHaveText(['What Jean is', 'Choose the AI that answers', 'Your first task', 'Back up and restore', 'When Jean asks first', 'How Jean shows what it can do'])
  await expect(page.locator('#help-path')).toHaveText('Start hereAbout 17 minutes')
  await expect(page.locator('.help-moments h3')).toHaveText(['Start', 'The AI that answers', 'Ask', 'Keep safe', 'Go further'])
  await expect(page.locator('#help-start ~ ul a')).toHaveText(['What Jean is', 'Your first task', 'Is Jean free?', 'Words you’ll see in Jean'])
  await page.locator('.help-moments a', { hasText: 'Choose the AI that answers' }).click()
  await expect(page).toHaveURL(`${JEAN_IS}help/choose-the-ai`)
  await expect(page.locator('.help-answer .help-ui')).toHaveText(['Settings', 'Brains'])
  await expect(page.locator('.help-steps > li')).toHaveCount(4)
  await expect(page.locator('.help-steps .help-ui').first()).toHaveText('Settings')
  await expect(page.getByRole('link', { name: 'Show me in Jean' })).toHaveAttribute('href', '../?help=choose-ai')
  await expect(page.locator('a[href="mailto:arnaud@jean.is"]')).toBeVisible()
  await expect(page.locator('.site-foot a[aria-current="page"]')).toHaveCount(0)
})

test('an article links the site’s other pages by their own names', async ({ page }) => {
  await page.goto(`${JEAN_IS}help/what-the-ai-sees`)
  await expect(page.locator('.help-part a', { hasText: 'Where your files go' })).toHaveAttribute('href', '../files')
  await page.goto(`${JEAN_IS}fr/aide/jean-est-il-gratuit`)
  await expect(page.locator('.help-part a', { hasText: 'Jean pour les organisations' })).toHaveAttribute('href', '../../fr/entreprise')
})

for (const [article, settings, count] of /** @type {const} */ ([['choose-ai', 'brains/add', 4], ['openrouter', 'brains/quick', 2], ['use-a-key', 'brains/key', 4], ['on-device', 'brains/add', 2], ['asks-first', 'approvals', 2], ['back-up', 'data', 4], ['what-jean-can-do', 'capabilities', 4]])) {
  test(`Show me for ${article} opens Jean where its steps start and points at each part they name, in turn`, async ({ page, request }) => {
    const { stops } = await (await request.get(`${JEAN_IS}help/${article}.en.json`)).json()
    expect(stops).toHaveLength(count)
    await page.goto(`${JEAN_IS}?help=${article}`)
    await expect(page).toHaveURL(new RegExp(`#/settings/${settings}$`))
    const bubble = page.locator('#app-tour')
    for (const [i, stop] of stops.entries()) {
      await expect(bubble).toHaveText(new RegExp(stop.say.slice(0, 40).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
      // What it points at shows, ringed, and nothing else is.
      await expect(page.locator('.is-toured')).toHaveCount(1)
      await expect(page.locator('.is-toured')).toBeVisible()
      // A stop that waits for the reader goes on once they click what it points at, as it says; the others, with Next.
      if (i < stops.length - 1) await (stop.go === 'click' ? page.locator('.is-toured') : bubble.getByRole('button', { name: 'Next' })).click()
    }
    // It only points: nothing was changed, and Escape ends it.
    await page.keyboard.press('Escape')
    await expect(bubble).toBeHidden()
    await expect(page.locator('.is-toured')).toHaveCount(0)
  })
}

test('Words you’ll see explains each word, naming Jean’s own as its screen does', async ({ page }) => {
  await page.goto(`${JEAN_IS}help/words-you-ll-see`)
  await expect(page.locator('.help-terms dt').first()).toHaveText('Brain')
  await expect(page.locator('.help-terms dt .help-ui')).toHaveText(['Auto'])
  await expect(page.locator('.help-terms dd a', { hasText: 'How Jean shows what it can do' })).toHaveAttribute('href', '../help/what-jean-can-do')
  await page.goto(`${JEAN_IS}fr/aide/les-mots-de-jean`)
  await expect(page.locator('.help-terms dt').first()).toHaveText('Cerveau')
  await expect(page.locator('.help-terms dd .help-ui', { hasText: 'Réglages' }).first()).toBeVisible()
})

test('a brain whose key was refused links to its fix, and Show me points at it, then follows the reader to its page', async ({ page, context }) => {
  await page.goto(JEAN_IS)
  await connectFakeBrain(page)
  await context.route(`${BRAIN_URL}/models`, (route) => route.fulfill({ status: 401, contentType: 'application/json', body: '{"error":{"message":"Invalid API key"}}' }))
  // Started as ?help= starts it, in this tab: Playwright's WebKit keeps nothing over a new address.
  await page.evaluate(() => { import('/caps/tour/live.js').then((live) => live.start('key-refused')) })
  await expect(page).toHaveURL(/#\/settings\/brains$/)
  const fix = page.locator('.brain-wait a', { hasText: 'How to fix it' })
  await expect(fix).toHaveAttribute('href', `${JEAN_IS}help/key-refused`)
  await expect(fix).toHaveAttribute('target', '_blank')
  const bubble = page.locator('#app-tour')
  await expect(bubble).toContainText('says Needs you')
  await expect(page.locator('.brain-rows .is-toured')).toContainText('Needs you')
  // Its stop goes on once the reader opens the brain, as it says.
  await page.locator('.brain-rows .is-toured').click()
  await expect(page).toHaveURL(/#\/settings\/brains\/[\w-]+$/)
  await expect(page.locator('.brain-wait a', { hasText: 'How to fix it' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(bubble).toBeHidden()
})

test('a brain that couldn’t be reached links to its fix, and Show me points at it, then at Try again on its page', async ({ page, context }) => {
  await page.goto(JEAN_IS)
  await connectFakeBrain(page)
  await context.route(`${BRAIN_URL}/models`, (route) => route.abort('failed'))
  await page.evaluate(() => { import('/caps/tour/live.js').then((live) => live.start('couldnt-reach')) })
  await expect(page).toHaveURL(/#\/settings\/brains$/)
  // Asked again three times first, as any request that may pass is (D202).
  const fix = page.locator('.brain-wait a', { hasText: 'How to fix it' })
  await expect(fix).toHaveAttribute('href', `${JEAN_IS}help/couldnt-reach`, { timeout: 15_000 })
  const bubble = page.locator('#app-tour')
  await expect(bubble).toContainText('couldn’t be reached says Needs you')
  await page.locator('.brain-rows .is-toured').click()
  await expect(page).toHaveURL(/#\/settings\/brains\/[\w-]+$/)
  await expect(page.locator('.brain-wait .is-toured')).toHaveText('Try again')
  await page.keyboard.press('Escape')
  await expect(bubble).toBeHidden()
})

test('Your first task’s pane replays a first request, as Jean answers it', async ({ page }) => {
  await page.goto(`${JEAN_IS}help/your-first-task`)
  await page.locator('.site-demo').scrollIntoViewIfNeeded()
  const pane = page.frameLocator('.site-demo')
  await expect(pane.locator('.msg-user')).toContainText('thank-you note to my neighbour Sam')
  await pane.getByRole('button', { name: 'Watch it unfold' }).click()
  await expect(pane.locator('.msg-jean')).toContainText('Dear Sam')
  await expect(pane.getByRole('button', { name: 'Watch it unfold' })).toBeVisible()
})

test('Add files’ pane replays a request about a shared file, as Jean answers it', async ({ page }) => {
  await page.goto(`${JEAN_IS}help/add-files-folders-and-pictures`)
  await page.locator('.site-demo').scrollIntoViewIfNeeded()
  const pane = page.frameLocator('.site-demo')
  await expect(pane.getByText('Team survey.pdf').first()).toBeVisible()
  await pane.getByRole('button', { name: 'Watch it unfold' }).click()
  await expect(pane.locator('.msg-jean')).toContainText('one place for the team’s files')
})

test('an article’s pane replays its request, and the call waits on its card until the viewer allows it', async ({ page }) => {
  await page.goto(`${JEAN_IS}help/when-jean-asks-first`)
  await page.locator('.site-demo').scrollIntoViewIfNeeded()
  const pane = page.frameLocator('.site-demo')
  await expect(pane.locator('.msg-jean')).toContainText('Sent to the team')
  await pane.getByRole('button', { name: 'Watch it unfold' }).click()
  const card = pane.locator('.approval')
  await expect(card).toContainText('Allow this? Send the minutes to team@example.org')
  await page.waitForTimeout(1500)
  await expect(card).toBeVisible()
  await expect(pane.getByText('Sent to the team')).toHaveCount(0)
  await card.getByRole('button', { name: 'Allow once' }).click()
  await expect(card).toBeHidden()
  await expect(pane.locator('.msg-jean')).toContainText('Sent to the team')
  // Not now stops it there: nothing is sent.
  await pane.getByRole('button', { name: 'Watch it unfold' }).click()
  await pane.locator('.approval').getByRole('button', { name: 'Not now' }).click()
  await expect(pane.getByRole('button', { name: 'Watch it unfold' })).toBeVisible()
  await expect(pane.getByText('Sent to the team')).toHaveCount(0)
})

test('the user’s menu has Help, which opens in a tab of its own', async ({ page, context }) => {
  await page.goto(JEAN_IS)
  const menu = await openProfile(page)
  const [tab] = await Promise.all([context.waitForEvent('page'), menu.getByRole('button', { name: 'Help', exact: true }).click()])
  await expect(tab).toHaveURL(`${JEAN_IS}help`)
})
