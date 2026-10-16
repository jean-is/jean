// The eval's own tasks, in English, French, Arabic and Japanese: office work of many steps on files made here from a
// seed, each with TheAgentCompany-style checkpoints read from the files Jean leaves, and a change of mind the person
// sends while it works (τ-bench's simulated user, D365). Two short ones are there to see that a plan stays away from a
// one-step request (D364). Names and numbers are the same in every language, so the checkpoints are too.
import { rng } from '../documents/corpus.js'
import { makeFile } from '../../app/caps/made/formats.js'
import { gives, names } from './score.js'

/** @typedef {'en' | 'fr' | 'ar' | 'ja'} Lang */
/** @typedef {{ name: string, text: string }} Made a file Jean made or changed, as Jean reads it */
/** @typedef {{ name: string, pass: boolean }} Check */
/**
 * @typedef {Object} Scenario
 * @property {string} id
 * @property {boolean} long                         work of many steps, or a one-step request
 * @property {'files' | 'folder'} where
 * @property {(lang: Lang) => Promise<{ name: string, bytes: Uint8Array }[]>} files
 * @property {Record<Lang, string>} request
 * @property {Record<Lang, string>} [change]        what the person sends once they change their mind
 * @property {string} goal                          what they want, for the one who plays them (in English)
 * @property {string} [changed]                     and what they want once they changed their mind
 * @property {(made: Made[], answer: string, lang: Lang, changed: boolean) => Check[]} check
 */

export const LANGS = /** @type {Lang[]} */ (['en', 'fr', 'ar', 'ja'])
const encoder = new TextEncoder()

/** @param {Made[]} made @param {RegExp} kind */
const one = (made, kind) => made.find((file) => kind.test(file.name))
/** @param {string} name @param {boolean} pass @returns {Check} */
const check = (name, pass) => ({ name, pass })

// ─── Expenses: six months of files, a workbook and a memo (a folder) ─────────

const PEOPLE = ['Amira', 'Bruno', 'Chloé', 'Kenji']
const CATEGORIES = /** @type {Record<Lang, string[]>} */ ({
  en: ['Travel', 'Meals', 'Software', 'Training'],
  fr: ['Déplacements', 'Repas', 'Logiciels', 'Formation'],
  ar: ['سفر', 'وجبات', 'برمجيات', 'تدريب'],
  ja: ['出張', '会食', 'ソフトウェア', '研修'],
})
const EXPENSE_HEADS = /** @type {Record<Lang, string>} */ ({ en: 'date,person,category,amount', fr: 'date,personne,catégorie,montant', ar: 'التاريخ,الشخص,الفئة,المبلغ', ja: '日付,担当者,費目,金額' })
const EXPENSE_FILES = /** @type {Record<Lang, string>} */ ({ en: 'expenses', fr: 'depenses', ar: 'مصاريف', ja: '経費' })
const TRAINING = 3

/** Six months of expenses, the same in every language: rows of [month, day, person, category, amount]. */
const expenses = (() => {
  const random = rng(11)
  /** @type {[number, number, number, number, number][]} */
  const rows = []
  for (let month = 1; month <= 6; month++) {
    for (let i = 0; i < 7; i++) rows.push([month, 1 + Math.floor(random() * 27), Math.floor(random() * 4), Math.floor(random() * 3), Math.round(40 + random() * 600) + Math.round(random() * 99) / 100])
  }
  // Training makes Kenji the top spender and Training the costliest category; without it, others are.
  rows.push([2, 14, 3, TRAINING, 3480], [4, 9, 3, TRAINING, 2975.5], [5, 20, 1, TRAINING, 1640])
  return rows.sort((a, b) => a[0] - b[0] || a[1] - b[1])
})()

/** Each person's total, and each category's, with Training or without. @param {boolean} without */
function expenseTotals(without) {
  const kept = expenses.filter((row) => !without || row[3] !== TRAINING)
  const sum = (/** @type {(row: typeof expenses[0]) => boolean} */ which) => Math.round(kept.filter(which).reduce((n, row) => n + row[4], 0) * 100) / 100
  const people = PEOPLE.map((_, p) => sum((row) => row[2] === p))
  const categories = [0, 1, 2, 3].map((c) => sum((row) => row[3] === c))
  return { people, categories, top: people.indexOf(Math.max(...people)), costliest: categories.indexOf(Math.max(...categories)) }
}

