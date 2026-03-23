<template>
  <div class="chat-panel">
    <!-- 消息列表 -->
    <div class="messages-container" ref="messagesContainer">
      <div v-if="messages.length === 0 && !isStreaming" class="empty-state">
        <div class="empty-icon">✨</div>
        <p class="empty-title">开始对话</p>
        <p class="empty-desc">描述你想对当前页面做的修改，AI 会生成对应的代码</p>
        <div class="quick-actions">
          <button class="quick-btn" @click="quickSend('把页面背景改为深色')">🌙 深色背景</button>
          <button class="quick-btn" @click="quickSend('隐藏页面上所有的广告')">🚫 隐藏广告</button>
          <button class="quick-btn" @click="quickSend('增大页面字体大小')">🔤 放大字体</button>
        </div>
      </div>

      <ChatMessage
        v-for="msg in messages"
        :key="msg.id"
        :message="msg"
        @apply-code="handleApplyCode"
      />

      <!-- 流式输出中 -->
      <div v-if="isStreaming" class="chat-message assistant streaming">
        <div class="message-header">
          <span class="role-label">AI</span>
          <span class="streaming-indicator">● 生成中...</span>
        </div>
        <div class="message-body">
          <p v-if="currentStreamText" class="text-block">{{ currentStreamText }}</p>
          <div v-else class="thinking-indicator">
            <span class="dot"></span><span class="dot"></span><span class="dot"></span>
          </div>
        </div>
      </div>

      <!-- 错误提示 -->
      <div v-if="error" class="error-banner">
        <span>⚠️ {{ error }}</span>
        <button class="error-close" @click="error = null">×</button>
      </div>
    </div>

    <!-- 页面信息 -->
    <div v-if="pageInfo" class="page-info-bar">
      <span class="page-info-label">📄</span>
      <span class="page-info-text" :title="pageInfo.url">{{ pageInfo.title || pageInfo.url }}</span>
      <span v-if="currentConversationTitle" class="conversation-chip" :title="currentConversationTitle">
        {{ currentConversationTitle }}
      </span>
    </div>

    <!-- 输入区域 -->
    <div class="input-area">
      <!-- 截图缩略图预览（仅在视觉模式下显示） -->
      <div v-if="visionMode && editedScreenshotUrl" class="screenshot-preview">
        <img :src="editedScreenshotUrl" alt="Screenshot" @click="openScreenshotEditor" />
        <button class="remove-screenshot" @click="editedScreenshotUrl = ''">×</button>
        <div class="edit-hint" @click="openScreenshotEditor">点击上面的图片进行标注</div>
      </div>
      <div v-else-if="visionMode && !isCapturingScreenshot" class="screenshot-preview placeholder" @click="captureAndEditScreenshot">
        <div class="placeholder-content">
          <span>📷 点击获取当前屏幕以发送或标注</span>
        </div>
      </div>
      <div v-else-if="visionMode && isCapturingScreenshot" class="screenshot-preview placeholder">
        <div class="placeholder-content">
          <span>⏳ 截图中...</span>
        </div>
      </div>

      <div class="input-wrapper">
        <textarea
          v-model="inputText"
          class="message-input"
          placeholder="描述你想修改的内容..."
          rows="1"
          @keydown.enter.exact.prevent="handleSend"
          @input="autoResize"
          ref="inputRef"
        ></textarea>
        <div class="input-actions">
          <button v-if="isStreaming" class="action-btn stop-btn" @click="stopStreaming" title="停止">
            ⏹
          </button>
          <button
            v-else
            class="action-btn send-btn"
            @click="handleSend"
            :disabled="!inputText.trim()"
            title="发送"
          >
            ➤
          </button>
        </div>
      </div>
      <div class="input-toolbar">
        <div class="toolbar-left">
          <button class="toolbar-btn" @click="clearMessages" title="清空对话">🗑️ 清空</button>
          <button class="toolbar-btn" @click="loadPageInfo" title="刷新页面信息">🔄 刷新</button>
        </div>
        <div class="toolbar-right">
          <label class="mode-toggle">
            <input type="checkbox" v-model="visionMode" />
            <span class="toggle-track"></span>
            <span class="toggle-label">👀 视觉模式</span>
          </label>
        </div>
      </div>
    </div>

    <!-- 应用代码确认弹窗 -->
    <div v-if="pendingApply" class="apply-dialog-overlay" @click.self="pendingApply = null">
      <div class="apply-dialog">
        <h3>确认应用修改</h3>
        <p class="apply-desc">
          将以下 <strong>{{ pendingApply.lang.toUpperCase() }}</strong> 代码注入到当前页面：
        </p>
        <pre class="apply-code"><code>{{ pendingApply.code }}</code></pre>
        <div class="form-group">
          <label class="form-label">补丁名称</label>
          <input v-model="pendingApply.name" class="form-input" placeholder="给这个修改起个名字" />
        </div>
        <div v-if="pendingApply.targetPatchId" class="form-group">
          <label class="form-label">应用方式</label>
          <select v-model="pendingApply.mode" class="form-input">
            <option value="update">更新当前迭代补丁</option>
            <option value="create">创建新补丁</option>
          </select>
        </div>
        <div class="apply-actions">
          <button class="btn btn-primary" @click="confirmApply">✅ 确认应用</button>
          <button class="btn btn-secondary" @click="pendingApply = null">取消</button>
        </div>
      </div>
    </div>

    <!-- 截图编辑器 -->
    <ScreenshotEditor
      v-model="editorOpen"
      :image-url="rawScreenshotUrl"
      @save="onScreenshotEdited"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, inject, nextTick, watch, type Ref } from 'vue'
