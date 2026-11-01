import { ConfigService } from '../utils/config'

export default defineEventHandler(async () => {
    const config = await ConfigService.getConfig()

    // Mask API key
    const maskedKey = config.apiKey.length > 8
        ? `${config.apiKey.slice(0, 4)}****${config.apiKey.slice(-4)}`
        : config.apiKey.replace(/./g, '*')

    const asrKey = String(config.asrApiKey || '')
    const maskedAsrKey = asrKey.length > 8
        ? `${asrKey.slice(0, 4)}****${asrKey.slice(-4)}`
        : asrKey.replace(/./g, '*')

    const asrCloudKey = String(config.asrCloudApiKey || '')
    const maskedAsrCloudKey = asrCloudKey.length > 8
        ? `${asrCloudKey.slice(0, 4)}****${asrCloudKey.slice(-4)}`
        : asrCloudKey.replace(/./g, '*')

    const ocrKey = String(config.ocrApiKey || '')
    const maskedOcrKey = ocrKey.length > 8
        ? `${ocrKey.slice(0, 4)}****${ocrKey.slice(-4)}`
        : ocrKey.replace(/./g, '*')

    const integrationToken = String(config.integrationWebhookToken || '')
    const maskedIntegrationToken = integrationToken.length > 8
        ? `${integrationToken.slice(0, 4)}****${integrationToken.slice(-4)}`
        : integrationToken.replace(/./g, '*')

    return {
        ...config,
        apiKey: maskedKey,
        asrApiKey: maskedAsrKey,
        asrCloudApiKey: maskedAsrCloudKey,
        integrationWebhookToken: maskedIntegrationToken,
        ocrApiKey: maskedOcrKey
    }
})
