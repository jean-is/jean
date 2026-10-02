import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addCatalog, useLocale, t, dir, pickLocale, preferredLocales, languageName, firstWords, locale } from '../core/i18n.js'
import { resolveRule, ruleFromPermission } from '../core/rules.js'
import { buildSystemPrompt, basePromptForBudget } from '../core/prompt.js'
import { foldTurns, toChatMessages, userRecord, envelope, metaRecord, titleOf, openingOf } from '../core/events.js'
import { parseFrontMatter, stringifyFrontMatter, applyPolicy, DEFAULT_SETTINGS } from '../core/settings.js'
import { ulid, ulidTime } from '../core/ulid.js'

test('i18n: interpolation, plurals, fallback and direction', async () => {
  addCatalog('en', { hello: 'Hello {name}', items: { one: '{count} item', other: '{count} items' }, onlyEn: 'English' })
  addCatalog('ar', { hello: 'مرحبا {name}', items: { zero: 'لا عناصر', one: 'عنصر واحد', two: 'عنصران', few: '{count} عناصر', many: '{count} عنصرًا', other: '{count} عنصر' } })
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

test('i18n: only the chosen catalog is fetched, and English only when it cannot be', async () => {
  const i18n = await import('../core/i18n.js?fresh') // its own catalogs, without the ones added above
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
  const i18n = await import('../core/i18n.js?parts')
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

test('prompt: sections, language, budget', () => {
  const prompt = buildSystemPrompt({
    assistantName: 'Margot', uiLanguage: 'French',
    tools: [{ name: 'read', line: 'read a file the user shared' }],
    sections: { memory: 'Prefers short answers.' }, now: new Date('2026-10-01T12:00:00Z'),
  })
  assert.match(prompt, /^You are Margot,/)
  assert.match(prompt, /<tools>\n- read: read a file the user shared\n<\/tools>/)
  assert.match(prompt, /If that is unclear, use French\./)
  assert.match(prompt, /<memory>\nPrefers short answers\.\n<\/memory>/)
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

  assert.deepEqual(toChatMessages(records), [
    { role: 'user', content: 'Sum the file' },
    { role: 'assistant', content: 'Reading it.', toolCalls: [{ id: 't1', name: 'read', args: { path: 'a.csv' } }] },
    { role: 'tool', toolCallId: 't1', name: 'read', content: '1,2,3' },
    { role: 'assistant', content: 'The total is 6.' },
    { role: 'user', content: 'Thanks' },
  ])
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

  const brain = { id: 'b1', provider: /** @type {const} */ ('custom'), api: /** @type {const} */ ('openai'), baseURL: 'https://ai.corp/v1', model: 'm' }
  const { settings, locked } = applyPolicy({ ...DEFAULT_SETTINGS, rules: { fetch: 'allow' } }, { brains: [brain], rules: { fetch: 'never' } })
  assert.equal(settings.activeBrain, 'b1')
  assert.equal(settings.rules.fetch, 'never')
  assert.ok(locked.has('brains') && locked.has('rules.fetch'))
})

test('ulid: 26 sortable characters carrying the time', () => {
  const a = ulid(1000)
  const b = ulid(2000)
  assert.equal(a.length, 26)
  assert.ok(a < b)
  assert.equal(ulidTime(b), 2000)
})
