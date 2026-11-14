// SPDX-License-Identifier: MIT
// Spreadsheets, phase 0a: what a careful person would expect of each of the twenty sheets make.js writes, written by hand before
// the reader (sheet.js) saw any of them: the line its heads are on, each column's name and kind, how many rows, the foot's sums,
// the order its dates settle on, and what is left out and where. Twelve are to improve the reader on; eight are held out (two per
// language, chosen by theme before any was written) and read once, at the end. An expectation that turns out wrong stays as it
// is: scripts/spreadsheets.js gives the figure both ways (FIXES there), never an edit here.

/** A column as expected; name: null when any name of its own will do (the file gives none); currency: null when the file names none; also: other kinds a careful person would take. @typedef {{ name: string | null, type: string, format?: 'money' | 'percent', currency?: string | null, also?: string[] }} Column */
/**
 * heads: the line of the heads, counted from 1 as a spreadsheet does; left: what is left out, each with why (above the heads, below
 * or beside the table, empty, a subtotal, a section's name, a formula with no value, a value that isn't its column's kind) and where.
 * @typedef {{ file: string, lang: 'en' | 'fr' | 'ar' | 'ja', region: string, held: boolean, about: string, heads: number, rows: number, columns: Column[],
 *   foot?: Record<string, number>, dates?: { order: 'dmy' | 'mdy', settled: boolean }, left?: { where: string, why: string }[],
 *   book?: { sheets: string[], hidden?: string[], date1904?: boolean } }} Expected
 */

/** @param {string | null} name @returns {Column} */
const text = (name) => ({ name, type: 'text' })
/** @param {string} name @returns {Column} */
const select = (name) => ({ name, type: 'select' })
/** @param {string} name @returns {Column} */
const number = (name) => ({ name, type: 'number' })
/** @param {string} name @param {string | null} currency @returns {Column} */
const money = (name, currency) => ({ name, type: 'number', format: 'money', currency })
/** @param {string} name @returns {Column} */
const share = (name) => ({ name, type: 'number', format: 'percent' })
/** @param {string} name @returns {Column} */
const date = (name) => ({ name, type: 'date' })
/** @param {string} name @returns {Column} */
const box = (name) => ({ name, type: 'checkbox' })
/** @param {string} name @returns {Column} */
const email = (name) => ({ name, type: 'email' })
/** @param {string} name @returns {Column} */
const link = (name) => ({ name, type: 'link' })
/** @param {string} name @returns {Column} */
const phone = (name) => ({ name, type: 'phone' })
/** A column a careful person would take as either kind: a few people's names or towns that repeat. @param {Column} column @param {...string} also @returns {Column} */
const or = (column, ...also) => ({ ...column, also })

