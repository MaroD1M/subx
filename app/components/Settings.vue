<template>
  <div class="space-y-4">
    <div class="grid grid-cols-1 gap-4 md:grid-cols-[190px_minmax(0,1fr)]">
      <nav class="self-start overflow-x-auto rounded-2xl border border-gray-200/80 bg-white p-1.5 shadow-sm dark:border-gray-800 dark:bg-gray-950/60 md:sticky md:top-20">
        <div class="flex min-w-max gap-1 md:min-w-0 md:flex-col">
          <button
            v-for="tab in settingsTabs"
            :key="tab.value"
            type="button"
            class="flex items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors"
            :class="activeTab === tab.value ? 'bg-primary-50 text-primary-700 dark:bg-primary-500/10 dark:text-primary-300' : 'text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-900'"
            @click="activeTab = tab.value"
          >
            <UIcon :name="tab.icon" class="h-4 w-4 shrink-0" />
            <span>{{ tab.label }}</span>
          </button>
        </div>
      </nav>

      <div class="min-w-0 space-y-4">
        <div v-show="activeTab === 'ai'" class="space-y-4">
          <div v-if="isInsecure" class="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-500/20 dark:bg-amber-500/5">
            <UIcon name="i-lucide-shield-alert" class="h-5 w-5 shrink-0 text-amber-500" />
            <div class="space-y-1">
              <p class="text-xs font-bold text-amber-700 dark:text-amber-400">连接不安全</p>
              <p class="text-xs leading-5 text-amber-700/80 dark:text-amber-300/80">当前连接未启用 HTTPS，建议在生产环境开启 HTTPS。</p>
            </div>
          </div>

          <SettingsSection title="AI 连接" description="填写密钥、接口地址与默认模型。">
            <template #actions>
              <UButton label="接口说明" variant="link" color="primary" size="xs" class="p-0 font-bold" @click="isGuideOpen = true" />
            </template>

            <div class="space-y-4">
              <UFormField label="接口密钥">
                <UInput v-model="config.apiKey" type="password" placeholder="sk-..." icon="i-lucide-key" class="w-full" @blur="tryFetchModels" />
              </UFormField>

              <UFormField label="Provider 类型">
                <USelect v-model="config.providerType" :items="providerTypeItems" class="w-full" />
                <p class="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">OpenAI 兼容覆盖 Ollama/LM Studio/vLLM；Anthropic 和 Gemini 使用官方原生协议。</p>
              </UFormField>

              <UFormField label="接口基础地址">
                <UInput v-model="config.apiBaseUrl" placeholder="https://api.openai.com/v1" icon="i-lucide-globe" class="w-full" @blur="tryFetchModels" />
              </UFormField>

              <UFormField label="默认模型">
                <div class="space-y-2">
                  <div class="flex gap-2">
                    <USelect v-if="modelItems.length && !useManualModelInput" v-model="config.defaultModel" :items="modelItems" class="min-w-0 flex-1" />
                    <UInput v-else v-model="config.defaultModel" placeholder="例如 gpt-4o-mini" class="flex-1" />
                    <UButton icon="i-lucide-refresh-cw" color="neutral" variant="ghost" size="sm" :loading="fetchingModels" title="获取模型列表" aria-label="获取模型列表" @click="tryFetchModels" />
                  </div>
                  <div class="flex items-center justify-between gap-3 rounded-xl border border-gray-100 bg-gray-50/70 p-3 dark:border-gray-800 dark:bg-gray-900/40">
                    <div class="space-y-0.5">
                      <p class="text-xs font-medium text-gray-700 dark:text-gray-300">手动填写模型名称</p>
                      <p class="text-xs text-gray-500 dark:text-gray-400">开启后可直接输入模型标识，不依赖模型列表。</p>
                    </div>
                    <USwitch v-model="useManualModelInput" />
                  </div>
                  <div v-if="fetchingModels" class="flex items-center gap-2 text-xs text-gray-500"><UIcon name="i-lucide-loader-2" class="h-3 w-3 animate-spin" />获取中...</div>
                  <div v-else-if="modelError" class="text-xs text-amber-600 dark:text-amber-400">{{ modelError }}</div>
                  <div v-else-if="modelItems.length" class="text-xs text-green-600 dark:text-green-400">已加载 {{ modelItems.length }} 个可用模型</div>
                </div>
              </UFormField>
            </div>
          </SettingsSection>

          <div class="rounded-2xl border border-primary-100 bg-primary-50/60 p-4 dark:border-primary-900/40 dark:bg-primary-500/5">
            <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div class="space-y-1">
                <p class="text-sm font-semibold text-primary-800 dark:text-primary-200">使用 NAS 本地模型</p>
                <p class="text-xs leading-5 text-primary-900 dark:text-primary-200">Ollama、LM Studio、llama.cpp、vLLM 都可以通过 OpenAI 兼容地址接入，适合隐私优先和零 API 费用场景。</p>
              </div>
              <UButton label="查看本地模型接入" size="xs" color="primary" variant="soft" @click="isGuideOpen = true" />
            </div>
          </div>
        </div>

        <div v-show="activeTab === 'asr'" class="space-y-4">
          <SettingsSection title="语音识别" description="无字幕视频会自动走 ASR；有字幕的视频也能在首页手动强制识别。模型需手动下载。">
            <template #actions>
              <UButton label="检测服务" size="xs" color="neutral" variant="soft" :loading="testingAsr" @click="testAsr" />
            </template>

            <div class="space-y-4">
              <div class="flex flex-wrap items-center gap-2 rounded-xl border border-gray-100 bg-gray-50/70 p-3 dark:border-gray-800 dark:bg-gray-900/40">
                <span class="text-xs font-medium text-gray-600 dark:text-gray-300">快速预设</span>
                <UButton v-for="preset in asrPresets" :key="preset.id" :label="preset.label" size="xs" color="neutral" variant="soft" @click="applyAsrPreset(preset)" />
              </div>
              <div class="flex items-center justify-between gap-3 rounded-xl border border-gray-100 bg-gray-50/70 p-3 dark:border-gray-800 dark:bg-gray-900/40">
                <div class="space-y-0.5">
                  <p class="text-sm font-medium text-gray-700 dark:text-gray-300">启用语音识别</p>
                  <p class="text-xs leading-5 text-gray-500 dark:text-gray-400">无文本字幕时允许使用 ASR；关闭后只处理已有字幕。</p>
                </div>
                <USwitch v-model="config.asrEnabled" aria-label="启用语音识别" />
              </div>

              <UFormField label="ASR 服务地址">
                <div class="flex gap-2">
                  <UInput v-model="config.asrBaseUrl" placeholder="http://127.0.0.1:8000" icon="i-lucide-server" class="w-full" />
                  <UButton label="使用内置" size="sm" color="neutral" variant="soft" @click="config.asrBaseUrl = 'http://127.0.0.1:8000'" />
                </div>
                <p class="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">单镜像已内置 ASR，默认地址 <code>http://127.0.0.1:8000</code>；拆分部署时填 sidecar 服务名。</p>
              </UFormField>

              <UFormField label="ASR API Key（可选）">
                <UInput v-model="config.asrApiKey" type="password" placeholder="内置服务通常留空" icon="i-lucide-key" class="w-full" />
              </UFormField>

              <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
                <UFormField label="识别引擎">
                  <USelect v-model="config.asrEngine" :items="asrEngineItems" class="w-full" />
                </UFormField>
                <UFormField label="音频预处理">
                  <USelect v-model="config.asrPreprocess" :items="asrPreprocessItems" class="w-full" />
                </UFormField>
              </div>

              <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
                <UFormField label="模型">
                  <USelect v-model="config.asrModel" :items="asrModelItems" class="w-full" />
                </UFormField>
                <UFormField label="源语言">
                  <USelect v-model="config.asrLanguage" :items="asrLanguageItems" class="w-full" />
                </UFormField>
                <UFormField label="运行设备">
                  <USelect v-model="config.asrDevice" :items="asrDeviceItems" class="w-full" />
                </UFormField>
                <UFormField label="计算精度">
                  <USelect v-model="config.asrComputeType" :items="asrComputeTypeItems" class="w-full" />
                </UFormField>
              </div>

              <div class="grid grid-cols-1 gap-3 md:grid-cols-3">
                <div class="flex items-center justify-between gap-3 rounded-xl border border-gray-100 bg-gray-50/70 p-3 dark:border-gray-800 dark:bg-gray-900/40">
                  <div><p class="text-xs font-medium text-gray-700 dark:text-gray-300">VAD</p><p class="text-[11px] text-gray-500 dark:text-gray-400">过滤静音</p></div>
                  <USwitch v-model="config.asrVad" aria-label="启用 VAD" />
                </div>
                <div class="flex items-center justify-between gap-3 rounded-xl border border-gray-100 bg-gray-50/70 p-3 dark:border-gray-800 dark:bg-gray-900/40">
                  <div><p class="text-xs font-medium text-gray-700 dark:text-gray-300">词级时间轴</p><p class="text-[11px] text-gray-500 dark:text-gray-400">提升对齐</p></div>
                  <USwitch v-model="config.asrWordTimestamps" aria-label="启用词级时间轴" />
                </div>
                <div class="flex items-center justify-between gap-3 rounded-xl border border-gray-100 bg-gray-50/70 p-3 dark:border-gray-800 dark:bg-gray-900/40">
                  <div><p class="text-xs font-medium text-gray-700 dark:text-gray-300">保留音频</p><p class="text-[11px] text-gray-500 dark:text-gray-400">默认关闭</p></div>
                  <USwitch v-model="config.asrKeepAudio" aria-label="保留临时音频" />
                </div>
                <div class="flex items-center justify-between gap-3 rounded-xl border border-gray-100 bg-gray-50/70 p-3 dark:border-gray-800 dark:bg-gray-900/40">
                  <div><p class="text-xs font-medium text-gray-700 dark:text-gray-300">说话人分离</p><p class="text-[11px] text-gray-500 dark:text-gray-400">pyannote PoC，默认关闭</p></div>
                  <USwitch v-model="config.asrDiarization" aria-label="启用说话人分离" />
                </div>
              </div>

              <div class="rounded-2xl border border-gray-200/80 p-3 dark:border-gray-800 space-y-3">
                <div class="flex items-center justify-between gap-3">
                  <div>
                    <p class="text-sm font-medium text-gray-700 dark:text-gray-300">云 ASR 兜底</p>
                    <p class="text-xs leading-5 text-gray-500 dark:text-gray-400">默认关闭。开启后音频会上传到 OpenAI 兼容云服务；仅在本地失败时兜底。</p>
                  </div>
                  <USwitch v-model="config.asrCloudEnabled" aria-label="启用云 ASR 兜底" />
                </div>
                <div v-if="config.asrCloudEnabled" class="grid gap-3 md:grid-cols-2">
                  <UFormField label="云 ASR 地址"><UInput v-model="config.asrCloudBaseUrl" placeholder="https://api.openai.com/v1" class="w-full" /></UFormField>
                  <UFormField label="云模型"><UInput v-model="config.asrCloudModel" placeholder="whisper-1" class="w-full" /></UFormField>
                  <UFormField label="云 API Key"><UInput v-model="config.asrCloudApiKey" type="password" placeholder="sk-..." class="w-full" /></UFormField>
                  <div class="flex items-end">
                    <div class="flex w-full items-center justify-between gap-3 rounded-xl border border-gray-100 bg-gray-50/70 px-3 py-2.5 dark:border-gray-800 dark:bg-gray-900/40">
                      <span class="text-sm text-gray-600 dark:text-gray-300">本地失败时回退云端</span>
                      <USwitch v-model="config.asrCloudFallback" aria-label="本地失败时回退云端" />
                    </div>
                  </div>
                </div>
                <p class="text-[11px] leading-5 text-amber-700 dark:text-amber-300">隐私提示：开启后会先把音频上传到云服务。长音频超过 24MB 时会先压缩为 32kbps mono MP3；仍超限则报错。</p>
              </div>

              <AsrModelManager :selected-model="config.asrModel" :engine="config.asrEngine" @select="config.asrModel = $event" />

              <p class="rounded-xl border border-amber-100 bg-amber-50/80 p-3 text-xs leading-5 text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300">
                单镜像已内置 ASR 服务，不需要再启动 sidecar profile。模型默认不会自动下载，请在「本地模型管理」中手动开始，下载前请预留 10–20GB 空间。ARM NAS 可把引擎切到 <code>whisper-cpp</code>。
              </p>

              <div class="rounded-2xl border border-gray-200/80 p-3 dark:border-gray-800 space-y-3">
                <div class="flex items-center justify-between gap-3">
                  <div>
                    <p class="text-sm font-medium text-gray-700 dark:text-gray-300">图像字幕 OCR</p>
                    <p class="text-xs leading-5 text-gray-500 dark:text-gray-400">PGS / VobSub / DVD 图像字幕。无文本字幕时优先 OCR，再回退 ASR。</p>
                  </div>
                  <USwitch v-model="config.ocrEnabled" aria-label="启用图像字幕 OCR" />
                </div>
                <div v-if="config.ocrEnabled" class="grid gap-3 md:grid-cols-2">
                  <UFormField label="OCR 服务地址">
                    <div class="flex gap-2">
                      <UInput v-model="config.ocrBaseUrl" placeholder="http://127.0.0.1:8001" class="w-full" />
                      <UButton label="使用内置" size="sm" color="neutral" variant="soft" @click="config.ocrBaseUrl = 'http://127.0.0.1:8001'" />
                    </div>
                  </UFormField>
                  <UFormField label="OCR 语言">
                    <USelect v-model="config.ocrLanguage" :items="ocrLanguageItems" class="w-full" />
                  </UFormField>
                  <UFormField label="OCR API Key（可选）"><UInput v-model="config.ocrApiKey" type="password" placeholder="与 OCR_API_KEY 一致" class="w-full" /></UFormField>
                </div>
                <p class="text-[11px] leading-5 text-gray-500 dark:text-gray-400">单镜像已内置 OCR（Tesseract + RapidOCR），默认地址 <code>http://127.0.0.1:8001</code>，无需下载模型。拆分部署时改用 <code>http://subx-ocr:8000</code>。</p>
              </div>

              <div class="rounded-2xl border border-gray-200/80 p-3 dark:border-gray-800 space-y-3">
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p class="text-sm font-medium text-gray-700 dark:text-gray-300">ASR 指标</p>
                    <p class="text-xs text-gray-500 dark:text-gray-400">识别次数、音频时长、RTF 与平均置信度。</p>
                  </div>
                  <UButton label="刷新" icon="i-lucide-refresh-cw" size="xs" color="neutral" variant="ghost" :loading="asrMetricsLoading" @click="loadAsrMetrics" />
                </div>
                <div v-if="asrMetrics" class="grid grid-cols-2 gap-2 md:grid-cols-5">
                  <div class="rounded-xl bg-gray-50 p-2.5 dark:bg-gray-900/40"><p class="text-[11px] text-gray-500">识别次数</p><p class="text-lg font-bold">{{ asrMetrics.summary.runs }}</p></div>
                  <div class="rounded-xl bg-gray-50 p-2.5 dark:bg-gray-900/40"><p class="text-[11px] text-gray-500">音频小时</p><p class="text-lg font-bold">{{ asrMetrics.summary.audioHours.toFixed(2) }}</p></div>
                  <div class="rounded-xl bg-gray-50 p-2.5 dark:bg-gray-900/40"><p class="text-[11px] text-gray-500">平均 RTF</p><p class="text-lg font-bold">{{ asrMetrics.summary.avgRtf.toFixed(2) }}</p></div>
                  <div class="rounded-xl bg-gray-50 p-2.5 dark:bg-gray-900/40"><p class="text-[11px] text-gray-500">平均置信度</p><p class="text-lg font-bold">{{ (asrMetrics.summary.avgConfidence * 100).toFixed(0) }}%</p></div>
                  <div class="rounded-xl bg-gray-50 p-2.5 dark:bg-gray-900/40"><p class="text-[11px] text-gray-500">低置信度</p><p class="text-lg font-bold">{{ asrMetrics.summary.lowConfidenceRuns }}</p></div>
                </div>
                <div v-if="asrMetrics?.engines?.length" class="flex flex-wrap gap-2">
                  <UBadge v-for="engine in asrMetrics.engines" :key="engine.engine" color="neutral" variant="subtle">
                    {{ engine.engine }} · {{ engine.runs }} 次 · RTF {{ engine.avgRtf.toFixed(2) }}
                  </UBadge>
                </div>
              </div>
            </div>
          </SettingsSection>
        </div>

        <div v-show="activeTab === 'defaults'" class="space-y-4">
          <SettingsSection title="默认翻译行为" description="这些设置会作为新任务的默认值。">
            <div class="space-y-4">
              <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
                <UFormField label="目标语言">
                  <USelect v-model="config.targetLanguage" :items="LANGUAGE_OPTIONS" class="w-full" />
                </UFormField>
                <UFormField label="输出模式">
                  <USelect v-model="config.outputMode" :items="outputModeItems" class="w-full" />
                </UFormField>
              </div>

              <UFormField label="翻译模式">
                <USelect v-model="config.translationMode" :items="translationModeItems" class="w-full" />
              </UFormField>

              <div class="flex items-center justify-between gap-3 rounded-xl border border-gray-100 bg-gray-50/70 p-3 dark:border-gray-800 dark:bg-gray-900/40">
                <div class="space-y-0.5">
                  <p class="text-sm font-medium text-gray-700 dark:text-gray-300">Emby 兼容输出</p>
                  <p class="text-xs leading-5 text-gray-500 dark:text-gray-400">媒体目录只放一个主字幕，语言变体同步到 SubX/ 子目录。</p>
                </div>
                <USwitch v-model="config.embyCompatibleOutput" aria-label="启用 Emby 兼容输出" />
              </div>

              <div class="rounded-2xl border border-gray-200/80 p-3 dark:border-gray-800 space-y-3">
                <div class="flex items-center justify-between gap-3">
                  <div>
                    <p class="text-sm font-medium text-gray-700 dark:text-gray-300">双模型质量校验</p>
                    <p class="text-xs leading-5 text-gray-500 dark:text-gray-400">翻译完成后用第二个模型逐条评分，低分条目自动进入核对。</p>
                  </div>
                  <USwitch v-model="config.qualityCheckEnabled" aria-label="启用双模型质量校验" />
                </div>
                <div v-if="config.qualityCheckEnabled" class="grid gap-3 md:grid-cols-3">
                  <UFormField label="校验模型">
                    <UInput v-model="config.qualityCheckModel" placeholder="例如 gpt-4o-mini" class="w-full" />
                  </UFormField>
                  <UFormField label="低分阈值">
                    <UInput v-model.number="qualityThresholdPercent" type="number" min="0" max="100" class="w-full">
                      <template #trailing><span class="text-xs text-gray-400">%</span></template>
                    </UInput>
                  </UFormField>
                  <UFormField label="最多校验条数">
                    <UInput v-model.number="config.qualityCheckMaxEntries" type="number" min="1" max="1000" class="w-full" />
                  </UFormField>
                </div>
                <p v-if="config.qualityCheckEnabled && config.qualityCheckModel && config.qualityCheckModel === config.defaultModel" class="text-xs text-amber-700 dark:text-amber-300">校验模型与主翻译模型相同，不构成双模型校验。</p>
              </div>

              <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <UFormField label="分块大小">
                  <UInputNumber v-model="config.chunkSize" :min="100" :max="50000" :step="100" class="w-full" />
                </UFormField>
                <UFormField label="并发任务数">
                  <UInputNumber v-model="config.concurrency" :min="1" :max="10" class="w-full" />
                </UFormField>
                <UFormField label="最大重试次数">
                  <UInputNumber v-model="config.maxRetries" :min="0" :max="5" class="w-full" />
                </UFormField>
                <UFormField label="日志保留天数">
                  <UInputNumber v-model="config.logRetentionDays" :min="1" :max="30" class="w-full" />
                </UFormField>
              </div>
              <p class="text-xs leading-5 text-gray-500 dark:text-gray-400">分块大小按估算 Token 计算，范围 100-50000。模型上下文较大时可适当提高。</p>
            </div>
          </SettingsSection>
        </div>

        <div v-show="activeTab === 'styles'" class="space-y-4">
          <SettingsSection title="自定义翻译风格" description="在默认风格之外新增自己的语气、术语和表达要求。">
            <template #actions>
              <UButton label="新增风格" size="xs" color="primary" variant="soft" icon="i-lucide-plus" @click="addCustomStyle" />
            </template>

            <div v-if="config.customStylePresets?.length" class="space-y-3">
              <div v-for="(preset, index) in config.customStylePresets" :key="preset.id || index" class="rounded-xl border border-gray-200/80 bg-gray-50/50 p-3 dark:border-gray-800 dark:bg-gray-900/30">
                <div class="grid grid-cols-1 gap-2 md:grid-cols-2">
                  <UInput v-model="preset.name" placeholder="风格名称，例如：日式轻小说" />
                  <UInput v-model="preset.description" placeholder="适用场景说明" />
                </div>
                <UTextarea v-model="preset.prompt" :rows="4" autoresize :maxrows="10" placeholder="例如：请使用轻松、细腻、带一点吐槽感的表达；角色名保持与术语表一致。" class="mt-2 w-full" />
                <div class="mt-2 flex justify-end">
                  <UButton icon="i-lucide-trash-2" label="删除风格" color="error" variant="ghost" size="xs" @click="removeCustomStyle(Number(index))" />
                </div>
              </div>
            </div>
            <p v-else class="text-xs text-gray-500 dark:text-gray-400">暂无自定义风格，点击“新增风格”开始配置。</p>
          </SettingsSection>

          <SettingsSection title="内置风格" description="内置风格由系统提供，不可直接编辑；可参考其写法创建自定义风格。">
            <div class="grid gap-3 md:grid-cols-2">
              <div v-for="preset in builtinStylePresets" :key="preset.id" class="rounded-xl border border-gray-100 bg-gray-50/60 p-3 dark:border-gray-800 dark:bg-gray-900/30">
                <div class="flex items-start gap-2">
                  <UIcon :name="preset.icon" class="mt-0.5 h-4 w-4 shrink-0 text-primary-700" />
                  <div class="min-w-0">
                    <p class="text-xs font-semibold text-gray-800 dark:text-gray-200">{{ preset.name }}</p>
                    <p class="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">{{ preset.description }}</p>
                  </div>
                </div>
              </div>
            </div>
          </SettingsSection>
        </div>

        <div v-show="activeTab === 'glossary'" class="space-y-4">
          <SettingsSection title="术语表" description="固定专有名词、角色名或台词的译法。">
            <template #actions>
              <UButton label="添加术语" size="xs" color="primary" variant="soft" icon="i-lucide-plus" @click="addGlossaryRow" />
            </template>

            <div v-if="glossaryRows.length" class="space-y-2">
              <div v-for="(row, index) in glossaryRows" :key="index" class="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2">
                <UInput v-model="row.key" placeholder="原文/人名" />
                <UInput v-model="row.value" placeholder="译文" />
                <UButton icon="i-lucide-trash-2" color="error" variant="ghost" size="sm" aria-label="删除术语" @click="removeGlossaryRow(index)" />
              </div>
            </div>
            <p v-else class="text-xs text-gray-500 dark:text-gray-400">暂无术语，点击“添加术语”开始配置。</p>
          </SettingsSection>
        </div>

        <div v-show="activeTab === 'advanced'" class="space-y-4">
          <SettingsSection title="高级设置" description="仅在需要兼容性排查时使用。">
            <div class="rounded-xl border border-gray-100 bg-gray-50/70 p-4 dark:border-gray-800 dark:bg-gray-900/40" :class="config.translationMode !== 'stream' ? 'opacity-60' : ''">
              <div class="flex items-center justify-between gap-3">
                <div class="space-y-0.5">
                  <p class="text-sm font-medium text-gray-700 dark:text-gray-300">流式用量统计</p>
                  <p class="text-xs leading-5 text-gray-500 dark:text-gray-400">仅在流式模式下生效，兼容性较弱，默认建议关闭。</p>
                </div>
                <USwitch v-model="config.streamUsage" :disabled="config.translationMode !== 'stream'" @click.stop />
              </div>
            </div>
            <p class="mt-3 text-xs leading-5 text-gray-500 dark:text-gray-400">日志保留天数会同时影响任务日志、AI 日志、临时文件和翻译缓存清理。</p>
          </SettingsSection>
        </div>
      </div>
    </div>

    <div class="flex flex-col gap-3 rounded-2xl border border-gray-200/80 bg-white p-3 shadow-sm dark:border-gray-800 dark:bg-gray-950/80 sm:flex-row sm:items-center md:sticky md:bottom-4 md:z-20">
      <div v-if="hasUnsavedChanges" class="text-xs text-amber-600 dark:text-amber-400">有未保存的更改</div>
      <div class="flex items-center gap-3 sm:ml-auto">
        <UButton label="取消" color="neutral" variant="ghost" @click="handleClose" />
        <UButton label="保存修改" color="primary" :loading="pending" @click="save" />
      </div>
    </div>

    <UModal v-model:open="closeConfirmOpen" title="放弃未保存的更改？" description="当前设置尚未保存，关闭后会丢失本次修改。">
      <template #content>
        <div class="space-y-4 p-5">
          <div class="rounded-xl border border-amber-100 bg-amber-50/80 p-3 text-sm text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300">
            你可以先保存修改，或确认放弃本次更改。
          </div>
          <div class="flex items-center justify-end gap-3">
            <UButton label="继续编辑" color="neutral" variant="ghost" @click="closeConfirmOpen = false" />
            <UButton label="放弃更改" color="warning" @click="confirmCloseWithoutSaving" />
          </div>
        </div>
      </template>
    </UModal>

    <AiProviderGuideDrawer v-model:open="isGuideOpen" @apply="applyProviderGuide" />
  </div>
