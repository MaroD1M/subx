<template>
  <AppContainer size="default" class="space-y-6 py-2">
    <PageHeader
      title="设置"
      description="配置 AI 连接、语音识别与 OCR、模型下载、翻译默认行为和术语表。"
      :breadcrumb="[{ label: '首页', icon: 'i-lucide-home', to: '/' }, { label: '设置', icon: 'i-lucide-settings' }]"
    />
    <div class="rounded-2xl border border-gray-200/80 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-950/60 sm:p-6">
      <Settings @close="navigateTo('/')" />
    </div>
  </AppContainer>
</template>

<script setup lang="ts">
useHead({ title: '设置 - SubX' })
</script>
