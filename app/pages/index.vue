<template>
  <AppContainer size="wide" class="space-y-6">
    <PageHeader
      title="本地视频翻译区"
      description="浏览本地影视库，提取字幕并发起翻译。"
      :breadcrumb="[{ label: '首页', icon: 'i-lucide-home' }]"
    />

    <div v-if="showSetupCard" class="surface-card p-4 sm:p-5">
      <div class="flex flex-col gap-4">
        <div class="flex flex-col gap-1">
          <p class="app-section-title">开始使用 SubX</p>
          <p class="app-caption">按下面几步完成首次配置。已经完成的项目会自动标记。</p>
        </div>
        <div class="grid gap-2 md:grid-cols-3">
          <div class="app-stat flex items-start gap-3">
            <UIcon :name="hasMediaRoot ? 'i-lucide-circle-check' : 'i-lucide-circle'" class="mt-0.5 h-4 w-4 shrink-0" :class="hasMediaRoot ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400'" />
            <div class="min-w-0 space-y-1">
              <p class="text-xs font-medium text-gray-700 dark:text-gray-200">添加媒体库</p>
              <p class="app-caption">让 SubX 能找到视频和字幕。</p>
              <UButton v-if="!hasMediaRoot" label="去添加" size="xs" color="primary" variant="soft" to="/media-libraries" />
            </div>
          </div>
          <div class="app-stat flex items-start gap-3">
            <UIcon :name="hasApiKey ? 'i-lucide-circle-check' : 'i-lucide-circle'" class="mt-0.5 h-4 w-4 shrink-0" :class="hasApiKey ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400'" />
            <div class="min-w-0 space-y-1">
              <p class="text-xs font-medium text-gray-700 dark:text-gray-200">配置 AI 连接</p>
              <p class="app-caption">填写 API Key 和默认模型。</p>
              <UButton v-if="!hasApiKey" label="去配置" size="xs" color="primary" variant="soft" to="/settings?tab=ai" />
            </div>
          </div>
          <div class="app-stat flex items-start gap-3">
            <UIcon name="i-lucide-stethoscope" class="mt-0.5 h-4 w-4 shrink-0 text-primary-600 dark:text-primary-400" />
            <div class="min-w-0 space-y-1">
              <p class="text-xs font-medium text-gray-700 dark:text-gray-200">运行系统体检</p>
              <p class="app-caption">检查 FFmpeg、字体、磁盘和权限。</p>
              <UButton label="去体检" size="xs" color="neutral" variant="soft" to="/settings?tab=health" />
            </div>
          </div>
        </div>
      </div>
    </div>

    <FileBrowser />
  </AppContainer>
</template>

<script setup>
useHead({
  title: '首页 - SubX'
})

const { data: config } = await useAppConfigData()

const hasMediaRoot = computed(() => {
  const roots = Array.isArray(config.value?.mediaRoots)
    ? config.value.mediaRoots.filter((root) => root?.enabled !== false && root?.name && root?.path)
    : []
  return roots.length > 0
})
const hasApiKey = computed(() => Boolean(String(config.value?.apiKey || '').trim()))
const showSetupCard = computed(() => !hasMediaRoot.value || !hasApiKey.value)
</script>
