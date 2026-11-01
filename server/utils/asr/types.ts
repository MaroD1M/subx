export interface AsrWord {
  start: number
  end: number
  word: string
  probability?: number
}

export interface AsrSegment {
  id: number
  start: number
  end: number
  text: string
  avgLogprob?: number
  noSpeechProb?: number
  confidence?: number
  words?: AsrWord[]
  speaker?: string
}

export interface AsrResult {
  task?: string
  engine?: string
  model?: string
  device?: string
  computeType?: string
  provider?: string
  preprocess?: string
  preprocessWarning?: string
  language: string
  languageProbability?: number
  duration: number
  elapsed?: number
  rtf?: number
  text: string
  segments: AsrSegment[]
}

export type AsrEngine = 'auto' | 'faster-whisper' | 'whisper-cpp' | 'cloud'

export interface AsrOptions {
  baseUrl: string
  apiKey?: string
  model?: string
  device?: string
  computeType?: string
  language?: string
  vad?: boolean
  wordTimestamps?: boolean
  diarize?: boolean
  engine?: AsrEngine
  preprocess?: 'off' | 'demucs' | 'deepfilternet'
  cloudEnabled?: boolean
  cloudBaseUrl?: string
  cloudApiKey?: string
  cloudModel?: string
  cloudFallback?: boolean
}

export interface AsrPersistedResult {
  runId: number
  confidence: number
}
