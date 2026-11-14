// SPDX-License-Identifier: MIT
// Collections phase 0b, the set (scripts/collections.js): four collections of 500 rows each, made by code from fixed seeds, the same
// every run and the same figures in English, French, Arabic and Japanese, each with its language's own names for the columns, the
// choices, the people and what a row holds: an association's expenses, a job search, a small shop's orders, members and their fees.
// Rows come in the order they were made, by date from January 2025 to TODAY, so what a question asks of this year lies past the
// 200th row, as far as table_rows reads. Some cells are empty: an amount not known yet, a category not chosen, a fee not set.
// Then 24 questions in the four languages, each with the figure worked out here from the rows as they were made, by none of the
// tools measured: nine sums with a condition, seven counts, four by group, and four of one row's value, which need no sum, as a
// control. `key` is the call that answers a question in the plan's words: `--check` holds the tool to the figure with it.
import { createTable, folderOf } from '../../app/caps/tables/table.js'

/** @import { Table } from '../../app/caps/tables/table.js' */
/** @import { Row } from '../../app/caps/tables/changes.js' */
/** @typedef {'en' | 'fr' | 'ar' | 'ja'} Lang */
/** @typedef {Record<Lang, string>} Words */
/** A column: its key here, its kind, its name, a select's or a status's choices by key. @typedef {{ key: string, type: string, name: Words, options?: string[] }} Column */
/** A row as made, before any language: each column's value by its key; a choice or a person by its place, a date in days from the first, money in cents. @typedef {Record<string, any>} Made */
/** A collection in one language, as Tables loads one. @typedef {{ id: string, lang: Lang, folder: string, table: Table, rows: Row[], made: Made[], name: (key: string) => string, option: (key: string) => string, person: (at: number) => string }} Seeded */
/** right: the figure, or a figure per group by its choice's key; past: whether the first 200 rows alone give another. @typedef {{ id: string, collection: string, kind: 'sum' | 'count' | 'by' | 'row', text: Words, right: number | Record<string, number>, past: boolean, matching: number, key: (one: Seeded) => { where?: string, sum?: string, count?: boolean, by?: string } }} Question */

/** The day every conversation is told it is, and every `where` counts its dates from: 14 November 2026. */
export const TODAY = new Date(2026, 10, 14, 12)
export const LANGS = /** @type {Lang[]} */ (['en', 'fr', 'ar', 'ja'])
export const SIZE = 500
/** The first row's day, and how many days the rows span: to 11 November 2026 at the latest. */
const FIRST = Date.UTC(2025, 0, 6), SPAN = 674, LAST = 676, YEAR_END = 359

/** @param {string} en @param {string} fr @param {string} ar @param {string} ja @returns {Words} */
const w = (en, fr, ar, ja) => ({ en, fr, ar, ja })

