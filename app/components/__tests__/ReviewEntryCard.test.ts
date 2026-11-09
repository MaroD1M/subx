// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ReviewEntryCard from '../ReviewEntryCard.vue'

const entry = {
  subtitleId: 12,
  selected: false,
  reviewStatus: 'needs_review',
  asrConfidence: 0.5,
  qualityScore: 0.8,
  originalText: 'Hello',
  translatedText: 'Hello',
  finalText: '你好',
  startTime: '00:00:01,000',
  endTime: '00:00:02,000',
  reviewReasons: ['same_as_source'],
  qualityIssues: ['omission']
}

const stubs = {
  UIcon: true,
  UCheckbox: { template: '<input type="checkbox" />', props: ['modelValue'] },
  UBadge: { template: '<span><slot /></span>' },
  UButton: {
    props: ['label'],
    emits: ['click'],
    template: '<button @click="$emit(\'click\')">{{ label }}</button>'
  },
  UTextarea: {
    props: ['modelValue'],
    emits: ['update:model-value'],
    template: '<textarea :value="modelValue" @input="$emit(\'update:model-value\', $event.target.value)" />'
  }
}

describe('ReviewEntryCard', () => {
  it('shows translation quality and review labels', () => {
    const wrapper = mount(ReviewEntryCard, {
      props: { entry, focused: false, proofreadIssues: [{ type: 'terminology', message: '术语不一致' }], qualityThreshold: 0.7, retranslating: false },
      global: { stubs }
    })

    expect(wrapper.text()).toContain('译文与原文相同')
    expect(wrapper.text()).toContain('导出已调整')
    expect(wrapper.text()).toContain('ASR 50%')
    expect(wrapper.text()).toContain('漏译')
    expect(wrapper.text()).toContain('AI 校对 1')
  })

  it('emits final text edits and restore actions', async () => {
    const wrapper = mount(ReviewEntryCard, {
      props: { entry, focused: true, proofreadIssues: [], qualityThreshold: 0.7, retranslating: false },
      global: { stubs }
    })

    await wrapper.find('textarea').setValue('新译文')
    expect(wrapper.emitted('update-final')?.at(-1)).toEqual([entry, '新译文'])

    const useOriginal = wrapper.findAll('button').find(button => button.text() === '使用原文')
    expect(useOriginal).toBeTruthy()
    await useOriginal!.trigger('click')
    expect(wrapper.emitted('use-original')?.[0]).toEqual([entry])
  })

  it('skips off-screen rendering with content-visibility while keeping focused cards visible', () => {
    const wrapper = mount(ReviewEntryCard, {
      props: { entry, focused: false, proofreadIssues: [], qualityThreshold: 0.7, retranslating: false },
      global: { stubs }
    })
    expect(wrapper.classes()).toContain('review-entry-card')
    expect(wrapper.attributes('style')).toContain('content-visibility: auto')
    expect(wrapper.attributes('style')).toContain('contain-intrinsic-size: auto 200px')

    const focused = mount(ReviewEntryCard, {
      props: { entry, focused: true, proofreadIssues: [], qualityThreshold: 0.7, retranslating: false },
      global: { stubs }
    })
    expect(focused.attributes('style')).toContain('content-visibility: visible')
  })
})
