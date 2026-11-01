import { ConfigService } from '../utils/config'
import { createProvider, normalizeProviderType } from '../utils/providers/registry'

export default defineEventHandler(async (event) => {
    const body = await readBody(event)
    let apiKey = String(body?.apiKey || '').trim()
    let baseURL = String(body?.baseURL || body?.baseUrl || '').trim()
    let providerType = normalizeProviderType(body?.providerType)

    if (apiKey.includes('*')) {
        const config = await ConfigService.getConfig()
        apiKey = config.apiKey
        providerType = normalizeProviderType((config as any).providerType)
        if (!baseURL || baseURL.includes('openai.com/v1')) {
            baseURL = config.apiBaseUrl
        }
    }

    if (!apiKey || !baseURL) {
        throw createError({ statusCode: 400, message: 'API 密钥和 URL 不能为空' })
    }

    console.log(`[Model List] 尝试连接: ${providerType} ${baseURL}`)

    try {
        const provider = createProvider({
            type: providerType,
            apiKey,
            baseUrl: baseURL,
            model: ''
        })
        const models = await provider.listModels()
        console.log(`[Model List] 成功获取 ${models.length} 个模型`)
        return { models }
    } catch (e: any) {
        console.error('[Model List API Error]', e.message)
        if (e.response) {
            console.error('[Detail]', e.response.status, e.response.data)
        }
        throw createError({
            statusCode: e.status || 502,
            message: e.message || '无法连接到模型服务'
        })
    }
})
