// @vitest-environment happy-dom
import { reactive } from 'vue'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import SettingsDefaultSection from '../SettingsDefaultSection.vue'

const stubs = {
  SettingsSection: { props: ['title', 'description'], template: '<section><slot name="actions" /><slot /></section>' },
  UFormField: { props: ['label'], template: '<label>{{ label }}<slot /></label>' },
  UInput: {
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template: '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />'
  },
  UInputNumber: {
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template: '<input type="number" :value="modelValue" @input="$emit(\'update:modelValue\', Number($event.target.value))" />'
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

function makeConfig(overrides: Record<string, any> = {}) {
  return reactive({
    targetLanguage: 'zh-CN',
    outputMode: 'translated',
    translationMode: 'non_stream',
    embyCompatibleOutput: false,
    qualityCheckEnabled: true,
    qualityCheckModel: 'gpt-4o-mini',
    qualityCheckMaxEntries: 200,
    defaultModel: 'gpt-4o-mini',
    chunkSize: 4000,
    concurrency: 2,
    maxRetries: 1,
    logRetentionDays: 7,
    ...overrides
  })
}

function mountSection(overrides: Record<string, any> = {}) {
  return mount(SettingsDefaultSection, {
    props: {
      config: makeConfig(),
      languageOptions: [
        { label: '简体中文', value: 'zh-CN' },
        { label: '日语', value: 'ja' }
      ],
      outputModeItems: [
        { label: '仅显示译文', value: 'translated' },
        { label: '双语对照', value: 'bilingual' }
      ],
      translationModeItems: [
        { label: '非流式（推荐）', value: 'non_stream' },
        { label: '流式（兼容性较弱）', value: 'stream' }
      ],
      qualityThresholdPercent: 70,
      ...overrides
    },
    global: { stubs }
  })
}

describe('SettingsDefaultSection', () => {
  it('renders default translation fields', () => {
    const wrapper = mountSection()

    expect(wrapper.text()).toContain('目标语言')
    expect(wrapper.text()).toContain('Emby 兼容输出')
    expect(wrapper.text()).toContain('分块大小')
    expect(wrapper.text()).toContain('校验模型与主翻译模型相同')
  })

  it('emits config patches for selects and switches', async () => {
    const wrapper = mountSection()

    await wrapper.findAll('select')[0]!.setValue('ja')
    await wrapper.find('button[aria-label="启用 Emby 兼容输出"]').trigger('click')

    expect(wrapper.emitted('update:config')?.[0]).toEqual([{ targetLanguage: 'ja' }])
    expect(wrapper.emitted('update:config')?.[1]).toEqual([{ embyCompatibleOutput: true }])
  })

  it('emits numeric and threshold updates for quality check fields', async () => {
    const wrapper = mountSection()

    await wrapper.find('input[max="100"]').setValue('85')
    await wrapper.find('input[max="1000"]').setValue('250')

    expect(wrapper.emitted('update:qualityThresholdPercent')?.[0]).toEqual(['85'])
    expect(wrapper.emitted('update:config')?.[0]).toEqual([{ qualityCheckMaxEntries: 250 }])
  })

  it('emits numeric updates for translation limits', async () => {
    const wrapper = mountSection()

    const chunkSize = wrapper.find('input[max="50000"]')
    expect(chunkSize.exists()).toBe(true)
    await chunkSize.setValue('6000')

    expect(wrapper.emitted('update:config')?.[0]).toEqual([{ chunkSize: 6000 }])
  })
})
