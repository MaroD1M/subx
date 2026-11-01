import { createHash } from 'crypto'
import { join } from 'path'
import Database from 'better-sqlite3'
import type { APIRequestContext } from '@playwright/test'

const PASSKEY = 'playwright-test-passkey'
const DB_PATH = join(process.cwd(), '.test-artifacts', 'subx.db')
const MEDIA_ROOT = join(process.cwd(), '.test-artifacts', 'media')

export async function setupAuth(request: APIRequestContext) {
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      const health = await request.get('/api/health')
      if (health.ok()) {
        const payload = await health.json().catch(() => null)
        if (payload?.ok) break
      }
    } catch { /* dev server warming up */ }
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  const status = await request.get('/api/auth/status')
  const data = await status.json() as { hasPasskey: boolean }
  const passkey = createHash('sha256').update(PASSKEY).digest('hex')
  const response = data.hasPasskey
    ? await request.post('/api/auth/login', { data: { passkey } })
    : await request.post('/api/auth/setup', { data: { passkey } })
  if (!response.ok()) {
    throw new Error(`Auth failed: ${response.status()} ${await response.text()}`)
  }
  const config = await request.put('/api/config', {
    data: {
      mediaRoots: [{ id: 'default', name: '影视库', path: MEDIA_ROOT, enabled: true, isDefault: true, order: 0 }],
      defaultModel: 'deepseek-chat',
      targetLanguage: 'zh-CN'
    }
  })
  if (!config.ok()) {
    throw new Error(`Config failed: ${config.status()} ${await config.text()}`)
  }
}

