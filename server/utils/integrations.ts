/**
 * Inbound downloader/media-server webhooks.
 *
 * Maps external paths into configured media roots, deduplicates retries and
 * creates automation tasks with the normal task pipeline. Webhook handlers are
 * authenticated by the integration token, not by the user session.
 */

import { createHash, randomUUID, timingSafeEqual } from 'crypto'
import { existsSync } from 'fs'
import { isAbsolute, join, normalize } from 'path'
import { basename as pathBasename } from 'path'
import { useDb } from './db'
import { ConfigService } from './config'
import { getMediaRoots } from './mediaRoots'
import { isPathInside, resolveInsideRoot } from './pathSafety'
import { TaskService, globalTaskQueue } from './task'
import { STYLE_PRESETS } from '../../shared/stylePresets'

export type IntegrationSource = 'sonarr' | 'radarr' | 'jellyfin' | 'plex' | 'emby' | 'bazarr'

export interface IntegrationPayload {
  event: string
  filePath: string
  isTest: boolean
  title?: string
}

function normalizePath(value: unknown): string {
  return String(value || '').trim().replaceAll('\\', '/')
}

export function parseIntegrationPayload(source: IntegrationSource, body: any): IntegrationPayload {
  const raw = body && typeof body === 'object' ? body : {}
  const event = String(raw.eventType || raw.event || raw.NotificationType || raw.type || '').trim()
  const isTest = /test/i.test(event)
  let filePath = ''
  if (source === 'sonarr') {
    filePath = normalizePath(raw.episodeFile?.path || raw.path)
    if (!filePath && raw.series?.path && raw.episodeFile?.relativePath) filePath = `${normalizePath(raw.series.path)}/${normalizePath(raw.episodeFile.relativePath)}`
    if (!filePath) filePath = normalizePath(raw.episodeFile?.relativePath)
  } else if (source === 'radarr') {
    filePath = normalizePath(raw.movieFile?.path || raw.path)
    if (!filePath && raw.movie?.path && raw.movieFile?.relativePath) filePath = `${normalizePath(raw.movie.path)}/${normalizePath(raw.movieFile.relativePath)}`
    if (!filePath) filePath = normalizePath(raw.movieFile?.relativePath)
  } else if (source === 'jellyfin' || source === 'emby') {
    filePath = normalizePath(raw.Item?.Path || raw.item?.Path || raw.Path || raw.path)
  } else if (source === 'bazarr') {
    filePath = normalizePath(raw.path || raw.episode?.path || raw.episode?.file || raw.movie?.path || raw.movie?.file || raw.video_path)
  } else {
    filePath = normalizePath(raw.path || raw.filePath || raw.Metadata?.Path || raw.Metadata?.Media?.[0]?.Part?.[0]?.file || raw.Metadata?.media?.part?.file || raw.payload?.path)
  }
  const title = String(raw.series?.title || raw.movie?.title || raw.Item?.Name || raw.Metadata?.title || '').trim() || undefined
  return { event, filePath, isTest, title }
}

export function mapIntegrationPath(filePath: string, from: string, to: string): string {
  const normalized = normalizePath(filePath)
  const normalizedFrom = normalizePath(from).replace(/\/+$/, '')
  if (normalizedFrom && (normalized === normalizedFrom || normalized.startsWith(`${normalizedFrom}/`))) {
    return normalizePath(`${normalizePath(to).replace(/\/+$/, '')}/${normalized.slice(normalizedFrom.length).replace(/^\/+/, '')}`)
  }
  return normalized
}

export function verifyIntegrationToken(provided: string, expected: string): boolean {
  if (!provided || !expected) return false
  const left = Buffer.from(createHash('sha256').update(provided).digest('hex'))
  const right = Buffer.from(createHash('sha256').update(expected).digest('hex'))
  return left.length === right.length && timingSafeEqual(left, right)
}

function integrationDb() {
  return useDb()
}

