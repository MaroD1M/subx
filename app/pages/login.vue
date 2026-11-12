<template>
  <div class="flex min-h-screen w-full flex-col items-center justify-center overflow-x-hidden px-4 py-10 sm:px-6">
    <div class="w-full max-w-[400px]">
      <!-- Instance identity -->
      <header class="mb-6 flex flex-col items-center text-center">
        <img src="/logo.svg" alt="SubX" class="h-12 w-12 rounded-xl" />
        <div class="mt-3 flex items-center justify-center gap-2">
          <h1 class="text-lg font-semibold tracking-tight text-gray-900 dark:text-white">SubX</h1>
          <span class="app-pill app-pill-neutral">v{{ appVersion }}</span>
        </div>
        <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">本地部署 · 字幕提取与翻译</p>
      </header>

      <!-- Insecure Connection Warning -->
      <ClientOnly>
        <div v-if="isInsecure" class="mb-4 flex items-start gap-2.5 rounded-lg border border-amber-200/70 bg-amber-50/70 px-3 py-2.5 dark:border-amber-900/40 dark:bg-amber-950/20">
          <UIcon name="i-lucide-shield-alert" class="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <div class="space-y-0.5">
            <p class="text-xs font-medium text-amber-700 dark:text-amber-300">{{ insecureTitle }}</p>
            <p class="text-[11px] leading-4 text-amber-600 dark:text-amber-400/80">{{ insecureHint }}</p>
          </div>
        </div>
      </ClientOnly>

      <!-- Main Card -->
      <div class="surface-card p-5 sm:p-6">
        <!-- Setup Mode -->
        <form v-if="!hasPasskey" class="space-y-5" @submit.prevent="handleSetup">
          <div class="space-y-1.5">
            <h2 class="text-base font-semibold text-gray-900 dark:text-white">初始化实例</h2>
            <p class="text-xs leading-5 text-gray-500 dark:text-gray-400">首次启动。请设置一个高强度口令密钥，用于保护此实例的媒体库。</p>
          </div>

          <div class="space-y-4">
            <UFormField label="设置口令密钥" required>
              <UInput
                v-model="passkey"
                :type="showPasskey ? 'text' : 'password'"
                placeholder="设置 8 位以上强口令"
                name="passkey"
                size="lg"
                icon="i-lucide-key-round"
                class="w-full"
                autocomplete="new-password"
                :ui="{ trailing: 'pointer-events-auto', rounded: 'rounded-lg' }"
              >
                <template #trailing>
                  <UButton
                    :icon="showPasskey ? 'i-lucide-eye-off' : 'i-lucide-eye'"
                    :aria-label="showPasskey ? '隐藏口令' : '显示口令'"
                    variant="ghost"
                    color="neutral"
                    size="xs"
                    class="mr-1"
                    type="button"
                    @click="showPasskey = !showPasskey"
                  />
                </template>
              </UInput>
            </UFormField>

            <UFormField label="重复口令进行确认" required>
              <UInput
                v-model="confirmPasskey"
                :type="showPasskey ? 'text' : 'password'"
                placeholder="请再次填写"
                name="confirm-passkey"
                size="lg"
                icon="i-lucide-lock"
                class="w-full"
                autocomplete="new-password"
                :ui="{ rounded: 'rounded-lg' }"
              />
            </UFormField>
          </div>

          <div v-if="error" role="alert" aria-live="assertive" class="flex items-start gap-2 rounded-lg border border-red-200/70 bg-red-50/70 px-3 py-2 dark:border-red-900/40 dark:bg-red-950/20">
            <UIcon name="i-lucide-alert-circle" class="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
            <span class="text-xs font-medium leading-5 text-red-700 dark:text-red-300">{{ error }}</span>
          </div>

          <UButton
            label="启用安全防护并进入"
            color="primary"
            block
            size="lg"
            icon="i-lucide-shield-plus"
            :loading="loading"
            type="submit"
            class="rounded-lg"
          />
        </form>

        <!-- Login Mode -->
        <form v-else class="space-y-5" @submit.prevent="handleLogin">
          <div class="space-y-1.5">
            <h2 class="text-base font-semibold text-gray-900 dark:text-white">欢迎回来</h2>
            <p class="text-xs leading-5 text-gray-500 dark:text-gray-400">请输入口令密钥以解锁工作区。</p>
          </div>

          <UFormField label="口令密钥" required>
            <UInput
              v-model="passkey"
              :type="showPasskey ? 'text' : 'password'"
              placeholder="••••••••"
              name="passkey"
              size="lg"
              icon="i-lucide-fingerprint"
              class="w-full"
              autocomplete="current-password"
              :ui="{ trailing: 'pointer-events-auto', rounded: 'rounded-lg' }"
            >
              <template #trailing>
                <UButton
                  :icon="showPasskey ? 'i-lucide-eye-off' : 'i-lucide-eye'"
                  :aria-label="showPasskey ? '隐藏口令' : '显示口令'"
                  variant="ghost"
                  color="neutral"
                  size="xs"
                  class="mr-1"
                  type="button"
                  @click="showPasskey = !showPasskey"
                />
              </template>
            </UInput>
          </UFormField>

          <div v-if="error" role="alert" aria-live="assertive" class="flex items-start gap-2 rounded-lg border border-red-200/70 bg-red-50/70 px-3 py-2 dark:border-red-900/40 dark:bg-red-950/20">
            <UIcon name="i-lucide-alert-circle" class="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
            <span class="text-xs font-medium leading-5 text-red-700 dark:text-red-300">{{ error }}</span>
          </div>

          <UButton
            label="解锁"
            color="primary"
            block
            size="lg"
            icon="i-lucide-unlock"
            :loading="loading"
            type="submit"
            class="rounded-lg"
          />
        </form>
      </div>

      <!-- Local-first footer -->
      <div class="mt-6 space-y-3 text-center">
        <div class="flex items-center justify-center gap-1.5 text-[11px] font-medium text-gray-500 dark:text-gray-400">
          <UIcon name="i-lucide-shield-check" class="h-3.5 w-3.5 shrink-0" />
          <span>本地优先 · 口令仅在本机校验，不上传云端</span>
        </div>
        <div class="flex items-center justify-center gap-2">
          <UButton icon="i-lucide-help-circle" variant="ghost" color="neutral" size="xs" label="获取帮助" class="text-gray-500 dark:text-gray-400" type="button" @click="helpOpen = true" />
          <UButton icon="i-lucide-github" variant="ghost" color="neutral" size="xs" label="GitHub" to="https://github.com/MaroD1M/subx" target="_blank" class="text-gray-500 dark:text-gray-400" />
        </div>
      </div>
    </div>

    <UModal v-model:open="helpOpen" title="使用帮助" description="本地口令、安全和常见问题">
      <template #content>
        <div class="space-y-5 p-5 text-sm leading-6 text-gray-600 dark:text-gray-300">
          <section class="space-y-1.5">
            <h3 class="text-sm font-semibold text-gray-800 dark:text-gray-100">这是什么口令？</h3>
            <p>它不是云端账号，而是这个 SubX 实例的本地访问口令。口令只在你的机器上校验，不会上传到 SubX 或第三方。</p>
          </section>

          <section class="space-y-1.5">
            <h3 class="text-sm font-semibold text-gray-800 dark:text-gray-100">口令规则</h3>
            <p>至少 {{ MIN_PASSKEY_LENGTH }} 个字符。长度由登录页校验，服务端只保存加盐哈希，不保存明文。</p>
          </section>

          <section class="space-y-2">
            <h3 class="text-sm font-semibold text-gray-800 dark:text-gray-100">忘记口令怎么办？</h3>
            <ol class="list-decimal space-y-1.5 pl-5">
              <li>停止 SubX 容器，并先备份 <code class="rounded bg-gray-100 px-1 py-0.5 text-xs dark:bg-gray-800">./data/db</code>。</li>
              <li>用 SQLite 工具打开数据库，执行 <code class="rounded bg-gray-100 px-1 py-0.5 text-xs dark:bg-gray-800">DELETE FROM auth; DELETE FROM sessions;</code>。</li>
              <li>重启容器，刷新本页，重新设置口令。</li>
            </ol>
            <p class="text-xs text-gray-500 dark:text-gray-400">这样只会清掉登录口令和会话，不会删除媒体、字幕、模型或翻译记录。使用 PostgreSQL 时，对数据库执行同样的 SQL。</p>
          </section>

          <section class="space-y-1.5">
            <h3 class="text-sm font-semibold text-gray-800 dark:text-gray-100">为什么提示 HTTP 不安全？</h3>
            <p>局域网自用可以忽略；如果要从公网访问，请务必通过 HTTPS 反向代理，否则口令和通知配置可能在传输过程中被窃听。</p>
          </section>

          <div class="flex flex-wrap justify-end gap-2 border-t border-gray-100 pt-4 dark:border-gray-800">
            <UButton label="查看使用文档" to="https://github.com/MaroD1M/subx/blob/master/docs/usage.md" target="_blank" color="neutral" variant="soft" size="sm" />
            <UButton label="反馈问题" to="https://github.com/MaroD1M/subx/issues" target="_blank" color="primary" variant="soft" size="sm" />
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup>
import { MIN_PASSKEY_LENGTH } from '~~/shared/auth'

