<template>
  <div class="patch-list-panel">
    <!-- 当前页面 URL -->
    <div v-if="currentUrl" class="url-bar">
      <span class="url-label">📄 当前页面:</span>
      <span class="url-text" :title="currentUrl">{{ currentUrl }}</span>
    </div>

    <div v-if="loading" class="loading-state">
      加载中...
    </div>

    <div v-else-if="patches.length === 0" class="empty-state">
      <div class="empty-icon">🩹</div>
      <p class="empty-title">暂无补丁</p>
      <p class="empty-desc">在对话中生成并应用修改后，补丁会出现在这里</p>
    </div>

    <div v-else class="patches-list">
      <div class="list-header">
        <span class="list-count">{{ patches.length }} 个补丁</span>
        <span class="list-active">{{ enabledCount }} 个启用</span>
      </div>
      <PatchItem
        v-for="patch in patches"
        :key="patch.id"
        :patch="patch"
        @toggle="handleToggle"
        @delete="handleDelete"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import PatchItem from './PatchItem.vue'
import { usePatches } from '../composables/usePatches'
import { requestPageInfo } from '@/shared/messaging'
import type { PageInfo } from '@/shared/types'

const currentUrl = ref('')
const { patches, loading, toggle, removePatch, loadPatches } = usePatches(currentUrl)

const enabledCount = computed(() => patches.value.filter((p) => p.enabled).length)

async function handleToggle(id: string, enabled: boolean) {
  await toggle(id, enabled)
}

async function handleDelete(id: string) {
  await removePatch(id)
}

onMounted(async () => {
  try {
    const info = await requestPageInfo()
    currentUrl.value = info.url
  } catch {
    // 无法获取页面信息
  }
})

// 监听 tab 切换时刷新
chrome.tabs?.onActivated?.addListener(async () => {
  try {
    const info = await requestPageInfo()
    currentUrl.value = info.url
  } catch {
    // ignore
  }
})
</script>

<style scoped>
.patch-list-panel {
  flex: 1;
  overflow-y: auto;
}

.url-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border);
  font-size: 11px;
  color: var(--text-muted);
}

.url-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.loading-state {
  padding: 40px 20px;
  text-align: center;
  color: var(--text-muted);
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  text-align: center;
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 12px;
}

.empty-title {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 6px;
}

.empty-desc {
  font-size: 13px;
  color: var(--text-secondary);
  max-width: 240px;
}

.list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  font-size: 12px;
  color: var(--text-muted);
  border-bottom: 1px solid var(--border);
}

.list-active {
  color: var(--success);
}
</style>
