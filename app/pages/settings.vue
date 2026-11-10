<template>
  <AppContainer size="default" class="space-y-6 py-2 pb-28">
    <PageHeader
      title="设置"
      description="配置 AI 连接、语音识别、图像字幕 OCR、模型下载、翻译默认行为和术语表。"
      :breadcrumb="[{ label: '首页', icon: 'i-lucide-home', to: '/' }, { label: '设置', icon: 'i-lucide-settings' }]"
    />
    <Settings @close="closeSettings" @dirty="settingsDirty = $event" />
  </AppContainer>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'

useHead({ title: '设置 - SubX' })

const { confirm } = useConfirm()
const settingsDirty = ref(false)
let bypassLeaveGuard = false

function closeSettings() {
  bypassLeaveGuard = true
  navigateTo('/')
}

onBeforeRouteLeave(async () => {
  if (!settingsDirty.value || bypassLeaveGuard) return true
  const leave = await confirm({
    title: '有未保存的设置更改',
    description: '离开后这些修改会丢失。确定要离开设置页吗？',
    confirmLabel: '放弃并离开',
    cancelLabel: '继续编辑',
    color: 'warning'
  })
  if (leave) bypassLeaveGuard = true
  return leave
})

function handleBeforeUnload(event: BeforeUnloadEvent) {
  if (!settingsDirty.value) return
  event.preventDefault()
  event.returnValue = ''
}

onMounted(() => window.addEventListener('beforeunload', handleBeforeUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload', handleBeforeUnload))
</script>
