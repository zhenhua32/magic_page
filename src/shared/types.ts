// ===== 核心数据结构 =====

export interface Patch {
  id: string
  url: string
  name: string
  cssCode: string
  jsCode: string
  enabled: boolean
  createdAt: number
  conversationId: string
}

export interface Conversation {
  id: string
  url: string
  title: string
  messages: ChatMessage[]
  patchIds: string[]
  createdAt: number
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
  patchId?: string
}

export interface Settings {
  apiKey: string
  apiBase: string
  model: string
  temperature: number
  systemPrompt: string
}

export const DEFAULT_SETTINGS: Settings = {
  apiKey: '',
  apiBase: 'https://api.openai.com/v1',
  model: 'gpt-4o',
  temperature: 0.7,
  systemPrompt: `你是一个网页修改助手。用户会描述想要对当前网页进行的修改，你需要生成对应的 CSS 和/或 JavaScript 代码来实现修改。

请遵循以下规则：
1. 将 CSS 代码放在 \`\`\`css 代码块中
2. 将 JavaScript 代码放在 \`\`\`js 代码块中
3. 先用简短的文字说明你将做什么修改
4. CSS 优先：如果仅靠 CSS 就能实现，就不要使用 JS
5. JS 代码应该是幂等的（多次执行不会产生副作用）
6. 不要使用 document.write 或 eval 等危险操作`,
}

// ===== Chrome 消息通信 =====

export enum MessageAction {
  GET_PAGE_INFO = 'GET_PAGE_INFO',
  INJECT_PATCH = 'INJECT_PATCH',
  REMOVE_PATCH = 'REMOVE_PATCH',
  TOGGLE_PATCH = 'TOGGLE_PATCH',
  GET_ACTIVE_TAB = 'GET_ACTIVE_TAB',
  PAGE_INFO_RESPONSE = 'PAGE_INFO_RESPONSE',
}

export interface ExtensionMessage {
  action: MessageAction
  payload?: any
}

export interface PageInfo {
  url: string
  title: string
  description: string
}

export interface PatchPayload {
  patchId: string
  cssCode?: string
  jsCode?: string
  enabled?: boolean
}
