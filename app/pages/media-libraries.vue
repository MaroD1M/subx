<template>
  <div class="space-y-6 max-w-[1280px] mx-auto stagger-fade-in pb-24">
    <div class="flex flex-col md:flex-row md:items-end justify-between gap-5 pb-6 mt-8 border-b border-gray-100 dark:border-gray-800">
      <div class="space-y-2">
        <UBreadcrumb :links="[{ label: '首页', icon: 'i-lucide-home', to: '/' }, { label: '媒体库管理', icon: 'i-lucide-library-big', to: '/media-libraries' }]" />
        <h2 class="text-3xl font-extrabold tracking-tight text-gray-900 dark:text-white">媒体库管理</h2>
        <p class="text-neutral-500 max-w-3xl leading-relaxed">为不同磁盘或目录配置独立媒体库。这里填写的必须是容器内路径，例如 <code>/media/movies</code>，不是宿主机路径。</p>
      </div>
      <div class="flex items-center gap-2 md:pb-0.5">
        <UButton label="返回首页" variant="outline" icon="i-lucide-arrow-left" color="neutral" to="/" />
      </div>
    </div>

    <div class="rounded-3xl border border-gray-100 dark:border-gray-800 bg-white/85 dark:bg-gray-950/35 p-4 sm:p-5 space-y-4">
      <div class="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
        <div>
          <p class="text-sm font-semibold text-gray-800 dark:text-gray-100">媒体库概览</p>
          <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">建议先补全路径，再批量检测，最后保存。</p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <UBadge color="neutral" variant="subtle">总数 {{ mediaRoots.length }}</UBadge>
          <UBadge color="primary" variant="subtle">默认 {{ defaultRootCount }}</UBadge>
          <UBadge :color="invalidRootCount ? 'error' : 'success'" variant="subtle">异常 {{ invalidRootCount }}</UBadge>
          <div class="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 ml-1">
            <USwitch v-model="forceSaveInvalidRoots" />
            <span>允许强制保存</span>
          </div>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <UButton label="新增媒体库" icon="i-lucide-plus" size="sm" color="primary" variant="soft" @click="addMediaRoot" />
        <UButton label="批量检测" icon="i-lucide-scan-search" size="sm" color="neutral" variant="ghost" :loading="batchInspecting" @click="inspectAllRoots()" />
      </div>
    </div>

    <div class="space-y-4">
      <div v-for="(root, index) in mediaRoots" :key="root.id" class="rounded-3xl border border-gray-100 dark:border-gray-800 bg-white/85 dark:bg-gray-950/35 p-4 sm:p-5 space-y-4">
        <div class="flex flex-col lg:flex-row lg:items-start gap-4 lg:gap-5">
          <div class="flex-1 grid grid-cols-1 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.6fr)] gap-4">
            <UFormField label="媒体库名称">
              <UInput v-model="root.name" placeholder="例如：电影库 / 剧集库" class="w-full" />
            </UFormField>
            <UFormField label="容器内路径" description="填写容器内路径，不是宿主机路径。">
              <div class="flex flex-col sm:flex-row gap-2">
                <UInput v-model="root.path" placeholder="/media/movies" class="flex-1 min-w-0" />
                <UButton label="检测路径" icon="i-lucide-search-check" color="neutral" variant="soft" :loading="inspectingId === root.id" @click="inspectRoot(root)" />
              </div>
            </UFormField>
          </div>

          <div class="lg:w-[260px] space-y-3 shrink-0">
            <div class="flex flex-wrap items-center gap-2">
              <UBadge :color="root.isDefault ? 'primary' : 'neutral'" variant="subtle">{{ root.isDefault ? '默认库' : '普通库' }}</UBadge>
              <UBadge :color="root.enabled !== false ? 'success' : 'neutral'" variant="subtle">{{ root.enabled !== false ? '已启用' : '已停用' }}</UBadge>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <UButton :label="root.isDefault ? '当前默认' : '设为默认'" icon="i-lucide-star" size="sm" color="primary" variant="soft" :disabled="root.isDefault" @click="setDefaultRoot(index)" />
              <UButton :label="root.enabled !== false ? '停用' : '启用'" :icon="root.enabled !== false ? 'i-lucide-toggle-left' : 'i-lucide-toggle-right'" size="sm" color="neutral" variant="ghost" @click="root.enabled = root.enabled === false" />
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <UButton icon="i-lucide-arrow-up" color="neutral" variant="ghost" size="sm" :disabled="index === 0" @click="moveRoot(index, -1)" />
              <UButton icon="i-lucide-arrow-down" color="neutral" variant="ghost" size="sm" :disabled="index === mediaRoots.length - 1" @click="moveRoot(index, 1)" />
              <UButton icon="i-lucide-trash-2" color="error" variant="ghost" size="sm" @click="removeMediaRoot(index)" />
            </div>
          </div>
        </div>

        <div v-if="inspectionStates[root.id]" class="rounded-2xl px-3 py-2 border text-xs leading-relaxed" :class="inspectionStates[root.id].ok ? 'border-green-100 bg-green-50/80 text-green-700 dark:border-green-900/40 dark:bg-green-950/15 dark:text-green-300' : 'border-red-100 bg-red-50/80 text-red-700 dark:border-red-900/40 dark:bg-red-950/15 dark:text-red-300'">
          <div class="flex flex-wrap items-center gap-2">
            <UIcon :name="inspectionStates[root.id].ok ? 'i-lucide-badge-check' : 'i-lucide-badge-alert'" class="w-4 h-4 shrink-0" />
            <span class="font-medium">{{ inspectionStates[root.id].ok ? '检测通过' : '检测失败' }}</span>
            <span class="opacity-80">{{ inspectionStates[root.id].message }}</span>
          </div>
        </div>
      </div>

      <div v-if="!mediaRoots.length" class="rounded-3xl border border-dashed border-gray-300 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-900/20 p-8 text-center space-y-3">
        <UIcon name="i-lucide-library-big" class="w-8 h-8 mx-auto text-gray-300 dark:text-gray-600" />
        <div>
          <p class="text-sm font-medium text-gray-700 dark:text-gray-200">当前还没有媒体库</p>
          <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">点击“新增媒体库”，填写容器内路径后保存即可。</p>
        </div>
        <UButton label="新增媒体库" icon="i-lucide-plus" color="primary" variant="soft" @click="addMediaRoot" />
      </div>
    </div>

    <UCollapsible class="rounded-3xl border border-amber-100 dark:border-amber-900/50 bg-amber-50/80 dark:bg-amber-950/20 p-4 sm:p-5">
      <template #default="{ open }">
        <div class="flex items-center justify-between gap-3 cursor-pointer" @click="helpOpen = !helpOpen">
          <div>
            <p class="text-sm font-semibold text-amber-700 dark:text-amber-300">帮助与排障</p>
            <p class="text-xs text-amber-700/80 dark:text-amber-200/80 mt-1">常见挂载、路径和权限问题说明。</p>
          </div>
          <UButton :icon="helpOpen ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'" color="neutral" variant="ghost" size="sm" />
        </div>
      </template>
      <template #content>
        <div v-if="helpOpen" class="grid grid-cols-1 xl:grid-cols-2 gap-4 mt-4 text-xs leading-relaxed">
          <div class="rounded-2xl border border-white/70 dark:border-white/5 bg-white/70 dark:bg-gray-900/20 p-4 space-y-2 text-gray-600 dark:text-gray-300">
            <p class="font-semibold text-gray-800 dark:text-gray-100">配置提示</p>
            <p>1. 先将宿主机目录挂载到容器内，例如 <code>/volume1/movies:/media/movies</code>。</p>
            <p>2. 在本页填写容器内路径 <code>/media/movies</code>，不要填写宿主机路径。</p>
            <p>3. 保存前先点击“检测路径”，确保目录存在且容器有读取权限。</p>
            <p>4. 将最常用的媒体库设为默认库，首页文件浏览器会优先打开它。</p>
          </div>
          <div class="rounded-2xl border border-white/70 dark:border-white/5 bg-white/70 dark:bg-gray-900/20 p-4 space-y-2 text-amber-700/90 dark:text-amber-200/85">
            <p class="font-semibold text-amber-800 dark:text-amber-100">常见问题</p>
            <p>目录不存在：通常是挂载错误，或误填了宿主机路径。</p>
            <p>权限不足：请检查宿主机权限、容器运行用户，必要时临时使用 root 验证。</p>
            <p>保存被阻止：默认会拦截不可访问的已启用媒体库，可先停用再保存。</p>
          </div>
        </div>
      </template>
    </UCollapsible>

    <div class="fixed bottom-4 left-1/2 z-30 w-[min(1100px,calc(100vw-24px))] -translate-x-1/2 rounded-2xl border border-gray-200/80 dark:border-gray-800/80 bg-white/92 dark:bg-gray-950/88 backdrop-blur px-4 py-3 shadow-lg">
      <div class="flex flex-col sm:flex-row sm:items-center gap-3">
        <div class="flex-1 min-w-0 text-xs text-gray-500 dark:text-gray-400">
          <span>共 {{ mediaRoots.length }} 个媒体库</span>
          <span class="mx-2 text-gray-300 dark:text-gray-600">•</span>
          <span>异常 {{ invalidRootCount }} 个</span>
          <span v-if="forceSaveInvalidRoots" class="mx-2 text-gray-300 dark:text-gray-600">•</span>
          <span v-if="forceSaveInvalidRoots">已启用强制保存</span>
        </div>
        <div class="flex items-center justify-end gap-3 sm:ml-auto">
          <UButton label="取消" color="neutral" variant="ghost" to="/" />
          <UButton label="保存媒体库" color="primary" :loading="pending" @click="save" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { MediaRoot } from '~~/types'

