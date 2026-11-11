// Prototypes (D742): the check from a prototype's files (app/caps/prototypes/check.js), which npm run prototypes measures brains
// with too: Sites' check less what only a site for strangers needs, and a prototype's own rules; how its pages lie and what each is
// called, from what pressing through found; the tools as declared.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { checkScreens, told, flows, stepsOf, named } from '../app/caps/prototypes/check.js'
import { LINES, PROTOTYPE, CHANGE } from '../app/caps/prototypes/tool.js'
import { ownSkills } from './prototypes/tools.js'

const encode = (/** @type {string} */ text) => new TextEncoder().encode(text)

/** A screen as the draft skill asks for one: no description, card, header or foot. @param {string} title @param {string} body */
const screen = (title, body) => /* html */ `<!doctype html>
<html lang="en" dir="ltr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title><link rel="stylesheet" href="look.css"><link rel="stylesheet" href="style.css"></head>
<body><main>${body}</main><script src="prototype.js" defer></script></body></html>`

test('screens as the draft skill asks pass, with forms leading to the next screen', () => {
  const files = new Map([
    ['index.html', encode(screen('Salon · Services', '<h1>Services</h1><p>Prototype, sample data</p><a href="time.html?service=cut">Cut</a>'))],
    ['time.html', encode(screen('Salon · Time', '<h1>Time</h1><form action="confirm.html"><label for="t">Time</label><select id="t" name="time"><option>10:00</option></select><button>Continue</button></form>'))],
    ['confirm.html', encode(screen('Salon · Confirm', '<h1>Booked</h1><p><span data-given="time">10:00</span></p><a href="index.html">Home</a>'))],
    ['look.css', encode(':root { --paper: #fff; }')], ['style.css', encode('main { margin-inline: auto; }')],
    ['prototype.js', encode('const given = new URLSearchParams(location.search)')],
  ])
  const report = checkScreens(files)
  assert.deepEqual(report.problems, [])
  assert.deepEqual(report.pages, ['index.html', 'confirm.html', 'time.html'])
})

test('a prototype keeps nothing but its address, shows no alert, and asks for no password or card', () => {
  const files = new Map([
    ['index.html', encode(screen('Pay · Plans', '<h1>Plans</h1><label for="p">Password</label><input id="p" type="password"><label for="c">Card</label><input id="c" name="card-number" autocomplete="cc-number"><a href="done.html">Pay</a>'))],
    ['done.html', encode(screen('Pay · Done', '<h1>Welcome</h1>'))],
    ['prototype.js', encode('localStorage.setItem("plan", "pro")\nfunction confirm() {}\nconfirm()\nwindow.alert("Paid")')],
  ])
  const problems = checkScreens(files).problems.join('\n')
  assert.match(problems, /keeps choices in localStorage/)
  assert.match(problems, /calls alert\(\)/)
  assert.match(problems, /password; a prototype never does: show signing in as a button/)
  assert.match(problems, /card or bank number; a prototype never does/)
  assert.doesNotMatch(problems, /description|og:|header|footer|data-form/)
})

test('one screen alone is no prototype, and the report says how far pressing through went', () => {
  const report = checkScreens(new Map([['index.html', encode(screen('Survey', '<h1>One question</h1>'))]]))
  assert.match(report.problems.join('\n'), /it has one page/)
  const said = told({ ...report, flow: { screens: ['index.html'], reached: ['index.html'], followed: 0, pressed: 3, dead: [], unsure: 0, leads: [], errors: 0 } }, { name: 'Survey', place: 'prototypes/1-survey' })
  assert.match(said, /^Prototype "Survey" is at prototypes\/1-survey: 1 page in en\.\nPressed through from index\.html: 1 of 1 pages reached, 0 links followed and 3 controls pressed, 0 doing nothing\./)
  assert.equal(flows({ ...report, problems: [], flow: { screens: ['index.html'], reached: ['index.html'], followed: 0, pressed: 3, dead: [], unsure: 0, leads: [], errors: 0 } }), true)
  assert.equal(flows({ ...report, problems: [], flow: { screens: ['index.html', 'x.html'], reached: ['index.html'], followed: 0, pressed: 3, dead: [], unsure: 0, leads: [], errors: 0 } }), false)
})

