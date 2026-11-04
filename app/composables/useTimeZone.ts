import { normalizeTimeZone } from '~~/shared/time'

export function useTimeZone() {
  const runtimeConfig = useRuntimeConfig()
  return normalizeTimeZone(runtimeConfig.public.timeZone)
}
