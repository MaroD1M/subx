<template>
  <AppContainer size="wide" class="space-y-6 pb-24">
    <PageHeader
      title="自动化"
      description="监控媒体目录、自动创建任务、发送通知，并通过 API Token 接入外部工具。"
      :breadcrumb="[{ label: '首页', icon: 'i-lucide-home', to: '/' }, { label: '自动化', icon: 'i-lucide-workflow' }]"
    >
      <template #actions>
        <UButton label="刷新" icon="i-lucide-refresh-cw" color="neutral" variant="soft" :loading="refreshing" @click="refreshAll" />
        <UButton label="API 文档" icon="i-lucide-file-json-2" color="neutral" variant="ghost" to="/api/openapi.json" target="_blank" />
      </template>
    </PageHeader>

    <div class="rounded-3xl border border-gray-100 dark:border-gray-800 bg-white/85 dark:bg-gray-950/35 p-4 sm:p-5 space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p class="text-sm font-semibold text-gray-800 dark:text-gray-100">全局自动化设置</p>
          <p class="text-xs text-gray-500 dark:text-gray-400">自动任务默认单并发，避免与手动任务争抢资源。</p>
        </div>
        <UBadge :color="automationConfig.notificationEnabled === false ? 'neutral' : 'success'" variant="subtle">
          {{ automationConfig.notificationEnabled === false ? '通知已关闭' : '通知已启用' }}
        </UBadge>
      </div>
      <div class="grid gap-3 md:grid-cols-3">
        <UFormField label="自动任务并发上限">
          <UInput v-model.number="automationConfig.automationConcurrency" type="number" min="1" max="10" class="w-full" />
        </UFormField>
        <UFormField label="低置信度通知阈值">
          <UInput v-model.number="lowConfidencePercent" type="number" min="0" max="100" class="w-full">
            <template #trailing><span class="text-xs text-gray-400">%</span></template>
          </UInput>
        </UFormField>
        <div class="flex items-end">
          <div class="flex w-full items-center justify-between gap-3 rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50/70 dark:bg-gray-900/30 px-3 py-2.5">
            <span class="text-sm text-gray-600 dark:text-gray-300">启用通知</span>
            <USwitch v-model="automationConfig.notificationEnabled" aria-label="启用通知" />
          </div>
        </div>
      </div>
      <div class="flex justify-end">
        <UButton label="保存全局设置" icon="i-lucide-save" color="primary" :loading="savingConfig" @click="saveAutomationConfig" />
      </div>
    </div>

    <div class="grid grid-cols-1 gap-4 md:grid-cols-[190px_minmax(0,1fr)]">
      <nav class="self-start overflow-x-auto rounded-2xl border border-gray-200/80 bg-white p-1.5 shadow-sm dark:border-gray-800 dark:bg-gray-950/60 md:sticky md:top-20" aria-label="自动化分区">
        <div class="flex min-w-max gap-1 md:min-w-0 md:flex-col">
          <button
            v-for="tab in tabs"
            :key="tab.value"
            type="button"
            class="flex items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors"
            :class="activeTab === tab.value ? 'bg-primary-50 text-primary-700 dark:bg-primary-500/10 dark:text-primary-300' : 'text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-900'"
            :aria-current="activeTab === tab.value ? 'page' : undefined"
            @click="activeTab = tab.value"
          >
            <UIcon :name="tab.icon" class="h-4 w-4 shrink-0" />
            <span>{{ tab.label }}</span>
          </button>
        </div>
      </nav>

      <div class="min-w-0 space-y-4">
        <section v-show="activeTab === 'folders'" class="space-y-4" aria-label="监控目录">
          <div class="rounded-3xl border border-gray-100 dark:border-gray-800 bg-white/85 dark:bg-gray-950/35 p-4 sm:p-5 space-y-4">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p class="text-sm font-semibold text-gray-800 dark:text-gray-100">监控目录</p>
                <p class="text-xs text-gray-500 dark:text-gray-400">新文件稳定后自动创建任务；历史文件请使用“回填”。</p>
              </div>
              <UButton label="新增监控目录" icon="i-lucide-folder-plus" color="primary" variant="soft" @click="openFolderModal()" />
            </div>

            <div v-if="!folders.length" class="rounded-2xl border border-dashed border-gray-300 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-900/20 p-8 text-center space-y-3">
              <UIcon name="i-lucide-folder-search" class="mx-auto h-8 w-8 text-gray-300 dark:text-gray-600" />
              <p class="text-sm font-medium text-gray-700 dark:text-gray-200">还没有监控目录</p>
              <p class="text-xs text-gray-500 dark:text-gray-400">可直接监控整个媒体库，或只监控其中的子目录。</p>
              <UButton label="新增监控目录" icon="i-lucide-plus" color="primary" variant="soft" @click="openFolderModal()" />
            </div>

            <div v-else class="space-y-3">
              <article v-for="folder in folders" :key="folder.id" class="rounded-2xl border border-gray-200/80 dark:border-gray-800 bg-gray-50/60 dark:bg-gray-900/30 p-4 space-y-3">
                <div class="flex flex-wrap items-start justify-between gap-3">
                  <div class="min-w-0 space-y-1">
                    <div class="flex flex-wrap items-center gap-2">
                      <p class="text-sm font-semibold text-gray-900 dark:text-white">{{ folder.rootName || folder.rootId }}{{ folder.path ? ` / ${folder.path}` : ' / 根目录' }}</p>
                      <UBadge :color="folder.enabled ? 'success' : 'neutral'" variant="subtle">{{ folder.enabled ? '已启用' : '已停用' }}</UBadge>
                      <UBadge color="neutral" variant="subtle">{{ folder.mode === 'both' ? '新文件 + 回填' : folder.mode === 'backfill' ? '仅回填' : '仅新文件' }}</UBadge>
                      <UBadge color="neutral" variant="subtle">{{ folder.recursive ? '递归' : '单层' }}</UBadge>
                    </div>
                    <p class="text-xs text-gray-500 dark:text-gray-400">
                      扩展名 {{ folder.rules.extensions.join(', ') }} · 稳定 {{ folder.rules.stableSeconds }}s · 目标 {{ folder.outputPolicy.targetLanguage || automationConfig.targetLanguage }}
                    </p>
                    <div class="flex flex-wrap gap-2 text-xs">
                      <UBadge color="primary" variant="soft">待处理 {{ folder.pendingEvents || 0 }}</UBadge>
                      <UBadge :color="folder.failedEvents ? 'error' : 'neutral'" variant="soft">失败 {{ folder.failedEvents || 0 }}</UBadge>
                      <UBadge v-if="folder.rules.skipExistingSubtitles" color="neutral" variant="subtle">跳过已有字幕</UBadge>
                      <UBadge v-if="folder.rules.skipExistingOutput" color="neutral" variant="subtle">跳过已有输出</UBadge>
                    </div>
                  </div>
                  <div class="flex flex-wrap items-center gap-1">
                    <UButton icon="i-lucide-pencil" size="xs" color="neutral" variant="ghost" aria-label="编辑监控目录" @click="openFolderModal(folder)" />
                    <UButton label="回填" icon="i-lucide-history" size="xs" color="warning" variant="soft" @click="openBackfillModal(folder)" />
                    <UButton icon="i-lucide-trash-2" size="xs" color="error" variant="ghost" aria-label="删除监控目录" @click="removeFolder(folder)" />
                  </div>
                </div>
              </article>
            </div>
          </div>
        </section>

        <section v-show="activeTab === 'events'" class="space-y-4" aria-label="监控事件">
          <div class="rounded-3xl border border-gray-100 dark:border-gray-800 bg-white/85 dark:bg-gray-950/35 p-4 sm:p-5 space-y-4">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p class="text-sm font-semibold text-gray-800 dark:text-gray-100">最近事件</p>
                <p class="text-xs text-gray-500 dark:text-gray-400">去重、过滤、失败原因与自动任务关联都在这里查看。</p>
              </div>
              <USelect v-model="eventStatus" :items="eventStatusOptions" class="w-36" aria-label="事件状态筛选" />
            </div>

            <div v-if="!filteredEvents.length" class="rounded-2xl border border-dashed border-gray-300 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-900/20 p-8 text-center text-sm text-gray-500 dark:text-gray-400">
              当前筛选下暂无事件
            </div>
            <div v-else class="space-y-2">
              <article v-for="item in filteredEvents" :key="item.id" class="rounded-2xl border border-gray-200/80 dark:border-gray-800 bg-gray-50/60 dark:bg-gray-900/30 p-3 sm:p-4">
                <div class="flex flex-wrap items-start justify-between gap-3">
                  <div class="min-w-0 space-y-1">
                    <div class="flex flex-wrap items-center gap-2">
                      <UBadge :color="eventColor(item.status)" variant="subtle">{{ statusLabel(item.status) }}</UBadge>
                      <p class="break-all text-sm font-medium text-gray-900 dark:text-white">{{ item.path }}</p>
                    </div>
                    <p class="text-xs text-gray-500 dark:text-gray-400">{{ item.folderName }} · {{ formatDate(item.createdAt) }} · {{ formatSize(item.size) }}</p>
                    <p v-if="item.error" class="break-all text-xs text-red-600 dark:text-red-400">{{ item.error }}</p>
                  </div>
                  <div class="flex flex-wrap items-center gap-1">
                    <UButton v-if="item.taskId" label="任务" icon="i-lucide-external-link" size="xs" color="primary" variant="ghost" :to="`/task/${item.taskId}`" />
                    <UButton v-if="['failed', 'done', 'skipped'].includes(item.status)" label="重试" icon="i-lucide-refresh-cw" size="xs" color="warning" variant="soft" @click="retryEvent(item)" />
                  </div>
                </div>
              </article>
            </div>
          </div>
        </section>

        <section v-show="activeTab === 'notifications'" class="space-y-4" aria-label="通知渠道">
          <div class="rounded-3xl border border-gray-100 dark:border-gray-800 bg-white/85 dark:bg-gray-950/35 p-4 sm:p-5 space-y-4">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p class="text-sm font-semibold text-gray-800 dark:text-gray-100">通知渠道</p>
                <p class="text-xs text-gray-500 dark:text-gray-400">任务完成、失败、取消、低置信度和监控异常可分别通知。</p>
              </div>
              <UButton label="新增渠道" icon="i-lucide-bell-plus" color="primary" variant="soft" @click="openChannelModal()" />
            </div>

            <div v-if="!channels.length" class="rounded-2xl border border-dashed border-gray-300 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-900/20 p-8 text-center text-sm text-gray-500 dark:text-gray-400">
              尚未配置通知渠道
            </div>
            <div v-else class="grid gap-3 xl:grid-cols-2">
              <article v-for="channel in channels" :key="channel.id" class="rounded-2xl border border-gray-200/80 dark:border-gray-800 bg-gray-50/60 dark:bg-gray-900/30 p-4 space-y-3">
                <div class="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div class="flex items-center gap-2">
                      <p class="text-sm font-semibold text-gray-900 dark:text-white">{{ channel.name }}</p>
                      <UBadge color="primary" variant="subtle">{{ channelTypeLabel(channel.type) }}</UBadge>
                      <UBadge :color="channel.enabled ? 'success' : 'neutral'" variant="subtle">{{ channel.enabled ? '启用' : '停用' }}</UBadge>
                    </div>
                    <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">{{ channelEventText(channel) }}</p>
                  </div>
                  <div class="flex items-center gap-1">
                    <UButton label="测试" icon="i-lucide-send" size="xs" color="primary" variant="soft" :loading="testingChannelId === channel.id" @click="testChannel(channel)" />
                    <UButton icon="i-lucide-pencil" size="xs" color="neutral" variant="ghost" aria-label="编辑通知渠道" @click="openChannelModal(channel)" />
                    <UButton icon="i-lucide-trash-2" size="xs" color="error" variant="ghost" aria-label="删除通知渠道" @click="removeChannel(channel)" />
                  </div>
                </div>
                <p v-if="channel.config.events?.length" class="text-xs text-gray-500 dark:text-gray-400">事件：{{ channel.config.events.map(eventLabel).join('、') }}</p>
              </article>
            </div>
          </div>

          <div class="rounded-3xl border border-gray-100 dark:border-gray-800 bg-white/85 dark:bg-gray-950/35 p-4 sm:p-5 space-y-3">
            <p class="text-sm font-semibold text-gray-800 dark:text-gray-100">最近投递</p>
            <div v-if="!deliveries.length" class="text-xs text-gray-500 dark:text-gray-400">暂无投递记录</div>
            <div v-else class="space-y-2 max-h-[360px] overflow-y-auto pr-1">
              <div v-for="delivery in deliveries" :key="delivery.id" class="rounded-xl border border-gray-100 dark:border-gray-800 px-3 py-2 text-xs">
                <div class="flex flex-wrap items-center gap-2">
                  <UBadge :color="delivery.status === 'sent' ? 'success' : delivery.status === 'failed' ? 'error' : 'neutral'" variant="subtle">{{ delivery.status }}</UBadge>
                  <span class="font-medium text-gray-700 dark:text-gray-200">{{ delivery.title }}</span>
                  <span class="text-gray-400">{{ delivery.channelName }}</span>
                  <span class="ml-auto text-gray-400">{{ formatDate(delivery.createdAt) }}</span>
                </div>
                <p v-if="delivery.lastError" class="mt-1 break-all text-red-600 dark:text-red-400">{{ delivery.lastError }}</p>
              </div>
            </div>
          </div>
        </section>

        <section v-show="activeTab === 'integrations'" class="space-y-4" aria-label="外部集成">
          <div class="rounded-3xl border border-gray-100 dark:border-gray-800 bg-white/85 dark:bg-gray-950/35 p-4 sm:p-5 space-y-4">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p class="text-sm font-semibold text-gray-800 dark:text-gray-100">下载器 / 媒体服务器 Webhook</p>
                <p class="text-xs text-gray-500 dark:text-gray-400">Sonarr、Radarr、Jellyfin、Plex、Emby、Bazarr 事件自动创建任务。</p>
              </div>
              <UButton label="保存集成设置" icon="i-lucide-save" color="primary" :loading="savingIntegration" @click="saveIntegrationConfig" />
            </div>
            <UFormField label="Webhook Token">
              <div class="flex gap-2">
                <UInput v-model="integrationConfig.token" type="password" placeholder="至少 16 位随机字符串" class="flex-1" />
                <UButton label="生成" icon="i-lucide-dices" color="neutral" variant="soft" @click="generateIntegrationToken" />
              </div>
              <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">留空不会清空已有 Token；修改后需要同步更新下载器里的 Webhook URL。保存后请立即复制 URL，刷新页面后 Token 会重新隐藏。</p>
            </UFormField>
            <div class="grid gap-3 sm:grid-cols-2">
              <UFormField label="回调路径前缀（可选）">
                <UInput v-model="integrationConfig.pathFrom" placeholder="/downloads 或 C:\Media" class="w-full" />
              </UFormField>
              <UFormField label="映射到 SubX 容器路径">
                <UInput v-model="integrationConfig.pathTo" placeholder="/media" class="w-full" />
              </UFormField>
            </div>
            <p class="text-xs leading-5 text-gray-500 dark:text-gray-400">例如下载器回调 <code>/downloads/Movies/A.mkv</code>，映射为 <code>/media/Movies/A.mkv</code>。留空则直接按媒体库路径解析。</p>

            <div class="space-y-2">
              <p class="text-xs font-medium text-gray-600 dark:text-gray-300">Webhook URL</p>
              <div v-for="source in integrationSources" :key="source.value" class="flex flex-wrap items-center gap-2 rounded-xl border border-gray-100 bg-gray-50/70 p-3 dark:border-gray-800 dark:bg-gray-900/30">
                <UBadge color="primary" variant="subtle">{{ source.label }}</UBadge>
                <code class="min-w-0 flex-1 break-all text-[11px] text-gray-600 dark:text-gray-300">{{ webhookUrl(source.value) }}</code>
                <UButton icon="i-lucide-copy" size="xs" color="neutral" variant="ghost" :aria-label="`复制 ${source.label} Webhook`" @click="copyWebhook(source.value)" />
              </div>
            </div>
          </div>

          <div class="rounded-3xl border border-gray-100 dark:border-gray-800 bg-white/85 dark:bg-gray-950/35 p-4 sm:p-5 space-y-3">
            <div class="flex items-center justify-between gap-3">
              <p class="text-sm font-semibold text-gray-800 dark:text-gray-100">最近集成事件</p>
              <UButton label="刷新" icon="i-lucide-refresh-cw" size="xs" color="neutral" variant="ghost" @click="refreshIntegrationEvents()" />
            </div>
            <div v-if="!integrationEvents.length" class="text-xs text-gray-500 dark:text-gray-400">暂无 Webhook 事件</div>
            <div v-else class="space-y-2 max-h-[360px] overflow-y-auto pr-1">
              <div v-for="item in integrationEvents" :key="item.id" class="rounded-xl border border-gray-100 dark:border-gray-800 px-3 py-2 text-xs">
                <div class="flex flex-wrap items-center gap-2">
                  <UBadge color="primary" variant="subtle">{{ item.source }}</UBadge>
                  <UBadge :color="item.status === 'queued' ? 'success' : item.status === 'failed' ? 'error' : 'neutral'" variant="subtle">{{ item.status }}</UBadge>
                  <span class="break-all text-gray-700 dark:text-gray-200">{{ item.path }}</span>
                  <UButton v-if="item.taskId" label="任务" size="xs" color="primary" variant="ghost" :to="`/task/${item.taskId}`" />
                  <span class="ml-auto text-gray-400">{{ formatDate(item.createdAt) }}</span>
                </div>
                <p v-if="item.error" class="mt-1 break-all text-red-600 dark:text-red-400">{{ item.error }}</p>
              </div>
            </div>
          </div>
        </section>

        <section v-show="activeTab === 'api'" class="space-y-4" aria-label="API Token">
          <div class="rounded-3xl border border-gray-100 dark:border-gray-800 bg-white/85 dark:bg-gray-950/35 p-4 sm:p-5 space-y-4">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p class="text-sm font-semibold text-gray-800 dark:text-gray-100">API Token</p>
                <p class="text-xs text-gray-500 dark:text-gray-400">用于自动化脚本、下载器或其他服务调用 SubX API。明文只在创建时显示一次。</p>
              </div>
              <UButton label="创建 Token" icon="i-lucide-key-round" color="primary" variant="soft" @click="openTokenModal" />
            </div>

            <div v-if="!tokens.length" class="rounded-2xl border border-dashed border-gray-300 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-900/20 p-8 text-center text-sm text-gray-500 dark:text-gray-400">
              还没有 API Token
            </div>
            <div v-else class="space-y-2">
              <article v-for="token in tokens" :key="token.id" class="rounded-2xl border border-gray-200/80 dark:border-gray-800 bg-gray-50/60 dark:bg-gray-900/30 p-3 sm:p-4">
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
        </section>
      </div>
    </div>

    <UModal v-model:open="folderModalOpen" :title="folderForm.id ? '编辑监控目录' : '新增监控目录'" description="规则越严格，误触发越少。">
      <template #body>
        <div class="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          <div class="rounded-2xl border border-primary-100 bg-primary-50/60 p-3 dark:border-primary-900/40 dark:bg-primary-950/20">
            <p class="text-xs font-semibold text-primary-800 dark:text-primary-200">快速模板</p>
            <div class="mt-2 flex flex-wrap gap-2">
              <UButton v-for="template in automationTemplates" :key="template.id" :label="template.name" size="xs" color="primary" variant="soft" :title="template.description" @click="applyAutomationTemplate(template)" />
            </div>
          </div>
          <div class="grid gap-3 sm:grid-cols-2">
            <UFormField label="媒体库">
              <USelect v-model="folderForm.rootId" :items="rootOptions" class="w-full" />
            </UFormField>
            <UFormField label="相对路径">
              <UInput v-model="folderForm.path" placeholder="留空表示媒体库根目录，如 Movies" class="w-full" />
            </UFormField>
          </div>
          <div class="grid gap-3 sm:grid-cols-3">
            <UFormField label="触发模式">
              <USelect v-model="folderForm.mode" :items="modeOptions" class="w-full" />
            </UFormField>
            <div class="flex items-end">
              <div class="flex w-full items-center justify-between gap-3 rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50/70 dark:bg-gray-900/30 px-3 py-2.5">
                <span class="text-sm">启用</span>
                <USwitch v-model="folderForm.enabled" aria-label="启用监控目录" />
              </div>
            </div>
            <div class="flex items-end">
              <div class="flex w-full items-center justify-between gap-3 rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50/70 dark:bg-gray-900/30 px-3 py-2.5">
                <span class="text-sm">递归子目录</span>
                <USwitch v-model="folderForm.recursive" aria-label="递归子目录" />
              </div>
            </div>
          </div>

          <details class="rounded-2xl border border-gray-200 dark:border-gray-800 p-3" open>
            <summary class="cursor-pointer text-sm font-semibold text-gray-800 dark:text-gray-100">过滤规则</summary>
            <div class="mt-3 space-y-3">
              <UFormField label="视频扩展名（逗号分隔）">
                <UInput v-model="extensionsText" placeholder=".mkv,.mp4" class="w-full" />
              </UFormField>
              <div class="grid gap-3 sm:grid-cols-2">
                <UFormField label="包含正则（可选）"><UInput v-model="folderForm.rules.includeRegex" placeholder="S01|S02" class="w-full" /></UFormField>
                <UFormField label="排除正则（可选）"><UInput v-model="folderForm.rules.excludeRegex" placeholder="Sample|Trailer" class="w-full" /></UFormField>
                <UFormField label="最小体积 MB"><UInput v-model.number="folderForm.rules.minSizeMb" type="number" min="0" class="w-full" /></UFormField>
                <UFormField label="最大体积 MB（0 不限）"><UInput v-model.number="folderForm.rules.maxSizeMb" type="number" min="0" class="w-full" /></UFormField>
                <UFormField label="最短时长 秒（0 不限）"><UInput v-model.number="folderForm.rules.minDurationSec" type="number" min="0" class="w-full" /></UFormField>
                <UFormField label="文件稳定等待 秒"><UInput v-model.number="folderForm.rules.stableSeconds" type="number" min="0" class="w-full" /></UFormField>
              </div>
              <div class="grid gap-2 sm:grid-cols-2">
                <div class="flex items-center justify-between gap-3 rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50/70 dark:bg-gray-900/30 px-3 py-2.5">
                  <span class="text-sm">已有字幕时跳过</span>
                  <USwitch v-model="folderForm.rules.skipExistingSubtitles" aria-label="已有字幕时跳过" />
                </div>
                <div class="flex items-center justify-between gap-3 rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50/70 dark:bg-gray-900/30 px-3 py-2.5">
                  <span class="text-sm">已有目标输出时跳过</span>
                  <USwitch v-model="folderForm.rules.skipExistingOutput" aria-label="已有目标输出时跳过" />
                </div>
              </div>
              <details class="rounded-xl border border-gray-100 dark:border-gray-800 p-3">
                <summary class="cursor-pointer text-xs font-medium text-gray-600 dark:text-gray-300">时间范围（可选）</summary>
                <div class="mt-3 grid gap-3 sm:grid-cols-2">
                  <UFormField label="创建时间起"><UInput v-model="folderForm.rules.createdAfter" type="datetime-local" class="w-full" /></UFormField>
                  <UFormField label="创建时间止"><UInput v-model="folderForm.rules.createdBefore" type="datetime-local" class="w-full" /></UFormField>
                  <UFormField label="修改时间起"><UInput v-model="folderForm.rules.modifiedAfter" type="datetime-local" class="w-full" /></UFormField>
                  <UFormField label="修改时间止"><UInput v-model="folderForm.rules.modifiedBefore" type="datetime-local" class="w-full" /></UFormField>
                </div>
              </details>
            </div>
          </details>

          <details class="rounded-2xl border border-gray-200 dark:border-gray-800 p-3" open>
            <summary class="cursor-pointer text-sm font-semibold text-gray-800 dark:text-gray-100">任务输出策略</summary>
            <div class="mt-3 grid gap-3 sm:grid-cols-2">
              <UFormField label="目标语言"><UInput v-model="folderForm.outputPolicy.targetLanguage" placeholder="zh-CN（留空使用全局）" class="w-full" /></UFormField>
              <UFormField label="模型（留空使用全局）"><UInput v-model="folderForm.outputPolicy.model" placeholder="gpt-4o-mini" class="w-full" /></UFormField>
              <UFormField label="输出模式"><USelect v-model="folderForm.outputPolicy.outputMode" :items="outputModeOptions" class="w-full" /></UFormField>
              <UFormField label="字幕来源"><USelect v-model="folderForm.outputPolicy.sourceType" :items="sourceTypeOptions" class="w-full" /></UFormField>
              <UFormField label="字幕格式"><USelect v-model="folderForm.outputPolicy.subtitleFormat" :items="subtitleFormatOptions" class="w-full" /></UFormField>
              <UFormField label="翻译风格">
                <USelect v-model="folderForm.outputPolicy.stylePreset" :items="styleOptions" class="w-full" />
              </UFormField>
            </div>
            <div class="mt-3 space-y-2">
              <p class="text-xs font-medium text-gray-600 dark:text-gray-300">通知渠道（留空表示所有渠道）</p>
              <div class="flex flex-wrap gap-2" role="group" aria-label="通知渠道选择">
                <UButton
                  v-for="channel in channels"
                  :key="channel.id"
                  :label="channel.name"
                  size="xs"
                  :color="folderForm.outputPolicy.notifyChannelIds.includes(channel.id) ? 'primary' : 'neutral'"
                  :variant="folderForm.outputPolicy.notifyChannelIds.includes(channel.id) ? 'solid' : 'soft'"
                  :aria-pressed="folderForm.outputPolicy.notifyChannelIds.includes(channel.id)"
                  @click="toggleChannelId(channel.id)"
                />
                <span v-if="!channels.length" class="text-xs text-gray-400">暂无可选渠道</span>
              </div>
            </div>
          </details>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton label="取消" color="neutral" variant="ghost" @click="folderModalOpen = false" />
          <UButton label="保存" color="primary" :loading="savingFolder" @click="saveFolder" />
        </div>
      </template>
    </UModal>

    <UModal v-model:open="backfillModalOpen" title="历史回填" description="只扫描当前监控目录，建议先设置时间范围。">
      <template #body>
        <div class="space-y-3">
          <p class="rounded-xl bg-gray-50 p-3 text-xs text-gray-600 dark:bg-gray-900 dark:text-gray-300">{{ backfillFolder?.rootName }} / {{ backfillFolder?.path || '根目录' }}</p>
          <div class="grid gap-3 sm:grid-cols-2">
            <UFormField label="修改时间起"><UInput v-model="backfillForm.start" type="datetime-local" class="w-full" /></UFormField>
            <UFormField label="修改时间止"><UInput v-model="backfillForm.end" type="datetime-local" class="w-full" /></UFormField>
          </div>
          <UFormField label="最多加入队列"><UInput v-model.number="backfillForm.limit" type="number" min="1" max="5000" class="w-full" /></UFormField>
          <p class="text-xs text-gray-500 dark:text-gray-400">回填会按全局自动并发逐步执行，不会一次性打满任务队列。</p>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton label="取消" color="neutral" variant="ghost" @click="backfillModalOpen = false" />
          <UButton label="开始回填" color="warning" :loading="backfilling" @click="startBackfill" />
        </div>
      </template>
    </UModal>

    <UModal v-model:open="channelModalOpen" :title="channelForm.id ? '编辑通知渠道' : '新增通知渠道'" description="敏感字段加密保存，留空表示保持不变。">
      <template #body>
        <div class="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
          <div class="grid gap-3 sm:grid-cols-2">
            <UFormField label="类型">
              <USelect v-model="channelForm.type" :items="channelTypeOptions" class="w-full" />
            </UFormField>
            <UFormField label="名称"><UInput v-model="channelForm.name" placeholder="例如：家庭群 Telegram" class="w-full" /></UFormField>
          </div>
          <div class="flex items-center justify-between gap-3 rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50/70 dark:bg-gray-900/30 px-3 py-2.5">
            <span class="text-sm">启用此渠道</span>
            <USwitch v-model="channelForm.enabled" aria-label="启用通知渠道" />
          </div>

          <template v-if="channelForm.type === 'telegram'">
            <UFormField label="Bot Token"><UInput v-model="channelForm.config.botToken" type="password" :placeholder="secretPlaceholder" class="w-full" /></UFormField>
            <UFormField label="Chat ID"><UInput v-model="channelForm.config.chatId" placeholder="-1001234567890" class="w-full" /></UFormField>
            <UFormField label="代理地址（可选）">
              <div class="flex gap-2">
                <UInput v-model="channelForm.config.proxyUrl" placeholder="http://192.168.1.10:7890" class="min-w-0 flex-1" />
                <UButton label="测试代理" size="sm" color="neutral" variant="soft" :loading="testingChannelProxy" @click="testChannelProxy" />
              </div>
              <p class="mt-1 text-[11px] leading-5 text-gray-500 dark:text-gray-400">容器里不要写 127.0.0.1，它指向容器自己；填宿主机局域网 IP。留空时使用容器的 HTTPS_PROXY / HTTP_PROXY / ALL_PROXY。</p>
            </UFormField>
          </template>
          <template v-else-if="channelForm.type === 'smtp'">
            <div class="grid gap-3 sm:grid-cols-[1fr_120px]">
              <UFormField label="SMTP Host"><UInput v-model="channelForm.config.host" placeholder="smtp.example.com" class="w-full" /></UFormField>
              <UFormField label="端口"><UInput v-model.number="channelForm.config.port" type="number" class="w-full" /></UFormField>
            </div>
            <div class="grid gap-3 sm:grid-cols-2">
              <UFormField label="用户名"><UInput v-model="channelForm.config.user" class="w-full" /></UFormField>
              <UFormField label="密码/授权码"><UInput v-model="channelForm.config.password" type="password" :placeholder="secretPlaceholder" class="w-full" /></UFormField>
            </div>
            <div class="grid gap-3 sm:grid-cols-2">
              <UFormField label="发件人"><UInput v-model="channelForm.config.from" placeholder="SubX <subx@example.com>" class="w-full" /></UFormField>
              <UFormField label="收件人（逗号分隔）"><UInput v-model="channelForm.config.to" class="w-full" /></UFormField>
            </div>
            <div class="flex items-center justify-between gap-3 rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50/70 dark:bg-gray-900/30 px-3 py-2.5">
              <span class="text-sm">SSL / SMTPS</span>
              <USwitch v-model="channelForm.config.secure" aria-label="启用 SSL" />
            </div>
          </template>
          <template v-else-if="channelForm.type === 'webhook'">
            <UFormField label="Webhook URL"><UInput v-model="channelForm.config.url" placeholder="https://example.com/hook" class="w-full" /></UFormField>
            <div class="grid gap-3 sm:grid-cols-[140px_1fr]">
              <UFormField label="方法"><USelect v-model="channelForm.config.method" :items="webhookMethodOptions" class="w-full" /></UFormField>
              <UFormField label="代理地址（可选）">
                <div class="flex gap-2">
                  <UInput v-model="channelForm.config.proxyUrl" class="min-w-0 flex-1" />
                  <UButton label="测试代理" size="sm" color="neutral" variant="soft" :loading="testingChannelProxy" @click="testChannelProxy" />
                </div>
              </UFormField>
            </div>
            <UFormField label="Headers JSON（可选）"><UTextarea v-model="channelForm.headersText" :rows="3" placeholder='{"Authorization":"Bearer ..."}' class="w-full" /></UFormField>
            <UFormField label="HMAC 密钥（可选）"><UInput v-model="channelForm.config.secret" type="password" :placeholder="secretPlaceholder" class="w-full" /></UFormField>
          </template>
          <template v-else-if="channelForm.type === 'discord'">
            <UFormField label="Discord Webhook URL"><UInput v-model="channelForm.config.url" type="password" :placeholder="secretPlaceholder" class="w-full" /></UFormField>
          </template>
          <template v-else-if="channelForm.type === 'matrix'">
            <UFormField label="Matrix Homeserver"><UInput v-model="channelForm.config.homeserverUrl" placeholder="https://matrix.example.com" class="w-full" /></UFormField>
            <div class="grid gap-3 sm:grid-cols-2">
              <UFormField label="Room ID"><UInput v-model="channelForm.config.roomId" placeholder="!room:example.com" class="w-full" /></UFormField>
              <UFormField label="Access Token"><UInput v-model="channelForm.config.accessToken" type="password" :placeholder="secretPlaceholder" class="w-full" /></UFormField>
            </div>
          </template>
          <template v-else-if="channelForm.type === 'wecom'">
            <UFormField label="企业微信 Webhook URL"><UInput v-model="channelForm.config.url" type="password" :placeholder="secretPlaceholder" class="w-full" /></UFormField>
          </template>
          <template v-else>
            <div class="grid gap-3 sm:grid-cols-[1fr_160px]">
              <UFormField label="ntfy 服务地址"><UInput v-model="channelForm.config.url" placeholder="https://ntfy.sh" class="w-full" /></UFormField>
              <UFormField label="Topic"><UInput v-model="channelForm.config.topic" placeholder="subx" class="w-full" /></UFormField>
            </div>
            <div class="grid gap-3 sm:grid-cols-2">
              <UFormField label="访问 Token（可选）"><UInput v-model="channelForm.config.token" type="password" :placeholder="secretPlaceholder" class="w-full" /></UFormField>
              <UFormField label="优先级 1-5"><UInput v-model.number="channelForm.config.priority" type="number" min="1" max="5" class="w-full" /></UFormField>
            </div>
            <UFormField label="代理地址（可选）">
              <div class="flex gap-2">
                <UInput v-model="channelForm.config.proxyUrl" class="min-w-0 flex-1" />
                <UButton label="测试代理" size="sm" color="neutral" variant="soft" :loading="testingChannelProxy" @click="testChannelProxy" />
              </div>
            </UFormField>
          </template>

          <div class="space-y-2">
            <p class="text-xs font-medium text-gray-600 dark:text-gray-300">通知事件</p>
            <div class="flex flex-wrap gap-2" role="group" aria-label="通知事件选择">
              <UButton
                v-for="event in notificationEvents"
                :key="event"
                :label="eventLabel(event)"
                size="xs"
                :color="channelForm.config.events.includes(event) ? 'primary' : 'neutral'"
                :variant="channelForm.config.events.includes(event) ? 'solid' : 'soft'"
                :aria-pressed="channelForm.config.events.includes(event)"
                @click="toggleChannelEvent(event)"
              />
            </div>
          </div>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton label="取消" color="neutral" variant="ghost" @click="channelModalOpen = false" />
          <UButton label="保存渠道" color="primary" :loading="savingChannel" @click="saveChannel" />
        </div>
      </template>
    </UModal>

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

    <UModal v-model:open="confirmOpen" :title="confirmTitle">
      <template #body><p class="text-sm text-gray-600 dark:text-gray-300">{{ confirmMessage }}</p></template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton label="取消" color="neutral" variant="ghost" @click="confirmOpen = false" />
          <UButton label="确认" color="error" :loading="confirmRunning" @click="runConfirm" />
        </div>
      </template>
    </UModal>
  </AppContainer>