</template>

<script setup lang="ts">
import { LANGUAGE_OPTIONS } from '~~/shared/languages'
import { STYLE_PRESETS } from '~~/shared/stylePresets'

const emit = defineEmits(['close', 'saved'])
const route = useRoute()
const isGuideOpen = ref(false)
const activeTab = ref<'ai' | 'asr' | 'defaults' | 'styles' | 'glossary' | 'advanced'>('ai')
const settingsTabs = [
  { label: 'AI 连接', icon: 'i-lucide-plug', value: 'ai' as const },
  { label: '语音识别', icon: 'i-lucide-mic', value: 'asr' as const },
  { label: '翻译默认', icon: 'i-lucide-sliders-horizontal', value: 'defaults' as const },
  { label: '翻译风格', icon: 'i-lucide-wand-sparkles', value: 'styles' as const },
  { label: '术语表', icon: 'i-lucide-book-a', value: 'glossary' as const },
  { label: '高级设置', icon: 'i-lucide-settings-2', value: 'advanced' as const }
]
const builtinStylePresets = STYLE_PRESETS
const { data } = await useFetch('/api/config')
const config = ref<any>(data.value || {})
const pending = ref(false)
const testingAsr = ref(false)
const asrMetrics = ref<any>(null)
const asrMetricsLoading = ref(false)
const closeConfirmOpen = ref(false)
const toast = useToast()
const outputModeItems = [
  { label: '仅显示译文', value: 'translated' },
  { label: '双语对照', value: 'bilingual' },
  { label: '仅导出原字幕', value: 'original' }
]
const asrPresets = [
  { id: 'low', label: '低配 J1900/J4125', model: 'small', device: 'cpu', computeType: 'int8' },
  { id: 'mainstream', label: '主流 N5105/N100', model: 'medium', device: 'cpu', computeType: 'int8' },
  { id: 'advanced', label: '进阶 i5/GPU', model: 'large-v3-turbo', device: 'cuda', computeType: 'float16' }
]
const asrEngineItems = [
  { label: '自动（ARM 优先 whisper.cpp）', value: 'auto' },
  { label: 'faster-whisper', value: 'faster-whisper' },
  { label: 'whisper.cpp', value: 'whisper-cpp' },
  { label: '云 ASR', value: 'cloud' }
]
const ocrLanguageItems = [
  { label: '英语', value: 'en' },
  { label: '中文（简体）', value: 'zh-CN' },
  { label: '中文（繁体）', value: 'zh-TW' },
  { label: '日语', value: 'ja' },
  { label: '韩语', value: 'ko' },
  { label: '俄语', value: 'ru' },
  { label: '法语', value: 'fr' },
  { label: '德语', value: 'de' },
  { label: '西班牙语', value: 'es' },
  { label: '意大利语', value: 'it' },
  { label: '葡萄牙语', value: 'pt' },
  { label: '泰语', value: 'th' },
  { label: '阿拉伯语', value: 'ar' },
  { label: '印地语', value: 'hi' },
  { label: '土耳其语', value: 'tr' },
  { label: '越南语', value: 'vi' },
  { label: '乌克兰语', value: 'uk' },
  { label: '荷兰语', value: 'nl' },
  { label: '波兰语', value: 'pl' },
  { label: '瑞典语', value: 'sv' },
  { label: '丹麦语', value: 'da' },
  { label: '芬兰语', value: 'fi' },
  { label: '挪威语', value: 'no' },
  { label: '捷克语', value: 'cs' },
  { label: '希腊语', value: 'el' },
  { label: '希伯来语', value: 'he' },
  { label: '印尼语', value: 'id' },
  { label: '马来语', value: 'ms' }
]
const asrPreprocessItems = [
  { label: '关闭（推荐）', value: 'off' },
  { label: 'Demucs 人声分离（PoC）', value: 'demucs' },
  { label: 'DeepFilterNet 降噪（PoC）', value: 'deepfilternet' }
]
const asrModelItems = [
  { label: 'tiny（极低配/快速）', value: 'tiny' },
  { label: 'base（低配）', value: 'base' },
  { label: 'small（低配推荐）', value: 'small' },
  { label: 'medium（均衡）', value: 'medium' },
  { label: 'large-v3-turbo（高精度）', value: 'large-v3-turbo' },
  { label: 'large-v3（最高精度）', value: 'large-v3' }
]
const asrLanguageItems = [
  { label: '自动检测', value: 'auto' },
  { label: '英语', value: 'en' },
  { label: '日语', value: 'ja' },
  { label: '韩语', value: 'ko' },
  { label: '中文', value: 'zh' },
  { label: '俄语', value: 'ru' },
  { label: '法语', value: 'fr' },
  { label: '泰语', value: 'th' },
  { label: '西班牙语', value: 'es' },
  { label: '德语', value: 'de' },
  { label: '意大利语', value: 'it' },
  { label: '葡萄牙语', value: 'pt' }
]
const asrDeviceItems = [
  { label: '自动', value: 'auto' },
  { label: 'CPU', value: 'cpu' },
  { label: 'CUDA', value: 'cuda' }
]
const asrComputeTypeItems = [
  { label: 'int8（CPU 推荐）', value: 'int8' },
  { label: 'float16（GPU 推荐）', value: 'float16' },
  { label: 'float32', value: 'float32' }
]
const providerTypeItems = [
  { label: 'OpenAI 兼容（推荐）', value: 'openai-compatible' },
  { label: 'Anthropic 原生', value: 'anthropic' },
  { label: 'Gemini 原生', value: 'gemini' }
]
const providerDefaultUrls: Record<string, string> = {
  'openai-compatible': 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com/v1',
  gemini: 'https://generativelanguage.googleapis.com/v1beta'
}
const translationModeItems = [
  { label: '非流式（推荐）', value: 'non_stream' },
  { label: '流式（兼容性较弱）', value: 'stream' }
]
if (config.value) {
  if (config.value.chunkSize) config.value.chunkSize = Number(config.value.chunkSize)
  if (config.value.concurrency) config.value.concurrency = Number(config.value.concurrency)
  if (config.value.maxRetries) config.value.maxRetries = Number(config.value.maxRetries)
  if (config.value.logRetentionDays) config.value.logRetentionDays = Number(config.value.logRetentionDays)
  if (!config.value.providerType) config.value.providerType = 'openai-compatible'
  if (config.value.asrEnabled === undefined) config.value.asrEnabled = false
  if (!config.value.asrBaseUrl) config.value.asrBaseUrl = 'http://127.0.0.1:8000'
  if (!config.value.asrModel) config.value.asrModel = 'small'
  if (!config.value.asrLanguage) config.value.asrLanguage = 'auto'
  if (!config.value.asrDevice) config.value.asrDevice = 'auto'
  if (!config.value.asrComputeType) config.value.asrComputeType = 'int8'
  if (config.value.asrVad === undefined) config.value.asrVad = true
  if (config.value.asrWordTimestamps === undefined) config.value.asrWordTimestamps = true
  if (config.value.asrKeepAudio === undefined) config.value.asrKeepAudio = false
  if (!config.value.asrEngine) config.value.asrEngine = 'auto'
  if (!config.value.asrPreprocess) config.value.asrPreprocess = 'off'
  if (config.value.asrDiarization === undefined) config.value.asrDiarization = false
  if (config.value.asrCloudEnabled === undefined) config.value.asrCloudEnabled = false
  if (!config.value.asrCloudBaseUrl) config.value.asrCloudBaseUrl = 'https://api.openai.com/v1'
  if (!config.value.asrCloudModel) config.value.asrCloudModel = 'whisper-1'
  if (config.value.asrCloudFallback === undefined) config.value.asrCloudFallback = true
  if (config.value.embyCompatibleOutput === undefined) config.value.embyCompatibleOutput = false
  if (config.value.qualityCheckEnabled === undefined) config.value.qualityCheckEnabled = false
  if (!config.value.qualityCheckModel) config.value.qualityCheckModel = ''
  if (config.value.qualityScoreThreshold === undefined) config.value.qualityScoreThreshold = 0.7
  if (config.value.qualityCheckMaxEntries === undefined) config.value.qualityCheckMaxEntries = 200
  if (config.value.ocrEnabled === undefined) config.value.ocrEnabled = false
  if (!config.value.ocrBaseUrl) config.value.ocrBaseUrl = 'http://127.0.0.1:8001'
  if (!config.value.ocrLanguage) config.value.ocrLanguage = 'en'
  if (config.value.ocrApiKey === undefined) config.value.ocrApiKey = ''
  if (!config.value.translationMode) config.value.translationMode = 'non_stream'
  if (config.value.streamUsage === undefined) config.value.streamUsage = false
}

