import { MessageAction, type ExtensionMessage, type PatchPayload, type PageInfo } from '../shared/types'

/** 注入 CSS 到页面 */
function injectCSS(patchId: string, code: string): void {
  removeCSSForPatch(patchId)
  const style = document.createElement('style')
  style.setAttribute('data-magic-patch', patchId)
  style.textContent = code
  document.head.appendChild(style)
}

/** 注入 JS 到页面（使用 IIFE 隔离作用域） */
function injectJS(patchId: string, code: string): void {
  removeJSForPatch(patchId)
  const script = document.createElement('script')
  script.setAttribute('data-magic-patch-js', patchId)
  script.textContent = `;(function() { 'use strict';\n${code}\n})();`
  document.documentElement.appendChild(script)
  // 执行后立即移除 script 标签（代码已执行，标签不再需要）
  script.remove()
}

/** 移除指定补丁的 CSS */
function removeCSSForPatch(patchId: string): void {
  document.querySelectorAll(`style[data-magic-patch="${patchId}"]`).forEach((el) => el.remove())
}

/** 移除指定补丁的 JS 标记（注意：JS 副作用无法撤销，需要刷新页面） */
function removeJSForPatch(patchId: string): void {
  document.querySelectorAll(`script[data-magic-patch-js="${patchId}"]`).forEach((el) => el.remove())
}

/** 移除指定补丁的所有注入 */
function removePatch(patchId: string): void {
  removeCSSForPatch(patchId)
  removeJSForPatch(patchId)
}

/** 移除所有补丁 */
function removeAllPatches(): void {
  document.querySelectorAll('style[data-magic-patch]').forEach((el) => el.remove())
  document.querySelectorAll('script[data-magic-patch-js]').forEach((el) => el.remove())
}

/** 获取页面基本信息 */
function getPageInfo(): PageInfo {
  const metaDesc = document.querySelector('meta[name="description"]')
  return {
    url: location.href,
    title: document.title,
    description: metaDesc?.getAttribute('content') || '',
  }
}

// 监听来自 background 的消息
chrome.runtime.onMessage.addListener(
  (message: ExtensionMessage, _sender, sendResponse) => {
    switch (message.action) {
      case MessageAction.INJECT_PATCH: {
        const payload = message.payload as PatchPayload
        if (payload.cssCode) injectCSS(payload.patchId, payload.cssCode)
        if (payload.jsCode) injectJS(payload.patchId, payload.jsCode)
        sendResponse({ success: true })
        break
      }
      case MessageAction.REMOVE_PATCH: {
        const payload = message.payload as PatchPayload
        removePatch(payload.patchId)
        sendResponse({ success: true })
        break
      }
      case MessageAction.TOGGLE_PATCH: {
        const payload = message.payload as PatchPayload
        if (payload.enabled) {
          if (payload.cssCode) injectCSS(payload.patchId, payload.cssCode)
          if (payload.jsCode) injectJS(payload.patchId, payload.jsCode)
        } else {
          removePatch(payload.patchId)
        }
        sendResponse({ success: true })
        break
      }
      case MessageAction.GET_PAGE_INFO: {
        sendResponse(getPageInfo())
        break
      }
    }
    return true // 保持消息通道打开
  },
)