</template>

<script setup lang="ts">
import type { ApiTokenSummary, NotificationChannel, NotificationChannelType, NotificationEvent, WatchEvent, WatchFolder, WatchOutputPolicy, WatchRules } from '~~/types'
import { STYLE_PRESETS } from '~~/shared/stylePresets'
import { AUTOMATION_TEMPLATES } from '~~/shared/automationTemplates'

useHead({ title: '自动化 - SubX' })

const toast = useToast()
const route = useRoute()
const tabs = [
  { value: 'folders', label: '监控目录', icon: 'i-lucide-folder-search' },
  { value: 'events', label: '事件记录', icon: 'i-lucide-list-video' },
  { value: 'notifications', label: '通知渠道', icon: 'i-lucide-bell' },
  { value: 'api', label: 'API Token', icon: 'i-lucide-key-round' },
  { value: 'integrations', label: '外部集成', icon: 'i-lucide-cable' }
]
const activeTab = ref(String(route.query.tab || 'folders'))
if (!tabs.some(tab => tab.value === activeTab.value)) activeTab.value = 'folders'
const refreshing = ref(false)

const { data: configData, refresh: refreshConfig } = await useFetch('/api/config')
const config = computed<any>(() => configData.value || {})
const roots = computed(() => Array.isArray(config.value.mediaRoots) ? config.value.mediaRoots : [])
const rootOptions = computed(() => roots.value.map((root: any) => ({ label: root.name, value: root.id })))
const automationConfig = reactive({
  automationConcurrency: 1,
  notificationEnabled: true,
  notificationLowConfidenceThreshold: 0.6,
  targetLanguage: 'zh-CN'
})
const lowConfidencePercent = computed({
  get: () => Math.round(Number(automationConfig.notificationLowConfidenceThreshold || 0.6) * 100),
  set: (value: number) => { automationConfig.notificationLowConfidenceThreshold = Math.min(1, Math.max(0, Number(value) / 100)) }
})
const savingConfig = ref(false)
watch(configData, (value: any) => {
  if (!value) return
  automationConfig.automationConcurrency = Number(value.automationConcurrency || 1)
  automationConfig.notificationEnabled = value.notificationEnabled !== false
  automationConfig.notificationLowConfidenceThreshold = Number(value.notificationLowConfidenceThreshold ?? 0.6)
  automationConfig.targetLanguage = String(value.targetLanguage || 'zh-CN')
}, { immediate: true })