const initialSnapshot = ref('')
const glossaryRows = ref<Array<{ key: string, value: string }>>([])
const modelItems = ref<any[]>([])
const useManualModelInput = ref(false)
const fetchingModels = ref(false)
const modelError = ref('')
const MODEL_INPUT_MODE_KEY = 'subx:settings:model-input-mode'
const qualityThresholdPercent = computed({
  get: () => Math.round(Number(config.value?.qualityScoreThreshold ?? 0.7) * 100),
  set: (value: number) => { config.value.qualityScoreThreshold = Math.min(1, Math.max(0, Number(value || 0) / 100)) }
})
const isInsecure = computed(() => {
  if (!import.meta.client) return false
  return window.location.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(window.location.hostname)
})

function buildConfigSnapshot(value: any) {
  return JSON.stringify({
    apiBaseUrl: String(value?.apiBaseUrl || ''),
    providerType: String(value?.providerType || 'openai-compatible'),
    asrEnabled: !!value?.asrEnabled,
    asrBaseUrl: String(value?.asrBaseUrl || ''),
    asrApiKey: String(value?.asrApiKey || ''),
    asrModel: String(value?.asrModel || 'small'),
    asrLanguage: String(value?.asrLanguage || 'auto'),
    asrDevice: String(value?.asrDevice || 'auto'),
    asrComputeType: String(value?.asrComputeType || 'int8'),
    asrVad: value?.asrVad !== false,
    asrWordTimestamps: value?.asrWordTimestamps !== false,
    asrKeepAudio: !!value?.asrKeepAudio,
    asrEngine: String(value?.asrEngine || 'auto'),
    asrPreprocess: String(value?.asrPreprocess || 'off'),
    asrDiarization: !!value?.asrDiarization,
    asrCloudEnabled: !!value?.asrCloudEnabled,
    asrCloudBaseUrl: String(value?.asrCloudBaseUrl || ''),
    asrCloudApiKey: String(value?.asrCloudApiKey || ''),
    asrCloudModel: String(value?.asrCloudModel || ''),
    asrCloudFallback: value?.asrCloudFallback !== false,
    ocrEnabled: !!value?.ocrEnabled,
    ocrBaseUrl: String(value?.ocrBaseUrl || ''),
    ocrLanguage: String(value?.ocrLanguage || 'en'),
    ocrApiKey: String(value?.ocrApiKey || ''),
    defaultModel: String(value?.defaultModel || ''),
    targetLanguage: String(value?.targetLanguage || ''),
    outputMode: String(value?.outputMode || ''),
    stylePreset: String(value?.stylePreset || ''),
    subtitleFormat: String(value?.subtitleFormat || ''),
    subtitleStylePreset: String(value?.subtitleStylePreset || ''),
    bilingualLayout: String(value?.bilingualLayout || ''),
    embyCompatibleOutput: !!value?.embyCompatibleOutput,
    qualityCheckEnabled: !!value?.qualityCheckEnabled,
    qualityCheckModel: String(value?.qualityCheckModel || ''),
    qualityScoreThreshold: Number(value?.qualityScoreThreshold ?? 0.7),
    qualityCheckMaxEntries: Number(value?.qualityCheckMaxEntries || 200),
    chunkSize: Number(value?.chunkSize || 0),
    concurrency: Number(value?.concurrency || 0),
    maxRetries: Number(value?.maxRetries || 0),
    logRetentionDays: Number(value?.logRetentionDays || 0),
    translationMode: String(value?.translationMode || 'non_stream'),
    streamUsage: !!value?.streamUsage,
    glossary: value?.glossary || {},
    customStylePresets: value?.customStylePresets || []
  })
}

