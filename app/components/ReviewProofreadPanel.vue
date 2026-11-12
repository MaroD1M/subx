<template>
  <div class="flex min-h-0 flex-col">
    <div class="space-y-3 border-b border-gray-100 p-3 dark:border-gray-800">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="inline-flex rounded-xl border border-gray-200/80 bg-gray-50 p-1 dark:border-gray-800 dark:bg-gray-900/50">
          <button
            v-for="item in kindItems"
            :key="item.value"
            type="button"
            class="rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors"
            :aria-pressed="kind === item.value"
            :class="kind === item.value
              ? 'bg-white text-primary-700 shadow-sm dark:bg-gray-950 dark:text-primary-300'
              : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'"
            @click="emit('update:kind', item.value)"
          >
            {{ item.label }}
          </button>
        </div>
        <UBadge v-if="issues.length" color="warning" variant="subtle">{{ issueCount }} 个问题</UBadge>
      </div>

      <div v-if="meta" class="space-y-1 app-meta">
        <p class="app-toolbar-row gap-x-1.5 gap-y-1">
          <span class="app-pill" :class="meta.cached ? 'app-pill-neutral' : 'app-pill-success'">{{ meta.cached ? '缓存结果' : '新结果' }}</span>
          <span v-if="meta.cachedAt">{{ formatTime(meta.cachedAt) }}</span>
          <span>· {{ meta.model || '未知模型' }}</span>
          <span>· 抽样 {{ meta.entryCount }} / {{ meta.totalEntries }} 条</span>
        </p>
      </div>

      <div class="app-toolbar-row">
        <UButton
          :label="state.result ? '重新校对' : '开始校对'"
          icon="i-lucide-sparkles"
          size="xs"
          color="primary"
          variant="soft"
          :loading="state.loading"
          :title="state.result ? '重新调用模型并覆盖当前缓存建议' : '调用模型生成建议'"
          @click="emit('generate', !!state.result)"
        />
        <UButton
          v-if="state.result"
          label="只看问题字幕"
          icon="i-lucide-filter"
          size="xs"
          color="warning"
          variant="ghost"
          :disabled="!issueCount"
          @click="emit('filter-issues', null)"
        />
        <UButton
          v-if="state.result"
          label="选中问题字幕"
          icon="i-lucide-list-checks"
          size="xs"
          color="neutral"
          variant="ghost"
          :disabled="!issueCount"
          @click="emit('select-issues')"
        />
        <UButton
          v-if="state.result"
          label="重译问题字幕"
          icon="i-lucide-refresh-cw"
          size="xs"
          color="warning"
          variant="ghost"
          :disabled="!issueCount"
          @click="emit('retranslate-issues')"
        />
      </div>

      <div v-if="meta?.stale" class="rounded-xl border border-amber-200 bg-amber-50/80 p-2.5 text-xs leading-5 text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200">
        字幕内容已变化，当前缓存建议可能过期。建议重新校对后再应用。
      </div>
    </div>

    <div class="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
      <div v-if="state.loading" class="space-y-2">
        <div v-for="index in 3" :key="index" class="skeleton h-16 w-full" />
        <p class="text-center text-xs text-gray-500 dark:text-gray-400">正在分析字幕...</p>
      </div>

      <template v-else-if="state.result">
        <section v-if="terms.length" class="space-y-2">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="min-w-0">
              <p class="text-sm font-semibold text-gray-800 dark:text-gray-100">{{ termsTitle }} {{ terms.length }} 条</p>
              <p v-if="kind === 'consistency'" class="app-caption mt-0.5">来自一致性检查的统一译法建议，可加入术语表。</p>
              <p v-if="mergedTermCount" class="app-caption mt-0.5">已省略与「术语提取建议」重复的 {{ mergedTermCount }} 条术语；批量加入时会统一合并。</p>
            </div>
            <UButton label="全部加入术语表" icon="i-lucide-plus" size="xs" color="primary" :loading="applyingTerms" :disabled="allTermsApplied" @click="emit('apply-terms')" />
          </div>
          <div class="space-y-2">
            <div v-for="term in terms" :key="`${term.source}-${term.target}`" class="surface-muted p-3">
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0">
                  <p class="text-sm text-gray-800 dark:text-gray-100">
                    <span class="font-mono">{{ term.source }}</span>
                    <span class="mx-1 text-gray-500 dark:text-gray-400">→</span>
                    <span class="font-semibold text-primary-700 dark:text-primary-300">{{ term.target }}</span>
                  </p>
                  <p v-if="term.reason" class="app-caption mt-1">{{ term.reason }}</p>
                  <p v-if="conflict(term)" class="mt-1 text-xs text-amber-700 dark:text-amber-300">术语表已有：{{ conflict(term) }}（加入后会覆盖）</p>
                  <p v-else-if="hasTerm(term)" class="app-caption mt-1">术语表已存在相同译法</p>
                  <div v-if="term.subtitleIds?.length" class="mt-1 flex flex-wrap items-center gap-1">
                    <span class="app-caption">相关字幕</span>
                    <UButton
                      v-for="id in term.subtitleIds.slice(0, 5)"
                      :key="id"
                      :label="`#${id}`"
                      size="xs"
                      color="neutral"
                      variant="ghost"
                      :title="`定位到字幕 #${id}`"
                      @click="emit('focus-subtitle', String(id))"
                    />
                    <span v-if="term.subtitleIds.length > 5" class="app-caption">+{{ term.subtitleIds.length - 5 }}</span>
                  </div>
                </div>
                <UButton :label="termActionLabel(term)" size="xs" color="primary" variant="ghost" :loading="applyingTerms" :disabled="hasTerm(term)" @click="emit('apply-term', term)" />
              </div>
            </div>
          </div>
        </section>

        <section v-if="issues.length" class="space-y-2">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <p class="text-sm font-semibold text-amber-800 dark:text-amber-200">一致性问题 {{ issues.length }} 条</p>
            <span class="app-caption">只提示，不会自动修改字幕</span>
          </div>
          <div v-if="issueTypes.length > 1" class="space-y-1">
            <p class="app-caption">按问题类型筛选</p>
            <div class="flex flex-wrap gap-1.5">
              <UButton
                v-for="item in issueTypes"
                :key="item.type"
                :label="`${item.label} ${item.count}`"
                size="xs"
                color="warning"
                :variant="issueFilter === item.type ? 'soft' : 'outline'"
                @click="emit('filter-issues', item.type)"
              />
            </div>
          </div>
          <div class="space-y-2">
            <div v-for="issue in issues" :key="`${issue.subtitleId}-${issue.type}-${issue.message}`" class="rounded-xl border border-amber-100 bg-amber-50/70 p-3 dark:border-amber-900/40 dark:bg-amber-950/20">
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0">
                  <p class="text-xs font-semibold text-amber-900 dark:text-amber-100">#{{ issue.subtitleId }} · {{ issueLabel(issue.type) }}</p>
                  <p class="mt-1 text-xs text-amber-800 dark:text-amber-200">{{ issue.message }}</p>
                </div>
                <UButton v-if="issue.subtitleId" label="定位" size="xs" color="warning" variant="ghost" @click="emit('focus-issue', issue)" />
              </div>
            </div>
          </div>
        </section>

        <section v-if="!terms.length && !issues.length" class="app-empty border-dashed p-6">
          <UIcon name="i-lucide-circle-check-big" class="mx-auto h-6 w-6 text-success-500" />
          <p class="mt-2 text-sm font-medium text-gray-700 dark:text-gray-200">未发现可建议内容</p>
          <p class="app-caption mt-1">缓存结果已保存，下次打开不会重复调用模型。</p>
        </section>
      </template>

      <div v-else class="app-empty border-dashed p-6">
        <UIcon name="i-lucide-sparkles" class="mx-auto h-6 w-6 text-primary-400" />
        <p class="mt-2 text-sm font-medium text-gray-700 dark:text-gray-200">还没有 AI 校对结果</p>
        <p class="app-caption mt-1">点击「开始校对」生成；结果会缓存，重进页面或误点不会重复消耗 Token。</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { formatDateTime } from '~~/shared/time'
