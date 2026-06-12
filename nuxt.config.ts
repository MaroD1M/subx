export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: process.env.NODE_ENV !== 'production' },

  // Enable Nuxt 4 compatibility
  future: {
    compatibilityVersion: 4,
  },

  app: {
    head: {
      title: 'SubX - 自动化视频字幕提取与翻译工具'
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
      scan: true
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
      appVersion: JSON.parse(require('fs').readFileSync('./package.json', 'utf-8')).version || '0.0.0'
    }
  }
})
