// What a person shares with a brief of set.json, made when npm run sites runs, never committed: six photographs drawn as
// scenes (stand-ins for a photographer's own), and a CV as a Word file in the brief's language.
import JSZip from 'jszip'
import sharp from 'sharp'

/** @typedef {{ name: string, bytes: Uint8Array }} Shared */

const W = 1600, H = 1067

/** A scene: its sky from top to horizon, a sun or moon, and layers of land, sea or town drawn over it. */
const SCENES = [
  { name: 'harbour-at-dawn.jpg', sky: ['#f7b267', '#f4845f'], sun: ['#fff1c1', 1180, 520, 90], layers: [['#3d6e8f', 640, 30], ['#2d5873', 760, 22], ['#1f4258', 880, 16]], boats: true },
  { name: 'olive-grove.jpg', sky: ['#cfe8f3', '#fff6d6'], sun: ['#fffbe8', 300, 220, 70], layers: [['#a7c08a', 620, 60], ['#7f9f63', 760, 45], ['#5d7d46', 900, 30]], trees: true },
  { name: 'city-in-rain.jpg', sky: ['#5c6b7a', '#8a99a8'], layers: [['#3b4552', 900, 4]], town: true, rain: true },
  { name: 'desert-dunes.jpg', sky: ['#fde4b3', '#f6a85b'], sun: ['#fff5dc', 1250, 300, 110], layers: [['#e09a5c', 640, 90], ['#c97a3f', 780, 70], ['#a85f2c', 930, 50]] },
  { name: 'mountain-lake.jpg', sky: ['#9ec9f5', '#e9f4ff'], layers: [['#4f7fa8', 720, 6], ['#3e6a8e', 860, 4]], mountains: true },
  { name: 'night-market.jpg', sky: ['#10162f', '#2b2c5a'], sun: ['#f3f0d8', 260, 180, 50], layers: [['#1b1d33', 820, 8]], lights: true },
]

/** A wavy band from y to the bottom, its waves `swell` high. @param {string} fill @param {number} y @param {number} swell @param {number} seed */
const band = (fill, y, swell, seed) => {
  const points = Array.from({ length: 17 }, (_, i) => `${i * 100},${Math.round(y + Math.sin(i * 0.9 + seed) * swell)}`)
  return `<polygon fill="${fill}" points="0,${H} ${points.join(' ')} ${W},${H}"/>`
}

