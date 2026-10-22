// What a brain calls to make a table (D491), as phase 0 measured it (test/tables/findings.md), and the
// line the prompt gives it, within a capability's 40 tokens.
import { MADE } from './table.js'

export const LINE = { name: 'table_create', line: 'when the user wants to keep track of something (applications, expenses, books…), make a table with the columns it needs' }

// Measured on the device's brain (test/tables/findings.md): asking for a column for everything a
// row will hold, naming the types, and showing one table about nothing the test set asks for, in the
// user's language, so that its own columns are in that language too. In the app, from the locales.
const TEXT = 'Make a table to keep track of something. Name it and its columns in the user’s language; the first column names each row. '
  + 'Think of the person filling in one row: give a column to each thing they will write down. '
  + 'Give it a column for each thing the request names or implies, and for what the user will note about each row: who, when, how much, and where it stands. '
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

/**
 * table_create, its example in the user's language, English where there is none.
 * @param {string} [lang] @returns {import('../../core/types.js').ToolSpec}
 */
export const tableCreate = (lang = 'en') => ({
  name: 'table_create',
  description: `${TEXT} For plants to water: ${JSON.stringify(EXAMPLES[lang] ?? EXAMPLES.en)}`,
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
})

export const TABLE_CREATE = tableCreate()
