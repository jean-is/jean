// A fictional logistics company's documents, made from a seed, with questions whose answers and
// evidence are known: the corpus the document evals run on (docs/architecture.md#retrieval-and-extraction).
// The same seed and size always give the same text. Nothing generated is committed.
//
// Structured: a staff directory with managers, customers, an invoice ledger, a price list.
// Unstructured: contracts and their later amendments, board minutes, incident reports, policies,
// correspondence. About a tenth is French, some Japanese and Arabic. Distractors on purpose:
// near-identical contract codes, superseded values, look-alike incidents.

/** @typedef {'lookup' | 'paraphrase' | 'filter' | 'aggregate' | 'multihop' | 'temporal' | 'crosslingual' | 'negative' | 'global'} Kind */
/** @typedef {{ anchor: string, quote: string, within?: number }} Evidence  anchor: unique in the corpus; quote: first after it */
/** @typedef {{ kind: 'number', value: number, tolerance?: number } | { kind: 'text', value: string, accept: string[] } | { kind: 'none' }} Answer */
/** @typedef {{ id: string, type: Kind, lang: string, text: string, answer: Answer, evidence: Evidence[], distractors?: Evidence[], absent?: string[], split: 'dev' | 'test' }} Question */
/** @typedef {{ kind: 'h1' | 'h2' | 'h3' | 'p' | 'table' | 'break', text?: string, header?: string[], rows?: string[][], lang?: string }} Block */
/** @typedef {{ id: string, title: string, file: string, blocks: Block[] }} Section */

/** Counts at each size. Pages are those of the compendium as Jean extracts it (about 4,000 characters each). */
export const SIZES = {
  xs: { people: 8, orgs: 4, contracts: 2, amendments: 1, invoices: 12, skus: 5, bulletins: 1, meetings: 1, incidents: 2, policies: 2, emails: 1, boilerplate: 1 },
  s: { people: 40, orgs: 12, contracts: 6, amendments: 3, invoices: 160, skus: 20, bulletins: 2, meetings: 2, incidents: 6, policies: 4, emails: 6, boilerplate: 3 },
  m: { people: 300, orgs: 60, contracts: 60, amendments: 14, invoices: 2400, skus: 120, bulletins: 6, meetings: 6, incidents: 40, policies: 10, emails: 60, boilerplate: 6 },
  l: { people: 1500, orgs: 220, contracts: 420, amendments: 90, invoices: 12000, skus: 400, bulletins: 20, meetings: 18, incidents: 150, policies: 24, emails: 400, boilerplate: 7 },
  xl: { people: 3000, orgs: 420, contracts: 2600, amendments: 480, invoices: 64000, skus: 800, bulletins: 60, meetings: 36, incidents: 420, policies: 30, emails: 3000, boilerplate: 8 },
}

/** Questions of each kind at most, at each size. */
const QUESTIONS = {
  xs: { lookup: 3, paraphrase: 2, filter: 2, aggregate: 1, multihop: 1, temporal: 1, crosslingual: 2, negative: 3, global: 1 },
  s: { lookup: 6, paraphrase: 4, filter: 4, aggregate: 3, multihop: 3, temporal: 3, crosslingual: 6, negative: 6, global: 2 },
  m: { lookup: 20, paraphrase: 10, filter: 15, aggregate: 12, multihop: 12, temporal: 12, crosslingual: 20, negative: 15, global: 6 },
  l: { lookup: 40, paraphrase: 24, filter: 30, aggregate: 24, multihop: 24, temporal: 24, crosslingual: 36, negative: 30, global: 10 },
  xl: { lookup: 60, paraphrase: 30, filter: 40, aggregate: 30, multihop: 30, temporal: 30, crosslingual: 48, negative: 36, global: 14 },
}

export const COMPANY = 'Kestrava Logistics'

/** A deterministic generator of numbers in [0, 1): mulberry32. @param {number} seed */
export function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ─── Vocabulary ──────────────────────────────────────────────────────────────

const OFFICES = [
  { city: 'Lyon', lang: 'fr', local: 'Lyon', country: 'France' },
  { city: 'Bordeaux', lang: 'fr', local: 'Bordeaux', country: 'France' },
  { city: 'Montreal', lang: 'fr', local: 'Montréal', country: 'Canada' },
  { city: 'Rotterdam', lang: 'en', local: 'Rotterdam', country: 'Netherlands' },
  { city: 'Antwerp', lang: 'en', local: 'Antwerp', country: 'Belgium' },
  { city: 'Hamburg', lang: 'en', local: 'Hamburg', country: 'Germany' },
  { city: 'Valencia', lang: 'en', local: 'Valencia', country: 'Spain' },
  { city: 'Porto', lang: 'en', local: 'Porto', country: 'Portugal' },
  { city: 'Osaka', lang: 'ja', local: '大阪', country: 'Japan' },
  { city: 'Nagoya', lang: 'ja', local: '名古屋', country: 'Japan' },
  { city: 'Casablanca', lang: 'ar', local: 'الدار البيضاء', country: 'Morocco' },
  { city: 'Tunis', lang: 'ar', local: 'تونس', country: 'Tunisia' },
]

/** Job titles by department, with the words a French, Japanese or Arabic speaker would use. */
const ROLES = {
  Operations: [['Operations Manager', 'responsable des opérations', '業務部長', 'مدير العمليات'], ['Shift Lead', "chef d'équipe", 'シフトリーダー', 'رئيس الوردية'], ['Dispatcher', 'répartiteur', '配車係', 'منسق الإرسال']],
  Fleet: [['Fleet Planner', 'planificateur de flotte', '車両計画担当', 'مخطط الأسطول'], ['Route Analyst', 'analyste des itinéraires', 'ルート分析担当', 'محلل المسارات'], ['Maintenance Coordinator', 'coordinateur de maintenance', '整備調整担当', 'منسق الصيانة']],
  Warehousing: [['Warehouse Supervisor', "superviseur d'entrepôt", '倉庫監督者', 'مشرف المستودع'], ['Inventory Controller', 'contrôleur des stocks', '在庫管理担当', 'مراقب المخزون'], ['Forklift Instructor', 'formateur cariste', 'フォークリフト指導員', 'مدرب الرافعات الشوكية']],
  Finance: [['Credit Controller', 'contrôleur de crédit', '与信管理担当', 'مراقب الائتمان'], ['Financial Analyst', 'analyste financier', '財務アナリスト', 'محلل مالي'], ['Payables Officer', 'chargé des fournisseurs', '買掛金担当', 'مسؤول الحسابات الدائنة']],
  Legal: [['Contracts Counsel', 'juriste contrats', '契約法務担当', 'مستشار العقود'], ['Paralegal', 'assistant juridique', 'パラリーガル', 'مساعد قانوني'], ['Compliance Officer', 'responsable conformité', 'コンプライアンス担当', 'مسؤول الامتثال']],
  Procurement: [['Buyer', 'acheteur', 'バイヤー', 'مشتري'], ['Category Manager', 'chef de catégorie', 'カテゴリーマネージャー', 'مدير الفئة']],
  Sales: [['Account Executive', 'chargé de clientèle', '営業担当', 'مسؤول حسابات'], ['Key Account Manager', 'responsable grands comptes', '重要顧客担当', 'مدير الحسابات الرئيسية']],
  Customs: [['Customs Broker', 'déclarant en douane', '通関士', 'مخلص جمركي'], ['Trade Compliance Analyst', 'analyste conformité commerciale', '貿易コンプライアンス分析担当', 'محلل الامتثال التجاري']],
  Safety: [['Safety Officer', 'responsable sécurité', '安全管理者', 'مسؤول السلامة'], ['Environmental Coordinator', 'coordinateur environnement', '環境調整担当', 'منسق البيئة']],
  HR: [['HR Business Partner', 'partenaire RH', '人事ビジネスパートナー', 'شريك أعمال الموارد البشرية'], ['Payroll Officer', 'gestionnaire de paie', '給与担当', 'مسؤول الرواتب']],
  IT: [['Systems Administrator', 'administrateur systèmes', 'システム管理者', 'مسؤول الأنظمة'], ['Data Engineer', 'ingénieur données', 'データエンジニア', 'مهندس بيانات']],
  Quality: [['Quality Auditor', 'auditeur qualité', '品質監査員', 'مدقق الجودة'], ['Process Engineer', 'ingénieur procédés', 'プロセスエンジニア', 'مهندس العمليات']],
}

const GIVEN = ['Amélie', 'Bruno', 'Camille', 'Daniel', 'Elena', 'Farid', 'Grace', 'Hiroshi', 'Inès', 'Jonas', 'Keiko', 'Lucas', 'Maya', 'Nadia', 'Omar',
  'Paula', 'Quentin', 'Rania', 'Samir', 'Tomás', 'Ulrike', 'Victor', 'Wen', 'Yasmin', 'Yuki', 'Zoé', 'Aiko', 'Bilal', 'Chloé', 'Diego', 'Emma', 'Fatima',
  'Hugo', 'Jun', 'Karim', 'Lena', 'Malik', 'Nora', 'Pierre', 'Sana', 'Takeshi', 'Yara', 'Léa', 'Mehdi', 'Sofia', 'Kenji', 'Leila', 'Mateo', 'Haruto',
  'Astrid', 'Bastien', 'Clara', 'Dmitri', 'Esther', 'Felix', 'Gaspard', 'Hana', 'Idris', 'Julia', 'Kaito', 'Lina', 'Mona', 'Nils', 'Olga', 'Rafael']
const FAMILY = ['Moreau', 'Tanaka', 'Benali', 'Okafor', 'Lindqvist', 'Ferreira', 'Dubois', 'Nakamura', 'El Idrissi', 'Kowalski', 'Van Dijk', 'Rossi',
  'Haddad', 'Schneider', 'Garnier', 'Suzuki', 'Mansour', 'Bakker', 'Lefebvre', 'Yamamoto', 'Chraibi', 'Novak', 'Laurent', 'Kobayashi', 'Bouzid',
  'Jansen', 'Fontaine', 'Watanabe', 'Amrani', 'Petit', 'Ito', 'Saidi', 'Meyer', 'Roux', 'Kato', 'Toumi', 'Hansen', 'Girard', 'Sato', 'Mekki',
  'Andersen', 'Brunet', 'Castillo', 'Dahan', 'Eriksen', 'Faure', 'Gauthier', 'Hoffmann', 'Ishikawa', 'Jaziri', 'Keller', 'Lambert', 'Mori', 'Nouri',
  'Ortega', 'Perrin', 'Rahmani', 'Sakamoto', 'Takahashi', 'Vidal', 'Weber', 'Zidane', 'Aoki', 'Belkadi', 'Colin']
