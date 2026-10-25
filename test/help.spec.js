// Help (D612), served as jean.is's deploy has it (scripts/serve.js --home): its home lists the articles by moment;
// an article answers first, names Jean's menus and buttons as Jean does, and leads to Show me, which opens Jean
// where its steps start and points at each part they name, by Jean's own words, until its end or Escape; its pane
// replays a request whose call waits on its card for the viewer; a brain whose key was refused links to its fix;
// and the user's menu has Help.
import { test, expect } from '@playwright/test'
import { BRAIN_URL, connectFakeBrain, openProfile } from './helpers.js'

const JEAN_IS = 'http://127.0.0.1:4186/'

test('Help’s home lists every article under its moment, and an article answers first, in Jean’s words for its buttons, with Show me', async ({ page }) => {
  await page.goto(`${JEAN_IS}help`)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Help')
  await expect(page.locator('.help-wrong .help-cards a')).toHaveText(['A brain refused the key'])
  await expect(page.locator('.help-cards.is-path > li > a')).toHaveText(['Choose the AI that answers', 'When Jean asks first'])
  await expect(page.locator('.help-moments h3')).toHaveText(['The AI that answers', 'Ask', 'Fix a problem'])
  await page.locator('.help-moments a', { hasText: 'Choose the AI that answers' }).click()
  await expect(page).toHaveURL(`${JEAN_IS}help/choose-the-ai`)
  await expect(page.locator('.help-answer .help-ui')).toHaveText(['Settings', 'Brains'])
  await expect(page.locator('.help-steps > li')).toHaveCount(4)
  await expect(page.locator('.help-steps .help-ui').first()).toHaveText('Settings')
  await expect(page.getByRole('link', { name: 'Show me in Jean' })).toHaveAttribute('href', '../?help=choose-ai')
  await expect(page.locator('a[href="mailto:arnaud@jean.is"]')).toBeVisible()
  await expect(page.locator('.site-foot a[aria-current="page"]')).toHaveCount(0)
})

for (const [article, settings, count] of /** @type {const} */ ([['choose-ai', 'brains/add', 4], ['asks-first', 'approvals', 2]])) {
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
      if (i < stops.length - 1) await bubble.getByRole('button', { name: 'Next' }).click()
    }
    // It only points: nothing was changed, and Escape ends it.
    await page.keyboard.press('Escape')
    await expect(bubble).toBeHidden()
    await expect(page.locator('.is-toured')).toHaveCount(0)
  })
}

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
