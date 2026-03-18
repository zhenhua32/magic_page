import { MessageAction, type ExtensionMessage, type PatchPayload, type PageInfo } from './types'

/** 发送消息到 background service worker */
export function sendToBackground(message: ExtensionMessage): Promise<any> {
  return chrome.runtime.sendMessage(message)
}

/** 发送消息到指定 tab 的 content script */
export async function sendToContentScript(tabId: number, message: ExtensionMessage): Promise<any> {
  return chrome.tabs.sendMessage(tabId, message)
}

/** 获取当前活跃 tab */
export async function getActiveTab(): Promise<chrome.tabs.Tab | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  return tab
}

/** 请求当前页面信息 */
export async function requestPageInfo(): Promise<PageInfo> {
  return sendToBackground({ action: MessageAction.GET_PAGE_INFO })
}

/** 请求注入补丁到当前页面 */
export async function requestInjectPatch(payload: PatchPayload): Promise<void> {
  return sendToBackground({
    action: MessageAction.INJECT_PATCH,
    payload,
  })
}

/** 请求移除补丁 */
export async function requestRemovePatch(patchId: string): Promise<void> {
  return sendToBackground({
    action: MessageAction.REMOVE_PATCH,
    payload: { patchId },
  })
}

/** 请求切换补丁状态 */
export async function requestTogglePatch(patchId: string, enabled: boolean): Promise<void> {
  return sendToBackground({
    action: MessageAction.TOGGLE_PATCH,
    payload: { patchId, enabled },
  })
}
