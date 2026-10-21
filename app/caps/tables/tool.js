// What a brain calls to make a table (phase 0's spike, not wired into the app), and the line the
// prompt gives it, within a capability's 40 tokens.
import { MADE } from './table.js'

export const LINE = { name: 'table_create', line: 'when the user wants to keep track of something (applications, expenses, books…), make a table with the columns it needs' }

/** @type {import('../../core/types.js').ToolSpec} */
export const TABLE_CREATE = {
  name: 'table_create',
  // Measured on the device's brain (test/tables/findings.md): naming the types and showing one
  // table, about nothing the test set asks for, about doubled how often its table was right.
  description: 'Make a table to keep track of something, with every column the user will want. Name it and its columns in the user’s language; the first column names each row. '
    + 'Give each column the type its values have: a date, a number, a checkbox for yes or no, a select for a few choices, a status for steps (its options, in order); text for the rest. '
    + 'For plants to water: {"name":"Plants","columns":[{"name":"Plant","type":"text"},{"name":"Last watered","type":"date"},{"name":"Light","type":"select","options":["Sun","Shade"]},{"name":"Health","type":"status","options":["Thriving","Struggling","Gone"]}]}',
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
