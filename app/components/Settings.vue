<template>
  <div class="space-y-4">
    <div class="space-y-4">
      <AppSubNav v-model="activeTab" :items="settingsTabs" label="设置分区" />

      <div class="min-w-0 space-y-4">
        <div v-show="activeTab === 'ai'" class="space-y-4">
          <SettingsAiSection
            :config="config"
            :provider-type-items="providerTypeItems"
            :model-items="modelItems"
            :use-manual-model-input="useManualModelInput"
            :fetching-models="fetchingModels"
            :model-error="modelError"
            :is-insecure="isInsecure"
            @update:config="applyConfigPatch"
            @update:use-manual-model-input="useManualModelInput = $event"
            @fetch-models="tryFetchModels"
            @open-guide="isGuideOpen = true"
          />
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

              <div class="rounded-2xl border border-gray-200/80 p-3 dark:border-gray-800 space-y-3">
                <div>
                  <p class="text-sm font-medium text-gray-700 dark:text-gray-300">长任务超时</p>
                  <p class="text-xs leading-5 text-gray-500 dark:text-gray-400">作用于新任务。低配 NAS 或超长视频可适当调大，但不要无限放大，避免任务卡死后长期占用资源。</p>
                </div>
                <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <UFormField label="音频上传超时（分钟）">
                    <UInput v-model="asrUploadTimeoutMinutes" type="number" min="1" max="1440" class="w-full" />
                    <p class="mt-1 text-[11px] leading-5 text-gray-500 dark:text-gray-400">音频上传或创建 ASR 任务的最长等待时间。网络慢或文件很大时可调大。</p>
                  </UFormField>
                  <UFormField label="状态请求超时（秒）">
                    <UInput v-model="asrPollTimeoutSeconds" type="number" min="1" max="60" class="w-full" />
                    <p class="mt-1 text-[11px] leading-5 text-gray-500 dark:text-gray-400">单次查询识别进度的最长等待时间。一般保持 30 秒即可。</p>
                  </UFormField>
                  <UFormField label="无进度超时（分钟）">
                    <UInput v-model="asrJobIdleTimeoutMinutes" type="number" min="1" max="1440" class="w-full" />
                    <p class="mt-1 text-[11px] leading-5 text-gray-500 dark:text-gray-400">连续这么久没有进度或阶段变化才判定卡死。排队等待不会触发。</p>
                  </UFormField>
                  <UFormField label="总任务上限（小时）">
                    <UInput v-model="asrJobAbsoluteTimeoutHours" type="number" min="1" max="168" class="w-full" />
                    <p class="mt-1 text-[11px] leading-5 text-gray-500 dark:text-gray-400">单个 ASR 任务的绝对最长执行时间，到时一定中止并取消远端任务。</p>
                  </UFormField>
                </div>
              </div>

              <div class="rounded-2xl border border-gray-200/80 p-3 dark:border-gray-800 space-y-3">
                <div>
                  <p class="text-sm font-medium text-gray-700 dark:text-gray-300">分段与断点</p>
                  <p class="text-xs leading-5 text-gray-500 dark:text-gray-400">长视频会按分段识别；暂停、失败或容器重启后可从已完成分段继续。</p>
                </div>
                <div class="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <UFormField label="分段时长（分钟）">
                    <UInput v-model="asrChunkMinutes" type="number" min="1" max="60" class="w-full" />
                    <p class="mt-1 text-[11px] leading-5 text-gray-500 dark:text-gray-400">越短暂停生效越快，但 ASR 调用次数更多。</p>
                  </UFormField>
                  <UFormField label="分段重叠（秒）">
                    <UInput v-model.number="config.asrChunkOverlapSeconds" type="number" min="0" max="30" class="w-full" />
                    <p class="mt-1 text-[11px] leading-5 text-gray-500 dark:text-gray-400">用于减少分段边界切断句子；合并时会去重。</p>
                  </UFormField>
                  <UFormField label="检查点保留（小时）">
                    <UInput v-model.number="config.asrResumeTtlHours" type="number" min="1" max="8760" class="w-full" />
                    <p class="mt-1 text-[11px] leading-5 text-gray-500 dark:text-gray-400">暂停或失败后保留已完成分段的时间。</p>
                  </UFormField>
                </div>
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

        <div v-show="activeTab === 'ocr'" class="space-y-4">
          <SettingsSection title="图像字幕 OCR" description="把 PGS / VobSub / DVD 图像字幕转换为文本。OCR 与语音识别是并列的字幕来源。">
            <template #actions>
              <UButton label="检测服务" size="xs" color="neutral" variant="soft" :loading="testingOcr" @click="testOcr" />
            </template>

            <div class="space-y-4">
              <div class="flex items-center justify-between gap-3 rounded-xl border border-gray-100 bg-gray-50/70 p-3 dark:border-gray-800 dark:bg-gray-900/40">
                <div class="space-y-0.5">
                  <p class="text-sm font-medium text-gray-700 dark:text-gray-300">启用图像字幕 OCR</p>
                  <p class="text-xs leading-5 text-gray-500 dark:text-gray-400">PGS / VobSub / DVD 图像字幕。没有文本字幕时优先 OCR，再回退 ASR。</p>
                </div>
                <USwitch v-model="config.ocrEnabled" aria-label="启用图像字幕 OCR" />
              </div>

              <div v-if="config.ocrEnabled" class="space-y-4">
                <UFormField label="OCR 服务地址">
                  <div class="flex gap-2">
                    <UInput v-model="config.ocrBaseUrl" placeholder="http://127.0.0.1:8001" class="w-full" />
                    <UButton label="使用内置" size="sm" color="neutral" variant="soft" @click="config.ocrBaseUrl = 'http://127.0.0.1:8001'" />
                  </div>
                  <p class="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">单镜像默认地址 <code>http://127.0.0.1:8001</code>；拆分部署时改用 <code>http://subx-ocr:8000</code>。</p>
                </UFormField>

                <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <UFormField label="OCR 语言">
                    <USelect v-model="config.ocrLanguage" :items="ocrLanguageItems" class="w-full" />
                  </UFormField>
                  <UFormField label="OCR 引擎">
                    <USelect v-model="config.ocrEngine" :items="ocrEngineItems" class="w-full" />
                  </UFormField>
                </div>

                <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <UFormField label="OCR API Key（可选）">
                    <UInput v-model="config.ocrApiKey" type="password" placeholder="与 OCR_API_KEY 一致" class="w-full" />
                  </UFormField>
                  <UFormField label="低置信度提示阈值">
                    <div class="flex items-center gap-2">
                      <UInput
                        :model-value="config.ocrMinConfidence"
                        type="number"
                        min="0"
                        max="100"
                        class="w-full"
                        @update:model-value="config.ocrMinConfidence = Math.max(0, Math.min(100, Number($event) || 0))"
                      />
                      <span class="text-sm text-gray-500">%</span>
                    </div>
                    <p class="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">低于该值的结果会保留并进入核对，不再静默丢弃。</p>
                  </UFormField>
                </div>

                <div class="rounded-2xl border border-gray-200/80 p-3 dark:border-gray-800 space-y-3">
                  <div>
                    <p class="text-sm font-medium text-gray-700 dark:text-gray-300">长视频与超时</p>
                    <p class="text-xs leading-5 text-gray-500 dark:text-gray-400">PGS 直接交给 pgsrip；VobSub/DVD 超过分段时长会自动分段处理，并保留断点供重试复用。</p>
                  </div>
                  <div class="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <UFormField label="最大视频时长（小时）">
                      <UInputNumber v-model="ocrMaxHours" :min="0.1" :max="24" :step="0.5" class="w-full" />
                    </UFormField>
                    <UFormField label="分段时长（分钟）">
                      <UInputNumber v-model="ocrChunkMinutes" :min="5" :max="240" :step="5" class="w-full" />
                    </UFormField>
                    <UFormField label="无进度超时（分钟）">
                      <UInputNumber v-model="ocrJobIdleTimeoutMinutes" :min="1" :max="1440" :step="1" class="w-full" />
                    </UFormField>
                    <UFormField label="总任务上限（小时）">
                      <UInputNumber v-model="ocrJobAbsoluteTimeoutHours" :min="1" :max="168" :step="1" class="w-full" />
                    </UFormField>
                  </div>
                  <div class="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <UFormField label="PGS 识别超时（分钟）">
                      <UInputNumber v-model="ocrPgsripTimeoutMinutes" :min="5" :max="1440" :step="5" class="w-full" />
                    </UFormField>
                    <UFormField label="单段抽帧超时（分钟）">
                      <UInputNumber v-model="ocrFfmpegTimeoutMinutes" :min="1" :max="1440" :step="1" class="w-full" />
                    </UFormField>
                    <UFormField label="单段重试次数">
                      <UInputNumber v-model="config.ocrChunkRetries" :min="0" :max="5" :step="1" class="w-full" />
                    </UFormField>
                    <UFormField label="断点保留（小时）">
                      <UInputNumber v-model="config.ocrResumeTtlHours" :min="1" :max="168" :step="1" class="w-full" />
                    </UFormField>
                  </div>
                  <p class="text-[11px] leading-5 text-gray-500 dark:text-gray-400">默认最大视频时长 4 小时、30 分钟一段。调大后请留意 <code>temp/ocr</code> 磁盘占用；明显超过总任务上限时会在 OCR 开始前明确报错。</p>
                </div>

                <div class="rounded-xl border border-sky-100 bg-sky-50/70 p-3 text-xs leading-5 text-sky-800 dark:border-sky-900/40 dark:bg-sky-950/20 dark:text-sky-200">
                  <p class="font-medium">PGS / Blu-ray</p>
                  <p>优先使用 pgsrip 按字幕 cue 识别，长电影不强制整片抽帧；结果为空或明显不完整时自动回退到字幕图像 OCR。</p>
                  <p class="mt-2 font-medium">VobSub / DVD</p>
                  <p>直接渲染字幕轨并按字幕区域裁剪、放大、二值化后识别。长视频会分段处理，每段完成后立即清理帧文件。</p>
                </div>
              </div>

              <p class="text-[11px] leading-5 text-gray-500 dark:text-gray-400">OCR 不需要下载独立模型。单镜像已内置 Tesseract 语言包与 RapidOCR；引擎选择只影响本机识别质量与速度。</p>
            </div>
          </SettingsSection>
        </div>

        <div v-show="activeTab === 'defaults'" class="space-y-4">
          <SettingsDefaultSection
            :config="config"
            :language-options="LANGUAGE_OPTIONS"
            :output-mode-items="outputModeItems"
            :translation-mode-items="translationModeItems"
            :quality-threshold-percent="qualityThresholdPercent"
            @update:config="applyConfigPatch"
            @update:quality-threshold-percent="applyQualityThresholdPercent"
          />
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
          <SettingsAdvancedSection :config="config" @update:config="applyConfigPatch" />
        </div>

        <div v-if="activeTab === 'storage'" class="space-y-4">
          <SettingsStoragePanel />
          <SettingsBackupPanel :config="config" @update:config="applyConfigPatch" />
        </div>

        <div v-if="activeTab === 'health'" class="space-y-4">
          <SettingsHealthPanel />
        </div>
      </div>
    </div>

    <AppStickyBar>
      <template #info>
        <p v-if="hasUnsavedChanges" class="text-xs font-medium text-amber-600 dark:text-amber-400">有未保存的更改</p>
        <p v-else class="text-xs text-gray-500 dark:text-gray-400">设置修改后需要保存才会生效。</p>
      </template>
      <template #actions>
        <UButton label="取消" color="neutral" variant="ghost" @click="handleClose" />
        <UButton label="保存修改" color="primary" :loading="pending" :disabled="!hasUnsavedChanges" @click="save" />
      </template>
    </AppStickyBar>

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
import { normalizeSubtitleStyle } from '~~/shared/subtitleStyles'
import SettingsAiSection from './SettingsAiSection.vue'
import SettingsDefaultSection from './SettingsDefaultSection.vue'
import SettingsAdvancedSection from './SettingsAdvancedSection.vue'
import SettingsBackupPanel from './SettingsBackupPanel.vue'
import SettingsHealthPanel from './SettingsHealthPanel.vue'

