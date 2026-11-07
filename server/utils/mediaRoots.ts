import { normalize, resolve } from 'path'
import { access, stat } from 'fs/promises'
import { constants } from 'fs'
import type { MediaRoot } from '../../types'
import { ConfigService } from './config'
import { resolveInsideRoot } from './pathSafety'

function defaultRootPath() {
  return process.env.VIDEO_DIR || '/data'
}

function normalizeRootPath(input: string) {
  return normalize(resolve(input || defaultRootPath()))
}

function sanitizeRoot(root: Partial<MediaRoot>, index: number): MediaRoot | null {
  const rawPath = String(root.path || '').trim()
  if (!rawPath) return null

  return {
    id: String(root.id || `root-${index + 1}`),
    name: String(root.name || `媒体库 ${index + 1}`).trim(),
    path: normalizeRootPath(rawPath),
    enabled: root.enabled !== false,
    order: Number.isFinite(Number(root.order)) ? Number(root.order) : index,
    isDefault: root.isDefault === true
  }
}

function humanizeInspectError(code: string) {
  switch (code) {
    case 'ENOENT': return '目录不存在，可能未挂载到容器内'
    case 'EACCES': return '权限不足，容器用户没有读取权限'
    case 'ENOTDIR': return '路径不是目录'
    case 'EMPTY_PATH': return '路径不能为空'
    default: return `目录不可访问 (${code})`
  }
}

export function validateMediaRoots(input: unknown): MediaRoot[] {
  const roots = Array.isArray(input) ? input : []
  const sanitized = roots
    .map((root, index) => sanitizeRoot(root as Partial<MediaRoot>, index))
    .filter((root): root is MediaRoot => !!root)

  const active = sanitized.filter(root => root.enabled !== false)
  const pathSet = new Set<string>()
  const usedIds = new Set<string>()

  // Old configurations may contain duplicate IDs from early versions. Normalize
  // them instead of failing the whole media library list.
  for (let index = 0; index < sanitized.length; index++) {
    const root = sanitized[index]!
    let id = root.id
    if (usedIds.has(id)) {
      let suffix = index + 1
      while (usedIds.has(`${id}-${suffix}`)) suffix += 1
      id = `${id}-${suffix}`
      root.id = id
    }
    usedIds.add(id)
  }

  for (const root of active) {
    if (!root.name) {
      throw createError({ statusCode: 400, message: '媒体库名称不能为空' })
    }
    if (!root.path.trim()) {
      throw createError({ statusCode: 400, message: `媒体库「${root.name}」路径不能为空` })
    }
    if (pathSet.has(root.path)) {
      throw createError({ statusCode: 400, message: `媒体库路径重复：${root.path}` })
    }
    pathSet.add(root.path)
  }

  for (const root of sanitized) {
    if (root.enabled === false) root.isDefault = false
  }
  const activeDefaults = active.filter(root => root.isDefault)
  if (active.length > 0 && !activeDefaults.length) {
    active[0]!.isDefault = true
  } else if (activeDefaults.length > 1) {
    for (const root of activeDefaults.slice(1)) root.isDefault = false
  }

  return sanitized.sort((a, b) => (a.order || 0) - (b.order || 0))
}

export async function getMediaRoots(): Promise<MediaRoot[]> {
  const config = await ConfigService.getConfig()
  const configured = validateMediaRoots(config.mediaRoots || [])
  const active = configured.filter(root => root.enabled !== false)

  if (active.length > 0) {
    const defaultRoot = (active.find(root => root.isDefault) || active[0])!
    return [defaultRoot, ...active.filter(root => root.id !== defaultRoot.id)]
  }

  return [{
    id: 'default',
    name: '默认媒体库',
    path: normalizeRootPath(defaultRootPath()),
    enabled: true,
    order: 0,
    isDefault: true
  }]
}

export async function getMediaRoot(rootId?: string | null): Promise<MediaRoot> {
  const roots = await getMediaRoots()
  if (!rootId) return roots[0]!
  const matched = roots.find(root => root.id === rootId)
  if (!matched) {
    throw createError({ statusCode: 404, message: `媒体库不存在或已被删除：${rootId}` })
  }
  return matched
}

export async function resolveMediaPath(userPath: string, rootId?: string | null): Promise<string> {
  const root = await getMediaRoot(rootId)
  return resolveInsideRoot(root.path, userPath || '.', { allowMissing: false })
}


export async function inspectMediaRoot(root: Partial<MediaRoot>) {
  const sanitized = sanitizeRoot(root, 0)
  if (!sanitized) {
    return { ok: false, message: humanizeInspectError('EMPTY_PATH'), code: 'EMPTY_PATH', path: '' }
  }

  try {
    const stats = await stat(sanitized.path)
    if (!stats.isDirectory()) {
      return { ok: false, message: humanizeInspectError('ENOTDIR'), code: 'ENOTDIR', path: sanitized.path }
    }
    await access(sanitized.path, constants.R_OK)
    return { ok: true, message: '目录可访问，可用于媒体扫描', code: 'OK', path: sanitized.path }
  } catch (e: any) {
    const code = e?.code || 'UNKNOWN'
    return {
      ok: false,
      message: humanizeInspectError(code),
      code,
      path: sanitized.path
    }
  }
}
