// Together (D733): Ana and Bob work on one collection, each in a browser context of their own, so their own storage, through the relay
// on 4187, which keeps journals (test/playwright.config.js). Ana makes a link from Share's "Work on it together"; Bob opens it, gives the
// name the others see and joins; a row each adds reaches the other's copy; Ana removes Bob, who keeps what he had. Chromium only:
// Playwright's WebKit keeps nothing (test/playwright.config.js).
import { test, expect } from '@playwright/test'
import { start, connectFakeBrain, ask, answered, RELAY_URL, SHARE_URL } from './helpers.js'

/** @typedef {import('@playwright/test').Page} Page */

/** A person's Jean: a context of its own, the relay named, and the name its profile goes by. @param {import('@playwright/test').Browser} browser @param {string} name */
async function person(browser, name, lang = 'en') {
  const page = await (await browser.newContext()).newPage()
  await start(page, lang)
  await page.evaluate(async ([relay, share, name]) => {
    const { app, updateSettings } = await import('/ui/state.js')
    await updateSettings({ urls: { ...app.settings.value.urls, relay, share }, name })
  }, [RELAY_URL, SHARE_URL, name])
  return page
}

/** Expenses, a collection of Ana's project with two rows; its folder. @param {Page} page */
const expenses = (page) => page.evaluate(async () => {
  const [{ app }, { createTable, folderOf }, { stamp, stringifyChanges }, { ulid }, { unlock }] = await Promise.all([import('/ui/state.js'), import('/caps/tables/table.js'), import('/caps/tables/changes.js'), import('/core/ulid.js'), import('/ui/caps.js')])
  const table = createTable({ name: 'Expenses', columns: [{ name: 'Item', type: 'text' }, { name: 'Amount', type: 'number' }] }, { id: ulid(), author: 'user', at: new Date().toISOString() })
  const place = folderOf(table)
  await app.fs.write(`${app.projectDir}/${place}/collection.json`, `${JSON.stringify(table, null, 2)}\n`)
  await app.fs.write(`${app.projectDir}/${place}/changes.jsonl`, stringifyChanges(stamp([], [{ row: ulid(), set: { item: 'Flights', amount: 96 } }, { row: ulid(), set: { item: 'Flat', amount: 138 } }], { by: 'user' })))
  await unlock('tables')
  await unlock('share')
  return place
})
/** The collection's items, as its copy here folds them. @param {Page} page @param {string} folder */
const items = (page, folder) => page.evaluate(async (folder) => ((await (await import('/caps/tables/tables.js')).load(folder))?.rows ?? []).map((row) => String(row.cells.item)).sort(), folder)
/** A row the person adds, as the collection's own change. @param {Page} page @param {string} folder @param {string} item */
const add = (page, folder, item) => page.evaluate(async ([folder, item]) => {
  const { load, change } = await import('/caps/tables/tables.js')
  await change(/** @type {any} */ (await load(folder)), [{ set: { item, amount: 1 } }], 'user')
}, [folder, item])

