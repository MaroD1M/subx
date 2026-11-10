import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { access, statfs } from 'node:fs/promises'
import { constants } from 'node:fs'
import { join } from 'node:path'
import { useDb } from '../../utils/db'
import { ConfigService } from '../../utils/config'
import { getMediaRoots, inspectMediaRoot } from '../../utils/mediaRoots'
import { listServerFonts } from '../../utils/fonts'
import { BackupService } from '../../utils/backup'
import { AuthService } from '../../utils/auth'

const execFileAsync = promisify(execFile)

type CheckStatus = 'ok' | 'warning' | 'error'

interface HealthCheck {
  id: string
  label: string
  status: CheckStatus
  message: string
  detail?: string
}

async function commandVersion(command: string) {
  try {
    const { stdout } = await execFileAsync(command, ['-version'], { timeout: 4000, maxBuffer: 64 * 1024 })
    return String(stdout || '').split(/\r?\n/)[0] || '可用'
  } catch {
    return ''
  }
}

function worstStatus(checks: HealthCheck[]): CheckStatus {
  if (checks.some(check => check.status === 'error')) return 'error'
  if (checks.some(check => check.status === 'warning')) return 'warning'
  return 'ok'
}

export default defineEventHandler(async () => {
  const checks: HealthCheck[] = []
  const config = await ConfigService.getConfig()
  const isPostgres = /^postgres(ql)?:\/\//i.test(String(process.env.DATABASE_URL || '').trim())

  try {
    const db = useDb()
    const row = db.prepare('SELECT MAX(version) AS version FROM schema_migrations').get() as { version?: number } | undefined
    checks.push({
      id: 'database',
      label: '数据库',
      status: 'ok',
      message: `${isPostgres ? 'PostgreSQL' : 'SQLite'} 正常，schema v${Number(row?.version || 0)}`
    })
  } catch (error: any) {
    checks.push({ id: 'database', label: '数据库', status: 'error', message: `数据库不可用：${error?.message || error}` })
  }

  try {
    const roots = await getMediaRoots()
    const active = roots.filter(root => root.enabled !== false)
    if (!active.length) {
      checks.push({ id: 'media', label: '媒体库', status: 'warning', message: '尚未配置可用的媒体库' })
    } else {
      const inspected = await Promise.all(active.map(root => inspectMediaRoot(root)))
      const bad = inspected.filter(item => !item.ok)
      checks.push({
        id: 'media',
        label: '媒体库',
        status: bad.length ? 'warning' : 'ok',
        message: bad.length ? `${bad.length} 个媒体库不可访问` : `${active.length} 个媒体库可访问`,
        detail: bad.length ? bad.map(item => item.message).join('；') : undefined
      })
    }
  } catch (error: any) {
    checks.push({ id: 'media', label: '媒体库', status: 'error', message: `媒体库检测失败：${error?.message || error}` })
  }

  const [ffmpegVersion, ffprobeVersion] = await Promise.all([commandVersion('ffmpeg'), commandVersion('ffprobe')])
  checks.push({
    id: 'ffmpeg',
    label: 'FFmpeg',
    status: ffmpegVersion && ffprobeVersion ? 'ok' : 'error',
    message: ffmpegVersion && ffprobeVersion ? `FFmpeg 可用` : 'FFmpeg 或 ffprobe 不可用',
    detail: ffmpegVersion || undefined
  })

  try {
    const fonts = await listServerFonts()
    const hasCjk = fonts.some(font => /(?:Noto Sans CJK|Source Han|WenQuanYi|Microsoft YaHei|PingFang|思源)/i.test(font))
    checks.push({
      id: 'fonts',
      label: '字幕字体',
      status: fonts.length === 0 ? 'warning' : (hasCjk ? 'ok' : 'warning'),
      message: fonts.length === 0 ? '未检测到 fontconfig 字体' : `已安装 ${fonts.length} 个字体${hasCjk ? '，包含中文字体' : '，未发现常见中文字体'}`,
      detail: fonts.length === 0 ? '实景预览和中文烧录可能回退字体' : undefined
    })
  } catch (error: any) {
    checks.push({ id: 'fonts', label: '字幕字体', status: 'warning', message: `字体检测失败：${error?.message || error}` })
  }

  try {
    const tempDir = join(process.cwd(), 'temp')
    await access(tempDir, constants.W_OK)
    checks.push({ id: 'temp', label: '临时目录', status: 'ok', message: 'temp 目录可写' })
  } catch {
    checks.push({ id: 'temp', label: '临时目录', status: 'error', message: 'temp 目录不可写，任务和预览会失败' })
  }

  try {
    const stats = await statfs(process.cwd())
    const total = Number(stats.blocks) * Number(stats.bsize)
    const free = Number(stats.bavail) * Number(stats.bsize)
    const usedPercent = total > 0 ? Math.round(((total - free) / total) * 100) : 0
    checks.push({
      id: 'disk',
      label: '磁盘空间',
      status: free < 1024 ** 3 ? 'warning' : 'ok',
      message: `可用 ${(free / 1024 ** 3).toFixed(1)} GB，已用 ${usedPercent}%`
    })
  } catch {
    checks.push({ id: 'disk', label: '磁盘空间', status: 'warning', message: '无法读取磁盘空间' })
  }

  checks.push({
    id: 'ai',
    label: 'AI 连接',
    status: config.apiKey ? 'ok' : 'warning',
    message: config.apiKey ? `已配置，默认模型：${config.defaultModel || '-'}` : '尚未配置 API Key'
  })

  const backups = BackupService.list()
  checks.push({
    id: 'backup',
    label: '备份',
    status: backups.length ? 'ok' : 'warning',
    message: backups.length ? `最近备份：${backups[0]!.name}` : '尚无备份，建议启用自动备份',
    detail: backups.length ? undefined : '设置 → 存储与缓存 → 自动备份'
  })

  checks.push({
    id: 'auth',
    label: '访问口令',
    status: AuthService.hasPasskey() ? 'ok' : 'warning',
    message: AuthService.hasPasskey() ? '已设置访问口令' : '尚未设置访问口令'
  })

  const summary = worstStatus(checks)
  return {
    checkedAt: new Date().toISOString(),
    summary,
    checks
  }
})
