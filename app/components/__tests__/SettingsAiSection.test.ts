// @vitest-environment happy-dom
import { reactive } from 'vue'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import SettingsAiSection from '../SettingsAiSection.vue'

const stubs = {
  ClientOnly: { template: '<slot />' },
  SettingsSection: { props: ['title', 'description'], template: '<section><slot name="actions" /><slot /></section>' },
  UIcon: true,
  UButton: {
    props: ['label'],
    emits: ['click'],
    template: '<button @click="$emit(\'click\')">{{ label }}</button>'
  },
  UFormField: { props: ['label'], template: '<label>{{ label }}<slot /></label>' },
  UInput: {
    props: ['modelValue'],
    emits: ['update:modelValue', 'blur'],
    template: '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" @blur="$emit(\'blur\')" />'
  },
  USelect: {
    props: ['modelValue', 'items'],
    emits: ['update:modelValue'],
    template: '<select :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="item in items" :key="item.value" :value="item.value">{{ item.label }}</option></select>'
  },
  USwitch: {
    props: ['modelValue', 'disabled'],
    emits: ['update:modelValue'],
    template: '<button type="button" role="switch" :aria-checked="String(modelValue)" :disabled="disabled" @click="$emit(\'update:modelValue\', !modelValue)" />'
  }
}

function makeConfig() {
  return reactive({
    apiKey: '',
    providerType: 'openai-compatible',
    apiBaseUrl: 'https://api.openai.com/v1',
    defaultModel: ''
  })
}

function mountSection(overrides: Record<string, any> = {}) {
  return mount(SettingsAiSection, {
    props: {
      config: makeConfig(),
      providerTypeItems: [
        { label: 'OpenAI 兼容（推荐）', value: 'openai-compatible' },
        { label: 'Anthropic 原生', value: 'anthropic' }
      ],
      modelItems: [],
      useManualModelInput: false,
      fetchingModels: false,
      modelError: '',
      isInsecure: false,
      ...overrides
    },
    global: { stubs }
  })
}

describe('SettingsAiSection', () => {
  it('renders the AI connection fields and provider guide', () => {
    const wrapper = mountSection()

    expect(wrapper.text()).toContain('接口密钥')
    expect(wrapper.text()).toContain('Provider 类型')
    expect(wrapper.text()).toContain('使用 NAS 本地模型')
    expect(wrapper.find('input[placeholder="sk-..."]').exists()).toBe(true)
  })

  it('emits config patches when the API key changes and requests models on blur', async () => {
    const wrapper = mountSection()
    const input = wrapper.find('input[placeholder="sk-..."]')

    await input.setValue('sk-test')
    await input.trigger('blur')

    expect(wrapper.emitted('update:config')?.[0]).toEqual([{ apiKey: 'sk-test' }])
    expect(wrapper.emitted('fetch-models')).toHaveLength(1)
  })

  it('emits provider and manual-model switch updates', async () => {
    const wrapper = mountSection()

    await wrapper.find('select').setValue('anthropic')
    await wrapper.find('button[role="switch"]').trigger('click')

    expect(wrapper.emitted('update:config')?.[0]).toEqual([{ providerType: 'anthropic' }])
    expect(wrapper.emitted('update:useManualModelInput')?.[0]).toEqual([true])
  })

  it('opens the provider guide from the section action', async () => {
    const wrapper = mountSection()
    const guide = wrapper.findAll('button').find(button => button.text() === '接口说明')

    expect(guide).toBeTruthy()
    await guide!.trigger('click')

    expect(wrapper.emitted('open-guide')).toHaveLength(1)
  })
})
