import { MessageAction, type ExtensionMessage, type PatchPayload } from '../shared/types'
import { getPatchesForUrl, getPatch } from '../shared/storage'

// 点击扩展图标时打开 Side Panel
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch(console.error)

// 监听来自 Side Panel 的消息并转发到 Content Script
chrome.runtime.onMessage.addListener(
  (message: ExtensionMessage, sender, sendResponse) => {
    handleMessage(message, sender).then(sendResponse).catch((err) => {
      sendResponse({ error: err.message })
    })
    return true // 异步响应
  },
)

async function handleMessage(message: ExtensionMessage, sender: chrome.runtime.MessageSender) {
  switch (message.action) {
    case MessageAction.GET_PAGE_INFO: {
      const tab = await getActiveTabInfo()
      if (!tab?.id) throw new Error('无法获取当前标签页')
      return chrome.tabs.sendMessage(tab.id, {
        action: MessageAction.GET_PAGE_INFO,
      })
    }

    case MessageAction.INJECT_PATCH: {
      const tab = await getActiveTabInfo()
      if (!tab?.id) throw new Error('无法获取当前标签页')
      return chrome.tabs.sendMessage(tab.id, message)
    }

    case MessageAction.REMOVE_PATCH: {
      const tab = await getActiveTabInfo()
      if (!tab?.id) throw new Error('无法获取当前标签页')
      return chrome.tabs.sendMessage(tab.id, message)
    }

    case MessageAction.TOGGLE_PATCH: {
      const tab = await getActiveTabInfo()
      if (!tab?.id) throw new Error('无法获取当前标签页')
      const payload = message.payload as PatchPayload
      // 如果是启用操作，需要获取补丁的完整代码
      if (payload.enabled && !payload.cssCode && !payload.jsCode) {
        const patch = await getPatch(payload.patchId)
        if (patch) {
          payload.cssCode = patch.cssCode
          payload.jsCode = patch.jsCode
        }
      }
      return chrome.tabs.sendMessage(tab.id, {
        action: MessageAction.TOGGLE_PATCH,
        payload,
      })
    }

    case MessageAction.GET_ACTIVE_TAB: {
      return getActiveTabInfo()
    }

    default:
      throw new Error(`Unknown action: ${message.action}`)
  }
}

async function getActiveTabInfo(): Promise<chrome.tabs.Tab | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  return tab
}

// 页面加载完成时自动注入已保存的补丁
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete' || !tab.url) return

  // 跳过 chrome:// 等内部页面
  if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) return

  try {
    const patches = await getPatchesForUrl(tab.url)
    const enabledPatches = patches.filter((p) => p.enabled)

    for (const patch of enabledPatches) {
      try {
        await chrome.tabs.sendMessage(tabId, {
          action: MessageAction.INJECT_PATCH,
          payload: {
            patchId: patch.id,
            cssCode: patch.cssCode,
            jsCode: patch.jsCode,
          } as PatchPayload,
        })
      } catch {
        // content script 可能尚未加载，忽略
      }
    }
  } catch {
    // storage 读取失败时忽略
  }
})