const { data: foldersData, refresh: refreshFolders } = await useFetch('/api/watch-folders')
const folders = computed<WatchFolder[]>(() => foldersData.value?.folders || [])
const { data: eventsData, refresh: refreshEvents } = await useFetch('/api/watch-events', { query: { limit: 150 } })
const events = computed<WatchEvent[]>(() => eventsData.value?.events || [])
const { data: channelsData, refresh: refreshChannels } = await useFetch('/api/notification-channels')
const channels = computed<NotificationChannel[]>(() => channelsData.value?.channels || [])
const { data: deliveriesData, refresh: refreshDeliveries } = await useFetch('/api/notification-deliveries', { query: { limit: 100 } })
const deliveries = computed<any[]>(() => deliveriesData.value?.deliveries || [])
const { data: tokensData, refresh: refreshTokens } = await useFetch('/api/api-tokens')
const tokens = computed<ApiTokenSummary[]>(() => tokensData.value?.tokens || [])
const { data: auditData, refresh: refreshAudit } = await useFetch('/api/api-token-audit', { query: { limit: 100 } })
const auditLogs = computed<any[]>(() => auditData.value?.logs || [])
const { data: integrationData, refresh: refreshIntegrationEvents } = await useFetch('/api/integrations/events', { query: { limit: 100 } })
const integrationEvents = computed<any[]>(() => integrationData.value?.events || [])
const integrationSources = [
  { label: 'Sonarr', value: 'sonarr' },
  { label: 'Radarr', value: 'radarr' },
  { label: 'Jellyfin', value: 'jellyfin' },
  { label: 'Plex', value: 'plex' },
  { label: 'Emby', value: 'emby' },
  { label: 'Bazarr', value: 'bazarr' }
]
const integrationConfig = reactive({ token: '', pathFrom: '', pathTo: '' })
const savingIntegration = ref(false)
watch(configData, (value: any) => {
  if (!value) return
  const incomingToken = String(value.integrationWebhookToken || '')
  if (!integrationConfig.token || integrationConfig.token.includes('*') || !incomingToken.includes('*')) {
    integrationConfig.token = incomingToken
  }
  integrationConfig.pathFrom = String(value.integrationPathFrom || '')
  integrationConfig.pathTo = String(value.integrationPathTo || '')
}, { immediate: true })

