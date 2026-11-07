export function useAppConfigData() {
  return useFetch('/api/config', {
    key: 'app:config',
    getCachedData: (key, nuxtApp, ctx) => {
      if (ctx?.cause === 'refresh:manual' || ctx?.cause === 'refresh:hook') return undefined
      return nuxtApp.payload.data[key] ?? nuxtApp.static.data[key]
    }
  })
}
