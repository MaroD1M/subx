// @vitest-environment happy-dom
import { computed, reactive, ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import AutomationTokensPanel from '../AutomationTokensPanel.vue'

const toastAdd = vi.fn()
const refresh = vi.fn(async () => {})
const confirm = vi.fn(async () => true)
const fetchMock = vi.fn(async () => ({ success: true }))
const tokensData = ref({
  tokens: [
    { id: 1, name: 'Active Token', prefix: 'subx_abc', scopes: ['tasks:read'], expiresAt: null, lastUsedAt: null, createdAt: '2026-01-01 00:00:00', revokedAt: null },
    { id: 2, name: 'Revoked Token', prefix: 'subx_def', scopes: ['tasks:write'], expiresAt: null, lastUsedAt: null, createdAt: '2026-01-01 00:00:00', revokedAt: '2026-01-02 00:00:00' }
  ]
})

beforeAll(() => {
  vi.stubGlobal('ref', ref)
  vi.stubGlobal('computed', computed)
  vi.stubGlobal('reactive', reactive)
  vi.stubGlobal('useToast', () => ({ add: toastAdd }))
  vi.stubGlobal('useConfirm', () => ({ confirm }))
  vi.stubGlobal('useTimeZone', () => 'Asia/Shanghai')
  vi.stubGlobal('useFetch', () => ({ data: tokensData, error: ref(null), refresh }))
  vi.stubGlobal('$fetch', fetchMock)
})

const stubs = {
  UIcon: true,
  UBadge: { template: '<span><slot /></span>' },
  UButton: {
    props: ['label'],
    emits: ['click'],
    template: '<button @click="$emit(\'click\')">{{ label }}</button>'
  },
  UModal: {
    props: ['open', 'title', 'description'],
    template: '<div v-if="open"><h2>{{ title }}</h2><slot name="body" /></div>'
  },
  UFormField: { props: ['label'], template: '<label>{{ label }}<slot /></label>' },
  UInput: { props: ['modelValue'], template: '<input :value="modelValue" />' }
}

function mountPanel() {
  return mount({ components: { AutomationTokensPanel }, template: '<Suspense><AutomationTokensPanel base-url="http://localhost:3000" /></Suspense>' }, { global: { stubs } })
}

describe('AutomationTokensPanel', () => {
  it('renders active and revoked tokens', async () => {
    const wrapper = mountPanel()
    await flushPromises()

    expect(wrapper.text()).toContain('Active Token')
    expect(wrapper.text()).toContain('Revoked Token')
    expect(wrapper.text()).toContain('有效')
    expect(wrapper.text()).toContain('已撤销')
    expect(wrapper.text()).toContain('tasks:read')
  })

  it('revokes an active token after confirmation', async () => {
    const wrapper = mountPanel()
    await flushPromises()
    toastAdd.mockClear()
    fetchMock.mockClear()

    const revoke = wrapper.findAll('button').find(button => button.text() === '撤销')
    expect(revoke).toBeTruthy()
    await revoke!.trigger('click')
    await flushPromises()

    expect(confirm).toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledWith('/api/api-tokens/1', { method: 'DELETE' })
    expect(refresh).toHaveBeenCalled()
    expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({ title: '已撤销' }))
  })
})
