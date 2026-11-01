export interface AutomationTemplate {
  id: string
  name: string
  description: string
  mode?: 'new' | 'backfill' | 'both'
  recursive?: boolean
  rules: Record<string, any>
  outputPolicy?: Record<string, any>
}

export const AUTOMATION_TEMPLATES: AutomationTemplate[] = [
  {
    id: 'movies',
    name: '电影库',
    description: '递归、跳过 Sample/Trailer、最小 100MB，已有字幕和输出跳过。',
    mode: 'both',
    recursive: true,
    rules: {
      extensions: ['.mkv', '.mp4', '.avi', '.ts', '.m2ts'],
      excludeRegex: 'Sample|Trailer|Trailer\\d|Featurette',
      minSizeMb: 100,
      stableSeconds: 30,
      skipExistingSubtitles: true,
      skipExistingOutput: true
    }
  },
  {
    id: 'tv',
    name: '剧集库',
    description: '适合 SxxExx 剧集，跳过样品和预告，稳定 20 秒。',
    mode: 'new',
    recursive: true,
    rules: {
      extensions: ['.mkv', '.mp4', '.avi', '.ts'],
      excludeRegex: 'Sample|Trailer|Featurette',
      minSizeMb: 50,
      stableSeconds: 20,
      skipExistingSubtitles: true,
      skipExistingOutput: true
    }
  },
  {
    id: 'anime',
    name: '动画 / 番剧',
    description: '包含常见动画格式，跳过已有字幕，适合新文件监控。',
    mode: 'new',
    recursive: true,
    rules: {
      extensions: ['.mkv', '.mp4', '.webm', '.avi'],
      excludeRegex: 'Sample|Preview|NCOP|NCED',
      minSizeMb: 30,
      stableSeconds: 15,
      skipExistingSubtitles: true,
      skipExistingOutput: true
    }
  },
  {
    id: 'low-resource',
    name: '低配 NAS',
    description: '更长稳定等待、单层目录、限制体积，减少误触发和资源占用。',
    mode: 'new',
    recursive: false,
    rules: {
      extensions: ['.mkv', '.mp4'],
      maxSizeMb: 8000,
      stableSeconds: 60,
      skipExistingSubtitles: true,
      skipExistingOutput: true
    },
    outputPolicy: {
      outputMode: 'translated',
      subtitleFormat: 'srt',
      sourceType: 'auto'
    }
  },
  {
    id: 'translated-bilingual',
    name: '双语字幕',
    description: '输出双语字幕，适合学习或对照观看。',
    mode: 'new',
    recursive: true,
    rules: {
      extensions: ['.mkv', '.mp4', '.avi', '.webm', '.ts'],
      minSizeMb: 50,
      stableSeconds: 20,
      skipExistingSubtitles: true,
      skipExistingOutput: true
    },
    outputPolicy: {
      outputMode: 'bilingual',
      subtitleFormat: 'srt',
      bilingualLayout: 'translated_first'
    }
  }
]
