<template>
  <div class="space-y-8">
    <div class="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-8 mt-12">
      <div class="space-y-4">
        <UBreadcrumb :links="[{ label: '首页', icon: 'i-lucide-home', to: '/' }]" />
        <h2 class="text-4xl font-extrabold tracking-tight text-gray-900 dark:text-white">本地视频翻译区</h2>
        <p class="text-lg text-neutral-600 dark:text-neutral-400 max-w-2xl">浏览您的本地影视库，提取内嵌字幕，并使用先进的 AI 模型将其精准翻译成您的母语。</p>
      </div>
      <div class="flex items-center gap-3">
        <UButton label="任务历史" variant="outline" icon="i-lucide-history" color="neutral" to="/history" size="lg" />
      </div>
    </div>

    <!-- Main File Browser Section -->
    <FileBrowser />

    
  </div>
</template>

<script setup>
definePageMeta({
  title: 'SubX - AI Subtitle Translator'
})
</script>
