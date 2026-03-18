import { ref, onMounted } from 'vue'
import type { Settings } from '@/shared/types'
import { DEFAULT_SETTINGS } from '@/shared/types'
import { getSettings, saveSettings as storageSaveSettings } from '@/shared/storage'
import { testConnection } from '@/shared/ai-client'

export function useSettings() {
  const settings = ref<Settings>({ ...DEFAULT_SETTINGS })
  const loading = ref(false)
  const testing = ref(false)
  const testResult = ref<'success' | 'fail' | null>(null)

  async function load() {
    loading.value = true
    try {
      settings.value = await getSettings()
    } finally {
      loading.value = false
    }
  }

  async function save() {
    loading.value = true
    try {
      await storageSaveSettings(settings.value)
    } finally {
      loading.value = false
    }
  }

  async function test() {
    testing.value = true
    testResult.value = null
    try {
      const ok = await testConnection(settings.value)
      testResult.value = ok ? 'success' : 'fail'
    } catch {
      testResult.value = 'fail'
    } finally {
      testing.value = false
    }
  }

  onMounted(load)

  return { settings, loading, testing, testResult, save, test }
}
