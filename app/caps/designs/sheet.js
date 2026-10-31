// Whether a file the brain wrote reads as a sheet, which the event that offers Designs asks (D587, ui/discovery.js):
// apart from the capability, since it is asked before Designs is found.

/** Words past which a file reads as a site rather than as a sheet to print or send, and under which an SVG reads as a drawing, a label at most. */
const SHEET = 200, WORDED = 5
/** Whether a file of so many words could be a sheet. @param {number} count @param {string} name */
const fits = (count, name) => count <= SHEET && (count >= WORDED || !/\.svg$/i.test(name))
/**
 * Whether a file the brain wrote is a web page or an SVG that reads as a sheet to print or send, an invitation or a flyer, which a
 * design could be: no script, form or frame, and few words on the page, so not what a drawing's title, description or comments
 * call it, counted as its language's own are, with no keyword (D6).
 * @param {string} name @param {string} content
 */
export const sheetLike = (name, content) => /\.(html?|svg)$/i.test(name) && !/<(script|form|iframe)\b/i.test(content)
  && fits([...new Intl.Segmenter(undefined, { granularity: 'word' }).segment(content.replace(/<!--[\s\S]*?-->|<(style|head|title|desc|metadata)\b[\s\S]*?<\/\1>|<[^>]*>|&\w+;/gi, ' '))].filter((one) => one.isWordLike).length, name)
