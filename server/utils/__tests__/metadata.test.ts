import { describe, expect, it } from 'vitest'
import { parseMediaHint } from '../metadata'

describe('metadata filename hints', () => {
  it('parses TV episode metadata', () => {
    expect(parseMediaHint('/media/Shows/Shogun/Shogun.S01E03.1080p.WEB-DL.mkv')).toMatchObject({
      mediaType: 'tv',
      title: 'Shogun',
      season: 1,
      episode: 3
    })
  })

  it('parses movie titles and years', () => {
    expect(parseMediaHint('/media/Movies/Dune.Part.Two.2024.2160p.mkv')).toMatchObject({
      mediaType: 'movie',
      title: 'Dune Part Two',
      year: '2024'
    })
  })

  it('parses Chinese episode markers', () => {
    expect(parseMediaHint('/media/剧集/示例剧 第 12 集.mkv')).toMatchObject({
      mediaType: 'tv',
      title: '示例剧',
      episode: 12
    })
  })

  it('falls back to the parent folder when the episode has no title', () => {
    expect(parseMediaHint('/media/Shows/My Show/S01E02.mkv')).toMatchObject({
      mediaType: 'tv',
      title: 'My Show',
      season: 1,
      episode: 2
    })
  })
})
