const jsonResponse = (body: any) => ({ description: 'OK', content: { 'application/json': { schema: { type: 'object' }, example: body } } })

const taskPath = {
  get: {
    summary: '查询任务',
    security: [{ ApiToken: [] }],
    responses: { '200': { description: 'OK' } }
  }
}

export default defineEventHandler(() => {
  return {
    openapi: '3.1.0',
    info: {
      title: 'SubX API',
      version: '2.10.0',
      description: 'SubX 任务、目录监控、通知与 API Token 接口。使用 Authorization: Bearer <token> 或 X-API-Token。'
    },
    servers: [{ url: '/' }],
    security: [{ ApiToken: [] }],
    components: {
      securitySchemes: {
        ApiToken: { type: 'http', scheme: 'bearer', bearerFormat: 'subx_*' },
        SessionCookie: { type: 'apiKey', in: 'cookie', name: 'subx_session' }
      },
      schemas: {
        TaskCreate: {
          type: 'object',
          required: ['filePath'],
          properties: {
            filePath: { type: 'string' },
            rootId: { type: 'string' },
            sourceType: { type: 'string', enum: ['auto', 'embedded', 'external', 'asr', 'ocr'] },
            trackIndex: { type: 'integer' },
            targetLanguage: { type: 'string' },
            outputMode: { type: 'string', enum: ['translated', 'bilingual', 'original'] },
            model: { type: 'string' },
            stylePreset: { type: 'string' },
            subtitleFormat: { type: 'string', enum: ['srt', 'ass', 'both'] },
            subtitleStylePreset: { type: 'string', description: '兼容旧版字幕样式预设 ID' },
            subtitleStyle: {
              type: 'object',
              properties: {
                presetId: { type: 'string' },
                original: { type: 'object', description: '原文 ASS 样式：fontFamily/fontSize/primaryColor/outlineColor/outlineWidth/shadow/bold/italic/marginV/alignment' },
                translated: { type: 'object', description: '译文 ASS 样式，字段同 original' },
                lineGap: { type: 'number' },
                background: { type: 'object', properties: { enabled: { type: 'boolean' }, color: { type: 'string' }, opacity: { type: 'number' }, padding: { type: 'number' } } }
              }
            },
            bilingualLayout: { type: 'string', enum: ['translated_first', 'original_first'] },
            files: { type: 'array', items: { oneOf: [{ type: 'string' }, { type: 'object' }] } },
            dedupeEpisodes: { type: 'boolean', description: '批量任务按 SxxExx 去重，保留体积最大的版本' },
            trackPolicy: {
              type: 'object',
              properties: {
                subtitleLanguage: { type: 'string', description: '字幕语言优先，如 zh/en/ja/ko' },
                audioLanguage: { type: 'string', description: 'ASR 音轨语言优先，如 zh/en/ja/ko' },
                preferDefault: { type: 'boolean' },
                allowForcedSubtitle: { type: 'boolean' },
                fallbackToAsr: { type: 'boolean' }
              }
            }
          }
        },
        WatchFolder: {
          type: 'object',
          properties: {
            rootId: { type: 'string' },
            path: { type: 'string' },
            enabled: { type: 'boolean' },
            recursive: { type: 'boolean' },
            mode: { type: 'string', enum: ['new', 'backfill', 'both'] },
            rules: { type: 'object' },
            outputPolicy: { type: 'object' }
          }
        },
        NotificationChannel: {
          type: 'object',
          required: ['type', 'name'],
          properties: {
            type: { type: 'string', enum: ['telegram', 'smtp', 'webhook', 'ntfy'] },
            name: { type: 'string' },
            enabled: { type: 'boolean' },
            config: { type: 'object' }
          }
        }
      }
    },
    paths: {
      '/api/health': { get: { summary: '健康检查', security: [], responses: { '200': jsonResponse({ ok: true }) } } },
      '/api/fonts': { get: { summary: '服务器已安装字体列表', responses: { '200': jsonResponse({ fonts: ['Noto Sans CJK SC'], available: true }) } } },
      '/api/backups': {
        get: { summary: '备份列表与自动备份设置', responses: { '200': { description: 'OK' } } },
        post: { summary: '立即创建应用内备份', responses: { '200': jsonResponse({ success: true }) } }
      },
      '/api/health/diagnostics': { get: { summary: '系统体检', responses: { '200': { description: 'OK' } } } },
      '/api/review-jobs/{id}': { get: { summary: '核对重译后台任务状态', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'OK' } } } },
      '/api/review-jobs/latest': { get: { summary: '任务最近一次核对重译任务', parameters: [{ name: 'taskId', in: 'query', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'OK' } } } },
      '/api/preview/frame': {
        post: {
          summary: '按时间点生成完整分辨率实景字幕预览图',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    taskId: { type: 'string', description: '核对页任务 ID；与 filePath 二选一' },
                    filePath: { type: 'string', description: '首页视频相对路径；与 taskId 二选一' },
                    rootId: { type: 'string' },
                    time: { type: 'number', description: '秒；省略时自动选择字幕中点或视频 10% 位置' },
                    outputMode: { type: 'string', enum: ['translated', 'bilingual', 'original'] },
                    subtitleStylePreset: { type: 'string' },
                    subtitleStyle: { type: 'object' },
                    bilingualLayout: { type: 'string', enum: ['translated_first', 'original_first'] }
                  }
                }
              }
            }
          },
          responses: { '200': { description: 'image/png；响应头包含 X-Preview-Width/Height/Time/Duration' } }
        }
      },
      '/api/files/scan': { get: { summary: '递归扫描目录内的视频文件', parameters: [{ name: 'rootId', in: 'query', required: true, schema: { type: 'string' } }, { name: 'path', in: 'query', schema: { type: 'string' } }], responses: { '200': { description: 'OK' } } } },
      '/api/task': { post: { summary: '创建任务', requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/TaskCreate' } } } }, responses: { '200': jsonResponse({ taskId: 'uuid' }) } } },
      '/api/tasks': { get: { summary: '任务列表', parameters: [{ name: 'page', in: 'query', schema: { type: 'integer' } }, { name: 'pageSize', in: 'query', schema: { type: 'integer' } }, { name: 'status', in: 'query', schema: { type: 'string' } }], responses: { '200': { description: 'OK' } } } },
      '/api/tasks/{id}': { get: { ...taskPath.get, parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }] }, delete: { summary: '删除任务', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': jsonResponse({ success: true }) } } },
      '/api/tasks/{id}/cancel': { post: { summary: '取消任务', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': jsonResponse({ success: true }) } } },
      '/api/tasks/{id}/pause': { post: { summary: '暂停 ASR 任务', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': jsonResponse({ success: true }) } } },
      '/api/tasks/{id}/resume': { post: { summary: '继续 ASR 任务', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': jsonResponse({ success: true }) } } },
      '/api/tasks/{id}/quality': { get: { summary: '双模型质量校验结果', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'OK' } } } },
      '/api/tasks/{id}/proofread': {
        get: { summary: '读取 AI 校对缓存', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }, { name: 'kind', in: 'query', schema: { type: 'string', enum: ['glossary', 'consistency'] } }], responses: { '200': { description: 'OK' } } },
        post: { summary: '生成或强制刷新 AI 校对与术语建议', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { kind: { type: 'string', enum: ['glossary', 'consistency'] }, refresh: { type: 'boolean' } } } } } }, responses: { '200': { description: 'OK' } } }
      },
      '/api/tasks/{id}/audio': { get: { summary: '字幕音频片段', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }, { name: 'start', in: 'query', schema: { type: 'number' } }, { name: 'end', in: 'query', schema: { type: 'number' } }], responses: { '200': { description: 'audio/mpeg' } } } },
      '/api/watch-folders': {
        get: { summary: '监控目录列表', responses: { '200': { description: 'OK' } } },
        post: { summary: '新增监控目录', requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/WatchFolder' } } } }, responses: { '200': { description: 'OK' } } }
      },
      '/api/watch-folders/{id}': {
        patch: { summary: '更新监控目录', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { '200': { description: 'OK' } } },
        delete: { summary: '删除监控目录', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { '200': jsonResponse({ success: true }) } }
      },
      '/api/watch-folders/{id}/backfill': { post: { summary: '历史回填', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { '200': { description: 'OK' } } } },
      '/api/watch-events': { get: { summary: '监控事件列表', responses: { '200': { description: 'OK' } } } },
      '/api/watch-events/{id}/retry': { post: { summary: '重试监控事件', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { '200': jsonResponse({ success: true }) } } },
      '/api/notification-channels': {
        get: { summary: '通知渠道列表（密钥已隐藏）', responses: { '200': { description: 'OK' } } },
        post: { summary: '新增通知渠道', requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/NotificationChannel' } } } }, responses: { '200': { description: 'OK' } } }
      },
      '/api/notification-channels/{id}': {
        patch: { summary: '更新通知渠道', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { '200': { description: 'OK' } } },
        delete: { summary: '删除通知渠道', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { '200': jsonResponse({ success: true }) } }
      },
      '/api/notification-channels/{id}/test': { post: { summary: '测试发送', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { '200': jsonResponse({ ok: true }) } } },
      '/api/notification-deliveries': { get: { summary: '通知投递记录', responses: { '200': { description: 'OK' } } } },
      '/api/notification-proxy-test': { post: { summary: '测试通知出站代理（渠道代理或 HTTPS_PROXY/HTTP_PROXY）', responses: { '200': { description: 'OK' } } } },
      '/api/asr/metrics': { get: { summary: 'ASR 指标', responses: { '200': { description: 'OK' } } } },
      '/api/ocr/status': { get: { summary: 'OCR 服务状态', responses: { '200': { description: 'OK' } } } },
      '/api/storage': { get: { summary: '存储与缓存占用', responses: { '200': { description: 'OK' } } } },
      '/api/storage/cleanup': { post: { summary: '按类型清理 SubX 缓存', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['targets'], properties: { targets: { type: 'array', items: { type: 'string', enum: ['asrAudio', 'aiLogs', 'taskTemp', 'taskLogs', 'ocrTemp', 'previewCache', 'translationCache'] } }, days: { type: 'integer' }, all: { type: 'boolean' } } } } } }, responses: { '200': { description: 'OK' } } } },
      '/api/asr/models': { get: { summary: 'ASR 模型列表、安装状态与下载任务', responses: { '200': { description: 'OK' } } } },
      '/api/asr/models-download': { post: { summary: '开始 ASR 模型下载', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['model'], properties: { model: { type: 'string' }, engine: { type: 'string', enum: ['auto', 'faster-whisper', 'whisper-cpp'] }, proxy: { type: 'string' }, force: { type: 'boolean' } } } } } }, responses: { '200': jsonResponse({ ok: true, jobId: 'uuid', status: 'queued' }) } } },
      '/api/asr/models-download-status': { get: { summary: 'ASR 模型下载进度', parameters: [{ name: 'jobId', in: 'query', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'OK' } } } },
      '/api/asr/models-download-pause': { post: { summary: '暂停 ASR 模型下载', responses: { '200': { description: 'OK' } } } },
      '/api/asr/models-download-resume': { post: { summary: '继续 ASR 模型下载', responses: { '200': { description: 'OK' } } } },
      '/api/asr/models-download-cancel': { post: { summary: '取消 ASR 模型下载并清理部分文件', responses: { '200': { description: 'OK' } } } },
      '/api/asr/models-delete': { post: { summary: '卸载 ASR 模型', responses: { '200': { description: 'OK' } } } },
      '/api/library/coverage': { get: { summary: '读取媒体库字幕覆盖缓存，refresh=1 时重新扫描', parameters: [{ name: 'rootId', in: 'query', required: true, schema: { type: 'string' } }, { name: 'targetLanguage', in: 'query', schema: { type: 'string' } }, { name: 'includeEmbedded', in: 'query', schema: { type: 'string' } }, { name: 'refresh', in: 'query', schema: { type: 'string' } }], responses: { '200': { description: 'OK' } } } },
      '/api/library/coverage/scan': { post: { summary: '手动扫描媒体库字幕覆盖并写入缓存', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['rootId'], properties: { rootId: { type: 'string' }, targetLanguage: { type: 'string' }, includeEmbedded: { type: 'boolean' } } } } } }, responses: { '200': { description: 'OK' } } } },
      '/api/library/coverage-policy': {
        get: { summary: '查询媒体库自动补齐策略', parameters: [{ name: 'rootId', in: 'query', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'OK' } } },
        put: { summary: '保存媒体库自动补齐策略', responses: { '200': { description: 'OK' } } }
      },
      '/api/library/coverage-auto-fill': { post: { summary: '预览或立即补齐缺失字幕', requestBody: { content: { 'application/json': { schema: { type: 'object', required: ['rootId'], properties: { rootId: { type: 'string' }, dryRun: { type: 'boolean' }, force: { type: 'boolean' } } } } } }, responses: { '200': { description: 'OK' } } } },
      '/api/operations/overview': { get: { summary: '运行状态、字幕覆盖、成本、记忆与任务诊断合并总览', responses: { '200': { description: 'OK' } } } },
      '/api/cost/summary': { get: { summary: '本月 token 与费用统计', parameters: [{ name: 'month', in: 'query', schema: { type: 'string', example: '2026-11' } }], responses: { '200': { description: 'OK' } } } },
      '/api/translation-memory/stats': { get: { summary: '翻译记忆统计', responses: { '200': { description: 'OK' } } } },
      '/api/translation-memory/mine': { post: { summary: '从媒体库已有双语字幕学习翻译记忆', requestBody: { content: { 'application/json': { schema: { type: 'object', required: ['rootId'], properties: { rootId: { type: 'string' }, targetLanguage: { type: 'string' }, limitFiles: { type: 'integer' }, limitPairs: { type: 'integer' } } } } } }, responses: { '200': { description: 'OK' } } } },
      '/api/translation-memory/clear': { post: { summary: '清空指定语言的翻译记忆', requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { targetLanguage: { type: 'string' } } } } } }, responses: { '200': { description: 'OK' } } } },
      '/api/metadata/test': { post: { summary: '检测 TMDB 元数据 API', responses: { '200': { description: 'OK' } } } },
      '/api/series/profile': {
        get: { summary: '查询系列记忆', parameters: [{ name: 'rootId', in: 'query', schema: { type: 'string' } }, { name: 'filePath', in: 'query', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'OK' } } },
        put: { summary: '保存系列记忆', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['filePath'], properties: { rootId: { type: 'string' }, filePath: { type: 'string' }, seriesKey: { type: 'string' }, title: { type: 'string' }, background: { type: 'string' }, summary: { type: 'string' }, glossary: { type: 'object' } } } } } }, responses: { '200': { description: 'OK' } } }
      },
      '/api/series/profiles': { get: { summary: '系列记忆列表', responses: { '200': { description: 'OK' } } } },
      '/api/integrations/{source}': { post: { summary: '下载器/媒体服务器 Webhook', parameters: [{ name: 'source', in: 'path', required: true, schema: { type: 'string', enum: ['sonarr', 'radarr', 'jellyfin', 'plex', 'emby', 'bazarr'] } }], security: [], responses: { '200': { description: 'OK' } } } },
      '/api/integrations/events': { get: { summary: '外部集成事件', responses: { '200': { description: 'OK' } } } },
      '/api/api-tokens': {
        get: { summary: 'Token 列表', responses: { '200': { description: 'OK' } } },
        post: { summary: '创建 Token（明文仅返回一次）', responses: { '200': { description: 'OK' } } }
      },
      '/api/api-tokens/{id}': { delete: { summary: '撤销 Token', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { '200': jsonResponse({ success: true }) } } },
      '/api/api-token-audit': { get: { summary: 'API Token 调用审计', responses: { '200': { description: 'OK' } } } }
    }
  }
})