const currentSnapshot = computed(() => buildConfigSnapshot(config.value))
const hasUnsavedChanges = computed(() => initialSnapshot.value !== '' && currentSnapshot.value !== initialSnapshot.value)

function addCustomStyle() {
  if (!Array.isArray(config.value.customStylePresets)) config.value.customStylePresets = []
  config.value.customStylePresets.push({
    id: `custom-${Date.now()}`,
    name: '自定义风格',
    icon: 'i-lucide-wand-sparkles',
    description: '',
    prompt: ''
  })
}

function removeCustomStyle(index: number) {
  config.value.customStylePresets?.splice(index, 1)
}

function syncGlossaryFromConfig() {
  const glossary = config.value?.glossary || {}
  glossaryRows.value = Object.entries(glossary).map(([key, value]) => ({ key, value: String(value) }))
}

function addGlossaryRow() {
  glossaryRows.value.push({ key: '', value: '' })
}

function removeGlossaryRow(index: number) {
  glossaryRows.value.splice(index, 1)
}

watch(glossaryRows, (rows) => {
  const glossary: Record<string, string> = {}
  for (const row of rows) {
    const key = row.key.trim()
    if (key) glossary[key] = row.value
  }
  config.value.glossary = glossary
}, { deep: true })

onMounted(() => {
  const requestedTab = String(route.query.tab || '')
  if (['ai', 'asr', 'defaults', 'styles', 'glossary', 'advanced'].includes(requestedTab)) {
    activeTab.value = requestedTab as any
  }
  if (!Array.isArray(config.value.customStylePresets)) config.value.customStylePresets = []
  syncGlossaryFromConfig()
  loadAsrMetrics()
  const savedMode = localStorage.getItem(MODEL_INPUT_MODE_KEY)
  if (savedMode === 'manual') useManualModelInput.value = true
  initialSnapshot.value = currentSnapshot.value

  if (!useManualModelInput.value && config.value?.apiKey?.trim()) {
    tryFetchModels()
  }
})

