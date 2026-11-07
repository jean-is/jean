// SPDX-FileCopyrightText: 2026 Warehouse SAS
// SPDX-License-Identifier: Elastic-2.0

// The events ee/'s hooks read, each with the fields they read.

import type { AssistantMessage, BrainConfig, ChatMessage, DocumentPart, Effort, RuleValue, ToolCall, ToolKind, ToolSpec } from '../core/types.js'

/** A message to a brain, of any of ChatMessage's kinds, each field read where it has one. */
export type Message = {
  role: ChatMessage['role']
  content: string
  documents?: DocumentPart[]
  toolCalls?: ToolCall[]
  raw?: AssistantMessage['raw']
  rawModel?: string
  toolCallId?: string
  name?: string
  isError?: boolean
}

/** A brain's step, as `turn.step` hooks see it: what goes, to which brain, for which task. */
export type Step = {
  brain: BrainConfig
  system?: string
  messages: Message[]
  tools?: ToolSpec[]
  effort?: Effort
  /** the conversation's file, when the step is a task's */
  task?: string
  /** its place in the turn: left out for a title's or a question's request */
  step?: number
  signal?: AbortSignal
}

/** A call about to run, as `tool.check` hooks see it. args: the brain's. */
export type CheckEvent = { toolCallId?: string, name: string, kind: ToolKind, args?: Record<string, unknown>, title?: string, service?: string, task?: string }

/** What `tool.check` says of a call: a rule's decision, a refusal, why, and what its card keeps. */
export type Decision = { decision?: RuleValue, refuse?: string, reason?: string, by?: string, meta?: Record<string, unknown> }
