import { ref, onMounted } from 'vue'
import type { ChatMessage, PageInfo } from '@/shared/types'
import { DEFAULT_SETTINGS } from '@/shared/types'
import { streamChat, extractCodeBlocks } from '@/shared/ai-client'
import { getConversationsForUrl, getSettings, saveConversation, deleteConversation } from '@/shared/storage'
import { generateId } from '@/shared/storage'
import { requestPageInfo } from '@/shared/messaging'

export function useChat() {
  const messages = ref<ChatMessage[]>([])
  const inputText = ref('')
  const isStreaming = ref(false)
  const currentStreamText = ref('')
  const pageInfo = ref<PageInfo | null>(null)
  const error = ref<string | null>(null)
  const currentConversationId = ref('')
  const currentConversationTitle = ref('')
  const currentPatchIds = ref<string[]>([])
  const currentConversationCreatedAt = ref(0)

  let abortController: AbortController | null = null

  function normalizePageInfo(value: PageInfo | null | undefined): PageInfo | null {
    if (!value) return null

    return {
      url: value.url || '',
      title: value.title || '',
      description: value.description || '',
      fullHtml: value.fullHtml || '',
      htmlStructure: value.htmlStructure || '',
    }
  }

  async function loadPageInfo() {
    try {
      const info = await requestPageInfo()
      pageInfo.value = normalizePageInfo(info)
      await loadConversationForUrl(pageInfo.value?.url || '')
    } catch {
      // side panel 可能在无标签页时打开
    }
  }

  async function loadConversationForUrl(url: string) {
    const conversations = await getConversationsForUrl(url)
    const latestConversation = conversations[0]

    if (!latestConversation) {
      currentConversationId.value = ''
      currentConversationTitle.value = ''
      currentConversationCreatedAt.value = 0
      currentPatchIds.value = []
      messages.value = []
      return
    }

    currentConversationId.value = latestConversation.id
    currentConversationTitle.value = latestConversation.title
    currentConversationCreatedAt.value = latestConversation.createdAt || Date.now()
    currentPatchIds.value = normalizePatchIds(latestConversation.patchIds)
    messages.value = normalizeMessages(latestConversation.messages)
  }

  async function persistConversation(nextMessages = messages.value) {
    if (!pageInfo.value) return

    const normalizedMessages = normalizeMessages(nextMessages)
    const normalizedPatchIds = normalizePatchIds(currentPatchIds.value)
    if (normalizedMessages.length === 0) return

    const conversationId = currentConversationId.value || generateId()
    const firstUserMessage = normalizedMessages.find((message) => message.role === 'user')
    const title = firstUserMessage?.content.slice(0, 30) || pageInfo.value.title || '未命名对话'
    const now = Date.now()

    currentConversationId.value = conversationId
    currentConversationTitle.value = title
    currentConversationCreatedAt.value = currentConversationCreatedAt.value || now
    messages.value = normalizedMessages
    currentPatchIds.value = normalizedPatchIds

    await saveConversation({
      id: conversationId,
      url: pageInfo.value.url,
      title,
      messages: normalizedMessages,
      patchIds: normalizedPatchIds,
      createdAt: currentConversationCreatedAt.value,
      updatedAt: now,
    })
  }

  function normalizeMessages(value: unknown): ChatMessage[] {
    const candidates = Array.isArray(value)
      ? value
      : value && typeof value === 'object'
        ? Object.values(value as Record<string, unknown>)
        : []

    return candidates
      .filter(
        (item): item is ChatMessage =>
          !!item &&
          typeof item === 'object' &&
          typeof (item as ChatMessage).id === 'string' &&
          typeof (item as ChatMessage).role === 'string' &&
          typeof (item as ChatMessage).content === 'string',
      )
      .sort((a, b) => a.timestamp - b.timestamp)
  }

  function normalizePatchIds(value: unknown): string[] {
    if (Array.isArray(value)) {
      return value.filter((item): item is string => typeof item === 'string')
    }

    if (typeof value === 'string' && value) {
      return [value]
    }

    return []
  }

  function ensureConversationState() {
    if (!Array.isArray(messages.value)) {
      messages.value = normalizeMessages(messages.value)
    }

    if (!Array.isArray(currentPatchIds.value)) {
      currentPatchIds.value = normalizePatchIds(currentPatchIds.value)
    }
  }

  /** 粗略估算 token 数（中文约 1.5 token/字符，英文约 0.25 token/单词） */
  function estimateTokens(text: string): number {
    return Math.ceil((text || '').length / 2.5)
  }

  function buildSystemPrompt(settings: { systemPrompt: string; maxContextTokens: number }): string {
    let prompt = settings.systemPrompt || DEFAULT_SETTINGS.systemPrompt
    const currentPageInfo = normalizePageInfo(pageInfo.value)
    if (!currentPageInfo) return prompt

    const maxTokens = settings.maxContextTokens || DEFAULT_SETTINGS.maxContextTokens
    // 为对话消息和 AI 回复预留空间（约 30%）
    const tokenBudgetForPage = Math.floor(maxTokens * 0.7)

    const pageHeader = `\n\n当前页面信息：\n- URL: ${currentPageInfo.url}\n- 标题: ${currentPageInfo.title}\n- 描述: ${currentPageInfo.description || '无'}\n\n`

    const baseTokens = estimateTokens(prompt) + estimateTokens(pageHeader)
    const remainingBudget = tokenBudgetForPage - baseTokens

    if (remainingBudget <= 0) {
      return prompt + pageHeader
    }

    // 优先使用完整 HTML
    const fullHtml = currentPageInfo.fullHtml || ''
    const fullHtmlTokens = estimateTokens(fullHtml)

    if (fullHtmlTokens <= remainingBudget) {
      // 完整 HTML 放得下，直接使用
      prompt += pageHeader + `页面完整 HTML：\n${fullHtml}`
    } else {
      // 完整 HTML 太大，尝试截断
      const charBudget = Math.floor(remainingBudget * 2.5)
      if (charBudget > 2000) {
        // 截断 HTML 但保留尽可能多的内容
        const truncatedHtml = fullHtml.slice(0, charBudget)
        prompt += pageHeader + `页面 HTML（已截断前 ${Math.floor(charBudget / 1000)}k 字符）：\n${truncatedHtml}\n... (已截断)`
      } else {
        // 预算非常有限，回退到简化结构
        const structure = currentPageInfo.htmlStructure || '(empty)'
        prompt += pageHeader + `页面 DOM 结构（简化）：\n${structure}`
      }
    }

    return prompt
  }

  async function sendMessage(images?: string[]) {
    const text = inputText.value.trim()
    if (!text || isStreaming.value) return

    error.value = null
    ensureConversationState()

    // 添加用户消息
    const userMsg: ChatMessage = {
      id: generateId(),
      role: 'user',
      content: text,
      timestamp: Date.now(),
      ...(images?.length ? { images } : {}),
    }
    messages.value.push(userMsg)
    inputText.value = ''
    await persistConversation(messages.value)

    // 开始流式请求
    isStreaming.value = true
    currentStreamText.value = ''

    const settings = await getSettings()
    const systemPrompt = buildSystemPrompt(settings)

    const apiMessages = [
      { role: 'system', content: systemPrompt },
      ...messages.value
        .filter((m) => m.role !== 'system')
        .map((m) => {
          if (m.images && m.images.length > 0) {
            return {
              role: m.role,
              content: [
                { type: 'text', text: m.content },
                ...m.images.map(url => ({ type: 'image_url', image_url: { url } }))
              ]
            };
          }
          return { role: m.role, content: m.content };
        }),
    ]

    abortController = await streamChat(apiMessages, {
      onChunk(chunk) {
        currentStreamText.value += chunk
      },
      onDone(fullText) {
        const assistantMsg: ChatMessage = {
          id: generateId(),
          role: 'assistant',
          content: fullText,
          timestamp: Date.now(),
        }
        messages.value.push(assistantMsg)
        void persistConversation(messages.value)
        currentStreamText.value = ''
        isStreaming.value = false
      },
      onError(err) {
        error.value = err.message
        isStreaming.value = false
        currentStreamText.value = ''
      },
    })
  }

  function stopStreaming() {
    ensureConversationState()
    abortController?.abort()
    if (currentStreamText.value) {
      const assistantMsg: ChatMessage = {
        id: generateId(),
        role: 'assistant',
        content: currentStreamText.value,
        timestamp: Date.now(),
      }
      messages.value.push(assistantMsg)
      void persistConversation(messages.value)
    }
    currentStreamText.value = ''
    isStreaming.value = false
  }

  async function clearMessages() {
    const conversationId = currentConversationId.value
    messages.value = []
    currentStreamText.value = ''
    error.value = null
    currentConversationId.value = ''
    currentConversationTitle.value = ''
    currentConversationCreatedAt.value = 0
    currentPatchIds.value = []
    if (conversationId) {
      await deleteConversation(conversationId)
    }
  }

  async function linkPatchToMessage(messageId: string, patchId: string) {
    ensureConversationState()
    const targetMessage = messages.value.find((message) => message.id === messageId)
    if (!targetMessage) return

    targetMessage.patchId = patchId
    currentPatchIds.value = currentPatchIds.value.filter((id) => id !== patchId)
    currentPatchIds.value.push(patchId)

    await persistConversation(messages.value)
  }

  function getLatestPatchId() {
    return currentPatchIds.value[currentPatchIds.value.length - 1] || ''
  }

  function extractCodeFromMessage(content: string) {
    return extractCodeBlocks(content)
  }

  onMounted(loadPageInfo)

  return {
    messages,
    inputText,
    isStreaming,
    currentStreamText,
    pageInfo,
    error,
    currentConversationId,
    currentConversationTitle,
    sendMessage,
    stopStreaming,
    clearMessages,
    extractCodeFromMessage,
    loadPageInfo,
    linkPatchToMessage,
    getLatestPatchId,
  }
}
