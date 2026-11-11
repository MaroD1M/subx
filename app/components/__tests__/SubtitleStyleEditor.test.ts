// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import SubtitleStyleEditor from '../SubtitleStyleEditor.vue'
import { createSubtitleStyle } from '../../../shared/subtitleStyles'

const stubs = {
  UFormField: { props: ['label'], template: '<label>{{ label }}<slot /></label>' },
  UInput: {
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template: '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />'
  },
  UInputNumber: {
    props: ['modelValue', 'disabled'],
    emits: ['update:modelValue'],
    template: '<input type="number" :value="modelValue" :disabled="disabled" @input="$emit(\'update:modelValue\', Number($event.target.value))" />'
  },
  USelect: {
    props: ['modelValue', 'items', 'disabled'],
    emits: ['update:modelValue'],
    template: '<select :value="modelValue" :disabled="disabled" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="item in items" :key="item.value" :value="item.value">{{ item.label }}</option></select>'
  },
  USwitch: {
    props: ['modelValue', 'disabled'],
    emits: ['update:modelValue'],
    template: '<button type="button" role="switch" :aria-checked="String(modelValue)" :disabled="disabled" @click="$emit(\'update:modelValue\', !modelValue)" />'
  },
  UBadge: { template: '<span><slot /></span>' },
  UButton: { template: '<button><slot /></button>' },
  USlider: {
    props: ['modelValue'],
    emits: ['update:modelValue', 'change'],
    template: '<input type="range" :value="modelValue" @input="$emit(\'update:modelValue\', Number($event.target.value))" @change="$emit(\'change\')" />'
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

function mountEditor(overrides: Record<string, any> = {}) {
  return mount(SubtitleStyleEditor, {
    props: {
      modelValue: createSubtitleStyle('bilingual_simple', 'bilingual'),
      outputMode: 'bilingual',
      subtitleFormat: 'ass',
      bilingualLayout: 'translated_first',
      ...overrides
    },
    global: { stubs }
  })
}

describe('SubtitleStyleEditor', () => {
  it('renders original and translated style cards for bilingual mode', () => {
    const wrapper = mountEditor()
    expect(wrapper.text()).toContain('原文样式')
    expect(wrapper.text()).toContain('译文样式')
    expect(wrapper.text()).toContain('1920 × 1080 预览')
  })

  it('hides unused language cards by output mode', () => {
    expect(mountEditor({ outputMode: 'translated' }).text()).not.toContain('原文样式')
    expect(mountEditor({ outputMode: 'original' }).text()).not.toContain('译文样式')
  })

  it('shows the SRT limitation hint and disables typography number inputs', () => {
    const wrapper = mountEditor({ subtitleFormat: 'srt' })
    expect(wrapper.text()).toContain('SRT 不保存字体、颜色和描边')
    expect(wrapper.findAll('input[type="number"]').some(input => input.attributes('disabled') !== undefined)).toBe(true)
  })

  it('emits a new style object when the preset changes', async () => {
    const wrapper = mountEditor()
    const presetSelect = wrapper.findAll('select')[0]!
    await presetSelect.setValue('bilingual_cinema')
    const emitted = wrapper.emitted('update:modelValue')?.at(-1)?.[0] as any
    expect(emitted.presetId).toBe('bilingual_cinema')
    expect(emitted.translated.fontSize).toBe(56)
  })

  it('updates the controlled style when the parent changes output mode', async () => {
    const wrapper = mountEditor()
    await wrapper.setProps({
      outputMode: 'original',
      modelValue: createSubtitleStyle('mono_clean', 'original')
    })
    expect(wrapper.text()).toContain('原文样式')
    expect(wrapper.text()).not.toContain('译文样式')
  })

  it('requests a new real preview only after the slider commits', async () => {
    const previewBodies: any[] = []
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes('/api/preview/frame')) {
        previewBodies.push(JSON.parse(String(init?.body || '{}')))
        return new Response(new Blob(['image'], { type: 'image/png' }), {
          status: 200,
          headers: {
            'X-Preview-Width': '1920',
            'X-Preview-Height': '1080',
            'X-Preview-Time': '0',
            'X-Preview-Duration': '100'
          }
        })
      }
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
    })
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:preview'),
      revokeObjectURL: vi.fn()
    })

    const wrapper = mountEditor({ previewSource: { taskId: 'task-1' } })
    const previewSwitch = wrapper.find('button[aria-label="实景预览"]')
    expect(previewSwitch.exists()).toBe(true)
    await previewSwitch.trigger('click')
    await vi.waitFor(() => expect(previewBodies.length).toBeGreaterThan(0))
    await vi.waitFor(() => expect(wrapper.find('input[type="range"]').exists()).toBe(true))

    const slider = wrapper.find('input[type="range"]')
    const beforeCommit = previewBodies.length
    await slider.setValue('42.5')
    await vi.waitFor(() => expect(previewBodies.length).toBe(beforeCommit + 1))
    expect(previewBodies.at(-1)?.time).toBe(42.5)
  })
})
