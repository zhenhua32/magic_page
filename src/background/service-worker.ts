import { MessageAction, type ExtensionMessage, type PatchPayload } from '../shared/types'
import { getPatchesForUrl, getPatch } from '../shared/storage'

// 按窗口记录当前由用户主动打开过面板的 tab
const openPanelTabByWindow = new Map<number, number>()

// 禁用全局 side panel，并关闭内置点击打开行为，只保留按 tab 打开的面板
void chrome.sidePanel
  .setOptions({
    enabled: false,
    path: 'src/sidepanel/index.html',
  })
  .catch(console.error)

void chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: false })
  .catch(console.error)

// 点击扩展图标时打开 Side Panel
// 注意：open 必须在用户点击触发的调用链中执行，不能在 await 之后调用
chrome.action.onClicked.addListener((tab) => {
  if (!tab.id || !tab.windowId) return

  const previousTabId = openPanelTabByWindow.get(tab.windowId)
  if (previousTabId && previousTabId !== tab.id) {
    void chrome.sidePanel.setOptions({
      tabId: previousTabId,
      path: 'src/sidepanel/index.html',
      enabled: false,
    })
  }

  openPanelTabByWindow.set(tab.windowId, tab.id)

  void chrome.sidePanel.setOptions({
    tabId: tab.id,
    path: 'src/sidepanel/index.html',
    enabled: true,
  })

  void chrome.sidePanel.open({ tabId: tab.id }).catch(console.error)
})

// 切换 tab 时只禁用当前激活的非目标 tab。
// 已打开面板的原 tab 保持 enabled，这样切回去时 Chrome 会自动恢复显示。
chrome.tabs.onActivated.addListener(async ({ tabId, windowId }) => {
  const openTabId = openPanelTabByWindow.get(windowId)

  if (openTabId === tabId) {
    await chrome.sidePanel.setOptions({
      tabId,
      path: 'src/sidepanel/index.html',
      enabled: true,
    })
    return
  }

  await chrome.sidePanel.setOptions({
    tabId,
    path: 'src/sidepanel/index.html',
    enabled: false,
  })
})

// tab 关闭时清理记录
chrome.tabs.onRemoved.addListener((tabId) => {
  for (const [windowId, openTabId] of openPanelTabByWindow.entries()) {
    if (openTabId === tabId) {
      openPanelTabByWindow.delete(windowId)
    }
  }
})

// 监听来自 Side Panel 的消息并转发到 Content Script
chrome.runtime.onMessage.addListener(
  (message: ExtensionMessage & { action: string }, sender, sendResponse) => {
    // 编辑器弹窗的消息需要广播给侧边栏
    if (message.action === 'EDITOR_DONE' || message.action === 'EDITOR_CANCELLED') {
      // 转发给所有其他 extension 页面（侧边栏会收到）
      chrome.runtime.sendMessage(message).catch(() => {})
      sendResponse({ ok: true })
      return false
    }
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

    case MessageAction.CAPTURE_SCREENSHOT: {
      const tab = await getActiveTabInfo()
      if (!tab || !tab.windowId) throw new Error('无法获取当前标签页')
      const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'jpeg', quality: 60 })
      return { dataUrl }
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
