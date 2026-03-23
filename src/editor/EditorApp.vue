<template>
  <div class="editor-fullscreen">
    <div class="editor-header">
      <h3 class="editor-title">编辑截图</h3>
      <div class="editor-tools">
        <button
          class="tool-btn"
          :class="{ active: currentTool === 'pen' }"
          @click="setTool('pen')"
          title="画笔"
        >
          ✏️
        </button>
        <button
          class="tool-btn"
          :class="{ active: currentTool === 'rect' }"
          @click="setTool('rect')"
          title="矩形框"
        >
          🔲
        </button>
        <div class="divider"></div>
        <button class="tool-btn" @click="undo" title="撤销">↩️</button>
        <button class="tool-btn" @click="clear" title="清空标注">🗑️</button>
      </div>
      <div class="editor-actions">
        <button class="btn btn-secondary" @click="cancel">取消</button>
        <button class="btn btn-primary" @click="save">完成</button>
      </div>
    </div>
    <div class="canvas-wrapper" ref="wrapperRef">
      <canvas ref="canvasRef"></canvas>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import * as fabric from 'fabric'

const canvasRef = ref<HTMLCanvasElement | null>(null)
const wrapperRef = ref<HTMLElement | null>(null)
let fabricCanvas: fabric.Canvas | null = null
const currentTool = ref<'pen' | 'rect'>('pen')

const objectHistory: string[][] = []
let isHistoryAction = false
let backgroundImg: fabric.FabricImage | null = null

onMounted(async () => {
  // 从 chrome.storage.session 获取截图数据
  const data = await chrome.storage.session.get('screenshotForEditor')
  const imageUrl = data.screenshotForEditor as string
  if (!imageUrl) {
    window.close()
    return
  }
  initCanvas(imageUrl)
})

async function initCanvas(imageUrl: string) {
  if (!canvasRef.value || !wrapperRef.value) return

  const maxWidth = wrapperRef.value.clientWidth - 32
  const maxHeight = wrapperRef.value.clientHeight - 32

  fabricCanvas = new fabric.Canvas(canvasRef.value, {
    isDrawingMode: true,
  })

  fabricCanvas.freeDrawingBrush = new fabric.PencilBrush(fabricCanvas)
  fabricCanvas.freeDrawingBrush.color = 'red'
  fabricCanvas.freeDrawingBrush.width = 3

  try {
    let loadUrl = imageUrl
    if (imageUrl.startsWith('data:')) {
      try {
        const res = await fetch(imageUrl)
        const blob = await res.blob()
        loadUrl = URL.createObjectURL(blob)
      } catch {
        // fallback
      }
    }
    const img = await fabric.FabricImage.fromURL(loadUrl)

    // Fabric.js v7 默认 originX/originY 为 'center'，需要改为左上角对齐
    img.set({
      originX: 'left',
      originY: 'top',
      left: 0,
      top: 0,
    })

    // 同时按宽高缩放以适应窗口，保持比例
    const scale = Math.min(maxWidth / img.width!, maxHeight / img.height!, 1)

    const canvasWidth = img.width! * scale
    const canvasHeight = img.height! * scale
    fabricCanvas.setDimensions({ width: canvasWidth, height: canvasHeight })

    img.scale(scale)
    fabricCanvas.backgroundImage = img
    backgroundImg = img
    fabricCanvas.renderAll()

    setupEvents()
    saveHistory()
  } catch (err) {
    console.error('Failed to load image:', err)
  }
}

function setupEvents() {
  if (!fabricCanvas) return

  fabricCanvas.on('path:created', () => {
    if (!isHistoryAction) saveHistory()
  })

  fabricCanvas.on('object:added', (e) => {
    if (!isHistoryAction && e.target && e.target.type !== 'path') {
      saveHistory()
    }
  })

  fabricCanvas.on('object:modified', () => {
    if (!isHistoryAction) saveHistory()
  })

  let isDrawingRect = false
  let rect: fabric.Rect | null = null
  let origX = 0
  let origY = 0

  fabricCanvas.on('mouse:down', (o) => {
    if (currentTool.value !== 'rect' || !fabricCanvas) return
    isDrawingRect = true
    const pointer = fabricCanvas.getViewportPoint(o.e)
    origX = pointer.x
    origY = pointer.y
    rect = new fabric.Rect({
      left: origX,
      top: origY,
      originX: 'left',
      originY: 'top',
      width: 0,
      height: 0,
      angle: 0,
      fill: 'transparent',
      stroke: 'red',
      strokeWidth: 3,
      selectable: false,
    })
    fabricCanvas.add(rect)
  })

  fabricCanvas.on('mouse:move', (o) => {
    if (!isDrawingRect || !rect || !fabricCanvas) return
    const pointer = fabricCanvas.getViewportPoint(o.e)

    if (origX > pointer.x) rect.set({ left: Math.abs(pointer.x) })
    if (origY > pointer.y) rect.set({ top: Math.abs(pointer.y) })

    rect.set({ width: Math.abs(origX - pointer.x) })
    rect.set({ height: Math.abs(origY - pointer.y) })

    fabricCanvas.renderAll()
  })

  fabricCanvas.on('mouse:up', () => {
    if (currentTool.value !== 'rect') return
    isDrawingRect = false
    if (rect) {
      rect.setCoords()
      rect = null
      saveHistory()
    }
  })
}

