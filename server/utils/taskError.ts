export interface TaskErrorInfo {
  type: 'auth' | 'rate_limit' | 'model' | 'network' | 'timeout' | 'provider' | 'parse' | 'content' | 'ocr_limit' | 'ocr_timeout' | 'unknown'
  summary: string
}

export function classifyTaskError(message: string): TaskErrorInfo {
  const text = (message || '').toLowerCase()

  if (text.includes('401') || text.includes('unauthorized') || text.includes('invalid api key') || text.includes('authentication')
    || text.includes('asr api key 无效') || text.includes('ocr api key 无效')) {
    return { type: 'auth', summary: '鉴权失败：请检查 API Key 或供应商鉴权配置' }
  }
  if (text.includes('429') || text.includes('rate limit') || text.includes('quota')) {
    return { type: 'rate_limit', summary: '请求受限：触发速率/配额限制，请稍后重试' }
  }
  if (text.includes('模型未下载') || text.includes('模型尚未下载') || text.includes('model not downloaded')) {
    return { type: 'model', summary: '本地模型缺失：请前往“设置 → 语音识别 → 本地模型管理”下载所需模型后重试' }
  }
  if (text.includes('model') && (text.includes('not found') || text.includes('does not exist') || text.includes('invalid'))) {
    return { type: 'model', summary: '模型不可用：请检查模型名称或供应商支持情况' }
  }
  if (text.includes('asr') && (text.includes('长时间没有进度') || text.includes('超过最长执行时间') || text.includes('asr 音频上传超时'))) {
    return { type: 'timeout', summary: 'ASR 识别超时：请检查服务负载，或调大 ASR_JOB_IDLE_TIMEOUT_MS / ASR_JOB_ABSOLUTE_TIMEOUT_MS' }
  }
  if (text.includes('ocr') && (text.includes('最大处理时长') || text.includes('ocr_max_seconds') || (text.includes('视频时长') && text.includes('超过')))) {
    return { type: 'ocr_limit', summary: 'OCR 处理时长不足：请调大“设置 → 图像字幕 OCR → 长视频与超时”中的最大 OCR 时长，或改用语音识别' }
  }
  if (text.includes('ocr') && (text.includes('长时间没有进度') || text.includes('超过最长执行时间') || text.includes('ocr 任务超时'))) {
    return { type: 'ocr_timeout', summary: 'OCR 任务超时：请调大“长视频与超时”中的无进度超时/总任务上限，或缩短分段时长' }
  }
  if (text.includes('etimedout') || text.includes('timeout') || text.includes('timed out')) {
    return { type: 'timeout', summary: '请求超时：请检查网络或稍后重试' }
  }
  if (text.includes('und_err_invalid_arg') || text.includes('invalid onrequeststart')) {
    return { type: 'network', summary: 'HTTP 客户端兼容性异常：请升级到最新版本，或检查 undici 依赖是否一致' }
  }
  if (text.includes('econnreset') || text.includes('enotfound') || text.includes('network') || text.includes('fetch failed')) {
    return { type: 'network', summary: '网络异常：无法连接模型服务，请检查网络/代理设置' }
  }
  if (text.includes('5xx') || text.includes('500') || text.includes('502') || text.includes('503') || text.includes('504')) {
    return { type: 'provider', summary: '供应商服务异常：上游服务暂不可用' }
  }
  if (text.includes('[解析为空]') || text.includes('[条目缺失]') || text.includes('解析失败') || text.includes('翻译条目不完整')) {
    return { type: 'parse', summary: '返回解析异常：模型有响应，但格式不完整或缺少条目' }
  }
  if (text.includes('[无有效译文]') || text.includes('[疑似拒答]') || text.includes('翻译结果为空')) {
    return { type: 'content', summary: '返回内容异常：模型未给出可用译文，可能被拒答或内容被过滤' }
  }
  if (text.includes('referenceerror') || text.includes('is not defined')) {
    return { type: 'parse', summary: '代码逻辑异常：存在未声明变量，请更新至最新版本' }
  }

  return { type: 'unknown', summary: '未知错误：请查看任务详情日志' }
}

