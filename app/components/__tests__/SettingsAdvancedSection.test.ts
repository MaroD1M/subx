// @vitest-environment happy-dom
import { reactive } from 'vue'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import SettingsAdvancedSection from '../SettingsAdvancedSection.vue'

const stubs = {
  SettingsSection: { props: ['title', 'description'], template: '<section><slot name="actions" /><slot /></section>' },
  USwitch: {
    props: ['modelValue', 'disabled'],
    emits: ['update:modelValue'],
    template: '<button type="button" role="switch" :aria-checked="String(modelValue)" :disabled="disabled" @click="$emit(\'update:modelValue\', !modelValue)" />'
  }
}

function mountSection(translationMode: string, streamUsage = false) {
  return mount(SettingsAdvancedSection, {
    props: { config: reactive({ translationMode, streamUsage }) },
    global: { stubs }
  })
}

describe('SettingsAdvancedSection', () => {
  it('renders the advanced settings section', () => {
    const wrapper = mountSection('stream')

    expect(wrapper.text()).toContain('流式用量统计')
    expect(wrapper.text()).toContain('仅在流式模式下生效')
  })

  it('disables the stream usage switch outside stream mode', () => {
    const wrapper = mountSection('non_stream')

    expect(wrapper.find('button[role="switch"]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('.opacity-60').exists()).toBe(true)
  })

  it('enables the switch and emits updates in stream mode', async () => {
    const wrapper = mountSection('stream')
    const toggle = wrapper.find('button[role="switch"]')

    expect(toggle.attributes('disabled')).toBeUndefined()
    await toggle.trigger('click')

    expect(wrapper.emitted('update:config')?.[0]).toEqual([{ streamUsage: true }])
  })
})
