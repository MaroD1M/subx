import { describe, expect, it } from 'vitest'
import { mapIntegrationPath, parseIntegrationPayload, verifyIntegrationToken } from '../integrations'

describe('integration webhooks', () => {
  it('parses Sonarr episode file paths', () => {
    const payload = parseIntegrationPayload('sonarr', {
      eventType: 'Download',
      series: { title: 'Demo Show', path: '/tv/Demo Show' },
      episodeFile: { relativePath: 'Season 01/Demo.S01E01.mkv' }
    })
    expect(payload.isTest).toBe(false)
    expect(payload.event).toBe('Download')
    expect(payload.title).toBe('Demo Show')
    expect(payload.filePath).toBe('/tv/Demo Show/Season 01/Demo.S01E01.mkv')
  })

  it('parses Radarr and Jellyfin payloads', () => {
    expect(parseIntegrationPayload('radarr', { eventType: 'Download', movieFile: { path: '/movies/A.mkv' } }).filePath).toBe('/movies/A.mkv')
    expect(parseIntegrationPayload('jellyfin', { NotificationType: 'ItemAdded', Item: { Path: '/media/B.mkv', Name: 'B' } }).filePath).toBe('/media/B.mkv')
  })

  it('parses Emby and Bazarr payloads', () => {
    expect(parseIntegrationPayload('emby', { Event: 'system.notification', Item: { Path: '/media/C.mkv' } }).filePath).toBe('/media/C.mkv')
    expect(parseIntegrationPayload('bazarr', { episode: { path: '/media/D.mkv' } }).filePath).toBe('/media/D.mkv')
  })

  it('marks test events', () => {
    expect(parseIntegrationPayload('sonarr', { eventType: 'Test' }).isTest).toBe(true)
  })

  it('maps downloader paths onto container media paths', () => {
    expect(mapIntegrationPath('/downloads/Movies/A.mkv', '/downloads', '/media')).toBe('/media/Movies/A.mkv')
    expect(mapIntegrationPath('C:\\Downloads\\A.mkv', 'C:\\Downloads', '/media')).toBe('/media/A.mkv')
    expect(mapIntegrationPath('/media/A.mkv', '', '')).toBe('/media/A.mkv')
  })

  it('compares webhook tokens safely', () => {
    expect(verifyIntegrationToken('secret', 'secret')).toBe(true)
    expect(verifyIntegrationToken('secret', 'other')).toBe(false)
    expect(verifyIntegrationToken('', 'secret')).toBe(false)
  })
})