watch(() => config.value.providerType, (type, previous) => {
  if (!type || type === previous) return
  const current = String(config.value.apiBaseUrl || '').trim()
  const knownDefaults = Object.values(providerDefaultUrls)
  if (!current || knownDefaults.includes(current)) {
    config.value.apiBaseUrl = providerDefaultUrls[type] || current
  }
})

watch(() => config.value.translationMode, (val) => {
  if (val !== 'stream') {
    config.value.streamUsage = false
  }
})

watch(useManualModelInput, (val) => {
  if (!import.meta.client) return
  localStorage.setItem(MODEL_INPUT_MODE_KEY, val ? 'manual' : 'select')

  if (!val && !modelItems.value.length && config.value?.apiKey?.trim()) {
    tryFetchModels()
  }
})

async function tryFetchModels() {
  const apiKey = config.value?.apiKey?.trim()
  const baseURL = config.value?.apiBaseUrl?.trim() || 'https://api.openai.com/v1'
  if (!apiKey) return

  fetchingModels.value = true
  modelError.value = ''
  try {
    const res = await $fetch('/api/model-list', { method: 'POST', body: { apiKey, baseURL, providerType: config.value?.providerType || 'openai-compatible' } })
    modelItems.value = res.models.map((m: any) => ({ label: m.id.startsWith('models/') ? m.id.replace('models/', '') : m.id, value: m.id }))
  } catch (e: any) {
    const detail = e?.data?.message || e?.message || ''
    modelError.value = '无法获取模型列表' + (detail ? '：' + detail : '，请检查密钥和地址是否正确')
    modelItems.value = []
  } finally {
    fetchingModels.value = false
  }
}