import ChatMessage from './ChatMessage.vue'
import ScreenshotEditor from './ScreenshotEditor.vue'
import { useChat } from '../composables/useChat'
import { generateId } from '@/shared/storage'
import { type Patch, MessageAction } from '@/shared/types'
import type { usePatches } from '../composables/usePatches'

const {
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
  loadPageInfo,
  linkPatchToMessage,
  getLatestPatchId,
} = useChat()

const sharedCurrentUrl = inject<Ref<string>>('sharedCurrentUrl')!
const { patches, addPatch } = inject<ReturnType<typeof usePatches>>('patchesState')!

// 同步 pageInfo 的 URL 到共享的 currentUrl
watch(pageInfo, (info) => {
  if (info) sharedCurrentUrl.value = info.url
})

const messagesContainer = ref<HTMLElement>()
const inputRef = ref<HTMLTextAreaElement>()

const visionMode = ref(false)
const isCapturingScreenshot = ref(false)
const rawScreenshotUrl = ref('')
const editedScreenshotUrl = ref('')
const editorOpen = ref(false)

// 截图与编辑逻辑
async function captureScreenshot() {
  if (isCapturingScreenshot.value) return ''
  isCapturingScreenshot.value = true
  try {
    const res = await chrome.runtime.sendMessage({ action: MessageAction.CAPTURE_SCREENSHOT })
    if (res?.dataUrl) {
      return res.dataUrl
    }
  } catch (err) {
    console.warn('Failed to capture screenshot:', err)
  } finally {
    isCapturingScreenshot.value = false
  }
  return ''
}

async function captureAndEditScreenshot() {
  const url = await captureScreenshot()
  if (url) {
    rawScreenshotUrl.value = url
    editorOpen.value = true
  }
}

function openScreenshotEditor() {
  if (editedScreenshotUrl.value || rawScreenshotUrl.value) {
    if (!rawScreenshotUrl.value) rawScreenshotUrl.value = editedScreenshotUrl.value
    editorOpen.value = true
  } else {
    captureAndEditScreenshot()
  }
}

function onScreenshotEdited(dataUrl: string) {
  editedScreenshotUrl.value = dataUrl
}

async function handleSend() {
  if (!inputText.value.trim() || isStreaming.value) return

  let images: string[] | undefined = undefined

  if (visionMode.value) {
    if (editedScreenshotUrl.value) {
      images = [editedScreenshotUrl.value]
    } else {
      const url = await captureScreenshot()
      if (url) images = [url]
    }
  }

  const currentFiles = images
  editedScreenshotUrl.value = ''
  rawScreenshotUrl.value = ''

  await sendMessage(currentFiles)
}

interface PendingApply {
  lang: string
  code: string
  name: string
  mode: 'create' | 'update'
  messageId: string
  targetPatchId: string
}

const pendingApply = ref<PendingApply | null>(null)

function handleApplyCode(lang: string, code: string, messageId: string) {
  // 找到最近一条用户消息作为补丁名称
  const lastUserMsg = [...messages.value].reverse().find((m) => m.role === 'user')
  const sourceMessage = messages.value.find((message) => message.id === messageId)
  const latestPatchId = sourceMessage?.patchId || getLatestPatchId()
  const desc = lastUserMsg ? lastUserMsg.content.slice(0, 50) : '修改'
  pendingApply.value = {
    lang,
    code,
    name: desc,
    mode: latestPatchId ? 'update' : 'create',
    messageId,
    targetPatchId: latestPatchId,
  }
}

