<template>
  <div class="space-y-4">
    <div class="surface-card p-4 sm:p-5 space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p class="text-sm font-semibold text-gray-800 dark:text-gray-100">API Token</p>
          <p class="text-xs text-gray-500 dark:text-gray-400">用于自动化脚本、下载器或其他服务调用 SubX API。明文只在创建时显示一次。</p>
        </div>
        <UButton label="创建 Token" icon="i-lucide-key-round" color="primary" variant="soft" @click="openTokenModal" />
      </div>

      <div v-if="loadError" class="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-300">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <span>Token 列表加载失败：{{ loadError }}</span>
          <UButton label="重试" size="xs" color="error" variant="soft" @click="refresh()" />
        </div>
      </div>
      <div v-else-if="!tokens.length" class="rounded-2xl border border-dashed border-gray-300 bg-gray-50/60 p-8 text-center text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-900/20 dark:text-gray-400">
        还没有 API Token
      </div>
      <div v-else class="space-y-2">
        <article v-for="token in tokens" :key="token.id" class="rounded-2xl border border-gray-200/80 bg-gray-50/60 p-3 dark:border-gray-800 dark:bg-gray-900/30 sm:p-4">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="space-y-1">
              <div class="flex flex-wrap items-center gap-2">
                <p class="text-sm font-semibold text-gray-900 dark:text-white">{{ token.name }}</p>
                <UBadge :color="token.revokedAt ? 'neutral' : 'success'" variant="subtle">{{ token.revokedAt ? '已撤销' : '有效' }}</UBadge>
                <code class="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-600 dark:bg-gray-800 dark:text-gray-300">{{ token.prefix }}…</code>
              </div>
              <p class="text-xs text-gray-500 dark:text-gray-400">权限：{{ token.scopes.join(', ') }}</p>
              <p class="text-xs text-gray-500 dark:text-gray-400">过期：{{ token.expiresAt ? formatDate(token.expiresAt) : '永不过期' }} · 最近使用：{{ token.lastUsedAt ? formatDate(token.lastUsedAt) : '从未' }}</p>
            </div>
            <UButton v-if="!token.revokedAt" label="撤销" icon="i-lucide-ban" size="xs" color="error" variant="soft" @click="revokeToken(token)" />
          </div>
        </article>
      </div>
    </div>

    <UModal v-model:open="tokenModalOpen" title="创建 API Token" description="明文 Token 只显示一次，请立即保存。">
      <template #body>
        <div class="space-y-3">
          <UFormField label="名称"><UInput v-model="tokenForm.name" placeholder="例如：下载器回调" class="w-full" /></UFormField>
          <UFormField label="有效期天数（留空永不过期）"><UInput v-model.number="tokenForm.expiresInDays" type="number" min="1" max="3650" class="w-full" /></UFormField>
          <div class="space-y-2">
            <p class="text-xs font-medium text-gray-600 dark:text-gray-300">权限</p>
            <div class="flex flex-wrap gap-2" role="group" aria-label="API Token 权限选择">
              <UButton
                v-for="scope in scopeOptions"
                :key="scope.value"
                :label="scope.label"
                size="xs"
                :color="tokenForm.scopes.includes(scope.value) ? 'primary' : 'neutral'"
                :variant="tokenForm.scopes.includes(scope.value) ? 'solid' : 'soft'"
                :aria-pressed="tokenForm.scopes.includes(scope.value)"
                @click="toggleTokenScope(scope.value)"
              />
            </div>
          </div>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton label="取消" color="neutral" variant="ghost" @click="tokenModalOpen = false" />
          <UButton label="创建" color="primary" :loading="creatingToken" @click="createToken" />
        </div>
      </template>
    </UModal>

    <UModal v-model:open="tokenResultOpen" title="Token 已创建" description="关闭后将无法再次查看明文。">
      <template #body>
        <div class="space-y-3">
          <div class="break-all rounded-xl border border-amber-200 bg-amber-50 p-3 font-mono text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-200">{{ createdToken }}</div>
          <UButton label="复制 Token" icon="i-lucide-copy" color="primary" variant="soft" @click="copyCreatedToken" />
          <p class="text-xs leading-5 text-gray-500 dark:text-gray-400">示例：<code>curl -H "Authorization: Bearer &lt;token&gt;" {{ baseUrl }}/api/tasks</code></p>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end">
          <UButton label="我已保存" color="primary" @click="tokenResultOpen = false" />
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import { formatDateTime } from '~~/shared/time'
import type { ApiTokenSummary } from '~~/types'