/** @param {typeof SCENES[number]} scene */
function draw(scene) {
  const parts = [`<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${scene.sky[0]}"/><stop offset="1" stop-color="${scene.sky[1]}"/></linearGradient></defs>`, `<rect width="${W}" height="${H}" fill="url(#sky)"/>`]
  if (scene.sun) parts.push(`<circle cx="${scene.sun[1]}" cy="${scene.sun[2]}" r="${scene.sun[3]}" fill="${scene.sun[0]}" opacity="0.9"/>`)
  if (scene.mountains) parts.push(`<polygon fill="#7c8fa6" points="0,720 260,340 480,560 760,260 1040,600 1260,380 1600,720"/>`, `<polygon fill="#f4f8fc" points="700,330 760,260 820,330 790,320 760,345 730,318"/>`)
  if (scene.town) for (let x = 0; x < W; x += 120) parts.push(`<rect x="${x + 6}" y="${420 + ((x * 37) % 260)}" width="108" height="${H}" fill="${x % 240 ? '#2c343f' : '#343e4b'}"/>`)
  scene.layers.forEach(([fill, y, swell], i) => parts.push(band(fill, y, swell, i * 1.7)))
  if (scene.trees) for (let x = 80; x < W; x += 180) parts.push(`<rect x="${x - 6}" y="${700 + (x % 3) * 30}" width="12" height="80" fill="#5b4632"/><circle cx="${x}" cy="${690 + (x % 3) * 30}" r="56" fill="#6f8f55"/>`)
  if (scene.boats) for (const x of [380, 820, 1300]) parts.push(`<polygon fill="#f4efe6" points="${x - 70},${790} ${x + 70},${790} ${x + 45},${825} ${x - 45},${825}"/><polygon fill="#ffffff" points="${x},${640} ${x},${785} ${x + 60},${785}"/>`)
  if (scene.rain) for (let i = 0; i < 160; i++) parts.push(`<line x1="${(i * 97) % W}" y1="${(i * 53) % H}" x2="${((i * 97) % W) - 14}" y2="${((i * 53) % H) + 40}" stroke="#c9d3dd" stroke-width="2" opacity="0.5"/>`)
  if (scene.lights) for (let i = 0; i < 40; i++) parts.push(`<circle cx="${40 + i * 40}" cy="${640 + Math.sin(i) * 30}" r="10" fill="${['#ffcf5c', '#ff8a5c', '#ffe9a8'][i % 3]}"/>`, `<rect x="${i * 160}" y="700" width="140" height="160" fill="${['#8c2f39', '#2f5d8c', '#7a6a2f'][i % 3]}"/>`)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${parts.join('')}</svg>`
}

/** @type {Promise<Shared[]> | null} */
let made = null
/** The six photographs. @returns {Promise<Shared[]>} */
export const photos = () => (made ??= Promise.all(SCENES.map(async (scene) => ({ name: scene.name, bytes: new Uint8Array(await sharp(Buffer.from(draw(scene))).jpeg({ quality: 80 }).toBuffer()) }))))

/** Someone's CV in each language: who, then their experience, education, skills and languages, as headings and lines. */
const CVS = {
  en: ['Maya Okafor', 'Product designer · Lisbon · maya.okafor@example.com',
    ['Experience', 'Senior product designer, Lumen Health, Lisbon, 2022 to now', 'Led the redesign of the patient app used by 400,000 people. Built the design system four teams share.',
      'Product designer, Tidewater Studio, London, 2018 to 2022', 'Designed booking flows for twelve clients in travel and retail. Ran tests with users every week.'],
    ['Education', 'MA Interaction Design, Northbridge School of Design, 2018', 'BA Graphic Design, University of Westhaven, 2016'],
    ['Skills', 'Figma, user research, prototyping, accessibility, design systems'],
    ['Languages', 'English (native), Portuguese (fluent), French (good)']],
  fr: ['Camille Laurent', 'Cheffe de projet événementiel · Lyon · camille.laurent@example.com',
    ['Expérience', 'Responsable des événements, Maison Arpège, Lyon, depuis 2021', 'Organise quarante événements par an, de 50 à 800 invités. A réduit de 15 % le coût des prestataires.',
      'Chargée de projet, Agence Coulisse, Paris, 2017 à 2021', 'A mené les lancements de produits de six marques. A coordonné des équipes de vingt personnes.'],
    ['Formation', 'Master Management de l’événementiel, Institut des Métiers de la Communication, 2017', 'Licence Information et communication, Université de Bellerive, 2015'],
    ['Compétences', 'Budgets, négociation avec les prestataires, logistique, gestion d’équipe, accessibilité des lieux'],
    ['Langues', 'Français (langue maternelle), anglais (courant), italien (intermédiaire)']],
  ar: ['ليلى حداد', 'محاسبة قانونية · عمّان · layla.haddad@example.com',
    ['الخبرة', 'محاسبة أولى، شركة الريان للتدقيق، عمّان، منذ 2020', 'تدقق حسابات خمس وعشرين شركة صغيرة ومتوسطة كل عام. أعدّت دليلًا داخليًا للتدقيق يستخدمه فريق من عشرة أشخاص.',
      'محاسبة، مؤسسة النخيل التجارية، إربد، من 2016 إلى 2020', 'أعدّت التقارير المالية الشهرية والسنوية. خفّضت وقت إقفال الحسابات من عشرة أيام إلى ستة.'],
    ['التعليم', 'بكالوريوس المحاسبة، جامعة الشمال، 2016', 'شهادة المحاسب القانوني، 2019'],
    ['المهارات', 'التدقيق، الضرائب، التقارير المالية، الجداول الإلكترونية، المعايير الدولية'],
    ['اللغات', 'العربية (اللغة الأم)، الإنجليزية (بطلاقة)']],
  ja: ['佐藤 美咲', 'ソフトウェアエンジニア · 福岡 · misaki.sato@example.com',
    ['職歴', 'シニアエンジニア、株式会社ミナト、福岡、2021年〜現在', '利用者30万人の予約アプリの開発を率いる。テストの自動化で不具合を4割減らした。',
      'エンジニア、株式会社ソラ、東京、2017年〜2021年', '小売向けの在庫管理システムを開発。新人5人の指導を担当。'],
    ['学歴', '九州工科大学 情報工学科 卒業、2017年'],
    ['スキル', 'TypeScript、Go、テスト設計、クラウド運用、アクセシビリティ'],
    ['語学', '日本語（母語）、英語（ビジネスレベル）']],
}

const xml = (/** @type {string} */ text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
/** A paragraph of Word's, bold and larger for a heading. @param {string} text @param {number} [size] half-points, for a heading */
const paragraph = (text, size) => `<w:p><w:r>${size ? `<w:rPr><w:b/><w:sz w:val="${size}"/></w:rPr>` : ''}<w:t xml:space="preserve">${xml(text)}</w:t></w:r></w:p>`

/** The CV as a Word file, in a language of set.json. @param {string} lang @returns {Promise<Shared>} */
export async function cv(lang) {
  const [name, line, ...parts] = CVS[/** @type {'en'} */ (lang)] ?? CVS.en
  const body = [paragraph(/** @type {string} */ (name), 36), paragraph(/** @type {string} */ (line)), ...parts.flatMap((part) => { const [heading, ...lines] = /** @type {string[]} */ (part); return [paragraph(heading, 28), ...lines.map((text) => paragraph(text))] })]
  const zip = new JSZip()
  zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
  zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body.join('')}</w:body></w:document>`)
  const names = { en: 'CV.docx', fr: 'CV.docx', ar: 'السيرة-الذاتية.docx', ja: '履歴書.docx' }
  return { name: names[/** @type {'en'} */ (lang)] ?? 'CV.docx', bytes: await zip.generateAsync({ type: 'uint8array' }) }
}

/** What a brief shares, by set.json's `files`. @param {string | undefined} kind @param {string} lang @returns {Promise<Shared[]>} */
export const sharedFor = async (kind, lang) => (kind === 'photos' ? photos() : kind === 'cv' ? [await cv(lang)] : [])
