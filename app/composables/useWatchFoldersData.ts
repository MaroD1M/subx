export function useWatchFoldersData() {
  return useFetch('/api/watch-folders', {
    key: 'app:watch-folders',
    getCachedData: (key, nuxtApp, ctx) => {
      if (ctx?.cause === 'refresh:manual' || ctx?.cause === 'refresh:hook') return undefined
      return nuxtApp.payload.data[key] ?? nuxtApp.static.data[key]
    }
  })
}
