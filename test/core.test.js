import { test } from 'node:test'
import assert from 'node:assert/strict'
import { setLoader, useLocale, t, tParts, dir, pickLocale, preferredLocales, languageName, firstWords, formatDuration, locale } from '../app/core/i18n.js'
import { resolveRule, ruleFromPermission } from '../app/core/rules.js'
import { buildSystemPrompt, basePromptForBudget, toChatMessages } from '../app/core/prompt.js'
import { foldTurns, userRecord, userRecords, noteRecord, envelope, metaRecord, titleOf, openingOf, requestsOf } from '../app/core/events.js'
import { parseFrontMatter, stringifyFrontMatter, applyPolicy, usedIn, DEFAULT_SETTINGS } from '../app/core/settings.js'
import { ulid } from '../app/core/ulid.js'

/** @type {Record<string, Record<string, any>>} */
const catalogs = {
  en: { hello: 'Hello {name}', items: { one: '{count} item', other: '{count} items' }, onlyEn: 'English', synced: 'Synced with {folder} · {when}' },
  ar: { hello: 'مرحبا {name}', items: { zero: 'لا عناصر', one: 'عنصر واحد', two: 'عنصران', few: '{count} عناصر', many: '{count} عنصرًا', other: '{count} عنصر' } },
  ja: { synced: '{when}に{folder}と同期しました' },
}
setLoader(async (lang) => catalogs[lang] ?? null)

test('i18n: interpolation, plurals, fallback and direction', async () => {
  await useLocale('en')
  assert.equal(t('hello', { name: 'Ada' }), 'Hello Ada')
  assert.equal(t('items', { count: 1 }), '1 item')
  assert.equal(t('items', { count: 1200 }), '1,200 items')
  assert.equal(t('missing.key'), 'missing.key')
  await useLocale('ar')
  assert.equal(locale.value, 'ar')
  assert.equal(t('items', { count: 2 }), 'عنصران')
  assert.match(t('items', { count: 3 }), /^[3٣] عناصر$/) // CLDR's default digits for "ar" vary by version
  assert.equal(t('onlyEn'), 'English')
  assert.equal(dir('ar'), 'rtl')
  assert.equal(dir('fr-CA'), 'ltr')
})

test('i18n: a value that isn’t text stays itself, where the translation puts it', async () => {
  const folder = { link: 'Drive' }
  const when = { time: 'now' }
  await useLocale('en')
  assert.deepEqual(tParts('synced', { folder, when }), ['Synced with ', folder, ' · ', when, ''])
  await useLocale('ja')
  assert.deepEqual(tParts('synced', { folder, when }), ['', when, 'に', folder, 'と同期しました'])
  assert.deepEqual(tParts('synced', { folder: 'Drive', when: 3 }), ['3にDriveと同期しました'])
})

test('i18n: only the chosen catalog is fetched, and English only when it cannot be', async () => {
  const i18n = await import('../app/core/i18n.js?fresh') // its own catalogs and loader, without the ones above
  /** @type {string[]} */
  const fetched = []
  i18n.setLoader(async (lang) => {
    fetched.push(lang)
    return lang === 'xx' ? null : { hello: lang }
  })
  await i18n.useLocale('fr')
  assert.deepEqual(fetched, ['fr'])
  assert.equal(i18n.t('hello'), 'fr')
  await i18n.useLocale('xx')
  assert.deepEqual(fetched, ['fr', 'xx', 'en'])
  assert.equal(i18n.locale.value, 'xx')
  assert.equal(i18n.t('hello'), 'en')
})

test('i18n: the dialogs’ part loads when asked for, then with every language switch', async () => {
  const i18n = await import('../app/core/i18n.js?parts')
  /** @type {string[]} */
  const fetched = []
  i18n.setLoader(async (lang, part) => {
    fetched.push(`${lang}/${part}`)
    return part ? { title: `${lang} dialog` } : { hello: lang }
  })
  await i18n.useLocale('fr')
  assert.equal(i18n.t('title'), 'title')
  await i18n.useStrings('dialogs')
  assert.equal(i18n.t('title'), 'fr dialog')
  await i18n.useLocale('ja')
  assert.deepEqual(fetched, ['fr/', 'fr/dialogs', 'ja/', 'ja/dialogs'])
  assert.equal(i18n.t('hello'), 'ja')
  assert.equal(i18n.t('title'), 'ja dialog')
})