/** @type {Scenario} */
const expensesScenario = {
  id: 'expenses',
  long: true,
  where: 'folder',
  files: async (lang) => [1, 2, 3, 4, 5, 6].map((month) => ({
    name: `${EXPENSE_FILES[lang]}-2026-0${month}.csv`,
    bytes: encoder.encode(`${EXPENSE_HEADS[lang]}\n${expenses.filter((row) => row[0] === month).map(([m, d, p, c, amount]) => `2026-0${m}-${String(d).padStart(2, '0')},${PEOPLE[p]},${CATEGORIES[lang][c]},${amount.toFixed(2)}`).join('\n')}\n`),
  })),
  request: {
    en: 'This folder has our team\'s expenses from January to June 2026, one file a month. Make a workbook "H1 summary.xlsx" with each person\'s total for each month and for the half-year. Then write "Memo.docx", a short memo for our manager saying who spent the most over the half-year, how much, and which category cost the most.',
    fr: 'Ce dossier contient les dépenses de notre équipe de janvier à juin 2026, un fichier par mois. Fais un classeur « Bilan S1.xlsx » avec le total de chaque personne pour chaque mois et pour le semestre. Puis rédige « Note.docx », une courte note pour notre responsable disant qui a le plus dépensé sur le semestre, combien, et quelle catégorie a coûté le plus.',
    ar: 'في هذا المجلد مصاريف فريقنا من يناير إلى يونيو 2026، ملف لكل شهر. أنشئ مصنفًا باسم "ملخص النصف الأول.xlsx" فيه مجموع كل شخص لكل شهر وللنصف الأول كاملًا. ثم اكتب "مذكرة.docx"، مذكرة قصيرة لمديرنا تذكر من أنفق أكثر خلال النصف الأول، وكم أنفق، وأي فئة كلّفت أكثر.',
    ja: 'このフォルダーには、2026年1月から6月までのチームの経費が月ごとに1ファイルずつ入っています。各担当者の月別合計と上半期合計をまとめたブック「上半期まとめ.xlsx」を作ってください。そのあと、上半期に一番多く使ったのは誰か、その金額、一番費用がかかった費目を上司に伝える短いメモ「メモ.docx」を書いてください。',
  },
  change: {
    en: 'Actually, leave out Training everywhere: it comes out of another budget.',
    fr: 'En fait, laisse de côté la Formation partout : elle relève d\'un autre budget.',
    ar: 'في الواقع، استبعد التدريب من كل شيء: فهو من ميزانية أخرى.',
    ja: 'やっぱり、研修費はすべて除外してください。別の予算から出ているので。',
  },
  goal: 'A workbook of each person\'s monthly and half-year expense totals, and a short memo for your manager naming who spent the most over the half-year, how much, and the costliest category.',
  changed: 'Training must be left out of everything (the workbook and the memo): it comes out of another budget.',
  check: (made, _answer, lang, changed) => {
    const { people, top, costliest } = expenseTotals(changed)
    const book = one(made, /\.xlsx$/i)?.text ?? ''
    const memo = one(made, /\.docx$/i)?.text ?? ''
    return [
      check('workbook', Boolean(book)),
      check('everyone in it', PEOPLE.every((person) => names(book, person))),
      check('half-year totals', people.every((total) => gives(book, total))),
      check('memo', Boolean(memo)),
      check('top spender', names(memo, PEOPLE[top])),
      check('their total', gives(memo, people[top])),
      check('costliest category', names(memo, CATEGORIES[lang][costliest])),
    ]
  },
}

// ─── Prices: a price list changed in place, and a notice (a folder) ──────────

