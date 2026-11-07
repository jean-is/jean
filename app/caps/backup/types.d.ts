// The shapes of Claude's export as the code reads them; every field may be missing.

/** A message of Claude's export. */
export interface ClaudeMessage {
  uuid: string
  parent_message_uuid?: string
  created_at?: string
  sender?: string
  text?: string
  content?: { type?: string, text?: string }[]
  attachments?: { file_name?: string, extracted_content?: string }[]
}

export interface ClaudeConversation {
  uuid: string
  name?: string
  created_at?: string
  current_leaf_message_uuid?: string
  chat_messages: (ClaudeMessage | null)[]
}

export interface ClaudeProject {
  name?: string
  prompt_template?: string
  is_starter_project?: boolean
  docs?: { filename?: string, content?: string }[]
}
