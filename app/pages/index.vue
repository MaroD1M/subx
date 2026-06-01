<template>
  <div class="space-y-6 max-w-[1500px] mx-auto">
    <div class="flex flex-col md:flex-row md:items-end justify-between gap-5 pb-6 mt-8 border-b border-gray-100 dark:border-gray-800">
      <div class="space-y-2">
        <UBreadcrumb :links="[{ label: '首页', icon: 'i-lucide-home', to: '/' }]" />
        <h2 class="text-3xl font-extrabold tracking-tight text-gray-900 dark:text-white">本地视频翻译区</h2>
        <p class="text-neutral-500 max-w-2xl leading-relaxed">浏览您的本地影视库，提取内嵌字幕，并使用先进的 AI 模型将其精准翻译成您的母语。</p>
      </div>
      <div class="flex items-center gap-2 md:pb-0.5">
        <UButton label="任务历史" variant="outline" icon="i-lucide-history" color="neutral" to="/history" />
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