definePageMeta({
  title: '媒体库管理 - SubX'
})

const toast = useToast()
const pending = ref(false)
const inspectingId = ref('')
const batchInspecting = ref(false)
const forceSaveInvalidRoots = ref(false)
const helpOpen = ref(false)

const { data, refresh } = await useFetch('/api/config')
const config = ref<any>(data.value || {})
const mediaRoots = ref<MediaRoot[]>(Array.isArray(config.value?.mediaRoots) ? [...config.value.mediaRoots] : [])
const inspectionStates = ref<Record<string, { ok: boolean, message: string, path?: string }>>({})

const defaultRootCount = computed(() => mediaRoots.value.filter(root => root.isDefault).length)
const invalidRootCount = computed(() => Object.values(inspectionStates.value).filter(item => !item.ok).length)

onMounted(() => {
  if (mediaRoots.value.length && !mediaRoots.value.some(root => root.isDefault)) {
    mediaRoots.value[0].isDefault = true
  }
})

function addMediaRoot() {
  mediaRoots.value.push({ id: `root-${Date.now()}`, name: `媒体库 ${mediaRoots.value.length + 1}`, path: '', enabled: true, order: mediaRoots.value.length, isDefault: mediaRoots.value.length === 0 })
}

function removeMediaRoot(index: number) {
  const removed = mediaRoots.value[index]
  mediaRoots.value.splice(index, 1)
  if (removed?.id) delete inspectionStates.value[removed.id]
  if (removed?.isDefault && mediaRoots.value.length) mediaRoots.value[0].isDefault = true
}

