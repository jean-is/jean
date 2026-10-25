// A pane that frames Jean's own demo of a page's task (D462), where the page's pane draws a conversation the demo
// can play: the task written beside the page as a conversation's file (D457), from the page's words as text, and the
// frame that shows it as it ended, with a button that plays it, its words the page's (pane.title, pane.play). Where the
// page has a guided tour over its task (D460, D480), that button is the page's and plays it full size, in a popover.
import { ICONS, xml } from './site.js'

/** When a demo's records say they were written: the demo shows each as of when it shows it. */
const AT = '2026-01-01T09:00:00.000Z'

/**
 * A task as a page's words tell it: the file shared with the request, the request, the AI as the page names it (never
 * by brand), the program it ran and what came back where there is one, or another call, which can ask first (a help
 * article's, D612), and the answer, in Markdown; and where the page has one, a guided tour over it (D460), its stops'
 * words the page's, filled.
 * @typedef {{ name: string, title: string, kind?: string, input?: object, output?: string, asks?: boolean }} Call
 * @typedef {{ file?: { name: string, type: string }, asked: string, brain: string, code?: string, output?: string, call?: Call, answer: string, tour?: import('../app/caps/tour/tour.js').Stop[] }} Task
 */

/** Where a page's task is, from the site's root, and its tour. @param {import('./site.js').Kit} kit */
const pathOf = (kit) => `demos/${kit.name}.${kit.lang}.jsonl`
const tourOf = (/** @type {import('./site.js').Kit} */ kit) => pathOf(kit).replace(/\.jsonl$/, '.tour.json')

/** The files a page writes beside itself for its pane's demo, by their paths: the task, and its tour. @param {import('./site.js').Kit} kit @param {Task} task */
export function demoFiles (kit, { file, asked, brain, code, output, call, answer, tour }) {
  const said = (/** @type {object} */ content) => ({ at: AT, by: 'demo', update: { sessionUpdate: 'user_message_chunk', content } })
  const step = (/** @type {number} */ index, /** @type {object} */ update) => ({ at: AT, by: 'jean', step: index, update })
  const asks = (/** @type {number} */ index, /** @type {string} */ stopReason) => step(index, { sessionUpdate: 'tool_call', toolCallId: `brain-${index}`, title: brain, kind: 'think', status: 'completed', rawOutput: { stopReason } })
  // With a program or another call, the AI asks for it, then answers from what it gave back; else it answers at once.
  // A call that asks first waits on its card before it runs (ui/demo.js).
  const tool = call ?? (code === undefined ? undefined : { name: 'javascript', title: 'javascript', kind: 'execute', input: { code }, output })
  const run = (/** @type {Call} */ { name, title, kind = 'other', input }, /** @type {string} */ status, more = {}) => step(0, { sessionUpdate: 'tool_call', toolCallId: 'call-1', title, name, kind, status, rawInput: input, ...more })
  const last = tool ? 1 : 0
  const records = [
    { format: 1, kind: 'conversation', id: `demo-${kit.name.replaceAll('/', '-')}`, createdAt: AT, by: 'demo' },
    ...file ? [said({ type: 'resource_link', uri: `files/${file.name}`, name: file.name, mimeType: file.type })] : [],
    said({ type: 'text', text: asked }),
    ...tool ? [asks(0, 'tool_use'), ...tool.asks ? [run(tool, 'pending')] : [], run(tool, 'completed', { rawOutput: tool.output })] : [],
    asks(last, 'end'),
    step(last, { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: answer } }),
  ]
  return {
    [pathOf(kit)]: records.map((record) => JSON.stringify(record)).join('\n') + '\n',
    ...tour && { [tourOf(kit)]: JSON.stringify({ stops: tour }, null, 2) + '\n' },
  }
}

/**
 * The frame that plays it in the page's pane, loaded once it is near, shown as the task ended, with a button that plays
 * it. With a tour, the button is the page's, over the frame's foot, and opens a popover that frames the task again, full
 * size and whole, loaded only then: the tour plays once it is open, and then a button with pane.again plays it again.
 * Nothing on the page runs: the popover opens and closes by its buttons, Esc and a click beside it.
 * @param {import('./site.js').Kit} kit @param {boolean} [tour]
 */
export function demoFrame (kit, tour = false) {
  const at = (/** @type {Record<string, string>} */ more, flags = '') => xml(`${kit.site('demo.html')}#${new URLSearchParams({ src: pathOf(kit), lang: kit.lang, ...more })}${flags}`)
  const pane = /* html */ `<iframe class="site-demo" src="${at(tour ? {} : { play: kit.text('pane.play') }, '&still&bare')}" title="${kit.say('pane.title')}" loading="lazy"></iframe>`
  return tour ? /* html */ `${pane}
    <button class="button primary site-demo-play" type="button" popovertarget="site-tour">${ICONS.play}<span>${kit.say('pane.play')}</span></button>
    <div id="site-tour" class="site-tour" popover>
      <button class="icon-button site-tour-close" type="button" popovertarget="site-tour" popovertargetaction="hide" aria-label="${kit.say('pane.close')}">${ICONS.close}</button>
      <iframe class="site-tour-frame" src="${at({ tour: tourOf(kit), play: kit.text('pane.again') })}" title="${kit.say('pane.tour')}" loading="lazy"></iframe>
    </div>` : pane
}
