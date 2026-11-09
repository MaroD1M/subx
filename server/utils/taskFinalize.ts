import type { SubtitleEntry, SubtitleOutputStyle, TaskStatus, TranslationTask } from '../../types'
import { useDb } from './db'
import { logger } from './logger'
import { QualityService } from './quality'
import { SubtitleService } from './subtitle'
import { TranslationService, type TranslationContext } from './translation'
import { writeTaskLog } from './taskLog'
import { persistReviewEntries } from './taskSupport'
import { assertTaskNotCancelled, ensureTaskNotCancelled } from './taskState'

export interface FinalizeTaskOptions {
  taskId: string
  task: TranslationTask
  config: any
  runtimeConfig: { apiKey: string, baseUrl?: string }
  translatedEntries: SubtitleEntry[]
  outputPath: string
  embyVariantPath: string
  srtPath: string
  subtitleFormat: string
  subtitleStylePreset: string
  subtitleStyle?: SubtitleOutputStyle
  bilingualLayout: string
  totalChunks: number
  stylePrompt: string
  translationContext: TranslationContext
  fallbackCount?: number
  signal: AbortSignal
  updateStatus: (taskId: string, status: TaskStatus, progress: number, data?: any) => Promise<void>
}

export async function finalizeTaskOutput(options: FinalizeTaskOptions): Promise<string> {
  const {
    taskId, task, config, runtimeConfig, outputPath, embyVariantPath, srtPath,
    subtitleFormat, subtitleStylePreset, subtitleStyle, bilingualLayout, totalChunks,
    stylePrompt, translationContext, fallbackCount = 0, signal, updateStatus
  } = options

  await ensureTaskNotCancelled(taskId)
  await updateStatus(taskId, 'exporting', 90, { stepProgress: 0, stepMessage: '正在合成并保存最终字幕文件...', log: '正在合成并保存最终字幕文件...' })

  let translatedEntries = [...options.translatedEntries]
  translatedEntries.sort((a, b) => Number(a.id) - Number(b.id))
  if (!translatedEntries.length) {
    throw new Error('没有可导出的字幕条目')
  }

  const repaired = SubtitleService.repairTranslatedEntries(
    translatedEntries,
    task.targetLanguage,
    task.outputMode as 'translated' | 'bilingual' | 'original'
  )
  translatedEntries = repaired.entries

  if (repaired.repaired > 0) {
    const repairSummary = Object.entries(repaired.issueCounts)
      .map(([issueReason, count]) => issueReason + ':' + count)
      .join(', ')
    writeTaskLog(taskId, 'exporting', repaired.fallbacked > 0 ? 'warn' : 'info', '[修复] 已自动修正 ' + repaired.repaired + ' 条字幕（' + (repairSummary || 'no-details') + '）')
  }

  const issues = SubtitleService.validateTranslatedEntries(translatedEntries, task.targetLanguage)
  let allIssues: Array<{ id: string, reason: string, severity?: 'soft' | 'hard' }> = issues

  if (config.qualityCheckEnabled === true && config.qualityCheckModel && config.qualityCheckModel !== task.model) {
    try {
      await updateStatus(taskId, 'translating', 87, { log: `正在进行双模型质量校验：${config.qualityCheckModel}` })
      const quality = await QualityService.evaluate(taskId, translatedEntries, {
        providerType: String(config.providerType || 'openai-compatible'),
        apiKey: runtimeConfig.apiKey,
        baseUrl: runtimeConfig.baseUrl,
        model: config.qualityCheckModel,
        targetLanguage: task.targetLanguage,
        threshold: Number(config.qualityScoreThreshold ?? 0.7),
        maxEntries: Number(config.qualityCheckMaxEntries ?? 200),
        stylePrompt,
        context: translationContext
      }, signal)
      for (const entry of translatedEntries) {
        const score = quality.scores.get(String(entry.id))
        if (score) {
          entry.qualityScore = score.score
          entry.qualityIssues = score.issues
        }
      }
      allIssues = [...allIssues, ...quality.issues]
      writeTaskLog(taskId, 'exporting', quality.issues.length ? 'warn' : 'info', `[质量] 双模型校验 ${quality.checked} 条，平均评分 ${(quality.avgScore * 100).toFixed(1)}，低于阈值 ${quality.issues.length} 条`)
    } catch (qualityError: any) {
      writeTaskLog(taskId, 'exporting', 'warn', `[质量] 双模型校验失败，已跳过：${qualityError?.message || qualityError}`)
    }
  }

  if (allIssues.length > 0) {
    const preview = allIssues.slice(0, 5).map(issue => `#${issue.id}:${issue.reason}`).join(', ')
    persistReviewEntries(taskId, translatedEntries, allIssues)
    writeTaskLog(taskId, 'exporting', 'warn', `[核对] 检测到 ${allIssues.length} 条字幕需注意：${preview}`)
  } else {
    persistReviewEntries(taskId, translatedEntries, [])
  }

  await ensureTaskNotCancelled(taskId)
  const savedPath = await SubtitleService.writeSubtitle(translatedEntries, outputPath, task.outputMode as 'translated' | 'bilingual' | 'original', subtitleFormat as any, subtitleStylePreset, bilingualLayout as any, srtPath, subtitleStyle)
  if (embyVariantPath) {
    await SubtitleService.writeSubtitle(translatedEntries, embyVariantPath, task.outputMode as 'translated' | 'bilingual' | 'original', subtitleFormat as any, subtitleStylePreset, bilingualLayout as any, srtPath, subtitleStyle)
  }
  await updateStatus(taskId, 'exporting', 95, { stepProgress: 100, stepMessage: '文件保存成功', log: `文件保存成功: ${savedPath}${embyVariantPath ? '（SubX/ 变体已同步）' : ''}` })

  TranslationService.cleanupPartialFiles(taskId, totalChunks)

  useDb().prepare('UPDATE tasks SET output_path = ?, updated_at = datetime(\'now\') WHERE task_id = ?').run(savedPath, taskId)
  const fallbackRatio = translatedEntries.length > 0 ? fallbackCount / translatedEntries.length : 0
  if (fallbackCount > 0 && fallbackRatio >= 0.05) {
    await updateStatus(taskId, 'review', 100, {
      error: null,
      stepProgress: 100,
      stepMessage: `有 ${fallbackCount} 条字幕翻译失败，等待人工核对`,
      log: `[降级] ${fallbackCount}/${translatedEntries.length} 条字幕翻译失败，已保留原文并进入核对。`
    })
    logger.warn({ taskId, fallbackCount, total: translatedEntries.length }, 'task requires review after translation fallback')
    return savedPath
  }
  await updateStatus(taskId, 'done', 100, { stepProgress: 100, stepMessage: '任务完成' })
  logger.info({ taskId, savedPath }, 'task completed')
  return savedPath
}
