import { AuthService } from '../../utils/auth'

export default defineEventHandler(async (event) => {
    const ip = getRequestIP(event, { xForwardedFor: true }) || 'unknown'

    if (!AuthService.checkLoginRate(ip)) {
        throw createError({ statusCode: 429, message: '登录尝试过于频繁，请稍后再试' })
    }

    const { passkey } = await readBody(event)

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
        secure: process.env.NODE_ENV === 'production',
        maxAge: 60 * 60 * 24 * 7,
        path: '/',
        sameSite: 'lax'
    })

    return { success: true }
})
