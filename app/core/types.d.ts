// Shared types for core/ and ui/, referenced from JSDoc as import('./types.js').Name.

// ─── Brains (model providers) ────────────────────────────────────────────────

export type ProviderId = 'device' | 'openrouter' | 'openai' | 'anthropic' | 'gemini' | 'vertex' | 'mistral' | 'huggingface' | 'vercel'
  | 'groq' | 'cerebras' | 'together' | 'fireworks' | 'xai' | 'ollama' | 'lmstudio' | 'claudecode' | 'copilot' | 'chatgpt' | 'custom'
/** Wire protocol spoken by the provider ('device': the on-device brain). */
export type WireApi = 'device' | 'openai' | 'anthropic'

/** A connected brain. Secrets (API keys) are never stored here; see ui/secrets.js. */
export interface BrainConfig {
  /** ULID */
  id: string
  provider: ProviderId
  api: WireApi
  /** e.g. https://openrouter.ai/api/v1, https://api.anthropic.com/v1, http://localhost:11434/v1 */
  baseURL: string
  model: string
  label?: string
  /** Extra non-secret headers */
  headers?: Record<string, string>
  /** The projects it is used in, by id; without them, every one (D194) */
  projects?: string[]
  /** Where it answers, ISO 3166, as the user or policy declares it: certificates name it (D274) */
  jurisdiction?: string
}

// ─── Provider-neutral chat ───────────────────────────────────────────────────

export type ToolCall = { id: string, name: string, args: any }
/**
 * parameters = JSON Schema. native: an adapter whose provider runs this tool itself renders it
 * as the provider's own (the brain's own web search); others declare it as a function.
 */
export type ToolSpec = { name: string, description: string, parameters: object, native?: 'web_search' }
/** Outside content the brain can cite as [n]: a web page, an email, a document from a connection. */
export type Source = { title: string, url?: string, quote?: string }
/** A shared file's text, as the brain sees it; image: a picture, base64, for brains that can see. */
export type DocumentPart = { name: string, text: string, source?: number, image?: { mimeType: string, data: string } }
export type UserMessage = { role: 'user', content: string, documents?: DocumentPart[] }
/**
 * raw = provider-native content blocks, echoed verbatim to the model in rawModel only
 * (Anthropic thinking blocks must come back unchanged, or the cache breaks).
 */
export type AssistantMessage = { role: 'assistant', content: string, toolCalls?: ToolCall[], raw?: any, rawModel?: string }
export type ToolMessage = { role: 'tool', toolCallId: string, name: string, content: string, isError?: boolean }
/** A mid-conversation note (D46); never the first message. */
export type SystemNote = { role: 'system', content: string }
export type ChatMessage = UserMessage | AssistantMessage | ToolMessage | SystemNote

// Events yielded by llm.streamChat().
/** pause: the provider paused its own tools' loop (Anthropic's pause_turn); sending the reply back resumes it. */
export type StopReason = 'end' | 'tool_use' | 'max_tokens' | 'refusal' | 'pause' | 'other'
/** inputTokens counts every input token, cached ones included. */
export type Usage = { inputTokens?: number, outputTokens?: number, cacheReadTokens?: number, cacheWriteTokens?: number }
export type StreamEvent =
  | { type: 'text', delta: string }
  | { type: 'thinking', delta: string }
  | { type: 'tool_call', call: ToolCall }
  /** sources the text just written cites (the brain's own search) */
  | { type: 'cite', sources: Source[] }
  | { type: 'done', stopReason: StopReason, usage?: Usage, message: AssistantMessage }

/** pricing in USD per token when known; input and output: what it can read and make (OpenRouter), e.g. ['text', 'image']. */
export type ModelInfo = { id: string, name?: string, contextLength?: number, pricing?: { prompt?: number, completion?: number, cacheRead?: number }, input?: string[], output?: string[] }