const eventStatus = ref('all')
const eventStatusOptions = [
  { label: '全部状态', value: 'all' },
  { label: '待处理', value: 'pending' },
  { label: '已排队', value: 'queued' },
  { label: '完成', value: 'done' },
  { label: '失败', value: 'failed' },
  { label: '已跳过', value: 'skipped' }
]
const filteredEvents = computed(() => eventStatus.value === 'all' ? events.value : events.value.filter(item => item.status === eventStatus.value))

const automationTemplates = AUTOMATION_TEMPLATES
function applyAutomationTemplate(template: any) {
  folderForm.mode = template.mode || folderForm.mode
  folderForm.recursive = template.recursive !== false
  folderForm.rules = { ...defaultRules(), ...template.rules }
  folderForm.outputPolicy = { ...defaultPolicy(), ...folderForm.outputPolicy, ...(template.outputPolicy || {}) }
  extensionsText.value = folderForm.rules.extensions.join(',')
  toast.add({ title: '已应用模板', description: template.name, color: 'success' })
}

const modeOptions = [
  { label: '仅新文件', value: 'new' },
  { label: '仅历史回填', value: 'backfill' },
  { label: '新文件 + 回填', value: 'both' }
]
const outputModeOptions = [
  { label: '仅译文', value: 'translated' },
  { label: '双语', value: 'bilingual' },
  { label: '仅原字幕', value: 'original' }
]
const sourceTypeOptions = [
  { label: '自动判断', value: 'auto' },
  { label: '内嵌字幕', value: 'embedded' },
  { label: '外挂字幕', value: 'external' },
  { label: '语音识别', value: 'asr' },
  { label: '图像字幕 OCR', value: 'ocr' }
]
const subtitleFormatOptions = [
  { label: 'SRT', value: 'srt' },
  { label: 'ASS', value: 'ass' },
  { label: 'SRT + ASS', value: 'both' }
]
const styleOptions = STYLE_PRESETS.map(preset => ({ label: preset.name, value: preset.id }))
const webhookMethodOptions = ['POST', 'PUT', 'PATCH'].map(value => ({ label: value, value }))
const channelTypeOptions = [
  { label: 'Telegram', value: 'telegram' },
  { label: '邮件 SMTP', value: 'smtp' },
  { label: 'Webhook', value: 'webhook' },
  { label: 'ntfy', value: 'ntfy' },
  { label: 'Discord', value: 'discord' },
  { label: 'Matrix', value: 'matrix' },
  { label: '企业微信', value: 'wecom' }
]
const notificationEvents: NotificationEvent[] = ['task_done', 'task_error', 'task_cancelled', 'low_confidence', 'watch_error', 'backfill_done']