export const IntegrationService = {
  verifyToken(provided: string, config: any): boolean {
    return verifyIntegrationToken(provided, String(config.integrationWebhookToken || ''))
  },

  async resolveFilePath(filePath: string, config: any): Promise<{ rootId: string, relativePath: string, absolutePath: string }> {
    const mapped = mapIntegrationPath(filePath, String(config.integrationPathFrom || ''), String(config.integrationPathTo || ''))
    if (!mapped) throw new Error('回调未提供文件路径')
    const roots = await getMediaRoots()
    for (const root of roots) {
      if (isAbsolute(mapped) && isPathInside(root.path, mapped) && existsSync(mapped)) {
        return { rootId: root.id, relativePath: normalize(mapped).slice(normalize(root.path).length).replace(/^\/+/, ''), absolutePath: mapped }
      }
    }
    for (const root of roots) {
      const candidate = isAbsolute(mapped) ? join(root.path, pathBasename(mapped)) : mapped
      try {
        const absolute = await resolveInsideRoot(root.path, candidate || '.', { allowMissing: false })
        if (existsSync(absolute)) {
          return { rootId: root.id, relativePath: normalize(candidate).replace(/^\/+/, ''), absolutePath: absolute }
        }
      } catch { /* try next root */ }
    }
    throw new Error(`无法将回调路径映射到媒体库：${filePath}`)
  },

  async enqueue(source: IntegrationSource, payload: IntegrationPayload) {
    const config = await ConfigService.getConfig(true)
    const resolved = await this.resolveFilePath(payload.filePath, config)
    const existing = integrationDb().prepare(`
      SELECT task_id FROM integration_events
      WHERE source = ? AND event = ? AND path = ? AND status IN ('queued', 'done')
        AND created_at > datetime('now', ?)
      ORDER BY id DESC LIMIT 1
    `).get(source, payload.event, resolved.relativePath, '-10 minutes') as { task_id?: string } | undefined
    if (existing?.task_id) {
      return { taskId: existing.task_id, rootId: resolved.rootId, relativePath: resolved.relativePath, deduped: true }
    }
    const taskId = randomUUID()
    const allStylePresets = [...STYLE_PRESETS, ...(Array.isArray(config.customStylePresets) ? config.customStylePresets : [])]
    const style = allStylePresets.find(preset => preset.id === (config.stylePreset || 'default'))
    await TaskService.createTask({
      taskId,
      filePath: resolved.relativePath,
      rootId: resolved.rootId,
      sourceType: 'auto',
      trackIndex: 0,
      model: config.defaultModel,
      targetLanguage: config.targetLanguage,
      outputMode: (config.outputMode || 'translated') as any,
      stylePreset: config.stylePreset || 'default',
      stylePrompt: style?.prompt || '',
      translationMode: config.translationMode || 'non_stream',
      subtitleFormat: (config.subtitleFormat || 'srt') as any,
      subtitleStylePreset: config.subtitleStylePreset || 'bilingual_simple',
      bilingualLayout: (config.bilingualLayout || 'translated_first') as any,
      origin: 'automation'
    })
    await globalTaskQueue.add(taskId, { apiKey: config.apiKey, baseUrl: config.apiBaseUrl })
    integrationDb().prepare(`
      INSERT INTO integration_events (source, event, path, task_id, status, payload_json)
      VALUES (?, ?, ?, ?, 'queued', ?)
    `).run(source, payload.event, resolved.relativePath, taskId, JSON.stringify(payload))
    return { taskId, rootId: resolved.rootId, relativePath: resolved.relativePath }
  },

  finishTask(taskId: string, status: 'done' | 'error' | 'cancelled') {
    try {
      integrationDb().prepare(`
        UPDATE integration_events SET status = ?
        WHERE task_id = ? AND status = 'queued'
      `).run(status === 'done' ? 'done' : 'failed', taskId)
    } catch { /* best effort */ }
  },

  recordFailure(source: IntegrationSource, payload: IntegrationPayload, error: string) {
    try {
      integrationDb().prepare(`
        INSERT INTO integration_events (source, event, path, status, error, payload_json)
        VALUES (?, ?, ?, 'failed', ?, ?)
      `).run(source, payload.event, payload.filePath, error, JSON.stringify(payload))
    } catch { /* best effort */ }
  },

  listEvents(limit = 100) {
    const rows = integrationDb().prepare(`
      SELECT * FROM integration_events ORDER BY created_at DESC, id DESC LIMIT ?
    `).all(Math.min(500, Math.max(1, Number(limit) || 100))) as any[]
    return rows.map(row => ({
      id: Number(row.id),
      source: String(row.source),
      event: String(row.event || ''),
      path: String(row.path || ''),
      taskId: row.task_id || '',
      status: String(row.status),
      error: row.error || '',
      createdAt: row.created_at
    }))
  }
}