// Requests made by llm.js and anthropic.js.
export type LLMErrorCode = 'auth' | 'credits' | 'rate_limit' | 'network' | 'cors_or_offline' | 'bad_request' | 'not_found' | 'server' | 'aborted' | 'bad_response' | 'refusal' | 'too_long'
export type Connection = { brain: BrainConfig, apiKey?: string, signal?: AbortSignal, fetch?: typeof globalThis.fetch }
export type Prompt = { system?: string, messages: ChatMessage[], tools?: ToolSpec[], maxTokens?: number }
export type WireRequest = { url: string, headers: Record<string, string>, body: Record<string, any> }

// ─── Storage ─────────────────────────────────────────────────────────────────

/**
 * Paths are relative POSIX paths without a leading slash, e.g. "projects/01J…-home/project.md".
 * Segments "", "." and ".." are rejected.
 */
export type DirEntry = { name: string, kind: 'file' | 'directory' }
export interface FS {
  /** null when missing */
  read: (path: string) => Promise<string | null>
  /** null when missing */
  readBytes: (path: string) => Promise<Uint8Array | null>
  /** whole-file replace, parents created */
  write: (path: string, text: string) => Promise<void>
  /** whole-file replace, parents created */
  writeBytes: (path: string, bytes: Uint8Array) => Promise<void>
  /** appends text as-is, parents created */
  append: (path: string, text: string) => Promise<void>
  /** [] when missing; "" lists the root */
  list: (dir: string) => Promise<DirEntry[]>
  /** file or directory (recursive); no-op when missing */
  remove: (path: string) => Promise<void>
  exists: (path: string) => Promise<boolean>
  /** a file's size and when it last changed, in ms; null when missing (a folder's, D141) */
  stat?: (path: string) => Promise<{ size: number, lastModified: number } | null>
  /** changes made by other tabs; returns unsubscribe */
  watch?: (cb: (path: string) => void) => () => void
  estimate?: () => Promise<{ usage?: number, quota?: number, persisted?: boolean }>
  /** stops what it runs (a folder's storage worker) */
  close?: () => void
}

// ─── Conversations (JSONL) and ACP events ────────────────────────────────────

/*
 * ACP content blocks (subset). A resource link points at a file in the project (uri relative
 * to the project folder); `_meta.pages` records which pages went into the brain's context,
 * `_meta.source` the number the brain cites it by.
 */
export type TextBlock = { type: 'text', text: string }
export type ResourceLink = { type: 'resource_link', uri: string, name: string, mimeType?: string, size?: number, _meta?: { pages?: [number, number], of?: number, source?: number } }
export type ContentBlock = TextBlock | ResourceLink
export type ToolKind = 'read' | 'edit' | 'delete' | 'move' | 'search' | 'execute' | 'think' | 'fetch' | 'switch_mode' | 'other'
export type ToolStatus = 'pending' | 'in_progress' | 'completed' | 'failed'
export type ToolCallLocation = { path: string, line?: number }
/** diff: a file changed in the user's folder (D141), as it was (null: made) and as it is now */
/** image: a picture as it forms, in base64, shown while its call runs and never kept (D265) */
export type ImageBlock = { type: 'image', mimeType: string, data: string }
export type ToolCallContent = { type: 'content', content: TextBlock | ImageBlock } | { type: 'diff', path: string, oldText: string | null, newText: string }
export type PlanEntry = { content: string, priority: 'high' | 'medium' | 'low', status: 'pending' | 'in_progress' | 'completed' }

export interface ToolCallInfo {
  toolCallId: string
  title: string
  name?: string
  kind?: ToolKind
  status?: ToolStatus
  content?: ToolCallContent[]
  locations?: ToolCallLocation[]
  rawInput?: any
  rawOutput?: any
  /**
   * ACP extension data, e.g. { raw } on brain entries; sources: what it brought in, by the
   * number the brain cites (D71); picture: a picture or a film it made, as a project file (D251); file: a file it made (D119);
   * making: how a picture or a film it makes is coming, live only (D265)
   */
  _meta?: Record<string, any> & { sources?: (Source & { n: number })[], picture?: { uri: string, name: string, mimeType: string, size: number, version?: number }, file?: { uri: string, name: string, mimeType: string, size: number } }
}