const emit = defineEmits(['close', 'saved', 'dirty'])
const route = useRoute()
const isGuideOpen = ref(false)
const requestedTab = String(route.query.tab || '')
const activeTab = ref<'ai' | 'asr' | 'ocr' | 'defaults' | 'styles' | 'glossary' | 'advanced' | 'storage' | 'health'>(
  ['ai', 'asr', 'ocr', 'defaults', 'styles', 'glossary', 'advanced', 'storage', 'health'].includes(requestedTab)
    ? requestedTab as any
    : 'ai'
)
const settingsTabs = [
  { label: 'AI 连接', icon: 'i-lucide-plug', value: 'ai' as const },
  { label: '语音识别', icon: 'i-lucide-mic', value: 'asr' as const },
  { label: '图像字幕 OCR', icon: 'i-lucide-scan-text', value: 'ocr' as const },
  { label: '翻译默认', icon: 'i-lucide-sliders-horizontal', value: 'defaults' as const },
  { label: '翻译风格', icon: 'i-lucide-wand-sparkles', value: 'styles' as const },
  { label: '术语表', icon: 'i-lucide-book-a', value: 'glossary' as const },
  { label: '高级设置', icon: 'i-lucide-settings-2', value: 'advanced' as const },
  { label: '存储与缓存', icon: 'i-lucide-hard-drive', value: 'storage' as const },
  { label: '系统体检', icon: 'i-lucide-stethoscope', value: 'health' as const }
]
const builtinStylePresets = STYLE_PRESETS
const { data } = await useAppConfigData()
function cloneConfig(value: any) {
  const cloned = value ? JSON.parse(JSON.stringify(value)) : {}
  if (cloned && typeof cloned === 'object') {
    const outputMode = ['translated', 'bilingual', 'original'].includes(String(cloned.outputMode)) ? String(cloned.outputMode) : 'translated'
    cloned.subtitleStyle = normalizeSubtitleStyle(cloned.subtitleStyle || cloned.subtitleStylePreset, outputMode)
    cloned.subtitleStylePreset = cloned.subtitleStyle.presetId
  }
  return cloned
}
const config = ref<any>(cloneConfig(data.value))
const CROSS_PAGE_CONFIG_KEYS = new Set([
  'mediaRoots',
  'automationConcurrency',
  'notificationEnabled',
  'notificationLowConfidenceThreshold',
  'integrationWebhookToken',
  'integrationPathFrom',
  'integrationPathTo'
])
const pending = ref(false)
const testingAsr = ref(false)
const testingOcr = ref(false)
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
const ocrEngineItems = [
  { label: '自动（推荐）', value: 'auto' },
  { label: 'RapidOCR（中英文优先）', value: 'rapidocr' },
  { label: 'Tesseract（兼容性优先）', value: 'tesseract' }
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
  if (config.value.autoBackupEnabled === undefined) config.value.autoBackupEnabled = false
  if (config.value.autoBackupIntervalHours === undefined) config.value.autoBackupIntervalHours = 24
  if (config.value.autoBackupKeep === undefined) config.value.autoBackupKeep = 10
  if (!config.value.providerType) config.value.providerType = 'openai-compatible'
  if (config.value.asrEnabled === undefined) config.value.asrEnabled = false
  if (!config.value.asrBaseUrl) config.value.asrBaseUrl = 'http://127.0.0.1:8000'
  if (!config.value.asrModel) config.value.asrModel = 'small'
  if (!config.value.asrLanguage) config.value.asrLanguage = 'auto'
  if (!config.value.asrDevice) config.value.asrDevice = 'auto'
  if (!config.value.asrComputeType) config.value.asrComputeType = 'int8'
  if (config.value.asrUploadTimeoutMs === undefined) config.value.asrUploadTimeoutMs = 30 * 60 * 1000
  if (config.value.asrPollTimeoutMs === undefined) config.value.asrPollTimeoutMs = 30 * 1000
  if (config.value.asrJobIdleTimeoutMs === undefined) config.value.asrJobIdleTimeoutMs = 30 * 60 * 1000
  if (config.value.asrChunkSeconds === undefined) config.value.asrChunkSeconds = 300
  if (config.value.asrChunkOverlapSeconds === undefined) config.value.asrChunkOverlapSeconds = 2
  if (config.value.asrResumeTtlHours === undefined) config.value.asrResumeTtlHours = 168
  if (config.value.asrJobAbsoluteTimeoutMs === undefined) config.value.asrJobAbsoluteTimeoutMs = 6 * 60 * 60 * 1000
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
  if (!config.value.ocrEngine) config.value.ocrEngine = 'auto'
  if (config.value.ocrMinConfidence === undefined) config.value.ocrMinConfidence = 25
  if (config.value.ocrApiKey === undefined) config.value.ocrApiKey = ''
  if (config.value.ocrMaxSeconds === undefined) config.value.ocrMaxSeconds = 14400
  if (config.value.ocrChunkSeconds === undefined) config.value.ocrChunkSeconds = 1800
  if (config.value.ocrPgsripTimeoutSeconds === undefined) config.value.ocrPgsripTimeoutSeconds = 7200
  if (config.value.ocrFfmpegTimeoutSeconds === undefined) config.value.ocrFfmpegTimeoutSeconds = 3600
  if (config.value.ocrChunkRetries === undefined) config.value.ocrChunkRetries = 1
  if (config.value.ocrResumeTtlHours === undefined) config.value.ocrResumeTtlHours = 24
  if (config.value.ocrJobIdleTimeoutMs === undefined) config.value.ocrJobIdleTimeoutMs = 60 * 60 * 1000
  if (config.value.ocrJobAbsoluteTimeoutMs === undefined) config.value.ocrJobAbsoluteTimeoutMs = 6 * 60 * 60 * 1000
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
const asrUploadTimeoutMinutes = computed({
  get: () => Math.max(1, Math.round(Number(config.value?.asrUploadTimeoutMs ?? 30 * 60 * 1000) / 60000)),
  set: (value: any) => { config.value.asrUploadTimeoutMs = Math.max(1, Math.min(1440, Math.round(Number(value) || 30))) * 60000 }
})
const asrPollTimeoutSeconds = computed({
  get: () => Math.max(1, Math.round(Number(config.value?.asrPollTimeoutMs ?? 30 * 1000) / 1000)),
  set: (value: any) => { config.value.asrPollTimeoutMs = Math.max(1, Math.min(60, Math.round(Number(value) || 30))) * 1000 }
})
const asrJobIdleTimeoutMinutes = computed({
  get: () => Math.max(1, Math.round(Number(config.value?.asrJobIdleTimeoutMs ?? 30 * 60 * 1000) / 60000)),
  set: (value: any) => { config.value.asrJobIdleTimeoutMs = Math.max(1, Math.min(1440, Math.round(Number(value) || 30))) * 60000 }
})
const asrChunkMinutes = computed({
  get: () => Math.max(1, Math.round(Number(config.value?.asrChunkSeconds ?? 300) / 60)),
  set: (value: any) => { config.value.asrChunkSeconds = Math.max(1, Math.min(60, Math.round(Number(value) || 5))) * 60 }
})
const asrJobAbsoluteTimeoutHours = computed({
  get: () => Math.max(1, Math.round(Number(config.value?.asrJobAbsoluteTimeoutMs ?? 6 * 60 * 60 * 1000) / 3600000)),
  set: (value: any) => { config.value.asrJobAbsoluteTimeoutMs = Math.max(1, Math.min(168, Math.round(Number(value) || 6))) * 3600000 }
})

const ocrMaxHours = computed({
  get: () => Math.max(0.1, Number((Number(config.value?.ocrMaxSeconds ?? 14400) / 3600).toFixed(2))),
  set: (value: any) => {
    const hours = Math.max(0.1, Math.min(24, Number(value) || 4))
    config.value.ocrMaxSeconds = Math.max(300, Math.round(hours * 3600))
  }
})
const ocrChunkMinutes = computed({
  get: () => Math.max(5, Math.round(Number(config.value?.ocrChunkSeconds ?? 1800) / 60)),
  set: (value: any) => { config.value.ocrChunkSeconds = Math.max(5, Math.min(240, Math.round(Number(value) || 30))) * 60 }
})
const ocrPgsripTimeoutMinutes = computed({
  get: () => Math.max(5, Math.round(Number(config.value?.ocrPgsripTimeoutSeconds ?? 7200) / 60)),
  set: (value: any) => { config.value.ocrPgsripTimeoutSeconds = Math.max(5, Math.min(1440, Math.round(Number(value) || 120))) * 60 }
})
const ocrFfmpegTimeoutMinutes = computed({
  get: () => Math.max(1, Math.round(Number(config.value?.ocrFfmpegTimeoutSeconds ?? 3600) / 60)),
  set: (value: any) => { config.value.ocrFfmpegTimeoutSeconds = Math.max(1, Math.min(1440, Math.round(Number(value) || 60))) * 60 }
})
const ocrJobIdleTimeoutMinutes = computed({
  get: () => Math.max(1, Math.round(Number(config.value?.ocrJobIdleTimeoutMs ?? 60 * 60 * 1000) / 60000)),
  set: (value: any) => { config.value.ocrJobIdleTimeoutMs = Math.max(1, Math.min(1440, Math.round(Number(value) || 60))) * 60000 }
})
const ocrJobAbsoluteTimeoutHours = computed({
  get: () => Math.max(1, Math.round(Number(config.value?.ocrJobAbsoluteTimeoutMs ?? 6 * 60 * 60 * 1000) / 3600000)),
  set: (value: any) => { config.value.ocrJobAbsoluteTimeoutMs = Math.max(1, Math.min(168, Math.round(Number(value) || 6))) * 3600000 }
})

const qualityThresholdPercent = computed({
  get: () => Math.round(Number(config.value?.qualityScoreThreshold ?? 0.7) * 100),
  set: (value: number) => { config.value.qualityScoreThreshold = Math.min(1, Math.max(0, Number(value || 0) / 100)) }
})

function applyConfigPatch(patch: Record<string, any>) {
  Object.assign(config.value, patch)
}

function applyQualityThresholdPercent(value: any) {
  qualityThresholdPercent.value = value
}
const isInsecure = computed(() => {
  if (!import.meta.client) return false
  return window.location.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(window.location.hostname)
})

function buildConfigSnapshot(value: any) {
  return JSON.stringify({
    apiKey: String(value?.apiKey || ''),
    apiBaseUrl: String(value?.apiBaseUrl || ''),
    providerType: String(value?.providerType || 'openai-compatible'),
    asrEnabled: !!value?.asrEnabled,
    asrBaseUrl: String(value?.asrBaseUrl || ''),
    asrApiKey: String(value?.asrApiKey || ''),
    asrModel: String(value?.asrModel || 'small'),
    asrLanguage: String(value?.asrLanguage || 'auto'),
    asrDevice: String(value?.asrDevice || 'auto'),
    asrComputeType: String(value?.asrComputeType || 'int8'),
    asrUploadTimeoutMs: Number(value?.asrUploadTimeoutMs ?? 30 * 60 * 1000),
    asrPollTimeoutMs: Number(value?.asrPollTimeoutMs ?? 30 * 1000),
    asrJobIdleTimeoutMs: Number(value?.asrJobIdleTimeoutMs ?? 30 * 60 * 1000),
    asrJobAbsoluteTimeoutMs: Number(value?.asrJobAbsoluteTimeoutMs ?? 6 * 60 * 60 * 1000),
    asrChunkSeconds: Number(value?.asrChunkSeconds ?? 300),
    asrChunkOverlapSeconds: Number(value?.asrChunkOverlapSeconds ?? 2),
    asrResumeTtlHours: Number(value?.asrResumeTtlHours ?? 168),
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
    ocrEngine: String(value?.ocrEngine || 'auto'),
    ocrMinConfidence: Number(value?.ocrMinConfidence ?? 25),
    ocrMaxSeconds: Number(value?.ocrMaxSeconds ?? 14400),
    ocrChunkSeconds: Number(value?.ocrChunkSeconds ?? 1800),
    ocrPgsripTimeoutSeconds: Number(value?.ocrPgsripTimeoutSeconds ?? 7200),
    ocrFfmpegTimeoutSeconds: Number(value?.ocrFfmpegTimeoutSeconds ?? 3600),
    ocrChunkRetries: Number(value?.ocrChunkRetries ?? 1),
    ocrResumeTtlHours: Number(value?.ocrResumeTtlHours ?? 24),
    ocrJobIdleTimeoutMs: Number(value?.ocrJobIdleTimeoutMs ?? 60 * 60 * 1000),
    ocrJobAbsoluteTimeoutMs: Number(value?.ocrJobAbsoluteTimeoutMs ?? 6 * 60 * 60 * 1000),
    defaultModel: String(value?.defaultModel || ''),
    targetLanguage: String(value?.targetLanguage || ''),
    outputMode: String(value?.outputMode || ''),
    stylePreset: String(value?.stylePreset || ''),
    subtitleFormat: String(value?.subtitleFormat || ''),
    subtitleStylePreset: String(value?.subtitleStylePreset || ''),
    subtitleStyle: value?.subtitleStyle || null,
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
    autoBackupEnabled: !!value?.autoBackupEnabled,
    autoBackupIntervalHours: Number(value?.autoBackupIntervalHours ?? 24),
    autoBackupKeep: Number(value?.autoBackupKeep ?? 10),
    translationMode: String(value?.translationMode || 'non_stream'),
    streamUsage: !!value?.streamUsage,
    glossary: value?.glossary || {},
    customStylePresets: value?.customStylePresets || []
  })
}

const currentSnapshot = computed(() => buildConfigSnapshot(config.value))
const hasUnsavedChanges = computed(() => initialSnapshot.value !== '' && currentSnapshot.value !== initialSnapshot.value)

watch(hasUnsavedChanges, value => emit('dirty', value), { immediate: true })

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
  if (!Array.isArray(config.value.customStylePresets)) config.value.customStylePresets = []
  syncGlossaryFromConfig()
  loadAsrMetrics()
  const savedMode = localStorage.getItem(MODEL_INPUT_MODE_KEY)
  if (savedMode === 'manual') useManualModelInput.value = true
  initialSnapshot.value = currentSnapshot.value

  if (!useManualModelInput.value && config.value?.apiKey?.trim() && !config.value.apiKey.includes('*')) {
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

  if (!val && !modelItems.value.length && config.value?.apiKey?.trim() && !config.value.apiKey.includes('*')) {
    tryFetchModels()
  }
})

