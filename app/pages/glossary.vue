<template>
  <AppContainer size="wide" class="space-y-4 py-2">
    <PageHeader
      title="术语库"
      description="管理全局与系列术语。"
      :breadcrumb="[{ label: '首页', icon: 'i-lucide-home', to: '/' }, { label: '术语库' }]"
    >
      <template #actions>
        <UButton label="新增术语" icon="i-lucide-plus" size="sm" color="primary" @click="openCreate" />
        <UDropdownMenu :items="headerMenuItems" size="sm">
          <UButton icon="i-lucide-ellipsis" color="neutral" variant="ghost" size="sm" aria-label="更多操作" title="更多操作" />
        </UDropdownMenu>
      </template>
    </PageHeader>

    <div class="app-toolbar-card">
      <div class="flex flex-wrap items-center gap-2">
        <UInput v-model="filters.q" icon="i-lucide-search" placeholder="搜索原文或译文" class="min-w-[12rem] flex-1" aria-label="搜索术语" />
        <USelect v-model="filters.scopeType" :items="scopeTypeItems" class="w-36" aria-label="作用域筛选" />
        <UInput v-if="filters.scopeType === 'series'" v-model="filters.scopeKey" placeholder="系列 Key" class="w-44" aria-label="系列 Key" />
        <UPopover v-model:open="filterPanelOpen" :content="{ align: 'end' }">
          <UButton
            label="筛选"
            icon="i-lucide-sliders-horizontal"
            size="sm"
            color="neutral"
            :variant="advancedFilterCount ? 'soft' : 'ghost'"
          />
          <template #content>
            <div class="w-64 space-y-3 p-3">
              <div class="flex items-center justify-between">
                <p class="app-section-title">筛选</p>
                <UButton label="重置" size="xs" color="neutral" variant="ghost" :disabled="!advancedFilterCount" @click="resetFilters" />
              </div>
              <UFormField label="启用状态"><USelect v-model="filters.enabled" :items="enabledItems" class="w-full" /></UFormField>
              <UFormField label="语言对">
                <div class="flex items-center gap-1">
                  <UInput v-model="filters.sourceLang" placeholder="源" class="w-full" />
                  <UIcon name="i-lucide-arrow-right" class="h-3.5 w-3.5 shrink-0 text-gray-400" />
                  <UInput v-model="filters.targetLang" placeholder="目标" class="w-full" />
                </div>
              </UFormField>
            </div>
          </template>
        </UPopover>
        <span class="app-pill app-pill-neutral ml-auto">共 {{ data?.total || 0 }} 条</span>
      </div>
    </div>

    <div v-if="error" class="app-info-warning p-3 text-sm">术语库加载失败：{{ errorMessage }}</div>

    <div v-if="pending" class="surface-card p-6 text-center text-sm text-gray-500">正在加载术语...</div>
    <div v-else-if="!entries.length" class="surface-card p-10 text-center">
      <UIcon name="i-lucide-book-open" class="mx-auto h-8 w-8 text-gray-300 dark:text-gray-600" />
      <p class="app-caption mt-2">暂无术语</p>
    </div>
    <div v-else class="surface-card overflow-hidden">
      <div class="divide-y divide-gray-100 dark:divide-gray-800">
        <div
          v-for="entry in entries"
          :key="entry.id"
          class="group flex items-start gap-3 px-3 py-2.5 transition-colors hover:bg-gray-50/80 dark:hover:bg-gray-900/30"
        >
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span class="break-all text-sm font-medium text-gray-900 dark:text-gray-100">{{ entry.source }}</span>
              <UIcon name="i-lucide-arrow-right" class="h-3.5 w-3.5 shrink-0 text-gray-400" />
              <span class="break-all text-sm font-medium text-primary-700 dark:text-primary-300">{{ entry.target }}</span>
              <UIcon v-if="!entry.enabled" name="i-lucide-eye-off" class="h-3.5 w-3.5 text-amber-500" title="已停用" />
              <UIcon v-if="entry.locked" name="i-lucide-lock" class="h-3.5 w-3.5 text-gray-400" title="已锁定" />
            </div>
            <div class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-gray-500 dark:text-gray-400">
              <span>{{ entry.scopeType === 'series' ? '系列' : '全局' }}</span>
              <span v-if="entry.scopeType === 'series'" class="max-w-[16rem] truncate" :title="entry.scopeKey">· {{ entry.scopeKey }}</span>
              <span v-if="entry.category">· {{ entry.category }}</span>
              <span v-if="entry.sourceLang || entry.targetLang">· {{ entry.sourceLang || '任意' }} → {{ entry.targetLang || '任意' }}</span>
              <span v-if="entry.notes" class="hidden max-w-[28rem] truncate sm:inline" :title="entry.notes">· {{ entry.notes }}</span>
            </div>
          </div>
          <div class="flex shrink-0 items-center">
            <UButton icon="i-lucide-pencil" size="xs" color="neutral" variant="ghost" aria-label="编辑术语" title="编辑" @click="openEdit(entry)" />
            <UDropdownMenu :items="entryMenuItems(entry)" size="sm">
              <UButton icon="i-lucide-ellipsis" size="xs" color="neutral" variant="ghost" aria-label="更多术语操作" title="更多" />
            </UDropdownMenu>
          </div>
        </div>
      </div>
      <div class="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 px-3 py-2 dark:border-gray-800">
        <span class="app-meta">第 {{ data?.page || 1 }} / {{ totalPages }} 页</span>
        <div class="flex items-center gap-1.5">
          <USelect v-model="filters.pageSize" :items="pageSizeItems" size="xs" class="w-24" aria-label="每页条数" />
          <UButton label="上一页" size="xs" color="neutral" variant="ghost" :disabled="(data?.page || 1) <= 1" @click="filters.page -= 1" />
          <UButton label="下一页" size="xs" color="neutral" variant="ghost" :disabled="(data?.page || 1) >= totalPages" @click="filters.page += 1" />
        </div>
      </div>
    </div>

    <UModal v-model:open="editorOpen" :title="editorForm.id ? '编辑术语' : '新增术语'">
      <template #body>
        <div class="space-y-4">
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <UFormField label="原文" required><UInput v-model="editorForm.source" class="w-full" autofocus /></UFormField>
            <UFormField label="译文" required><UInput v-model="editorForm.target" class="w-full" /></UFormField>
          </div>
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <UFormField label="作用域"><USelect v-model="editorForm.scopeType" :items="scopeTypeItemsAll" class="w-full" /></UFormField>
            <UFormField v-if="editorForm.scopeType === 'series'" label="系列 Key"><UInput v-model="editorForm.scopeKey" class="w-full" /></UFormField>
          </div>
          <details class="rounded-lg border border-gray-100 dark:border-gray-800">
            <summary class="cursor-pointer px-3 py-2 text-xs font-medium text-gray-600 dark:text-gray-300">更多设置</summary>
            <div class="space-y-3 border-t border-gray-100 p-3 dark:border-gray-800">
              <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <UFormField label="源语言"><UInput v-model="editorForm.sourceLang" placeholder="任意" class="w-full" /></UFormField>
                <UFormField label="目标语言"><UInput v-model="editorForm.targetLang" placeholder="任意" class="w-full" /></UFormField>
                <UFormField label="优先级"><UInputNumber v-model="editorForm.priority" :min="-1000" :max="1000" class="w-full" /></UFormField>
              </div>
              <UFormField label="分类"><UInput v-model="editorForm.category" placeholder="人名 / 地名 / 组织" class="w-full" /></UFormField>
              <UFormField label="备注"><UTextarea v-model="editorForm.notes" :rows="2" class="w-full" /></UFormField>
              <div class="flex flex-wrap gap-5">
                <label class="app-field-row gap-2 text-sm"><span>启用</span><USwitch v-model="editorForm.enabled" /></label>
                <label class="app-field-row gap-2 text-sm"><span>锁定</span><USwitch v-model="editorForm.locked" /></label>
              </div>
            </div>
          </details>
          <p v-if="editorError" class="text-sm text-error-600 dark:text-error-400">{{ editorError }}</p>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton label="取消" color="neutral" variant="ghost" @click="editorOpen = false" />
          <UButton :label="editorForm.id ? '保存' : '新增'" color="primary" :loading="saving" @click="saveEntry" />
        </div>
      </template>
    </UModal>

    <UModal v-model:open="importOpen" title="导入术语" description="支持 CSV、JSON；导入前可预览。">
      <template #body>
        <div class="space-y-3">
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <UFormField label="格式"><USelect v-model="importForm.format" :items="importFormatItems" class="w-full" /></UFormField>
            <UFormField label="作用域"><USelect v-model="importForm.scopeType" :items="scopeTypeItemsAll" class="w-full" /></UFormField>
            <UFormField v-if="importForm.scopeType === 'series'" label="系列 Key"><UInput v-model="importForm.scopeKey" class="w-full" /></UFormField>
          </div>
          <UFormField label="冲突">
            <USelect v-model="importForm.strategy" :items="importStrategyItems" class="w-full" />
          </UFormField>
          <label class="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-gray-200 px-3 py-2.5 text-xs text-gray-600 transition-colors hover:border-primary-300 hover:bg-primary-50/40 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-primary-950/20">
            <UIcon name="i-lucide-upload" class="h-4 w-4 shrink-0" />
            <span class="min-w-0 flex-1 truncate">{{ importForm.content ? '已选择文件内容' : '选择 CSV / JSON 文件' }}</span>
            <input type="file" accept=".csv,.json,text/csv,application/json" class="sr-only" @change="readImportFile" />
          </label>
          <details class="rounded-lg border border-gray-100 dark:border-gray-800">
            <summary class="cursor-pointer px-3 py-2 text-xs font-medium text-gray-600 dark:text-gray-300">或粘贴内容</summary>
            <div class="border-t border-gray-100 p-3 dark:border-gray-800">
              <UTextarea v-model="importForm.content" :rows="6" placeholder="source,target&#10;Jedi,绝地" class="w-full font-mono text-xs" />
            </div>
          </details>
          <div v-if="importPreview" class="rounded-lg bg-gray-50 px-3 py-2 text-xs dark:bg-gray-900/40">
            <p>共 {{ importPreview.total }} · 新增 {{ importPreview.inserted }} · 更新 {{ importPreview.updated }} · 跳过 {{ importPreview.skipped }}</p>
            <p v-if="importPreview.errors?.length" class="mt-1 text-amber-600 dark:text-amber-400">{{ importPreview.errors.slice(0, 3).join('；') }}</p>
          </div>
          <p v-if="importError" class="text-sm text-error-600 dark:text-error-400">{{ importError }}</p>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full flex-wrap justify-end gap-2">
          <UButton label="取消" color="neutral" variant="ghost" @click="importOpen = false" />
          <UButton label="预览" color="neutral" variant="soft" :loading="importing" @click="runImport(true)" />
          <UButton label="导入" color="primary" :loading="importing" :disabled="!importForm.content.trim()" @click="runImport(false)" />
        </div>
      </template>
    </UModal>

    <UModal v-model:open="snapshotOpen" title="快照与回滚">
      <template #body>
        <div class="space-y-4">
          <div class="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_8rem_1fr_auto]">
            <UFormField label="名称"><UInput v-model="snapshotForm.name" placeholder="可选" class="w-full" /></UFormField>
            <UFormField label="作用域"><USelect v-model="snapshotForm.scopeType" :items="scopeTypeItemsAll" class="w-full" /></UFormField>
            <UFormField v-if="snapshotForm.scopeType === 'series'" label="系列 Key"><UInput v-model="snapshotForm.scopeKey" class="w-full" /></UFormField>
            <UButton label="创建快照" icon="i-lucide-camera" color="primary" size="sm" class="self-end" :loading="snapshotSaving" @click="createSnapshot" />
          </div>
          <div class="max-h-80 divide-y divide-gray-100 overflow-y-auto rounded-lg border border-gray-100 dark:divide-gray-800 dark:border-gray-800">
            <div v-for="snapshot in snapshots" :key="snapshot.id" class="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
              <div class="min-w-0">
                <p class="truncate text-sm font-medium">{{ snapshot.name }}</p>
                <p class="app-meta">{{ snapshot.scopeType === 'series' ? snapshot.scopeKey : '全局' }} · {{ snapshot.entryCount }} 条 · {{ formatDate(snapshot.createdAt) }}</p>
              </div>
              <div class="flex shrink-0 gap-1">
                <UButton icon="i-lucide-rotate-ccw" size="xs" color="warning" variant="ghost" aria-label="回滚快照" title="回滚" @click="rollbackSnapshot(snapshot)" />
                <UButton icon="i-lucide-trash-2" size="xs" color="error" variant="ghost" aria-label="删除快照" title="删除" @click="deleteSnapshot(snapshot)" />
              </div>
            </div>
            <p v-if="!snapshots.length" class="app-caption px-3 py-6 text-center">暂无快照</p>
          </div>
        </div>
      </template>
    </UModal>

    <UModal v-model:open="versionsOpen" :title="`版本历史 · ${versionsEntry?.source || ''}`">
      <template #body>
        <div class="max-h-96 divide-y divide-gray-100 overflow-y-auto rounded-lg border border-gray-100 dark:divide-gray-800 dark:border-gray-800">
          <div v-for="version in versions" :key="version.id" class="px-3 py-2.5 text-xs">
            <div class="flex items-center justify-between gap-2">
              <span class="font-medium">{{ version.action }} · v{{ version.version }}</span>
              <span class="app-meta">{{ formatDate(version.createdAt) }}</span>
            </div>
            <p v-if="version.after?.target" class="mt-1 truncate text-gray-500 dark:text-gray-400">{{ version.before?.target || '(空)' }} → {{ version.after.target }}</p>
          </div>
          <p v-if="!versions.length" class="app-caption px-3 py-6 text-center">暂无版本记录</p>
        </div>
      </template>
    </UModal>
  </AppContainer>