const defaultRules = (): WatchRules => ({
  extensions: ['.mkv', '.mp4', '.avi', '.webm', '.ts', '.m2ts', '.mts', '.mov'],
  includeRegex: '',
  excludeRegex: '',
  minSizeMb: 0,
  maxSizeMb: 0,
  minDurationSec: 0,
  createdAfter: '',
  createdBefore: '',
  modifiedAfter: '',
  modifiedBefore: '',
  stableSeconds: 15,
  skipExistingSubtitles: true,
  skipExistingOutput: true
})
const defaultPolicy = (): WatchOutputPolicy => ({
  targetLanguage: '',
  outputMode: 'translated',
  stylePreset: 'default',
  subtitleFormat: 'srt',
  subtitleStylePreset: 'bilingual_simple',
  bilingualLayout: 'translated_first',
  sourceType: 'auto',
  model: '',
  notifyChannelIds: []
})

const folderModalOpen = ref(false)
const savingFolder = ref(false)
const extensionsText = ref(defaultRules().extensions.join(','))
const folderForm = reactive<any>({ id: null, rootId: '', path: '', enabled: true, recursive: true, mode: 'new', rules: defaultRules(), outputPolicy: defaultPolicy() })
watch(rootOptions, (items) => {
  if (!folderForm.rootId && items.length) folderForm.rootId = items[0]!.value
}, { immediate: true })

