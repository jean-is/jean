// SPDX-License-Identifier: MIT
// How an answer's and a slide's words are drawn (ui/markdown.js): the space French puts before its punctuation never starts a line.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { unbroken } from '../app/ui/markdown.js'

test('the space before :, ;, !, ? and », and after «, is a no-break one; only a space already there', () => {
  assert.equal(unbroken('L’eau ne disparaît jamais : elle voyage ; « en boucle » ! Pourquoi ?'), 'L’eau ne disparaît jamais\u00a0: elle voyage\u00a0; «\u00a0en boucle\u00a0»\u00a0! Pourquoi\u00a0?')
  // As Canada's French writes them, and as English or German does, nothing to keep together.
  for (const text of ['Pas encore là? Regardez: ici.', 'Why? Because: this!', '»Ja«, sagte er.', 'Bonjour  tout le monde']) assert.equal(unbroken(text), text)
})
