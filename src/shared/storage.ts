import type { Settings, Patch, Conversation } from './types'
import { DEFAULT_SETTINGS } from './types'

const LEGACY_DEFAULT_SYSTEM_PROMPT = `你是一个网页修改助手。用户会描述想要对当前网页进行的修改，你需要生成对应的 CSS 和/或 JavaScript 代码来实现修改。

请遵循以下规则：
1. 将 CSS 代码放在 \`\`\`css 代码块中
2. 将 JavaScript 代码放在 \`\`\`js 代码块中
3. 先用简短的文字说明你将做什么修改
4. CSS 优先：如果仅靠 CSS 就能实现，就不要使用 JS
5. JS 代码应该是幂等的（多次执行不会产生副作用）
6. 不要使用 document.write 或 eval 等危险操作`

// ===== Settings (chrome.storage.sync) =====

export async function getSettings(): Promise<Settings> {
  const result = await chrome.storage.sync.get('settings')
  const merged = { ...DEFAULT_SETTINGS, ...result.settings }

  if (!result.settings?.systemPrompt || result.settings.systemPrompt === LEGACY_DEFAULT_SYSTEM_PROMPT) {
    merged.systemPrompt = DEFAULT_SETTINGS.systemPrompt
  }

  return merged
}

export async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.sync.set({ settings })
}

// ===== Patches (chrome.storage.local) =====

async function getAllPatches(): Promise<Record<string, Patch>> {
  const result = await chrome.storage.local.get('patches')
  return result.patches || {}
}

async function setAllPatches(patches: Record<string, Patch>): Promise<void> {
  await chrome.storage.local.set({ patches })
}

export async function getPatchesForUrl(url: string): Promise<Patch[]> {
  const all = await getAllPatches()
  return Object.values(all).filter((p) => p.url === url)
}

export async function getPatch(id: string): Promise<Patch | undefined> {
  const all = await getAllPatches()
  return all[id]
}

export async function savePatch(patch: Patch): Promise<void> {
  const all = await getAllPatches()
  all[patch.id] = patch
  await setAllPatches(all)
}

export async function deletePatch(id: string): Promise<void> {
  const all = await getAllPatches()
  delete all[id]
  await setAllPatches(all)
}

export async function togglePatch(id: string, enabled: boolean): Promise<void> {
  const all = await getAllPatches()
  if (all[id]) {
    all[id].enabled = enabled
    await setAllPatches(all)
  }
}

// ===== Conversations (chrome.storage.local) =====

async function getAllConversations(): Promise<Record<string, Conversation>> {
  const result = await chrome.storage.local.get('conversations')
  return result.conversations || {}
}

async function setAllConversations(conversations: Record<string, Conversation>): Promise<void> {
  await chrome.storage.local.set({ conversations })
}

export async function getConversationsForUrl(url: string): Promise<Conversation[]> {
  const all = await getAllConversations()
  return Object.values(all)
    .filter((c) => c.url === url)
    .sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt))
}

export async function getConversation(id: string): Promise<Conversation | undefined> {
  const all = await getAllConversations()
  return all[id]
}

export async function saveConversation(conversation: Conversation): Promise<void> {
  const all = await getAllConversations()
  all[conversation.id] = {
    ...conversation,
    updatedAt: conversation.updatedAt || Date.now(),
  }
  await setAllConversations(all)
}

export async function deleteConversation(id: string): Promise<void> {
  const all = await getAllConversations()
  delete all[id]
  await setAllConversations(all)
}

// ===== Utilities =====

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}
