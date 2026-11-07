export interface NavItem {
  label: string
  shortLabel: string
  icon: string
  to: string
}

export const NAV_ITEMS: NavItem[] = [
  { label: '首页', shortLabel: '首页', icon: 'i-lucide-home', to: '/' },
  { label: '翻译历史', shortLabel: '历史', icon: 'i-lucide-history', to: '/history' },
  { label: '媒体库', shortLabel: '媒体库', icon: 'i-lucide-library-big', to: '/media-libraries' },
  { label: '自动化', shortLabel: '自动化', icon: 'i-lucide-workflow', to: '/automation' },
  { label: '设置', shortLabel: '设置', icon: 'i-lucide-settings', to: '/settings' }
]

export function isNavigationActive(path: string, routePath: string) {
  if (path === '/') return routePath === '/'
  if (path === '/history') {
    return routePath.startsWith('/history') || routePath.startsWith('/task') || routePath.startsWith('/review')
  }
  return routePath.startsWith(path)
}

export function useNavigation() {
  const route = useRoute()
  const currentPath = computed(() => route.path)
  return {
    navItems: NAV_ITEMS,
    isActive: (path: string) => isNavigationActive(path, currentPath.value)
  }
}