useHead({
  title: '身份验证 - SubX'
})

definePageMeta({
  layout: false
})

const { authenticated, hasPasskey, check, setup, login } = useAuth()
const appVersion = useRuntimeConfig().public.appVersion

const passkey = ref('')
const confirmPasskey = ref('')
const showPasskey = ref(false)
const loading = ref(false)
const error = ref('')
const isInsecure = ref(false)
const insecureTitle = ref('HTTP 连接')
const insecureHint = ref('')
const helpOpen = ref(false)
const route = useRoute()

function isPrivateHost(hostname) {
  const host = hostname.toLowerCase()
  return host.endsWith('.local')
    || host === 'localhost'
    || host === '127.0.0.1'
    || host === '::1'
    || /^10\./.test(host)
    || /^192\.168\./.test(host)
    || /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
}

onMounted(() => {
  const host = window.location.hostname
  if (window.location.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(host)) {
    isInsecure.value = true
    if (isPrivateHost(host)) {
      insecureTitle.value = '局域网 HTTP 连接'
      insecureHint.value = '局域网自用可以忽略；如果要从公网访问，请配置 HTTPS 反向代理。'
    } else {
      insecureTitle.value = '公网 HTTP 连接不安全'
      insecureHint.value = '当前通过公网 HTTP 访问，口令和通知配置可能被窃听，请务必使用 HTTPS。'
    }
  }
})

// 进入页面时检查状态；已登录用户直接回首页，避免看到登录表单。
await check()
if (hasPasskey.value && authenticated.value && String(route.query.logged_out || '') !== '1') {
  await navigateTo('/', { replace: true })
}

async function handleSetup() {
  error.value = ''

  if (passkey.value.length < MIN_PASSKEY_LENGTH) {
    error.value = `口令密钥长度不得少于 ${MIN_PASSKEY_LENGTH} 个字符`
    return
  }

  if (passkey.value !== confirmPasskey.value) {
    error.value = '两次输入的口令密钥不一致'
    return
  }

  loading.value = true
  try {
    await setup(passkey.value)
    navigateTo('/')
  } catch (e) {
    error.value = e.data?.message || '创建失败，请重试'
  } finally {
    loading.value = false
  }
}

async function handleLogin() {
  error.value = ''

  if (!passkey.value) {
    error.value = '请输入口令密钥'
    return
  }

  loading.value = true
  try {
    await login(passkey.value)
    navigateTo('/')
  } catch (e) {
    error.value = e.data?.message || '口令密钥错误'
  } finally {
    loading.value = false
  }
}
</script>
