// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import TaskTimingCard from '../TaskTimingCard.vue'

const now = Date.now()
const iso = (offsetMs: number) => new Date(now + offsetMs).toISOString()

function mountCard(task: Record<string, any>) {
  return mount(TaskTimingCard, {
    props: {
      task: {
        createdAt: iso(-1_200_000),
        startedAt: iso(-600_000),
        stepStartedAt: iso(-300_000),
        ...task
      },
      timeZone: 'UTC'
    }
  })
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('TaskTimingCard', () => {
  it('renders elapsed and ETA for an active task', () => {
    const wrapper = mountCard({ step: 'translating', progress: 50, stepProgress: 50 })
    expect(wrapper.text()).toContain('开始处理')
    expect(wrapper.text()).toContain('已进行')
    expect(wrapper.text()).toContain('当前阶段预计')
    expect(wrapper.text()).toContain('预计剩余')
    expect(wrapper.text()).toContain('预计完成')
    wrapper.unmount()
  })

  it('freezes elapsed and hides ETA while paused', () => {
    const wrapper = mountCard({ step: 'paused', progress: 40, stepProgress: 40, pausedAt: iso(-60_000), pausedTotalMs: 30_000 })
    expect(wrapper.text()).toContain('已进行（暂停中）')
    expect(wrapper.text()).toContain('已暂停')
    expect(wrapper.text()).not.toContain('预计完成')
    wrapper.unmount()
  })

  it('shows finish time and total duration for terminal tasks', () => {
    const wrapper = mountCard({
      step: 'done',
      progress: 100,
      finishedAt: iso(-60_000),
      pausedTotalMs: 120_000
    })
    expect(wrapper.text()).toContain('完成时间')
    expect(wrapper.text()).toContain('总耗时')
    expect(wrapper.text()).not.toContain('预计剩余')
    wrapper.unmount()
  })

  it('hides overall ETA for ASR recognition stages', () => {
    const wrapper = mountCard({ step: 'transcribing', sourceType: 'asr', progress: 50, stepProgress: 50 })
    expect(wrapper.text()).toContain('翻译阶段开始后估算')
    expect(wrapper.text()).not.toContain('预计完成')
    wrapper.unmount()
  })

  it('labels the resumed stage and avoids stale ETA for a resumed ASR task', () => {
    const wrapper = mountCard({
      step: 'transcribing',
      sourceType: 'asr',
      progress: 50,
      stepProgress: 50,
      pausedTotalMs: 60_000
    })
    expect(wrapper.text()).toContain('当前阶段（本次恢复后）')
    expect(wrapper.text()).toContain('翻译阶段开始后估算')
    expect(wrapper.text()).not.toContain('预计完成')
    expect(wrapper.text()).not.toContain('约 ')
    wrapper.unmount()
  })

  it('shows paused ETA while a pause is pending and no clock', () => {
    const wrapper = mountCard({
      step: 'transcribing',
      sourceType: 'asr',
      progress: 50,
      stepProgress: 50,
      pauseRequested: true
    })
    expect(wrapper.text()).toContain('已暂停')
    expect(wrapper.text()).not.toContain('预计完成')
    expect(wrapper.text()).not.toContain('翻译阶段开始后估算')
    wrapper.unmount()
  })
})
