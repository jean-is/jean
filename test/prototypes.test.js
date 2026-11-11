// Prototypes (D742): the check from a prototype's files (app/caps/prototypes/check.js), which npm run prototypes measures brains
// with too: Sites' check less what only a site for strangers needs, and a prototype's own rules; the tools as declared.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkScreens, told, flows } from '../app/caps/prototypes/check.js'
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

test('the tools are declared as a site’s are, with the draft skill among Jean’s own', async () => {
  assert.deepEqual(LINES.map((line) => line.name), ['prototype', 'prototype_change'])
  assert.deepEqual(PROTOTYPE.parameters.required, ['name', 'files'])
  assert.deepEqual(CHANGE.parameters.required, ['prototype'])
  assert.ok((await ownSkills()).includes('prototype') && (await ownSkills()).includes('site'))
})
