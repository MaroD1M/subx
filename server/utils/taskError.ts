export interface TaskErrorInfo {
  type: 'auth' | 'rate_limit' | 'model' | 'network' | 'timeout' | 'provider' | 'parse' | 'content' | 'unknown'
  summary: string
}

export function classifyTaskError(message: string): TaskErrorInfo {
  const text = (message || '').toLowerCase()

  if (text.includes('401') || text.includes('unauthorized') || text.includes('invalid api key') || text.includes('authentication')) {
    return { type: 'auth', summary: '鉴权失败：请检查 API Key 或供应商鉴权配置' }
  }
  if (text.includes('429') || text.includes('rate limit') || text.includes('quota')) {
    return { type: 'rate_limit', summary: '请求受限：触发速率/配额限制，请稍后重试' }
  }
  if (text.includes('model') && (text.includes('not found') || text.includes('does not exist') || text.includes('invalid'))) {
    return { type: 'model', summary: '模型不可用：请检查模型名称或供应商支持情况' }
  }
  if (text.includes('etimedout') || text.includes('timeout') || text.includes('timed out')) {
    return { type: 'timeout', summary: '请求超时：请检查网络或稍后重试' }
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