function applyProviderGuide(payload: { apiBaseUrl?: string, defaultModel?: string, useManualModelInput?: boolean, providerType?: 'openai-compatible' | 'anthropic' | 'gemini' }) {
  if (payload.apiBaseUrl) config.value.apiBaseUrl = payload.apiBaseUrl
  if (payload.defaultModel) config.value.defaultModel = payload.defaultModel
  if (payload.providerType) config.value.providerType = payload.providerType
  if (typeof payload.useManualModelInput === 'boolean') {
    useManualModelInput.value = payload.useManualModelInput
  }

  if (!payload.useManualModelInput && config.value?.apiKey?.trim()) {
    tryFetchModels()
  }
}

function applyAsrPreset(preset: { label: string, model: string, device: string, computeType: string }) {
  config.value.asrEnabled = true
  config.value.asrModel = preset.model
  config.value.asrDevice = preset.device
  config.value.asrComputeType = preset.computeType
  toast.add({ title: '已应用 ASR 预设', description: `${preset.label} · ${preset.model} / ${preset.device} / ${preset.computeType}`, color: 'success' })
}

async function loadAsrMetrics() {
  asrMetricsLoading.value = true
  try {
    asrMetrics.value = await $fetch('/api/asr/metrics')
  } catch {
    asrMetrics.value = null
  } finally {
    asrMetricsLoading.value = false
  }
}

