// Brand material for a design system proposed from it (D740): eight brands made up for these tests, two in each of English,
// French, Arabic and Japanese, nothing from a client. Each has its logo (an SVG drawn to a PNG), its brand guide (a page printed
// to a PDF, or a Word file) and its site's home page (a page photographed at 1280 × 800), all set in faces this Mac has, so a
// guide's PDF holds them. What it really is, its colours and faces, is what a proposal is measured against (scripts/brands.js).
import { writeZip } from '../../app/core/zip.js'

/** @typedef {{ id: string, lang: 'en' | 'fr' | 'ar' | 'ja', name: string, tagline: string, primary: string, secondary: string, ink: string, paper: string, heading: string, body: string, guide: 'pdf' | 'docx', mark: 'circle' | 'square' | 'arch' | 'wave' }} Brand */

/** @type {Brand[]} */
export const BRANDS = [
  { id: 'northwind', lang: 'en', name: 'Northwind Rail', tagline: 'Trains that leave on time, every time.', primary: '#1D3557', secondary: '#E63946', ink: '#333333', paper: '#F1FAEE', heading: 'Futura', body: 'Georgia', guide: 'pdf', mark: 'circle' },
  { id: 'fernhill', lang: 'en', name: 'Fernhill Dental', tagline: 'Gentle care for the whole family.', primary: '#0F766E', secondary: '#F59E0B', ink: '#1F2937', paper: '#F3F4F6', heading: 'Avenir Next', body: 'Avenir Next', guide: 'docx', mark: 'arch' },
  { id: 'lumiere', lang: 'fr', name: 'Boulangerie Lumière', tagline: 'Le pain du matin, cuit au feu de bois.', primary: '#F7B500', secondary: '#4A2C17', ink: '#2B2B2B', paper: '#FFF8E7', heading: 'Didot', body: 'Gill Sans', guide: 'pdf', mark: 'circle' },
  { id: 'vasseur', lang: 'fr', name: 'Cabinet Vasseur Avocats', tagline: 'Le droit des affaires, avec clarté.', primary: '#7A1F3D', secondary: '#C9A227', ink: '#222222', paper: '#F5F1EA', heading: 'Baskerville', body: 'Optima', guide: 'docx', mark: 'square' },
  { id: 'waha', lang: 'ar', name: 'مؤسسة الواحة', tagline: 'نزرع المستقبل في قلب الصحراء.', primary: '#00843D', secondary: '#D8B56D', ink: '#1E1E1E', paper: '#FAF7F0', heading: 'Damascus', body: 'Geeza Pro', guide: 'pdf', mark: 'arch' },
  { id: 'noor', lang: 'ar', name: 'نور للتقنية', tagline: 'حلول رقمية تضيء أعمالك.', primary: '#5B2A86', secondary: '#00B4D8', ink: '#212121', paper: '#F4F4F8', heading: 'Al Bayan', body: 'Geeza Pro', guide: 'docx', mark: 'wave' },
  { id: 'sakura', lang: 'ja', name: 'さくら書店', tagline: '本との出会いを、街の角で。', primary: '#E5677D', secondary: '#7FB069', ink: '#3A3A3A', paper: '#FFF5F7', heading: 'Hiragino Mincho ProN', body: 'Hiragino Sans', guide: 'pdf', mark: 'circle' },
  { id: 'tokai', lang: 'ja', name: '東海ロジスティクス', tagline: '確実に、速く、届けます。', primary: '#0057B8', secondary: '#FF8C00', ink: '#222222', paper: '#F2F5FA', heading: 'Hiragino Sans', body: 'Hiragino Sans', guide: 'docx', mark: 'square' },
]