const ORG_A = ['Brellin', 'Ostmark', 'Vauclair', 'Kessa', 'Tavira', 'Norrland', 'Calder', 'Mirabel', 'Hollins', 'Quinta', 'Aldric', 'Belmont', 'Corvo',
  'Delft', 'Esker', 'Fennel', 'Garrick', 'Halvard', 'Isola', 'Jutland', 'Korin', 'Lumen', 'Marlow', 'Nerva', 'Orla', 'Pellam', 'Quill', 'Rook',
  'Selva', 'Tamsin', 'Umber', 'Varo', 'Wexley', 'Yarrow', 'Zephyr', 'Arden', 'Bexley', 'Cassel', 'Dunmore', 'Elvan']
const ORG_B = ['Foods', 'Retail', 'Textiles', 'Pharma', 'Motors', 'Electronics', 'Beverages', 'Home', 'Paper', 'Chemicals', 'Furniture', 'Sports']
const COUNTRIES = ['France', 'Belgium', 'Netherlands', 'Germany', 'Spain', 'Portugal', 'Italy', 'Morocco', 'Tunisia', 'Japan', 'Canada', 'Poland']
const KINDS = [['Warehousing', 'entreposage', '倉庫保管', 'التخزين'], ['Road transport', 'transport routier', '陸上輸送', 'النقل البري'],
  ['Customs brokerage', 'commission en douane', '通関代行', 'التخليص الجمركي'], ['Cold-chain distribution', 'distribution sous température dirigée', '低温物流', 'توزيع سلسلة التبريد'],
  ['Cross-dock services', 'services de cross-docking', 'クロスドック', 'خدمات الشحن العابر']]
const LAWS = ['Paris', 'Lyon', 'Amsterdam', 'Brussels', 'Hamburg', 'Madrid', 'Lisbon', 'Osaka', 'Casablanca', 'Montreal']
const NOTICES = [30, 45, 60, 90, 120, 180]
const TERMS = [12, 24, 36, 48, 60]
const WORDS = { 30: 'thirty', 45: 'forty-five', 60: 'sixty', 90: 'ninety', 120: 'one hundred and twenty', 180: 'one hundred and eighty' }
const MOTS = { 30: 'trente', 45: 'quarante-cinq', 60: 'soixante', 90: 'quatre-vingt-dix', 120: 'cent vingt', 180: 'cent quatre-vingts' }
const PRODUCTS = ['Pallet wrap', 'Strapping band', 'Corner board', 'Shrink hood', 'Label roll', 'Void fill', 'Carton', 'Tape', 'Dunnage bag', 'Ice pack',
  'Thermal liner', 'Crate', 'Tote', 'Seal', 'Desiccant', 'Bubble film', 'Foam insert', 'Kraft sheet', 'Stretch film', 'Edge protector']
const UNITS = ['roll', 'box', 'pack', 'piece', 'case']

/** Causes of incidents, as each language says them, and the words that show an answer named it. */
const CAUSES = [
  { en: 'a ruptured hydraulic hose on a forklift', fr: "la rupture d'un flexible hydraulique sur un chariot élévateur", ja: 'フォークリフトの油圧ホースの破裂', ar: 'تمزق خرطوم هيدروليكي في رافعة شوكية', category: ['spill', 'déversement', '漏洩', 'تسرب'], accept: ['hydraulic', 'hose', 'flexible hydraulique', '油圧', 'هيدروليكي'] },
  { en: 'a short circuit in a battery charging station', fr: 'un court-circuit dans une station de recharge de batteries', ja: 'バッテリー充電ステーションの短絡', ar: 'ماس كهربائي في محطة شحن البطاريات', category: ['fire', 'incendie', '火災', 'حريق'], accept: ['short circuit', 'short-circuit', 'court-circuit', '短絡', 'ماس كهربائي'] },
  { en: 'an overloaded pallet rack that collapsed', fr: "l'effondrement d'un rayonnage surchargé", ja: '過積載のパレットラックの倒壊', ar: 'انهيار رف منصات محمّل فوق طاقته', category: ['collapse', 'effondrement', '倒壊', 'انهيار'], accept: ['rack', 'rayonnage', 'ラック', 'رف'] },
  { en: 'a refrigeration unit failure in the cold room', fr: 'une panne du groupe frigorifique de la chambre froide', ja: '冷蔵室の冷凍機の故障', ar: 'عطل في وحدة التبريد في الغرفة الباردة', category: ['temperature breach', 'rupture de la chaîne du froid', '温度逸脱', 'انقطاع سلسلة التبريد'], accept: ['refrigeration', 'frigorifique', '冷凍機', 'التبريد'] },
  { en: 'rainwater entering through a damaged roof drain', fr: "des infiltrations d'eau de pluie par une gouttière endommagée", ja: '損傷した屋根の排水口からの雨水の浸入', ar: 'تسرب مياه الأمطار من مصرف سقف تالف', category: ['flooding', 'inondation', '浸水', 'فيضان'], accept: ['rainwater', 'rain', 'roof', 'eau de pluie', 'gouttière', '雨水', 'مياه الأمطار'] },
  { en: 'a reversing truck striking a loading dock door', fr: 'un camion en marche arrière qui a heurté une porte de quai', ja: '後退中のトラックによる搬入口の扉への衝突', ar: 'اصطدام شاحنة أثناء الرجوع بباب رصيف التحميل', category: ['collision', 'collision', '衝突', 'اصطدام'], accept: ['truck', 'reversing', 'camion', 'トラック', 'شاحنة'] },
  { en: 'unauthorised access through a disabled gate sensor', fr: 'une intrusion par un capteur de portail désactivé', ja: '無効化されたゲートセンサーからの不正侵入', ar: 'دخول غير مصرح به عبر مستشعر بوابة معطل', category: ['theft', 'vol', '盗難', 'سرقة'], accept: ['gate sensor', 'unauthorised', 'unauthorized', 'intrusion', '不正侵入', 'غير مصرح'] },
  { en: 'a failed firmware update on the warehouse management servers', fr: "une mise à jour défaillante du micrologiciel des serveurs de gestion d'entrepôt", ja: '倉庫管理サーバーのファームウェア更新の失敗', ar: 'فشل تحديث البرامج الثابتة لخوادم إدارة المستودع', category: ['system outage', 'panne informatique', 'システム障害', 'عطل في الأنظمة'], accept: ['firmware', 'micrologiciel', 'ファームウェア', 'البرامج الثابتة'] },
]

/**
 * Policies whose facts are asked in other words: the evidence and the question share at most one
 * content word (test/documents.test.js checks it), so only meaning connects them.
 * @type {{ id: string, title: string, evidence: (n: number) => string, question: (n: number) => string, values: number[], unit: string }[]}
 */