export function seedTasks() {
  const db = new Database(DB_PATH)
  const now = '2026-10-30 07:00:00'
  const insertTask = db.prepare(`
    INSERT OR REPLACE INTO tasks (
      task_id, file_path, root_id, source_type, track_index, model, target_lang, output_mode,
      style_preset, style_prompt, content_title, content_background, custom_instructions,
      translation_mode, subtitle_format, subtitle_style_preset, bilingual_layout, force_retranslate,
      status, progress, total_chunks, done_chunks, output_path, error, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const tasks = [
    ['preview-done', 'Shows/Demo Show/Demo.Show.S01E01.mkv', 'default', 'embedded', 2, 'deepseek-chat', 'zh-CN', 'bilingual', 'custom-cinema', '请使用自然、克制的影视口语，角色名保持统一。', 'Demo Show S01E01', '主角在北境遇到守夜人，剧情围绕一场突如其来的冲突展开。', '角色名保持与术语表一致；不要使用网络流行语。', 'non_stream', 'both', 'bilingual_cinema', 'translated_first', 0, 'done', 100, 8, 8, join(MEDIA_ROOT, 'Shows/Demo Show/Demo.Show.S01E01.zh-CN.srt'), null, now, now],
    ['preview-error', 'Movies/Example.Movie.2024.mkv', 'default', 'embedded', 1, 'gpt-4o-mini', 'zh-CN', 'translated', 'default', '', 'Example Movie 2024', '', '', 'non_stream', 'srt', 'mono_clean', 'translated_first', 0, 'error', 42, 6, 2, null, '鉴权失败：请检查 API Key 或供应商鉴权配置', now, now],
    ['preview-review', 'Shows/Demo Show/Demo.Show.S01E02.mkv', 'default', 'embedded', 1, 'deepseek-chat', 'zh-CN', 'bilingual', 'british-spy', '请体现英式冷幽默和克制语气。', 'Demo Show S01E02', '本集节奏偏慢，包含大量人物对话和隐喻。', '', 'non_stream', 'srt', 'bilingual_simple', 'translated_first', 0, 'done', 100, 10, 10, join(MEDIA_ROOT, 'Shows/Demo Show/Demo.Show.S01E02.zh-CN.srt'), null, now, now]
  ]
  for (const task of tasks) insertTask.run(...task)

  db.prepare('DELETE FROM task_review_entries WHERE task_id = ?').run('preview-review')
  const reviewStmt = db.prepare(`
    INSERT INTO task_review_entries (
      task_id, subtitle_id, start_time, end_time, original_text, translated_text, final_text,
      review_status, review_reasons, sort_order, selected, edited, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)
  `)
  const rows = [
    ['1', '00:00:01,000', '00:00:03,000', 'Good evening, Minister.', '晚上好，部长。', '晚上好，部长。', 'translated', '[]'],
    ['2', '00:00:04,000', '00:00:06,000', 'I am afraid the situation has changed.', '恐怕情况已经变了。', '恐怕情况已经变了。', 'translated', '[]'],
    ['3', '00:00:07,000', '00:00:09,000', 'Changed how?', '怎么变了？', '怎么变了？', 'needs_review', '["same_as_source"]'],
    ['4', '00:00:10,000', '00:00:12,000', '[sirens wailing]', '[警笛声]', '[警笛声]', 'translated', '[]'],
    ['5', '00:00:13,000', '00:00:16,000', 'They know we are coming.', '他们知道我们要来了。', '他们知道我们要来了。', 'translated', '[]'],
    ['6', '00:00:17,000', '00:00:19,000', 'Then we move tonight.', '那我们今晚就行动。', '那我们今晚就行动。', 'needs_review', '["overlong_translation"]'],
    ['7', '00:00:20,000', '00:00:22,000', 'Absolutely not.', '绝对不行。', '绝对不行。', 'translated', '[]'],
    ['8', '00:00:23,000', '00:00:25,000', 'This is bigger than us.', '这件事比我们更重要。', '这件事比我们更重要。', 'needs_review', '["suspected_shift"]'],
    ['9', '00:00:26,000', '00:00:28,000', '♪ slow, suspenseful music ♪', '♪ 缓慢而紧张的配乐 ♪', '♪ 缓慢而紧张的配乐 ♪', 'accepted_same', '[]'],
    ['10', '00:00:29,000', '00:00:32,000', 'You should have told me.', '', '', 'missing', '["missing"]']
  ]
  rows.forEach((row, index) => reviewStmt.run('preview-review', row[0], row[1], row[2], row[3], row[4], row[5], row[6], row[7], index, now, now))

  db.prepare('DELETE FROM task_logs WHERE task_id = ?').run('preview-done')
  const logStmt = db.prepare("INSERT INTO task_logs (task_id, step, category, level, message, created_at) VALUES (?, ?, ?, ?, ?, ?)")
  const logs = [
    ['queued', 'system', 'info', '任务已创建，等待执行'],
    ['extracting', 'system', 'info', '正在从原视频中提取字幕流...'],
    ['parsing', 'system', 'info', '解析完成，共划分为 8 个文本块。'],
    ['translating', 'translation', 'info', '使用翻译风格: 自定义影院风格'],
    ['translating', 'translation', 'warn', '[校验] 块 #3 检测到 2 条需注意：同源内容，将进入核对'],
    ['exporting', 'export', 'info', '文件保存成功: Demo.Show.S01E01.zh-CN.srt'],
    ['done', 'export', 'info', '任务完成']
  ]
  logs.forEach((log, index) => logStmt.run('preview-done', log[0], log[1], log[2], log[3], `2026-10-30 07:0${index}:00`))

  db.prepare('DELETE FROM watch_events').run()
  db.prepare('DELETE FROM watch_folders').run()
  const folderInfo = db.prepare(`
    INSERT INTO watch_folders (root_id, path, enabled, recursive, mode, rules_json, output_policy_json)
    VALUES ('default', 'Movies', 1, 1, 'backfill', ?, ?)
  `).run(JSON.stringify({
    extensions: ['.mkv', '.mp4'],
    includeRegex: '',
    excludeRegex: 'Sample|Trailer',
    minSizeMb: 100,
    maxSizeMb: 0,
    minDurationSec: 300,
    createdAfter: '',
    createdBefore: '',
    modifiedAfter: '',
    modifiedBefore: '',
    stableSeconds: 30,
    skipExistingSubtitles: true,
    skipExistingOutput: true
  }), JSON.stringify({
    targetLanguage: 'zh-CN',
    outputMode: 'bilingual',
    stylePreset: 'default',
    subtitleFormat: 'srt',
    subtitleStylePreset: 'bilingual_simple',
    bilingualLayout: 'translated_first',
    sourceType: 'auto',
    model: 'deepseek-chat',
    notifyChannelIds: []
  }))
  const folderId = Number(folderInfo.lastInsertRowid)
  const eventStmt = db.prepare(`
    INSERT INTO watch_events (folder_id, path, size, mtime, status, task_id, error, dedupe_key, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  eventStmt.run(folderId, 'Movies/New.Movie.2025.mkv', 8_500_000_000, '2026-10-30 06:50:00', 'failed', null, '未发现可用字幕轨道，ASR 未启用', 'seed-event-failed', '2026-10-30 07:01:00', '2026-10-30 07:02:00')
  eventStmt.run(folderId, 'Movies/Imported.Movie.2024.mkv', 7_200_000_000, '2026-10-30 06:40:00', 'done', 'preview-done', null, 'seed-event-done', '2026-10-30 07:00:00', '2026-10-30 07:03:00')
  eventStmt.run(folderId, 'Movies/Sample.Trailer.mkv', 80_000_000, '2026-10-30 06:30:00', 'skipped', null, '匹配排除规则', 'seed-event-skipped', '2026-10-30 06:59:00', '2026-10-30 06:59:10')

  db.prepare('DELETE FROM notification_deliveries').run()
  db.prepare('DELETE FROM notification_channels').run()
  const channelInfo = db.prepare(`
    INSERT INTO notification_channels (type, name, config_json, enabled)
    VALUES ('webhook', '家庭 Webhook', ?, 1)
  `).run(JSON.stringify({
    url: 'https://example.com/subx-hook',
    method: 'POST',
    headers: {},
    secret: '',
    proxyUrl: '',
    events: ['task_done', 'task_error', 'low_confidence', 'watch_error']
  }))
  db.prepare(`
    INSERT INTO notification_deliveries (channel_id, event, title, body, status, attempts, last_error, dedupe_key, created_at, updated_at)
    VALUES (?, 'task_done', 'SubX 任务完成', '演示投递记录', 'sent', 1, NULL, 'seed-delivery', '2026-10-30 07:04:00', '2026-10-30 07:04:01')
  `).run(Number(channelInfo.lastInsertRowid))

  db.prepare('DELETE FROM api_tokens').run()
  const token = `subx_${'d'.repeat(48)}`
  db.prepare(`
    INSERT INTO api_tokens (name, token_hash, prefix, scopes_json, expires_at, last_used_at, created_at)
    VALUES (?, ?, ?, ?, NULL, '2026-10-30 07:05:00', '2026-10-30 07:00:00')
  `).run('下载器回调', createHash('sha256').update(token).digest('hex'), token.slice(0, 12), JSON.stringify(['tasks:read', 'tasks:write']))

  db.close()
}
