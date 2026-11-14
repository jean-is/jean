// SPDX-License-Identifier: MIT
// What a brain calls to make a table (D491), as phase 0 measured it (test/tables/findings.md), and the
// line the prompt gives it, within a capability's 40 tokens. A relation column names its collection, as <tables> tells.
import { MADE } from './table.js'

export const LINE = { name: 'table_create', line: 'when the user wants to keep track of something (applications, expenses, books…), make a table with the columns it needs' }

// Measured on the device's brain (test/tables/findings.md): asking for a column for everything a
// row will hold, naming the types, and showing one table about nothing the test set asks for, in the
// user's language, so that its own columns are in that language too. In the app, from the locales.
// Said in fewer words for the whiteboard's note to fit within 400 tokens, and measured again (test/whiteboard/results.md).
const TEXT = 'Name the table and its columns in the user’s language; the first column names each row. '
  + 'Think of the person filling in one row: give a column to each thing the request names or implies, and to what they will note: who, when, how much, where it stands. '
  + 'Give each column the type its values have: a date, a number, a checkbox for yes or no, a select for a few choices, a status for steps (its options, in order); text for the rest.'
/** @param {string} name @param {string[]} columns plant, room, last watered, every how many days, repotting, health @param {string[]} rooms @param {string[]} health */
const plants = (name, [plant, room, watered, every, repot, healthy], rooms, health) => ({ name, columns: [
  { name: plant, type: 'text' }, { name: room, type: 'select', options: rooms }, { name: watered, type: 'date' },
  { name: every, type: 'number' }, { name: repot, type: 'checkbox' }, { name: healthy, type: 'status', options: health },
] })
export const EXAMPLES = /** @type {Record<string, object>} */ ({
  en: plants('Plants', ['Plant', 'Room', 'Last watered', 'Water every (days)', 'Needs repotting', 'Health'], ['Living room', 'Kitchen', 'Bedroom'], ['Thriving', 'Struggling', 'Gone']),
  fr: plants('Plantes', ['Plante', 'Pièce', 'Dernier arrosage', 'Arroser tous les (jours)', 'À rempoter', 'Santé'], ['Salon', 'Cuisine', 'Chambre'], ['En pleine forme', 'En difficulté', 'Perdue']),
  ar: plants('النباتات', ['النبتة', 'الغرفة', 'آخر سقي', 'السقي كل (أيام)', 'تحتاج إلى إعادة الزراعة', 'صحتها'], ['غرفة المعيشة', 'المطبخ', 'غرفة النوم'], ['مزدهرة', 'متعبة', 'ذبلت']),
  ja: plants('植物', ['植物', '部屋', '最後の水やり', '水やりの間隔（日）', '植え替えが必要', '元気さ'], ['リビング', 'キッチン', '寝室'], ['元気', '弱っている', '枯れた']),
})

// Where the skill "Make a whiteboard" can be read: with no word of it here, a brain made a table of a retrospective's or a
// brainstorm's notes rather than read it (test/whiteboard/results.md).
const WHITEBOARD = 'For notes to brainstorm or sort with others, such as a retrospective, read the skill whiteboard instead: it brings a whiteboard.'

/**
 * table_create, its example in the user's language, English where there is none, and the whiteboard's skill where it can be read.
 * @param {string} [lang] @param {{ whiteboard?: boolean }} [options] @returns {import('../../core/types.js').ToolSpec}
 */
export const tableCreate = (lang = 'en', { whiteboard = false } = {}) => ({
  name: 'table_create',
  description: `${TEXT} For plants to water: ${JSON.stringify(EXAMPLES[lang] ?? EXAMPLES.en)}${whiteboard ? ` ${WHITEBOARD}` : ''}`,
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
            collection: { type: 'string' },
            // A number's, within the tool's 400 tokens: the currency is the person's region's (D752).
            format: { enum: ['money', 'percent'] },
          },
          required: ['name', 'type'],
        },
      },
    },
    required: ['name', 'columns'],
  },
})

export const TABLE_CREATE = tableCreate()
