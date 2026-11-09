// @vitest-environment happy-dom
import { ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import SettingsStoragePanel from '../SettingsStoragePanel.vue'

const toastAdd = vi.fn()
const refresh = vi.fn(async () => {})
const storageData = ref({
  disk: { totalBytes: 2 * 1024 ** 3, freeBytes: 1.5 * 1024 ** 3, usedBytes: 0.5 * 1024 ** 3, usedPercent: 25 },
  cacheBytes: 1024 ** 2,
  cacheFiles: 3,
  categories: [
    { key: 'aiLogs', label: 'AI 日志', description: '模型请求日志', path: '/app/temp/ai-logs', bytes: 1024 ** 2, files: 3, cleanable: true, defaultDays: 7 }
  ]
})

beforeAll(() => {
  vi.stubGlobal('ref', ref)
  vi.stubGlobal('onMounted', (callback: () => void) => callback())
  vi.stubGlobal('useToast', () => ({ add: toastAdd }))
  vi.stubGlobal('useFetch', () => ({ data: storageData, error: ref(null), refresh }))
})

const stubs = {
  SettingsSection: { template: '<section><slot name="actions" /><slot /></section>' },
  UButton: {
    props: ['label'],
    emits: ['click'],
    template: '<button @click="$emit(\'click\')">{{ label }}</button>'
  },
  UBadge: { template: '<span><slot /></span>' },
  UModal: {
    props: ['open', 'title', 'description'],
    template: '<div v-if="open"><h2>{{ title }}</h2><p>{{ description }}</p><slot name="content" /></div>'
  },
  UIcon: true
}

describe('SettingsStoragePanel', () => {
  it('renders storage summary and cleanup categories', async () => {
    const wrapper = mount({ components: { SettingsStoragePanel }, template: '<Suspense><SettingsStoragePanel /></Suspense>' }, { global: { stubs } })
    await flushPromises()

    expect(wrapper.text()).toContain('2.0 GB')
    expect(wrapper.text()).toContain('AI 日志')
    expect(wrapper.text()).toContain('/app/temp/ai-logs')
    expect(wrapper.text()).toContain('1.0 MB')
    expect(refresh).toHaveBeenCalled()
  })

  it('opens cleanup confirmation for a category', async () => {
    const wrapper = mount({ components: { SettingsStoragePanel }, template: '<Suspense><SettingsStoragePanel /></Suspense>' }, { global: { stubs } })
    await flushPromises()

    const cleanup = wrapper.findAll('button').find(button => button.text() === '全部清理')
    expect(cleanup).toBeTruthy()
    await cleanup!.trigger('click')
    expect(wrapper.text()).toContain('确认清理')
    expect(wrapper.text()).toContain('清理全部AI 日志？')
  })
})