test('i18n: locale picking, language names, first words', async () => {
  assert.equal(pickLocale(['en', 'fr', 'ar'], ['fr-BE', 'en']), 'fr')
  assert.equal(pickLocale(['en', 'fr', 'ar'], ['de-DE']), 'en')
  assert.equal(pickLocale(['en', 'zh-Hans', 'zh-Hant'], ['zh-CN']), 'zh-Hans')
  const available = ['en', 'fr', 'he', 'pt', 'tl', 'zh-Hans', 'zh-Hant']
  assert.deepEqual(preferredLocales(available, ['fr-BE', 'zh-TW', 'en-US', 'fr', 'de', 'en']), ['fr', 'zh-Hant', 'en'])
  assert.deepEqual(preferredLocales(available, ['pt-BR', 'iw', 'fil-PH', 'zh']), ['pt', 'he', 'tl', 'zh-Hans'])
  assert.deepEqual(preferredLocales(available, ['', '*', 'de']), [])
  assert.equal(languageName('fr'), 'Français')
  assert.equal(languageName('ar', 'en'), 'Arabic')
  await useLocale('en')
  assert.equal(firstWords('one two three four', 2), 'one two…')
  assert.equal(firstWords('short text', 8), 'short text')
})

// Browsers have Intl.DurationFormat (Chrome 129, Safari 16.4, Firefox 136); Node only from 23, and the CLI, for Node 22, never says a duration.
test('i18n: a duration is said in minutes and seconds, never in a fraction of a minute', { skip: !('DurationFormat' in Intl) }, () => {
  const was = locale.value
  locale.value = 'en'
  assert.deepEqual([527, 1234, 2040, 19_000, 72_000, 120_400, 3_785_000].map(formatDuration), ['527 ms', '1.2 sec', '2 sec', '19 sec', '1 min, 12 sec', '2 min', '1 hr, 3 min, 5 sec'])
  locale.value = 'fr'
  assert.equal(formatDuration(72_000).replace(/\s/g, ' '), '1 min et 12 s')
  locale.value = was
})

test('rules: policy, reserved, layers and approvals', () => {
  assert.equal(resolveRule('read'), 'allow')
  assert.equal(resolveRule('delete'), 'ask')
  assert.equal(resolveRule('unknown'), 'ask')
  assert.equal(resolveRule('read', { reserved: true }), 'never')
  assert.equal(resolveRule('delete', { user: { delete: 'allow' } }), 'allow')
  assert.equal(resolveRule('delete', { user: { delete: 'allow' }, project: { delete: 'never' } }), 'never')
  assert.equal(resolveRule('delete', { project: { delete: 'allow' }, policy: { delete: 'never' } }), 'never')
  assert.equal(ruleFromPermission('allow_always'), 'allow')
  assert.equal(ruleFromPermission('reject_always'), 'never')
  assert.equal(ruleFromPermission('allow_once'), null)
})

test('prompt: sections, language, rules said once, budget', () => {
  const prompt = buildSystemPrompt({
    assistantName: 'Margot', uiLanguage: 'French',
    tools: [{ name: 'read', line: 'read a file the user shared' }], rules: ['Write formulas with symbols.', 'Write formulas with symbols.'],
    sections: { memory: 'Prefers short answers.' }, now: new Date('2026-10-01T12:00:00Z'),
  })
  assert.match(prompt, /^You are Margot,/)
  assert.match(prompt, /<tools>\n- read: read a file the user shared\n<\/tools>/)
  assert.match(prompt, /If that is unclear, use French\./)
  assert.match(prompt, /<memory>\nPrefers short answers\.\n<\/memory>/)
  assert.equal(prompt.split('- Write formulas with symbols.').length, 2)
  assert.match(prompt, /Today is 2026-10-01\./)
  assert.doesNotMatch(prompt, /<skills>/)
  assert.ok(basePromptForBudget().length / 4 < 200, 'base prompt stays under the token budget')
})

const tool = (/** @type {any} */ extra) => ({ sessionUpdate: 'tool_call', toolCallId: 't1', name: 'read', title: 'Read a.csv', kind: 'read', status: 'completed', rawInput: { path: 'a.csv' }, rawOutput: '1,2,3', ...extra })

