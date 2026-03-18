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

  function buildSystemPrompt(settings: { systemPrompt: string }): string {
    let prompt = settings.systemPrompt || DEFAULT_SETTINGS.systemPrompt
    if (pageInfo.value) {
      prompt += `\n\n当前页面信息：
- URL: ${pageInfo.value.url}
- 标题: ${pageInfo.value.title}
- 描述: ${pageInfo.value.description || '无'}`
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
