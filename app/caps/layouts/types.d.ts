// SPDX-License-Identifier: MIT
// Layouts' shapes, for the type check only: marked's tokens as answers read them, with what Jean adds to them.
import type { Tokens } from 'marked'

/** A table: marked's, whether it is still being written (layouts.js), and its title, the line above it. */
export type Table = Tokens.Table & { still?: boolean, title?: string }

/** A list: marked's, whether it is still being written, and whether `sequenced` gathered it of steps written apart. */
export type List = Tokens.List & { still?: boolean, steps?: boolean }
