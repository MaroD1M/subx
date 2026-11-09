// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import FileSearchResults from '../FileSearchResults.vue'

const results = [
  { name: 'Demo.S01E01.mkv', path: 'Shows/Demo/Demo.S01E01.mkv', rootId: 'default', isDir: false },
  { name: 'Demo.S01E01.zh.srt', path: 'Shows/Demo/Demo.S01E01.zh.srt', rootId: 'default', isDir: false }
]

describe('FileSearchResults', () => {
  it('shows loading state', () => {
    const wrapper = mount(FileSearchResults, {
      props: { results: [], loading: true },
      global: { stubs: { UIcon: true } }
    })
    expect(wrapper.text()).toContain('正在搜索整个媒体库')
  })

  it('shows errors and truncation hints', () => {
    const wrapper = mount(FileSearchResults, {
      props: { results, error: '搜索失败', truncated: true },
      global: { stubs: { UIcon: true } }
    })
    expect(wrapper.text()).toContain('搜索失败')
  })

  it('renders results and emits selections', async () => {
    const wrapper = mount(FileSearchResults, {
      props: { results },
      global: { stubs: { UIcon: true } }
    })

    expect(wrapper.text()).toContain('Demo.S01E01.mkv')
    expect(wrapper.text()).toContain('Shows/Demo/Demo.S01E01.zh.srt')
    await wrapper.findAll('button')[0]!.trigger('click')
    expect(wrapper.emitted('select')?.[0]).toEqual([results[0]])
  })

  it('shows empty and truncated states together', () => {
    const wrapper = mount(FileSearchResults, {
      props: { results: [], truncated: true },
      global: { stubs: { UIcon: true } }
    })
    expect(wrapper.text()).toContain('整个媒体库中没有匹配的文件')
    expect(wrapper.text()).toContain('结果过多')
  })
})
