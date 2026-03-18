<template>
  <div class="chat-message" :class="[message.role]">
    <div class="message-header">
      <span class="role-label">{{ message.role === 'user' ? '你' : 'AI' }}</span>
      <span class="timestamp">{{ formatTime(message.timestamp) }}</span>
    </div>
    <div class="message-body">
      <!-- 纯文本部分 -->
      <template v-for="(block, i) in parsedContent" :key="i">
        <p v-if="block.type === 'text'" class="text-block">{{ block.content }}</p>
        <div v-else class="code-block">
          <div class="code-header">
            <span class="code-lang">{{ block.lang }}</span>
            <button
              v-if="message.role === 'assistant'"
              class="apply-btn"
              @click="$emit('applyCode', block.lang, block.content)"
            >
              ▶ 应用此修改
            </button>
          </div>
          <pre class="code-content"><code>{{ block.content }}</code></pre>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { ChatMessage } from '@/shared/types'

const props = defineProps<{
  message: ChatMessage
}>()

defineEmits<{
  applyCode: [lang: string, code: string]
}>()

interface ContentBlock {
  type: 'text' | 'code'
  content: string
  lang?: string
}

const parsedContent = computed<ContentBlock[]>(() => {
  const text = props.message.content
  const blocks: ContentBlock[] = []
  const codeRegex = /```(css|js|javascript)\s*\n([\s\S]*?)```/gi
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = codeRegex.exec(text)) !== null) {
    // 代码块前面的文本
    if (match.index > lastIndex) {
      const textContent = text.slice(lastIndex, match.index).trim()
      if (textContent) {
        blocks.push({ type: 'text', content: textContent })
      }
    }
    // 代码块
    blocks.push({
      type: 'code',
      lang: match[1].toLowerCase() === 'javascript' ? 'js' : match[1].toLowerCase(),
      content: match[2].trim(),
    })
    lastIndex = match.index + match[0].length
  }

  // 剩余文本
  if (lastIndex < text.length) {
    const remaining = text.slice(lastIndex).trim()
    if (remaining) {
      blocks.push({ type: 'text', content: remaining })
    }
  }

  // 如果没有代码块，返回整段文本
  if (blocks.length === 0) {
    blocks.push({ type: 'text', content: text })
  }

  return blocks
})

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  })
}
</script>

<style scoped>
.chat-message {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
}

.chat-message.user {
  background: var(--accent-light);
}

.chat-message.assistant {
  background: transparent;
}

.message-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.role-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--accent);
}

.user .role-label {
  color: var(--text-primary);
}

.timestamp {
  font-size: 11px;
  color: var(--text-muted);
}

.message-body {
  font-size: 13px;
  line-height: 1.6;
}

.text-block {
  margin-bottom: 8px;
  white-space: pre-wrap;
  word-break: break-word;
}

.code-block {
  margin: 8px 0;
  border-radius: var(--radius);
  overflow: hidden;
  border: 1px solid var(--border);
}

.code-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 10px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border);
}

.code-lang {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
}

.apply-btn {
  font-size: 11px;
  padding: 2px 8px;
  background: var(--accent);
  color: white;
  border-radius: 4px;
  transition: background 0.2s;
}

.apply-btn:hover {
  background: var(--accent-hover);
}

.code-content {
  padding: 10px 12px;
  background: var(--bg-input);
  overflow-x: auto;
  font-family: 'Fira Code', 'Cascadia Code', Consolas, monospace;
  font-size: 12px;
  line-height: 1.5;
  margin: 0;
}

.code-content code {
  color: var(--text-primary);
}
</style>
