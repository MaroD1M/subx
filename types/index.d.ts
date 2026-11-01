/** 字幕条目 */
export interface SubtitleEntry {
  id: string
  startTime: string      // "00:00:01,000"
  endTime: string        // "00:00:03,500"
  text: string           // 原文（可能包含格式占位符）
  translatedText?: string // 译文
  reviewStatus?: 'translated' | 'accepted_same' | 'needs_review' | 'fallback_original' | 'missing' | 'edited'
  reviewReasons?: string[]
  prefixTag?: string     // 前导定位/样式标签，如 {\an8}
  formattingTokens?: Array<{ placeholder: string, value: string }> // 行内格式标记占位信息
  asrConfidence?: number    // ASR 置信度（0-1）
  qualityScore?: number     // 双模型质量评分（0-1）
  qualityIssues?: string[]  // 质量校验问题标签
}

/** 翻译分块 */
export interface TranslationChunk {
  chunkIndex: number
  entries: SubtitleEntry[]
  status: 'pending' | 'translating' | 'completed' | 'failed'
  retryCount: number
}

export interface CustomStylePreset {
  id: string
  name: string
  icon?: string
  description?: string
  prompt: string
}

export interface MediaRoot {
  id: string
  name: string
  path: string
  enabled?: boolean
  order?: number
  isDefault?: boolean
}

/** 翻译任务 */
export interface TranslationTask {
  taskId: string
  filePath: string             // 源文件路径
  rootId?: string              // 媒体库 ID
  rootName?: string            // 媒体库名称
  sourceType: 'auto' | 'embedded' | 'external' | 'asr' | 'ocr'  // 自动 / 内嵌字幕 / 外挂字幕 / 语音识别 / 图像字幕 OCR
  trackIndex?: number          // 内嵌字幕轨道或音频轨道索引
  sourceLanguage?: string      // ASR 检测或指定的源语言
  sourceSubtitlePath?: string  // 自动选择的外挂字幕路径
  asrRunId?: number            // 语音识别运行记录
  asrConfidence?: number       // 平均置信度
  origin?: 'manual' | 'automation' // 任务来源
  watchEventId?: number        // 自动任务关联的监控事件
  model: string                // 使用的模型
  targetLanguage: string       // 目标语言（如 zh-CN）
  outputMode: 'translated' | 'bilingual' | 'original' // 纯译文 / 双语 / 仅导出原字幕
  stylePreset: string              // 翻译风格预设 ID
  stylePrompt?: string             // 任务创建时的风格 Prompt 快照
  contentTitle?: string            // 片名/剧集名
  contentBackground?: string       // 剧情背景
  customInstructions?: string      // 额外翻译要求
  translationMode?: 'non_stream' | 'stream' // 翻译模式
  subtitleFormat?: 'srt' | 'ass' | 'both'
  subtitleStylePreset?: string
  bilingualLayout?: 'translated_first' | 'original_first'
  forceRetranslate?: boolean
  status: TaskStatus
  progress: number             // 0-100
  totalChunks: number
  completedChunks: number
  createdAt: string            // ISO 8601
  updatedAt: string
  error?: string
  outputPath?: string          // 输出文件路径
}

/** 任务状态枚举 */
export type TaskStatus =
  | 'queued'
  | 'probing'
  | 'extracting'
  | 'extracting_audio'
  | 'transcribing'
  | 'ocr'
  | 'parsing'
  | 'translating'
  | 'exporting'
  | 'review'
  | 'done'
  | 'error'
  | 'cancelled'

