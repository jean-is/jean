// A plugin for the tests (D296): it counts each answer's words, under the answer and above the box,
// keeps the last count, says when it is reset, and keeps files as they are, when it may refuse.
export function register(on, $) {
  let words = 0
  const count = (text) => text.split(/\s+/).filter(Boolean).length
  on('turn.end', async (e, next) => {
    const result = await next(e)
    words = count(e.answer)
    await $.store.set('last', words)
    $.redraw()
    return result
  })
  on('tool.check', { kind: 'edit' }, () => ({ decision: 'never', reason: 'Word count keeps files as they are.' }))
  $.slot('answer', ({ text }) => ({ text: `${count(text)} words`, muted: true }))
  $.slot('above', () => ({ row: [{ text: `Last answer: ${words} words` }, { button: 'Reset', action: 'reset' }] }))
  $.press((action) => {
    if (action !== 'reset') return
    words = 0
    $.redraw()
    $.notify('Reset.')
  })
}