async function confirmApply() {
  if (!pendingApply.value || !pageInfo.value) return

  const existingPatch = pendingApply.value.targetPatchId
    ? patches.value.find((patch) => patch.id === pendingApply.value!.targetPatchId)
    : undefined

  const patchId = pendingApply.value.mode === 'update' && pendingApply.value.targetPatchId
    ? pendingApply.value.targetPatchId
    : generateId()

  const patch: Patch = {
    id: patchId,
    url: pageInfo.value.url,
    name: pendingApply.value.name,
    cssCode: pendingApply.value.lang === 'css'
      ? pendingApply.value.code
      : (pendingApply.value.mode === 'update' ? (existingPatch?.cssCode || '') : ''),
    jsCode: pendingApply.value.lang === 'js'
      ? pendingApply.value.code
      : (pendingApply.value.mode === 'update' ? (existingPatch?.jsCode || '') : ''),
    enabled: true,
    createdAt: existingPatch?.createdAt || Date.now(),
    conversationId: currentConversationId.value,
  }

  await addPatch(patch)
  await linkPatchToMessage(pendingApply.value.messageId, patch.id)
  pendingApply.value = null
}

function quickSend(text: string) {
  inputText.value = text
  handleSend()
}

function autoResize(event: Event) {
  const el = event.target as HTMLTextAreaElement
  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, 120) + 'px'
}

// 自动滚动到底部
watch(
  [() => messages.value.length, currentStreamText],
  () => {
    nextTick(() => {
      if (messagesContainer.value) {
        messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
      }
    })
  },
)
</script>

<style scoped>
.chat-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.messages-container {
  flex: 1;
  overflow-y: auto;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  text-align: center;
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 12px;
}

.empty-title {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 6px;
}

.empty-desc {
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 20px;
  max-width: 240px;
}

.quick-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
}

.quick-btn {
  padding: 6px 12px;
  font-size: 12px;
  background: var(--bg-card);
  color: var(--text-primary);
  border-radius: 20px;
  border: 1px solid var(--border);
  transition: all 0.2s;
}

.quick-btn:hover {
  border-color: var(--accent);
  background: var(--accent-light);
}

/* Streaming message styles */
.chat-message.streaming {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
}

.chat-message .message-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.chat-message .role-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--accent);
}

.streaming-indicator {
  font-size: 11px;
  color: var(--success);
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

.chat-message .message-body {
  font-size: 13px;
  line-height: 1.6;
}

.chat-message .text-block {
  white-space: pre-wrap;
  word-break: break-word;
}

.error-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  background: rgba(239, 68, 68, 0.15);
  color: var(--danger);
  font-size: 13px;
}

.error-close {
  background: none;
  color: var(--danger);
  font-size: 16px;
  padding: 0 4px;
}

.page-info-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 16px;
  background: var(--bg-secondary);
  border-top: 1px solid var(--border);
  font-size: 11px;
  color: var(--text-muted);
}

.page-info-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.conversation-chip {
  margin-left: auto;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--accent-light);
  color: var(--accent);
}

.input-area {
  flex-shrink: 0;
  padding: 12px 16px;
  background: var(--bg-secondary);
  border-top: 1px solid var(--border);
}

.input-wrapper {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 8px 12px;
  transition: border-color 0.2s;
}

.input-wrapper:focus-within {
  border-color: var(--accent);
}

.message-input {
  flex: 1;
  background: transparent;
  border: none;
  color: var(--text-primary);
  outline: none;
  resize: none;
  font-size: 13px;
  line-height: 1.5;
  max-height: 120px;
}

.message-input::placeholder {
  color: var(--text-muted);
}

.input-actions {
  flex-shrink: 0;
}

.action-btn {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  transition: all 0.2s;
}

.send-btn {
  background: var(--accent);
  color: white;
}

.send-btn:hover:not(:disabled) {
  background: var(--accent-hover);
}

.send-btn:disabled {
  opacity: 0.3;
}

.stop-btn {
  background: var(--danger);
  color: white;
}

.stop-btn:hover {
  background: var(--danger-hover);
}

.input-toolbar {
  display: flex;
  justify-content: space-between;
  margin-top: 8px;
}

.toolbar-left, .toolbar-right {
  display: flex;
  gap: 8px;
  align-items: center;
}

