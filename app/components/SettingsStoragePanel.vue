<template>
  <SettingsSection title="存储与缓存" description="查看磁盘和 SubX 临时文件占用，只清理 SubX 自己生成的缓存，不会触碰媒体文件或模型。">
    <template #actions>
      <UButton label="刷新" icon="i-lucide-refresh-cw" size="xs" color="neutral" variant="ghost" :loading="storageLoading" @click="loadStorage" />
    </template>

    <div v-if="storageLoading && !storage" class="space-y-3" role="status" aria-live="polite" aria-label="正在统计存储占用">
      <span class="sr-only">正在统计存储占用</span>
      <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div v-for="index in 4" :key="index" class="skeleton h-20" />
      </div>
      <div class="skeleton h-3 w-full" />
      <div class="skeleton h-56 w-full" />
    </div>
    <div v-else-if="storage" class="space-y-4">
      <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div class="surface-muted p-3"><p class="app-meta">磁盘总量</p><p class="mt-1 text-lg font-semibold text-gray-900 dark:text-white">{{ formatStorageBytes(storage.disk.totalBytes) }}</p></div>
        <div class="surface-muted p-3"><p class="app-meta">磁盘可用</p><p class="mt-1 text-lg font-semibold text-gray-900 dark:text-white">{{ formatStorageBytes(storage.disk.freeBytes) }}</p></div>
        <div class="surface-muted p-3"><p class="app-meta">缓存合计</p><p class="mt-1 text-lg font-semibold text-gray-900 dark:text-white">{{ formatStorageBytes(storage.cacheBytes) }}</p></div>
        <div class="surface-muted p-3"><p class="app-meta">缓存文件</p><p class="mt-1 text-lg font-semibold text-gray-900 dark:text-white">{{ storage.cacheFiles }} 个</p></div>
      </div>

      <div>
        <div class="mb-1 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
          <span>磁盘已用 {{ storage.disk.usedPercent }}%</span>
          <span>{{ formatStorageBytes(storage.disk.usedBytes) }} / {{ formatStorageBytes(storage.disk.totalBytes) }}</span>
        </div>
        <div class="h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
          <div class="h-full rounded-full bg-primary-500" :style="{ width: `${Math.min(100, storage.disk.usedPercent)}%` }" />
        </div>
      </div>

      <div class="divide-y divide-gray-100 rounded-xl border border-gray-100 dark:divide-gray-800 dark:border-gray-800">
        <div v-for="category in storage.categories" :key="category.key" class="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <p class="text-sm font-medium text-gray-800 dark:text-gray-200">{{ category.label }}</p>
              <UBadge v-if="!category.cleanable" color="neutral" variant="subtle" size="sm">不参与清理</UBadge>
            </div>
            <p class="mt-0.5 app-caption">{{ category.description }}</p>
            <p v-if="category.path" class="mt-0.5 break-all text-[11px] text-gray-400 dark:text-gray-500">{{ category.path }}</p>
          </div>
          <div class="flex flex-wrap items-center gap-3 sm:justify-end">
            <div class="text-right">
              <p class="text-sm font-semibold text-gray-900 dark:text-white">{{ formatStorageBytes(category.bytes) }}</p>
              <p class="text-[11px] text-gray-500 dark:text-gray-400">{{ category.files }} 个文件</p>
            </div>
            <div v-if="category.cleanable" class="flex items-center gap-1.5">
              <UButton label="清理旧缓存" size="xs" color="neutral" variant="soft" :loading="storageCleaning" @click="requestStorageCleanup(category, false)" />
              <UButton label="全部清理" size="xs" color="error" variant="ghost" :loading="storageCleaning" @click="requestStorageCleanup(category, true)" />
            </div>
          </div>
        </div>
      </div>

      <p class="text-[11px] leading-5 text-gray-500 dark:text-gray-400">“全部清理”也会跳过最近 5 分钟仍在使用的文件，避免和正在运行的任务冲突。模型文件只在「语音识别 → 本地模型管理」中卸载。</p>
    </div>
    <div v-else class="py-8 text-center text-xs text-gray-500 dark:text-gray-400">无法读取存储信息，请稍后重试。</div>

    <UModal v-model:open="storageConfirmOpen" :title="storageConfirm?.title || '确认清理'" :description="storageConfirm?.description || ''" @update:open="value => { if (!value) storageConfirm = null }">
      <template #content>
        <div class="space-y-4 p-5">
          <div class="rounded-xl border border-amber-100 bg-amber-50/80 p-3 text-sm leading-6 text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300">
            清理后不可恢复。该操作只会删除 SubX 缓存和临时文件，不会删除媒体、字幕输出或模型。
          </div>
          <div class="flex items-center justify-end gap-3">
            <UButton label="取消" color="neutral" variant="ghost" @click="storageConfirmOpen = false" />
            <UButton label="确认清理" color="error" :loading="storageCleaning" @click="confirmStorageCleanup" />
          </div>
        </div>
      </template>
    </UModal>
  </SettingsSection>
