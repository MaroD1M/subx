<template>
  <div class="space-y-6 max-w-[1500px] mx-auto stagger-fade-in">
    <div class="flex flex-col md:flex-row md:items-end justify-between gap-5 pb-6 mt-8 border-b border-gray-100 dark:border-gray-800">
      <div class="space-y-2">
        <h2 class="text-3xl font-extrabold tracking-tight text-gray-900 dark:text-white">本地视频翻译区</h2>
        <p class="text-neutral-500 max-w-2xl leading-relaxed">浏览本地影视库，提取字幕并发起翻译。</p>
      </div>
      <div class="flex items-center gap-2 md:pb-0.5 flex-wrap">
        <UButton label="媒体库管理" variant="outline" icon="i-lucide-library-big" color="neutral" to="/media-libraries" />
        <UButton label="任务历史" variant="outline" icon="i-lucide-history" color="neutral" to="/history" />
      </div>
    </div>

    <div v-if="showMediaSetupHint" class="rounded-2xl border border-gray-100 dark:border-gray-800 bg-white/65 dark:bg-gray-950/25 p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
      <div class="space-y-1">
        <p class="text-sm font-semibold text-gray-800 dark:text-gray-100">还没有可用媒体库</p>
        <p class="text-xs text-gray-500 dark:text-gray-400">请先添加一个媒体库目录，随后即可浏览文件并创建翻译任务。</p>
      </div>
      <div class="flex items-center gap-2 flex-wrap">
        <UButton label="前往媒体库管理" icon="i-lucide-arrow-right-circle" color="primary" variant="soft" to="/media-libraries" />
      </div>
    </div>

    <FileBrowser />
  </div>
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
