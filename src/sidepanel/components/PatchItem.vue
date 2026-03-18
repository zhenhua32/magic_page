<template>
  <div class="patch-item" :class="{ disabled: !patch.enabled }">
    <div class="patch-header">
      <div class="patch-info">
        <span class="patch-name">{{ patch.name }}</span>
        <span class="patch-meta">
          {{ formatDate(patch.createdAt) }}
          <template v-if="patch.cssCode && patch.jsCode">· CSS + JS</template>
          <template v-else-if="patch.cssCode">· CSS</template>
          <template v-else-if="patch.jsCode">· JS</template>
        </span>
      </div>
      <label class="toggle-switch">
        <input
          type="checkbox"
          :checked="patch.enabled"
          @change="$emit('toggle', patch.id, !patch.enabled)"
        />
        <span class="toggle-slider"></span>
      </label>
    </div>

    <div class="patch-actions">
      <button class="action-btn" @click="showCode = !showCode">
        {{ showCode ? '收起' : '查看代码' }}
      </button>
      <button class="action-btn delete-btn" @click="$emit('delete', patch.id)">
        删除
      </button>
    </div>

    <div v-if="showCode" class="patch-code">
      <div v-if="patch.cssCode" class="code-section">
        <div class="code-label">CSS</div>
        <pre class="code-content"><code>{{ patch.cssCode }}</code></pre>
      </div>
      <div v-if="patch.jsCode" class="code-section">
        <div class="code-label">JavaScript</div>
        <pre class="code-content"><code>{{ patch.jsCode }}</code></pre>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import type { Patch } from '@/shared/types'

defineProps<{
  patch: Patch
}>()

defineEmits<{
  toggle: [id: string, enabled: boolean]
  delete: [id: string]
}>()

const showCode = ref(false)

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
</script>

<style scoped>
.patch-item {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  transition: opacity 0.2s;
}

.patch-item.disabled {
  opacity: 0.5;
}

.patch-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.patch-info {
  flex: 1;
  min-width: 0;
}

.patch-name {
  display: block;
  font-size: 13px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.patch-meta {
  font-size: 11px;
  color: var(--text-muted);
}

/* Toggle switch */
.toggle-switch {
  position: relative;
  width: 36px;
  height: 20px;
  flex-shrink: 0;
  cursor: pointer;
}

.toggle-switch input {
  display: none;
}

.toggle-slider {
  position: absolute;
  inset: 0;
  background: var(--border-light);
  border-radius: 10px;
  transition: background 0.3s;
}

.toggle-slider::before {
  content: '';
  position: absolute;
  width: 16px;
  height: 16px;
  left: 2px;
  bottom: 2px;
  background: white;
  border-radius: 50%;
  transition: transform 0.3s;
}

.toggle-switch input:checked + .toggle-slider {
  background: var(--accent);
}

.toggle-switch input:checked + .toggle-slider::before {
  transform: translateX(16px);
}

.patch-actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

.action-btn {
  font-size: 11px;
  padding: 2px 8px;
  background: transparent;
  color: var(--text-muted);
  border-radius: 4px;
  transition: all 0.2s;
}

.action-btn:hover {
  background: var(--accent-light);
  color: var(--text-primary);
}

.delete-btn:hover {
  background: rgba(239, 68, 68, 0.15);
  color: var(--danger);
}

.patch-code {
  margin-top: 8px;
}

.code-section {
  margin-bottom: 8px;
}

.code-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  margin-bottom: 4px;
}

.code-content {
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 8px 10px;
  font-family: 'Fira Code', Consolas, monospace;
  font-size: 12px;
  overflow-x: auto;
  max-height: 200px;
  overflow-y: auto;
  margin: 0;
}
</style>