test('Ana and Bob work on a collection together: a link and a name, each one’s rows reaching the other, and Bob, removed, keeps his copy', async ({ browser }) => {
  const [ana, bob] = await Promise.all([person(browser, 'Ana'), person(browser, 'Bob')])
  const folder = await expenses(ana)
  // Share asks how, beside a copy: working on it together, whose pane Together draws.
  await ana.evaluate(async (folder) => {
    const { app } = await import('/ui/state.js')
    await (await import('/caps/share/share.js')).openShare({ path: `${app.projectDir}/conversations/`, title: 'Expenses', item: { text: '' }, thing: { kind: 'collection', uri: folder } }, null)
  }, folder)
  const sharing = ana.locator('app-share-dialog dialog[open]')
  // Share's tab, first: a link that invites anyone, to edit, copied and shown.
  await expect(sharing.getByRole('tab', { name: 'Share' })).toHaveAttribute('aria-selected', 'true')
  await sharing.getByRole('button', { name: 'Copy an invitation link instead' }).click()
  const link = await sharing.getByTitle('Link', { exact: true }).inputValue()
  expect(link).toMatch(/^http:\/\/127\.0\.0\.1:4180\/#\/join\/[\w-]{22}\.0\.[\w-]{43}\.[\w-]{43}\.[\w-]{43}$/)
  await sharing.getByRole('button', { name: 'Close' }).click()

  // Bob opens it: one question, the name the others see; then the collection is his too, its pane open.
  await bob.goto(link)
  const joining = bob.locator('app-together-dialog dialog[open]')
  await joining.getByLabel('Your name, as the others will see it').fill('Bob')
  await joining.getByRole('button', { name: 'Join' }).click()
  await expect.poll(() => items(bob, folder)).toEqual(['Flat', 'Flights'])
  await expect(bob.locator('aside.pane.preview h2')).toHaveText('Expenses')
  await expect(ana.locator('app-toasts')).toContainText('Bob joined with the link')

  // Each one's row reaches the other's copy, and Ana sees Bob here.
  await add(bob, folder, 'Taxi')
  await expect.poll(() => items(ana, folder)).toEqual(['Flat', 'Flights', 'Taxi'])
  await add(ana, folder, 'Museum')
  await expect.poll(() => items(bob, folder)).toEqual(['Flat', 'Flights', 'Museum', 'Taxi'])
  await ana.evaluate(async (folder) => {
    const { metaOf } = await import('/caps/tables/tables.js')
    ;(await import('/ui/preview.js')).preview({ uri: folder, .../** @type {any} */ (await metaOf(folder)) })
  }, folder)
  await expect(ana.getByRole('button', { name: 'Here now: Bob' })).toBeVisible()

  // Ana removes Bob: the others would move to a new link; Bob is told, and keeps what he had.
  await ana.getByRole('button', { name: 'Here now: Bob' }).click()
  const people = ana.locator('app-together-dialog dialog[open]')
  await expect(people.locator('li')).toHaveCount(2)
  await people.getByRole('button', { name: 'Remove' }).click()
  await expect(bob.locator('app-toasts')).toContainText('You’re no longer in “Expenses”. What you have stays yours.')
  await expect.poll(() => bob.evaluate(async () => Object.keys(await (await import('/ui/secrets.js')).secretsWhere((await import('/ui/state.js')).app.fs, (id) => id.startsWith('circle:'))).length)).toBe(0)
  expect(await items(bob, folder)).toEqual(['Flat', 'Flights', 'Museum', 'Taxi'])
  // Ana's own row goes on into the journal she moved to, which Bob no longer reads.
  await add(ana, folder, 'Dinner')
  await bob.waitForTimeout(1_000)
  expect(await items(bob, folder)).toEqual(['Flat', 'Flights', 'Museum', 'Taxi'])
})

test('Ana and Bob work on a task together: each request answered by its own person’s Jean, in turn, the other’s words quoted for each brain', async ({ browser }) => {
  const [ana, bob] = await Promise.all([person(browser, 'Ana'), person(browser, 'Bob')])
  await Promise.all([connectFakeBrain(ana), connectFakeBrain(bob)])
  await ask(ana, 'Plan a weekend in Lisbon')
  await answered(ana)
  await ana.evaluate(async () => {
    const [{ app }, { unlock }] = await Promise.all([import('/ui/state.js'), import('/ui/caps.js')])
    await unlock('share')
    await (await import('/caps/share/share.js')).openShare({ path: String(app.current.value?.path), title: 'Lisbon' }, null)
  })
  const sharing = ana.locator('app-share-dialog dialog[open]')
  await sharing.getByRole('button', { name: 'Copy an invitation link instead' }).click()
  const link = await sharing.getByTitle('Link', { exact: true }).inputValue()
  await sharing.getByRole('button', { name: 'Close' }).click()

  // Bob joins: Ana's request and her Jean's answer are his to read, from Ana, without actions of his.
  await bob.goto(link)
  const joining = bob.locator('app-together-dialog dialog[open]')
  await joining.getByLabel('Your name, as the others will see it').fill('Bob')
  await joining.getByRole('button', { name: 'Join' }).click()
  await expect(bob.locator('.turn .since')).toContainText('From Ana')
  await expect(bob.locator('.msg-user')).toHaveText(['Plan a weekend in Lisbon'])

  // Bob asks his own Jean: his brain reads Ana's words quoted, as hers, and none of her Jean's tools.
  /** @type {any[]} */
  const asked = []
  await bob.route('**/v1/chat/completions', async (route) => { asked.push(route.request().postDataJSON()); await route.fallback() })
  await ask(bob, 'Which museums open on Sunday?')
  await answered(bob, 2)
  // The answer's request, not the title's, which may come first.
  const answering = asked.find((one) => !JSON.stringify(one.messages).includes('Write a title for the conversation'))
  const read = JSON.stringify(answering.messages)
  expect(read).toContain('Ana wrote in this shared task, their words and not your user')
  expect(read).toContain('> Plan a weekend in Lisbon')
  expect(answering.messages.some((/** @type {any} */ one) => one.role === 'tool')).toBe(false)

  // Ana reads Bob's request and his Jean's answer, from Bob.
  await expect(ana.locator('.turn .since')).toContainText('From Bob')
  await expect(ana.locator('.msg-user')).toHaveText(['Plan a weekend in Lisbon', 'Which museums open on Sunday?'])
  await answered(ana, 2)
})

test('Ana and Bob write one document together: each one’s words reach the other’s copy, merged where both wrote, and each sees where the other is', async ({ browser }) => {
  const [ana, bob] = await Promise.all([person(browser, 'Ana'), person(browser, 'Bob')])
  const path = 'documents/01JAQXDOC0000000000000000L-lisbon.md'
  await ana.evaluate(async (path) => {
    const [{ app }, { unlock }] = await Promise.all([import('/ui/state.js'), import('/ui/caps.js')])
    await unlock('documents')
    await unlock('share')
    await app.fs.write(`${app.projectDir}/${path}`, '---\nformat: 1\nname: Lisbon\nauthor: user\n---\n# Lisbon\n\nFriday: land at 20:15.\n')
    ;(await import('/ui/preview.js')).preview({ uri: path, name: 'Lisbon.md', title: 'Lisbon', mimeType: 'text/markdown' })
    await (await import('/caps/share/share.js')).openShare({ path: `${app.projectDir}/conversations/`, title: 'Lisbon', item: { text: '' }, thing: { kind: 'document', uri: path } }, null)
  }, path)
  const sharing = ana.locator('app-share-dialog dialog[open]')
  await sharing.getByRole('button', { name: 'Copy an invitation link instead' }).click()
  const link = await sharing.getByTitle('Link', { exact: true }).inputValue()
  await sharing.getByRole('button', { name: 'Close' }).click()

  await bob.goto(link)
  const joining = bob.locator('app-together-dialog dialog[open]')
  await joining.getByLabel('Your name, as the others will see it').fill('Bob')
  await joining.getByRole('button', { name: 'Join' }).click()
  await expect(bob.locator('#doc')).toContainText('Friday: land at 20:15.')

  /** A document's text as a copy keeps it. @param {Page} page */
  const text = (page) => page.evaluate(async (path) => { const { app } = await import('/ui/state.js'); return (await app.fs.read(`${app.projectDir}/${path}`)) ?? '' }, path)
  /** A line added at the end of the document, as the person types it, its editor saving it. @param {Page} page @param {string} line */
  const write = (page, line) => page.evaluate(async ([path, line]) => {
    const { app } = await import('/ui/state.js')
    const now = (await app.fs.read(`${app.projectDir}/${path}`)) ?? ''
    await app.fs.write(`${app.projectDir}/${path}`, `${now.trimEnd()}\n\n${line}\n`)
  }, [path, line])
  await write(bob, 'Saturday: the castle in the morning.')
  await expect.poll(() => text(ana)).toContain('Saturday: the castle in the morning.')
  await expect(ana.locator('#doc')).toContainText('Saturday: the castle in the morning.')
  await write(ana, 'Sunday: Sintra.')
  await expect.poll(() => text(bob)).toContain('Sunday: Sintra.')
  expect(await text(bob)).toContain('Saturday: the castle in the morning.')

  // Each one's caret shows in the other's copy, in their colour with their name, and what they select; gone once their pane closes.
  await bob.locator('#doc').getByText('Sunday: Sintra.').click()
  const bobs = ana.locator('#doc .together-caret', { hasText: 'Bob' })
  await expect(bobs).toBeVisible()
  expect(await bobs.evaluate((caret) => getComputedStyle(caret).borderInlineStartColor)).not.toBe(await ana.locator('#doc').evaluate((doc) => getComputedStyle(doc).color))
  await expect(ana.locator('#doc p', { hasText: 'Sunday: Sintra.' }).locator('.together-caret')).toHaveCount(1)
  await ana.locator('#doc').getByText('Friday: land at 20:15.').selectText()
  await expect(bob.locator('#doc .together-selection')).toHaveText('Friday: land at 20:15.')
  await expect(bob.locator('#doc .together-caret', { hasText: 'Ana' })).toBeVisible()
  await bob.locator('aside.pane.preview').getByRole('button', { name: 'Close' }).click()
  await expect(bobs).toHaveCount(0)
})

test('Bob asks Ana’s Jean in their shared task: Ana is asked first, then her own Jean answers, which Bob reads', async ({ browser }) => {
  const [ana, bob] = await Promise.all([person(browser, 'Ana'), person(browser, 'Bob')])
  await Promise.all([connectFakeBrain(ana), connectFakeBrain(bob)])
  await ask(ana, 'Plan a weekend in Lisbon')
  await answered(ana)
  await ana.evaluate(async () => {
    const [{ app }, { unlock }] = await Promise.all([import('/ui/state.js'), import('/ui/caps.js')])
    await unlock('share')
    await (await import('/caps/share/share.js')).openShare({ path: String(app.current.value?.path), title: 'Lisbon' }, null)
  })
  const sharing = ana.locator('app-share-dialog dialog[open]')
  await sharing.getByRole('button', { name: 'Copy an invitation link instead' }).click()
  const link = await sharing.getByTitle('Link', { exact: true }).inputValue()
  await sharing.getByRole('button', { name: 'Close' }).click()
  await bob.goto(link)
  const joining = bob.locator('app-together-dialog dialog[open]')
  await joining.getByLabel('Your name, as the others will see it').fill('Bob')
  await joining.getByRole('button', { name: 'Join' }).click()
  await expect(bob.locator('.msg-user')).toHaveText(['Plan a weekend in Lisbon'])

  // Bob asks Ana's Jean from People in this task.
  await bob.evaluate(async () => {
    const [{ circles }, { shown }, { app }] = await Promise.all([import('/caps/together/engine.js'), import('/caps/together/page.js'), import('/ui/state.js')])
    shown.value = [...circles.value.keys()][0]
    app.dialog.value = 'together'
  })
  const people = bob.locator('app-together-dialog dialog[open]')
  await people.getByRole('button', { name: 'Ask their Jean' }).click()
  await people.getByLabel('What should Ana’s assistant answer?').fill('Is Ana free on Saturday morning?')
  await people.getByRole('button', { name: 'Send' }).click()

  // Ana is asked first; then her own Jean answers, in the task, and Bob reads it.
  const card = ana.locator('aside.offer', { hasText: 'Bob asks your Jean:' })
  await expect(card).toContainText('Is Ana free on Saturday morning?')
  await card.getByRole('button', { name: 'Let Jean answer' }).click()
  await answered(ana, 2)
  await expect(ana.locator('.msg-user').last()).toHaveText('Bob asks: Is Ana free on Saturday morning?')
  await expect(bob.locator('.msg-user').last()).toHaveText('Bob asks: Is Ana free on Saturday morning?')
  await answered(bob, 2)
})

test('Ana keeps a collection in step on her own two devices: no link, nobody else, each one’s rows reaching the other', async ({ browser }) => {
  const [laptop, phone] = await Promise.all([person(browser, 'Ana'), person(browser, 'Ana')])
  const folder = await expenses(laptop)
  await laptop.evaluate(async (folder) => {
    const { app } = await import('/ui/state.js')
    await (await import('/caps/share/share.js')).openShare({ path: `${app.projectDir}/conversations/`, title: 'Expenses', item: { text: '' }, thing: { kind: 'collection', uri: folder } }, null)
  }, folder)
  const sharing = laptop.locator('app-share-dialog dialog[open]')
  // Your devices ticked and Work on it together, as Share does where the laptop has other devices (the laptop here has none paired):
  // a circle nobody is invited to, with no link.
  await laptop.evaluate(async (folder) => {
    await (await import('/ui/caps.js')).unlock('together')
    await (await import('/caps/together/page.js')).start({ thing: { kind: 'collection', uri: folder }, title: 'Expenses' }, [], false)
  }, folder)
  await expect(sharing.getByText('Nobody else has joined yet.')).toBeVisible()
  await expect(sharing.getByTitle('Link', { exact: true })).toHaveCount(0)

  // Her keys reach the phone as Your devices carries them (D700): her person and the circle, the phone's project standing in for the
  // laptop's, which pairing writes under its own name. The phone follows the circle as soon as its key is there.
  const keys = await laptop.evaluate(async () => {
    const { app } = await import('/ui/state.js')
    return { ...await (await import('/ui/secrets.js')).secretsWhere(app.fs, (id) => id === 'person' || id.startsWith('circle:')), dir: app.projectDir }
  })
  await phone.evaluate(async ({ dir, ...keys }) => {
    const [{ app }, { unlock }, { setSecrets }] = await Promise.all([import('/ui/state.js'), import('/ui/caps.js'), import('/ui/secrets.js')])
    await unlock('tables')
    await unlock('together')
    await setSecrets(app.fs, Object.fromEntries(Object.entries(keys).map(([id, text]) => [id, id === 'person' ? text : text.replaceAll(JSON.stringify(dir), JSON.stringify(app.projectDir))])))
  }, keys)
  await expect.poll(() => items(phone, folder)).toEqual(['Flat', 'Flights'])
  await add(phone, folder, 'Taxi')
  await expect.poll(() => items(laptop, folder)).toEqual(['Flat', 'Flights', 'Taxi'])
  await add(laptop, folder, 'Museum')
  await expect.poll(() => items(phone, folder)).toEqual(['Flat', 'Flights', 'Museum', 'Taxi'])
})

test('Ana and Bob make one deck together: a slide each reaches the other’s copy, and Ana’s open deck takes Bob’s in', async ({ browser }) => {
  const [ana, bob] = await Promise.all([person(browser, 'Ana'), person(browser, 'Bob')])
  const path = 'decks/01JAQXDECK000000000000000-lisbon.deck.html'
  /** The deck's Markdown as a copy keeps it. @param {Page} page */
  const source = (page) => page.evaluate(async (path) => (await (await import('/caps/skills/decks.js')).load(path))?.source ?? '', path)
  /** A slide added at the end, as the deck's pane writes a change. @param {Page} page @param {string} slide */
  const add = (page, slide) => page.evaluate(async ([path, slide]) => {
    const [{ app }, decks] = await Promise.all([import('/ui/state.js'), import('/caps/skills/decks.js')])
    const one = await decks.load(path)
    await decks.rewrite(path, `${one?.source.trimEnd()}\n\n---\n\n${slide}\n`, 'Lisbon', app.projectDir)
  }, [path, slide])
  await ana.evaluate(async (path) => {
    const [{ app }, { unlock }, decks] = await Promise.all([import('/ui/state.js'), import('/ui/caps.js'), import('/caps/skills/decks.js')])
    await unlock('skills')
    await unlock('share')
    await decks.rewrite(path, '# Lisbon\n\n---\n\n# Friday\n\nLand at 20:15.\n', 'Lisbon', app.projectDir)
    await (await import('/ui/preview.js')).preview({ uri: path, name: 'Lisbon', title: 'Lisbon', mimeType: 'text/html' })
    await (await import('/caps/share/share.js')).openShare({ path: `${app.projectDir}/conversations/`, title: 'Lisbon', item: { text: '' }, thing: { kind: 'deck', uri: path } }, null)
  }, path)
  const sharing = ana.locator('app-share-dialog dialog[open]')
  await sharing.getByRole('button', { name: 'Copy an invitation link instead' }).click()
  const link = await sharing.getByTitle('Link', { exact: true }).inputValue()
  await sharing.getByRole('button', { name: 'Close' }).click()

  await bob.goto(link)
  const joining = bob.locator('app-together-dialog dialog[open]')
  await joining.getByLabel('Your name, as the others will see it').fill('Bob')
  await joining.getByRole('button', { name: 'Join' }).click()
  await expect.poll(() => source(bob)).toContain('Land at 20:15.')
  await expect(bob.locator('aside.pane.preview app-slides')).toBeAttached()

  await add(bob, '# Saturday\n\nThe castle in the morning.')
  await expect.poll(() => source(ana)).toContain('The castle in the morning.')
  await expect.poll(() => ana.evaluate(() => /** @type {any} */ (document.querySelector('aside.pane.preview app-slides'))?.file?.source ?? '')).toContain('The castle in the morning.')
  await add(ana, '# Sunday\n\nSintra.')
  await expect.poll(() => source(bob)).toContain('Sintra.')
  expect(await source(bob)).toContain('The castle in the morning.')
})

test('Ana and Bob work on a whole project together: its documents reach each other’s copy, drawn as hers are, and Ana’s tasks stay hers', async ({ browser }) => {
  const [ana, bob] = await Promise.all([person(browser, 'Ana'), person(browser, 'Bob')])
  const plan = 'documents/01JAQXDOC0000000000000000P-plan.md', task = 'conversations/01JAQXTASK000000000000000Z.jsonl'
  const dir = await ana.evaluate(async ([plan, task]) => {
    const [{ app, refreshProjects }, { createProject }, { unlock }] = await Promise.all([import('/ui/state.js'), import('/core/settings.js'), import('/ui/caps.js')])
    await unlock('projects')
    await unlock('together')
    const dir = await createProject(app.fs, { name: 'Lisbon trip', by: 'user' })
    await app.fs.write(`${dir}/${plan}`, '---\nformat: 1\nname: Plan\nauthor: user\n---\n# Plan\n\nFriday: land at 20:15.\n\n```echarts\n{"xAxis":{"type":"category","data":["Fri","Sat"]},"yAxis":{"type":"value"},"series":[{"type":"bar","data":[1,2]}]}\n```\n')
    await app.fs.write(`${dir}/${task}`, `${JSON.stringify({ format: 1, kind: 'conversation', id: '01JAQXTASK000000000000000Z' })}\n`)
    await refreshProjects()
    ;(await import('/caps/projects/projects.js')).editProject(app.projects.peek().find((one) => one.dir === dir))
    return dir
  }, [plan, task])
  await ana.locator('app-project-dialog dialog[open]').getByRole('button', { name: 'Work on this project together' }).click()
  const together = ana.locator('app-together-dialog dialog[open]')
  await expect(together.getByText('Its documents, collections, slides, designs and files stay the same for everyone in it.', { exact: false })).toBeVisible()
  await together.getByRole('button', { name: 'Start' }).click()
  await expect(together.getByRole('heading', { name: 'People in this project' })).toBeVisible()
  const link = await ana.evaluate(async (dir) => { const engine = await import('/caps/together/engine.js'); return engine.linkFor(/** @type {any} */ (engine.circleAt(dir))) }, dir)

  // Bob joins: the project is his too, with its document, and none of Ana's tasks.
  await bob.goto(link)
  const joining = bob.locator('app-together-dialog dialog[open]')
  await joining.getByLabel('Your name, as the others will see it').fill('Bob')
  await joining.getByRole('button', { name: 'Join' }).click()
  await expect.poll(() => bob.evaluate(async () => (await import('/ui/state.js')).app.projectDir)).toBe(dir)
  /** A file of the project as a copy keeps it. @param {Page} page @param {string} path */
  const read = (page, path) => page.evaluate(async ([dir, path]) => (await (await import('/ui/state.js')).app.fs.read(`${dir}/${path}`)) ?? '', [dir, path])
  await expect.poll(() => read(bob, plan)).toContain('Friday: land at 20:15.')
  expect(await read(bob, task)).toBe('')
  await expect(bob.locator('app-projects')).toContainText('Lisbon trip')
  // Bob never found documents: the project's are his to open, and its chart comes with Jean's own skill, in the project's room.
  await expect.poll(() => bob.evaluate(async () => (await import('/ui/caps.js')).loaded.peek().has('documents'))).toBe(true)
  await expect.poll(() => read(bob, 'skills/chart/SKILL.md')).toContain('echarts')

  // Each one's words reach the other's copy, and a document Bob makes reaches Ana.
  await bob.evaluate(async ([dir, plan]) => {
    const { app } = await import('/ui/state.js')
    await app.fs.write(`${dir}/${plan}`, `${((await app.fs.read(`${dir}/${plan}`)) ?? '').trimEnd()}\n\nSaturday: the castle.\n`)
    await app.fs.write(`${dir}/documents/01JAQXDOC0000000000000000B-food.md`, '---\nformat: 1\nname: Food\nauthor: user\n---\n# Food\n\nPastéis de nata.\n')
  }, [dir, plan])
  await expect.poll(() => read(ana, plan)).toContain('Saturday: the castle.')
  await expect.poll(() => read(ana, 'documents/01JAQXDOC0000000000000000B-food.md')).toContain('Pastéis de nata.')
})

test('what Ana’s copy draws, Bob’s draws too: a chart in their shared task and a score in their shared document, each with Jean’s own skill that declares it (D378)', async ({ browser }) => {
  const [ana, bob] = await Promise.all([person(browser, 'Ana'), person(browser, 'Bob')])
  const doc = 'documents/01JAQXDOC0000000000000000S-song.md'
  const chart = `Here it is.\n\n\`\`\`echarts\n${JSON.stringify({ xAxis: { type: 'category', data: ['Mon', 'Tue'] }, yAxis: { type: 'value' }, series: [{ type: 'bar', data: [3, 5] }] })}\n\`\`\``
  /** A link to work together on what Share is opened on. @param {Page} page */
  const invitation = async (page) => {
    const sharing = page.locator('app-share-dialog dialog[open]')
    await sharing.getByRole('button', { name: 'Copy an invitation link instead' }).click()
    const link = await sharing.getByTitle('Link', { exact: true }).inputValue()
    await sharing.getByRole('banner').getByRole('button', { name: 'Close' }).click()
    return link
  }
  /** Bob joins from a link. @param {string} link */
  const join = async (link) => {
    await bob.goto(link)
    const joining = bob.locator('app-together-dialog dialog[open]')
    await joining.getByLabel('Your name, as the others will see it').fill('Bob')
    await joining.getByRole('button', { name: 'Join' }).click()
  }
  /** Bob's skills, by name. */
  const skills = () => bob.evaluate(async () => ((await import('/ui/caps.js')).loaded.peek().has('skills') ? (await (await import('/caps/skills/skills.js')).skills()).map((skill) => skill.name).sort() : []))

  // A task whose answer holds a chart, which Bob, who never found charts, joins: it draws at once, and the toast names the skill added.
  await ana.evaluate(async (text) => {
    const [{ app, refreshConversations, openConversation }, { createConversation, appendRecords }, { metaRecord, userRecord, envelope }, { unlock }] = await Promise.all([
      import('/ui/state.js'), import('/core/conversations.js'), import('/core/events.js'), import('/ui/caps.js')])
    const { path } = await createConversation(app.fs, { projectDir: app.projectDir, by: app.deviceId })
    await appendRecords(app.fs, path, [metaRecord(app.deviceId, { title: 'My week' }), userRecord('Chart my week', app.deviceId), envelope('jean', { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text } }, 0)])
    await refreshConversations()
    await openConversation(path)
    await unlock('share')
    await (await import('/caps/share/share.js')).openShare({ path, title: 'My week' }, null)
  }, chart)
  expect(await skills()).toEqual([])
  await join(await invitation(ana))
  const answer = bob.locator('app-conversation .msg-jean .prose')
  await expect(bob.locator('.toast')).toContainText('Added to your skills, to show in full what was shared with you: Chart.')
  await expect(answer.locator('app-chart .chart canvas')).toBeVisible()
  await expect(answer.locator('pre code')).toHaveCount(0)
  expect(await skills()).toEqual(['chart'])

  // A document holding a tune: Bob's copy draws its score too.
  await ana.evaluate(async (doc) => {
    const [{ app }, { unlock }] = await Promise.all([import('/ui/state.js'), import('/ui/caps.js')])
    await unlock('documents')
    await app.fs.write(`${app.projectDir}/${doc}`, '---\nformat: 1\nname: Song\nauthor: user\n---\n# Song\n\n```abc\nX:1\nT:Scale\nM:4/4\nK:C\nCDEF|GABc|\n```\n')
    await (await import('/caps/share/share.js')).openShare({ path: `${app.projectDir}/conversations/`, title: 'Song', item: { text: '' }, thing: { kind: 'document', uri: doc } }, null)
  }, doc)
  await join(await invitation(ana))
  await expect(bob.locator('.toast')).toContainText('Added to your skills, to show in full what was shared with you: Music score.')
  await expect(bob.locator('#doc app-score .score-sheet svg')).toHaveCount(1)
  expect(await skills()).toEqual(['chart', 'music-score'])
})

