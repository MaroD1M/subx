// @vitest-environment happy-dom
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import FileBrowser from '../FileBrowser.vue'
import FileNodeItem from '../FileNodeItem.vue'

const toastAdd = vi.fn()
const navigateTo = vi.fn()
const appConfig = ref({
  mediaRoots: [
    { id: 'movies', name: '电影库', path: '/media/movies', enabled: true, isDefault: true, order: 1 }
  ],
  stylePreset: 'default',
  targetLanguage: 'zh-CN',
  outputMode: 'translated',
  subtitleFormat: 'srt',
  subtitleStylePreset: 'bilingual_simple',
  bilingualLayout: 'translated_first'
})

const rootNodes = [
  {
    name: 'Show',
    path: 'Show',
    rootId: 'movies',
    isDir: true,
    loaded: false,
    hasChildren: true
  },
  {
    name: 'movie.mkv',
    path: 'movie.mkv',
    rootId: 'movies',
    isDir: false
  }
]

const expandedChildren = [
  {
    name: 'episode.mkv',
    path: 'Show/episode.mkv',
    rootId: 'movies',
    isDir: false
  }
]

const searchFiles = [
  { name: 'Found.S01E01.mkv', path: 'Show/Found.S01E01.mkv', rootId: 'movies', isDir: false }
]

async function defaultFetchMock(url: string, options: any = {}) {
  if (url === '/api/files') {
    if (options.query?.path === 'Show') return expandedChildren
    return rootNodes
  }
  if (url === '/api/files/search') {
    return { files: searchFiles, truncated: false }
  }
  if (url === '/api/tracks') {
    return {
      tracks: [{ index: 0, codec: 'subrip', language: 'zh', isSupported: true, isDefault: true }],
      audioTracks: []
    }
  }
  if (url === '/api/subtitle-content') {
    return { entries: [{ id: 1, startTime: '00:00:01,000', text: '你好' }], total: 1 }
  }
  if (url === '/api/files/scan') {
    return { files: [rootNodes[1]], truncated: false }
  }
  if (url === '/api/task') {
    return { taskIds: ['task-1'] }
  }
  return {}
}

const fetchMock = vi.fn(defaultFetchMock)
const storage: Record<string, string> = {}

beforeAll(() => {
  vi.stubGlobal('ref', ref)
  vi.stubGlobal('computed', computed)
  vi.stubGlobal('reactive', reactive)
  vi.stubGlobal('watch', watch)
  vi.stubGlobal('onMounted', onMounted)
  vi.stubGlobal('onBeforeUnmount', onBeforeUnmount)
  vi.stubGlobal('useToast', () => ({ add: toastAdd }))
  vi.stubGlobal('useAppConfigData', () => ({ data: appConfig }))
  vi.stubGlobal('$fetch', fetchMock)
  vi.stubGlobal('navigateTo', navigateTo)
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage[key] ?? null,
    setItem: (key: string, value: string) => { storage[key] = String(value) },
    removeItem: (key: string) => { delete storage[key] },
    clear: () => { for (const key of Object.keys(storage)) delete storage[key] }
  })
})

beforeEach(() => {
  fetchMock.mockReset()
  fetchMock.mockImplementation(defaultFetchMock)
  toastAdd.mockClear()
  navigateTo.mockClear()
  for (const key of Object.keys(storage)) delete storage[key]
})

const stubs = {
  UIcon: true,
  UBadge: { template: '<span><slot /></span>' },
  UButton: {
    props: ['label', 'disabled', 'loading'],
    emits: ['click'],
    template: '<button :disabled="disabled" @click="$emit(\'click\')">{{ label }}</button>'
  },
  UFormField: { template: '<div><slot /></div>' },
  UInput: {
    props: ['modelValue'],
    emits: ['update:model-value'],
    template: '<input :value="modelValue" @input="$emit(\'update:model-value\', $event.target.value)" />'
  },
  USelect: {
    props: ['modelValue', 'items'],
    template: '<div><span v-for="item in items" :key="item.value">{{ item.label }}</span></div>'
  },
  USwitch: { props: ['modelValue'], template: '<div />' },
  URadioGroup: { props: ['modelValue'], template: '<div />' },
  UTextarea: { props: ['modelValue'], template: '<div />' },
  UCheckbox: { props: ['modelValue', 'disabled'], template: '<input type="checkbox" />' },
  UModal: { props: ['open'], template: '<div v-if="open"><slot name="content" /></div>' }
}

function mountBrowser() {
  return mount(
    { components: { FileBrowser }, template: '<Suspense><FileBrowser /></Suspense>' },
    { global: { stubs, components: { FileNodeItem } } }
  )
}