const POLICY_FACTS = [
  { id: 'travel-class', title: 'Business travel', values: [5, 6, 7, 8], unit: 'premium economy', evidence: (n) => `Air journeys exceeding ${n} hours of scheduled flight time entitle the traveller to premium economy seating.`, question: (n) => `On a plane trip lasting ${n + 2} hours, which kind of seat may staff reserve?` },
  { id: 'receipts', title: 'Expenses', values: [25, 30, 40, 50, 75], unit: 'euros', evidence: (n) => `Any expense claim above ${n} euros must be supported by an itemised receipt.`, question: () => 'From what amount do I need proof of purchase to get reimbursed?' },
  { id: 'applicants', title: 'Recruitment data', values: [6, 12, 18, 24], unit: 'months', evidence: (n) => `Personal data collected from job applicants is erased ${n} months after the recruitment closes.`, question: () => 'How long do we keep information about candidates who were not hired?' },
  { id: 'home-working', title: 'Hybrid work', values: [1, 2, 3], unit: 'days', evidence: (n) => `Employees may work from home up to ${n} days per week with their line manager's consent.`, question: () => 'How many weekdays can someone telecommute?' },
  { id: 'gifts', title: 'Gifts and hospitality', values: [50, 75, 100, 150], unit: 'euros', evidence: (n) => `Gifts or hospitality worth more than ${n} euros offered by a supplier must be declared to the compliance office.`, question: () => 'Above which value must a present received from a vendor be reported?' },
  { id: 'lift-licence', title: 'Equipment certification', values: [12, 24, 36], unit: 'months', evidence: (n) => `Lift-truck operators renew their certification every ${n} months.`, question: () => 'How often must forklift drivers retake their qualification?' },
  { id: 'credentials', title: 'IT security', values: [60, 90, 180], unit: 'days', evidence: (n) => `Workstation credentials expire after ${n} days and cannot be reused.`, question: () => 'After how long must I pick a new password for my PC?' },
  { id: 'visitor-badge', title: 'Site access', values: [4, 8, 12], unit: 'hours', evidence: (n) => `Visitors are issued a badge valid for ${n} hours.`, question: () => "For how long is a guest's pass usable?" },
  { id: 'overtime', title: 'Working time', values: [10, 15, 20, 25], unit: 'hours', evidence: (n) => `Overtime beyond ${n} hours in a calendar month requires written approval from the site director.`, question: () => "What's the monthly cap on extra working time before I need my boss's sign-off?" },
  { id: 'second-parent', title: 'Family leave', values: [2, 4, 6, 8], unit: 'weeks', evidence: (n) => `Second parents receive ${n} weeks of paid leave following the birth or adoption of a child.`, question: () => 'How much time off does a father get when a baby arrives?' },
  { id: 'learning', title: 'Training', values: [500, 800, 1000, 1500], unit: 'euros', evidence: (n) => `Each employee has an annual learning allowance of ${n} euros.`, question: () => 'What sum can a worker spend on courses each year?' },
  { id: 'fuel', title: 'Company vehicles', values: [40, 60, 80], unit: 'euros', evidence: (n) => `Company vehicles are refuelled at partner stations with the fleet card; private payment is reimbursed only up to ${n} euros per month.`, question: () => 'If I pay for petrol myself, how much will be paid back monthly?' },
  { id: 'ledgers', title: 'Records management', values: [6, 8, 10], unit: 'years', evidence: (n) => `Accounting records are archived for ${n} years before destruction.`, question: () => 'How long must bookkeeping documents be kept?' },
  { id: 'wheel-time', title: 'Road safety', values: [9, 10, 11], unit: 'hours', evidence: (n) => `Drivers may not exceed ${n} hours behind the wheel in a single shift.`, question: () => 'What is the maximum duration a trucker can spend driving per work period?' },
  { id: 'hearing', title: 'Noise', values: [80, 85, 87], unit: 'decibels', evidence: (n) => `Hearing protection is mandatory wherever sound levels exceed ${n} decibels.`, question: () => 'At what loudness do earplugs become compulsory?' },
  { id: 'stepladders', title: 'Work at height', values: [2, 4, 6], unit: 'weeks', evidence: (n) => `Stepladders are inspected every ${n} weeks by the safety officer.`, question: () => 'How often does someone check the folding steps used for reaching high shelves?' },
  { id: 'lost-card', title: 'Access cards', values: [10, 15, 20], unit: 'euros', evidence: (n) => `A replacement access card costs ${n} euros, deducted from the next payslip.`, question: () => 'What do I pay if I lose my entry pass?' },
  { id: 'meals', title: 'Travel allowances', values: [25, 30, 35, 45], unit: 'euros', evidence: (n) => `Meal allowances during business trips are capped at ${n} euros per day.`, question: () => 'How much can I spend on food while travelling for work, daily?' },
  { id: 'trial', title: 'Onboarding', values: [2, 3, 4, 6], unit: 'months', evidence: (n) => `New hires complete a trial period of ${n} months.`, question: () => 'How long is the probation for someone who just joined?' },
  { id: 'cycling', title: 'Mobility', values: [20, 25, 30], unit: 'cents', evidence: (n) => `Staff cycling to work receive a mileage indemnity of ${n} cents per kilometre.`, question: () => 'What do we pay people who commute by bicycle, per km?' },
  { id: 'laptops', title: 'Equipment', values: [3, 4, 5], unit: 'years', evidence: (n) => `Portable computers are replaced every ${n} years.`, question: () => 'After how long do I get a new notebook PC?' },
  { id: 'drills', title: 'Emergency preparedness', values: [2, 3, 4], unit: 'times a year', evidence: (n) => `Evacuation exercises take place ${n} times a year at every site.`, question: () => 'How often do we practise leaving the building in case of fire?' },
  { id: 'stacking', title: 'Storage', values: [2, 3, 4], unit: 'metres', evidence: (n) => `Stacks of pallets must not exceed ${n} metres in height.`, question: () => 'How tall can a pile of loading platforms be?' },
  { id: 'cold-room', title: 'Temperature control', values: [4, 5, 6, 8], unit: 'degrees', evidence: (n) => `The cold room is held at no more than ${n} degrees Celsius.`, question: () => 'What is the warmest the refrigerated store may get?' },
  { id: 'complaints', title: 'Customer care', values: [3, 5, 10], unit: 'working days', evidence: (n) => `Customer complaints receive a written reply within ${n} working days.`, question: () => 'How fast must we answer a client who is unhappy?' },
  { id: 'induction', title: 'Contractors', values: [30, 45, 60, 90], unit: 'minutes', evidence: (n) => `External contractors attend a safety induction lasting ${n} minutes before starting work.`, question: () => 'How long is the briefing outside workers get on arrival?' },
  { id: 'sick-note', title: 'Absence', values: [2, 3, 4], unit: 'days', evidence: (n) => `A medical certificate is required for absences longer than ${n} consecutive days.`, question: () => "When do I need a doctor's note if I'm ill?" },
  { id: 'on-call-phone', title: 'On-call duty', values: [20, 30, 40], unit: 'euros', evidence: (n) => `Mobile phone plans are reimbursed up to ${n} euros a month for on-call staff.`, question: () => 'How much of their cell subscription do people on standby get back?' },
  { id: 'hazmat', title: 'Dangerous goods', values: [6, 12, 24, 36], unit: 'months', evidence: (n) => `Dangerous goods documentation is retained for ${n} months after shipment.`, question: () => 'How long do we keep the papers for hazardous cargo once it has left?' },
  { id: 'first-aid', title: 'First aid', values: [25, 50, 75], unit: 'employees', evidence: (n) => `At least one certified first-aider must be present for every ${n} employees on shift.`, question: () => 'What is the ratio of people trained in emergency care to workers?' },
]

/** Sentences that fill contracts, as real ones are filled. */
const BOILERPLATE = {
  en: ['Each party shall keep confidential all information disclosed by the other party in connection with this Agreement.', 'Neither party shall be liable for any failure to perform caused by events beyond its reasonable control, including strikes, natural disasters and acts of public authorities.',
    'The Provider shall maintain adequate insurance covering goods in its custody against loss, theft and damage.', 'Goods are stored in premises meeting the applicable fire, safety and hygiene regulations.',
    'Any amendment to this Agreement shall be made in writing and signed by authorised representatives of both parties.', 'Invoices are payable by bank transfer to the account designated by the Provider.',
    'The Customer shall provide accurate descriptions of the goods, including their weight, dimensions and any special handling requirements.', 'The Provider may subcontract part of the services with prior notice to the Customer, remaining responsible for their performance.',
    'Claims for damaged goods must be notified in writing within seven days of delivery, with supporting photographs.', 'The liability of the Provider is limited to the value declared for the goods concerned.',
    'Personal data exchanged under this Agreement is processed in accordance with the applicable data protection legislation.', 'Service levels are reviewed jointly every quarter on the basis of the agreed performance indicators.',
    'This Agreement constitutes the entire agreement between the parties and supersedes any prior arrangement.', 'If any provision is held invalid, the remaining provisions shall continue in full force.',
    'Notices shall be sent by registered letter or by email with acknowledgement of receipt to the addresses given in the schedule.', 'The Customer remains the owner of the goods at all times; the Provider holds them as custodian only.',
    'Inventory counts are carried out at least once a year in the presence of a representative of the Customer.', 'The Provider shall comply with all applicable customs, transport and environmental regulations.'],
  fr: ['Chaque partie garde confidentielles les informations communiquées par l’autre partie au titre du présent contrat.', 'Aucune partie n’est responsable d’une inexécution due à un cas de force majeure, notamment grève, catastrophe naturelle ou fait du prince.',
    'Le Prestataire maintient une assurance couvrant les marchandises sous sa garde contre la perte, le vol et les dommages.', 'Toute modification du présent contrat fait l’objet d’un avenant écrit signé par les deux parties.',
    'Les factures sont payables par virement sur le compte désigné par le Prestataire.', 'Les réclamations pour marchandises endommagées doivent être notifiées par écrit dans les sept jours suivant la livraison.',
    'La responsabilité du Prestataire est limitée à la valeur déclarée des marchandises concernées.', 'Les niveaux de service sont revus conjointement chaque trimestre.'],
  ja: ['各当事者は、本契約に関連して相手方から開示された情報を秘密として保持する。', 'いずれの当事者も、ストライキ、自然災害その他合理的な支配を超える事由による不履行について責任を負わない。',
    '受託者は、保管中の貨物について、滅失、盗難及び損傷を補償する保険を維持する。', '本契約の変更は、両当事者が署名した書面によってのみ行う。',
    '請求書は、受託者が指定する口座への銀行振込により支払われる。', 'サービス水準は、四半期ごとに両当事者が共同で見直す。'],
  ar: ['يلتزم كل طرف بالحفاظ على سرية المعلومات التي يفصح عنها الطرف الآخر بموجب هذا العقد.', 'لا يتحمل أي طرف المسؤولية عن الإخلال الناتج عن القوة القاهرة بما في ذلك الإضرابات والكوارث الطبيعية.',
    'يحتفظ مقدم الخدمة بتأمين يغطي البضائع التي في عهدته ضد الفقدان والسرقة والتلف.', 'لا يجوز تعديل هذا العقد إلا كتابة وبتوقيع الطرفين.',
    'تُدفع الفواتير بالتحويل المصرفي إلى الحساب الذي يحدده مقدم الخدمة.', 'تتم مراجعة مستويات الخدمة بشكل مشترك كل ثلاثة أشهر.'],
}

/** Services a contract prices in its first schedule: the name in each language, and the unit. */
const SERVICES = [
  ['Pallet storage', 'Stockage palette', 'パレット保管', 'تخزين المنصات', 'pallet/week'], ['Inbound handling', 'Réception', '入庫作業', 'مناولة الوارد', 'pallet'],
  ['Outbound handling', 'Expédition', '出庫作業', 'مناولة الصادر', 'pallet'], ['Order picking', 'Préparation de commandes', 'ピッキング', 'تجهيز الطلبات', 'line'],
  ['Labelling', 'Étiquetage', 'ラベル貼付', 'وضع الملصقات', 'carton'], ['Cold storage', 'Stockage froid', '冷蔵保管', 'التخزين المبرد', 'pallet/week'],
  ['Full truckload', 'Camion complet', '貸切輸送', 'شحنة كاملة', 'trip'], ['Part load', 'Groupage', '混載輸送', 'شحنة جزئية', 'pallet'],
  ['Customs declaration', 'Déclaration en douane', '通関申告', 'التصريح الجمركي', 'entry'], ['Returns processing', 'Traitement des retours', '返品処理', 'معالجة المرتجعات', 'item'],
  ['Kitting', 'Kitting', 'キッティング', 'التجميع', 'kit'], ['Waiting time', "Temps d'attente", '待機時間', 'وقت الانتظار', 'hour'],
  ['Shrink wrapping', 'Filmage', 'シュリンク包装', 'التغليف بالانكماش', 'pallet'], ['Inventory count', 'Inventaire', '棚卸', 'جرد المخزون', 'hour'],
]
const LEVELS = [['On-time delivery', 'Livraison à l’heure', '定時配送率', 'التسليم في الموعد', [95, 96, 97, 98, 99], '%'], ['Inventory accuracy', 'Exactitude des stocks', '在庫精度', 'دقة المخزون', [99, 99.5, 99.8], '%'],
  ['Order accuracy', 'Exactitude des commandes', '出荷精度', 'دقة الطلبات', [99, 99.5, 99.9], '%'], ['Dock-to-stock time', 'Délai de mise en stock', '入荷から格納までの時間', 'مدة الإدخال إلى المخزون', [12, 24, 48], 'h']]
