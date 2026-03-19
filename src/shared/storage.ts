import type { Settings, Patch, Conversation } from './types'
import { DEFAULT_SETTINGS } from './types'

// ===== Settings (chrome.storage.sync) =====

export async function getSettings(): Promise<Settings> {
  const result = await chrome.storage.sync.get('settings')
  return { ...DEFAULT_SETTINGS, ...result.settings }
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