.mode-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  user-select: none;
  font-size: 11px;
  color: var(--text-muted);
}

.mode-toggle input {
  display: none;
}

.toggle-track {
  width: 28px;
  height: 16px;
  background: var(--bg-hover);
  border-radius: 8px;
  position: relative;
  transition: all 0.2s;
  border: 1px solid var(--border);
}

.toggle-track::after {
  content: '';
  position: absolute;
  top: 1px;
  left: 1px;
  width: 12px;
  height: 12px;
  background: var(--text-muted);
  border-radius: 50%;
  transition: all 0.2s;
}

.mode-toggle input:checked + .toggle-track {
  background: var(--accent);
  border-color: var(--accent);
}

.mode-toggle input:checked + .toggle-track::after {
  left: 13px;
  background: white;
}

.mode-toggle input:checked ~ .toggle-label {
  color: var(--accent);
}

/* Screenshot Preview */
.screenshot-preview {
  position: relative;
  margin-bottom: 8px;
  border-radius: 6px;
  overflow: hidden;
  max-width: 200px;
  max-height: 120px;
  border: 1px solid var(--border);
  background: var(--bg-input);
  display: flex;
  align-items: center;
  justify-content: center;
}

.screenshot-preview img {
  max-width: 100%;
  max-height: 120px;
  object-fit: contain;
  cursor: pointer;
  display: block;
}

.screenshot-preview.placeholder {
  cursor: pointer;
  padding: 16px;
  border: 1px dashed var(--border);
  background: var(--bg-hover);
}

.placeholder-content {
  font-size: 12px;
  color: var(--text-muted);
}

.remove-screenshot {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: rgba(0,0,0,0.6);
  color: white;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 14px;
  opacity: 0;
  transition: opacity 0.2s;
}

.screenshot-preview:hover .remove-screenshot {
  opacity: 1;
}

.edit-hint {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: rgba(0,0,0,0.6);
  color: white;
  font-size: 10px;
  text-align: center;
  padding: 4px 0;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.2s;
}

.screenshot-preview:hover .edit-hint {
  opacity: 1;
}

.toolbar-btn {
  font-size: 11px;
  padding: 2px 8px;
  background: transparent;
  color: var(--text-muted);
  border-radius: 4px;
  transition: all 0.2s;
}

.toolbar-btn:hover {
  background: var(--accent-light);
  color: var(--text-primary);
}

/* Apply dialog */
.apply-dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  padding: 20px;
}

.apply-dialog {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 20px;
  width: 100%;
  max-width: 400px;
  max-height: 80vh;
  overflow-y: auto;
}

.apply-dialog h3 {
  font-size: 15px;
  margin-bottom: 8px;
}

.apply-desc {
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 12px;
}

.apply-code {
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 10px 12px;
  font-family: 'Fira Code', Consolas, monospace;
  font-size: 12px;
  overflow-x: auto;
  max-height: 200px;
  overflow-y: auto;
  margin-bottom: 12px;
}

.apply-dialog .form-group {
  margin-bottom: 16px;
}

.apply-dialog .form-label {
  display: block;
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 4px;
}

.apply-dialog .form-input {
  width: 100%;
  padding: 8px 12px;
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: var(--text-primary);
  outline: none;
}

.apply-dialog .form-input:focus {
  border-color: var(--accent);
}

.apply-actions {
  display: flex;
  gap: 8px;
}

.apply-actions .btn {
  flex: 1;
  padding: 8px 16px;
  border-radius: var(--radius);
  font-size: 13px;
  font-weight: 500;
  transition: all 0.2s;
}

.apply-actions .btn-primary {
  background: var(--accent);
  color: white;
}

.apply-actions .btn-primary:hover {
  background: var(--accent-hover);
}

.apply-actions .btn-secondary {
  background: var(--bg-card);
  color: var(--text-primary);
  border: 1px solid var(--border);
}

/* Thinking indicator */
.thinking-indicator {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 20px;
  padding: 0 4px;
}

.thinking-indicator .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: var(--text-muted);
  animation: bounce 1.4s infinite ease-in-out both;
}

.thinking-indicator .dot:nth-child(1) {
  animation-delay: -0.32s;
}

.thinking-indicator .dot:nth-child(2) {
  animation-delay: -0.16s;
}

@keyframes bounce {
  0%, 80%, 100% { 
    transform: scale(0);
  } 40% { 
    transform: scale(1);
  }
}
</style>
