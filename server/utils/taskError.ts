export interface TaskErrorInfo {
  type: 'auth' | 'rate_limit' | 'model' | 'network' | 'timeout' | 'provider' | 'unknown'
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

  return { type: 'unknown', summary: '未知错误：请查看任务详情日志' }
}

