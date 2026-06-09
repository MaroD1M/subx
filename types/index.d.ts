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
}

/** 翻译分块 */
export interface TranslationChunk {
  chunkIndex: number
  entries: SubtitleEntry[]
  status: 'pending' | 'translating' | 'completed' | 'failed'
  retryCount: number
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
  sourceType: 'embedded' | 'external'  // 内嵌字幕 or 外挂字幕
  trackIndex?: number          // 内嵌字幕轨道索引
  model: string                // 使用的模型
  targetLanguage: string       // 目标语言（如 zh-CN）
  outputMode: 'translated' | 'bilingual' | 'original' // 纯译文 / 双语 / 仅导出原字幕
  stylePreset: string              // 翻译风格预设 ID
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
  | 'extracting'
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
  defaultModel: string         // 默认模型
  targetLanguage: string       // 默认目标语言
  chunkSize: number            // 分块大小（Token或行数）
  concurrency: number          // 并发数
  maxRetries: number           // 最大重试次数
  translationMode?: 'non_stream' | 'stream' // 默认非流式，流式为兼容性较弱的可选项
  translationStrategy?: 'balanced' | 'efficient'
  glossary: Record<string, string>  // 术语表
  mediaRoots?: MediaRoot[]     // 媒体库配置
  streamUsage?: boolean        // 是否开启流式 Token 统计
  logRetentionDays?: number    // AI 日志保留天数
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
