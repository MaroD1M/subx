<template>
  <SettingsSection title="系统体检" description="检查数据库、媒体库、FFmpeg、字体、临时目录、磁盘、AI 配置和备份状态。">
    <template #actions>
      <UButton label="重新检测" icon="i-lucide-refresh-cw" size="xs" color="neutral" variant="ghost" :loading="loading" @click="loadChecks" />
    </template>

    <div v-if="loading && !checks.length" class="space-y-3 py-6 text-center text-xs text-gray-500 dark:text-gray-400">
      <UIcon name="i-lucide-loader-2" class="h-5 w-5 animate-spin" />
      <p>正在检查系统状态...</p>
    </div>
    <div v-else-if="error" class="app-info-error space-y-3 p-4 text-sm">
      <p>{{ error }}</p>
      <UButton label="重试" size="xs" color="error" variant="soft" @click="loadChecks" />
    </div>
    <div v-else class="space-y-4">
      <div class="flex flex-wrap items-center gap-2">
        <UBadge :color="summaryColor" variant="subtle">{{ summaryLabel }}</UBadge>
        <span class="text-xs text-gray-500 dark:text-gray-400">检测时间：{{ formatDate(checkedAt) }}</span>
      </div>

      <div class="divide-y divide-gray-100 rounded-lg border border-gray-100 dark:divide-gray-800 dark:border-gray-800">
        <div v-for="check in checks" :key="check.id" class="flex flex-col gap-2 p-3 sm:flex-row sm:items-start sm:justify-between">
          <div class="flex min-w-0 items-start gap-2">
            <UIcon :name="iconFor(check.status)" class="mt-0.5 h-4 w-4 shrink-0" :class="textColorFor(check.status)" />
            <div class="min-w-0">
              <p class="text-sm font-medium text-gray-800 dark:text-gray-200">{{ check.label }}</p>
              <p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{{ check.message }}</p>
              <p v-if="check.detail" class="mt-0.5 break-all text-xs text-gray-500 dark:text-gray-400">{{ check.detail }}</p>
            </div>
          </div>
          <UBadge :color="badgeColorFor(check.status)" variant="subtle" size="sm">{{ statusLabel(check.status) }}</UBadge>
        </div>
      </div>

      <p class="app-caption">体检只读取状态，不会修改配置或删除文件。实景预览和中文烧录依赖服务器字体。</p>
    </div>
  </SettingsSection>
</template>

<script setup lang="ts">
const toast = useToast()
const loading = ref(false)
const error = ref('')
const checks = ref<any[]>([])
const checkedAt = ref('')
const summary = ref<'ok' | 'warning' | 'error'>('ok')

const summaryLabel = computed(() => summary.value === 'ok' ? '系统状态良好' : summary.value === 'warning' ? '有需要关注的项' : '发现错误')
const summaryColor = computed(() => summary.value === 'ok' ? 'success' : summary.value === 'warning' ? 'warning' : 'error')

function statusLabel(status: string) {
  return status === 'ok' ? '正常' : status === 'warning' ? '注意' : '错误'
}
function badgeColorFor(status: string) {
  return status === 'ok' ? 'success' : status === 'warning' ? 'warning' : 'error'
}
function textColorFor(status: string) {
  return status === 'ok' ? 'text-emerald-600 dark:text-emerald-400' : status === 'warning' ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'
}
function iconFor(status: string) {
  return status === 'ok' ? 'i-lucide-circle-check' : status === 'warning' ? 'i-lucide-triangle-alert' : 'i-lucide-circle-x'
}
function formatDate(value: string) {
  if (!value) return '-'
  try { return new Date(value).toLocaleString('zh-CN') } catch { return value }
}

async function loadChecks() {
  if (loading.value) return
  loading.value = true
  error.value = ''
  try {
    const response: any = await $fetch('/api/health/diagnostics')
    checks.value = Array.isArray(response?.checks) ? response.checks : []
    checkedAt.value = String(response?.checkedAt || '')
    summary.value = response?.summary === 'error' ? 'error' : response?.summary === 'warning' ? 'warning' : 'ok'
  } catch (e: any) {
    error.value = e?.data?.message || e?.message || '系统体检失败'
    toast.add({ title: '系统体检失败', description: error.value, color: 'error' })
  } finally {
    loading.value = false
  }
}

onMounted(() => { void loadChecks() })
</script>