/** A guide's and a site's words, in each language. */
const WORDS = {
  en: { guide: 'Brand guidelines', intro: 'How our name, colours and type look wherever we appear.', colours: 'Colours', primary: 'Primary', secondary: 'Secondary', neutrals: 'Neutrals', ink: 'Text', paper: 'Background', type: 'Typography', headings: 'Headings', bodyText: 'Body text', logo: 'Logo', clear: 'Keep clear space around the logo equal to the height of its mark. Never stretch it or change its colours.', nav: ['Home', 'Services', 'About us', 'Contact'], button: 'Get in touch', more: 'Read more', news: 'Latest news', text: 'We have served our community for more than twenty years, with the same care on every visit.' },
  fr: { guide: 'Charte graphique', intro: 'Comment notre nom, nos couleurs et nos caractères apparaissent partout.', colours: 'Couleurs', primary: 'Principale', secondary: 'Secondaire', neutrals: 'Neutres', ink: 'Texte', paper: 'Fond', type: 'Typographie', headings: 'Titres', bodyText: 'Texte courant', logo: 'Logo', clear: 'Laissez autour du logo un espace égal à la hauteur de son symbole. Ne le déformez jamais et n’en changez pas les couleurs.', nav: ['Accueil', 'Services', 'À propos', 'Contact'], button: 'Nous contacter', more: 'En savoir plus', news: 'Actualités', text: 'Depuis plus de vingt ans, nous servons notre quartier avec le même soin à chaque visite.' },
  ar: { guide: 'دليل الهوية البصرية', intro: 'كيف يظهر اسمنا وألواننا وخطوطنا أينما كنا.', colours: 'الألوان', primary: 'اللون الأساسي', secondary: 'اللون الثانوي', neutrals: 'الألوان المحايدة', ink: 'النص', paper: 'الخلفية', type: 'الخطوط', headings: 'العناوين', bodyText: 'النص', logo: 'الشعار', clear: 'اترك حول الشعار مساحة فارغة تساوي ارتفاع رمزه. لا تمدده ولا تغير ألوانه.', nav: ['الرئيسية', 'خدماتنا', 'من نحن', 'اتصل بنا'], button: 'تواصل معنا', more: 'اقرأ المزيد', news: 'آخر الأخبار', text: 'نخدم مجتمعنا منذ أكثر من عشرين عامًا، بالعناية نفسها في كل زيارة.' },
  ja: { guide: 'ブランドガイドライン', intro: '私たちの名前、色、書体の使い方をまとめました。', colours: 'カラー', primary: 'メインカラー', secondary: 'サブカラー', neutrals: 'ニュートラル', ink: '文字', paper: '背景', type: '書体', headings: '見出し', bodyText: '本文', logo: 'ロゴ', clear: 'ロゴの周囲には、マークの高さと同じ余白を確保してください。変形や色の変更はしないでください。', nav: ['ホーム', 'サービス', '会社案内', 'お問い合わせ'], button: 'お問い合わせ', more: '詳しく見る', news: 'お知らせ', text: '二十年以上にわたり、地域の皆さまに変わらぬ心でお応えしてきました。' },
}

