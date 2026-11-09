// @vitest-environment happy-dom
import { computed } from 'vue'
import { mount } from '@vue/test-utils'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import FileNodeItem from '../FileNodeItem.vue'

beforeAll(() => {
  vi.stubGlobal('computed', computed)
})

const node = {
  name: 'Season 01',
  path: 'Shows/Demo/Season 01',
  rootId: 'default',
  isDir: true,
  loaded: true,
  hasChildren: true,
  children: [{ name: 'Demo.S01E01.mkv', path: 'Shows/Demo/Season 01/Demo.S01E01.mkv', rootId: 'default', isDir: false }]
}

const UCheckboxStub = { template: '<input type="checkbox" />', props: ['modelValue', 'disabled'] }

describe('FileNodeItem', () => {
  it('uses precomputed folder selection counts', () => {
    const wrapper = mount(FileNodeItem, {
      props: {
        node,
        selectable: true,
        selectedKeys: new Set<string>(),
        folderTotals: { 'default:Shows/Demo/Season 01': 3 },
        folderSelectedCounts: { 'default:Shows/Demo/Season 01': 2 },
        expandedKeys: []
      },
      global: { stubs: { UCheckbox: UCheckboxStub, UIcon: true } }
    })

    expect(wrapper.findComponent(UCheckboxStub).props('modelValue')).toBe('indeterminate')
  })

  it('marks the folder fully checked when counts match', () => {
    const wrapper = mount(FileNodeItem, {
      props: {
        node,
        selectable: true,
        selectedKeys: new Set<string>(),
        folderTotals: { 'default:Shows/Demo/Season 01': 2 },
        folderSelectedCounts: { 'default:Shows/Demo/Season 01': 2 },
        expandedKeys: []
      },
      global: { stubs: { UCheckbox: UCheckboxStub, UIcon: true } }
    })

    expect(wrapper.findComponent(UCheckboxStub).props('modelValue')).toBe(true)
  })

  it('auto-expands matching folders while searching', () => {
    const wrapper = mount(FileNodeItem, {
      props: {
        node,
        expandedKeys: [],
        searchActive: true,
        selectedKeys: new Set<string>()
      },
      global: { stubs: { UCheckbox: UCheckboxStub, UIcon: true } }
    })

    expect(wrapper.find('[role="treeitem"]').attributes('aria-expanded')).toBe('true')
    expect(wrapper.text()).toContain('Demo.S01E01.mkv')
  })
})
