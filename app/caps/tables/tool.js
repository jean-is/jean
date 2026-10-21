// What a brain calls to make a table (phase 0's spike, not wired into the app), and the line the
// prompt gives it, within a capability's 40 tokens.
import { MADE } from './table.js'

export const LINE = { name: 'table_create', line: 'when the user wants to keep track of something (applications, expenses, books…), make a table with the columns it needs' }

/** @type {import('../../core/types.js').ToolSpec} */
export const TABLE_CREATE = {
  name: 'table_create',
  description: 'Make a table to keep track of something. Name it and its columns in the user’s language; the first column names each row.',
  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      columns: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            type: { type: 'string', enum: MADE },
            options: { type: 'array', items: { type: 'string' }, description: 'A select’s choices, or a status’s steps in order' },
          },
          required: ['name', 'type'],
        },
      },
    },
    required: ['name', 'columns'],
  },
}