</template>

<script setup lang="ts">
const toast = useToast()
const storage = ref<any>(null)
const storageLoading = ref(false)
const storageCleaning = ref(false)
const storageConfirmOpen = ref(false)
const storageConfirm = ref<any>(null)
const storageRequest = await useFetch('/api/storage', { key: 'settings-storage-summary' })
if (storageRequest.data.value) storage.value = storageRequest.data.value

onMounted(() => { void loadStorage() })

function formatStorageBytes(value: number) {
  const size = Number(value || 0)
  if (size <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const index = Math.min(units.length - 1, Math.floor(Math.log(size) / Math.log(1024)))
  const scaled = size / (1024 ** index)
  if (index === 0) return `${Math.round(scaled)} B`
  return `${scaled >= 100 ? scaled.toFixed(0) : scaled.toFixed(1)} ${units[index]}`
}

async function loadStorage() {
  if (storageLoading.value) return
  storageLoading.value = true
  try {
    await storageRequest.refresh()
    if (storageRequest.error.value) throw storageRequest.error.value
    storage.value = storageRequest.data.value
    if (!storage.value) throw new Error('没有读取到存储信息')
  } catch (e: any) {
    storage.value = null
    toast.add({ title: '读取存储信息失败', description: e?.data?.message || e?.message || '请稍后重试', color: 'error' })
  } finally {
    storageLoading.value = false
  }
}

function requestStorageCleanup(category: any, all: boolean) {
  storageConfirm.value = {
    target: category.key,
    all,
    days: category.defaultDays,
    title: all ? `清理全部${category.label}？` : `清理旧${category.label}？`,
    description: all
      ? '将清理该分类下的全部可清理文件，并跳过最近 5 分钟仍在使用的文件。'
      : `将清理该分类下早于 ${category.defaultDays} 天的文件。`
  }
  storageConfirmOpen.value = true
}

async function confirmStorageCleanup() {
  if (!storageConfirm.value) return
  storageCleaning.value = true
  try {
    const payload: any = {
      targets: [storageConfirm.value.target],
      all: storageConfirm.value.all
    }
    if (!storageConfirm.value.all) payload.days = storageConfirm.value.days
    const result: any = await $fetch('/api/storage/cleanup', { method: 'POST', body: payload })
    storage.value = result.summary
    storageConfirmOpen.value = false
    storageConfirm.value = null
    const deleted = Number(result.deletedBytes || 0)
    toast.add({
      title: deleted > 0 ? '缓存已清理' : '没有需要清理的文件',
      description: deleted > 0 ? `已删除 ${result.deletedFiles || 0} 个文件，释放 ${formatStorageBytes(deleted)}` : '当前文件都在保留期内',
      color: deleted > 0 ? 'success' : 'neutral'
    })
  } catch (e: any) {
    toast.add({ title: '清理失败', description: e?.data?.message || e?.message || '请稍后重试', color: 'error' })
  } finally {
    storageCleaning.value = false
  }
}
</script>
