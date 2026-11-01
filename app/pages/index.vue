<template>
  <AppContainer size="wide" class="space-y-6">
    <PageHeader
      title="本地视频翻译区"
      description="浏览本地影视库，提取字幕并发起翻译。"
      :breadcrumb="[{ label: '首页', icon: 'i-lucide-home' }]"
    />

    <div v-if="showMediaSetupHint" class="rounded-2xl border border-gray-200/80 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-950/60 sm:p-5">
      <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div class="space-y-1">
          <p class="text-sm font-semibold text-gray-800 dark:text-gray-100">还没有可用媒体库</p>
          <p class="text-xs text-gray-500 dark:text-gray-400">请先添加一个媒体库目录，随后即可浏览文件并创建翻译任务。</p>
        </div>
        <UButton label="前往媒体库管理" icon="i-lucide-arrow-right-circle" color="primary" variant="soft" to="/media-libraries" />
      </div>
    </div>

    <FileBrowser />
  </AppContainer>
</template>

<script setup>
useHead({
  title: '首页 - SubX'
})

const { data: config } = await useFetch('/api/config')

const showMediaSetupHint = computed(() => {
  const roots = Array.isArray(config.value?.mediaRoots)
    ? config.value.mediaRoots.filter((root) => root?.enabled !== false && root?.name && root?.path)
    : []
  return roots.length === 0
})
</script>