const MINUTE_LINES = {
  en: ['The audit committee reported no material findings for the period.', 'Management presented the updated risk register, with fuel prices and driver availability as the main risks.',
    'The board reviewed the health and safety indicators, which improved on the previous quarter.', 'The proposed dividend policy was discussed and will be submitted to shareholders.',
    'An update was given on the warehouse management system migration, now in its testing phase.', 'The board discussed customer concentration and asked for a plan to diversify the portfolio.',
    'Capital expenditure for new handling equipment was reviewed against the annual budget.', 'The sustainability report was presented, including progress on electric delivery vans.',
    'The board noted the outcome of the annual staff survey and the actions planned in response.', 'Legal counsel summarised the status of ongoing disputes with two former suppliers.'],
  fr: ['Le comité d’audit ne signale aucune observation significative sur la période.', 'La direction présente la cartographie des risques mise à jour.', 'Le conseil examine les indicateurs de santé et de sécurité, en amélioration.', 'Un point est fait sur la migration du système de gestion d’entrepôt.'],
  ja: ['監査委員会は、当期に重要な指摘事項はないと報告した。', '経営陣は更新されたリスク一覧を説明した。', '取締役会は安全衛生指標を確認し、前四半期から改善したことを確認した。', '倉庫管理システムの移行状況について報告があった。'],
}
const INCIDENT_LINES = {
  en: ['The area was cordoned off and the emergency services were informed.', 'Operations resumed after an inspection by the maintenance team.', 'Witness statements were collected from the shift lead and two operators.',
    'Affected goods were quarantined pending the customer’s decision.', 'The site safety officer reviewed the risk assessment for the area.', 'A toolbox talk on the incident was held with every shift during the following week.',
    'Camera footage was retained for the investigation.', 'The insurer was notified within forty-eight hours.'],
  fr: ['La zone a été balisée et les secours ont été prévenus.', 'L’activité a repris après une inspection de l’équipe de maintenance.', 'Les témoignages du chef d’équipe et de deux opérateurs ont été recueillis.', 'L’assureur a été informé dans les quarante-huit heures.'],
  ja: ['現場は立入禁止とされ、緊急機関に連絡した。', '保全チームの点検後に作業を再開した。', 'シフトリーダーと作業員二名から聞き取りを行った。', '保険会社には四十八時間以内に通知した。'],
  ar: ['تم تطويق المنطقة وإبلاغ خدمات الطوارئ.', 'استؤنف العمل بعد فحص فريق الصيانة.', 'جُمعت إفادات رئيس الوردية واثنين من العمال.', 'تم إخطار شركة التأمين خلال ثمان وأربعين ساعة.'],
}

const SUBJECTS = ['Delivery schedule', 'Invoice query', 'Storage capacity', 'Rate review', 'Damaged pallets', 'Customs documents', 'Peak season planning', 'Quality audit', 'Forecast update', 'Dock appointment']
const EMAIL_LINES = ['Please find attached the updated forecast for the coming weeks.', 'Could you confirm the dock slots for Thursday morning?', 'We noticed a discrepancy between the delivery note and the invoice.',
  'The pallets arrived with damaged corners; photos are attached.', 'Our finance team will process the payment by the end of the month.', 'Can we schedule a call to review the service levels?',
  'The customs broker needs the commercial invoice before departure.', 'Thank you for your quick response yesterday.', 'Volumes should increase by roughly a fifth during the peak season.',
  'Let me know if you need anything else from our side.', 'The driver was asked to wait two hours at the gate.', 'We would like to discuss the storage rates for next year.']

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** @param {() => number} r */
const helpers = (r) => {
  /** @template T @param {T[]} list @returns {T} */
  const pick = (list) => list[Math.floor(r() * list.length)]
  /** @param {number} a @param {number} b */
  const int = (a, b) => a + Math.floor(r() * (b - a + 1))
  /** @template T @param {T[]} list @returns {T[]} */
  const shuffle = (list) => {
    const out = [...list]
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]]
    }
    return out
  }
  return { pick, int, shuffle, chance: (/** @type {number} */ p) => r() < p }
}

const DAY = 86_400_000
const START = Date.UTC(2021, 0, 1)
/** @param {number} days since 2021-01-01 */
const iso = (days) => new Date(START + days * DAY).toISOString().slice(0, 10)
/** A date as a document in that language writes it. @param {number} days @param {string} lang */
const longDate = (days, lang) => new Intl.DateTimeFormat({ en: 'en-GB', fr: 'fr-FR', ja: 'ja-JP', ar: 'ar-EG' }[lang] ?? 'en-GB', { dateStyle: 'long', timeZone: 'UTC' }).format(START + days * DAY)
/** @param {number} value */
const euros = (value) => value.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
/** Western digits as Arabic-Indic ones. @param {string} text */
const indic = (text) => text.replace(/\d/g, (d) => String.fromCharCode(0x660 + Number(d)))
/** A question's place in the dev split (a fifth) or the test one, by its id alone. @param {string} id */
const splitOf = (id) => ([...id].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 7) >>> 0) % 5 === 0 ? 'dev' : 'test'

// ─── The world ───────────────────────────────────────────────────────────────

/**
 * @param {{ seed?: number, size?: keyof typeof SIZES }} [options]
 */
