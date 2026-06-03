export default defineNuxtRouteMiddleware(async (to) => {
    // 1. 完全跳过对登录页的检查逻辑
    if (to.path === '/login' || to.path === '/login/') return

    const { authenticated, hasPasskey, check } = useAuth()

    // 2. 如果尚未完成初始化，或尚未登录，则执行认证确认
    if (hasPasskey.value === null || !authenticated.value) {
        await check()
    }

    // 3. 拦截检查
    if (hasPasskey.value !== true || !authenticated.value) {
        return navigateTo('/login', { replace: true })
    }
})
