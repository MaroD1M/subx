// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { computed } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import ReviewProofreadPanel from '../ReviewProofreadPanel.vue'

vi.stubGlobal('computed', computed)
vi.stubGlobal('useTimeZone', () => 'Asia/Shanghai')

const stubs = {
  UIcon: true,
  UBadge: { template: '<span><slot /></span>' },
  UButton: {
    props: ['label'],
    emits: ['click'],
    template: '<button @click="$emit(\'click\')">{{ label }}</button>'
  }
}

function mountPanel(issues: any[]) {
  return mount(ReviewProofreadPanel, {
    props: {
      kind: 'consistency',
      state: {
        result: { terms: [], issues },
        meta: null,
        loading: false
      },
      glossary: {},
      issueTypes: [],
      issueCount: issues.length,
      issueFilter: '',
      applyingTerms: false
    },
    global: { stubs }
  })
}

describe('ReviewProofreadPanel', () => {
  it('uses the shared proofread issue labels', () => {
    const wrapper = mountPanel([
      { subtitleId: '1', type: 'name_inconsistency', message: '译名不统一' },
      { subtitleId: '2', type: 'terminology', message: '术语不统一' },
      { subtitleId: '3', type: 'mistranslation', message: '可能误译' }
    ])

    expect(wrapper.text()).toContain('人名/译名不一致')
    expect(wrapper.text()).toContain('术语不一致')
    expect(wrapper.text()).toContain('疑似误译')
  })

  it('falls back to the raw issue type for unknown types', () => {
    const wrapper = mountPanel([
      { subtitleId: '9', type: 'custom_issue', message: '未知问题' }
    ])

    expect(wrapper.text()).toContain('custom_issue')
  })
})
