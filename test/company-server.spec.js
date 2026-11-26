// SPDX-License-Identifier: MIT
// A company's own server (D762): Jean writes the block to paste at a host, and signs a change whose secret the person
// types in a masked field, which only the server receives: never the conversation, the box or the brain. The flow's
// words run in Arabic and Japanese too.
import { readFileSync } from 'node:fs'
import { test, expect, start, connectFakeBrain, ask } from './helpers.js'

for (const lang of ['en', 'ar', 'ja']) {
  const words = JSON.parse(readFileSync(`app/locales/${lang}.json`, 'utf8'))
  test(`the block to paste, then an app’s secret typed where only the company’s server gets it (${lang})`, async ({ page }) => {
    await start(page, lang)
    await connectFakeBrain(page)
    await page.evaluate(async () => {
      const { app } = await import('/ui/state.js')
      app.policy.urls = { ...app.policy.urls, releases: 'https://releases.example/jean' }
      await (await import('/ui/caps.js')).unlock('server')
    })
    const records = () => page.evaluate(async () => JSON.stringify((await import('/ui/state.js')).app.current.value?.records ?? []))

    await ask(page, 'Call company_line with {"address":"jean.acme.example"}')
    const answer = page.locator('.msg-jean:not(.is-streaming) .prose').last()
    await expect(answer).toContainText('#cloud-config')
    // The whole block, as the tool gave it, which the fake brain only quotes the start of.
    expect(await records()).toContain('sh install.sh --address jean.acme.example --owner ')

    // The server answers as one that obeys this Jean's key, kept on this device.
    const owner = await page.evaluate(async () => {
      const [{ deviceKey }, line] = await Promise.all([import('/ui/secrets.js'), import('/caps/server/line.js')])
      const pair = /** @type {CryptoKeyPair} */ (await deviceKey('company-server', async () => { throw new Error('the block made the key') }))
      return line.fingerprint(await line.ownerOf(pair.publicKey))
    })
    let sent = ''
    await page.route('https://jean.acme.example/keeper', (route) => {
      const posted = route.request().method() === 'POST'
      if (posted) sent = route.request().postData() ?? ''
      return route.fulfill({ json: posted ? { format: 1, seq: 1 } : { format: 1, owner, seq: 0 }, headers: { 'access-control-allow-origin': '*' } })
    })

    await ask(page, 'Call company_server with {"address":"jean.acme.example","apps":[{"issuer":"https://account-d.docusign.com","tokenEndpoint":"https://account-d.docusign.com/oauth/token","clientId":"integration-key","ask":"Type the secret key of your DocuSign app"}]}')
    await page.locator('.approval').getByRole('button', { name: words['approval.allowOnce'] }).click()
    const card = page.locator('app-ask')
    await expect(card.locator('.ask-question')).toHaveText('Type the secret key of your DocuSign app')
    const field = card.locator('input[type="password"]')
    await expect(field).toHaveAttribute('autocomplete', 'new-password')
    await expect(field).toHaveAttribute('dir', 'ltr')
    // The masked field takes the keyboard; words sent from the box meanwhile neither answer it nor leave.
    await expect(field).toBeFocused()
    await page.locator('#prompt').fill('typed in the box')
    await page.locator('#prompt').press('Enter')
    await expect(card.locator('.ask-question')).toBeVisible()
    expect(await records()).not.toContain('typed in the box')
    await field.fill('s3cret-value')
    await card.getByRole('button', { name: words['action.send'] }).click()
    await expect(answer).toContainText('applied change 1')

    const payload = JSON.parse(Buffer.from(sent.split('.')[1], 'base64url').toString())
    expect(payload).toMatchObject({ format: 1, seq: 1, gateway: { clients: [{ issuer: 'https://account-d.docusign.com', clientId: 'integration-key', clientSecret: 's3cret-value' }] } })
    expect(await page.locator('body').textContent()).not.toContain('s3cret-value')
    expect(await records()).not.toContain('s3cret-value')
  })
}
