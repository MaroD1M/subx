export type AiProviderCompatibility = 'official' | 'openai-compatible' | 'partial'

export interface AiProviderGuide {
  id: string
  providerType?: 'openai-compatible' | 'anthropic' | 'gemini'
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
    providerType: 'openai-compatible',
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
      '在 OpenAI 平台创建接口密钥。',
      '将接口密钥填入“OpenAI 接口密钥”。',
      '将接口基础地址填为 https://api.openai.com/v1。'
    ],
    notes: [
      '支持自动获取模型列表。',
      '推荐直接使用下拉选择模型。'
    ]
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    providerType: 'openai-compatible',
    compatibility: 'openai-compatible',
    description: '兼容 OpenAI 协议，适合直接接入当前项目。',
    officialUrl: 'https://platform.deepseek.com/',
    officialLabel: '前往 DeepSeek 平台',
    apiBaseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    recommendManualModel: true,
    supportsModelList: false,
    steps: [
      '在 DeepSeek 平台创建接口密钥。',
      '填写接口密钥与基础地址。',
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
    providerType: 'gemini',
    compatibility: 'official',
    description: '使用 Gemini 原生 generateContent 协议，支持模型列表和用量统计。',
    officialUrl: 'https://aistudio.google.com/',
    officialLabel: '前往 Google AI Studio',
    apiBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    defaultModel: 'gemini-2.5-flash',
    recommendManualModel: true,
    supportsModelList: true,
    steps: [
      '在 Google AI Studio 创建 API Key。',
      'Provider 类型选择 Gemini 原生。',
      '接口地址填写 https://generativelanguage.googleapis.com/v1beta。',
      '填写模型名，例如 gemini-2.5-flash。'
    ],
    notes: [
      'Gemini 原生接口不支持流式输出，当前会自动使用非流式。',
      '模型列表获取失败时可直接手动填写模型名称。'
    ]
  },
  {
    id: 'anthropic',
    name: 'Anthropic Claude',
    providerType: 'anthropic',
    compatibility: 'official',
    description: '使用 Anthropic Messages 原生协议，适合长文本和字幕翻译。',
    officialUrl: 'https://console.anthropic.com/',
    officialLabel: '前往 Anthropic 控制台',
    apiBaseUrl: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-3-5-haiku-latest',
    recommendManualModel: true,
    supportsModelList: true,
    steps: [
      '在 Anthropic 控制台创建 API Key。',
      'Provider 类型选择 Anthropic 原生。',
      '接口地址填写 https://api.anthropic.com/v1。',
      '填写模型名，例如 claude-3-5-haiku-latest。'
    ],
    notes: [
      'Anthropic 原生接口当前使用非流式模式。',
      '如模型列表不可用，可手动填写模型标识。'
    ]
  },
  {
    id: 'volcengine',
    name: '火山引擎',
    providerType: 'openai-compatible',
    compatibility: 'partial',
    description: '需使用兼容 OpenAI 的接入方式。',
    officialUrl: 'https://console.volcengine.com/',
    officialLabel: '前往火山引擎控制台',
    recommendManualModel: true,
    supportsModelList: false,
    steps: [
      '确认当前接入地址是否为 OpenAI 兼容接口。',
      '填写平台提供的接口密钥、基础地址与模型名。',
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
    providerType: 'openai-compatible',
    compatibility: 'openai-compatible',
    description: '适用于第三方聚合平台、中转平台或本地推理网关。',
    recommendManualModel: true,
    supportsModelList: false,
    steps: [
      '填写服务商提供的接口密钥。',
      '将接口基础地址填为对方提供的接口根路径，通常类似 /v1。',
      '如果无法自动列出模型，请手动填写模型标识。'
    ],
    notes: [
      '只要接口兼容 OpenAI 协议，通常都可以先尝试接入。',
      '建议优先测试手动模型模式。'
    ]
  },
  {
    id: 'ollama',
    name: 'Ollama（本地）',
    providerType: 'openai-compatible',
    badge: 'NAS 推荐',
    compatibility: 'openai-compatible',
    description: '在 NAS 本地运行模型，通过 OpenAI 兼容入口接入，适合隐私优先和零 API 费用场景。',
    officialUrl: 'https://ollama.com/',
    officialLabel: '前往 Ollama 官网',
    apiBaseUrl: 'http://host.docker.internal:11434/v1',
    defaultModel: 'qwen2.5:7b',
    recommendManualModel: true,
    supportsModelList: false,
    steps: [
      '在 NAS 或局域网机器上安装并启动 Ollama。',
      '确保 Ollama 监听 0.0.0.0，容器内可访问。',
      '接口地址填写 Ollama 的 OpenAI 兼容地址，例如 http://NAS_IP:11434/v1。',
      '手动填写模型名，例如 qwen2.5:7b、llama3.1:8b。'
    ],
    notes: [
      'Docker 部署时不要写 localhost，localhost 指向 SubX 容器自身。',
      '群晖/Unraid 可直接填写 NAS 局域网 IP 或 Ollama 容器服务名。',
      '7B/8B 模型适合字幕翻译，显存不足时优先使用 4B 或量化模型。'
    ]
  },
  {
    id: 'lm-studio',
    name: 'LM Studio（本地）',
    providerType: 'openai-compatible',
    compatibility: 'openai-compatible',
    description: '在桌面或 NAS 上运行本地模型，通过 LM Studio 的 OpenAI 兼容服务接入。',
    officialUrl: 'https://lmstudio.ai/',
    officialLabel: '前往 LM Studio 官网',
    apiBaseUrl: 'http://host.docker.internal:1234/v1',
    defaultModel: 'qwen2.5-7b-instruct',
    recommendManualModel: true,
    supportsModelList: false,
    steps: [
      '在 LM Studio 中加载模型并启动 Local Server。',
      '确认服务监听地址允许 SubX 容器访问。',
      '接口地址填写 http://NAS_IP:1234/v1。',
      '手动填写 LM Studio 中显示的模型标识。'
    ],
    notes: [
      'LM Studio 更适合桌面环境；NAS 常驻建议使用 Ollama 或 llama.cpp。',
      '如模型列表不可用，不影响实际翻译调用。'
    ]
  },
  {
    id: 'llama-cpp',
    name: 'llama.cpp / vLLM',
    providerType: 'openai-compatible',
    compatibility: 'openai-compatible',
    description: '适合有 GPU 或希望自己控制推理参数的 NAS/服务器环境。',
    defaultModel: 'qwen2.5-7b-instruct',
    recommendManualModel: true,
    supportsModelList: false,
    steps: [
      '启动 llama.cpp server 或 vLLM 的 OpenAI 兼容服务。',
      '填写服务地址和模型标识。',
      '如果服务不提供模型列表，请开启手动模型输入。'
    ],
    notes: [
      'vLLM 更适合并发较高的场景。',
      'llama.cpp 更轻量，适合 CPU 或小显存环境。'
    ]
  },
]
