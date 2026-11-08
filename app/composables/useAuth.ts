import { hashPasskeyClient } from '../utils/crypto'

let inflightCheck: Promise<void> | null = null

export const useAuth = () => {
    const authenticated = useState<boolean>('auth:authenticated', () => false)
    const hasPasskey = useState<boolean | null>('auth:hasPasskey', () => null)
    const checking = useState<boolean>('auth:checking', () => false)
    
    // 使用 useRequestFetch 确保在 SSR 期间能自动透传 Cookie
    const fetcher = useRequestFetch()

    /**
     * 检查认证状态
     */
    async function check() {
        if (inflightCheck) return inflightCheck
        checking.value = true
        inflightCheck = (async () => {
            try {
                const session = await fetcher('/api/auth/session')
                hasPasskey.value = !!session.hasPasskey
                authenticated.value = !!session.authenticated
            } catch (e) {
                console.error('[Auth] Check failed:', e)
                hasPasskey.value = true
                authenticated.value = false
            } finally {
                checking.value = false
                inflightCheck = null
            }
        })()
        return inflightCheck
    }

    /**
     * 创建口令密钥
     */
    async function setup(passkey: string) {
        const hashed = await hashPasskeyClient(passkey)
        await fetcher('/api/auth/setup', {
            method: 'POST',
            body: { passkey: hashed }
        })
        authenticated.value = true
        hasPasskey.value = true
    }

    /**
     * 登录
     */
    async function login(passkey: string) {
        const hashed = await hashPasskeyClient(passkey)
        await fetcher('/api/auth/login', {
            method: 'POST',
            body: { passkey: hashed }
        })
        authenticated.value = true
    }

    /**
     * 登出
     */
    async function logout() {
        try {
            await $fetch('/api/auth/logout', { method: 'POST' })
        } catch (e) {
            // 服务端偶发失败也不能把用户卡在已登录状态；前端无法清 HttpOnly Cookie，
            // 跳转到登录页并带 logged_out 标记，避免登录页立刻自动跳回首页。
            console.warn('[Auth] Logout request failed:', e)
        } finally {
            authenticated.value = false
            await navigateTo('/login?logged_out=1')
        }
    }

    return {
        authenticated,
        hasPasskey,
        checking,
        check,
        setup,
        login,
        logout
    }
}
