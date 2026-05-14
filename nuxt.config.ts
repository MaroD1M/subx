export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

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
    experimental: {
      openAPI: true
    },
    externals: {
      external: ['better-sqlite3']
    }
  },

  experimental: {
    // Any extra features
  },

  runtimeConfig: {
    public: {
      // Public vars
    }
  }
})