test('its pages lie in steps from the first, a page that only leads back after those that go on, those nothing reaches last, each leading on further along', () => {
  const pages = ['add.html', 'confirm.html', 'done.html', 'index.html', 'lost.html', 'time.html']
  const flow = { screens: pages, reached: ['index.html', 'time.html', 'confirm.html', 'add.html', 'done.html'], followed: 6, pressed: 1, dead: [], unsure: 0, errors: 0,
    leads: /** @type {[string, string[]][]} */ ([['index.html', ['time.html']], ['time.html', ['index.html', 'confirm.html']], ['confirm.html', ['time.html', 'add.html', 'done.html']], ['add.html', ['confirm.html']], ['done.html', ['index.html']]]),
    by: /** @type {Record<string, [string, string]>} */ ({ 'time.html': ['index.html', 'Cut'], 'confirm.html': ['time.html', 'Continue'], 'add.html': ['confirm.html', 'Add a service'], 'done.html': ['confirm.html', 'Confirm'] }) }
  const { steps, on, by } = stepsOf(pages, flow)
  assert.deepEqual(steps, [['index.html'], ['time.html'], ['confirm.html'], ['done.html', 'add.html'], ['lost.html']])
  assert.deepEqual(on('confirm.html'), ['add.html', 'done.html'])
  assert.deepEqual([on('time.html'), on('add.html'), on('done.html')], [['confirm.html'], [], []])
  assert.deepEqual(by['done.html'], ['confirm.html', 'Confirm'])
  // Before pressing through says anything: the first page, then the others.
  assert.deepEqual(stepsOf(['b.html', 'index.html', 'a.html']).steps, [['index.html'], ['a.html', 'b.html']])
})

test('a page is called by its title less what every title shares before or after a separator', () => {
  assert.deepEqual(named(['Maison Léa · Book · Service', 'Maison Léa · Book · Second service', 'Maison Léa · Book · Done']), ['Service', 'Second service', 'Done'])
  assert.deepEqual(named(['Time · Maison Léa', 'Confirm · Maison Léa']), ['Time', 'Confirm'])
  assert.deepEqual(named(['طلب إجازة · طلباتي', 'طلب إجازة · طلب جديد']), ['طلباتي', 'طلب جديد'])
  // Words that only begin or end alike keep their letters; one title alone keeps its last part; a title that is all the others share stays whole.
  assert.deepEqual(named(['Booking', 'Booked']), ['Booking', 'Booked'])
  assert.deepEqual(named(['Step 1: Service', 'Step 2: Time']), ['Step 1: Service', 'Step 2: Time'])
  assert.deepEqual(named(['Salon · Services']), ['Services'])
  assert.deepEqual(named(['Salon', 'Salon · Time']), ['Salon', 'Salon · Time'])
  assert.deepEqual(named([]), [])
})

test('the tools are declared as a site’s are, a prototype saying its shape, with the draft skill among Jean’s own', async () => {
  assert.deepEqual(LINES.map((line) => line.name), ['prototype', 'prototype_change'])
  assert.deepEqual(PROTOTYPE.parameters.required, ['name', 'files'])
  assert.deepEqual(/** @type {any} */ (PROTOTYPE.parameters).properties.shape.enum, ['phone', 'computer'])
  assert.deepEqual(CHANGE.parameters.required, ['prototype'])
  assert.ok((await ownSkills()).includes('prototype') && (await ownSkills()).includes('site'))
})

// Build it (board.js) sends the prototype's files with a note naming two skills: the prototype's own, whose part on building
// says only what a prototype adds, and “Make an app”, which says how an app is written and names what a page is given.
test('Build it follows the skill for apps, which names only the colours and type a page in an answer is given', async () => {
  const read = (/** @type {string} */ path) => readFile(new URL(`../app/caps/${path}`, import.meta.url), 'utf8')
  const [prototype, app, pages, board] = await Promise.all([read('skills/directory/prototype/SKILL.md'), read('skills/directory/app/SKILL.md'), read('interactive/interactive.js'), read('prototypes/board.js')])
  const build = prototype.slice(prototype.indexOf('## Build it for real'), prototype.indexOf('## What a prototype isn'))
  assert.match(build, /Read the skill `app`/)
  assert.doesNotMatch(build, /localStorage|```html/, 'how an app is written is said once, in its own skill')
  assert.match(board, /Read the skills prototype and app/)
  assert.ok((await ownSkills()).includes('app'))
  const given = new Set([...pages.matchAll(/'((?:color|font|border-radius)-[\w-]+)':/g)].map(([, name]) => name))
  const named = [...app.matchAll(/`--([\w-]+)`/g)].map(([, name]) => name)
  assert.ok(named.length >= 8 && named.every((name) => given.has(name)), String(named.filter((name) => !given.has(name))))
  for (const said of ['localStorage', '256 KB', 'aria-current', 'role="status"', 'sendPrompt(text)', '<title>']) assert.ok(app.includes(said), said)
})
