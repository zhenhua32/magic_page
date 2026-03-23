<template>
  <div v-if="modelValue" class="screenshot-editor-overlay">
    <div class="editor-container">
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
          <button class="btn btn-secondary" @click="close">取消</button>
          <button class="btn btn-primary" @click="save">完成</button>
        </div>
      </div>
      <div class="canvas-wrapper">
        <canvas ref="canvasRef"></canvas>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, onBeforeUnmount } from 'vue'
import * as fabric from 'fabric'

const props = defineProps<{
  modelValue: boolean
  imageUrl: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'save', dataUrl: string): void
}>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
let fabricCanvas: fabric.Canvas | null = null
const currentTool = ref<'pen' | 'rect'>('pen')

// 记录操作状态用于撤销（仅存储绘制对象，不存储背景图）
const objectHistory: string[][] = []
let isHistoryAction = false
// 保留对原始背景图的引用，避免 clear/undo 丢失
let backgroundImg: fabric.FabricImage | null = null

watch(
  () => props.modelValue,
  async (newVal) => {
    if (newVal && props.imageUrl) {
      await nextTick() // 等待 v-if 挂载
      // 再等一帧，让 flex 布局完成，这样 wrapper 才能拿到真实的 clientHeight
      requestAnimationFrame(() => {
        initCanvas()
      })
    } else {
      disposeCanvas()
    }
  },
)

async function initCanvas() {
  if (!canvasRef.value) return

  // 获取容器尺寸以适应屏幕
  const wrapper = canvasRef.value.parentElement
  const maxWidth = wrapper?.clientWidth || 800
  const maxHeight = wrapper?.clientHeight || 600

  fabricCanvas = new fabric.Canvas(canvasRef.value, {
    isDrawingMode: true,
  })

  // Fabric.js v7 不自动创建 freeDrawingBrush，需手动初始化
  fabricCanvas.freeDrawingBrush = new fabric.PencilBrush(fabricCanvas)
  fabricCanvas.freeDrawingBrush.color = 'red'
  fabricCanvas.freeDrawingBrush.width = 3

  try {
    // 将 data URL 转为 Blob URL 以规避扩展 CSP 限制
    let loadUrl = props.imageUrl
    if (props.imageUrl.startsWith('data:')) {
      try {
        const res = await fetch(props.imageUrl)
        const blob = await res.blob()
        loadUrl = URL.createObjectURL(blob)
      } catch {
        // 降级使用原始 data URL
      }
    }
    const img = await fabric.FabricImage.fromURL(loadUrl)
    
    // 计算缩放比例
    const scale = Math.min(maxWidth / img.width!, maxHeight / img.height!, 1)
    
    fabricCanvas.setWidth(img.width! * scale)
    fabricCanvas.setHeight(img.height! * scale)
    
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

  // 矩形绘制逻辑
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
      width: pointer.x - origX,
      height: pointer.y - origY,
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
    
    if (origX > pointer.x) {
      rect.set({ left: Math.abs(pointer.x) })
    }
    if (origY > pointer.y) {
      rect.set({ top: Math.abs(pointer.y) })
    }
    
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
  // 仅序列化绘制对象，不包含背景图（避免大量重复存储 data URL）
  const objects = fabricCanvas.getObjects().map(obj => JSON.stringify(obj.toJSON()))
  objectHistory.push(objects)
}

async function undo() {
  if (!fabricCanvas || objectHistory.length <= 1) return
  objectHistory.pop() // 移除当前状态
  const previousObjects = objectHistory[objectHistory.length - 1]
  isHistoryAction = true
  // 清除所有绘制对象，但保留背景图
  fabricCanvas.getObjects().slice().forEach(obj => fabricCanvas!.remove(obj))
  // 恢复上一步的对象
  for (const objJson of previousObjects) {
    try {
      const parsed = JSON.parse(objJson)
      const objects = await fabric.util.enlivenObjects([parsed])
      objects.forEach(obj => fabricCanvas!.add(obj as fabric.FabricObject))
    } catch {
      // 个别对象恢复失败时跳过
    }
  }
  fabricCanvas.renderAll()
  isHistoryAction = false
}

function clear() {
  if (!fabricCanvas) return
  // 只移除绘制对象，保留背景图
  fabricCanvas.getObjects().slice().forEach(obj => fabricCanvas!.remove(obj))
  fabricCanvas.renderAll()
  saveHistory()
}

function save() {
  if (!fabricCanvas) return
  const bg = fabricCanvas.backgroundImage || backgroundImg
  // 如果有背景图，按原始尺寸导出；否则按 canvas 尺寸
  const multiplier = bg ? bg.width! / fabricCanvas.width! : 1
  const dataUrl = fabricCanvas.toDataURL({
    format: 'jpeg',
    quality: 0.8,
    multiplier,
  })
  emit('save', dataUrl)
  close()
}

function close() {
  emit('update:modelValue', false)
}

function disposeCanvas() {
  if (fabricCanvas) {
    fabricCanvas.dispose()
    fabricCanvas = null
  }
  backgroundImg = null
  objectHistory.length = 0
}

onBeforeUnmount(() => {
  disposeCanvas()
})
</script>

<style scoped>
.screenshot-editor-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.8);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.editor-container {
  background-color: var(--bg-primary);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  width: 95%;
  height: 95%;
  max-width: 1200px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.2);
  overflow: hidden;
}

.editor-header {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: space-between;
  background-color: var(--bg-secondary);
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

.canvas-wrapper {
  flex: 1;
  overflow: auto;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background-color: #222; /* 暗色背景凸显截图 */
}

/* 按钮基础样式复用 */
.btn {
  padding: 6px 12px;
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
  background-color: var(--text-primary); /* 在这个项目中，我们可以根据您的 CSS 变量调整 */
  color: var(--bg-primary); 
}
</style>