</template>

<script setup lang="ts">
import { formatDateTime } from '~~/shared/time'

interface GlossaryEntry {
  id: number
  source: string
  target: string
  sourceLang: string
  targetLang: string
  scopeType: 'global' | 'series'
  scopeKey: string
  category: string
  notes: string
  priority: number
  enabled: boolean
  locked: boolean
  version: number
}

useHead({ title: '术语库 - SubX' })

const toast = useToast()
const { confirm } = useConfirm()
const timeZone = useTimeZone()
const scopeTypeItems = [
  { label: '全部作用域', value: 'all' },
  { label: '全局', value: 'global' },
  { label: '系列', value: 'series' }
]
const scopeTypeItemsAll = [
  { label: '全局', value: 'global' },
  { label: '系列', value: 'series' }
]
const enabledItems = [
  { label: '全部状态', value: 'all' },
  { label: '已启用', value: 'true' },
  { label: '已停用', value: 'false' }
]
const importFormatItems = [
  { label: 'CSV', value: 'csv' },
  { label: 'JSON', value: 'json' }
]
const importStrategyItems = [
  { label: '跳过已存在（推荐）', value: 'skip' },
  { label: '覆盖已存在', value: 'overwrite' }
]
const pageSizeItems = [
  { label: '20 条/页', value: 20 },
  { label: '50 条/页', value: 50 },
  { label: '100 条/页', value: 100 }
]