export function corpus({ seed = 1, size = 's' } = {}) {
  const counts = SIZES[size]
  const r = rng(seed * 1009 + Object.keys(SIZES).indexOf(size))
  const { pick, int, shuffle, chance } = helpers(r)

  // People: each has a manager hired before them in the same office, the first one reporting to the chief executive.
  const names = shuffle(GIVEN.flatMap((g) => FAMILY.map((f) => `${g} ${f}`))).slice(0, counts.people)
  const departments = Object.keys(ROLES)
  /** @type {{ id: string, name: string, office: typeof OFFICES[number], department: string, title: string[], manager: string, start: number, ext: string }[]} */
  const people = names.map((name, i) => {
    const office = i === 0 ? OFFICES[0] : OFFICES[i % OFFICES.length]
    const department = i === 0 ? 'Operations' : pick(departments)
    return { id: `E-${10000 + i * 3 + int(0, 2)}`, name, office, department, title: i === 0 ? ['Chief Executive', 'directeur général', '最高経営責任者', 'الرئيس التنفيذي'] : pick(ROLES[/** @type {keyof typeof ROLES} */ (department)]), manager: '', start: int(0, 1600), ext: String(int(2000, 8999)) }
  })
  people.forEach((person, i) => {
    if (i === 0) return
    const earlier = people.slice(0, i).filter((other) => other.office === person.office)
    person.manager = (earlier.length ? earlier[Math.floor(r() * Math.min(earlier.length, 6))] : people[0]).id
  })
  const byId = new Map(people.map((person) => [person.id, person]))

  const orgNames = shuffle(ORG_A.flatMap((a) => ORG_B.map((b) => `${a} ${b}`))).slice(0, counts.orgs)
  const orgs = orgNames.map((name, i) => ({ code: `K-${String(100 + i * 7).padStart(4, '0')}`, name, country: pick(COUNTRIES), sector: name.split(' ')[1], since: 2005 + int(0, 18) }))

  // Contracts, some with a sibling whose code swaps two digits: both real, each the other's distractor.
  const codes = new Set()
  /** @type {string[]} */
  const ordered = []
  while (ordered.length < counts.contracts) {
    const code = `C-${int(1000, 9999)}`
    if (codes.has(code)) continue
    codes.add(code)
    ordered.push(code)
    const swapped = `C-${code[2]}${code[3]}${code[5]}${code[4]}`
    if (ordered.length < counts.contracts && chance(0.2) && !codes.has(swapped) && swapped !== code) {
      codes.add(swapped)
      ordered.push(swapped)
    }
  }
  const signers = people.filter((person) => ['Legal', 'Sales', 'Operations', 'Procurement'].includes(person.department) && person.id !== people[0].id)
  const contracts = ordered.map((code) => {
    const lang = chance(0.1) ? 'fr' : chance(0.04) ? 'ja' : chance(0.03) ? 'ar' : 'en'
    return { code, lang, org: pick(orgs), kind: pick(KINDS), start: int(0, 1500), term: pick(TERMS), notice: pick(NOTICES), penalty: chance(0.7) ? pick([0.5, 1, 1.5, 2, 2.5, 3, 4, 5]) : null, law: pick(LAWS),
      renewal: chance(0.6), signer: pick(signers.length ? signers : people), variant: int(0, 2), filler: int(Math.max(1, counts.boilerplate - 2), counts.boilerplate + 2),
      rates: shuffle(SERVICES).slice(0, Math.min(SERVICES.length, 4 + counts.boilerplate)).map((service) => ({ service, rate: Math.round((0.4 + r() * r() * 180) * 100) / 100 })),
      levels: LEVELS.map(([en, fr, ja, ar, values, unit]) => ({ names: [en, fr, ja, ar], value: pick(/** @type {number[]} */ (values)), unit })) }
  })
  const contractByCode = new Map(contracts.map((contract) => [contract.code, contract]))

  // Amendments, after the contract started, a few contracts amended more than once.
  /** @type {{ code: string, n: number, day: number, field: 'notice' | 'penalty', value: number }[]} */
  const amendments = []
  const amendable = shuffle(contracts.filter((contract) => contract.lang === 'en'))
  for (let i = 0; i < counts.amendments && amendable.length; i++) {
    const contract = i < amendable.length ? amendable[i] : pick(amendable.slice(0, Math.ceil(amendable.length / 3)))
    const earlier = amendments.filter((a) => a.code === contract.code)
    const field = contract.penalty !== null && chance(0.3) ? 'penalty' : 'notice'
    const current = field === 'notice' ? (earlier.filter((a) => a.field === 'notice').at(-1)?.value ?? contract.notice) : contract.penalty
    const value = field === 'notice' ? pick(NOTICES.filter((n) => n !== current)) : pick([0.5, 1, 1.5, 2, 2.5, 3, 4, 5].filter((n) => n !== current))
    amendments.push({ code: contract.code, n: earlier.length + 1, day: contract.start + int(60, 400) + (earlier.at(-1)?.day ?? contract.start) - contract.start, field, value })
  }

  // Invoices, to customers with a contract mostly.
  const customers = [...new Set(contracts.map((contract) => contract.org))]
  const invoices = Array.from({ length: counts.invoices }, (_, i) => ({ id: `INV-${200000 + i * 3 + int(0, 2)}`, day: 730 + int(0, 1094), org: chance(0.85) && customers.length ? pick(customers) : pick(orgs),
    amount: Math.round((200 + r() * r() * 24000) * 100) / 100, status: pick(['Paid', 'Paid', 'Paid', 'Unpaid', 'Disputed']) })).sort((a, b) => a.day - b.day)

  const skus = Array.from({ length: counts.skus }, (_, i) => ({ code: `SKU-${3000 + i * 11}`, name: `${PRODUCTS[i % PRODUCTS.length]} ${['S', 'M', 'L', 'XL', '500', '750', '1000', 'Pro', 'Eco', 'Plus'][Math.floor(i / PRODUCTS.length) % 10]}${i >= PRODUCTS.length * 10 ? ` ${Math.floor(i / (PRODUCTS.length * 10)) + 1}` : ''}`,
    unit: pick(UNITS), price: Math.round((2 + r() * 80) * 100) / 100 }))
  /** @type {{ code: string, day: number, price: number, bulletin: number }[]} */
  const priceChanges = []
  for (let b = 0; b < counts.bulletins; b++) {
    for (const sku of shuffle(skus).slice(0, Math.max(1, Math.round(skus.length / 12)))) {
      const before = priceChanges.filter((c) => c.code === sku.code).at(-1)?.price ?? sku.price
      priceChanges.push({ code: sku.code, day: 900 + b * 20, price: Math.round(before * (1 + (r() * 0.2 - 0.05)) * 100) / 100, bulletin: b })
    }
  }

  // Board meetings, with one project discussed at most of them and often put off, in varied words.
  const meetings = Array.from({ length: counts.meetings }, (_, i) => {
    const lang = i % 7 === 3 ? 'fr' : i % 11 === 5 ? 'ja' : 'en'
    const outcome = chance(0.7) ? pick(['postponed', 'postponed', 'approved', 'noted']) : null
    return { day: 120 + i * 40 + int(0, 10), lang, outcome, variant: int(0, 4), appointed: pick(people), attendees: shuffle(people).slice(0, Math.min(people.length, 6)),
      lines: { en: shuffle(MINUTE_LINES.en).slice(0, 8), fr: shuffle(MINUTE_LINES.fr).slice(0, 3), ja: shuffle(MINUTE_LINES.ja).slice(0, 3) } }
  })
  if (!meetings.some((m) => m.outcome === 'postponed')) meetings[0].outcome = 'postponed'

  const incidents = Array.from({ length: counts.incidents }, (_, i) => {
    const office = pick(OFFICES)
    const lang = office.lang !== 'en' && chance(office.lang === 'fr' ? 0.6 : 0.75) ? office.lang : 'en'
    return { id: `IR-${5000 + i * 7 + int(0, 6)}`, office, lang, day: 400 + int(0, 1400), cause: pick(CAUSES), cost: int(3, 900) * 100, injured: chance(0.75) ? 0 : int(1, 3),
      lines: shuffle(INCIDENT_LINES[/** @type {'en'} */ (lang)]).slice(0, lang === 'en' ? 5 : 3) }
  }).sort((a, b) => a.day - b.day)

  const policies = shuffle(POLICY_FACTS).slice(0, Math.min(counts.policies, POLICY_FACTS.length)).map((fact, i) => ({ ...fact, value: pick(fact.values), heading: `Policy ${i + 1}: ${fact.title}` }))
  const emails = Array.from({ length: counts.emails }, () => ({ from: pick(people), org: pick(orgs), day: 700 + int(0, 1100), subject: pick(SUBJECTS), lines: shuffle(EMAIL_LINES).slice(0, int(2, 5)),
    contract: chance(0.4) ? pick(contracts).code : null, invoice: chance(0.3) && invoices.length ? pick(invoices).id : null }))

  const world = { people, orgs, contracts, amendments, invoices, skus, priceChanges, meetings, incidents, policies, emails }
  const sections = render(world, counts, r)
  const questions = ask(world, sections, size, seed, r, { byId, contractByCode })
  return { seed, size, world, sections, questions }
}

// ─── Documents ───────────────────────────────────────────────────────────────

/** @param {any} world @param {typeof SIZES['s']} counts @param {() => number} r @returns {Section[]} */
function render(world, counts, r) {
  const { pick, shuffle } = helpers(r)
  /** @type {Section[]} */
  const sections = []

  sections.push({ id: 'directory', title: 'Staff directory', file: 'Staff directory.xlsx', blocks: [
    { kind: 'h1', text: 'Staff directory' },
    { kind: 'table', header: ['ID', 'Name', 'Office', 'Department', 'Title', 'Manager', 'Start', 'Ext.'], rows: world.people.map((/** @type {any} */ p) => [p.id, p.name, p.office.city, p.department, p.title[0], p.manager || '—', iso(p.start), p.ext]) },
  ] })

  sections.push({ id: 'customers', title: 'Customers and suppliers', file: 'Customers.csv', blocks: [
    { kind: 'h1', text: 'Customers and suppliers' },
    { kind: 'table', header: ['Code', 'Name', 'Country', 'Sector', 'Since'], rows: world.orgs.map((/** @type {any} */ o) => [o.code, o.name, o.country, o.sector, String(o.since)]) },
  ] })

  /** @type {Block[]} */
  const contractBlocks = [{ kind: 'h1', text: 'Contracts' }]
  for (const c of world.contracts) contractBlocks.push({ kind: 'break' }, ...contract(c, counts, pick, shuffle))
  contractBlocks.push({ kind: 'break' }, { kind: 'h1', text: 'Amendments' })
  for (const a of [...world.amendments].sort((x, y) => x.day - y.day)) contractBlocks.push(...amendment(a, world))
  sections.push({ id: 'contracts', title: 'Contracts', file: 'Contracts.pdf', blocks: contractBlocks })

  sections.push({ id: 'ledger', title: 'Invoice ledger', file: 'Invoices.xlsx', blocks: [
    { kind: 'break' }, { kind: 'h1', text: 'Invoice ledger' },
    { kind: 'table', header: ['Invoice', 'Date', 'Customer', 'Amount (EUR)', 'Status'], rows: world.invoices.map((/** @type {any} */ i) => [i.id, iso(i.day), i.org.name, euros(i.amount), i.status]) },
  ] })

  sections.push({ id: 'prices', title: 'Price list', file: 'Price list.xlsx', blocks: [
    { kind: 'break' }, { kind: 'h1', text: 'Price list' },
    { kind: 'table', header: ['SKU', 'Product', 'Unit', 'Price (EUR)'], rows: world.skus.map((/** @type {any} */ s) => [s.code, s.name, s.unit, euros(s.price)]) },
  ] })

  /** @type {Block[]} */
  const bulletins = [{ kind: 'break' }, { kind: 'h1', text: 'Price bulletins' }]
  for (let b = 0; b < counts.bulletins; b++) {
    const changes = world.priceChanges.filter((/** @type {any} */ c) => c.bulletin === b)
    if (!changes.length) continue
    bulletins.push({ kind: 'h2', text: `Price bulletin ${b + 1} of ${iso(changes[0].day)}` }, ...changes.map((/** @type {any} */ c) => {
      const sku = world.skus.find((/** @type {any} */ s) => s.code === c.code)
      return { kind: /** @type {const} */ ('p'), text: `From ${longDate(c.day, 'en')}, ${sku.name} (${sku.code}) costs EUR ${euros(c.price)} per ${sku.unit}.` }
    }))
  }
  sections.push({ id: 'bulletins', title: 'Price bulletins', file: 'Price bulletins.pptx', blocks: bulletins })

  /** @type {Block[]} */
  const minutes = [{ kind: 'break' }, { kind: 'h1', text: 'Board minutes' }]
  for (const m of world.meetings) minutes.push({ kind: 'break' }, ...meeting(m, world, pick))
  sections.push({ id: 'minutes', title: 'Board minutes', file: 'Board minutes.docx', blocks: minutes })

  /** @type {Block[]} */
  const reports = [{ kind: 'break' }, { kind: 'h1', text: 'Incident reports' }]
  for (const i of world.incidents) reports.push({ kind: 'break' }, ...incident(i))
  sections.push({ id: 'incidents', title: 'Incident reports', file: 'Incident reports.pdf', blocks: reports })

  sections.push({ id: 'policies', title: 'Policies', file: 'Policies.docx', blocks: [{ kind: 'break' }, { kind: 'h1', text: 'Company policies' }, ...world.policies.flatMap((/** @type {any} */ p) => [
    { kind: /** @type {const} */ ('h2'), text: p.heading },
    { kind: /** @type {const} */ ('p'), text: `This policy applies to all ${COMPANY} sites and employees. ${p.evidence(p.value)} Questions about it go to the human resources department.` },
  ])] })

  sections.push({ id: 'correspondence', title: 'Correspondence', file: 'Correspondence.txt', blocks: [{ kind: 'break' }, { kind: 'h1', text: 'Correspondence' }, ...world.emails.flatMap((/** @type {any} */ e) => [
    { kind: /** @type {const} */ ('h3'), text: `${e.subject} — ${e.org.name}, ${iso(e.day)}` },
    { kind: /** @type {const} */ ('p'), text: `From ${e.from.name} (${e.from.office.city}). ${e.lines.join(' ')}${e.contract ? ` This concerns contract ${e.contract}.` : ''}${e.invoice ? ` See invoice ${e.invoice}.` : ''}` },
  ])] })
  return sections
}