async function tryFetchModels() {
  const apiKey = config.value?.apiKey?.trim()
  const baseURL = config.value?.apiBaseUrl?.trim() || 'https://api.openai.com/v1'
  if (!apiKey || apiKey.includes('*')) return

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

async function testOcr() {
  testingOcr.value = true
  try {
    const result: any = await $fetch('/api/ocr/status')
    if (result?.ok) {
      const engines = result.data?.engines || {}
      const available = Object.entries(engines).filter(([, value]) => value).map(([name]) => name)
      const maxHours = Number(result.data?.maxSeconds || 0) > 0 ? (Number(result.data.maxSeconds) / 3600).toFixed(1) : '-'
      const chunkMinutes = Number(result.data?.chunkSeconds || 0) > 0 ? Math.round(Number(result.data.chunkSeconds) / 60) : '-'
      toast.add({ title: 'OCR 服务正常', description: `引擎：${available.join(' / ') || '-'} · 语言：${result.data?.language || '-'} · 并发：${result.data?.workers || '-'} · 服务默认上限：${maxHours}h · 分段：${chunkMinutes}min`, color: 'success' })
    } else {
      toast.add({ title: 'OCR 服务不可用', description: result?.message || `HTTP ${result?.status || '-'}`, color: 'error' })
    }
  } catch (e: any) {
    toast.add({ title: 'OCR 检测失败', description: e?.data?.message || e?.message || '无法连接 OCR 服务', color: 'error' })
  } finally {
    testingOcr.value = false
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
    const payload = Object.fromEntries(
      Object.entries(config.value).filter(([key]) => !CROSS_PAGE_CONFIG_KEYS.has(key))
    )
    await $fetch('/api/config', { method: 'PUT', body: payload })
    clearNuxtData('app:config')
    const fresh = await $fetch<any>('/api/config')
    config.value = cloneConfig(fresh)
    syncGlossaryFromConfig()
    initialSnapshot.value = currentSnapshot.value
    toast.add({ title: '保存成功', description: '设置已保存', color: 'success' })
    emit('saved')
  } catch (e: any) {
    toast.add({ title: '保存失败', description: e?.data?.message || e?.message || '无法保存设置，请检查登录状态', color: 'error' })
  } finally {
    pending.value = false
  }
}
</script>
