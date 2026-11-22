// SPDX-License-Identifier: MIT
// What Jean's views ask of the room around them, where a page of the site frames a creation alone (./player.js): in
// the place of ui/send.js, ui/creations.js, ui/windows.js, ui/preview.js, ui/dialogs.js and
// caps/whiteboards/whiteboards.js, which the room loads with all it has. Each name is one those views import (test/creation.test.js holds them to it).
import { nothing } from 'lit-html'
import { signal } from '@preact/signals-core'

/** ui/send.js: what a view would ask Jean is told to the player, which says what Jean would do with it. @param {string} text */
export const send = (text) => void document.dispatchEvent(new CustomEvent('asked', { detail: text }))

/** ui/creations.js: no other creation is kept here, to show as a card or to list. */
export const all = signal(/** @type {any[]} */ ([]))
export const show = () => () => {}
export const ask = async () => {}
export const creationsHere = async () => []
export const seek = async () => {}
export const reread = async () => {}
export const page = { at: 2, draw: () => null, leave: () => {} }
export const grid = () => nothing

/** ui/windows.js: nothing is kept in the address. */
export const keep = () => {}

/** ui/preview.js and ui/dialogs.js: no other pane opens beside this one, and no dialog over it. */
export const preview = () => {}
export const unshow = () => {}

/** caps/whiteboards/whiteboards.js: the whiteboards on show, what is picked on one, and the one being written. */
export const beside = new Set()
export const picked = signal(/** @type {{ folder: string, rows: string[] } | null} */ (null))
export const writing = signal('')
export const onShow = signal(/** @type {string[]} */ ([]))
