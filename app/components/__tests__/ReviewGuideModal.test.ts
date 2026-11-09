// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ReviewGuideModal from '../ReviewGuideModal.vue'

const stubs = {
  UModal: {
    props: ['open', 'title', 'description'],
    template: '<div v-if="open"><h2>{{ title }}</h2><p>{{ description }}</p><slot name="body" /><slot name="footer" /></div>'
  },
  UButton: {
    props: ['label'],
    emits: ['click'],
    template: '<button @click="$emit(\'click\')">{{ label }}</button>'
  }
}

describe('ReviewGuideModal', () => {
  it('shows the review workflow guidance', () => {
    const wrapper = mount(ReviewGuideModal, {
      props: { open: true },
      global: { stubs }
    })

    expect(wrapper.text()).toContain('字幕核对操作指南')
    expect(wrapper.text()).toContain('先筛选，再决定处理范围')
    expect(wrapper.text()).toContain('重译会覆盖内容')
    expect(wrapper.text()).toContain('Ctrl/Cmd + S')
  })

  it('closes from the footer action', async () => {
    const wrapper = mount(ReviewGuideModal, {
      props: { open: true },
      global: { stubs }
    })

    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('update:open')?.[0]).toEqual([false])
  })
})