/** Share opened on Expenses, worked on together or not yet; its dialog. @param {Page} page @param {string} folder */
async function shareExpenses(page, folder) {
  await page.evaluate(async (folder) => {
    const { app } = await import('/ui/state.js')
    await (await import('/caps/share/share.js')).openShare({ path: `${app.projectDir}/conversations/`, title: 'Expenses', item: { text: '' }, thing: { kind: 'collection', uri: folder } }, null)
  }, folder)
  return page.locator('app-share-dialog dialog[open]')
}

test('Ana turns the link off and People still shows her; Share’s invitation link turns it on again, and Bob joins with it', async ({ browser }) => {
  const [ana, bob] = await Promise.all([person(browser, 'Ana'), person(browser, 'Bob')])
  const folder = await expenses(ana)
  let sharing = await shareExpenses(ana, folder)
  await sharing.getByRole('button', { name: 'Copy an invitation link instead' }).click()
  const first = await sharing.getByTitle('Link', { exact: true }).inputValue()
  await sharing.getByRole('button', { name: 'People in this collection' }).click()
  const people = ana.locator('app-together-dialog dialog[open]')
  await people.getByRole('button', { name: 'Turn the link off' }).click()
  // The circle everyone moved to, Ana in it, with no link to copy.
  await expect(people.getByRole('button', { name: 'Copy link' })).toHaveCount(0)
  await expect(people.locator('li')).toHaveText([/Ana \(you\)/])
  await people.getByRole('button', { name: 'Close' }).click()

  // Asked for a link again, Share gives a new one rather than People with none.
  sharing = await shareExpenses(ana, folder)
  await sharing.getByRole('button', { name: 'Copy an invitation link instead' }).click()
  const link = await sharing.getByTitle('Link', { exact: true }).inputValue()
  expect(link).not.toBe(first)
  await expect(ana.locator('app-together-dialog dialog[open]')).toHaveCount(0)
  await bob.goto(link)
  const joining = bob.locator('app-together-dialog dialog[open]')
  await joining.getByLabel('Your name, as the others will see it').fill('Bob')
  await joining.getByRole('button', { name: 'Join' }).click()
  await expect.poll(() => items(bob, folder)).toEqual(['Flat', 'Flights'])
})