import { proofreadIssueLabel as issueLabel } from '~~/shared/reviewLabels'

type ProofreadKind = 'glossary' | 'consistency'

interface ProofreadState {
  result: any | null
  meta: any | null
  loading: boolean
}

const props = defineProps<{
  kind: ProofreadKind
  state: ProofreadState
  glossary: Record<string, string>
  issueTypes: Array<{ type: string, label: string, count: number }>
  issueCount: number
  issueFilter: string
  applyingTerms: boolean
  otherTerms?: any[]
}>()

const emit = defineEmits<{
  'update:kind': [value: ProofreadKind]
  generate: [refresh: boolean]
  'focus-issue': [issue: any]
  'focus-subtitle': [subtitleId: string]
  'filter-issues': [type: string | null]
  'select-issues': []
  'retranslate-issues': []
  'apply-term': [term: any]
  'apply-terms': []
}>()

const timeZone = useTimeZone()

const kindItems: Array<{ label: string, value: ProofreadKind }> = [
  { label: '一致性检查', value: 'consistency' },
  { label: '术语提取建议', value: 'glossary' }
]

const rawTerms = computed(() => Array.isArray(props.state.result?.terms) ? props.state.result.terms : [])
const issues = computed(() => Array.isArray(props.state.result?.issues) ? props.state.result.issues : [])
const meta = computed(() => props.state.meta)
const termsTitle = computed(() => props.kind === 'consistency' ? '统一译法建议' : '术语提取建议')

function termKey(term: any) {
  return `${String(term?.source || '')}\u0000${String(term?.target || '')}`
}

const otherTermKeys = computed(() => new Set((props.otherTerms || []).map(termKey)))
const mergedTermCount = computed(() => {
  if (props.kind !== 'consistency' || !otherTermKeys.value.size) return 0
  return rawTerms.value.filter((term: any) => otherTermKeys.value.has(termKey(term))).length
})
const terms = computed(() => {
  if (props.kind !== 'consistency' || !otherTermKeys.value.size) return rawTerms.value
  return rawTerms.value.filter((term: any) => !otherTermKeys.value.has(termKey(term)))
})
const allTermsApplied = computed(() => terms.value.length > 0 && terms.value.every((term: any) => hasTerm(term)))

function formatTime(value: string) {
  return formatDateTime(value, timeZone)
}

function conflict(term: any) {
  const existing = String(props.glossary?.[term?.source] || '')
  if (!existing || existing === term?.target) return ''
  return existing
}

function hasTerm(term: any) {
  const existing = String(props.glossary?.[term?.source] || '')
  return Boolean(existing) && existing === term?.target
}

function termActionLabel(term: any) {
  if (hasTerm(term)) return '已存在'
  if (conflict(term)) return '覆盖'
  return '加入'
}
</script>