const PRODUCTS = [
  ['P-101', 'Lumio A4', 0, 5.4], ['P-102', 'Lumio A3', 0, 9.9], ['P-103', 'Velin 120g', 0, 12.6], ['P-104', 'Recyclo A4', 0, 4.75],
  ['I-201', 'Inkora Black', 1, 18.2], ['I-202', 'Inkora Colour', 1, 24.5], ['I-203', 'Toner T9', 1, 61], ['I-204', 'Inkora XL', 1, 29.9],
  ['F-301', 'Arcus binder', 2, 3.2], ['F-302', 'Arcus folder', 2, 1.15], ['F-303', 'Tabs 10', 2, 2.4], ['F-304', 'Archive box', 2, 6.8],
  ['W-401', 'Pen Fluo', 3, 1.9], ['W-402', 'Pen Gel', 3, 2.25], ['W-403', 'Marker Duo', 3, 3.6], ['W-404', 'Pencil HB', 3, 0.85],
]
const PRODUCT_KINDS = /** @type {Record<Lang, string[]>} */ ({
  en: ['Paper', 'Ink', 'Filing', 'Writing'],
  fr: ['Papier', 'Encre', 'Classement', 'Écriture'],
  ar: ['ورق', 'حبر', 'حفظ الملفات', 'كتابة'],
  ja: ['用紙', 'インク', 'ファイリング', '筆記具'],
})
const PRICE_HEADS = /** @type {Record<Lang, string>} */ ({ en: 'Ref,Product,Category,Price', fr: 'Réf,Produit,Catégorie,Prix', ar: 'المرجع,المنتج,الفئة,السعر', ja: '品番,商品,区分,価格' })
const PRICE_LIST = /** @type {Record<Lang, string>} */ ({ en: 'Price list.xlsx', fr: 'Tarifs.xlsx', ar: 'قائمة الأسعار.xlsx', ja: '価格表.xlsx' })
const LETTER = /** @type {Record<Lang, [string, string]>} */ ({
  en: ['Supplier letter.docx', '# Price update\n\nDear customer,\n\nFrom 1 November 2026, our prices for **Paper** and **Ink** rise by 4%. Prices for Filing and Writing do not change.\n\nKind regards,\n\nPapeteries Delmas'],
  fr: ['Courrier fournisseur.docx', '# Évolution des tarifs\n\nCher client,\n\nÀ compter du 1er novembre 2026, nos prix du **Papier** et de l\'**Encre** augmentent de 4 %. Les prix du Classement et de l\'Écriture ne changent pas.\n\nBien cordialement,\n\nPapeteries Delmas'],
  ar: ['رسالة المورد.docx', '# تحديث الأسعار\n\nعميلنا العزيز،\n\nاعتبارًا من 1 نوفمبر 2026، ترتفع أسعارنا في فئتي **الورق** و**الحبر** بنسبة 4٪. أما أسعار حفظ الملفات والكتابة فلا تتغير.\n\nمع خالص التحية،\n\nPapeteries Delmas'],
  ja: ['仕入先からの通知.docx', '# 価格改定のお知らせ\n\nお客様各位\n\n2026年11月1日より、**用紙**および**インク**の価格を4%値上げいたします。ファイリングと筆記具の価格は変わりません。\n\n敬具\n\nPapeteries Delmas'],
})
const NOVEMBER = /** @type {Record<Lang, RegExp>} */ ({
  en: /\b1(st)?\s+November|November\s+1(st)?\b|2026-11-01|\b0?1\/11\/2026|\b11\/0?1\/2026/i,
  fr: /\b1(er)?\s+novembre|2026-11-01|\b0?1\/11\/2026/i,
  ar: /1\s*(من\s*)?نوفمبر|نوفمبر|2026-11-01|0?1\/11\/2026/,
  ja: /11月\s*1日|2026-11-01|2026\/11\/0?1/,
})

/** A price raised by a rate, to the cent. @param {number} price @param {number} rate */
const raised = (price, rate) => Math.round(price * (100 + rate)) / 100

