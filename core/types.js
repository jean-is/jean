// Shared JSDoc types for core/ and ui/. No runtime code.
export {}

// ─── Brains (model providers) ────────────────────────────────────────────────

/**
 * @typedef {'device'|'openrouter'|'openai'|'anthropic'|'ollama'|'lmstudio'|'custom'} ProviderId
 * @typedef {'device'|'openai'|'anthropic'} WireApi  Wire protocol spoken by the provider ('device': the on-device brain).
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
 * @typedef {{ name: string, text: string, source?: number }} DocumentPart  a shared file's text, as the brain sees it
 * @typedef {{ role: 'user', content: string, documents?: DocumentPart[] }} UserMessage
 * @typedef {{ role: 'assistant', content: string, toolCalls?: ToolCall[], raw?: any, rawModel?: string }} AssistantMessage
 *   raw = provider-native content blocks, echoed verbatim to the model in rawModel only
 *   (Anthropic thinking blocks must come back unchanged, or the cache breaks).
 * @typedef {{ role: 'tool', toolCallId: string, name: string, content: string, isError?: boolean }} ToolMessage
 * @typedef {{ role: 'system', content: string }} SystemNote  a mid-conversation note (D46); never the first message
 * @typedef {UserMessage | AssistantMessage | ToolMessage | SystemNote} ChatMessage
 */

/**
 * Events yielded by llm.streamChat().
 * @typedef {'end'|'tool_use'|'max_tokens'|'refusal'|'other'} StopReason
 * @typedef {{ inputTokens?: number, outputTokens?: number, cacheReadTokens?: number, cacheWriteTokens?: number }} Usage
 *   inputTokens counts every input token, cached ones included.
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
 * @property {(path: string) => Promise<Uint8Array|null>} readBytes  null when missing
 * @property {(path: string, text: string) => Promise<void>} write   whole-file replace, parents created
 * @property {(path: string, bytes: Uint8Array) => Promise<void>} writeBytes  whole-file replace, parents created
 * @property {(path: string, text: string) => Promise<void>} append  appends text as-is, parents created
 * @property {(dir: string) => Promise<DirEntry[]>} list        [] when missing; "" lists the root
 * @property {(path: string) => Promise<void>} remove           file or directory (recursive); no-op when missing
 * @property {(path: string) => Promise<boolean>} exists
 * @property {(cb: (path: string) => void) => () => void} [watch]  changes made by other tabs; returns unsubscribe
 * @property {() => Promise<{ usage?: number, quota?: number, persisted?: boolean }>} [estimate]
 */

// ─── Conversations (JSONL) and ACP events ────────────────────────────────────

/**
 * ACP content blocks (subset). A resource link points at a file in the project (uri relative
 * to the project folder); `_meta.pages` records which pages went into the brain's context,
 * `_meta.source` the number the brain cites it by.
 * @typedef {{ type: 'text', text: string }} TextBlock
 * @typedef {{ type: 'resource_link', uri: string, name: string, mimeType?: string, size?: number, _meta?: { pages?: [number, number], of?: number, source?: number } }} ResourceLink
 * @typedef {TextBlock | ResourceLink} ContentBlock
 * @typedef {'read'|'edit'|'delete'|'move'|'search'|'execute'|'think'|'fetch'|'switch_mode'|'other'} ToolKind
 * @typedef {'pending'|'in_progress'|'completed'|'failed'} ToolStatus
 * @typedef {{ path: string, line?: number }} ToolCallLocation
 * @typedef {{ type: 'content', content: TextBlock }} ToolCallContent
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
 * @property {Record<string, any>} [_meta]  ACP extension data, e.g. { raw } on brain entries
 */

/**
 * ACP session/update payloads used by Jean (https://agentclientprotocol.com).
 * @typedef {{ sessionUpdate: 'user_message_chunk', content: ContentBlock }
 *   | { sessionUpdate: 'agent_message_chunk', content: TextBlock }
 *   | { sessionUpdate: 'agent_thought_chunk', content: TextBlock }
 *   | ({ sessionUpdate: 'tool_call' } & ToolCallInfo)
 *   | ({ sessionUpdate: 'tool_call_update' } & Partial<ToolCallInfo> & { toolCallId: string })
 *   | { sessionUpdate: 'plan', entries: PlanEntry[] }
 *   | { sessionUpdate: '_system_note', text: string, data: SystemNoteData }
 * } AcpUpdate
 */

/**
 * What a system note changed, for the UI label; `text` is what the brain reads (D46).
 * @typedef {{ kind: 'language', language: string }
 *   | { kind: 'date', date: string }
 *   | { kind: 'tools', added: string[], deferred?: boolean }
 * } SystemNoteData
 */

/**
 * What a conversation's brain was told, frozen at its start (D46), then changed by notes.
 * @typedef {{ language: string, date: string, tools: string[], deferred?: string[] }} PromptState
 *   tools: declared to the brain; deferred: known to exist, reached with find_tools (D47)
 */

/**
 * One JSONL line after the header. Exactly one of update/meta is present.
 * @typedef {Object} Envelope
 * @property {string} at     ISO timestamp
 * @property {string} by     'user' | 'jean' | a device id
 * @property {number} [step] agent records only: model call index within the turn
 * @property {AcpUpdate} [update]
 * @property {{ title?: string, prompt?: { system: string, state: PromptState }, [key: string]: any }} [meta]
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
