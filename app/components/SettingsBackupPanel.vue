<template>
  <SettingsSection title="自动备份" description="定期备份 SQLite 数据库、加密密钥和配置；备份只保存在 SubX 的备份目录，不会写入媒体库。">
    <template #actions>
      <div class="flex items-center gap-2">
        <UButton label="刷新" icon="i-lucide-refresh-cw" size="xs" color="neutral" variant="ghost" :loading="loading" @click="loadBackups" />
        <UButton label="立即备份" icon="i-lucide-archive" size="xs" color="primary" variant="soft" :loading="creating" @click="createBackup" />
      </div>
    </template>

    <div class="space-y-4">
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div class="surface-muted p-3">
          <p class="app-meta">自动备份</p>
          <div class="mt-2 flex items-center justify-between gap-3">
            <span class="text-sm font-semibold text-gray-900 dark:text-white">{{ autoBackupEnabled ? '已启用' : '未启用' }}</span>
            <USwitch v-model="autoBackupEnabled" aria-label="启用自动备份" />
          </div>
        </div>
        <UFormField label="间隔（小时）">
          <UInputNumber v-model="intervalHours" :min="1" :max="720" :step="1" :disabled="!autoBackupEnabled" class="w-full" />
        </UFormField>
        <UFormField label="保留份数">
          <UInputNumber v-model="keepCount" :min="1" :max="100" :step="1" :disabled="!autoBackupEnabled" class="w-full" />
        </UFormField>
      </div>

      <p class="app-caption">
        应用内自动备份只支持 SQLite。PostgreSQL 请使用 pg_dump。自动备份不包含任务日志；需要排查日志时使用命令行备份脚本。
      </p>

      <div class="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gray-100 bg-gray-50/70 px-3 py-2 text-xs text-gray-500 dark:border-gray-800 dark:bg-gray-900/40 dark:text-gray-400">
        <span>备份目录：<span class="break-all font-mono text-[11px]">{{ rootPath || '-' }}</span></span>
        <span>共 {{ backups.length }} 份</span>
      </div>

      <div v-if="loading && !backups.length" class="py-6 text-center text-xs text-gray-500 dark:text-gray-400">
        <UIcon name="i-lucide-loader-2" class="mr-1 inline h-4 w-4 animate-spin" />正在读取备份...
      </div>
      <div v-else-if="!backups.length" class="rounded-xl border border-dashed border-gray-200 px-4 py-8 text-center text-xs text-gray-500 dark:border-gray-800 dark:text-gray-400">
        还没有备份。启用自动备份，或点击“立即备份”创建第一份。
      </div>
      <div v-else class="divide-y divide-gray-100 rounded-xl border border-gray-100 dark:divide-gray-800 dark:border-gray-800">
        <div v-for="backup in backups" :key="backup.name" class="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div class="min-w-0">
            <p class="break-all text-sm font-medium text-gray-800 dark:text-gray-200">{{ backup.name }}</p>
            <p class="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">
              {{ formatDate(backup.createdAt) }} · schema v{{ backup.schemaVersion }} · {{ backup.includesSecret ? '含密钥' : '不含密钥' }}
            </p>
          </div>
          <div class="text-left sm:text-right">
            <p class="text-sm font-semibold text-gray-900 dark:text-white">{{ formatStorageBytes(backup.sizeBytes) }}</p>
            <p class="text-[11px] text-gray-400 dark:text-gray-500">恢复请使用 npm run restore</p>
          </div>
        </div>
      </div>
    </div>
  </SettingsSection>
</template>

<script setup lang="ts">
const props = defineProps<{
  config: any
}>()

const emit = defineEmits<{
  'update:config': [patch: Record<string, unknown>]
}>()

const toast = useToast()
const timeZone = useTimeZone()
const loading = ref(false)
const creating = ref(false)
const backups = ref<any[]>([])
const rootPath = ref('')

const autoBackupEnabled = computed({
  get: () => props.config?.autoBackupEnabled === true,
  set: (value: boolean) => emit('update:config', { autoBackupEnabled: value })
})
const intervalHours = computed({
  get: () => Number(props.config?.autoBackupIntervalHours || 24),
  set: (value: any) => emit('update:config', { autoBackupIntervalHours: Math.max(1, Math.min(720, Number(value) || 24)) })
})
const keepCount = computed({
  get: () => Number(props.config?.autoBackupKeep || 10),
  set: (value: any) => emit('update:config', { autoBackupKeep: Math.max(1, Math.min(100, Number(value) || 10)) })
})

function formatStorageBytes(value: number) {
  const size = Number(value || 0)
  if (size <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const index = Math.min(units.length - 1, Math.floor(Math.log(size) / Math.log(1024)))
  const scaled = size / (1024 ** index)
  if (index === 0) return `${Math.round(scaled)} B`
  return `${scaled >= 100 ? scaled.toFixed(0) : scaled.toFixed(1)} ${units[index]}`
}

function formatDate(value: string) {
  if (!value) return '-'
  try {
    return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short', timeZone }).format(new Date(value))
  } catch {
    return value
  }
}

async function loadBackups() {
  if (loading.value) return
  loading.value = true
  try {
    const response: any = await $fetch('/api/backups')
    backups.value = Array.isArray(response?.backups) ? response.backups : []
    rootPath.value = String(response?.root || '')
  } catch (e: any) {
    toast.add({ title: '读取备份列表失败', description: e?.data?.message || e?.message || '请稍后重试', color: 'error' })
  } finally {
    loading.value = false
  }
}

async function createBackup() {
  if (creating.value) return
  creating.value = true
  try {
    const response: any = await $fetch('/api/backups', { method: 'POST' })
    toast.add({ title: '备份完成', description: `已创建 ${response?.backup?.name || '备份文件'}`, color: 'success' })
    await loadBackups()
  } catch (e: any) {
    toast.add({ title: '备份失败', description: e?.data?.message || e?.message || '请稍后重试', color: 'error' })
  } finally {
    creating.value = false
  }
}

onMounted(() => { void loadBackups() })
</script>