function openFolderModal(folder?: WatchFolder) {
  if (folder) {
    folderForm.id = folder.id
    folderForm.rootId = folder.rootId
    folderForm.path = folder.path
    folderForm.enabled = folder.enabled
    folderForm.recursive = folder.recursive
    folderForm.mode = folder.mode
    folderForm.rules = { ...defaultRules(), ...folder.rules }
    folderForm.outputPolicy = { ...defaultPolicy(), ...folder.outputPolicy, notifyChannelIds: [...(folder.outputPolicy.notifyChannelIds || [])] }
  } else {
    folderForm.id = null
    folderForm.rootId = rootOptions.value[0]?.value || ''
    folderForm.path = ''
    folderForm.enabled = true
    folderForm.recursive = true
    folderForm.mode = 'new'
    folderForm.rules = defaultRules()
    folderForm.outputPolicy = defaultPolicy()
  }
  extensionsText.value = folderForm.rules.extensions.join(',')
  folderModalOpen.value = true
}

async function saveFolder() {
  savingFolder.value = true
  try {
    const body = {
      rootId: folderForm.rootId,
      path: folderForm.path,
      enabled: folderForm.enabled,
      recursive: folderForm.recursive,
      mode: folderForm.mode,
      rules: { ...folderForm.rules, extensions: extensionsText.value.split(',').map((item: string) => item.trim()).filter(Boolean) },
      outputPolicy: folderForm.outputPolicy
    }
    if (folderForm.id) await $fetch(`/api/watch-folders/${folderForm.id}`, { method: 'PATCH', body })
    else await $fetch('/api/watch-folders', { method: 'POST', body })
    folderModalOpen.value = false
    await refreshFolders()
    toast.add({ title: '保存成功', description: '监控目录已保存', color: 'success' })
  } catch (e: any) {
    toast.add({ title: '保存失败', description: e?.data?.message || e?.message || '无法保存监控目录', color: 'error' })
  } finally {
    savingFolder.value = false
  }
}

