import { ref, computed, onMounted } from 'vue'
import type { ChatMessage, Patch, PageInfo } from '@/shared/types'
import { DEFAULT_SETTINGS } from '@/shared/types'
import { streamChat, extractCodeBlocks } from '@/shared/ai-client'
import { getSettings } from '@/shared/storage'
import { generateId } from '@/shared/storage'
import { requestPageInfo } from '@/shared/messaging'

export function useChat() {
  const messages = ref<ChatMessage[]>([])
  const inputText = ref('')
  const isStreaming = ref(false)
  const currentStreamText = ref('')
  const pageInfo = ref<PageInfo | null>(null)
  const error = ref<string | null>(null)

  let abortController: AbortController | null = null

  async function loadPageInfo() {
    try {
      pageInfo.value = await requestPageInfo()
    } catch {
      // side panel 可能在无标签页时打开
    }
  }

  /** 粗略估算 token 数（中文约 1.5 token/字符，英文约 0.25 token/单词） */
  function estimateTokens(text: string): number {
    return Math.ceil(text.length / 2.5)
  }

  function buildSystemPrompt(settings: { systemPrompt: string; maxContextTokens: number }): string {
    let prompt = settings.systemPrompt || DEFAULT_SETTINGS.systemPrompt
    if (!pageInfo.value) return prompt

    const maxTokens = settings.maxContextTokens || DEFAULT_SETTINGS.maxContextTokens
    // 为对话消息和 AI 回复预留空间（约 30%）
    const tokenBudgetForPage = Math.floor(maxTokens * 0.7)

    const pageHeader = `\n\n当前页面信息：\n- URL: ${pageInfo.value.url}\n- 标题: ${pageInfo.value.title}\n- 描述: ${pageInfo.value.description || '无'}\n\n`

    const baseTokens = estimateTokens(prompt) + estimateTokens(pageHeader)
    const remainingBudget = tokenBudgetForPage - baseTokens

    if (remainingBudget <= 0) {
      return prompt + pageHeader
    }

    // 优先使用完整 HTML
    const fullHtml = pageInfo.value.fullHtml
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
        const structure = pageInfo.value.htmlStructure
        prompt += pageHeader + `页面 DOM 结构（简化）：\n${structure}`
      }
    }

    return prompt
  }

  async function sendMessage() {
    const text = inputText.value.trim()
    if (!text || isStreaming.value) return

    error.value = null

    // 添加用户消息
    const userMsg: ChatMessage = {
      id: generateId(),
      role: 'user',
      content: text,
      timestamp: Date.now(),
    }
    messages.value.push(userMsg)
    inputText.value = ''

    // 开始流式请求
    isStreaming.value = true
    currentStreamText.value = ''

    const settings = await getSettings()
    const systemPrompt = buildSystemPrompt(settings)

    const apiMessages = [
      { role: 'system', content: systemPrompt },
      ...messages.value
        .filter((m) => m.role !== 'system')
        .map((m) => ({ role: m.role, content: m.content })),
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
    abortController?.abort()
    if (currentStreamText.value) {
      const assistantMsg: ChatMessage = {
        id: generateId(),
        role: 'assistant',
        content: currentStreamText.value,
        timestamp: Date.now(),
      }
      messages.value.push(assistantMsg)
    }
    currentStreamText.value = ''
    isStreaming.value = false
  }

  function clearMessages() {
    messages.value = []
    currentStreamText.value = ''
    error.value = null
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
    sendMessage,
    stopStreaming,
    clearMessages,
    extractCodeFromMessage,
    loadPageInfo,
  }
}