const filterPanelOpen = ref(false)
const filters = reactive({
  q: '',
  scopeType: 'all',
  scopeKey: '',
  enabled: 'all',
  sourceLang: '',
  targetLang: '',
  page: 1,
  pageSize: 50
})
const advancedFilterCount = computed(() => [
  filters.enabled !== 'all',
  Boolean(filters.sourceLang.trim()),
  Boolean(filters.targetLang.trim())
].filter(Boolean).length)
const headerMenuItems = [
  [{ label: '导入术语', icon: 'i-lucide-upload', onSelect: openImport }],
  [
    { label: '导出 CSV', icon: 'i-lucide-file-text', onSelect: () => exportGlossary('csv') },
    { label: '导出 JSON', icon: 'i-lucide-file-code', onSelect: () => exportGlossary('json') }
  ],
  [{ label: '快照与回滚', icon: 'i-lucide-camera', onSelect: openSnapshots }]
]
const queryParams = computed(() => ({
  q: filters.q.trim() || undefined,
  scopeType: filters.scopeType === 'all' ? undefined : filters.scopeType,
  scopeKey: filters.scopeType === 'series' ? filters.scopeKey.trim() || undefined : undefined,
  enabled: filters.enabled === 'all' ? undefined : filters.enabled,
  sourceLang: filters.sourceLang.trim() || undefined,
  targetLang: filters.targetLang.trim() || undefined,
  page: filters.page,
  pageSize: filters.pageSize
}))
const { data, pending, error, refresh } = await useFetch('/api/glossary', { query: queryParams })
const entries = computed<GlossaryEntry[]>(() => (data.value as any)?.entries || [])
const errorMessage = computed(() => (error.value as any)?.data?.message || (error.value as any)?.message || '请稍后重试')
const totalPages = computed(() => Math.max(1, Math.ceil(Number((data.value as any)?.total || 0) / filters.pageSize)))

