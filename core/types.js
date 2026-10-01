// Shared JSDoc types for core/ and ui/. No runtime code.
export {}

// ─── Brains (model providers) ────────────────────────────────────────────────

/**
 * @typedef {'openrouter'|'openai'|'anthropic'|'ollama'|'lmstudio'|'custom'} ProviderId
 * @typedef {'openai'|'anthropic'} WireApi  Wire protocol spoken by the provider.
 */

/**
 * A connected brain. Secrets (API keys) are never stored here; see ui/secrets.js.
 * @typedef {Object} BrainConfig
 * @property {string} id              ULID
 * @property {ProviderId} provider
 * @property {WireApi} api
 * @property {string} baseURL         e.g. https://openrouter.ai/api/v1, https://api.anthropic.com/v1, http://localhost:11434/v1
 * @property {string} model
 * @property {string} [label]
 * @property {Record<string, string>} [headers]  Extra non-secret headers
 */

// ─── Provider-neutral chat ───────────────────────────────────────────────────

/**
 * @typedef {{ id: string, name: string, args: any }} ToolCall
 * @typedef {{ name: string, description: string, parameters: object }} ToolSpec  parameters = JSON Schema
 * @typedef {{ role: 'user', content: string }} UserMessage
 * @typedef {{ role: 'assistant', content: string, toolCalls?: ToolCall[], raw?: any }} AssistantMessage
 *   raw = provider-native assistant message, echoed verbatim inside a single tool loop
 *   (Anthropic thinking blocks must come back unchanged). Never persisted.
 * @typedef {{ role: 'tool', toolCallId: string, name: string, content: string, isError?: boolean }} ToolMessage
 * @typedef {UserMessage | AssistantMessage | ToolMessage} ChatMessage
 */

/**
 * Events yielded by llm.streamChat().
 * @typedef {'end'|'tool_use'|'max_tokens'|'refusal'|'other'} StopReason
 * @typedef {{ inputTokens?: number, outputTokens?: number }} Usage
 * @typedef {{ type: 'text', delta: string }
 *   | { type: 'thinking', delta: string }
 *   | { type: 'tool_call', call: ToolCall }
 *   | { type: 'done', stopReason: StopReason, usage?: Usage, message: AssistantMessage }
 * } StreamEvent
 */

/**
 * @typedef {{ id: string, name?: string, contextLength?: number, pricing?: { prompt?: number, completion?: number } }} ModelInfo
 *   pricing in USD per token when known.
 */

// ─── Storage ─────────────────────────────────────────────────────────────────

/**
 * Paths are relative POSIX paths without a leading slash, e.g. "projects/01J…-home/project.md".
 * Segments "", "." and ".." are rejected.
 * @typedef {{ name: string, kind: 'file'|'directory' }} DirEntry
 * @typedef {Object} FS
 * @property {(path: string) => Promise<string|null>} read      null when missing
 * @property {(path: string, text: string) => Promise<void>} write   whole-file replace, parents created
 * @property {(path: string, text: string) => Promise<void>} append  appends text as-is, parents created
 * @property {(dir: string) => Promise<DirEntry[]>} list        [] when missing; "" lists the root
 * @property {(path: string) => Promise<void>} remove           file or directory (recursive); no-op when missing
 * @property {(path: string) => Promise<boolean>} exists
 * @property {(cb: (path: string) => void) => () => void} [watch]  changes made by other tabs; returns unsubscribe
 * @property {() => Promise<{ usage?: number, quota?: number, persisted?: boolean }>} [estimate]
 */

// ─── Conversations (JSONL) and ACP events ────────────────────────────────────

/**
 * ACP content block (subset).
 * @typedef {{ type: 'text', text: string }} ContentBlock
 * @typedef {'read'|'edit'|'delete'|'move'|'search'|'execute'|'think'|'fetch'|'switch_mode'|'other'} ToolKind
 * @typedef {'pending'|'in_progress'|'completed'|'failed'} ToolStatus
 * @typedef {{ path: string, line?: number }} ToolCallLocation
 * @typedef {{ type: 'content', content: ContentBlock }} ToolCallContent
 * @typedef {{ content: string, priority: 'high'|'medium'|'low', status: 'pending'|'in_progress'|'completed' }} PlanEntry
 */

/**
 * @typedef {Object} ToolCallInfo
 * @property {string} toolCallId
 * @property {string} title
 * @property {string} [name]
 * @property {ToolKind} [kind]
 * @property {ToolStatus} [status]
 * @property {ToolCallContent[]} [content]
 * @property {ToolCallLocation[]} [locations]
 * @property {any} [rawInput]
 * @property {any} [rawOutput]
 */

/**
 * ACP session/update payloads used by Jean (https://agentclientprotocol.com).
 * @typedef {{ sessionUpdate: 'user_message_chunk', content: ContentBlock }
 *   | { sessionUpdate: 'agent_message_chunk', content: ContentBlock }
 *   | { sessionUpdate: 'agent_thought_chunk', content: ContentBlock }
 *   | ({ sessionUpdate: 'tool_call' } & ToolCallInfo)
 *   | ({ sessionUpdate: 'tool_call_update' } & Partial<ToolCallInfo> & { toolCallId: string })
 *   | { sessionUpdate: 'plan', entries: PlanEntry[] }
 * } AcpUpdate
 */

/**
 * One JSONL line after the header. Exactly one of update/meta is present.
 * @typedef {Object} Envelope
 * @property {string} at     ISO timestamp
 * @property {string} by     'user' | 'jean' | a device id
 * @property {number} [step] agent records only: model call index within the turn
 * @property {AcpUpdate} [update]
 * @property {{ title?: string, brain?: string, model?: string, [key: string]: any }} [meta]
 */

/**
 * First JSONL line of a conversation file.
 * @typedef {Object} ConversationHeader
 * @property {1} format
 * @property {'conversation'} kind
 * @property {string} id         ULID
 * @property {string} createdAt  ISO timestamp
 * @property {string} by         device id
 */

/**
 * @typedef {{ id: string, path: string, title: string, createdAt: string, updatedAt: string }} ConversationSummary
 */

// ─── Rules ───────────────────────────────────────────────────────────────────

/**
 * @typedef {'allow'|'ask'|'never'} RuleValue   UI: "Do it" / "Ask me first" / "Never"
 */