/** @type {Scenario} */
const pricesScenario = {
  id: 'prices',
  long: true,
  where: 'folder',
  files: async (lang) => {
    const csv = `${PRICE_HEADS[lang]}\n${PRODUCTS.map(([ref, name, kind, price]) => `${ref},${name},${PRODUCT_KINDS[lang][/** @type {number} */ (kind)]},${price}`).join('\n')}`
    const [letter, text] = LETTER[lang]
    return [await makeFile(PRICE_LIST[lang], csv), await makeFile(letter, text)].map(({ name, bytes }) => ({ name, bytes }))
  },
  request: {
    en: 'Our supplier\'s letter in this folder announces new prices. Update "Price list.xlsx" in place with the new prices, rounded to the cent. Then write "Customer notice.docx" telling our customers which prices change, by how much and from when.',
    fr: 'Le courrier de notre fournisseur, dans ce dossier, annonce de nouveaux prix. Mets à jour « Tarifs.xlsx » sur place avec les nouveaux prix, arrondis au centime. Puis rédige « Avis clients.docx » pour dire à nos clients quels prix changent, de combien et à partir de quand.',
    ar: 'رسالة موردنا في هذا المجلد تعلن عن أسعار جديدة. حدّث "قائمة الأسعار.xlsx" في مكانه بالأسعار الجديدة، مقرّبة إلى أقرب سنت. ثم اكتب "إشعار العملاء.docx" لإبلاغ عملائنا بالأسعار التي تتغير، وبمقدار التغيير، ومن أي تاريخ.',
    ja: 'このフォルダーにある仕入先からの通知に新しい価格が書かれています。「価格表.xlsx」をその場で新しい価格に更新してください（1セント単位で四捨五入）。そのあと、どの価格がいつからどれだけ変わるかをお客様に知らせる「お客様へのお知らせ.docx」を書いてください。',
  },
  change: {
    en: 'Update: the supplier has just agreed to 3% instead of 4%.',
    fr: 'Nouvelle info : le fournisseur vient d\'accepter 3 % au lieu de 4 %.',
    ar: 'تحديث: وافق المورد للتو على 3٪ بدلًا من 4٪.',
    ja: '更新です。仕入先が4%ではなく3%に応じてくれました。',
  },
  goal: 'The price list updated in place with the supplier\'s new prices (Paper and Ink up 4% from 1 November 2026, to the cent, the rest unchanged), and a notice for customers saying which prices change, by how much and from when.',
  changed: 'The rise is 3%, not 4%: the price list and the notice must say 3%.',
  check: (made, _answer, lang, changed) => {
    const rate = changed ? 3 : 4
    const list = one(made, /\.xlsx$/i)?.text ?? ''
    const notice = one(made, /\.docx$/i)?.text ?? ''
    const [up, same] = [PRODUCTS.filter(([, , kind]) => Number(kind) < 2), PRODUCTS.filter(([, , kind]) => Number(kind) >= 2)]
    return [
      check('price list changed', Boolean(list)),
      check('new prices', up.every(([, , , price]) => gives(list, raised(Number(price), rate), 0))),
      check('other prices kept', same.every(([, , , price]) => gives(list, Number(price), 0))),
      check('notice', Boolean(notice)),
      check('from when', NOVEMBER[lang].test(notice)),
      check('by how much', new RegExp(`(^|[^\\d.,])${rate}\\s*[%٪％]|${rate}\\s*(per ?cent|pour ?cent|パーセント)`).test(notice)),
      check('which', [0, 1].every((kind) => names(notice, PRODUCT_KINDS[lang][kind]))),
    ]
  },
}

// ─── Meetings: actions out of four notes, a workbook and a follow-up (shared files) ──

const OWNERS = ['Amira', 'Bruno', 'Chloé', 'Dmitri', 'Elif', 'Farid', 'Grace', 'Hiro', 'Inès', 'Jonas']
// For each action: its meeting (0–3), its owner, its due date; meetings 0 and 2 are Lyon's.
const ACTIONS = /** @type {[number, number, string][]} */ ([[0, 0, '2026-10-02'], [0, 5, '2026-10-30'], [0, 8, '2026-10-12'], [1, 1, '2026-10-08'], [1, 6, '2026-11-04'],
  [2, 2, '2026-09-28'], [2, 7, '2026-10-21'], [2, 9, '2026-10-14'], [3, 3, '2026-10-05'], [3, 4, '2026-10-27']])