/** A contract, written in its language, its facts worded one of several ways. @param {any} c @param {typeof SIZES['s']} counts @param {any} pick @param {any} shuffle @returns {Block[]} */
function contract(c, counts, pick, shuffle) {
  const [kind, kindFr, kindJa, kindAr] = c.kind
  const start = longDate(c.start, c.lang)
  const fill = shuffle(BOILERPLATE[c.lang]).slice(0, Math.min(BOILERPLATE[c.lang].length, c.filler * 2))
  const paragraphs = []
  for (let i = 0; i < fill.length; i += 2) paragraphs.push(fill.slice(i, i + 2).join(' '))
  const signed = `${c.signer.name} (${c.signer.id})`
  const li = { en: 0, fr: 1, ja: 2, ar: 3 }[/** @type {'en'} */ (c.lang)]
  const heads = { en: [['Schedule 1 — Rates', 'Service', 'Unit', 'Rate (EUR)'], ['Schedule 2 — Service levels', 'Indicator', 'Target']], fr: [['Annexe 1 — Tarifs', 'Prestation', 'Unité', 'Tarif (EUR)'], ['Annexe 2 — Niveaux de service', 'Indicateur', 'Objectif']],
    ja: [['別紙1 — 料金表', 'サービス', '単位', '料金(EUR)'], ['別紙2 — サービス水準', '指標', '目標']], ar: [['الملحق 1 — الأسعار', 'الخدمة', 'الوحدة', 'السعر (يورو)'], ['الملحق 2 — مستويات الخدمة', 'المؤشر', 'الهدف']] }[/** @type {'en'} */ (c.lang)]
  /** @type {Block[]} */
  const schedules = [
    { kind: 'h3', text: heads[0][0], lang: c.lang }, { kind: 'table', lang: c.lang, header: heads[0].slice(1), rows: c.rates.map((/** @type {any} */ x) => [x.service[li], x.service[4], euros(x.rate)]) },
    { kind: 'h3', text: heads[1][0], lang: c.lang }, { kind: 'table', lang: c.lang, header: heads[1].slice(1), rows: c.levels.map((/** @type {any} */ x) => [x.names[li], `${x.value}${x.unit === '%' ? '%' : ' h'}`]) },
  ]
  if (c.lang === 'fr') {
    return [
      { kind: 'h2', text: `Contrat ${c.code} — contrat de ${kindFr} entre ${COMPANY} et ${c.org.name}`, lang: 'fr' },
      { kind: 'p', lang: 'fr', text: `Le présent contrat de ${kindFr} est conclu entre ${COMPANY} SA, immatriculée à Lyon, et ${c.org.name}, immatriculée en ${c.org.country}.` },
      { kind: 'p', lang: 'fr', text: `Il prend effet le ${start} pour une durée initiale de ${c.term} mois${c.renewal ? ', renouvelable tacitement par périodes de douze mois' : ''}.` },
      { kind: 'p', lang: 'fr', text: `Chaque partie peut résilier le contrat moyennant un préavis écrit de ${MOTS[/** @type {keyof typeof MOTS} */ (c.notice)]} (${c.notice}) jours.` },
      ...(c.penalty !== null ? [{ kind: /** @type {const} */ ('p'), lang: 'fr', text: `Tout retard de paiement entraîne une pénalité de ${String(c.penalty).replace('.', ',')} % par mois.` }] : []),
      ...paragraphs.map((text) => ({ kind: /** @type {const} */ ('p'), lang: 'fr', text })),
      { kind: 'p', lang: 'fr', text: `Le contrat est régi par le droit applicable à ${c.law}. Signé pour ${COMPANY} par ${signed}, le ${start}.` },
      ...schedules,
    ]
  }
  if (c.lang === 'ja') {
    return [
      { kind: 'h2', text: `契約 ${c.code} — ${COMPANY}と${c.org.name}の${kindJa}契約`, lang: 'ja' },
      { kind: 'p', lang: 'ja', text: `本${kindJa}契約は、${COMPANY}と${c.org.name}との間で締結される。` },
      { kind: 'p', lang: 'ja', text: `本契約は${start}に発効し、当初の期間は${c.term}か月とする。` },
      { kind: 'p', lang: 'ja', text: `各当事者は、${c.notice}日前までに書面で通知することにより本契約を解約することができる。` },
      ...(c.penalty !== null ? [{ kind: /** @type {const} */ ('p'), lang: 'ja', text: `支払遅延には月${c.penalty}%の違約金が課される。` }] : []),
      ...paragraphs.map((text) => ({ kind: /** @type {const} */ ('p'), lang: 'ja', text })),
      { kind: 'p', lang: 'ja', text: `本契約の準拠法は${c.law}の法とする。${COMPANY}を代表して${signed}が${start}に署名した。` },
      ...schedules,
    ]
  }
  if (c.lang === 'ar') {
    const n = c.code.endsWith('3') || c.code.endsWith('7') ? indic(String(c.notice)) : String(c.notice)
    return [
      { kind: 'h2', text: `العقد ${c.code} — عقد ${kindAr} بين ${COMPANY} و${c.org.name}`, lang: 'ar' },
      { kind: 'p', lang: 'ar', text: `أبرم عقد ${kindAr} هذا بين ${COMPANY} و${c.org.name}.` },
      { kind: 'p', lang: 'ar', text: `يسري هذا العقد اعتبارا من ${start} لمدة أولية قدرها ${c.term} شهرا.` },
      { kind: 'p', lang: 'ar', text: `يجوز لأي من الطرفين إنهاء العقد بإشعار كتابي مدته ${n} يوما.` },
      ...(c.penalty !== null ? [{ kind: /** @type {const} */ ('p'), lang: 'ar', text: `يترتب على كل تأخير في الدفع غرامة قدرها ${c.penalty} بالمئة شهريا.` }] : []),
      ...paragraphs.map((text) => ({ kind: /** @type {const} */ ('p'), lang: 'ar', text })),
      { kind: 'p', lang: 'ar', text: `يخضع هذا العقد لقانون ${c.law}. وقعه عن ${COMPANY} ${signed} بتاريخ ${start}.` },
      ...schedules,
    ]
  }
  const notice = [
    `Either party may terminate this Agreement by giving ${WORDS[/** @type {keyof typeof WORDS} */ (c.notice)]} (${c.notice}) days' written notice to the other.`,
    `Termination requires prior written notice of ${c.notice} days.`,
    `A notice period of ${c.notice} days applies to any termination of this Agreement.`,
  ][c.variant]
  const term = [`The Agreement takes effect on ${start} and runs for an initial term of ${c.term} months.`, `It enters into force on ${start} for an initial period of ${c.term} months.`, `The initial duration is ${c.term} months, starting ${start}.`][c.variant]
  return [
    { kind: 'h2', text: `Contract ${c.code} — ${kind} agreement between ${COMPANY} and ${c.org.name}` },
    { kind: 'p', text: `This ${kind.toLowerCase()} agreement (the "Agreement") is entered into by ${COMPANY} SA, registered in Lyon, and ${c.org.name}, registered in ${c.org.country}.` },
    { kind: 'h3', text: 'Term and termination' },
    { kind: 'p', text: `${term}${c.renewal ? ' It renews automatically for successive periods of twelve months unless terminated.' : ' It does not renew automatically.'} ${notice}` },
    ...(c.penalty !== null ? [{ kind: /** @type {const} */ ('h3'), text: 'Payment' }, { kind: /** @type {const} */ ('p'), text: `Invoices are due within thirty days. Late payment bears a penalty of ${c.penalty}% per month on the outstanding amount.` }] : [{ kind: /** @type {const} */ ('h3'), text: 'Payment' }, { kind: /** @type {const} */ ('p'), text: 'Invoices are due within thirty days of issue.' }]),
    { kind: 'h3', text: 'General terms' },
    ...paragraphs.map((text) => ({ kind: /** @type {const} */ ('p'), text })),
    { kind: 'p', text: `This Agreement is governed by the laws applicable in ${c.law}.` },
    { kind: 'p', text: `Signed for ${COMPANY} by ${signed}, ${c.signer.title[0]}, on ${start}.` },
    ...schedules,
  ]
}

/** @param {any} a @param {any} world @returns {Block[]} */
function amendment(a, world) {
  const c = world.contracts.find((/** @type {any} */ x) => x.code === a.code)
  const change = a.field === 'notice' ? `the notice period for termination is changed to ${a.value} days` : `the late payment penalty is changed to ${a.value}% per month`
  return [
    { kind: 'h2', text: `Amendment ${a.n} to contract ${a.code}` },
    { kind: 'p', text: `Agreed between ${COMPANY} and ${c.org.name} on ${longDate(a.day, 'en')}: with effect from that date, ${change}. All other terms remain unchanged.` },
  ]
}

const POSTPONED = {
  en: ['The board postponed the Rotterdam cross-dock expansion to a later meeting.', 'Discussion of the Rotterdam cross-dock expansion was deferred pending revised cost estimates.',
    'The Rotterdam cross-dock expansion was pushed back by one quarter.', 'Directors agreed to put the Rotterdam cross-dock expansion on hold for now.', 'A decision on the Rotterdam cross-dock expansion was delayed until the next financial year.'],
  fr: ["Le conseil a reporté le projet d'extension du cross-dock de Rotterdam."],
  ja: ['ロッテルダムのクロスドック拡張計画の決定は延期された。'],
}
const OTHER_OUTCOMES = {
  approved: { en: 'The board approved the next phase of the Rotterdam cross-dock expansion.', fr: "Le conseil a approuvé la phase suivante de l'extension du cross-dock de Rotterdam.", ja: 'ロッテルダムのクロスドック拡張計画の次の段階が承認された。' },
  noted: { en: 'An update on the Rotterdam cross-dock expansion was presented; no decision was taken.', fr: "Un point sur l'extension du cross-dock de Rotterdam a été présenté, sans décision.", ja: 'ロッテルダムのクロスドック拡張計画について報告があったが、決定はなかった。' },
}