function toggleChannelId(id: number) {
  const list = folderForm.outputPolicy.notifyChannelIds as number[]
  folderForm.outputPolicy.notifyChannelIds = list.includes(id) ? list.filter(item => item !== id) : [...list, id]
}

const backfillModalOpen = ref(false)
const backfilling = ref(false)
const backfillFolder = ref<WatchFolder | null>(null)
const backfillForm = reactive({ start: '', end: '', limit: 500 })
function openBackfillModal(folder: WatchFolder) {
  backfillFolder.value = folder
  backfillForm.start = ''
  backfillForm.end = ''
  backfillForm.limit = 500
  backfillModalOpen.value = true
}
async function startBackfill() {
  if (!backfillFolder.value) return
  backfilling.value = true
  try {
    const result = await $fetch(`/api/watch-folders/${backfillFolder.value.id}/backfill`, { method: 'POST', body: backfillForm })
    backfillModalOpen.value = false
    await Promise.all([refreshEvents(), refreshFolders(), refreshDeliveries()])
    toast.add({ title: '回填已开始', description: `扫描 ${result.scanned} 个视频，加入队列 ${result.queued} 个`, color: 'success' })
  } catch (e: any) {
    toast.add({ title: '回填失败', description: e?.data?.message || e?.message || '无法开始回填', color: 'error' })
  } finally {
    backfilling.value = false
  }
}

const confirmOpen = ref(false)
const confirmRunning = ref(false)
const confirmTitle = ref('确认操作')
const confirmMessage = ref('')
let confirmAction: (() => Promise<any>) | null = null
function requestConfirm(title: string, message: string, action: () => Promise<any>) {
  confirmTitle.value = title
  confirmMessage.value = message
  confirmAction = action
  confirmOpen.value = true
}
async function runConfirm() {
  if (!confirmAction) return
  confirmRunning.value = true
  try {
    await confirmAction()
    confirmOpen.value = false
  } finally {
    confirmRunning.value = false
    confirmAction = null
  }
}
function removeFolder(folder: WatchFolder) {
  requestConfirm('删除监控目录', `将删除 ${folder.rootName || folder.rootId}${folder.path ? ` / ${folder.path}` : ''} 的监控配置和事件记录，不会删除媒体文件。`, async () => {
    await $fetch(`/api/watch-folders/${folder.id}`, { method: 'DELETE' })
    await Promise.all([refreshFolders(), refreshEvents()])
    toast.add({ title: '已删除', description: '监控目录已删除', color: 'success' })
  })
}

function eventColor(status: string) {
  if (status === 'done') return 'success'
  if (status === 'failed') return 'error'
  if (status === 'skipped') return 'neutral'
  if (status === 'pending' || status === 'queued' || status === 'processing') return 'warning'
  return 'neutral'
}
function statusLabel(status: string) {
  return ({ pending: '待处理', queued: '已排队', processing: '处理中', done: '完成', failed: '失败', skipped: '已跳过', ignored: '已忽略' } as Record<string, string>)[status] || status
}
async function retryEvent(item: WatchEvent) {
  try {
    await $fetch(`/api/watch-events/${item.id}/retry`, { method: 'POST' })
    await Promise.all([refreshEvents(), refreshFolders()])
    toast.add({ title: '已重试', description: '事件已重新加入队列', color: 'success' })
  } catch (e: any) {
    toast.add({ title: '重试失败', description: e?.data?.message || e?.message || '无法重试事件', color: 'error' })
  }
}