const DAY = '2026-10-15'
const OFFICES = /** @type {Record<Lang, string[]>} */ ({ en: ['Lyon', 'Casablanca', 'Lyon', 'Osaka'], fr: ['Lyon', 'Casablanca', 'Lyon', 'Osaka'], ar: ['ليون', 'الدار البيضاء', 'ليون', 'أوساكا'], ja: ['リヨン', 'カサブランカ', 'リヨン', '大阪'] })
const TASKS = /** @type {Record<Lang, string[]>} */ ({
  en: ['send the revised budget to finance', 'book the venue for the client day', 'update the supplier contact list', 'draft the newsletter', 'collect the signed contracts',
    'check the insurance renewal', 'prepare the onboarding pack', 'order the new badges', 'reply to the auditors\' questions', 'archive last year\'s invoices'],
  fr: ['envoyer le budget révisé à la comptabilité', 'réserver la salle pour la journée clients', 'mettre à jour la liste des contacts fournisseurs', 'rédiger la lettre d\'information', 'rassembler les contrats signés',
    'vérifier le renouvellement de l\'assurance', 'préparer le livret d\'accueil', 'commander les nouveaux badges', 'répondre aux questions des auditeurs', 'archiver les factures de l\'an dernier'],
  ar: ['إرسال الميزانية المعدلة إلى المالية', 'حجز القاعة ليوم العملاء', 'تحديث قائمة جهات اتصال الموردين', 'صياغة النشرة الإخبارية', 'جمع العقود الموقعة',
    'التحقق من تجديد التأمين', 'إعداد حزمة استقبال الموظفين الجدد', 'طلب الشارات الجديدة', 'الرد على أسئلة المدققين', 'أرشفة فواتير العام الماضي'],
  ja: ['改訂予算を経理に送る', '顧客デーの会場を予約する', '仕入先の連絡先リストを更新する', 'ニュースレターの原稿を書く', '署名済みの契約書を集める',
    '保険の更新を確認する', '新人向け資料を準備する', '新しい社員証を発注する', '監査人の質問に回答する', '昨年の請求書を保管する'],
})
const NOTES = /** @type {Record<Lang, (office: string, n: number) => [string, string]>} */ ({
  en: (office, n) => [`Meeting ${n} - ${office}.docx`, `# Team meeting, ${office} office\n\nWe went over the quarter's figures and the client day.\n\n## Actions\n\n`],
  fr: (office, n) => [`Réunion ${n} - ${office}.docx`, `# Réunion d'équipe, bureau de ${office}\n\nNous avons passé en revue les chiffres du trimestre et la journée clients.\n\n## Actions\n\n`],
  ar: (office, n) => [`اجتماع ${n} - ${office}.docx`, `# اجتماع الفريق، مكتب ${office}\n\nراجعنا أرقام الربع ويوم العملاء.\n\n## الإجراءات\n\n`],
  ja: (office, n) => [`会議${n} - ${office}.docx`, `# チーム会議（${office}オフィス）\n\n四半期の数字と顧客デーについて確認しました。\n\n## アクション\n\n`],
})
const DUE = /** @type {Record<Lang, string>} */ ({ en: 'due', fr: 'échéance', ar: 'الموعد النهائي', ja: '期限' })

/** The actions the follow-up should name, and those it shouldn't: overdue on the day, of Lyon's meetings once asked. @param {boolean} lyon */
function overdue(lyon) {
  const kept = ACTIONS.filter(([meeting]) => !lyon || meeting % 2 === 0)
  return { kept, late: kept.filter(([, , due]) => due < DAY), rest: ACTIONS.filter((action) => !kept.includes(action) || action[2] >= DAY) }
}