/** 应用配置 */
export interface AppConfig {
  apiKey: string               // 加密存储
  apiBaseUrl: string           // 支持自定义 Base URL
  providerType?: 'openai-compatible' | 'anthropic' | 'gemini' // Provider 协议类型
  defaultModel: string         // 默认模型
  targetLanguage: string       // 默认目标语言
  chunkSize: number            // 分块大小（Token或行数）
  concurrency: number          // 并发数
  maxRetries: number           // 最大重试次数
  translationMode?: 'non_stream' | 'stream' // 默认非流式，流式为兼容性较弱的可选项
  glossary: Record<string, string>  // 术语表
  mediaRoots?: MediaRoot[]     // 媒体库配置
  customStylePresets?: CustomStylePreset[] // 用户自定义翻译风格
  asrEnabled?: boolean         // 是否启用语音识别
  asrBaseUrl?: string          // ASR 服务地址（内置或 sidecar）
  asrApiKey?: string           // 可选 ASR API Key
  asrModel?: string            // ASR 模型
  asrLanguage?: string         // auto 或固定源语言
  asrDevice?: string           // auto / cpu / cuda
  asrComputeType?: string      // int8 / float16
  asrVad?: boolean             // 是否启用 VAD
  asrWordTimestamps?: boolean  // 是否请求词级时间轴
  asrKeepAudio?: boolean       // 是否保留临时音频
  asrEngine?: 'auto' | 'faster-whisper' | 'whisper-cpp' | 'cloud'
  asrPreprocess?: 'off' | 'demucs' | 'deepfilternet'
  asrDiarization?: boolean
  asrCloudEnabled?: boolean
  asrCloudBaseUrl?: string
  asrCloudApiKey?: string
  asrCloudModel?: string
  asrCloudFallback?: boolean
  ocrEnabled?: boolean
  ocrBaseUrl?: string
  ocrLanguage?: string
  ocrApiKey?: string
  automationConcurrency?: number // 自动任务并发上限
  notificationEnabled?: boolean // 是否启用通知
  notificationLowConfidenceThreshold?: number // 低置信度通知阈值
  qualityCheckEnabled?: boolean
  qualityCheckModel?: string
  qualityScoreThreshold?: number
  qualityCheckMaxEntries?: number
  integrationWebhookToken?: string
  integrationPathFrom?: string
  integrationPathTo?: string
  streamUsage?: boolean        // 是否开启流式 Token 统计
  logRetentionDays?: number    // AI 日志保留天数
  outputMode?: string          // 输出模式
  stylePreset?: string         // 翻译风格预设
  subtitleFormat?: string      // 字幕格式 srt/ass/both
  subtitleStylePreset?: string // 字幕样式预设
  bilingualLayout?: string     // 双语排版
  embyCompatibleOutput?: boolean // Emby 主字幕 + SubX/ 变体
}

/** 监控规则 */
export interface WatchRules {
  extensions: string[]
  includeRegex: string
  excludeRegex: string
  minSizeMb: number
  maxSizeMb: number
  minDurationSec: number
  createdAfter: string
  createdBefore: string
  modifiedAfter: string
  modifiedBefore: string
  stableSeconds: number
  skipExistingSubtitles: boolean
  skipExistingOutput: boolean
}

/** 自动任务输出策略 */
export interface WatchOutputPolicy {
  targetLanguage: string
  outputMode: 'translated' | 'bilingual' | 'original'
  stylePreset: string
  subtitleFormat: 'srt' | 'ass' | 'both'
  subtitleStylePreset: string
  bilingualLayout: 'translated_first' | 'original_first'
  sourceType: 'auto' | 'embedded' | 'external' | 'asr'
  model: string
  notifyChannelIds: number[]
}

export interface WatchFolder {
  id: number
  rootId: string
  rootName?: string
  path: string
  enabled: boolean
  recursive: boolean
  mode: 'new' | 'backfill' | 'both'
  rules: WatchRules
  outputPolicy: WatchOutputPolicy
  createdAt?: string
  updatedAt?: string
  pendingEvents?: number
  failedEvents?: number
}

export interface WatchEvent {
  id: number
  folderId: number
  folderName?: string
  path: string
  size: number
  mtime: string
  status: 'pending' | 'queued' | 'processing' | 'done' | 'failed' | 'skipped' | 'ignored'
  taskId?: string
  error?: string
  createdAt: string
  updatedAt: string
}

export type NotificationChannelType = 'telegram' | 'smtp' | 'webhook' | 'ntfy' | 'discord' | 'matrix' | 'wecom'
export type NotificationEvent = 'task_done' | 'task_error' | 'task_cancelled' | 'low_confidence' | 'watch_error' | 'backfill_done' | 'test'

export interface NotificationChannel {
  id: number
  type: NotificationChannelType
  name: string
  config: Record<string, any>
  enabled: boolean
  createdAt?: string
  updatedAt?: string
}

export interface ApiTokenSummary {
  id: number
  name: string
  prefix: string
  scopes: string[]
  expiresAt?: string | null
  lastUsedAt?: string | null
  createdAt: string
  revokedAt?: string | null
}

/** 文件节点 (用于文件浏览器) */
export interface FileNode {
  name: string
  path: string
  isDir: boolean
  children?: FileNode[]
  hasChildren?: boolean
  loaded?: boolean
  rootId?: string
  rootName?: string
}

/** 轨道信息 */
export interface TrackInfo {
  index: number
  codec: string
  language?: string
  title?: string
  isSupported?: boolean
  channels?: number
  sampleRate?: number
  isDefault?: boolean
}

/** SSE 进度更新数据 */
export interface ProgressUpdate {
  step: TaskStatus
  progress: number
  completedChunks?: number
  totalChunks?: number
  currentText?: string
}

declare module 'js-sha256' {
  export function sha256(message: any): string;
  export namespace sha256 {
    export function sha256(message: any): string;
    export function sha224(message: any): string;
  }
}
