// Plans (D364): for work of three steps or more, the brain shows the user its plan, ACP's `plan` update, and keeps it
// up to date; Jean draws it above the answer's activity. The request's first plan waits at the top of the box for Go
// ahead, as questions do (caps/ask, D343), under the rule Starting a long task. A confirmed plan carries the task past
// its block of steps while it moves (core/loop.js's turn.limit), five blocks at most; a task that stops there, or whose
// page closed between steps, pauses at the top of the box with Keep going. Loaded silently, like Compaction: the
// first time a task takes four calls or runs out of steps, or a folder is taken; nothing shows before then (D281).
import { html, nothing } from 'lit-html'
import { register } from '../../ui/caps.js'
import { app, conversationOf, effective, setRule } from '../../ui/state.js'
import { askUser, keepGoing } from '../../ui/send.js'
import { priceOf } from '../../ui/prices.js'
import { icons } from '../../ui/icons.js'
import { styleSheet } from '../../ui/sheet.js'
import { loadConversation } from '../../core/conversations.js'
import { foldTurns } from '../../core/events.js'
import { resolveRule } from '../../core/rules.js'
import { t, locale, useStrings } from '../../core/i18n.js'
import { MOST, STATUSES, PRIORITIES, entriesOf, done, confirmed, routine, moved } from './entries.js'

/** @import { PlanEntry, ToolCallInfo } from '../../core/types.js' */
/** @import { Step } from '../../core/events.js' */

await Promise.all([useStrings('plan'), styleSheet(new URL('plan.css', import.meta.url))])

/** The blocks of steps a moving plan carries a task on for, at most, before it pauses all the same. */
const BLOCKS = 5

/** @type {import('../../core/loop.js').Tool} */
const planTool = {
  spec: {
    name: 'plan',
    description: 'Show the user your plan for work of three steps or more, and keep it up to date: the whole list each time, each step with its status, one in progress at a time. The user may be asked to confirm it first. Never for a one-step answer.',
    parameters: {
      type: 'object',
      properties: {
        entries: {
          type: 'array', minItems: 2, maxItems: MOST,
          items: {
            type: 'object',
            properties: { content: { type: 'string', description: "One step, in a few words, in the user's language" }, status: { type: 'string', enum: STATUSES }, priority: { type: 'string', enum: PRIORITIES } },
            required: ['content', 'status'],
          },
        },
      },
      required: ['entries'],
    },
  },
  kind: 'think',
  // It may wait for the user's Go ahead, so it is kept as pending meanwhile (D212); a step that only plans isn't counted.
  asks: true,
  aside: true,
  title: () => 'Plan',
  run: async (args, ctx) => {
    const entries = entriesOf(args)
    if (entries.length < 2) throw new Error('Give two steps or more, each with its content and status.')
    const run = conversationOf(ctx.signal)
    const records = [...run?.records ?? [], ...run?.settled ?? []]
    // A routine's run never waits: nobody is there, and the user made the routine.
    const rule = routine(records) ? 'allow' : resolveRule('plan', { user: effective.value.settings.rules })
    if (rule === 'never') return "The user's rules don't use plans: work without one."
    if (rule === 'allow' || confirmed(records)) {
      ctx.update({ sessionUpdate: 'plan', entries, _meta: { confirmed: true } })
      return 'The plan is shown.'
    }
    // Shown while it waits, above the question; the box's words change it (D343).
    ctx.update({ sessionUpdate: 'plan', entries })
    const always = !effective.value.locked.has('rules.plan')
    const [answer] = (await askUser([{ question: t('plan.confirm'), multiple: false, options: [{ label: t('plan.go'), description: '', recommended: true },
      ...(always ? [{ label: t('plan.always'), description: '', recommended: false }] : [])] }], undefined, ctx.signal)) ?? []
    const own = answer?.writing ? answer.own.trim() : ''
    if (own) return `The user wants the plan changed: «${own}». Change it with plan, which asks again.`
    if (!answer || answer.skipped || !answer.chosen.length) return "The user didn't confirm the plan. Ask what they want instead."
    if (answer.chosen.includes(1)) await setRule('plan', 'allow')
    ctx.update({ sessionUpdate: 'plan', entries, _meta: { confirmed: true } })
    return 'The user confirmed the plan.'
  },
}

