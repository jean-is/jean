// Plans (D364): found silently the first time a task runs out of steps, which pauses at the top of the box until Keep
// going; then a task done step by step shows its plan above the activity, waits for Go ahead in the box, ticks each step
// off and folds once done. The box's words change the plan, Always go ahead sets the rule, and the rule's row is in
// Settings once plans are found. The fake brain plans a move, and counts to twenty a step a number.
import { test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { start, connectFakeBrain, ask, openSettings, closeSettings } from './helpers.js'

/** @param {string} part @param {string} lang @returns {Promise<Record<string, string>>} */
const strings = async (part, lang) => JSON.parse(await readFile(new URL(`../app/locales/${part}${lang}.json`, import.meta.url), 'utf8'))
/** A string with its numbers as the page writes them. @param {import('@playwright/test').Page} page @param {string} text @param {Record<string, number>} values */
const filled = (page, text, values) => page.evaluate(([text, values]) => text.replace(/\{(\w+)\}/g, (_, name) => new Intl.NumberFormat(document.documentElement.lang).format(values[name])), /** @type {const} */ ([text, values]))

const COUNT = { en: 'Count to twenty', ar: 'عدّ إلى عشرين', ja: '二十まで数えて' }
const MOVE = { en: 'Plan the move step by step', ar: 'خطط للانتقال خطوة بخطوة', ja: '引っ越しを段階的に計画して' }
const STEPS = { en: ['Pack the boxes', 'Book the van', 'Clean the flat'], ar: ['توضيب الصناديق', 'حجز الشاحنة', 'تنظيف الشقة'], ja: ['箱に詰める', 'トラックを予約する', '部屋を掃除する'] }
const PLANNED = { en: 'Every step of the plan is done.', ar: 'أُنجزت كل خطوات الخطة.', ja: '計画のすべてのステップが完了しました。' }

for (const lang of /** @type {const} */ (['en', 'ar', 'ja'])) {
  test(`a task out of steps pauses until Keep going, and a plan waits for Go ahead, then ticks each step off (${lang})`, async ({ page }) => {
    const [said, room] = await Promise.all([strings('plan/', lang), strings('', lang)])
    await start(page, lang)
    await connectFakeBrain(page)
    const idle = page.locator('.composer .send:not(.is-stop)')

    // Twelve steps, and the task pauses at the top of the box, with how far it got; nothing of plans showed before.
    await expect(page.locator('.plan')).toHaveCount(0)
    await ask(page, COUNT[lang])
    const pause = page.locator('.composer .pause')
    await expect(pause).toBeVisible()
    await expect(pause.locator('p')).toHaveText(await filled(page, said['plan.paused'], { count: 12 }))
    await expect(page.locator('.msg-jean .prose')).toHaveCount(0)
    // Keep going reads on from there, on the same brain, and the answer comes.
    await pause.locator('.button.primary', { hasText: said['plan.keepGoing'] }).click()
    await expect(page.locator('.msg-jean .prose').last()).toContainText('I counted to twenty.')
    await expect(idle).toBeVisible()
    await expect(pause).toHaveCount(0)

    // Plans were found: in a new task, the plan shows above the activity and waits for Go ahead at the top of the box.
    await page.locator('.wordmark').click()
    await expect(page.locator('.hero-question')).toBeVisible()
    await ask(page, MOVE[lang])
    const plan = page.locator('.msg-jean .plan')
    await expect(plan.locator('li')).toHaveCount(3)
    await expect(plan.locator('li span[dir="auto"]')).toHaveText(STEPS[lang])
    await expect(plan.locator('li').first()).toHaveAttribute('data-status', 'in_progress')
    await expect(plan).toHaveAttribute('open', '')
    const card = page.locator('.composer app-ask .ask')
    await expect(card.locator('.ask-question')).toHaveText(said['plan.confirm'])
    await expect(card.locator('.choice-option').first()).toContainText(said['plan.go'])
    await expect(card.locator('.choice-option input').first()).toBeChecked()
    await expect(card.locator('.choice-option').nth(1)).toHaveText(said['plan.always'])
    await card.locator('.button.primary').click()

    // Each step is ticked off as it is done, then the plan folds to how many were.
    await expect(page.locator('.msg-jean .prose').last()).toContainText(PLANNED[lang])
    await expect(idle).toBeVisible()
    await expect(plan.locator('li[data-status="completed"]')).toHaveCount(3)
    await expect(plan.locator('summary')).toHaveText(`${said['plan.title']} · ${await filled(page, said['plan.done'], { done: 3, total: 3 })}`)
    await expect(plan).not.toHaveAttribute('open', '')
    await page.locator('.msg-jean .activity > summary').last().click()
    await expect(page.locator('.activity-list li', { hasText: room['tool.plan'] })).toHaveCount(4)
  })
}

test('the box’s words change a plan, Always go ahead sets the rule, and with it a plan starts at once (D364)', async ({ page }) => {
  const dialogs = await strings('dialogs/', 'en')
  await start(page)
  await connectFakeBrain(page)
  // Before plans are found, Settings has no rule for them.
  let settings = await openSettings(page, 'Approvals')
  await expect(settings.locator('.approval-bins')).not.toContainText(dialogs['kind.plan.label'])
  await closeSettings(page)
  await page.evaluate(async () => (await import('/ui/caps.js')).unlock('plan'))

  await ask(page, 'Plan the trip step by step')
  const card = page.locator('.composer app-ask .ask')
  await expect(card.locator('.ask-question')).toHaveText('Go ahead with this plan?')
  await page.locator('#prompt').fill('Add a step to book the hotel')
  await page.locator('#prompt').press('Enter')
  // Asked again, with the step the user's words added.
  const plan = page.locator('.msg-jean .plan')
  await expect(plan.locator('li')).toHaveCount(4)
  await expect(plan.locator('li span[dir="auto"]').last()).toHaveText('Book the hotel')
  await card.locator('.choice-option').nth(1).click()
  await card.locator('.button.primary').click()
  await expect(page.locator('.msg-jean .prose').last()).toContainText('Every step of the plan is done.')
  await expect(plan.locator('summary')).toHaveText('Plan · 4 of 4 done')

  // The rule says Do it now, and a plan starts without asking.
  settings = await openSettings(page, 'Approvals')
  await expect(settings.locator('.approval-bins > li').first().locator('[data-page="plan"]')).toContainText(dialogs['kind.plan.label'])
  await closeSettings(page)
  await page.locator('.wordmark').click()
  await ask(page, MOVE.en)
  await expect(page.locator('.msg-jean .prose').last()).toContainText('Every step of the plan is done.')
  await expect(page.locator('.composer app-ask')).toHaveCount(0)
  await expect(page.locator('.msg-jean .plan li[data-status="completed"]')).toHaveCount(3)
})
