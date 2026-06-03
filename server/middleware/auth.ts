import { AuthService } from '../utils/auth'

export default defineEventHandler((event) => {
    const url = getRequestURL(event)
    const pathname = url.pathname
    const isAuthApi = pathname.startsWith('/api/auth/')
    const isApi = pathname.startsWith('/api/')
    const isNuxtAsset = pathname.startsWith('/_nuxt/')
    const isIconApi = pathname.startsWith('/api/_nuxt_icon/')
    const isPublicAsset = pathname === '/favicon.ico' || pathname === '/robots.txt'
    const isLoginPage = pathname === '/login' || pathname === '/login/'
    const acceptsHtml = (getHeader(event, 'accept') || '').includes('text/html')

    if (isAuthApi || isIconApi || isNuxtAsset || isPublicAsset || isLoginPage) {
        return
    }

    const hasPasskey = AuthService.hasPasskey()
    const token = getCookie(event, 'subx_session')
    const authenticated = token ? AuthService.verifySession(token) : false

    if (!isApi && acceptsHtml) {
        if (!hasPasskey || !authenticated) {
            return sendRedirect(event, '/login', 302)
        }

        return
    }

    if (!isApi) {
        return
    }

    if (!hasPasskey) {
        return
    }

    if (!authenticated) {
        throw createError({
            statusCode: 401,
            message: '未授权，请先登录'
        })
    }
})