function setDefaultRoot(index: number) {
  mediaRoots.value.forEach((root, i) => { root.isDefault = i === index })
}

function moveRoot(index: number, delta: number) {
  const target = index + delta
  if (target < 0 || target >= mediaRoots.value.length) return
  const arr = [...mediaRoots.value]
  const [item] = arr.splice(index, 1)
  arr.splice(target, 0, item)
  mediaRoots.value = arr.map((root, i) => ({ ...root, order: i }))
}

function sanitizeMediaRoots() {
  return mediaRoots.value.map((root, index) => ({
    id: String(root.id || `root-${index + 1}`),
    name: String(root.name || '').trim(),
    path: String(root.path || '').trim(),
    enabled: root.enabled !== false,
    isDefault: root.isDefault === true,
    order: index
  }))
}

async function inspectRoot(root: MediaRoot) {
  inspectingId.value = root.id
  try {
    const result = await $fetch('/api/media-roots/inspect', { method: 'POST', body: { root } })
    inspectionStates.value[root.id] = { ok: !!result.ok, message: result.message, path: result.path }
  } catch (e: any) {
    inspectionStates.value[root.id] = { ok: false, message: e?.data?.message || '检测失败', path: root.path }
  } finally {
    inspectingId.value = ''
  }
}

async function inspectAllRoots(showToast = true) {
  batchInspecting.value = true
  try {
    const res = await $fetch('/api/media-roots/inspect-all', { method: 'POST', body: { roots: sanitizeMediaRoots() } })
    for (const item of res.results || []) {
      inspectionStates.value[item.id] = { ok: !!item.ok, message: item.message, path: item.path }
    }
    if (showToast) {
      toast.add({ title: '检测完成', description: `已检测 ${res.results?.length || 0} 个媒体库`, color: 'success' })
    }
    return res.results || []
  } catch (e: any) {
    if (showToast) {
      toast.add({ title: '检测失败', description: e?.data?.message || '无法批量检测媒体库', color: 'danger' })
    }
    throw e
  } finally {
    batchInspecting.value = false
  }
}

async function save() {
  pending.value = true
  try {
    const roots = sanitizeMediaRoots()
    const enabledRoots = roots.filter(root => root.enabled !== false)

    if (enabledRoots.length > 0) {
      const results = await inspectAllRoots(false)
      const failedRoots = results.filter((item: any) => enabledRoots.some(root => root.id === item.id) && !item.ok)
      if (failedRoots.length > 0 && !forceSaveInvalidRoots.value) {
        toast.add({ title: '存在不可访问的媒体库', description: `请先修复 ${failedRoots.length} 个无效媒体库，或将其停用后再保存。`, color: 'warning' })
        return
      }
    }

    await $fetch('/api/config', { method: 'PUT', body: { mediaRoots: roots } })
    await refresh()
    config.value = data.value || config.value
    toast.add({ title: '成功', description: '媒体库设置已保存', color: 'success' })
    navigateTo('/')
  } catch (e: any) {
    toast.add({ title: '错误', description: e?.data?.message || e?.message || '无法保存媒体库设置', color: 'danger' })
  } finally {
    pending.value = false
  }
}
</script>
