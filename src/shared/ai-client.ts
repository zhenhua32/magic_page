import type { ChatMessage, Settings } from './types'
import { getSettings } from './storage'

export interface StreamCallbacks {
  onChunk: (text: string) => void
  onDone: (fullText: string) => void
  onError: (error: Error) => void
}

export async function streamChat(
  messages: { role: string; content: string }[],
  callbacks: StreamCallbacks,
  settingsOverride?: Partial<Settings>,
): Promise<AbortController> {
  const settings = { ...(await getSettings()), ...settingsOverride }
  const controller = new AbortController()

  if (!settings.apiKey) {
    callbacks.onError(new Error('请先在设置中配置 API Key'))
    return controller
  }

  const apiUrl = `${settings.apiBase.replace(/\/+$/, '')}/chat/completions`

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.apiKey}`,
      },
      body: JSON.stringify({
        model: settings.model,
        messages,
        temperature: settings.temperature,
        stream: true,
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      const errorText = await response.text()
      callbacks.onError(new Error(`API 请求失败 (${response.status}): ${errorText}`))
      return controller
    }

    const reader = response.body?.getReader()
    if (!reader) {
      callbacks.onError(new Error('无法读取响应流'))
      return controller
    }

    const decoder = new TextDecoder()
    let fullText = ''
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith('data: ')) continue
        const data = trimmed.slice(6)
        if (data === '[DONE]') continue

        try {
          const parsed = JSON.parse(data)
          const delta = parsed.choices?.[0]?.delta?.content
          if (delta) {
            fullText += delta
            callbacks.onChunk(delta)
          }
        } catch {
          // skip invalid JSON lines
        }
      }
    }

    callbacks.onDone(fullText)
  } catch (err: any) {
    if (err.name !== 'AbortError') {
      callbacks.onError(err)
    }
  }

  return controller
}

/** 从 AI 响应文本中提取 CSS 和 JS 代码块 */
export function extractCodeBlocks(text: string): { css: string[]; js: string[] } {
  const css: string[] = []
  const js: string[] = []

  const codeBlockRegex = /```(css|js|javascript)\s*\n([\s\S]*?)```/gi
  let match: RegExpExecArray | null

  while ((match = codeBlockRegex.exec(text)) !== null) {
    const lang = match[1].toLowerCase()
    const code = match[2].trim()
    if (lang === 'css') {
      css.push(code)
    } else {
      js.push(code)
    }
  }

  return { css, js }
}

/** 测试 API 连接 */
export async function testConnection(settings: Partial<Settings>): Promise<boolean> {
  const full = { ...(await getSettings()), ...settings }
  const apiUrl = `${full.apiBase.replace(/\/+$/, '')}/models`

  const response = await fetch(apiUrl, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${full.apiKey}`,
    },
  })

  return response.ok
}
