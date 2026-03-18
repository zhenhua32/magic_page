<template>
  <div class="settings-panel">
    <div class="settings-section">
      <h3 class="section-title">API 配置</h3>

      <div class="form-group">
        <label class="form-label">API Key</label>
        <input
          v-model="settings.apiKey"
          type="password"
          class="form-input"
          placeholder="sk-..."
          autocomplete="off"
        />
      </div>

      <div class="form-group">
        <label class="form-label">API Base URL</label>
        <input
          v-model="settings.apiBase"
          type="url"
          class="form-input"
          placeholder="https://api.openai.com/v1"
        />
      </div>

      <div class="form-group">
        <label class="form-label">模型</label>
        <input
          v-model="settings.model"
          type="text"
          class="form-input"
          placeholder="gpt-4o"
        />
      </div>

      <div class="form-group">
        <label class="form-label">Temperature: {{ settings.temperature.toFixed(1) }}</label>
        <input
          v-model.number="settings.temperature"
          type="range"
          class="form-range"
          min="0"
          max="2"
          step="0.1"
        />
      </div>

      <div class="form-group">
        <label class="form-label">上下文长度 (tokens): {{ formatTokens(settings.maxContextTokens) }}</label>
        <select v-model.number="settings.maxContextTokens" class="form-input">
          <option :value="8000">8K</option>
          <option :value="16000">16K</option>
          <option :value="32000">32K</option>
          <option :value="64000">64K</option>
          <option :value="128000">128K</option>
          <option :value="256000">256K</option>
          <option :value="512000">512K</option>
          <option :value="1000000">1M</option>
        </select>
        <p class="form-hint">上下文越大，发送给 AI 的页面信息越完整</p>
      </div>
    </div>

    <div class="settings-section">
      <h3 class="section-title">System Prompt</h3>
      <div class="form-group">
        <textarea
          v-model="settings.systemPrompt"
          class="form-textarea"
          rows="8"
          placeholder="自定义系统提示词..."
        ></textarea>
      </div>
    </div>

    <div class="settings-actions">
      <button class="btn btn-primary" @click="handleSave" :disabled="loading">
        {{ loading ? '保存中...' : '保存设置' }}
      </button>
      <button class="btn btn-secondary" @click="test" :disabled="testing">
        {{ testing ? '测试中...' : '测试连接' }}
      </button>
    </div>

    <div v-if="testResult" :class="['test-result', testResult]">
      {{ testResult === 'success' ? '✅ 连接成功' : '❌ 连接失败，请检查配置' }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { useSettings } from '../composables/useSettings'

const { settings, loading, testing, testResult, save, test } = useSettings()

async function handleSave() {
  await save()
}

function formatTokens(n: number): string {
  if (n >= 1000000) return (n / 1000000) + 'M'
  return (n / 1000) + 'K'
}
</script>

<style scoped>
.settings-panel {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.settings-section {
  margin-bottom: 20px;
}

.section-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 12px;
}

.form-group {
  margin-bottom: 12px;
}

.form-label {
  display: block;
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 4px;
}

.form-input {
  width: 100%;
  padding: 8px 12px;
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: var(--text-primary);
  outline: none;
  transition: border-color 0.2s;
}

.form-input:focus {
  border-color: var(--accent);
}

.form-range {
  width: 100%;
  accent-color: var(--accent);
}

.form-hint {
  margin: 4px 0 0;
  font-size: 11px;
  color: var(--text-secondary);
  opacity: 0.7;
}

.form-textarea {
  width: 100%;
  padding: 8px 12px;
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: var(--text-primary);
  outline: none;
  resize: vertical;
  min-height: 100px;
  font-size: 12px;
  line-height: 1.6;
  transition: border-color 0.2s;
}

.form-textarea:focus {
  border-color: var(--accent);
}

.settings-actions {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.btn {
  flex: 1;
  padding: 8px 16px;
  border-radius: var(--radius);
  font-size: 13px;
  font-weight: 500;
  transition: all 0.2s;
}

.btn-primary {
  background: var(--accent);
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: var(--accent-hover);
}

.btn-secondary {
  background: var(--bg-card);
  color: var(--text-primary);
  border: 1px solid var(--border);
}

.btn-secondary:hover:not(:disabled) {
  border-color: var(--accent);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.test-result {
  padding: 8px 12px;
  border-radius: var(--radius);
  font-size: 13px;
  text-align: center;
}

.test-result.success {
  background: rgba(34, 197, 94, 0.15);
  color: var(--success);
}

.test-result.fail {
  background: rgba(239, 68, 68, 0.15);
  color: var(--danger);
}
</style>