async function testAsr() {
  testingAsr.value = true
  try {
    const result: any = await $fetch('/api/asr/status')
    if (result?.ok) {
      toast.add({ title: 'ASR 服务正常', description: `引擎：${result.data?.engine || '-'} · 模型：${result.data?.model || '-'} · 设备：${result.data?.device || '-'}`, color: 'success' })
    } else {
      toast.add({ title: 'ASR 服务不可用', description: result?.message || `HTTP ${result?.status || '-'}`, color: 'error' })
    }
  } catch (e: any) {
    toast.add({ title: 'ASR 检测失败', description: e?.data?.message || e?.message || '无法连接 ASR 服务', color: 'error' })
  } finally {
    testingAsr.value = false
  }
}

function handleClose() {
  if (hasUnsavedChanges.value) {
    closeConfirmOpen.value = true
    return
  }
  emit('close')
}

function confirmCloseWithoutSaving() {
  closeConfirmOpen.value = false
  emit('close')
}

async function save() {
  pending.value = true
  try {
    await $fetch('/api/config', { method: 'PUT', body: { ...config.value } })
    // 清掉 Nuxt useFetch 的共享缓存，避免返回首页后仍拿到旧的 ASR/OCR 开关。
    clearNuxtData('/api/config')
    toast.add({ title: '保存成功', description: '设置已保存', color: 'success' })
    initialSnapshot.value = currentSnapshot.value
    emit('saved')
  } catch (e: any) {
    toast.add({ title: '保存失败', description: e?.data?.message || e?.message || '无法保存设置，请检查登录状态', color: 'error' })
  } finally {
    pending.value = false
  }
}
</script>
