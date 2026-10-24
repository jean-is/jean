// Designs' phase 0: the view the render spike measures (render.js), as an HTML page: Léa's
// invitation laid out as take 1 (the picture above, the words centred) or take 3 (the words at the
// foot, from the start), in the Friendly voice with the Calm one for the small print, sized in
// container units so that it draws the same at any width. The app draws it with lit-html; the spike
// needs it as a page. Pure.

/** Léa's invitation in the languages measured, Yoruba and Hausa for their marks and letters. @type {Record<string, Record<string, string>>} */
export const SAMPLES = {
  en: { title: 'Léa is 7!', words: 'Come and celebrate with us', when: 'Saturday 14 November · 3 pm', where: '12 rue des Lilas, Lyon', small: 'Please reply to Claire by 10 November' },
  fr: { title: 'Léa a 7 ans !', words: 'Viens fêter ça avec nous', when: 'Samedi 14 novembre · 15 h', where: '12 rue des Lilas, Lyon', small: 'Réponse à Claire avant le 10 novembre' },
  ar: { title: 'ليا تبلغ السابعة!', words: 'تعالوا نحتفل معًا', when: 'السبت ١٤ نوفمبر · الساعة ٣ عصرًا', where: '١٢ شارع الزنابق، ليون', small: 'يُرجى الرد على كلير قبل ١٠ نوفمبر' },
  ja: { title: 'レアの7さいのおたんじょうび会', words: 'いっしょにおいわいしよう！', when: '11月14日（土）午後3時から', where: 'リヨン市 リラ通り12番地', small: '11月10日までにクレールへおへんじください' },
  vi: { title: 'Léa tròn 7 tuổi!', words: 'Mời bạn đến chung vui', when: 'Thứ Bảy, 14 tháng 11 · 15 giờ', where: '12 rue des Lilas, Lyon', small: 'Xin trả lời chị Claire trước ngày 10 tháng 11' },
  ru: { title: 'Лее исполняется 7!', words: 'Приходи отпраздновать с нами', when: 'Суббота, 14 ноября · 15:00', where: '12 rue des Lilas, Лион', small: 'Ответьте Клэр до 10 ноября' },
  yo: { title: 'Ọjọ́ ìbí Léa!', words: 'Ẹ wá bá wa ṣe àjọyọ̀', when: 'Ọjọ́ Àbámẹ́ta, 14 Oṣù Bélú', where: '12 rue des Lilas, Lyon', small: 'Ẹ jọ̀wọ́ ẹ fèsì sí Claire' },
  ha: { title: 'Ranar haihuwar Léa!', words: 'Ku zo mu yi bikin tare', when: 'Asabar, 14 ga Nuwamba', where: '12 rue des Lilas, Lyon', small: 'Ɗan ƙaramin saƙo: a amsa wa Claire' },
}

/** The balloons, as a picture of their own. */
export const BALLOONS = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 190"><g fill="none" stroke="#1f2a44" stroke-opacity=".45" stroke-width=".9"><path d="M62 99C66 130 92 150 100 182"/><path d="M100 81C96 110 104 140 100 182"/><path d="M139 100C134 130 108 150 100 182"/><path d="M80 138C84 155 96 165 100 182"/><path d="M122 138C118 155 104 165 100 182"/></g><ellipse cx="62" cy="62" rx="27" ry="33" fill="#e8604a"/><ellipse cx="139" cy="63" rx="27" ry="33" fill="#2f78bd"/><ellipse cx="100" cy="44" rx="27" ry="33" fill="#f6b42c"/><ellipse cx="80" cy="104" rx="25" ry="30" fill="#4fb38f"/><ellipse cx="122" cy="104" rx="25" ry="30" fill="#f39a86"/></svg>')}`

/** @typedef {{ family: string, url: string, range: string, weight?: string }} FaceFile */

/**
 * The view as a page: one invitation, or `copies` of it side by side on a sheet to print.
 * @param {{ lang: string, take?: 1 | 3, faces: FaceFile[], width?: string, sheet?: { size: string, copies: number, columns: number } }} options
 */
export function viewHtml({ lang, take = 1, faces, width = '740px', sheet }) {
  const words = SAMPLES[lang]
  const dir = lang === 'ar' ? 'rtl' : 'ltr'
  const one = (/** @type {number} */ i) => /* html */ `<div class="page take-${take}"${i ? '' : ' id="page"'}>
  <div class="pic" data-part="picture" data-role="picture"><img src="${BALLOONS}" alt=""></div>
  <div class="stack">
    ${['title', 'words', 'when', 'where', 'small'].map((role) => `<p class="${role}" data-part="${role}">${words[role]}</p>`).join('\n    ')}
  </div>
</div>`
  const copies = sheet ? Array.from({ length: sheet.copies }, (_, i) => one(i)).join('\n') : one(0)
  return /* html */ `<!doctype html>
<html lang="${lang}" dir="${dir}">
<head>
<meta charset="utf-8">
<style>
${faces.map((face) => `@font-face { font-family: ${face.family}; src: url(${face.url}) format('woff2'); unicode-range: ${face.range}; font-weight: ${face.weight ?? '100 900'}; }`).join('\n')}
${sheet ? `@page { size: ${sheet.size}; margin: 0; }` : ''}
html, body { margin: 0; }
body { ${sheet ? `display: grid; grid-template-columns: repeat(${sheet.columns}, auto); width: max-content;` : ''} }
.page { position: relative; inline-size: ${width}; aspect-ratio: 148 / 210; overflow: hidden; container-type: inline-size; background: #fff4da; color: #1f2a44; ${sheet ? 'box-shadow: inset 0 0 0 0.3px #888;' : ''} }
.pic { position: absolute; inset-block-start: 4%; inset-inline: 21%; block-size: 41%; }
.pic img { display: block; inline-size: 100%; block-size: 100%; object-fit: contain; }
.stack { position: absolute; inset-block: 47% 5%; inset-inline: 8%; display: flex; flex-direction: column; align-items: center; text-align: center; gap: 2.4cqi; }
.take-3 .pic { inset-block-start: 6%; inset-inline: auto 6%; inline-size: 34%; block-size: 26%; }
.take-3 .stack { inset-block: auto 6%; align-items: flex-start; text-align: start; gap: 2cqi; }
p { margin: 0; text-wrap: balance; word-break: auto-phrase; font-family: Friendly, sans-serif; }
.title { font-size: 11.6cqi; font-weight: 800; line-height: 1.15; color: #e8604a; }
.words { font-size: 5.2cqi; font-weight: 600; line-height: 1.2; color: #2f78bd; }
.when { font-size: 5.6cqi; font-weight: 800; line-height: 1.2; }
.where { font-size: 4.9cqi; font-weight: 600; line-height: 1.2; }
.small { margin-block-start: auto; font-family: Calm, sans-serif; font-size: 3.6cqi; font-weight: 600; line-height: 1.25; opacity: 0.78; }
.take-3 .small { margin-block-start: 0; }
:lang(ja) p { font-family: 'Hiragino Maru Gothic ProN', 'Hiragino Sans', 'Yu Gothic', 'Noto Sans JP', sans-serif; line-height: 1.3; }
</style>
</head>
<body>
${copies}
</body>
</html>
`
}