/** ACP session/update payloads used by Jean (https://agentclientprotocol.com). */
export type AcpUpdate =
  | { sessionUpdate: 'user_message_chunk', content: ContentBlock }
  | { sessionUpdate: 'agent_message_chunk', content: TextBlock }
  | { sessionUpdate: 'agent_thought_chunk', content: TextBlock }
  | ({ sessionUpdate: 'tool_call' } & ToolCallInfo)
  | ({ sessionUpdate: 'tool_call_update' } & Partial<ToolCallInfo> & { toolCallId: string })
  | { sessionUpdate: 'plan', entries: PlanEntry[] }
  | { sessionUpdate: '_system_note', text: string, data: SystemNoteData }

/** What a system note changed, for the UI label; `text` is what the brain reads (D46). */
export type SystemNoteData =
  | { kind: 'language', language: string }
  | { kind: 'date', date: string }
  | { kind: 'tools', added: string[] }
  /** version: the section's fingerprint now, '' when it is empty */
  | { kind: 'section', name: 'project' | 'instructions' | 'memory' | 'skills' | 'connections' | 'folder' | 'page', version: string }
  /** the user came back: a read-only brief of what is new since then ("Since last time") */
  | { kind: 'since', since: string }
  /** a routine's request, sent by Jean on its schedule (D122): its file, its title, when it fell due, or that the user ran it */
  | { kind: 'routine', routine: string, title: string, due: string, asked?: boolean, file?: string }
  /** when requests like this one were made before, for a routine to fit the habit (D122) */
  | { kind: 'habit', at: string[] }
  /** what / and @ named in the user's next message, by the words in it (D199) */
  | { kind: 'mentions', words: string[] }
  /** the user undid a change made in their folder, by its call (D141) */
  | { kind: 'undone', call: string, path: string }
  /** the user ran a command on the computer, in the terminal (D166) */
  | { kind: 'terminal', command: string, exit: number }
  /** the user changed a workbook's cells: in the preview, the file at `was` is the copy at `uri` now; in a folder or the workspace, where it is (D229) */
  | { kind: 'cells', was?: string, uri?: string }

/**
 * What a conversation's brain was told, frozen at its start (D46), then changed by notes.
 * tools: declared to the brain; deferred: known to exist, reached with find_tools (D47);
 * sections: a fingerprint of each context section the brain has (project, instructions, memory, skills)
 */
export type PromptState = { language: string, date: string, tools: string[], deferred?: string[], sections?: Record<string, string> }

/** One JSONL line after the header. Exactly one of update/meta is present. */
export interface Envelope {
  /** ISO timestamp */
  at: string
  /** 'user' | 'jean' | a device id */
  by: string
  /** agent records only: model call index within the turn */
  step?: number
  update?: AcpUpdate
  meta?: { title?: string, pinned?: boolean, unread?: boolean, prompt?: { system: string, state: PromptState }, [key: string]: any }
}

/** First JSONL line of a conversation file. */
export interface ConversationHeader {
  format: 1
  kind: 'conversation'
  /** ULID */
  id: string
  /** ISO timestamp */
  createdAt: string
  /** device id */
  by: string
}

/** routine: the routine's file, for one of its runs (D122); pinned: above the others in the list; unread: answered since the user last opened it */
export type ConversationSummary = { id: string, path: string, title: string, opening: string, createdAt: string, updatedAt: string, routine?: string, pinned?: true, unread?: true }

// ─── Rules ───────────────────────────────────────────────────────────────────

/** UI: "Do it" / "Ask me first" / "Never" */
export type RuleValue = 'allow' | 'ask' | 'never'