/** @type {Scenario} */
const meetingsScenario = {
  id: 'meetings',
  long: true,
  where: 'files',
  files: async (lang) => Promise.all([0, 1, 2, 3].map(async (meeting) => {
    const [name, head] = NOTES[lang](OFFICES[lang][meeting], meeting + 1)
    const items = ACTIONS.filter(([m]) => m === meeting).map(([, owner, due]) => `- ${OWNERS[owner]}: ${TASKS[lang][owner]} (${DUE[lang]} ${due})`).join('\n')
    const { bytes } = await makeFile(name, `${head}${items}\n`)
    return { name, bytes }
  })),
  request: {
    en: 'Here are the notes of our last four meetings. Make "Actions.xlsx" listing every action with its owner and due date, the earliest due date first. Then write "Follow-up.docx", a message to the team listing the actions that are overdue as of 15 October 2026.',
    fr: 'Voici les comptes rendus de nos quatre dernières réunions. Fais « Actions.xlsx » avec chaque action, son responsable et son échéance, la plus proche en premier. Puis rédige « Relance.docx », un message à l\'équipe qui liste les actions en retard au 15 octobre 2026.',
    ar: 'هذه محاضر اجتماعاتنا الأربعة الأخيرة. أنشئ "الإجراءات.xlsx" يضم كل إجراء مع المسؤول عنه وموعده النهائي، الأقرب موعدًا أولًا. ثم اكتب "متابعة.docx"، رسالة إلى الفريق تسرد الإجراءات المتأخرة حتى 15 أكتوبر 2026.',
    ja: '直近4回の会議の議事録です。すべてのアクションを担当者と期限つきで、期限の早い順に並べた「アクション.xlsx」を作ってください。そのあと、2026年10月15日時点で期限を過ぎているアクションをチームに伝える「フォローアップ.docx」を書いてください。',
  },
  change: {
    en: 'Only the Lyon office\'s actions, please: the others are followed up by their own teams.',
    fr: 'Seulement les actions du bureau de Lyon, s\'il te plaît : les autres sont suivies par leurs propres équipes.',
    ar: 'إجراءات مكتب ليون فقط من فضلك: الإجراءات الأخرى تتابعها فرقها الخاصة.',
    ja: 'リヨンオフィスのアクションだけにしてください。ほかはそれぞれのチームがフォローします。',
  },
  goal: 'A workbook of every action from the four meeting notes with its owner and due date, earliest first, and a message to the team listing the actions overdue on 15 October 2026.',
  changed: 'Only the Lyon office\'s actions, in both the workbook and the message.',
  check: (made, _answer, _lang, changed) => {
    const { kept, late, rest } = overdue(changed)
    const book = one(made, /\.xlsx$/i)?.text ?? ''
    const message = one(made, /\.docx$/i)?.text ?? ''
    const order = kept.toSorted((a, b) => (a[2] < b[2] ? -1 : 1)).map(([, owner]) => book.indexOf(OWNERS[owner]))
    return [
      check('workbook', Boolean(book)),
      check('every action', kept.every(([, owner]) => names(book, OWNERS[owner]))),
      check('earliest first', order.every((at, i) => at >= 0 && (i === 0 || at > order[i - 1]))),
      ...(changed ? [check('Lyon only', ACTIONS.filter((action) => !kept.includes(action)).every(([, owner]) => !names(book, OWNERS[owner])))] : []),
      check('follow-up', Boolean(message)),
      check('overdue ones', late.every(([, owner]) => names(message, OWNERS[owner]))),
      check('none other', rest.every(([, owner]) => !names(message, OWNERS[owner]))),
    ]
  },
}

// ─── One-step requests, where a plan has no place ────────────────────────────

const GUESTS = ['Amira Haddad', 'Bruno Lefèvre', 'Chloé Martin', 'Dmitri Volkov', 'Elif Kaya', 'Farid Benali', 'Grace Okafor']
const GUEST_HEADS = /** @type {Record<Lang, string>} */ ({ en: 'name,city', fr: 'nom,ville', ar: 'الاسم,المدينة', ja: '氏名,都市' })
const CITIES = ['Lyon', 'Casablanca', 'Osaka', 'Montréal', 'Istanbul', 'Lagos', 'Nairobi']
const guests = async (/** @type {Lang} */ lang) => [{ name: 'guests.csv', bytes: encoder.encode(`${GUEST_HEADS[lang]}\n${GUESTS.map((guest, i) => `${guest},${CITIES[i]}`).join('\n')}\n`) }]

/** @type {Scenario} */
const tableScenario = {
  id: 'table',
  long: false,
  where: 'files',
  files: guests,
  request: { en: 'Turn this list into a table in "Guests.docx".', fr: 'Mets cette liste sous forme de tableau dans « Invités.docx ».', ar: 'حوّل هذه القائمة إلى جدول في "الضيوف.docx".', ja: 'このリストを「ゲスト.docx」の表にしてください。' },
  goal: 'The guest list as a table in a Word document.',
  check: (made) => [check('document', Boolean(one(made, /\.docx$/i))), check('everyone', GUESTS.every((guest) => names(one(made, /\.docx$/i)?.text ?? '', guest)))],
}

/** @type {Scenario} */
const countScenario = {
  id: 'count',
  long: false,
  where: 'files',
  files: guests,
  request: { en: 'How many guests are on this list?', fr: 'Combien d\'invités y a-t-il sur cette liste ?', ar: 'كم عدد الضيوف في هذه القائمة؟', ja: 'このリストにゲストは何人いますか？' },
  goal: 'To know how many guests are on the list.',
  check: (_made, answer) => [check('seven', /7|seven|sept|سبعة|٧|七/i.test(answer))],
}

export const SCENARIOS = [expensesScenario, pricesScenario, meetingsScenario, tableScenario, countScenario]
