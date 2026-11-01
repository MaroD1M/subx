import { AuthService } from '../../utils/auth'
import { MIN_PASSKEY_LENGTH } from '~~/shared/auth'
import { authPasskeySchema, parseBody } from '../../utils/validation'

export default defineEventHandler(async (event) => {
    const forwardedProto = getHeader(event, 'x-forwarded-proto')
    const isHttps = forwardedProto
        ? forwardedProto.split(',')[0]?.trim() === 'https'
        : getRequestURL(event).protocol === 'https:'

    const { passkey } = await parseBody(event, authPasskeySchema)

    // 客户端传的是口令哈希；真实口令长度由登录页校验，这里保留格式下限。
    if (!passkey || typeof passkey !== 'string' || passkey.length < MIN_PASSKEY_LENGTH) {
        throw createError({ statusCode: 400, message: `口令密钥长度不得少于 ${MIN_PASSKEY_LENGTH} 个字符` })
    }

    if (AuthService.hasPasskey()) {
        throw createError({ statusCode: 409, message: '口令密钥已存在' })
    }

    try {
        AuthService.setupPasskey(passkey)
        const token = AuthService.createSession()

        setCookie(event, 'subx_session', token, {
            httpOnly: true,
            secure: isHttps,
            maxAge: 60 * 60 * 24 * 7,
            path: '/',
            sameSite: 'lax'
        })

        return { success: true }
    } catch (e: any) {
        throw createError({ statusCode: 500, message: e.message })
    }
})
