// SPDX-License-Identifier: MIT
// The wire formats of the model APIs Jean speaks, as llm.js and anthropic.js write and read them: only the fields
// they touch. What comes from the network is optional wherever the code guards for it.

// ─── OpenAI-compatible Chat Completions ──────────────────────────────────────

export type OpenAIContentPart = { type: 'text', text: string } | { type: 'image_url', image_url: { url: string } }
/** arguments: JSON text, or the object itself for a chat template (the device's brain). extra_content: Gemini's signature of what it thought. */
export type OpenAIToolCall = { id: string, type: 'function', function: { name: string, arguments: string | Record<string, unknown> }, extra_content?: unknown }
export type OpenAIAssistantMessage = { role: 'assistant', content: string, tool_calls?: OpenAIToolCall[] }
export type OpenAIMessage =
  | { role: 'system', content: string }
  | { role: 'user', content: string | OpenAIContentPart[] }
  /** name: for chat templates only */
  | { role: 'tool', tool_call_id: string, name?: string, content: string }
  | OpenAIAssistantMessage
/** A function, or OpenRouter's own web search, which it runs itself. */
export type OpenAITool = { type: 'function', function: { name: string, description: string, parameters: object } } | { type: 'openrouter:web_search', parameters: { max_uses: number } }
/** provider and reasoning: OpenRouter's; max_completion_tokens: OpenAI's own, max_tokens everyone else's. */
export type OpenAIRequestBody = {
  model: string
  stream: boolean
  messages: OpenAIMessage[]
  provider?: { data_collection: string }
  tools?: OpenAITool[]
  max_tokens?: number
  max_completion_tokens?: number
  reasoning?: { effort: string }
  reasoning_effort?: string
  stream_options?: { include_usage: boolean }
}

/** A tool call's fragment: id and name first, then pieces of its arguments; some servers send it whole, without an index. */
export type OpenAIToolCallDelta = { index?: number, id?: string, extra_content?: unknown, function?: { name?: string, arguments?: string | Record<string, unknown> | null } }
/** A web page OpenRouter's own search cites. */
export type OpenAIAnnotation = { url_citation?: { url?: string, title?: string, content?: string } }
/** reasoning: OpenRouter's; reasoning_content: DeepSeek's, LM Studio's and vLLM's. */
export type OpenAIDelta = { content?: string | null, reasoning?: string | null, reasoning_content?: string | null, tool_calls?: OpenAIToolCallDelta[], annotations?: OpenAIAnnotation[] }
export type OpenAIUsage = { prompt_tokens?: number, completion_tokens?: number, prompt_tokens_details?: { cached_tokens?: number } }
/** An error inside a stream: OpenRouter's { code, message }, Anthropic's { type, message }. */
export type StreamErrorBody = { code?: number | string, type?: string, message?: string }
/** One server-sent event's data. */
export type OpenAIChunk = { error?: StreamErrorBody, usage?: OpenAIUsage, choices?: { delta?: OpenAIDelta, finish_reason?: string | null }[] }

/** One model of a list: OpenAI's and OpenRouter's (name, context_length, pricing as text, architecture), or Anthropic's (display_name, max_input_tokens). */
export type ModelEntry = {
  id: string
  name?: string
  display_name?: string
  context_length?: number
  max_input_tokens?: number
  pricing?: { prompt?: string, completion?: string }
  architecture?: { input_modalities?: string[], output_modalities?: string[] }
}

// ─── Anthropic Messages ──────────────────────────────────────────────────────

export type AnthropicCacheControl = { type: 'ephemeral' }
/** A web page the brain's own search cites. */
export type AnthropicCitation = { type?: string, url?: string, title?: string, cited_text?: string }
/** The blocks Jean writes; thinking and the provider's own tools' blocks come back as they were received. */
export type AnthropicBlock =
  | { type: 'text', text: string, cache_control?: AnthropicCacheControl }
  | { type: 'image', source: { type: 'base64', media_type: string, data: string } }
  | { type: 'tool_result', tool_use_id: string, content: string, is_error?: boolean }
  | { type: 'tool_use', id: string, name: string, input: unknown }
/** content: the blocks Jean writes, or those an answer is replayed with, as they came (AnthropicStreamBlock). */
export type AnthropicMessage = { role: 'user' | 'assistant', content: (AnthropicBlock | AnthropicStreamBlock)[] }
/** A function, or the brain's own web search, which runs on Anthropic's side. */
export type AnthropicTool =
  | { type: string, name: string, max_uses: number }
  | { name: string, description: string, input_schema: object, eager_input_streaming: boolean }
/** fallbacks: on a safety refusal, the stream goes on with another model. Notes are role "system" messages on models that take them. */
export type AnthropicRequestBody = {
  model: string
  max_tokens: number
  stream?: boolean
  system?: { type: 'text', text: string, cache_control: AnthropicCacheControl }[]
  cache_control?: AnthropicCacheControl
  thinking?: { type: 'adaptive', display: 'summarized' }
  output_config?: { effort: string }
  fallbacks?: 'default'
  messages?: (AnthropicMessage | { role: 'system', content: string })[]
  tools?: AnthropicTool[]
}

/**
 * A block of the answer as it streams in, then as it is kept: text, thinking, a tool call (its input's JSON
 * gathered in `json`), or a server tool's block and its result, kept whole.
 */
export type AnthropicStreamBlock = {
  type: string
  text?: string
  thinking?: string
  signature?: string
  data?: string
  id?: string
  name?: string
  json?: string
  input?: unknown
  citations?: AnthropicCitation[]
  [key: string]: unknown
}
/** What a content_block_delta adds to its block. */
export type AnthropicDelta = { type: string, text?: string, thinking?: string, signature?: string, partial_json?: string, citation?: AnthropicCitation }
export type AnthropicUsage = { input_tokens?: number, output_tokens?: number, cache_read_input_tokens?: number, cache_creation_input_tokens?: number }