const channelModalOpen = ref(false)
const savingChannel = ref(false)
const testingChannelId = ref(0)
const testingChannelProxy = ref(false)
const secretPlaceholder = '已设置，留空不修改'
const channelForm = reactive<any>({ id: null, type: 'telegram' as NotificationChannelType, name: '', enabled: true, config: { events: [...notificationEvents] }, headersText: '' })
function defaultChannelConfig(type: NotificationChannelType) {
  if (type === 'telegram') return { botToken: '', chatId: '', proxyUrl: '', events: [...notificationEvents] }
  if (type === 'smtp') return { host: '', port: 587, secure: false, user: '', password: '', from: '', to: '', events: [...notificationEvents] }
  if (type === 'webhook') return { url: '', method: 'POST', headers: {}, secret: '', proxyUrl: '', events: [...notificationEvents] }
  if (type === 'discord') return { url: '', events: [...notificationEvents] }
  if (type === 'matrix') return { homeserverUrl: '', roomId: '', accessToken: '', events: [...notificationEvents] }
  if (type === 'wecom') return { url: '', events: [...notificationEvents] }
  return { url: 'https://ntfy.sh', topic: '', token: '', priority: 3, proxyUrl: '', events: [...notificationEvents] }
}
function openChannelModal(channel?: NotificationChannel) {
  if (channel) {
    channelForm.id = channel.id
    channelForm.type = channel.type
    channelForm.name = channel.name
    channelForm.enabled = channel.enabled
    channelForm.config = { ...defaultChannelConfig(channel.type), ...channel.config, events: [...(channel.config.events || notificationEvents)] }
    channelForm.headersText = channel.config.headers && typeof channel.config.headers === 'object'
      ? (Object.keys(channel.config.headers).length ? JSON.stringify(channel.config.headers, null, 2) : '')
      : ''
  } else {
    channelForm.id = null
    channelForm.type = 'telegram'
    channelForm.name = 'Telegram'
    channelForm.enabled = true
    channelForm.config = defaultChannelConfig('telegram')
    channelForm.headersText = ''
  }
  channelModalOpen.value = true
}
watch(() => channelForm.type, (type, old) => {
  if (type !== old && !channelForm.id) {
    channelForm.name = channelTypeLabel(type)
    channelForm.config = defaultChannelConfig(type)
    channelForm.headersText = ''
  }
})
function channelTypeLabel(type: string) {
  return ({ telegram: 'Telegram', smtp: '邮件', webhook: 'Webhook', ntfy: 'ntfy', discord: 'Discord', matrix: 'Matrix', wecom: '企业微信' } as Record<string, string>)[type] || type
}
function eventLabel(event: string) {
  return ({ task_done: '任务完成', task_error: '任务失败', task_cancelled: '任务取消', low_confidence: '低置信度', watch_error: '监控异常', backfill_done: '回填完成' } as Record<string, string>)[event] || event
}
function channelEventText(channel: NotificationChannel) {
  const list = Array.isArray(channel.config.events) ? channel.config.events : notificationEvents
  return list.map(eventLabel).join('、')
}
function toggleChannelEvent(event: NotificationEvent) {
  const list = channelForm.config.events as string[]
  channelForm.config.events = list.includes(event) ? list.filter(item => item !== event) : [...list, event]
}
async function saveChannel() {
  savingChannel.value = true
  try {
    const config = { ...channelForm.config }
    if (channelForm.type === 'webhook') {
      config.headers = channelForm.headersText.trim() ? JSON.parse(channelForm.headersText) : {}
    }
    const body = { type: channelForm.type, name: channelForm.name, enabled: channelForm.enabled, config }
    if (channelForm.id) await $fetch(`/api/notification-channels/${channelForm.id}`, { method: 'PATCH', body })
    else await $fetch('/api/notification-channels', { method: 'POST', body })
    channelModalOpen.value = false
    await refreshChannels()
    toast.add({ title: '保存成功', description: '通知渠道已保存', color: 'success' })
  } catch (e: any) {
    toast.add({ title: '保存失败', description: e?.data?.message || e?.message || 'JSON 或配置不合法', color: 'error' })
  } finally {
    savingChannel.value = false
  }
}
async function testChannelProxy() {
  testingChannelProxy.value = true
  try {
    const result = await $fetch('/api/notification-proxy-test', {
      method: 'POST',
      body: { proxyUrl: String(channelForm.config.proxyUrl || '').trim() }
    }) as any
    const via = result.proxy ? `代理 ${result.proxy}` : '直连（未配置代理）'
    toast.add({
      title: result.ok ? '代理可用' : '代理已连通，但目标返回异常',
      description: `${via} · HTTP ${result.status} · ${result.latencyMs}ms`,
      color: result.ok ? 'success' : 'warning'
    })
  } catch (e: any) {
    toast.add({ title: '代理测试失败', description: e?.data?.message || e?.message || '无法连接代理', color: 'error' })
  } finally {
    testingChannelProxy.value = false
  }
}

async function testChannel(channel: NotificationChannel) {
  testingChannelId.value = channel.id
  try {
    const result = await $fetch(`/api/notification-channels/${channel.id}/test`, { method: 'POST' }) as any
    if (result.ok) toast.add({ title: '发送成功', description: '测试通知已发送', color: 'success' })
    else toast.add({ title: '发送失败', description: result.error || '请检查配置', color: 'error' })
    await refreshDeliveries()
  } catch (e: any) {
    toast.add({ title: '发送失败', description: e?.data?.message || e?.message || '无法发送测试通知', color: 'error' })
  } finally {
    testingChannelId.value = 0
  }
}
function removeChannel(channel: NotificationChannel) {
  requestConfirm('删除通知渠道', `确定删除「${channel.name}」？历史投递记录会保留。`, async () => {
    await $fetch(`/api/notification-channels/${channel.id}`, { method: 'DELETE' })
    await refreshChannels()
    toast.add({ title: '已删除', description: '通知渠道已删除', color: 'success' })
  })
}

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
const requestUrl = useRequestURL()
const baseUrl = computed(() => requestUrl.origin)
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
    await refreshTokens()
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
function revokeToken(token: ApiTokenSummary) {
  requestConfirm('撤销 API Token', `确定撤销「${token.name}」？使用该 Token 的调用会立即失败。`, async () => {
    await $fetch(`/api/api-tokens/${token.id}`, { method: 'DELETE' })
    await refreshTokens()
    toast.add({ title: '已撤销', description: 'Token 已失效', color: 'success' })
  })
}

function generateIntegrationToken() {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  integrationConfig.token = `subx_hook_${Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')}`
}

function webhookUrl(source: string) {
  const token = integrationConfig.token && !integrationConfig.token.includes('*') ? integrationConfig.token : '<TOKEN>'
  return `${baseUrl.value}/api/integrations/${source}?token=${encodeURIComponent(token)}`
}

async function copyWebhook(source: string) {
  try {
    await navigator.clipboard.writeText(webhookUrl(source))
    toast.add({ title: '已复制', description: 'Webhook URL 已复制', color: 'success' })
  } catch {
    toast.add({ title: '复制失败', description: '请手动选择复制', color: 'error' })
  }
}

async function saveIntegrationConfig() {
  savingIntegration.value = true
  try {
    await $fetch('/api/config', {
      method: 'PUT',
      body: {
        integrationWebhookToken: integrationConfig.token,
        integrationPathFrom: integrationConfig.pathFrom,
        integrationPathTo: integrationConfig.pathTo
      }
    })
    await refreshConfig()
    toast.add({ title: '保存成功', description: '外部集成设置已保存', color: 'success' })
  } catch (e: any) {
    toast.add({ title: '保存失败', description: e?.data?.message || e?.message || '无法保存集成设置', color: 'error' })
  } finally {
    savingIntegration.value = false
  }
}

async function saveAutomationConfig() {
  savingConfig.value = true
  try {
    await $fetch('/api/config', {
      method: 'PUT',
      body: {
        automationConcurrency: automationConfig.automationConcurrency,
        notificationEnabled: automationConfig.notificationEnabled,
        notificationLowConfidenceThreshold: automationConfig.notificationLowConfidenceThreshold
      }
    })
    await refreshConfig()
    toast.add({ title: '保存成功', description: '全局自动化设置已保存', color: 'success' })
  } catch (e: any) {
    toast.add({ title: '保存失败', description: e?.data?.message || e?.message || '无法保存设置', color: 'error' })
  } finally {
    savingConfig.value = false
  }
}

async function refreshAll() {
  refreshing.value = true
  try {
    await Promise.all([refreshConfig(), refreshFolders(), refreshEvents(), refreshChannels(), refreshDeliveries(), refreshTokens(), refreshAudit(), refreshIntegrationEvents()])
  } finally {
    refreshing.value = false
  }
}

function formatDate(value?: string | null) {
  if (!value) return '-'
  const date = new Date(value.includes('T') ? value : `${value.replace(' ', 'T')}Z`)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false })
}
function formatSize(bytes: number) {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let size = Number(bytes)
  let index = 0
  while (size >= 1024 && index < units.length - 1) { size /= 1024; index++ }
  return `${size.toFixed(index ? 1 : 0)} ${units[index]}`
}
</script>