test('a circle whose journal the relay no longer has ends here, and Share’s invitation link starts working together again', async ({ browser }) => {
  const ana = await person(browser, 'Ana')
  const folder = await expenses(ana)
  // Expenses kept in step on Ana's devices alone, in a journal the relay doesn't have (its folder wiped, or past its days), followed as Together starts.
  await ana.evaluate(async ([folder, relay]) => {
    const [{ app }, { setSecrets }, { base64url, random }, { encode }, { journalOf }, { unlock }] = await Promise.all([import('/ui/state.js'), import('/ui/secrets.js'),
      import('/caps/share/seal.js'), import('/ui/seal.js'), import('/caps/together/journal.js'), import('/ui/caps.js')])
    const read = base64url(random(32))
    const kept = { format: 1, relay, kind: 'collection', place: { dir: app.projectDir, folder }, title: 'Expenses', owner: 'A'.repeat(22), ownerHash: '', ownerToken: base64url(random(32)),
      epoch: 0, keys: { 0: encode(random(32)) }, read, write: base64url(random(32)), links: false, role: 'edit' }
    await setSecrets(app.fs, { [`circle:${await journalOf(read)}`]: JSON.stringify(kept) })
    await unlock('together')
  }, [folder, RELAY_URL])
  await expect(ana.locator('app-toasts')).toContainText('Working together on “Expenses” stopped. Your copy stays yours.')
  await expect.poll(() => ana.evaluate(async () => Object.keys(await (await import('/ui/secrets.js')).secretsWhere((await import('/ui/state.js')).app.fs, (id) => id.startsWith('circle:'))).length)).toBe(0)
  const sharing = await shareExpenses(ana, folder)
  await sharing.getByRole('button', { name: 'Copy an invitation link instead' }).click()
  await expect(sharing.getByTitle('Link', { exact: true })).toHaveValue(/#\/join\//)
})

test('where the relay keeps no journals, Share offers no working together: with nobody met, Publish alone, without tabs', async ({ browser }) => {
  const ana = await person(browser, 'Ana')
  // A relay as jean.is's was before its configuration kept journals: its root names none.
  await ana.route(RELAY_URL, (route) => route.fulfill({ json: { format: 1, message: 25_000_000, days: 7 }, headers: { 'access-control-allow-origin': '*' } }))
  const folder = await expenses(ana)
  await ana.evaluate(async (folder) => {
    const { app } = await import('/ui/state.js')
    await (await import('/caps/share/share.js')).openShare({ path: `${app.projectDir}/conversations/`, title: 'Expenses', item: { text: '' }, thing: { kind: 'collection', uri: folder } }, null)
  }, folder)
  const sharing = ana.locator('app-share-dialog dialog[open]')
  await expect(sharing.getByRole('button', { name: 'Publish link' })).toBeVisible()
  await expect(sharing.getByRole('tab')).toHaveCount(0)
  await expect(sharing.getByRole('button', { name: 'Copy an invitation link instead' })).toHaveCount(0)
  await expect(sharing.getByRole('button', { name: 'Work on it together' })).toHaveCount(0)
})
