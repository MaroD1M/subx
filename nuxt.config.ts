import { readFileSync } from 'node:fs'
import { STYLE_PRESETS } from './shared/stylePresets'

const NAV_ICONS = ['home', 'history', 'library-big', 'list-checks', 'workflow', 'settings']
const FEATURE_ICONS = [
  'activity', 'brain-circuit', 'calendar-check-2', 'chart-no-axes-combined',
  'chevron-down', 'chevron-up', 'circle-dashed', 'clock-3', 'loader-2',
  'save', 'scan-search', 'wallet', 'wand-sparkles'
]
const CLIENT_BUNDLE_ICONS = Array.from(new Set([
  ...STYLE_PRESETS.map(preset => preset.icon.replace(/^i-lucide-/, '')),
  ...NAV_ICONS,
  ...FEATURE_ICONS
])).map(name => `lucide:${name}`)

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: process.env.NUXT_DEVTOOLS === 'false' ? false : process.env.NODE_ENV !== 'production' },

  // Enable Nuxt 4 compatibility
  future: {
    compatibilityVersion: 4,
  },

  app: {
    head: {
      title: 'SubX - 自动化视频字幕提取与翻译工具',
      htmlAttrs: { lang: 'zh-CN' },
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' }
      ]
    }
  },

  modules: [
    '@nuxt/ui'
  ],

  fonts: {
    defaults: {
      weights: [],
      styles: []
    },
    providers: {
      google: false,
      googleicons: false,
      bunny: false,
      fontshare: false,
      fontsource: false,
      adobe: false
    }
  },

  icon: {
    provider: 'iconify',
    serverBundle: {
      collections: ['lucide']
    },
    clientBundle: {
      scan: true,
      icons: CLIENT_BUNDLE_ICONS
    },
    fetchTimeout: 0
  },

  css: ['~/app.css'],

  // UI Configuration
  ui: {
    // Standard UI config if needed
  },

  // Nitro server configuration
  nitro: {
    externals: {
      external: ['better-sqlite3']
    }
  },

  vite: {
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return
            if (id.includes('/openai/')) return 'vendor-openai'
            if (id.includes('/@nuxt/ui/') || id.includes('/@iconify-json/') || id.includes('/@nuxt/icon/')) return 'vendor-ui'
            if (id.includes('/vue/') || id.includes('/vue-router/')) return 'vendor-vue'
          }
        }
      }
    }
  },

  experimental: {
    // Any extra features
  },

  runtimeConfig: {
    public: {
      appVersion: JSON.parse(readFileSync('./package.json', 'utf-8')).version || '0.0.0',
      timeZone: process.env.NUXT_PUBLIC_TIME_ZONE || process.env.TZ || 'Asia/Shanghai'
    }
  }
})