/** @param {any} m @param {any} world @param {any} pick @returns {Block[]} */
function meeting(m, world, pick) {
  const lang = m.lang
  const date = longDate(m.day, lang)
  const who = m.attendees.map((/** @type {any} */ p) => p.name).join(', ')
  const project = m.outcome === 'postponed' ? POSTPONED[/** @type {keyof typeof POSTPONED} */ (lang)][m.variant % POSTPONED[/** @type {keyof typeof POSTPONED} */ (lang)].length] : m.outcome ? OTHER_OUTCOMES[/** @type {'approved' | 'noted'} */ (m.outcome)][/** @type {'en'} */ (lang)] : null
  const appointed = m.appointed
  if (lang === 'fr') {
    return [
      { kind: 'h2', lang, text: `Réunion du conseil d'administration du ${date}` },
      { kind: 'p', lang, text: `Présents : ${who}. Le procès-verbal de la séance précédente est approuvé à l'unanimité.` },
      { kind: 'p', lang, text: `Le directeur financier présente les résultats du trimestre et les prévisions de trésorerie. Les volumes progressent sur les sites de ${pick(OFFICES).local} et de ${pick(OFFICES).local}.` },
      ...(project ? [{ kind: /** @type {const} */ ('p'), lang, text: project }] : []),
      { kind: 'p', lang, text: m.lines.fr.join(' ') },
      { kind: 'p', lang, text: `Le conseil nomme ${appointed.name} au poste de ${appointed.title[1]} pour le site de ${appointed.office.local}.` },
    ]
  }
  if (lang === 'ja') {
    return [
      { kind: 'h2', lang, text: `${date}取締役会議事録` },
      { kind: 'p', lang, text: `出席者：${who}。前回の議事録が全会一致で承認された。` },
      { kind: 'p', lang, text: `財務責任者が四半期の業績と資金繰りの見通しを報告した。${pick(OFFICES).local}拠点の取扱量が増加している。` },
      ...(project ? [{ kind: /** @type {const} */ ('p'), lang, text: project }] : []),
      { kind: 'p', lang, text: m.lines.ja.join('') },
      { kind: 'p', lang, text: `取締役会は${appointed.name}を${appointed.office.local}拠点の${appointed.title[2]}に任命した。` },
    ]
  }
  return [
    { kind: 'h2', text: `Board meeting of ${date}` },
    { kind: 'p', text: `Present: ${who}. The minutes of the previous meeting were approved unanimously.` },
    { kind: 'p', text: `The chief financial officer presented the quarterly results and the cash forecast. Volumes grew at the ${pick(OFFICES).city} and ${pick(OFFICES).city} sites, while costs at ${pick(OFFICES).city} remained above budget.` },
    ...(project ? [{ kind: /** @type {const} */ ('p'), text: project }] : []),
    { kind: 'p', text: m.lines.en.slice(0, 4).join(' ') },
    { kind: 'p', text: m.lines.en.slice(4).join(' ') },
    { kind: 'p', text: `The board appointed ${appointed.name} as ${appointed.title[0]} for the ${appointed.office.city} site.` },
  ]
}

/** @param {any} i @returns {Block[]} */
function incident(i) {
  const date = longDate(i.day, i.lang)
  const cost = euros(i.cost)
  if (i.lang === 'fr') {
    return [
      { kind: 'h2', lang: 'fr', text: `Rapport d'incident ${i.id} — site de ${i.office.local}` },
      { kind: 'p', lang: 'fr', text: `Le ${date}, un incident de type ${i.cause.category[1]} s'est produit sur le site de ${i.office.local}. Il a été causé par ${i.cause.fr}.` },
      { kind: 'p', lang: 'fr', text: `Blessés : ${i.injured}. Coût estimé : ${cost} EUR. Les mesures correctives ont été validées par le responsable sécurité du site.` },
      { kind: 'p', lang: 'fr', text: i.lines.join(' ') },
    ]
  }
  if (i.lang === 'ja') {
    return [
      { kind: 'h2', lang: 'ja', text: `事故報告書 ${i.id} — ${i.office.local}拠点` },
      { kind: 'p', lang: 'ja', text: `${date}、${i.office.local}拠点で${i.cause.category[2]}が発生した。原因は${i.cause.ja}である。` },
      { kind: 'p', lang: 'ja', text: `負傷者：${i.injured}名。推定費用：${cost}ユーロ。是正措置は拠点の安全管理者により承認された。` },
      { kind: 'p', lang: 'ja', text: i.lines.join('') },
    ]
  }
  if (i.lang === 'ar') {
    return [
      { kind: 'h2', lang: 'ar', text: `تقرير الحادث ${i.id} — موقع ${i.office.local}` },
      { kind: 'p', lang: 'ar', text: `بتاريخ ${date} وقع حادث من نوع ${i.cause.category[3]} في موقع ${i.office.local}. وكان سببه ${i.cause.ar}.` },
      { kind: 'p', lang: 'ar', text: `عدد المصابين: ${i.injured}. التكلفة التقديرية: ${cost} يورو. وافق مسؤول السلامة في الموقع على الإجراءات التصحيحية.` },
      { kind: 'p', lang: 'ar', text: i.lines.join(' ') },
    ]
  }
  return [
    { kind: 'h2', text: `Incident report ${i.id} — ${i.office.city} site` },
    { kind: 'p', text: `On ${date}, a ${i.cause.category[0]} occurred at the ${i.office.city} site. It was caused by ${i.cause.en}.` },
    { kind: 'p', text: `Injured: ${i.injured}. Estimated cost: EUR ${cost}. Corrective actions were approved by the site safety officer.` },
    { kind: 'p', text: i.lines.join(' ') },
  ]
}

// ─── Questions ───────────────────────────────────────────────────────────────

/**
 * @param {any} world @param {Section[]} sections @param {keyof typeof SIZES} size @param {number} seed @param {() => number} r
 * @param {{ byId: Map<string, any>, contractByCode: Map<string, any> }} maps
 * @returns {Question[]}
 */