test('events: fold turns and derive the model context', () => {
  const records = [
    userRecord('Sum the file', 'dev1'),
    envelope('jean', { sessionUpdate: 'tool_call', toolCallId: 'brain-0', title: 'model', kind: 'think', status: 'completed' }, 0),
    envelope('jean', { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Reading it.' } }, 0),
    envelope('jean', /** @type {any} */ (tool()), 0),
    envelope('jean', { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'The total is 6.' } }, 1),
    metaRecord('dev1', { title: 'Sums' }),
    userRecord('Thanks', 'dev1'),
  ]
  const turns = foldTurns(records)
  assert.equal(turns.length, 2)
  assert.equal(turns[0].steps.length, 2)
  assert.equal(turns[0].steps[0].tools.length, 2)
  assert.equal(titleOf(records), 'Sums')
  assert.equal(openingOf(records), 'Sum the file')
  assert.deepEqual(requestsOf(records), ['Sum the file', 'Thanks'])

  assert.deepEqual(toChatMessages(records), [
    { role: 'user', content: 'Sum the file' },
    { role: 'assistant', content: 'Reading it.', toolCalls: [{ id: 't1', name: 'read', args: { path: 'a.csv' } }] },
    { role: 'tool', toolCallId: 't1', name: 'read', content: '1,2,3' },
    { role: 'assistant', content: 'The total is 6.' },
    { role: 'user', content: 'Thanks' },
  ])
})

test('events: a turn knows when its answer was last written, not a note or a title after it', () => {
  const when = (/** @type {any} */ record, /** @type {string} */ at) => ({ ...record, at })
  const records = [
    when(userRecord('Sum the file', 'dev1'), '2026-10-07T10:00:00.000Z'),
    when(envelope('jean', { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Reading it.' } }, 0), '2026-10-07T10:00:02.000Z'),
    when(envelope('jean', { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'The total is 6.' } }, 1), '2026-10-07T10:00:09.000Z'),
    when(metaRecord('dev1', { title: 'Sums' }), '2026-10-07T10:00:12.000Z'),
    when(noteRecord('The user undid your change.', /** @type {any} */ ({ kind: 'undone' })), '2026-10-07T10:03:00.000Z'),
    when(userRecord('Thanks', 'dev1'), '2026-10-07T10:05:00.000Z'),
  ]
  const [first, second] = foldTurns(records)
  assert.equal(first.at, '2026-10-07T10:00:00.000Z')
  assert.equal(first.end, '2026-10-07T10:00:09.000Z')
  assert.equal(second.end, undefined)
})

test('events: a request knows the records up to its end, its files and words included (D188)', () => {
  const file = { type: /** @type {const} */ ('resource_link'), uri: 'files/a.csv', name: 'a.csv' }
  const records = [
    metaRecord('dev1', { prompt: /** @type {any} */ ({ system: 'You are Jean.', state: {} }) }),
    ...userRecords('Sum the file', [file], 'dev1'),
    envelope('jean', { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'The total is 6.' } }, 0),
    noteRecord('The user undid your change.', /** @type {any} */ ({ kind: 'undone' })),
    userRecord('Thanks', 'dev1'),
  ]
  const [first, second] = foldTurns(records)
  assert.equal(first.user?.upTo, 3)
  assert.equal(second.user?.upTo, 6)
})

test('events: failed tools become error results; empty steps are skipped', () => {
  const records = [
    userRecord('Delete it', 'dev1'),
    envelope('jean', { sessionUpdate: 'tool_call', toolCallId: 'brain-0', title: 'model', kind: 'think', status: 'failed' }, 0),
    envelope('jean', /** @type {any} */ (tool({ status: 'failed', rawOutput: 'The user declined this action.' })), 0),
  ]
  const messages = toChatMessages(records)
  assert.deepEqual(messages.at(-1), { role: 'tool', toolCallId: 't1', name: 'read', content: 'The user declined this action.', isError: true })
})

test('settings: front matter round trip and policy', () => {
  const text = stringifyFrontMatter({ format: 1, default: true, name: 'Bakery: Margot', by: 'dev1' }, 'Body\n')
  const { data, body } = parseFrontMatter(text)
  assert.deepEqual(data, { format: 1, default: true, name: 'Bakery: Margot', by: 'dev1' })
  assert.equal(body, 'Body\n')
  assert.deepEqual(parseFrontMatter('no front matter'), { data: {}, body: 'no front matter' })
  // Block scalars, as many SKILL.md files write a long description: `>` folds its lines, `|` keeps them.
  const block = '---\nname: ad-manager\ndescription: >\n  Turn ad spend into a decision:\n  pause, keep or raise.\n\nnotes: |-\n  one\n  two\nmetadata:\n  author: jean\n---\n# Ads\n'
  assert.deepEqual(parseFrontMatter(block).data, { name: 'ad-manager', description: 'Turn ad spend into a decision: pause, keep or raise.', notes: 'one\ntwo', metadata: { author: 'jean' } })

  const brain = { id: 'b1', provider: /** @type {const} */ ('custom'), api: /** @type {const} */ ('openai'), baseURL: 'https://ai.corp/v1', model: 'm' }
  const { settings, locked } = applyPolicy({ ...DEFAULT_SETTINGS, rules: { fetch: 'allow' } }, { brains: [brain], rules: { fetch: 'never' } })
  assert.equal(settings.activeBrain, 'b1')
  assert.equal(settings.rules.fetch, 'never')
  assert.ok(locked.has('brains') && locked.has('rules.fetch'))
})

test('settings: a brain or a connection kept to some projects is used in those only, and without a list in every one (D194)', () => {
  assert.ok(usedIn({}, 'P1'))
  assert.ok(usedIn({ projects: ['P1', 'P2'] }, 'P2'))
  assert.ok(!usedIn({ projects: ['P1'] }, 'P2'))
  assert.ok(!usedIn({ projects: [] }, 'P1'))
})

test('ulid: 26 sortable characters carrying the time', () => {
  const a = ulid(1000)
  const b = ulid(2000)
  assert.equal(a.length, 26)
  assert.ok(a < b)
  assert.equal(b.slice(0, 10), '00000001YG')
})
