/**
 * Session/API-token authentication and scope enforcement.
 *
 * Session cookies are accepted for the UI. API tokens use Bearer/X-API-Token
 * headers and are checked against their configured scope. Integration webhook
 * paths are public only after their own token validation.
 */

import { AuthService } from '../utils/auth'
import { ApiTokenService, resolveApiTokenScope } from '../utils/apiTokens'
import { assertTrustedOrigin } from '../utils/security'

function readApiToken(event: any): string {
  const authHeader = String(getHeader(event, 'authorization') || '')
  if (/^Bearer\s+/i.test(authHeader)) return authHeader.replace(/^Bearer\s+/i, '').trim()
  return String(getHeader(event, 'x-api-token') || '').trim()
}

export default defineEventHandler((event) => {
    const url = getRequestURL(event)
    const pathname = url.pathname
    const isAuthApi = pathname.startsWith('/api/auth/')
    const isApi = pathname.startsWith('/api/')
    const isNuxtAsset = pathname.startsWith('/_nuxt/')
    const isIconApi = pathname.startsWith('/api/_nuxt_icon/')
    const isPublicAsset = pathname === '/favicon.ico' || pathname === '/robots.txt'
    const isHealthApi = pathname === '/api/health' || pathname === '/api/health/'
    const isOpenApi = pathname === '/api/openapi.json'
    const isIntegrationWebhook = /^\/api\/integrations\/(sonarr|radarr|jellyfin|plex|emby|bazarr)$/.test(pathname)
    const isLoginPage = pathname === '/login' || pathname === '/login/'
    const acceptsHtml = (getHeader(event, 'accept') || '').includes('text/html')

    if (isApi && !isAuthApi) {
        assertTrustedOrigin(event)
    }

    if (isAuthApi || isIconApi || isNuxtAsset || isPublicAsset || isHealthApi || isOpenApi || isIntegrationWebhook || isLoginPage) {
        return
    }

    if (isApi) {
        const token = readApiToken(event)
        if (token) {
            const auth = ApiTokenService.verify(token)
            if (!auth) {
                throw createError({ statusCode: 401, message: 'API Token 无效、已撤销或已过期' })
            }
            const scope = resolveApiTokenScope(String(event.method || 'GET'), pathname)
            if (scope && scope !== 'public' && !auth.scopes.includes('*') && !auth.scopes.includes(scope)) {
                throw createError({ statusCode: 403, message: `API Token 缺少权限：${scope}` })
            }
            event.context.auth = auth
            const method = String(event.method || 'GET')
            event.node.res.on('finish', () => {
                ApiTokenService.recordAudit(auth, method, pathname, event.node.res.statusCode, getRequestIP(event, { xForwardedFor: String(process.env.TRUST_PROXY || '').toLowerCase() === 'true' }) || '')
            })
            return
        }
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

    // Before the first-run passkey is configured, only auth APIs are reachable.
    if (!hasPasskey) {
        throw createError({
            statusCode: 401,
            message: '实例尚未初始化，请先设置访问口令'
        })
    }

    if (!authenticated) {
        throw createError({
            statusCode: 401,
            message: '未授权，请先登录'
        })
    }

    event.context.auth = { type: 'session', scopes: ['*'] }
})