/** Mulberry32: the same numbers from the same seed, everywhere. @param {number} seed */
function dice(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
/** A place among weights, by their share. @param {() => number} random @param {number[]} weights */
function pick(random, weights) {
  let at = random() * weights.reduce((sum, weight) => sum + weight, 0)
  return weights.findIndex((weight) => (at -= weight) < 0)
}
/** A whole number from `from` to `to`. @param {() => number} random @param {number} from @param {number} to */
const whole = (random, from, to) => from + Math.floor(random() * (to - from + 1))
/** The i-th row's day, in days from the first, a little off its place. @param {number} i @param {() => number} random */
const dayOf = (i, random) => Math.floor((i * SPAN) / SIZE + random() * 3)
/** A later day in the same year, and never after the last. @param {number} day @param {number} more */
const later = (day, more) => Math.min(day + more, day <= YEAR_END ? YEAR_END : LAST)
/** A day as a date cell holds it. @param {number} day */
const iso = (day) => new Date(FIRST + day * 86_400_000).toISOString().slice(0, 10)
/** Whether a day is in a year, or from a date on. */
const inYear = (/** @type {number} */ day, /** @type {number} */ year) => iso(day).startsWith(String(year)), since = (/** @type {number} */ day, /** @type {string} */ date) => iso(day) >= date

const BASE32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
/** A row's id, as a ULID looks, later rows after earlier ones. @param {number} i @param {() => number} random */
const rowId = (i, random) => `01K${[...Array(7)].map((_, at) => BASE32[Math.floor((1000 + i * 37) / 32 ** (6 - at)) % 32]).join('')}${[...Array(16)].map(() => BASE32[Math.floor(random() * 32)]).join('')}`

// ─── Words ───────────────────────────────────────────────────────────────────

/** Six people who pay, collect and follow things, in each language. */
const PEOPLE = { en: ['Marta', 'James', 'Priya', 'Daniel', 'Elena', 'Sam'], fr: ['Camille', 'Julien', 'Nadia', 'Thomas', 'Élodie', 'Karim'], ar: ['ليلى', 'يوسف', 'مريم', 'خالد', 'سلمى', 'عمر'], ja: ['佐藤', '鈴木', '高橋', '田中', '伊藤', '渡辺'] }
/** Customers and members: sixteen first names by sixteen family names. */
const FIRST_NAMES = {
  en: ['Alice', 'Ben', 'Chloe', 'David', 'Emma', 'Finn', 'Grace', 'Harry', 'Isla', 'Jack', 'Kate', 'Liam', 'Mia', 'Noah', 'Olivia', 'Peter'],
  fr: ['Adèle', 'Bastien', 'Chloé', 'Damien', 'Émilie', 'Florian', 'Gaëlle', 'Hugo', 'Inès', 'Jérôme', 'Léa', 'Mathieu', 'Noémie', 'Olivier', 'Pauline', 'Rémi'],
  ar: ['أحمد', 'فاطمة', 'محمد', 'نور', 'علي', 'هدى', 'حسن', 'رنا', 'إبراهيم', 'سارة', 'طارق', 'دينا', 'ماهر', 'لينا', 'وليد', 'ريم'],
  ja: ['太郎', '花子', '健', '美咲', '翔', '陽子', '大輔', '愛', '直樹', '由美', '拓也', '恵', '誠', '真理', '亮', '彩'],
}
const FAMILY_NAMES = {
  en: ['Adams', 'Baker', 'Clarke', 'Davies', 'Evans', 'Foster', 'Green', 'Hughes', 'Jackson', 'Kelly', 'Lewis', 'Morgan', 'Parker', 'Reid', 'Shaw', 'Turner'],
  fr: ['Arnaud', 'Blanchard', 'Colin', 'Dumas', 'Fabre', 'Garnier', 'Henry', 'Joly', 'Lambert', 'Marchand', 'Noël', 'Perrin', 'Renard', 'Roussel', 'Tessier', 'Vidal'],
  ar: ['الخطيب', 'النجار', 'الحداد', 'العلي', 'الصالح', 'المصري', 'الشامي', 'الحسن', 'البيطار', 'الزعبي', 'القاسم', 'العمري', 'الحلبي', 'الفارس', 'الجمال', 'السعدي'],
  ja: ['山田', '佐々木', '中村', '小林', '加藤', '吉田', '山本', '松本', '井上', '木村', '林', '清水', '山崎', '森', '池田', '橋本'],
}
/** A person's whole name: the family name first and no space in Japanese. @param {Lang} lang @param {[number, number]} name */
const fullName = (lang, [first, family]) => (lang === 'ja' ? `${FAMILY_NAMES.ja[family]}${FIRST_NAMES.ja[first]}` : `${FIRST_NAMES[lang][first]} ${FAMILY_NAMES[lang][family]}`)
/** Companies: sixteen names by eight endings (in Arabic, eight heads before sixteen names). */
const COMPANY = {
  en: [['Nova', 'Atla', 'Bore', 'Cinda', 'Delto', 'Evra', 'Fulmi', 'Gala', 'Helio', 'Indra', 'Juno', 'Kora', 'Lumi', 'Meri', 'Nexa', 'Orbi'], ['tech', 'lab', 'works', 'soft', 'link', 'data', 'media', 'logic']],
  ar: [['النور', 'الأفق', 'الريادة', 'المدار', 'الواحة', 'البيان', 'الصفوة', 'المنارة', 'الجسر', 'السنابل', 'الرؤية', 'القمة', 'الندى', 'الميزان', 'الأمل', 'الفجر'], ['شركة', 'مجموعة', 'مؤسسة', 'دار', 'مكتب', 'مصنع', 'مركز', 'معهد']],
  ja: [['ミライ', 'サクラ', 'アオバ', 'ヒカリ', 'フジ', 'ヤマト', 'ミナト', 'コスモ', 'アサヒ', 'ツバサ', 'ミドリ', 'カエデ', 'ホクト', 'ナギサ', 'アカネ', 'イズミ'], ['商事', '工業', 'システム', 'テック', '物産', '製作所', 'サービス', 'デザイン']],
}
/** @param {Lang} lang @param {[number, number]} name */
const company = (lang, [name, end]) => (lang === 'ar' ? `${COMPANY.ar[1][end]} ${COMPANY.ar[0][name]}` : `${COMPANY[lang === 'ja' ? 'ja' : 'en'][0][name]}${COMPANY[lang === 'ja' ? 'ja' : 'en'][1][end]}`)

/** Every choice and step, by its key. @type {Record<string, Words>} */
const OPTIONS = {
  rent: w('Rent', 'Loyer', 'الإيجار', '家賃'), supplies: w('Supplies', 'Fournitures', 'اللوازم', '備品'), travel: w('Travel', 'Déplacements', 'التنقل', '交通費'),
  events: w('Events', 'Événements', 'الفعاليات', 'イベント'), insurance: w('Insurance', 'Assurance', 'التأمين', '保険'), communication: w('Communication', 'Communication', 'التواصل', '広報'),
  toPay: w('To pay', 'À payer', 'غير مدفوع', '未払い'), paid: w('Paid', 'Payée', 'مدفوع', '支払済み'),
  applied: w('Applied', 'Envoyée', 'تم التقديم', '応募済み'), interview: w('Interview', 'Entretien', 'مقابلة', '面接'), offer: w('Offer', 'Offre', 'عرض', '内定'), rejected: w('Rejected', 'Refusée', 'مرفوض', '不採用'),
  linkedin: w('LinkedIn', 'LinkedIn', 'لينكد إن', 'LinkedIn'), referral: w('Referral', 'Recommandation', 'توصية', '紹介'), site: w('Company site', 'Site employeur', 'موقع الشركة', '企業サイト'),
  board: w('Job board', 'Annonce', 'موقع توظيف', '求人サイト'), recruiter: w('Recruiter', 'Recruteur', 'مسؤول توظيف', 'エージェント'),
  shop: w('Shop', 'Boutique', 'المتجر', '店舗'), website: w('Website', 'Site web', 'الموقع', 'ウェブサイト'), market: w('Market', 'Marché', 'السوق', 'マルシェ'),
  toPrepare: w('To prepare', 'À préparer', 'قيد التجهيز', '準備中'), shipped: w('Shipped', 'Expédiée', 'تم الشحن', '発送済み'), delivered: w('Delivered', 'Livrée', 'تم التسليم', '配達済み'),
  adult: w('Adult', 'Adulte', 'بالغ', '一般'), student: w('Student', 'Étudiant', 'طالب', '学生'), family: w('Family', 'Famille', 'عائلة', '家族'), honorary: w('Honorary', 'Honoraire', 'فخري', '名誉'),
  due: w('Due', 'À régler', 'مستحقة', '未納'), settled: w('Paid', 'Réglée', 'مدفوعة', '納入済み'),
  town1: w('Leeds', 'Lyon', 'عمّان', '横浜'), town2: w('York', 'Nantes', 'إربد', '川崎'), town3: w('Hull', 'Lille', 'الزرقاء', '鎌倉'), town4: w('Bath', 'Rennes', 'العقبة', '藤沢'), town5: w('Derby', 'Dijon', 'السلط', '厚木'),
}

const CATEGORIES = ['rent', 'supplies', 'travel', 'events', 'insurance', 'communication']
/** What an expense is, three for each category, then two for one with none. @type {Words[][]} */
const ITEMS = [
  [w('Hall rental', 'Location de la salle', 'إيجار القاعة', 'ホール使用料'), w('Storage unit', 'Box de stockage', 'إيجار المخزن', '倉庫賃料'), w('Meeting room', 'Salle de réunion', 'قاعة الاجتماعات', '会議室利用料')],
  [w('Printer paper', 'Ramettes de papier', 'ورق الطباعة', 'コピー用紙'), w('Cleaning products', 'Produits ménagers', 'مواد التنظيف', '清掃用品'), w('Coffee and tea', 'Café et thé', 'قهوة وشاي', 'コーヒーとお茶')],
  [w('Train tickets', 'Billets de train', 'تذاكر القطار', '電車代'), w('Fuel', 'Carburant', 'وقود', 'ガソリン代'), w('Parking', 'Parking', 'موقف السيارات', '駐車場代')],
  [w('Catering', 'Traiteur', 'خدمات الضيافة', 'ケータリング'), w('Sound system hire', 'Location de sono', 'استئجار نظام الصوت', '音響機材レンタル'), w('Decorations', 'Décoration', 'الزينة', '装飾品')],
  [w('Liability insurance', 'Responsabilité civile', 'تأمين المسؤولية', '賠償責任保険'), w('Vehicle insurance', 'Assurance du véhicule', 'تأمين المركبة', '車両保険'), w('Equipment cover', 'Assurance du matériel', 'تأمين المعدات', '機材保険')],
  [w('Flyers', 'Tracts', 'منشورات', 'チラシ印刷'), w('Website hosting', 'Hébergement du site', 'استضافة الموقع', 'サーバー代'), w('Postage', 'Affranchissement', 'رسوم البريد', '郵送料')],
  [w('Miscellaneous', 'Divers', 'متفرقات', '雑費'), w('Bank fees', 'Frais bancaires', 'رسوم بنكية', '振込手数料'), w('Miscellaneous', 'Divers', 'متفرقات', '雑費')],
]
/** Each category's amounts, from and to, in cents. */
const AMOUNTS = [[18000, 65000], [450, 12000], [600, 24000], [4000, 90000], [9000, 48000], [500, 21000], [300, 9000]]
const POSITIONS = [w('Project manager', 'Chef de projet', 'مدير مشاريع', 'プロジェクトマネージャー'), w('Data analyst', 'Analyste de données', 'محلل بيانات', 'データアナリスト'), w('Product designer', 'Designer produit', 'مصمم منتجات', 'プロダクトデザイナー'),
  w('Accountant', 'Comptable', 'محاسب', '経理'), w('Marketing manager', 'Responsable marketing', 'مدير تسويق', 'マーケティング担当'), w('Office manager', 'Office manager', 'مدير مكتب', '総務'),
  w('Sales representative', 'Commercial', 'مندوب مبيعات', '営業'), w('Customer support lead', 'Responsable support', 'مسؤول دعم العملاء', 'カスタマーサポート')]
/** The one row each control asks for: an expense, a company, a member. */
const ONLY = { item: w('Defibrillator', 'Défibrillateur', 'جهاز إنعاش القلب', '除細動器'), company: w('Brightwater', 'Maison Verdier', 'دار الياسمين', 'ホシゾラ出版'), member: w('Agnes Whitlock', 'Odile Kerbrat', 'بثينة الحايك', '小野寺千鶴') }

// ─── The four collections ────────────────────────────────────────────────────

/** @type {Record<string, { seed: number, name: Words, columns: Column[], make: (i: number, random: () => number) => Made, said: Record<string, (value: any, lang: Lang) => unknown> }>} */
const SPECS = {
  expenses: {
    seed: 11,
    name: w('Expenses', 'Dépenses', 'المصاريف', '支出'),
    columns: [
      { key: 'item', type: 'text', name: w('Expense', 'Dépense', 'المصروف', '内容') },
      { key: 'amount', type: 'number', name: w('Amount', 'Montant', 'المبلغ', '金額') },
      { key: 'date', type: 'date', name: w('Date', 'Date', 'التاريخ', '日付') },
      { key: 'category', type: 'select', name: w('Category', 'Catégorie', 'الفئة', 'カテゴリ'), options: CATEGORIES },
      { key: 'paidBy', type: 'person', name: w('Paid by', 'Payé par', 'من دفع', '支払者') },
      { key: 'status', type: 'status', name: w('Status', 'Statut', 'الحالة', '状況'), options: ['toPay', 'paid'] },
      { key: 'receipt', type: 'checkbox', name: w('Receipt', 'Justificatif', 'الإيصال', '領収書') },
    ],
    make: (i, random) => {
      // A bought defibrillator, once: the control's row, well past the 200th.
      if (i === 347) return { item: ONLY.item, amount: 118900, date: dayOf(i, random), category: 1, paidBy: 3, status: 1, receipt: true }
      const category = pick(random, [14, 26, 17, 12, 6, 21, 4]), [from, to] = AMOUNTS[category], toPay = random() < (i > 380 ? 0.55 : 0.12)
      return { item: ITEMS[category][whole(random, 0, 2)], amount: random() < 0.03 ? null : (category === 0 ? 1000 : category === 4 ? 100 : 5) * Math.round(whole(random, from, to) / (category === 0 ? 1000 : category === 4 ? 100 : 5)),
        date: dayOf(i, random), category: category < 6 ? category : null, paidBy: toPay || random() < 0.05 ? null : pick(random, [5, 3, 4, 2, 2, 1]), status: toPay ? 0 : 1, receipt: random() < 0.62 }
    },
    said: { item: (words, lang) => words[lang], amount: (cents) => cents / 100, date: iso, category: (at, lang) => OPTIONS[CATEGORIES[at]][lang], paidBy: (at, lang) => PEOPLE[lang][at], status: (at, lang) => OPTIONS[['toPay', 'paid'][at]][lang], receipt: (ticked) => ticked || null },
  },
  jobs: {
    seed: 23,
    name: w('Applications', 'Candidatures', 'طلبات التوظيف', '応募'),
    columns: [
      { key: 'company', type: 'text', name: w('Company', 'Entreprise', 'الشركة', '会社') },
      { key: 'position', type: 'text', name: w('Position', 'Poste', 'الوظيفة', '職種') },
      { key: 'applied', type: 'date', name: w('Applied on', 'Envoyée le', 'تاريخ التقديم', '応募日') },
      { key: 'status', type: 'status', name: w('Status', 'Statut', 'الحالة', '状況'), options: ['applied', 'interview', 'offer', 'rejected'] },
      { key: 'answered', type: 'date', name: w('Answered on', 'Réponse le', 'تاريخ الرد', '返信日') },
      { key: 'source', type: 'select', name: w('Source', 'Source', 'المصدر', '応募経路'), options: ['linkedin', 'referral', 'site', 'board', 'recruiter'] },
      { key: 'salary', type: 'number', name: w('Salary', 'Salaire', 'الراتب', '年収') },
      { key: 'travel', type: 'number', name: w('Travel cost', 'Frais de déplacement', 'تكلفة التنقل', '交通費') },
    ],
    make: (i, random) => {
      const applied = dayOf(i, random)
      // One offer from a company named nowhere else: the control's row.
      if (i === 318) return { company: ONLY.company, position: POSITIONS[2], applied, status: 2, answered: later(applied, 19), source: 1, salary: 46500, travel: 6450 }
      const status = pick(random, i > 440 ? [70, 8, 2, 20] : [34, 13, 4, 49]), met = status === 1 || status === 2 || (status === 3 && random() < 0.25)
      return { company: [whole(random, 0, 15), whole(random, 0, 7)], position: POSITIONS[whole(random, 0, 7)], applied, status, answered: status ? later(applied, whole(random, 3, 30)) : null,
        source: random() < 0.03 ? null : pick(random, [30, 14, 18, 26, 12]), salary: random() < 0.35 ? null : 500 * whole(random, 64, 156), travel: met ? 5 * whole(random, 160, 3600) : null }
    },
    said: { company: (name, lang) => (Array.isArray(name) ? company(lang, /** @type {[number, number]} */ (name)) : name[lang]), position: (words, lang) => words[lang], applied: iso, answered: iso,
      status: (at, lang) => OPTIONS[['applied', 'interview', 'offer', 'rejected'][at]][lang], source: (at, lang) => OPTIONS[['linkedin', 'referral', 'site', 'board', 'recruiter'][at]][lang], salary: (value) => value, travel: (cents) => cents / 100 },
  },
  orders: {
    seed: 37,
    name: w('Orders', 'Commandes', 'الطلبات', '注文'),
    columns: [
      { key: 'order', type: 'text', name: w('Order', 'Commande', 'الطلب', '注文番号') },
      { key: 'customer', type: 'text', name: w('Customer', 'Client', 'العميل', 'お客様') },
      { key: 'date', type: 'date', name: w('Date', 'Date', 'التاريخ', '注文日') },
      { key: 'total', type: 'number', name: w('Total', 'Total', 'الإجمالي', '合計') },
      { key: 'items', type: 'number', name: w('Items', 'Articles', 'عدد القطع', '点数') },
      { key: 'channel', type: 'select', name: w('Channel', 'Canal', 'قناة البيع', '販売経路'), options: ['shop', 'website', 'market'] },
      { key: 'status', type: 'status', name: w('Status', 'Statut', 'الحالة', '状況'), options: ['toPrepare', 'shipped', 'delivered'] },
      { key: 'paid', type: 'checkbox', name: w('Paid', 'Payée', 'مدفوع', '支払済み') },
    ],
    make: (i, random) => {
      const items = pick(random, [30, 26, 18, 11, 7, 4, 2, 2]) + 1, channel = pick(random, [45, 35, 17, 3])
      return { order: `#${1001 + i}`, customer: [whole(random, 0, 15), whole(random, 0, 15)], date: dayOf(i, random), total: i === 386 ? 14860 : random() < 0.02 ? null : 10 * whole(random, 95, 1200) * items / 2,
        items, channel: channel < 3 ? channel : null, status: i > 420 ? pick(random, [55, 30, 15]) : i > 400 ? pick(random, [0, 40, 60]) : 2, paid: random() < (i > 400 ? 0.55 : 0.9) }
    },
    said: { order: (text) => text, customer: (name, lang) => fullName(lang, name), date: iso, total: (cents) => cents / 100, items: (count) => count, channel: (at, lang) => OPTIONS[['shop', 'website', 'market'][at]][lang],
      status: (at, lang) => OPTIONS[['toPrepare', 'shipped', 'delivered'][at]][lang], paid: (ticked) => ticked || null },
  },
  members: {
    seed: 53,
    name: w('Members', 'Adhérents', 'الأعضاء', '会員'),
    columns: [
      { key: 'member', type: 'text', name: w('Member', 'Adhérent', 'العضو', '氏名') },
      { key: 'membership', type: 'select', name: w('Membership', 'Formule', 'نوع العضوية', '会員種別'), options: ['adult', 'student', 'family', 'honorary'] },
      { key: 'fee', type: 'number', name: w('Fee', 'Cotisation', 'الرسوم', '会費') },
      { key: 'joined', type: 'date', name: w('Joined', 'Adhésion', 'تاريخ الانضمام', '入会日') },
      { key: 'status', type: 'status', name: w('Status', 'Statut', 'الحالة', '状況'), options: ['due', 'settled'] },
      { key: 'paidOn', type: 'date', name: w('Paid on', 'Réglée le', 'تاريخ الدفع', '納入日') },
      { key: 'collectedBy', type: 'person', name: w('Collected by', 'Encaissée par', 'المستلم', '受領者') },
      { key: 'city', type: 'select', name: w('City', 'Ville', 'المدينة', '市'), options: ['town1', 'town2', 'town3', 'town4', 'town5'] },
    ],
    make: (i, random) => {
      const joined = dayOf(i, random), city = pick(random, [30, 24, 18, 14, 10, 4])
      // One member whose fee is no other's: the control's row.
      if (i === 412) return { member: ONLY.member, membership: 0, fee: 85, joined, status: 1, paidOn: later(joined, 4), collectedBy: 4, city: 2 }
      const membership = pick(random, [50, 20, 25, 5]), due = membership !== 3 && random() < (i > 300 ? 0.45 : 0.08), fee = [random() < 0.3 ? 70 : 60, 25, random() < 0.4 ? 125 : 110, null][membership]
      return { member: [whole(random, 0, 15), whole(random, 0, 15)], membership, fee: due && random() < 0.04 ? null : fee, joined, status: due ? 0 : 1,
        paidOn: due || membership === 3 ? null : later(joined, whole(random, 0, 20)), collectedBy: due || membership === 3 ? null : pick(random, [2, 6, 4, 3, 2, 1]), city: city < 5 ? city : null }
    },
    said: { member: (name, lang) => (Array.isArray(name) ? fullName(lang, /** @type {[number, number]} */ (name)) : name[lang]), membership: (at, lang) => OPTIONS[['adult', 'student', 'family', 'honorary'][at]][lang], fee: (value) => value, joined: iso, paidOn: iso,
      status: (at, lang) => OPTIONS[['due', 'settled'][at]][lang], collectedBy: (at, lang) => PEOPLE[lang][at], city: (at, lang) => OPTIONS[`town${at + 1}`][lang] },
  },
}

/** Each collection's rows as made, once: the same for every language. @type {Record<string, Made[]>} */
const MADE = Object.fromEntries(Object.entries(SPECS).map(([id, spec]) => { const random = dice(spec.seed); return [id, Array.from({ length: SIZE }, (_, i) => spec.make(i, random))] }))

/**
 * A collection in one language, as Tables loads one: its collection.json made as table_create makes it, and its rows, each cell as its
 * column takes it, an empty one absent. @param {string} id @param {Lang} lang @returns {Seeded}
 */
export function seeded(id, lang) {
  const spec = SPECS[id], at = Object.keys(SPECS).indexOf(id)
  const table = createTable({ name: spec.name[lang], columns: spec.columns.map((column) => ({ name: column.name[lang], type: column.type, ...(column.options && { options: column.options.map((key) => OPTIONS[key][lang]) }) })) },
    { id: `01KA${String(at + 1).padStart(22, '0')}`, author: 'user', at: new Date(FIRST).toISOString() })
  const ids = dice(spec.seed + 1000)
  const rows = MADE[id].map((made, i) => {
    const day = /** @type {number} */ (made.date ?? made.applied ?? made.joined), stamp = { at: `${iso(day)}T09:00:00.000Z`, by: 'user' }
    const cells = Object.fromEntries(spec.columns.flatMap((column, n) => (made[column.key] === null || made[column.key] === false ? [] : [[table.properties[n].id, spec.said[column.key](made[column.key], lang)]])).filter(([, value]) => value !== null))
    return /** @type {Row} */ ({ id: rowId(i, ids), cells, stamps: {}, created: stamp, changed: stamp })
  })
  const name = (/** @type {string} */ key) => /** @type {Column} */ (spec.columns.find((column) => column.key === key)).name[lang]
  return { id, lang, folder: folderOf(table), table, rows, made: MADE[id], name, option: (key) => OPTIONS[key][lang], person: (n) => PEOPLE[lang][n] }
}

// ─── The questions ───────────────────────────────────────────────────────────

/** Cents added, as the figure a person reads. @param {Made[]} rows @param {string} key */
const cents = (rows, key) => rows.reduce((sum, row) => sum + (row[key] ?? 0), 0) / 100
/** @param {Made[]} rows @param {string} key */
const plain = (rows, key) => rows.reduce((sum, row) => sum + (row[key] ?? 0), 0)
/** A figure for each choice of a column, by the choice's key; rows with none are left out. @param {Made[]} rows @param {string} key @param {string[]} options @param {(rows: Made[]) => number} figure */
const byChoice = (rows, key, options, figure) => Object.fromEntries(options.map((option, at) => [option, figure(rows.filter((row) => row[key] === at))]))

/** @type {{ id: string, collection: string, kind: 'sum' | 'count' | 'by' | 'row', text: Words, keep: (row: Made) => boolean, figure: (rows: Made[]) => number | Record<string, number>, key: Question['key'] }[]} */
const ASKED = [
  { id: 'left-to-pay', collection: 'expenses', kind: 'sum', text: w('How much is left to pay?', 'Combien reste-t-il à payer ?', 'كم المبلغ المتبقي للدفع؟', 'まだ支払っていない金額は合計いくらですか？'),
    keep: (row) => row.status === 0, figure: (rows) => cents(rows, 'amount'), key: (one) => ({ where: `${one.name('status')} is ${one.option('toPay')}`, sum: one.name('amount') }) },
  { id: 'by-category', collection: 'expenses', kind: 'by', text: w('What did we spend by category this year?', 'Combien avons-nous dépensé par catégorie cette année ?', 'كم أنفقنا في كل فئة هذا العام؟', '今年はカテゴリごとにいくら使いましたか？'),
    keep: (row) => inYear(row.date, 2026), figure: (rows) => byChoice(rows, 'category', CATEGORIES, (group) => cents(group, 'amount')), key: (one) => ({ where: `${one.name('date')} is this year`, by: one.name('category'), sum: one.name('amount') }) },
  { id: 'travel-2025', collection: 'expenses', kind: 'sum', text: w('How much did we spend on travel in 2025?', 'Combien avons-nous dépensé en déplacements en 2025 ?', 'كم أنفقنا على التنقل في عام 2025؟', '2025年の交通費は合計いくらでしたか？'),
    keep: (row) => row.category === 2 && inYear(row.date, 2025), figure: (rows) => cents(rows, 'amount'), key: (one) => ({ where: `${one.name('category')} is ${one.option('travel')} and ${one.name('date')} is last year`, sum: one.name('amount') }) },
  { id: 'no-receipt', collection: 'expenses', kind: 'count', text: w('How many expenses have no receipt?', 'Combien de dépenses n’ont pas de justificatif ?', 'كم عدد المصاريف التي ليس لها إيصال؟', '領収書がない支出は何件ありますか？'),
    keep: (row) => !row.receipt, figure: (rows) => rows.length, key: (one) => ({ where: `${one.name('receipt')} is no`, count: true }) },
  { id: 'paid-by', collection: 'expenses', kind: 'sum', text: w('How much has Priya paid for in total?', 'Combien Nadia a-t-elle payé en tout ?', 'كم دفعت مريم في المجموع؟', '高橋さんが支払った金額は合計いくらですか？'),
    keep: (row) => row.paidBy === 2, figure: (rows) => cents(rows, 'amount'), key: (one) => ({ where: `${one.name('paidBy')} is ${one.person(2)}`, sum: one.name('amount') }) },
  { id: 'defibrillator', collection: 'expenses', kind: 'row', text: w('How much did the defibrillator cost?', 'Combien a coûté le défibrillateur ?', 'كم كلّف جهاز إنعاش القلب؟', '除細動器はいくらでしたか？'),
    keep: (row) => row.item === ONLY.item, figure: (rows) => cents(rows, 'amount'), key: (one) => ({ where: `${one.name('item')} is ${ONLY.item[one.lang]}`, sum: one.name('amount') }) },

  { id: 'no-answer', collection: 'jobs', kind: 'count', text: w('How many of the applications I’ve sent since October got no answer?', 'Combien de candidatures envoyées depuis octobre sont restées sans réponse ?', 'كم طلبًا أرسلته منذ أكتوبر ولم أتلقَّ عليه ردًا؟', '10月以降に応募したうち、まだ返事がないのは何件ですか？'),
    keep: (row) => row.status === 0 && since(row.applied, '2026-10-01'), figure: (rows) => rows.length, key: (one) => ({ where: `${one.name('answered')} is empty and ${one.name('applied')} >= 2026-10`, count: true }) },
  { id: 'linkedin-2025', collection: 'jobs', kind: 'count', text: w('How many applications did I send through LinkedIn in 2025?', 'Combien de candidatures ai-je envoyées via LinkedIn en 2025 ?', 'كم طلبًا قدّمته عبر لينكد إن في عام 2025؟', '2025年にLinkedIn経由で応募したのは何件ですか？'),
    keep: (row) => row.source === 0 && inYear(row.applied, 2025), figure: (rows) => rows.length, key: (one) => ({ where: `${one.name('source')} is ${one.option('linkedin')} and ${one.name('applied')} is last year`, count: true }) },
  { id: 'by-status', collection: 'jobs', kind: 'by', text: w('How many applications are there at each status?', 'Combien y a-t-il de candidatures pour chaque statut ?', 'كم عدد الطلبات في كل حالة؟', '状況ごとの応募件数を教えてください。'),
    keep: () => true, figure: (rows) => byChoice(rows, 'status', ['applied', 'interview', 'offer', 'rejected'], (group) => group.length), key: (one) => ({ by: one.name('status'), count: true }) },
  { id: 'travel-cost', collection: 'jobs', kind: 'sum', text: w('How much have I spent on travel for my applications this year?', 'Combien ai-je dépensé en frais de déplacement pour mes candidatures cette année ?', 'كم أنفقت على التنقل من أجل طلباتي هذا العام؟', '今年、応募のためにかかった交通費は合計いくらですか？'),
    keep: (row) => inYear(row.applied, 2026), figure: (rows) => cents(rows, 'travel'), key: (one) => ({ where: `${one.name('applied')} is this year`, sum: one.name('travel') }) },
  { id: 'rejected-board', collection: 'jobs', kind: 'count', text: w('How many of my job board applications were rejected?', 'Combien de mes candidatures passées par une annonce ont été refusées ?', 'كم طلبًا قدّمته عبر مواقع التوظيف تم رفضه؟', '求人サイト経由の応募のうち、不採用になったのは何件ですか？'),
    keep: (row) => row.source === 3 && row.status === 3, figure: (rows) => rows.length, key: (one) => ({ where: `${one.name('source')} is ${one.option('board')} and ${one.name('status')} is ${one.option('rejected')}`, count: true }) },
  { id: 'salary', collection: 'jobs', kind: 'row', text: w('What salary did Brightwater offer?', 'Quel salaire propose Maison Verdier ?', 'ما الراتب الذي عرضته دار الياسمين؟', 'ホシゾラ出版が提示した年収はいくらですか？'),
    keep: (row) => row.company === ONLY.company, figure: (rows) => plain(rows, 'salary'), key: (one) => ({ where: `${one.name('company')} is ${ONLY.company[one.lang]}`, sum: one.name('salary') }) },

  { id: 'website-this-year', collection: 'orders', kind: 'sum', text: w('How much have we sold through the website this year?', 'Combien avons-nous vendu sur le site web cette année ?', 'كم بلغت مبيعاتنا عبر الموقع هذا العام؟', '今年のウェブサイトでの売上は合計いくらですか？'),
    keep: (row) => row.channel === 1 && inYear(row.date, 2026), figure: (rows) => cents(rows, 'total'), key: (one) => ({ where: `${one.name('channel')} is ${one.option('website')} and ${one.name('date')} is this year`, sum: one.name('total') }) },
  { id: 'unpaid', collection: 'orders', kind: 'sum', text: w('How much is still unpaid across all orders?', 'Quel montant reste impayé sur l’ensemble des commandes ?', 'كم إجمالي الطلبات التي لم تُدفع بعد؟', 'まだ支払われていない注文の合計金額はいくらですか？'),
    keep: (row) => !row.paid, figure: (rows) => cents(rows, 'total'), key: (one) => ({ where: `${one.name('paid')} is no`, sum: one.name('total') }) },
  { id: 'by-channel', collection: 'orders', kind: 'by', text: w('What were last month’s sales by channel?', 'Quelles ont été les ventes du mois dernier par canal ?', 'كم كانت مبيعات الشهر الماضي حسب قناة البيع؟', '先月の販売経路ごとの売上を教えてください。'),
    keep: (row) => iso(row.date).startsWith('2026-10'), figure: (rows) => byChoice(rows, 'channel', ['shop', 'website', 'market'], (group) => cents(group, 'total')), key: (one) => ({ where: `${one.name('date')} is last month`, by: one.name('channel'), sum: one.name('total') }) },
  { id: 'to-prepare', collection: 'orders', kind: 'count', text: w('How many orders are still to prepare?', 'Combien de commandes restent à préparer ?', 'كم طلبًا ما زال قيد التجهيز؟', 'まだ準備中の注文は何件ありますか？'),
    keep: (row) => row.status === 0, figure: (rows) => rows.length, key: (one) => ({ where: `${one.name('status')} is ${one.option('toPrepare')}`, count: true }) },
  { id: 'items-2025', collection: 'orders', kind: 'sum', text: w('How many items did we sell in 2025?', 'Combien d’articles avons-nous vendus en 2025 ?', 'كم قطعة بعنا في عام 2025؟', '2025年に販売した商品は合計何点ですか？'),
    keep: (row) => inYear(row.date, 2025), figure: (rows) => plain(rows, 'items'), key: (one) => ({ where: `${one.name('date')} is last year`, sum: one.name('items') }) },
  { id: 'order', collection: 'orders', kind: 'row', text: w('What was the total of order #1387?', 'Quel était le total de la commande #1387 ?', 'كم كان إجمالي الطلب #1387؟', '注文番号 #1387 の合計はいくらでしたか？'),
    keep: (row) => row.order === '#1387', figure: (rows) => cents(rows, 'total'), key: (one) => ({ where: `${one.name('order')} is #1387`, sum: one.name('total') }) },

  { id: 'fees-due', collection: 'members', kind: 'sum', text: w('How much in fees is still due?', 'Quel montant de cotisations reste à régler ?', 'كم مجموع الرسوم التي ما زالت مستحقة؟', 'まだ納入されていない会費は合計いくらですか？'),
    keep: (row) => row.status === 0, figure: (rows) => plain(rows, 'fee'), key: (one) => ({ where: `${one.name('status')} is ${one.option('due')}`, sum: one.name('fee') }) },
  { id: 'collected', collection: 'members', kind: 'sum', text: w('How much has James collected this year?', 'Combien Julien a-t-il encaissé cette année ?', 'كم استلم يوسف من الرسوم هذا العام؟', '今年、鈴木さんが受け取った会費は合計いくらですか？'),
    keep: (row) => row.collectedBy === 1 && inYear(row.paidOn, 2026), figure: (rows) => plain(rows, 'fee'), key: (one) => ({ where: `${one.name('collectedBy')} is ${one.person(1)} and ${one.name('paidOn')} is this year`, sum: one.name('fee') }) },
  { id: 'by-membership', collection: 'members', kind: 'by', text: w('How many members do we have for each kind of membership?', 'Combien d’adhérents avons-nous pour chaque formule ?', 'كم عدد الأعضاء في كل نوع من أنواع العضوية؟', '会員種別ごとの人数を教えてください。'),
    keep: () => true, figure: (rows) => byChoice(rows, 'membership', ['adult', 'student', 'family', 'honorary'], (group) => group.length), key: (one) => ({ by: one.name('membership'), count: true }) },
  { id: 'joined-unpaid', collection: 'members', kind: 'count', text: w('How many members who joined this year haven’t paid yet?', 'Combien d’adhérents inscrits cette année n’ont pas encore réglé ?', 'كم عضوًا انضم هذا العام ولم يدفع بعد؟', '今年入会した会員のうち、まだ会費を納めていないのは何人ですか？'),
    keep: (row) => row.status === 0 && inYear(row.joined, 2026), figure: (rows) => rows.length, key: (one) => ({ where: `${one.name('joined')} is this year and ${one.name('status')} is ${one.option('due')}`, count: true }) },
  { id: 'families', collection: 'members', kind: 'count', text: w('How many family memberships do we have?', 'Combien avons-nous d’adhésions Famille ?', 'كم عدد عضويات العائلة لدينا؟', '家族会員は何件ありますか？'),
    keep: (row) => row.membership === 2, figure: (rows) => rows.length, key: (one) => ({ where: `${one.name('membership')} is ${one.option('family')}`, count: true }) },
  { id: 'member-fee', collection: 'members', kind: 'row', text: w('How much is Agnes Whitlock’s fee?', 'À combien s’élève la cotisation d’Odile Kerbrat ?', 'كم رسوم العضوة بثينة الحايك؟', '小野寺千鶴さんの会費はいくらですか？'),
    keep: (row) => row.member === ONLY.member, figure: (rows) => plain(rows, 'fee'), key: (one) => ({ where: `${one.name('member')} is ${ONLY.member[one.lang]}`, sum: one.name('fee') }) },
]

/** The questions, each with its figure from every row, and whether the first 200 alone give another. @type {Question[]} */
export const QUESTIONS = ASKED.map(({ keep, figure, ...asked }) => {
  const kept = MADE[asked.collection].filter(keep), right = figure(kept), first = figure(MADE[asked.collection].slice(0, 200).filter(keep))
  return { ...asked, right, matching: kept.length, past: JSON.stringify(right) !== JSON.stringify(first) }
})
export const COLLECTIONS = Object.keys(SPECS)