defineProps<{ baseUrl: string }>()

const toast = useToast()
const { confirm } = useConfirm()
const timeZone = useTimeZone()
const { data: tokensData, error: tokensError, refresh } = await useFetch('/api/api-tokens', { key: 'automation:api-tokens' })
const tokens = computed<ApiTokenSummary[]>(() => tokensData.value?.tokens || [])
const loadError = computed(() => tokensError.value ? String((tokensError.value as any)?.data?.message || (tokensError.value as any)?.message || '无法加载 Token 列表') : '')

const tokenModalOpen = ref(false)
const tokenResultOpen = ref(false)
const creatingToken = ref(false)
const createdToken = ref('')
const tokenForm = reactive({ name: '', expiresInDays: undefined as number | undefined, scopes: ['tasks:read', 'tasks:write'] })
const scopeOptions = [
  { label: '任务读取', value: 'tasks:read' },
  { label: '任务写入', value: 'tasks:write' },
  { label: '自动化读取', value: 'automation:read' },
  { label: '自动化写入', value: 'automation:write' },
  { label: 'Token 管理', value: 'tokens:manage' },
  { label: '系统管理', value: 'system:admin' },
  { label: '全部权限', value: '*' }
]

function formatDate(value?: string | null) {
  return formatDateTime(value, timeZone)
}

function openTokenModal() {
  tokenForm.name = ''
  tokenForm.expiresInDays = undefined
  tokenForm.scopes = ['tasks:read', 'tasks:write']
  tokenModalOpen.value = true
}

function toggleTokenScope(scope: string) {
  tokenForm.scopes = tokenForm.scopes.includes(scope) ? tokenForm.scopes.filter(item => item !== scope) : [...tokenForm.scopes, scope]
}

async function createToken() {
  creatingToken.value = true
  try {
    const payload: any = { name: tokenForm.name, scopes: tokenForm.scopes }
    if (tokenForm.expiresInDays) payload.expiresInDays = tokenForm.expiresInDays
    const result = await $fetch('/api/api-tokens', { method: 'POST', body: payload })
    createdToken.value = result.token
    tokenModalOpen.value = false
    tokenResultOpen.value = true
    await refresh()
  } catch (e: any) {
    toast.add({ title: '创建失败', description: e?.data?.message || e?.message || '无法创建 Token', color: 'error' })
  } finally {
    creatingToken.value = false
  }
}

async function copyCreatedToken() {
  try {
    await navigator.clipboard.writeText(createdToken.value)
    toast.add({ title: '已复制', description: 'Token 已复制到剪贴板', color: 'success' })
  } catch {
    toast.add({ title: '复制失败', description: '请手动选择并复制', color: 'error' })
  }
}

async function revokeToken(token: ApiTokenSummary) {
  if (!(await confirm({
    title: '撤销 API Token',
    description: `确定撤销「${token.name}」？使用该 Token 的调用会立即失败。`,
    confirmLabel: '撤销',
    color: 'error'
  }))) return
  try {
    await $fetch(`/api/api-tokens/${token.id}`, { method: 'DELETE' })
    await refresh()
    toast.add({ title: '已撤销', description: 'Token 已失效', color: 'success' })
  } catch (e: any) {
    toast.add({ title: '撤销失败', description: e?.data?.message || e?.message || '请稍后重试', color: 'error' })
  }
}
</script>
