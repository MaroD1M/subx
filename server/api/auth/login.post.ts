import { AuthService } from '../../utils/auth'
import { authPasskeySchema, parseBody } from '../../utils/validation'

export default defineEventHandler(async (event) => {
    const forwardedProto = getHeader(event, 'x-forwarded-proto')
    const isHttps = forwardedProto
        ? forwardedProto.split(',')[0]?.trim() === 'https'
        : getRequestURL(event).protocol === 'https:'

    const trustProxy = String(process.env.TRUST_PROXY || '').toLowerCase() === 'true'
    const ip = getRequestIP(event, { xForwardedFor: trustProxy }) || 'unknown'

    if (!AuthService.checkLoginRate(ip)) {
        throw createError({ statusCode: 429, message: '登录尝试过于频繁，请稍后再试' })
    }

    const { passkey } = await parseBody(event, authPasskeySchema)

    if (!passkey) {
        throw createError({ statusCode: 400, message: '请输入口令密钥' })
    }

    const valid = AuthService.verifyPasskey(passkey)
    if (!valid) {
        throw createError({ statusCode: 401, message: '口令密钥错误' })
    }

    const token = AuthService.createSession()

    setCookie(event, 'subx_session', token, {
        httpOnly: true,
        secure: isHttps,
        maxAge: 60 * 60 * 24 * 7,
        path: '/',
        sameSite: 'lax'
    })

    return { success: true }
})
