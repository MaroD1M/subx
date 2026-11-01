export interface LanguageOption {
  label: string
  value: string
}

export const LANGUAGE_OPTIONS: LanguageOption[] = [
  { label: '简体中文', value: 'zh-CN' },
  { label: '繁体中文', value: 'zh-TW' },
  { label: '英语', value: 'en' },
  { label: '日语', value: 'ja' },
  { label: '韩语', value: 'ko' },
  { label: '西班牙语', value: 'es' },
  { label: '法语', value: 'fr' },
  { label: '德语', value: 'de' },
  { label: '俄语', value: 'ru' },
  { label: '葡萄牙语', value: 'pt' },
  { label: '意大利语', value: 'it' },
  { label: '阿拉伯语', value: 'ar' }
]

export const LANGUAGE_VALUES = LANGUAGE_OPTIONS.map(option => option.value)
