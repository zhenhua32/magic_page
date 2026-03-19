<template>
  <div class="app">
    <header class="app-header">
      <h1 class="app-title">✨ Magic Page</h1>
      <nav class="tab-bar">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          :class="['tab-btn', { active: activeTab === tab.id }]"
          @click="activeTab = tab.id"
        >
          <span class="tab-icon">{{ tab.icon }}</span>
          <span class="tab-label">{{ tab.label }}</span>
        </button>
      </nav>
    </header>

    <main class="app-content">
      <ChatPanel v-if="activeTab === 'chat'" />
      <PatchList v-else-if="activeTab === 'patches'" />
      <SettingsPanel v-else-if="activeTab === 'settings'" />
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, provide } from 'vue'
import ChatPanel from './components/ChatPanel.vue'
import PatchList from './components/PatchList.vue'
import SettingsPanel from './components/SettingsPanel.vue'
import { usePatches } from './composables/usePatches'

const activeTab = ref<'chat' | 'patches' | 'settings'>('chat')

const tabs = [
  { id: 'chat' as const, icon: '💬', label: '对话' },
  { id: 'patches' as const, icon: '🩹', label: '补丁' },
  { id: 'settings' as const, icon: '⚙️', label: '设置' },
]

// 在 App 级别共享 patches 状态，ChatPanel 和 PatchList 使用同一个实例
const sharedCurrentUrl = ref('')
const patchesState = usePatches(sharedCurrentUrl)
provide('sharedCurrentUrl', sharedCurrentUrl)
provide('patchesState', patchesState)
</script>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}

.app-header {
  flex-shrink: 0;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border);
  padding: 12px 16px 0;
}

.app-title {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 12px;
  background: linear-gradient(135deg, #7c3aed, #a78bfa);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.tab-bar {
  display: flex;
  gap: 2px;
}

.tab-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 12px;
  background: transparent;
  color: var(--text-secondary);
  border-radius: var(--radius) var(--radius) 0 0;
  transition: all 0.2s;
  font-size: 13px;
}

.tab-btn:hover {
  background: var(--accent-light);
  color: var(--text-primary);
}

.tab-btn.active {
  background: var(--bg-primary);
  color: var(--accent);
  font-weight: 500;
}

.tab-icon {
  font-size: 14px;
}

.app-content {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
</style>
