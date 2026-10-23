// An extension for the tests (D296): it counts each answer's words, under the answer and above the box,
// keeps the last count, says when it is reset, keeps files as they are, when it may refuse, and notes
// what was stopped, and how many records going back to a request removed.
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
  // It follows what Jean keeps (D299), and notes the last action a rule stopped, and whose rule it was.
  on('record', { type: 'tool_call' }, async (e, next) => {
    const call = e.record.update
    if (call._meta?.declined) await $.store.set('stopped', { title: call.title, by: call._meta.by ?? null })
    return next(e)
  })
  on('record', { type: 'removed' }, async (e, next) => {
    await $.store.set('removed', e.records.length)
    return next(e)
  })
  $.slot('answer', ({ text }) => ({ text: `${count(text)} words`, muted: true }))
  $.slot('above', () => ({ row: [{ text: `Last answer: ${words} words` }, { button: 'Reset', action: 'reset' }] }))
  $.press((action) => {
    if (action !== 'reset') return
    words = 0
    $.redraw()
    $.notify('Reset.')
  })
}