function wait(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

afterEach(() => {
  vi.clearAllTimers()
})

describe('FileBrowser', () => {
  it('loads root directory from the mocked app config', async () => {
    const wrapper = mountBrowser()
    await flushPromises()

    expect(fetchMock).toHaveBeenCalledWith('/api/files', { query: { rootId: 'movies' } })
    expect(wrapper.text()).toContain('电影库')
    expect(wrapper.text()).toContain('Show')
    expect(wrapper.text()).toContain('movie.mkv')
    wrapper.unmount()
  })

  it('expands a directory and loads its children on demand', async () => {
    const wrapper = mountBrowser()
    await flushPromises()

    const folder = wrapper.findAll('[role="treeitem"]').find(item => item.text().includes('Show'))
    expect(folder).toBeTruthy()
    await folder!.trigger('click')
    await flushPromises()

    expect(fetchMock).toHaveBeenCalledWith('/api/files', { query: { rootId: 'movies', path: 'Show' } })
    expect(wrapper.text()).toContain('episode.mkv')
    expect(folder!.attributes('aria-expanded')).toBe('true')
    wrapper.unmount()
  })

  it('selects a video file and requests its tracks', async () => {
    const wrapper = mountBrowser()
    await flushPromises()

    const file = wrapper.findAll('[role="treeitem"]').find(item => item.text().includes('movie.mkv'))
    expect(file).toBeTruthy()
    await file!.trigger('click')
    await flushPromises()

    expect(fetchMock).toHaveBeenCalledWith('/api/tracks', { query: { path: 'movie.mkv', rootId: 'movies' } })
    expect(wrapper.text()).toContain('字幕轨道：')
    expect(wrapper.text()).toContain('movie.mkv')
    wrapper.unmount()
  })

  it('triggers a debounced server search after typing at least two characters', async () => {
    const wrapper = mountBrowser()
    await flushPromises()

    await wrapper.find('input').setValue('fo')
    await wait(350)
    await flushPromises()

    expect(fetchMock).toHaveBeenCalledWith('/api/files/search', expect.objectContaining({
      query: { rootId: 'movies', q: 'fo', limit: 200 },
      signal: expect.any(AbortSignal)
    }))
    expect(wrapper.text()).toContain('Found.S01E01.mkv')
    wrapper.unmount()
  })

  it('aborts an in-flight server search when a new search starts', async () => {
    let firstSignal: AbortSignal | undefined
    fetchMock.mockImplementation(async (url: string, options: any = {}) => {
      if (url === '/api/files') return rootNodes
      if (url === '/api/files/search') {
        if (options.query?.q === 'fo') {
          firstSignal = options.signal as AbortSignal
          return await new Promise((_resolve, reject) => {
            options.signal?.addEventListener('abort', () => {
              const error: any = new Error('The operation was aborted')
              error.name = 'AbortError'
              reject(error)
            }, { once: true })
          })
        }
        return { files: [{ name: 'Second.mkv', path: 'Second.mkv', rootId: 'movies', isDir: false }], truncated: false }
      }
      return {}
    })

    const wrapper = mountBrowser()
    await flushPromises()

    await wrapper.find('input').setValue('fo')
    await wait(300)
    await flushPromises()
    expect(firstSignal).toBeTruthy()
    expect(firstSignal!.aborted).toBe(false)

    await wrapper.find('input').setValue('second')
    await wait(300)
    await flushPromises()

    expect(firstSignal!.aborted).toBe(true)
    expect(wrapper.text()).toContain('Second.mkv')
    expect(wrapper.text()).not.toContain('搜索失败')
    wrapper.unmount()
  })

  it('toggles batch mode, collects selected files and launches batch tasks', async () => {
    const wrapper = mountBrowser()
    await flushPromises()

    const batchToggle = wrapper.findAll('button').find(button => button.text() === '多选')
    expect(batchToggle).toBeTruthy()
    await batchToggle!.trigger('click')
    await flushPromises()

    const nodeItems = wrapper.findAllComponents(FileNodeItem)
    const movieItem = nodeItems.find(item => item.props('node')?.name === 'movie.mkv')
    expect(movieItem).toBeTruthy()
    movieItem!.vm.$emit('toggle-select', movieItem!.props('node'))
    await flushPromises()

    expect(wrapper.text()).toContain('1 个文件')
    const launch = wrapper.findAll('button').find(button => button.text().includes('批量加入队列'))
    expect(launch).toBeTruthy()
    await launch!.trigger('click')
    await flushPromises()

    expect(fetchMock).toHaveBeenCalledWith('/api/task', expect.objectContaining({ method: 'POST' }))
    expect(navigateTo).toHaveBeenCalledWith('/history')
    wrapper.unmount()
  })
})
