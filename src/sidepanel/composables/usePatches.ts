import { ref, onMounted, watch } from 'vue'
import type { Patch } from '@/shared/types'
import {
  getPatchesForUrl,
  savePatch,
  deletePatch as storageDeletePatch,
  togglePatch as storageTogglePatch,
} from '@/shared/storage'
import {
  requestInjectPatch,
  requestRemovePatch,
  requestTogglePatch,
} from '@/shared/messaging'

export function usePatches(currentUrl: ReturnType<typeof ref<string>>) {
  const patches = ref<Patch[]>([])
  const loading = ref(false)

  async function loadPatches() {
    if (!currentUrl.value) return
    loading.value = true
    try {
      patches.value = await getPatchesForUrl(currentUrl.value)
    } finally {
      loading.value = false
    }
  }

  async function addPatch(patch: Patch): Promise<void> {
    await savePatch(patch)
    try {
      await requestInjectPatch({
        patchId: patch.id,
        cssCode: patch.cssCode,
        jsCode: patch.jsCode,
      })
    } catch {
      // content script 可能不可用
    }
    await loadPatches()
  }

  async function removePatch(id: string): Promise<void> {
    await storageDeletePatch(id)
    try {
      await requestRemovePatch(id)
    } catch {
      // content script 可能不可用
    }
    await loadPatches()
  }

  async function toggle(id: string, enabled: boolean): Promise<void> {
    await storageTogglePatch(id, enabled)
    const patch = patches.value.find((p) => p.id === id)
    try {
      await requestTogglePatch(id, enabled)
    } catch {
      // content script 可能不可用
    }
    await loadPatches()
  }

  watch(currentUrl, loadPatches)
  onMounted(loadPatches)

  return { patches, loading, addPatch, removePatch, toggle, loadPatches }
}
