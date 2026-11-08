// @vitest-environment happy-dom
import { computed, nextTick, ref, watch } from 'vue'
import { mount } from '@vue/test-utils'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import TaskLogsPanel from '../TaskLogsPanel.vue'

beforeAll(() => {
  vi.stubGlobal('ref', ref)
  vi.stubGlobal('computed', computed)
  vi.stubGlobal('watch', watch)
  vi.stubGlobal('nextTick', nextTick)
  vi.stubGlobal('useTimeZone', () => 'Asia/Shanghai')
})

const stubs = {
  ClientOnly: { template: '<slot />' },
  UIcon: true,
  UBadge: { template: '<span><slot /></span>' },
  UButton: { template: '<button @click="$emit(\'click\')"><slot /></button>' }
}

type TestLog = { type: 'info' | 'error', message: string, timestamp: string, category?: 'system' | 'translation' | 'export' | 'error' | 'process' }

function makeLogs(count: number): TestLog[] {
  return Array.from({ length: count }, (_, index) => ({
    type: 'info',
    message: `log-${index + 1}`,
    timestamp: '12:00:00',
    category: 'process'
  }))
}

describe('TaskLogsPanel', () => {
  it('collapses ordinary logs to the most recent entries', () => {
    const wrapper = mount(TaskLogsPanel, {
      props: { logs: makeLogs(20) },
      global: { stubs }
    })

    expect(wrapper.text()).toContain('显示 4 / 20 条')
    expect(wrapper.text()).toContain('log-17')
    expect(wrapper.text()).toContain('log-20')
    expect(wrapper.text()).not.toContain('log-1\n')
  })

  it('keeps error logs visible when collapsed', () => {
    const logs = makeLogs(20)
    logs[0] = { ...logs[0]!, type: 'error', category: 'error', message: 'failed-log' }
    const wrapper = mount(TaskLogsPanel, {
      props: { logs },
      global: { stubs }
    })

    expect(wrapper.text()).toContain('显示 5 / 20 条')
    expect(wrapper.text()).toContain('failed-log')
  })
})