/** @param {string} hex */
const rgb = (hex) => [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16))
/** @param {string} text */
const escape = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** A brand's logo, its mark in its main colour and its name beside in its second, on nothing, as an SVG. @param {Brand} brand */
export function logoSvg(brand) {
  const mark = { circle: `<circle cx="60" cy="60" r="48" fill="${brand.primary}"/><circle cx="60" cy="60" r="20" fill="${brand.secondary}"/>`, square: `<rect x="14" y="14" width="92" height="92" rx="14" fill="${brand.primary}"/><rect x="44" y="44" width="32" height="32" fill="${brand.secondary}"/>`,
    arch: `<path d="M14 106V60a46 46 0 0 1 92 0v46z" fill="${brand.primary}"/><path d="M44 106V70a16 16 0 0 1 32 0v36z" fill="${brand.secondary}"/>`, wave: `<path d="M10 70q25-40 50 0t50 0v36H10z" fill="${brand.primary}"/><circle cx="60" cy="34" r="16" fill="${brand.secondary}"/>` }[brand.mark]
  const rtl = brand.lang === 'ar'
  return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="120" viewBox="0 0 640 120">${rtl ? `<g transform="translate(520 0)">${mark}</g>` : mark}
<text x="${rtl ? 500 : 130}" y="76" text-anchor="${rtl ? 'end' : 'start'}" font-family="${brand.heading}" font-size="${brand.lang === 'en' || brand.lang === 'fr' ? 40 : 44}" font-weight="700" fill="${brand.primary}">${escape(brand.name)}</text></svg>`
}

/** A brand's guide as a page, to print as a PDF: its colours with their codes, its faces with what each is for, its logo. @param {Brand} brand @param {string} logo the logo's PNG as a data: address */
export function guideHtml(brand, logo) {
  const w = WORDS[brand.lang], code = (/** @type {string} */ label, /** @type {string} */ hex) => /* html */ `<figure><i style="background:${hex}"></i><figcaption><b>${label}</b><br>HEX ${hex}<br>RGB ${rgb(hex).join(' ')}</figcaption></figure>`
  return /* html */ `<!doctype html><html lang="${brand.lang}" dir="${brand.lang === 'ar' ? 'rtl' : 'ltr'}"><meta charset="utf-8"><style>
@page { size: A4; margin: 18mm } body { font-family: '${brand.body}'; color: ${brand.ink}; font-size: 11pt; line-height: 1.6 } h1, h2 { font-family: '${brand.heading}'; color: ${brand.primary} }
h1 { font-size: 34pt; margin: 40mm 0 4mm } h2 { font-size: 18pt; break-before: page } .cover img { width: 120mm } figure { display: inline-block; margin: 0 6mm 6mm 0; width: 40mm; vertical-align: top }
figure i { display: block; height: 22mm; border-radius: 3mm; border: 1px solid #ddd } figcaption { font-size: 9pt } .sample-h { font-family: '${brand.heading}'; font-size: 24pt } .sample-b { font-family: '${brand.body}' }
</style><body><section class="cover"><img src="${logo}" alt=""><h1>${escape(brand.name)}</h1><p>${w.guide} · 2026</p><p>${w.intro}</p></section>
<h2>${w.colours}</h2>${code(w.primary, brand.primary)}${code(w.secondary, brand.secondary)}<h3>${w.neutrals}</h3>${code(w.ink, brand.ink)}${code(w.paper, brand.paper)}
<h2>${w.type}</h2><p><b>${w.headings}: ${brand.heading} Bold</b></p><p class="sample-h">${escape(brand.tagline)}</p><p><b>${w.bodyText}: ${brand.body} Regular</b></p><p class="sample-b">${w.text}</p>
<h2>${w.logo}</h2><p><img src="${logo}" alt="" style="width:90mm"></p><p>${w.clear}</p></body></html>`
}

/** A brand's site's home page, to photograph: a bar of links, a hero in its colours, news on its paper. @param {Brand} brand @param {string} logo */
export function siteHtml(brand, logo) {
  const w = WORDS[brand.lang]
  return /* html */ `<!doctype html><html lang="${brand.lang}" dir="${brand.lang === 'ar' ? 'rtl' : 'ltr'}"><meta charset="utf-8"><style>
* { box-sizing: border-box } body { margin: 0; font-family: '${brand.body}'; color: ${brand.ink}; background: #fff } header { display: flex; align-items: center; justify-content: space-between; padding: 18px 48px; border-bottom: 1px solid #e5e5e5 }
header img { height: 44px } nav a { margin-inline-start: 28px; color: ${brand.ink}; text-decoration: none; font-size: 16px } .hero { background: ${brand.paper}; padding: 72px 48px; display: grid; grid-template-columns: 1.2fr 1fr; gap: 40px; align-items: center }
h1 { font-family: '${brand.heading}'; font-size: 48px; line-height: 1.15; margin: 0 0 18px; color: ${brand.primary} } .hero p { font-size: 19px; line-height: 1.6 } .button { display: inline-block; background: ${brand.primary}; color: #fff; padding: 14px 28px; border-radius: 8px; font-size: 17px; text-decoration: none }
.art { height: 280px; border-radius: 16px; background: linear-gradient(135deg, ${brand.primary}, ${brand.secondary}) } .news { padding: 48px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 28px } .news h2 { grid-column: 1 / -1; font-family: '${brand.heading}'; margin: 0; color: ${brand.ink} }
.card { border: 1px solid #e5e5e5; border-radius: 12px; padding: 22px } .card b { display: block; width: 44px; height: 6px; background: ${brand.secondary}; margin-bottom: 14px } .card a { color: ${brand.primary} }
</style><body><header><img src="${logo}" alt=""><nav>${w.nav.map((item) => `<a href="#">${item}</a>`).join('')}</nav></header>
<section class="hero"><div><h1>${escape(brand.tagline)}</h1><p>${w.text}</p><a class="button" href="#">${w.button}</a></div><div class="art"></div></section>
<section class="news"><h2>${w.news}</h2>${[1, 2, 3].map(() => `<div class="card"><b></b><p>${w.text}</p><a href="#">${w.more}</a></div>`).join('')}</section></body></html>`
}

/** A brand's guide as a Word file: its title in its heading face, its colours' codes and its faces named in its text face, its logo in its header. @param {Brand} brand @param {Uint8Array} png */
export async function wordGuide(brand, png) {
  const w = WORDS[brand.lang], bidi = brand.lang === 'ar' ? '<w:bidi/>' : ''
  const run = (/** @type {string} */ text, /** @type {string} */ face, /** @type {string} */ colour = brand.ink.slice(1), size = 22) => `<w:p><w:pPr>${bidi}</w:pPr><w:r><w:rPr><w:rFonts w:ascii="${face}" w:hAnsi="${face}" w:cs="${face}" w:eastAsia="${face}"/><w:color w:val="${colour}"/><w:sz w:val="${size}"/></w:rPr><w:t xml:space="preserve">${escape(text)}</w:t></w:r></w:p>`
  const body = [run(brand.name, brand.heading, brand.primary.slice(1), 56), run(`${w.guide} · 2026`, brand.body), run(w.intro, brand.body), run(w.colours, brand.heading, brand.primary.slice(1), 36),
    ...[[w.primary, brand.primary], [w.secondary, brand.secondary], [`${w.neutrals} · ${w.ink}`, brand.ink], [`${w.neutrals} · ${w.paper}`, brand.paper]].map(([label, hex]) => run(`${label}: HEX ${hex} · RGB ${rgb(hex).join(' ')}`, brand.body)),
    run(w.type, brand.heading, brand.primary.slice(1), 36), run(`${w.headings}: ${brand.heading} Bold`, brand.body), run(`${w.bodyText}: ${brand.body} Regular`, brand.body), run(brand.tagline, brand.heading, brand.primary.slice(1), 40), run(w.text, brand.body),
    run(w.logo, brand.heading, brand.primary.slice(1), 36), run(w.clear, brand.body)].join('')
  const xml = (/** @type {string} */ text) => new TextEncoder().encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n${text}`)
  const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"'
  const picture = `<w:p><w:r><w:drawing><wp:inline><wp:extent cx="2743200" cy="514350"/><wp:docPr id="1" name="Logo"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="1" name="logo.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdLogo"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="2743200" cy="514350"/></a:xfrm><a:prstGeom prst="rect"/></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`
  const relationship = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
  return writeZip([
    { name: '[Content_Types].xml', bytes: xml('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/></Types>') },
    { name: '_rels/.rels', bytes: xml(`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${relationship}/officeDocument" Target="word/document.xml"/></Relationships>`) },
    { name: 'word/document.xml', bytes: xml(`<w:document ${W}><w:body>${body}<w:sectPr><w:headerReference w:type="default" r:id="rIdHeader"/></w:sectPr></w:body></w:document>`) },
    { name: 'word/_rels/document.xml.rels', bytes: xml(`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdHeader" Type="${relationship}/header" Target="header1.xml"/></Relationships>`) },
    { name: 'word/header1.xml', bytes: xml(`<w:hdr ${W}>${picture}</w:hdr>`) },
    { name: 'word/_rels/header1.xml.rels', bytes: xml(`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdLogo" Type="${relationship}/image" Target="media/image1.png"/></Relationships>`) },
    { name: 'word/media/image1.png', bytes: png },
  ])
}
