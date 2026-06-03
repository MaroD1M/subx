<template>
  <div class="space-y-6 max-w-[1200px] mx-auto stagger-fade-in">
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

    <div class="grid grid-cols-1 lg:grid-cols-[1.4fr_0.8fr] gap-5 items-start">
      <div class="rounded-3xl border border-gray-100 dark:border-gray-800 bg-white/85 dark:bg-gray-950/35 p-5 space-y-4">
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <p class="text-sm font-semibold text-gray-800 dark:text-gray-100">媒体库列表</p>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">支持默认库、启停、排序、单项检测与批量检测。</p>
          </div>
          <div class="flex items-center gap-2">
            <UButton label="批量检测" icon="i-lucide-scan-search" size="sm" color="neutral" variant="ghost" :loading="batchInspecting" @click="inspectAllRoots()" />
            <UButton label="新增媒体库" icon="i-lucide-plus" size="sm" color="primary" variant="soft" @click="addMediaRoot" />
          </div>
        </div>

        <div class="space-y-3 max-h-[70vh] overflow-y-auto pr-1 custom-scrollbar">
          <div v-for="(root, index) in mediaRoots" :key="root.id" class="p-4 rounded-2xl border border-gray-200/70 dark:border-gray-700/70 bg-gray-50/70 dark:bg-gray-950/40 space-y-3">
            <div class="grid grid-cols-1 xl:grid-cols-12 gap-3 items-start">
              <div class="xl:col-span-3"><UFormField label="显示名称"><UInput v-model="root.name" placeholder="例如：电影库" class="w-full" /></UFormField></div>
              <div class="xl:col-span-5"><UFormField label="容器内路径"><UInput v-model="root.path" placeholder="例如：/media/movies" class="w-full font-mono text-xs" /></UFormField></div>
              <div class="xl:col-span-2"><UFormField label="默认库"><UCheckbox :model-value="root.isDefault === true" @update:model-value="setDefaultRoot(index)" /></UFormField></div>
              <div class="xl:col-span-2 flex xl:justify-end gap-1 pt-0 xl:pt-7">
                <UButton icon="i-lucide-arrow-up" color="neutral" variant="ghost" size="sm" :disabled="index === 0" @click="moveRoot(index, -1)" />
                <UButton icon="i-lucide-arrow-down" color="neutral" variant="ghost" size="sm" :disabled="index === mediaRoots.length - 1" @click="moveRoot(index, 1)" />
                <UButton icon="i-lucide-trash-2" color="error" variant="ghost" size="sm" @click="removeMediaRoot(index)" />
              </div>
            </div>

            <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-3 rounded-xl border border-gray-100 dark:border-gray-800 bg-white/80 dark:bg-gray-900/50 p-3">
              <div class="flex items-center gap-3 flex-wrap">
                <div class="flex items-center gap-2">
                  <USwitch v-model="root.enabled" />
                  <span class="text-xs text-gray-600 dark:text-gray-400">{{ root.enabled === false ? '已停用' : '已启用' }}</span>
                </div>
                <UBadge v-if="inspectionStates[root.id]" :color="inspectionStates[root.id].ok ? 'success' : 'error'" variant="subtle">
                  {{ inspectionStates[root.id].ok ? '可访问' : '异常' }}
                </UBadge>
                <span v-if="inspectionStates[root.id]" class="text-xs text-gray-500 dark:text-gray-400 break-all">{{ inspectionStates[root.id].message }}</span>
              </div>
              <UButton label="检测路径" icon="i-lucide-search-check" size="sm" color="neutral" variant="ghost" :loading="inspectingId === root.id" @click="inspectRoot(root)" />
            </div>
          </div>

          <div v-if="!mediaRoots.length" class="text-sm text-gray-500 dark:text-gray-400 p-4 rounded-2xl border border-dashed border-gray-300 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-900/20">
            当前未配置独立媒体库。应用会回退到默认媒体目录；如需多目录管理，请新增媒体库并填写容器内路径。
          </div>
        </div>
      </div>

      <div class="space-y-5">
        <div class="rounded-3xl border border-gray-100 dark:border-gray-800 bg-white/85 dark:bg-gray-950/35 p-5 space-y-3">
          <p class="text-sm font-semibold text-gray-800 dark:text-gray-100">使用指引</p>
          <div class="space-y-3 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
            <p>1. 先在 Docker 中把宿主机目录挂载到容器内，例如 <code>/volume1/movies:/media/movies</code>。</p>
            <p>2. 在本页填写容器内路径 <code>/media/movies</code>，不要填写宿主机路径。</p>
            <p>3. 保存前先点击“检测路径”，确保目录存在且容器有读取权限。</p>
            <p>4. 将最常用的媒体库设为默认库，首页文件浏览器会优先打开它。</p>
          </div>
        </div>

        <div class="rounded-3xl border border-amber-100 dark:border-amber-900/50 bg-amber-50/80 dark:bg-amber-950/20 p-5 space-y-3">
          <p class="text-sm font-semibold text-amber-700 dark:text-amber-300">常见问题</p>
          <div class="space-y-2 text-xs text-amber-700/90 dark:text-amber-200/85 leading-relaxed">
            <p>目录不存在：通常是挂载错误，或误填了宿主机路径。</p>
            <p>权限不足：请检查宿主机权限、容器运行用户，必要时临时使用 root 验证。</p>
            <p>保存被阻止：默认会拦截不可访问的已启用媒体库，可先停用再保存。</p>
          </div>
          <div class="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            <USwitch v-model="forceSaveInvalidRoots" />
            <span>允许带无效媒体库强制保存</span>
          </div>
        </div>

        <div class="flex items-center justify-end gap-3">
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

const { data, refresh } = await useFetch('/api/config')
const config = ref<any>(data.value || {})
const mediaRoots = ref<MediaRoot[]>(Array.isArray(config.value?.mediaRoots) ? [...config.value.mediaRoots] : [])
const inspectionStates = ref<Record<string, { ok: boolean, message: string, path?: string }>>({})

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
