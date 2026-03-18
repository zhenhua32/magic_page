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

/** 简化 DOM 树，提取关键结构信息 */
function getHtmlStructure(): string {
  const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'SVG', 'PATH', 'LINK', 'META', 'BR', 'HR', 'IMG'])
  const MAX_DEPTH = 5
  const MAX_CHILDREN = 15
  const MAX_TEXT_LEN = 80
  const MAX_TOTAL_LEN = 6000

  let totalLen = 0

  function summarize(el: Element, depth: number): string {
    if (totalLen > MAX_TOTAL_LEN) return ''
    if (depth > MAX_DEPTH) return ''
    if (SKIP_TAGS.has(el.tagName)) return ''
    if (el.hasAttribute('data-magic-patch') || el.hasAttribute('data-magic-patch-js')) return ''

    const tag = el.tagName.toLowerCase()
    const attrs: string[] = []
    if (el.id) attrs.push(`#${el.id}`)
    if (el.className && typeof el.className === 'string') {
      const classes = el.className.trim().split(/\s+/).slice(0, 3).join('.')
      if (classes) attrs.push(`.${classes}`)
    }

    const selector = tag + attrs.join('')

    // 获取直接文本内容（不包含子元素文本）
    let directText = ''
    for (const node of el.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        const t = (node.textContent || '').trim()
        if (t) directText += t + ' '
      }
    }
    directText = directText.trim()
    if (directText.length > MAX_TEXT_LEN) {
      directText = directText.slice(0, MAX_TEXT_LEN) + '...'
    }

    const children = Array.from(el.children)
    const childResults: string[] = []
    const indent = '  '.repeat(depth)

    for (let i = 0; i < Math.min(children.length, MAX_CHILDREN); i++) {
      if (totalLen > MAX_TOTAL_LEN) break
      const r = summarize(children[i], depth + 1)
      if (r) childResults.push(r)
    }
    if (children.length > MAX_CHILDREN) {
      childResults.push(`${'  '.repeat(depth + 1)}... (${children.length - MAX_CHILDREN} more)`)
    }

    let line = `${indent}<${selector}>`
    if (directText) line += ` "${directText}"`
    totalLen += line.length

    if (childResults.length > 0) {
      return line + '\n' + childResults.join('\n')
    }
    return line
  }

  return summarize(document.body, 0) || '(empty)'
}

/** 获取清理后的完整 HTML（移除 script/style 内容和注入的补丁元素） */
function getCleanHtml(): string {
  const clone = document.documentElement.cloneNode(true) as HTMLElement
  // 移除 script、style、noscript 内容
  clone.querySelectorAll('script, style, noscript, link[rel="stylesheet"]').forEach(el => el.remove())
  // 移除注入的补丁元素
  clone.querySelectorAll('[data-magic-patch], [data-magic-patch-js]').forEach(el => el.remove())
  // 移除 SVG 内容（通常很大且对修改无用）
  clone.querySelectorAll('svg').forEach(el => el.remove())
  return clone.outerHTML
}

/** 获取页面基本信息 */
function getPageInfo(): PageInfo {
  const metaDesc = document.querySelector('meta[name="description"]')
  return {
    url: location.href,
    title: document.title,
    description: metaDesc?.getAttribute('content') || '',
    fullHtml: getCleanHtml(),
    htmlStructure: getHtmlStructure(),
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