function setTool(tool: 'pen' | 'rect') {
  currentTool.value = tool
  if (!fabricCanvas) return

  if (tool === 'pen') {
    fabricCanvas.isDrawingMode = true
    fabricCanvas.selection = false
    fabricCanvas.defaultCursor = 'crosshair'
  } else {
    fabricCanvas.isDrawingMode = false
    fabricCanvas.selection = true
    fabricCanvas.defaultCursor = 'crosshair'
  }
}

function saveHistory() {
  if (!fabricCanvas) return
  const objects = fabricCanvas.getObjects().map(obj => JSON.stringify(obj.toJSON()))
  objectHistory.push(objects)
}

async function undo() {
  if (!fabricCanvas || objectHistory.length <= 1) return
  objectHistory.pop()
  const previousObjects = objectHistory[objectHistory.length - 1]
  isHistoryAction = true
  fabricCanvas.getObjects().slice().forEach(obj => fabricCanvas!.remove(obj))
  for (const objJson of previousObjects) {
    try {
      const parsed = JSON.parse(objJson)
      const objects = await fabric.util.enlivenObjects([parsed])
      objects.forEach(obj => fabricCanvas!.add(obj as fabric.FabricObject))
    } catch {
      // skip
    }
  }
  fabricCanvas.renderAll()
  isHistoryAction = false
}

function clear() {
  if (!fabricCanvas) return
  fabricCanvas.getObjects().slice().forEach(obj => fabricCanvas!.remove(obj))
  fabricCanvas.renderAll()
  saveHistory()
}

async function save() {
  if (!fabricCanvas) return
  const bg = fabricCanvas.backgroundImage || backgroundImg
  const multiplier = bg ? bg.width! / fabricCanvas.width! : 1
  const dataUrl = fabricCanvas.toDataURL({
    format: 'jpeg',
    quality: 0.8,
    multiplier,
  })
  // 将编辑后的图片存入 session storage，通知侧边栏
  await chrome.storage.session.set({ screenshotEdited: dataUrl })
  await chrome.runtime.sendMessage({ action: 'EDITOR_DONE', payload: { dataUrl } })
  window.close()
}

function cancel() {
  chrome.runtime.sendMessage({ action: 'EDITOR_CANCELLED' })
  window.close()
}

onBeforeUnmount(() => {
  if (fabricCanvas) {
    fabricCanvas.dispose()
    fabricCanvas = null
  }
  backgroundImg = null
  objectHistory.length = 0
})
</script>

<style>
:root {
  --bg-primary: #1a1a2e;
  --bg-secondary: #16213e;
  --text-primary: #e4e4e7;
  --text-secondary: #a1a1aa;
  --border-color: #27273a;
  --bg-hover: rgba(255, 255, 255, 0.08);
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 14px;
  overflow: hidden;
}

.editor-fullscreen {
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
}

.editor-header {
  padding: 10px 16px;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: space-between;
  background-color: var(--bg-secondary);
  flex-shrink: 0;
}

.editor-title {
  margin: 0;
  font-size: 14px;
  font-weight: 500;
}

.editor-tools {
  display: flex;
  gap: 8px;
  align-items: center;
}

.tool-btn {
  background: transparent;
  border: 1px solid transparent;
  padding: 4px 8px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 16px;
  color: var(--text-primary);
  transition: all 0.2s;
}

.tool-btn:hover {
  background-color: var(--bg-hover);
}

.tool-btn.active {
  background-color: var(--bg-hover);
  border-color: var(--border-color);
}

.divider {
  width: 1px;
  height: 20px;
  background-color: var(--border-color);
  margin: 0 4px;
}

.editor-actions {
  display: flex;
  gap: 8px;
}

.btn {
  padding: 6px 16px;
  border-radius: 4px;
  font-size: 13px;
  cursor: pointer;
  border: none;
}

.btn-secondary {
  background-color: var(--bg-hover);
  color: var(--text-primary);
}

.btn-primary {
  background-color: #7c3aed;
  color: #fff;
}

.btn-primary:hover {
  background-color: #6d28d9;
}

.canvas-wrapper {
  flex: 1;
  overflow: auto;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background-color: #222;
}
</style>