/** @type {Expected[]} */
export const SET = [
  // ── English ──
  { file: 'en-budget.xlsx', lang: 'en', region: 'en-US', held: false, about: 'a community garden\'s budget: a title across the columns, subtotals, formulas, a total, four sheets, one hidden',
    heads: 4, rows: 12, columns: [text('Item'), select('Category'), money('Budget', 'USD'), money('Actual', 'USD'), money('Difference', 'USD'), share('% used')],
    foot: { Budget: 10490, Actual: 9682.08, Difference: -807.92 },
    left: [{ where: 'A1', why: 'above' }, { where: 'A2', why: 'above' }, { where: 'A7:F7', why: 'subtotal' }, { where: 'A10:F10', why: 'subtotal' }, { where: 'A13:F13', why: 'subtotal' }, { where: 'A17:F17', why: 'subtotal' }, { where: 'A21:F21', why: 'subtotal' }, { where: 'A24', why: 'below' }],
    book: { sheets: ['2026 Budget', '2025 Actuals', 'Notes', 'Lists'], hidden: ['Lists'] } },
  { file: 'en-expenses.csv', lang: 'en', region: 'en-US', held: true, about: 'a treasurer\'s expenses as CSV: dates month first, dollars as text, a refund in brackets, Y and N, a total',
    heads: 1, rows: 12, columns: [date('Date'), text('Description'), select('Category'), money('Amount', 'USD'), or(select('Paid by'), 'text'), box('Receipt'), box('Reimbursed')],
    foot: { Amount: 4730.69 }, dates: { order: 'mdy', settled: true } },
  { file: 'en-members.xlsx', lang: 'en', region: 'en-GB', held: false, about: 'a walking club\'s members: an empty column, empty lines, two columns named Phone, one with no name, dates day first',
    heads: 1, rows: 14, columns: [text('Name'), email('Email'), phone('Phone'), phone('Phone 2'), date('Joined'), date('Renewal due'), select('Type'), money('Fee', 'GBP'), box('Paid'), link('Website'), text(null)],
    dates: { order: 'dmy', settled: true }, left: [{ where: 'E1:E17', why: 'empty' }, { where: 'A7:L7', why: 'empty' }, { where: 'A13:L13', why: 'empty' }] },
  { file: 'en-orders.xlsx', lang: 'en', region: 'en-US', held: false, about: 'a candle shop\'s orders: dates counted from 1904, words kept in their cells, formulas with no results, true and false',
    heads: 1, rows: 14, columns: [number('Order #'), date('Date'), text('Customer'), or(select('Item'), 'text'), number('Qty'), money('Unit price', null), select('Status'), box('Shipped'), link('Tracking'), text('Notes')],
    left: [{ where: 'G1:G15', why: 'formula' }], book: { sheets: ['Orders'], date1904: true } },
  { file: 'en-jobs.tsv', lang: 'en', region: 'en-US', held: true, about: 'a job search, tab-separated: ISO dates, dates in words, dollars, a salary given as a range',
    heads: 1, rows: 12, columns: [text('Company'), text('Role'), date('Applied'), select('Status'), email('Contact'), link('Posting'), money('Salary', 'USD'), box('Remote'), date('Follow up'), text('Notes')],
    left: [{ where: 'G5', why: 'value' }] },

  // ── French ──
  { file: 'fr-budget.xlsx', lang: 'fr', region: 'fr-FR', held: true, about: 'a shared garden\'s budget: receipts then spending, two tables down one sheet, each with its total',
    heads: 5, rows: 6, columns: [text('Poste'), money('Prévu 2026', 'EUR'), money('Réalisé', 'EUR'), money('Écart', 'EUR'), share('% réalisé')],
    foot: { 'Prévu 2026': 10000, Réalisé: 10177.5, Écart: 177.5 },
    left: [{ where: 'A1', why: 'above' }, { where: 'A2', why: 'above' }, { where: 'A4', why: 'above' }, { where: 'A15:E25', why: 'below' }, { where: 'A27:C27', why: 'below' }],
    book: { sheets: ['Budget 2026', 'Budget 2025'] } },
  { file: 'fr-expenses.csv', lang: 'fr', region: 'fr-FR', held: false, about: 'a treasurer\'s expenses from a French Excel: semicolons, Windows-1252, decimal commas, euros as text, dates no value settles',
    heads: 1, rows: 12, columns: [date('Date'), text('Libellé'), select('Catégorie'), money('Montant', 'EUR'), or(select('Payé par'), 'text'), box('Justificatif'), share('TVA')],
    foot: { Montant: 2124.3 }, dates: { order: 'dmy', settled: false } },
  { file: 'fr-members.xlsx', lang: 'fr', region: 'fr-FR', held: false, about: 'a choir\'s members: a title and a line of two cells above, phones as numbers under France\'s format, euros, a column of x\'s',
    heads: 4, rows: 16, columns: [text('Nom'), text('Prénom'), email('Courriel'), phone('Téléphone'), or(select('Ville'), 'text'), select('Pupitre'), date('Date d\'adhésion'), money('Cotisation', 'EUR'), box('Réglée'), box('Droit à l\'image')],
    left: [{ where: 'A1', why: 'above' }, { where: 'A2:B2', why: 'above' }] },
  { file: 'fr-orders.csv', lang: 'fr', region: 'fr-FR', held: true, about: 'a potter\'s orders from LibreOffice: semicolons, UTF-8, decimal commas with no currency, a column with no name, totals',
    heads: 1, rows: 12, columns: [text('N° commande'), date('Date'), text('Client'), or(select('Article'), 'text'), number('Quantité'), number('Prix unitaire'), share('Remise'), number('Total TTC'), select('Statut'), box('Expédiée'), link('Suivi'), text(null)],
    foot: { Quantité: 66, 'Total TTC': 1309.1 }, dates: { order: 'dmy', settled: true } },
  { file: 'fr-jobs.xlsx', lang: 'fr', region: 'fr-FR', held: false, about: 'a job search: an empty column, empty lines, euros under Excel\'s French format, a salary to be discussed, dates in words, x\'s',
    heads: 1, rows: 14, columns: [text('Entreprise'), text('Poste'), or(select('Lieu'), 'text'), date('Date de candidature'), select('Statut'), email('Contact'), link('Annonce'), money('Salaire annuel', 'EUR'), box('Relancé'), date('Entretien'), text('Notes')],
    left: [{ where: 'F1:F17', why: 'empty' }, { where: 'A7:L7', why: 'empty' }, { where: 'A13:L13', why: 'empty' }, { where: 'I4', why: 'value' }, { where: 'I11', why: 'value' }] },

  // ── Arabic ──
  { file: 'ar-budget.xlsx', lang: 'ar', region: 'ar-EG', held: false, about: 'a library friends\' budget: income then spending down one sheet, the years as numbers in the heads, pounds under Excel\'s format',
    heads: 4, rows: 5, columns: [text('البند'), money('2025', 'EGP'), money('2026', 'EGP'), money('الفرق', 'EGP'), share('نسبة التغير')],
    foot: { 2025: 71500, 2026: 81000, 'الفرق': 9500 },
    left: [{ where: 'A1', why: 'above' }, { where: 'A3', why: 'above' }, { where: 'A12:E21', why: 'below' }] },
  { file: 'ar-expenses.csv', lang: 'ar', region: 'ar-EG', held: true, about: 'an association\'s expenses as CSV: Arabic\'s own digits and marks, dates in words, pounds as text, a total',
    heads: 1, rows: 12, columns: [date('التاريخ'), text('البيان'), select('الفئة'), money('المبلغ', 'EGP'), select('طريقة الدفع'), box('يوجد إيصال')],
    foot: { 'المبلغ': 21762.5 } },
  { file: 'ar-members.xlsx', lang: 'ar', region: 'ar-EG', held: true, about: 'a reading club\'s members: a hidden sheet first, a title across, an empty column, dates from 1904, phones in both kinds of digits',
    heads: 3, rows: 14, columns: [number('م'), text('الاسم'), email('البريد الإلكتروني'), phone('الهاتف'), date('تاريخ الانضمام'), select('نوع العضوية'), money('الاشتراك', 'EGP'), box('مسدد')],
    left: [{ where: 'A1', why: 'above' }, { where: 'F3:F17', why: 'empty' }],
    book: { sheets: ['قوائم', 'الأعضاء', 'ملاحظات'], hidden: ['قوائم'], date1904: true } },
  { file: 'ar-orders.xlsx', lang: 'ar', region: 'ar-EG', held: false, about: 'a sweets shop\'s orders: dates with their hour, formulas with results, an empty column and line, ticks, ISO text dates, totals',
    heads: 1, rows: 13, columns: [number('رقم الطلب'), date('التاريخ'), text('العميل'), or(select('الصنف'), 'text'), number('الكمية'), number('سعر الوحدة'), money('الإجمالي', 'EGP'), select('الحالة'), box('تم التوصيل'), date('موعد التسليم'), link('رابط التتبع')],
    foot: { 'الكمية': 40, 'الإجمالي': 4695 }, left: [{ where: 'H1:H16', why: 'empty' }, { where: 'A9:L9', why: 'empty' }] },
  { file: 'ar-jobs.csv', lang: 'ar', region: 'ar-EG', held: false, about: 'a job search as CSV: dates day first in Arabic\'s digits, salaries in both kinds of digits, one that depends on experience',
    heads: 1, rows: 12, columns: [text('الشركة'), text('الوظيفة'), date('تاريخ التقديم'), select('الحالة'), email('البريد الإلكتروني'), link('الرابط'), money('الراتب المتوقع', 'EGP'), box('عن بُعد'), text('ملاحظات')],
    dates: { order: 'dmy', settled: true }, left: [{ where: 'G5', why: 'value' }] },

  // ── Japanese ──
  { file: 'ja-budget.xlsx', lang: 'ja', region: 'ja-JP', held: true, about: 'a neighbourhood association\'s budget: the unit said at the top, income and spending as parts of one table, each with its total',
    heads: 3, rows: 14, columns: [text('科目'), number('前年度予算額'), number('本年度予算額'), number('増減'), text('備考')],
    left: [{ where: 'A1', why: 'above' }, { where: 'E2', why: 'above' }, { where: 'A4', why: 'section' }, { where: 'A11:D11', why: 'subtotal' }, { where: 'A12', why: 'section' }, { where: 'A21:D21', why: 'subtotal' }] },
  { file: 'ja-expenses.xlsx', lang: 'ja', region: 'ja-JP', held: false, about: 'an expense claim: a title, a line of name and section, dates in Japanese, yen, tax rates, circles and crosses, sums by kind beside',
    heads: 4, rows: 12, columns: [date('日付'), text('内容'), text('支払先'), select('区分'), money('金額', 'JPY'), share('税率'), box('領収書')],
    foot: { '金額': 34802 }, left: [{ where: 'A1', why: 'above' }, { where: 'A2:D2', why: 'above' }, { where: 'I5:J9', why: 'beside' }] },
  { file: 'ja-members.xlsx', lang: 'ja', region: 'ja-JP', held: false, about: 'a tennis circle\'s members: heads on two lines with merged cells, names with their readings, a phone typed full-width, a hidden sheet',
    heads: 4, rows: 12, columns: [number('No.'), text('氏名'), text('フリガナ'), email('メール'), phone('電話'), date('入会日'), money('年額', 'JPY'), box('納入済')],
    left: [{ where: 'A1', why: 'above' }, { where: 'D3', why: 'above' }, { where: 'G3', why: 'above' }], book: { sheets: ['名簿', '設定'], hidden: ['設定'] } },
  { file: 'ja-orders.xlsx', lang: 'ja', region: 'ja-JP', held: true, about: 'a homeware shop\'s orders: order times, names with readings, formulas with results, circles, two columns named the same, totals',
    heads: 1, rows: 14, columns: [text('注文番号'), date('注文日時'), text('お客様名'), or(select('商品名'), 'text'), number('数量'), money('単価', 'JPY'), money('金額', 'JPY'), select('支払方法'), box('発送済'), link('追跡URL'), text('備考'), text('備考 2')],
    foot: { '数量': 28, '金額': 71280 }, left: [{ where: 'A9:L9', why: 'empty' }] },
  { file: 'ja-jobs.txt', lang: 'ja', region: 'ja-JP', held: false, about: 'a job search saved as Unicode text: UTF-16, tabs, dates as 2026年1月9日 and full-width, yen with its sign and in ten-thousands',
    heads: 1, rows: 12, columns: [text('企業名'), text('職種'), date('応募日'), select('選考状況'), email('連絡先'), link('求人URL'), money('想定年収', 'JPY'), box('リモート可'), date('次回面接'), text('メモ')] },
]

/** The sheet of 10,000 rows, for speed, outside the twenty: read as a workbook and as CSV. @type {Expected[]} */
export const SPEED = ['speed.xlsx', 'speed.csv'].map((file) => ({ file, lang: 'en', region: 'en-US', held: false, about: '10,000 orders by 12 columns', heads: 1, rows: 10000,
  columns: [number('Order ID'), date('Date'), text('Customer'), email('Email'), select('Country'), select('Product'), number('Qty'), money('Unit price', 'USD'), share('Discount'), money('Total', 'USD'), box('Paid'), or(text('Notes'), 'select')] }))
