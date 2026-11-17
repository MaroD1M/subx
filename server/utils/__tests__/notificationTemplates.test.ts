import { describe, expect, it } from 'vitest'
import { renderNotificationJsonTemplate, renderNotificationTemplate } from '../notificationTemplates'
import { sanitizeChannelConfig } from '../notifications'

describe('notification templates', () => {
  it('renders dotted variables and keeps text safe', () => {
    const context = { task: { fileName: 'Demo.mkv', statusLabel: '完成' }, event: 'task_done' }
    expect(renderNotificationTemplate('{{task.fileName}} · {{task.statusLabel}}', context)).toBe('Demo.mkv · 完成')
    expect(renderNotificationTemplate('', context, 'fallback')).toBe('fallback')
    expect(renderNotificationTemplate('{{missing.value}}', context)).toBe('')
  })

  it('renders JSON templates with escaped string values', () => {
    const context = { task: { fileName: 'A "quoted" file.mkv', progress: 100 }, event: 'task_done' }
    const payload = renderNotificationJsonTemplate('{"file":"{{task.fileName}}","progress":{{task.progress}},"event":"{{event}}"}', context)
    expect(payload).toEqual({ file: 'A "quoted" file.mkv', progress: 100, event: 'task_done' })
  })

  it('sanitizes template fields on channels', () => {
    const config = sanitizeChannelConfig('webhook', {
      url: 'https://example.com/hook',
      titleTemplate: 'SubX · {{task.fileName}}',
      bodyTemplate: '{{task.statusLabel}}',
      webhookPayloadTemplate: '{"file":"{{task.fileName}}"}'
    })
    expect(config.titleTemplate).toBe('SubX · {{task.fileName}}')
    expect(config.bodyTemplate).toBe('{{task.statusLabel}}')
    expect(config.webhookPayloadTemplate).toBe('{"file":"{{task.fileName}}"}')
    expect(config.format).toBe('text')
  })
})
