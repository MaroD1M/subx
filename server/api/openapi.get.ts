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
      version: '2.6.2',
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
            files: { type: 'array', items: { oneOf: [{ type: 'string' }, { type: 'object' }] } }
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
      '/api/task': { post: { summary: '创建任务', requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/TaskCreate' } } } }, responses: { '200': jsonResponse({ taskId: 'uuid' }) } } },
      '/api/tasks': { get: { summary: '任务列表', parameters: [{ name: 'page', in: 'query', schema: { type: 'integer' } }, { name: 'pageSize', in: 'query', schema: { type: 'integer' } }, { name: 'status', in: 'query', schema: { type: 'string' } }], responses: { '200': { description: 'OK' } } } },
      '/api/tasks/{id}': { get: { ...taskPath.get, parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }] }, delete: { summary: '删除任务', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': jsonResponse({ success: true }) } } },
      '/api/tasks/{id}/cancel': { post: { summary: '取消任务', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': jsonResponse({ success: true }) } } },
      '/api/tasks/{id}/quality': { get: { summary: '双模型质量校验结果', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'OK' } } } },
      '/api/tasks/{id}/proofread': { post: { summary: 'AI 校对与术语建议', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'OK' } } } },
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
      '/api/asr/models': { get: { summary: 'ASR 模型列表、安装状态与下载任务', responses: { '200': { description: 'OK' } } } },
      '/api/asr/models-download': { post: { summary: '开始 ASR 模型下载', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['model'], properties: { model: { type: 'string' }, engine: { type: 'string', enum: ['auto', 'faster-whisper', 'whisper-cpp'] }, proxy: { type: 'string' }, force: { type: 'boolean' } } } } } }, responses: { '200': jsonResponse({ ok: true, jobId: 'uuid', status: 'queued' }) } } },
      '/api/asr/models-download-status': { get: { summary: 'ASR 模型下载进度', parameters: [{ name: 'jobId', in: 'query', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'OK' } } } },
      '/api/asr/models-download-pause': { post: { summary: '暂停 ASR 模型下载', responses: { '200': { description: 'OK' } } } },
      '/api/asr/models-download-resume': { post: { summary: '继续 ASR 模型下载', responses: { '200': { description: 'OK' } } } },
      '/api/asr/models-download-cancel': { post: { summary: '取消 ASR 模型下载并清理部分文件', responses: { '200': { description: 'OK' } } } },
      '/api/asr/models-delete': { post: { summary: '卸载 ASR 模型', responses: { '200': { description: 'OK' } } } },
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
