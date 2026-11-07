import { AuthService } from '../../utils/auth'

export default defineEventHandler((event) => {
    const hasPasskey = AuthService.hasPasskey()
    const token = getCookie(event, 'subx_session')
    const authenticated = hasPasskey && (token ? AuthService.verifySession(token) : false)
    return { hasPasskey, authenticated }
})