function ask(world, sections, size, seed, r, { byId, contractByCode }) {
  const { pick, shuffle } = helpers(r)
  const limits = QUESTIONS[size]
  /** @type {Question[]} */
  const out = []
  /** @param {Kind} type @param {Omit<Question, 'id' | 'type' | 'split'>} q */
  const add = (type, q) => {
    if (out.filter((x) => x.type === type).length >= limits[type]) return
    const id = `${seed}-${size}-${type}-${out.filter((x) => x.type === type).length + 1}`
    out.push({ id, type, split: splitOf(id), ...q })
  }
  const title = (/** @type {any} */ c) => c.lang === 'fr' ? `Contrat ${c.code} —` : c.lang === 'ja' ? `契約 ${c.code} —` : c.lang === 'ar' ? `العقد ${c.code} —` : `Contract ${c.code} —`
  const amended = new Set(world.amendments.map((/** @type {any} */ a) => a.code))
  const row = (/** @type {any} */ p) => ({ anchor: `${p.id} ${p.name}`, within: 160 })
  const english = shuffle(world.contracts.filter((/** @type {any} */ c) => c.lang === 'en' && !amended.has(c.code)))

  // lookup: a fact of a contract, an employee's extension, a product's price.
  for (const c of english) {
    const n = out.length % 3
    if (n === 0) add('lookup', { lang: 'en', text: `What notice period applies to terminating contract ${c.code}?`, answer: { kind: 'number', value: c.notice }, evidence: [{ anchor: title(c), quote: String(c.notice) + (c.variant === 0 ? ') days' : ' days') }] })
    else if (n === 1) add('lookup', { lang: 'en', text: `Under the laws of which city is contract ${c.code} governed?`, answer: { kind: 'text', value: c.law, accept: [c.law] }, evidence: [{ anchor: title(c), quote: `governed by the laws applicable in ${c.law}` }] })
    else add('lookup', { lang: 'en', text: `How many months is the initial term of contract ${c.code}?`, answer: { kind: 'number', value: c.term }, evidence: [{ anchor: title(c), quote: `${c.term} months` }] })
  }
  for (const c of english.slice(-Math.ceil(english.length / 3))) {
    const { service, rate } = c.rates[0]
    add('lookup', { lang: 'en', text: `What rate does contract ${c.code} set for ${service[0].toLowerCase()}, per ${service[4]}?`, answer: { kind: 'number', value: rate, tolerance: 0.005 }, evidence: [{ anchor: title(c), quote: `${service[0]} ${service[4]} ${euros(rate)}` }] })
  }
  for (const p of shuffle(world.people).slice(0, 10)) add('lookup', { lang: 'en', text: `What is ${p.name}'s phone extension?`, answer: { kind: 'number', value: Number(p.ext) }, evidence: [{ ...row(p), quote: `${iso(p.start)} ${p.ext}` }] })
  const changed = new Set(world.priceChanges.map((/** @type {any} */ c) => c.code))
  for (const s of shuffle(world.skus.filter((/** @type {any} */ s) => !changed.has(s.code))).slice(0, 6)) add('lookup', { lang: 'en', text: `What does one ${s.unit} of ${s.name} cost?`, answer: { kind: 'number', value: s.price, tolerance: 0.005 }, evidence: [{ anchor: s.code, quote: euros(s.price), within: 120 }] })

  // paraphrase: a policy's fact, asked in other words.
  for (const p of world.policies) add('paraphrase', { lang: 'en', text: p.question(p.value), answer: p.id === 'travel-class' ? { kind: 'text', value: 'premium economy', accept: ['premium economy'] } : { kind: 'number', value: p.value }, evidence: [{ anchor: p.heading, quote: p.evidence(p.value) }] })

  // filter: who holds a title in an office, when only one does.
  /** @type {Map<string, any[]>} */
  const holders = new Map()
  const key = (/** @type {any} */ p) => `${p.office.city}|${p.title[0]}|${iso(p.start).slice(0, 4)}`
  for (const p of world.people) holders.set(key(p), [...(holders.get(key(p)) ?? []), p])
  const unique = shuffle([...holders.values()].filter((list) => list.length === 1).map((list) => list[0]).filter((p) => p !== world.people[0]))
  for (const p of unique.filter((_, i) => i % 3 !== 2)) add('filter', { lang: 'en', text: `Who is the ${p.title[0]} at the ${p.office.city} office who joined in ${iso(p.start).slice(0, 4)}?`, answer: { kind: 'text', value: p.name, accept: [p.name] }, evidence: [{ ...row(p), quote: `${p.title[0]} ${p.manager || '—'} ${iso(p.start)}` }] })

  // aggregate: a customer's invoices in a year, every row needed.
  /** @type {Map<string, any[]>} */
  const byYear = new Map()
  for (const i of world.invoices) byYear.set(`${i.org.name}|${iso(i.day).slice(0, 4)}`, [...(byYear.get(`${i.org.name}|${iso(i.day).slice(0, 4)}`) ?? []), i])
  for (const [key, list] of shuffle([...byYear.entries()].filter(([, list]) => list.length >= 2 && list.length <= 25))) {
    const [org, year] = key.split('|')
    const total = Math.round(list.reduce((sum, i) => sum + i.amount, 0) * 100) / 100
    add('aggregate', { lang: 'en', text: `What is the total amount invoiced to ${org} in ${year}?`, answer: { kind: 'number', value: total, tolerance: 0.01 }, evidence: list.map((i) => ({ anchor: `${i.id} ${iso(i.day)}`, quote: euros(i.amount), within: 120 })) })
  }

  // multihop: the manager of whoever signed a contract.
  for (const c of shuffle(world.contracts.filter((/** @type {any} */ c) => c.lang === 'en'))) {
    const signer = c.signer
    const manager = byId.get(signer.manager)
    if (!manager) continue
    add('multihop', { lang: 'en', text: `Who is the manager of the person who signed contract ${c.code} for ${COMPANY}?`, answer: { kind: 'text', value: manager.name, accept: [manager.name] },
      evidence: [{ anchor: title(c), quote: `${signer.name} (${signer.id})` }, { ...row(signer), quote: manager.id }, { ...row(manager), quote: manager.name }] })
  }

  // temporal: what an amendment changed last, and the latest price.
  for (const code of shuffle([...amended])) {
    const notices = world.amendments.filter((/** @type {any} */ a) => a.code === code && a.field === 'notice')
    const last = notices.at(-1)
    if (!last) continue
    const c = contractByCode.get(code)
    add('temporal', { lang: 'en', text: `What notice period currently applies to terminating contract ${code}?`, answer: { kind: 'number', value: last.value },
      evidence: [{ anchor: `Amendment ${last.n} to contract ${code}`, quote: `changed to ${last.value} days` }], distractors: [{ anchor: title(c), quote: `${c.notice}` }] })
  }
  for (const code of shuffle([...changed])) {
    const last = world.priceChanges.filter((/** @type {any} */ c) => c.code === code).at(-1)
    const sku = world.skus.find((/** @type {any} */ s) => s.code === code)
    add('temporal', { lang: 'en', text: `What is the current price of one ${sku.unit} of ${sku.name}?`, answer: { kind: 'number', value: last.price, tolerance: 0.005 },
      evidence: [{ anchor: `Price bulletin ${last.bulletin + 1} of`, quote: `(${code}) costs EUR ${euros(last.price)}` }], distractors: [{ anchor: code, quote: euros(sku.price), within: 120 }] })
  }

  // crosslingual: English questions about French, Japanese and Arabic text, and the other way round,
  // each kind held to its share so that all three are asked.
  const share = (/** @type {number} */ part) => Math.max(1, Math.round(limits.crosslingual * part))
  let quota = share(0.45)
  const foreign = shuffle(world.incidents.filter((/** @type {any} */ i) => i.lang !== 'en'))
  for (const i of foreign) {
    if (quota-- <= 0) break
    const quote = i.cause[/** @type {'fr'} */ (i.lang)]
    const byCode = out.filter((q) => q.type === 'crosslingual').length % 2 === 0
    add('crosslingual', { lang: 'en', text: byCode ? `What caused incident ${i.id}?` : `What caused the ${i.cause.category[0]} at the ${i.office.city} site on ${iso(i.day)}?`,
      answer: { kind: 'text', value: i.cause.en, accept: i.cause.accept }, evidence: [{ anchor: i.id, quote, within: 600 }] })
  }
  quota = share(0.2)
  for (const c of shuffle(world.contracts.filter((/** @type {any} */ c) => c.lang !== 'en' && !amended.has(c.code)))) {
    if (quota-- <= 0) break
    add('crosslingual', { lang: 'en', text: `What notice period applies to terminating contract ${c.code}?`, answer: { kind: 'number', value: c.notice }, evidence: [{ anchor: title(c), quote: c.lang === 'ar' ? `${c.notice} يوما` : c.lang === 'ja' ? `${c.notice}日前` : `(${c.notice}) jours` }] })
  }
  const year = (/** @type {any} */ p) => iso(p.start).slice(0, 4)
  const asked = { fr: (/** @type {any} */ p) => `Qui est ${p.title[1]} sur le site de ${p.office.local}, arrivé en ${year(p)} ?`, ja: (/** @type {any} */ p) => `${year(p)}年に入社した${p.office.local}拠点の${p.title[2]}は誰ですか。`, ar: (/** @type {any} */ p) => `من هو ${p.title[3]} في موقع ${p.office.local} الذي انضم في ${year(p)}؟` }
  for (const [n, p] of unique.filter((_, i) => i % 3 === 2).entries()) {
    const lang = /** @type {'fr' | 'ja' | 'ar'} */ (['fr', 'ja', 'ar'][n % 3])
    add('crosslingual', { lang, text: asked[lang](p), answer: { kind: 'text', value: p.name, accept: [p.name] }, evidence: [{ ...row(p), quote: `${p.title[0]} ${p.manager || '—'} ${iso(p.start)}` }] })
  }

  // negative: a code that doesn't exist (one digit away from one that does), a clause a contract lacks, someone who isn't there.
  const codes = new Set(world.contracts.map((/** @type {any} */ c) => c.code))
  for (const c of shuffle(world.contracts)) {
    const near = [`C-${c.code.slice(2, 5)}${(Number(c.code[5]) + 1) % 10}`, `C-${c.code[2]}${(Number(c.code[3]) + 1) % 10}${c.code.slice(4)}`].find((code) => !codes.has(code) && Number(code.slice(2)) >= 1000)
    if (near) add('negative', { lang: 'en', text: `What notice period applies to terminating contract ${near}?`, answer: { kind: 'none' }, evidence: [], absent: [near] })
    if (c.penalty === null && c.lang === 'en') add('negative', { lang: 'en', text: `What late-payment penalty does contract ${c.code} set?`, answer: { kind: 'none' }, evidence: [], absent: [] })
  }
  const present = new Set(world.people.map((/** @type {any} */ p) => p.name))
  for (const name of shuffle(GIVEN.flatMap((g) => FAMILY.map((f) => `${g} ${f}`))).filter((name) => !present.has(name)).slice(0, 6)) add('negative', { lang: 'en', text: `What is ${name}'s phone extension?`, answer: { kind: 'none' }, evidence: [], absent: [name] })

  // global: everything the board put off, incidents counted at a site in a year.
  const postponed = world.meetings.filter((/** @type {any} */ m) => m.outcome === 'postponed')
  const meetingTitle = (/** @type {any} */ m) => m.lang === 'fr' ? `Réunion du conseil d'administration du ${longDate(m.day, 'fr')}` : m.lang === 'ja' ? `${longDate(m.day, 'ja')}取締役会議事録` : `Board meeting of ${longDate(m.day, 'en')}`
  add('global', { lang: 'en', text: 'How many times did the board postpone or defer the Rotterdam cross-dock expansion?', answer: { kind: 'number', value: postponed.length },
    evidence: postponed.map((/** @type {any} */ m) => ({ anchor: meetingTitle(m), quote: POSTPONED[/** @type {keyof typeof POSTPONED} */ (m.lang)][m.variant % POSTPONED[/** @type {keyof typeof POSTPONED} */ (m.lang)].length] })) })
  /** @type {Map<string, any[]>} */
  const atSite = new Map()
  for (const i of world.incidents) atSite.set(`${i.office.city}|${iso(i.day).slice(0, 4)}`, [...(atSite.get(`${i.office.city}|${iso(i.day).slice(0, 4)}`) ?? []), i])
  for (const [key, list] of shuffle([...atSite.entries()].filter(([, list]) => list.length >= 1 && list.length <= 30))) {
    const [city, year] = key.split('|')
    add('global', { lang: 'en', text: `How many incidents were reported at the ${city} site in ${year}?`, answer: { kind: 'number', value: list.length }, evidence: list.map((i) => ({ anchor: i.id, quote: i.id, within: 20 })) })
  }
  return out
}

// ─── Layouts ─────────────────────────────────────────────────────────────────

/**
 * The files a layout makes: one compendium holding every section, or a project of a file per kind.
 * @param {Section[]} sections @param {'compendium' | 'project'} layout @param {string} [ext] the compendium's format
 * @returns {{ name: string, blocks: Block[] }[]}
 */
export function files(sections, layout, ext = 'md') {
  if (layout === 'compendium') return [{ name: `${COMPANY} compendium.${ext}`, blocks: [{ kind: 'h1', text: `${COMPANY} — compendium` }, ...sections.flatMap((section) => section.blocks)] }]
  /** @type {Map<string, Block[]>} */
  const byFile = new Map()
  for (const section of sections) byFile.set(section.file, [...(byFile.get(section.file) ?? []), ...section.blocks])
  return [...byFile.entries()].map(([name, blocks]) => ({ name, blocks: blocks.filter((block, i) => block.kind !== 'break' || i > 0) }))
}
