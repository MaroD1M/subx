export type AiProviderCompatibility = 'official' | 'openai-compatible' | 'partial'

export interface AiProviderGuide {
  id: string
  name: string
  badge?: string
  compatibility: AiProviderCompatibility
  description: string
  officialUrl?: string
  officialLabel?: string
  apiBaseUrl?: string
  defaultModel?: string
  recommendManualModel?: boolean
  supportsModelList?: boolean
  steps: string[]
  notes: string[]
}

export const AI_PROVIDER_GUIDES: AiProviderGuide[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    badge: '推荐',
    compatibility: 'official',
    description: '官方接口，和当前项目兼容性最好。',
    officialUrl: 'https://platform.openai.com/',
    officialLabel: '前往 OpenAI 控制台',
    apiBaseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    recommendManualModel: false,
    supportsModelList: true,
    steps: [
      '在 OpenAI 平台创建 API Key。',
      '将 API Key 填入“OpenAI API 密钥”。',
      '将 API 基础 URL 填为 https://api.openai.com/v1。'
    ],
    notes: [
      '支持自动获取模型列表。',
      '推荐直接使用下拉选择模型。'
    ]
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    compatibility: 'openai-compatible',
    description: '兼容 OpenAI 协议，适合直接接入当前项目。',
    officialUrl: 'https://platform.deepseek.com/',
    officialLabel: '前往 DeepSeek 平台',
    apiBaseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    recommendManualModel: true,
    supportsModelList: false,
    steps: [
      '在 DeepSeek 平台创建 API Key。',
      '填写 API Key 与基础 URL。',
      '如无法获取模型列表，可直接手动填写模型名 deepseek-chat。'
    ],
    notes: [
      '更推荐开启“手动填写模型名称”。',
      '如果模型列表接口不可用，通常不影响实际翻译调用。'
    ]
  },
  {
    id: 'gemini',
    name: 'Gemini',
    compatibility: 'partial',
    description: '仅在提供 OpenAI 兼容入口时建议接入。',
    officialUrl: 'https://aistudio.google.com/',
    officialLabel: '前往 Google AI Studio',
    defaultModel: 'gemini-2.5-flash',
    recommendManualModel: true,
    supportsModelList: false,
    steps: [
      '确认你使用的是 Gemini 的 OpenAI 兼容入口，而不是原生 Gemini API。',
      '填写服务商提供的兼容 Base URL 与 API Key。',
      '如无模型列表接口，请开启手动填写模型名称。'
    ],
    notes: [
      '原生 Gemini API 不一定可直接用于当前项目。',
      '建议优先参考服务商给出的 OpenAI 兼容接入文档。'
    ]
  },
  {
    id: 'volcengine',
    name: '火山引擎',
    compatibility: 'partial',
    description: '需使用兼容 OpenAI 的接入方式。',
    officialUrl: 'https://console.volcengine.com/',
    officialLabel: '前往火山引擎控制台',
    recommendManualModel: true,
    supportsModelList: false,
    steps: [
      '确认当前接入地址是否为 OpenAI 兼容接口。',
      '填写平台提供的 API Key、基础 URL 与模型名。',
      '如果列表获取失败，直接手动填写模型名称。'
    ],
    notes: [
      '不同产品线的接入方式可能不同。',
      '建议以实际控制台或接口文档提供的兼容地址为准。'
    ]
  },
  {
    id: 'openai-compatible',
    name: 'OpenAI 兼容',
    compatibility: 'openai-compatible',
    description: '适用于第三方聚合平台、中转平台或本地推理网关。',
    recommendManualModel: true,
    supportsModelList: false,
    steps: [
      '填写服务商提供的 API Key。',
      '将 API 基础 URL 填为对方提供的 API 根路径，通常类似 /v1。',
      '如果无法自动列出模型，请手动填写模型 ID。'
    ],
    notes: [
      '只要接口兼容 OpenAI 协议，通常都可以先尝试接入。',
      '建议优先测试手动模型模式。'
    ]
  }
]