/** The plan, between the request and the activity: a checklist, open until every step is done. @param {{ plan?: PlanEntry[] }} props */
function view({ plan }) {
  if (!plan?.length) return nothing
  const count = done(plan)
  return html`<details class="read-list plan" ?open=${count < plan.length}>
    <summary>${icons.note}<span>${t('plan.title')} · ${t('plan.done', { done: count, total: plan.length })}</span>${icons.chevron}</summary>
    <ol>${plan.map((entry) => html`<li data-status=${entry.status}>
      ${entry.status === 'completed' ? icons.check : html`<span class="ember" data-state=${entry.status === 'in_progress' ? 'working' : nothing}></span>`}
      <span class="visually-hidden">${t(`plan.${entry.status}`)}</span><span dir="auto">${entry.content}</span>
    </li>`)}</ol>
  </details>`
}

/**
 * What the request cost so far, in dollars, from its brains' prices per token (D252, D255); null when one isn't known.
 * @param {Step[]} steps
 */
function spent(steps) {
  let cost = 0
  for (const { rawInput, rawOutput } of steps.flatMap((step) => step.tools).filter((tool) => tool.kind === 'think' && !tool.name)) {
    if (!rawInput || rawInput.local) continue
    const brain = app.settings.value.brains.find((one) => one.provider === rawInput.provider)
    const { prompt = NaN, completion = NaN, cacheRead = prompt } = priceOf(rawInput.provider, rawInput.model, brain && app.models.value[brain.id]?.find((info) => info.id === rawInput.model)?.pricing) ?? {}
    const { inputTokens = 0, outputTokens = 0, cacheReadTokens = 0 } = rawOutput?.usage ?? {}
    cost += (inputTokens - cacheReadTokens) * prompt + cacheReadTokens * cacheRead + outputTokens * completion
  }
  return Number.isNaN(cost) ? null : cost
}

/**
 * At the top of the box, the task on screen when it stopped between steps: at its limit, with how far it got and what
 * it cost, or when the page closed meanwhile; Keep going reads on from there.
 */
function pause() {
  const records = app.current.value?.records
  if (!records || app.busy.value) return nothing
  const turn = foldTurns(records).at(-1)
  const step = turn?.steps.at(-1)
  /** @type {ToolCallInfo | undefined} */
  const entry = step?.tools.findLast((tool) => tool.kind === 'think' && !tool.name && !tool._meta?.parent && !tool._meta?.compact)
  const stopped = entry?._meta?.stopped === 'max_turn_requests'
  if (!turn || !step || !(stopped || entry?.rawOutput?.stopReason === 'tool_use')) return nothing
  const cost = spent(turn.steps)
  const money = new Intl.NumberFormat(locale.value, { style: 'currency', currency: 'USD', maximumSignificantDigits: 2 })
  const facts = stopped ? [t('plan.paused', { count: step.index + 1 }), ...(turn.plan ? [t('plan.done', { done: done(turn.plan), total: turn.plan.length })] : []),
    ...(cost ? [t('plan.cost', { cost: money.format(cost) })] : [])] : [t('activity.unfinished')]
  return html`<div class="pause" role="group" aria-label=${facts[0]}>
    <p>${facts.join(' · ')}</p>
    <button type="button" class="button primary" @click=${() => keepGoing()}>${t('plan.keepGoing')}</button>
  </div>`
}

register({
  id: 'plan',
  tools: [planTool],
  lines: [{ name: 'plan', line: 'show the user the steps of a longer task, each with its status' }],
  rules: ['Plan only work of three steps or more; update it with your next action.'],
  // A confirmed plan that moved carries the task on, a block at a time, never a helper's turn.
  hooks: [{ on: 'turn.limit', run: async (e, next) => (!e.parent && e.task && e.blocks < BLOCKS && moved((await loadConversation(app.fs, e.task))?.records ?? [], e.from)) || next(e) }],
  slots: { progress: { at: 0, draw: view }, box: { at: 0, draw: pause } },
})
