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
  updatedAt: number
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
  maxContextTokens: number
  systemPrompt: string
}

export const DEFAULT_SETTINGS: Settings = {
  apiKey: '',
  apiBase: 'https://api.openai.com/v1',
  model: 'gpt-4o',
  temperature: 0.7,
  maxContextTokens: 256000,
  systemPrompt: `你是一个网页修改助手。用户会描述想要对当前网页进行的修改，你需要生成对应的 CSS 和/或 JavaScript 代码来实现修改。

请遵循以下规则：
1. 将 CSS 代码放在 \`\`\`css 代码块中
2. 将 JavaScript 代码放在 \`\`\`js 代码块中
3. 先用简短的文字说明你将做什么修改
4. CSS 优先：如果仅靠 CSS 就能实现，就不要使用 JS
5. JS 代码必须幂等：重复执行不能重复插入元素、重复绑定事件或造成布局错乱
6. JS 代码默认立即执行，不要只依赖 DOMContentLoaded，因为扩展注入时页面通常已经加载完成
7. 如果需要等待页面渲染，请使用 document.readyState 判断、有限次数轮询，或 MutationObserver，而不是只注册一次 DOMContentLoaded
8. 如果插入 style、script、标记节点或容器，必须添加唯一标识，避免重复注入
9. 如果要移动、替换、删除 DOM 节点，先检查目标元素是否存在，并确保重复执行不会报错
10. 对于 SPA 或异步渲染页面，优先生成“可重试、可恢复、可重复执行”的 JS
11. 不要使用 document.write、eval、Function 构造器等危险操作
12. 输出的 JS 应尽量自包含，不依赖外部库`,
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
  fullHtml: string
  htmlStructure: string
}

export interface PatchPayload {
  patchId: string
  cssCode?: string
  jsCode?: string
  enabled?: boolean
}