watch(() => [filters.q, filters.scopeType, filters.scopeKey, filters.enabled, filters.sourceLang, filters.targetLang, filters.pageSize], () => { filters.page = 1 })

const editorOpen = ref(false)
const saving = ref(false)
const editorError = ref('')
const editorForm = reactive({
  id: 0,
  source: '',
  target: '',
  sourceLang: '',
  targetLang: '',
  scopeType: 'global' as 'global' | 'series',
  scopeKey: '',
  category: '',
  notes: '',
  priority: 0,
  enabled: true,
  locked: false
})

function resetEditor() {
  Object.assign(editorForm, {
    id: 0, source: '', target: '', sourceLang: '', targetLang: '',
    scopeType: 'global', scopeKey: '', category: '', notes: '', priority: 0, enabled: true, locked: false
  })
  editorError.value = ''
}

function openCreate() {
  resetEditor()
  editorOpen.value = true
}

function openEdit(entry: GlossaryEntry) {
  Object.assign(editorForm, { ...entry })
  editorError.value = ''
  editorOpen.value = true
}

async function saveEntry() {
  if (!editorForm.source.trim() || !editorForm.target.trim()) {
    editorError.value = '原文和译文不能为空'
    return
  }
  if (editorForm.scopeType === 'series' && !editorForm.scopeKey.trim()) {
    editorError.value = '系列术语必须填写系列 Key'
    return
  }
  saving.value = true
  editorError.value = ''
  try {
    const body = { ...editorForm, scopeKey: editorForm.scopeType === 'series' ? editorForm.scopeKey.trim() : '' }
    if (editorForm.id) await $fetch(`/api/glossary/${editorForm.id}`, { method: 'PATCH', body })
    else await $fetch('/api/glossary', { method: 'POST', body })
    editorOpen.value = false
    toast.add({ title: editorForm.id ? '术语已更新' : '术语已新增', color: 'success' })
    await refresh()
  } catch (e: any) {
    editorError.value = e?.data?.message || e?.message || '保存失败'
  } finally {
    saving.value = false
  }
}

