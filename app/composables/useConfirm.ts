import { getCurrentScope, onScopeDispose } from 'vue'

export interface ConfirmOptions {
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  color?: 'primary' | 'error' | 'warning' | 'neutral'
}

let resolver: ((value: boolean) => void) | null = null

export function useConfirm() {
  const state = useState<ConfirmOptions | null>('app:confirm-dialog', () => null)

  function confirm(options: ConfirmOptions): Promise<boolean> {
    if (resolver) {
      resolver(false)
      resolver = null
    }
    state.value = options
    return new Promise<boolean>((resolve) => {
      let settled = false
      const finish = (value: boolean) => {
        if (settled) return
        settled = true
        if (resolver === finish) resolver = null
        resolve(value)
      }
      resolver = finish
      if (getCurrentScope()) {
        onScopeDispose(() => finish(false))
      }
    })
  }

  function resolve(value: boolean) {
    const pending = resolver
    resolver = null
    state.value = null
    pending?.(value)
  }

  return { state, confirm, resolve }
}