function resetFilters() {
  filters.enabled = 'all'
  filters.sourceLang = ''
  filters.targetLang = ''
}

function entryMenuItems(entry: GlossaryEntry) {
  return [
    { label: '版本历史', icon: 'i-lucide-history', onSelect: () => openVersions(entry) },
    { label: '删除术语', icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => removeEntry(entry) }
  ]
}

async function removeEntry(entry: GlossaryEntry) {
  if (!(await confirm({ title: '删除这条术语？', description: `${entry.source} → ${entry.target}`, confirmLabel: '删除', color: 'error' }))) return
  try {
    await $fetch(`/api/glossary/${entry.id}`, { method: 'DELETE' })
    toast.add({ title: '术语已删除', color: 'success' })
    await refresh()
  } catch (e: any) {
    toast.add({ title: '删除失败', description: e?.data?.message || e?.message || '未知错误', color: 'error' })
  }
}

const exporting = ref(false)
async function exportGlossary(format: 'csv' | 'json' = 'csv') {
  exporting.value = true
  try {
    const result: any = await $fetch('/api/glossary/export', { query: { ...queryParams.value, format, page: undefined, pageSize: undefined } })
    const blob = new Blob([result.content], { type: result.contentType || 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = result.filename || `subx-glossary.${format}`
    link.click()
    URL.revokeObjectURL(url)
    toast.add({ title: '已导出', description: result.filename, color: 'success' })
  } catch (e: any) {
    toast.add({ title: '导出失败', description: e?.data?.message || e?.message || '未知错误', color: 'error' })
  } finally {
    exporting.value = false
  }
}

const importOpen = ref(false)
const importing = ref(false)
const importError = ref('')
const importPreview = ref<any>(null)
const importForm = reactive({ format: 'csv', scopeType: 'global' as 'global' | 'series', scopeKey: '', strategy: 'skip', content: '' })

function openImport() {
  importError.value = ''
  importPreview.value = null
  importOpen.value = true
}

async function readImportFile(event: Event) {
  const file = (event.target as HTMLInputElement)?.files?.[0]
  if (!file) return
  importForm.content = await file.text()
  importForm.format = file.name.toLowerCase().endsWith('.json') ? 'json' : 'csv'
  importPreview.value = null
}

async function runImport(dryRun: boolean) {
  if (!importForm.content.trim()) return
  importing.value = true
  importError.value = ''
  try {
    const result: any = await $fetch('/api/glossary/import', {
      method: 'POST',
      body: { ...importForm, dryRun }
    })
    importPreview.value = result
    if (!dryRun) {
      toast.add({ title: '导入完成', description: `新增 ${result.inserted} · 更新 ${result.updated} · 跳过 ${result.skipped}`, color: 'success' })
      await refresh()
    }
  } catch (e: any) {
    importError.value = e?.data?.message || e?.message || '导入失败'
  } finally {
    importing.value = false
  }
}

const snapshotOpen = ref(false)
const snapshotSaving = ref(false)
const snapshots = ref<any[]>([])
const snapshotForm = reactive({ name: '', scopeType: 'global' as 'global' | 'series', scopeKey: '' })

async function loadSnapshots() {
  const result: any = await $fetch('/api/glossary/snapshots')
  snapshots.value = result.snapshots || []
}

async function openSnapshots() {
  snapshotOpen.value = true
  try { await loadSnapshots() } catch { /* ignore */ }
}

async function createSnapshot() {
  if (snapshotForm.scopeType === 'series' && !snapshotForm.scopeKey.trim()) {
    toast.add({ title: '请填写系列 Key', color: 'warning' })
    return
  }
  snapshotSaving.value = true
  try {
    await $fetch('/api/glossary/snapshots', { method: 'POST', body: snapshotForm })
    toast.add({ title: '快照已创建', color: 'success' })
    await loadSnapshots()
  } catch (e: any) {
    toast.add({ title: '创建快照失败', description: e?.data?.message || e?.message || '未知错误', color: 'error' })
  } finally {
    snapshotSaving.value = false
  }
}

async function rollbackSnapshot(snapshot: any) {
  if (!(await confirm({
    title: '回滚到该快照？',
    description: `将替换${snapshot.scopeType === 'series' ? `系列 ${snapshot.scopeKey}` : '全局'}当前全部术语，共 ${snapshot.entryCount} 条。`,
    confirmLabel: '回滚',
    color: 'warning'
  }))) return
  try {
    await $fetch('/api/glossary/rollback', { method: 'POST', body: { snapshotId: snapshot.id } })
    toast.add({ title: '已回滚', color: 'success' })
    await refresh()
  } catch (e: any) {
    toast.add({ title: '回滚失败', description: e?.data?.message || e?.message || '未知错误', color: 'error' })
  }
}

async function deleteSnapshot(snapshot: any) {
  if (!(await confirm({ title: '删除快照？', description: snapshot.name, confirmLabel: '删除', color: 'error' }))) return
  try {
    await $fetch(`/api/glossary/snapshots/${snapshot.id}`, { method: 'DELETE' })
    await loadSnapshots()
  } catch (e: any) {
    toast.add({ title: '删除快照失败', description: e?.data?.message || e?.message || '未知错误', color: 'error' })
  }
}

const versionsOpen = ref(false)
const versionsEntry = ref<GlossaryEntry | null>(null)
const versions = ref<any[]>([])

async function openVersions(entry: GlossaryEntry) {
  versionsEntry.value = entry
  versionsOpen.value = true
  versions.value = []
  try {
    const result: any = await $fetch('/api/glossary/versions', { query: { entryId: entry.id } })
    versions.value = result.versions || []
  } catch { /* ignore */ }
}

function formatDate(value: string | undefined) {
  return formatDateTime(value, timeZone)
}
</script>
