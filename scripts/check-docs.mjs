import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs'
import { dirname, join, normalize, relative } from 'node:path'

const root = process.cwd()
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const version = String(pkg.version || '')
if (!version) throw new Error('package.json version is missing')

const explicitFiles = ['README.md', 'CONTRIBUTING.md', 'SECURITY.md', 'CHANGELOG.md', 'NOTICE.md']
const docsDir = join(root, 'docs')

function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.git') continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else if (entry.endsWith('.md')) out.push(full)
  }
  return out
}

const files = [...explicitFiles.map((f) => join(root, f)).filter(existsSync), ...walk(docsDir)]

const errors = []
const warnings = []

function stripCodeBlocks(text) {
  return text.replace(/^```[\s\S]*?^```/gm, (block) => block.replace(/[^\n]/g, ' '))
}

function githubSlug(text) {
  return text
    .trim()
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[^\p{L}\p{N}\p{M}\s_-]/gu, '')
    .replace(/\s+/g, '-')
}

function collectAnchors(text) {
  const anchors = new Set()
  const counts = new Map()
  for (const line of text.split('\n')) {
    const match = /^(#{1,6})\s+(.*)$/.exec(line)
    if (!match) continue
    const base = githubSlug(match[2])
    const count = counts.get(base) || 0
    anchors.add(count === 0 ? base : `${base}-${count}`)
    counts.set(base, count + 1)
  }
  return anchors
}

const anchorsByFile = new Map()
for (const file of files) {
  const text = readFileSync(file, 'utf8')
  anchorsByFile.set(normalize(file), collectAnchors(stripCodeBlocks(text)))
}

const linkPattern = /!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g

for (const file of files) {
  const raw = readFileSync(file, 'utf8')
  const text = stripCodeBlocks(raw)
  const rel = relative(root, file)

  for (const match of text.matchAll(linkPattern)) {
    const target = match[1]
    if (target.startsWith('#')) {
      checkAnchor(rel, file, target.slice(1))
      continue
    }
    if (target.startsWith('http://') || target.startsWith('https://') || target.startsWith('mailto:')) {
      continue
    }
    if (target.startsWith('data:')) continue

    const [rawPath, rawAnchor = ''] = target.split('#')
    const decodedPath = decodeURIComponent(rawPath)
    const resolved = normalize(join(dirname(file), decodedPath))

    if (!existsSync(resolved)) {
      errors.push(`${rel}: 链接目标不存在 -> ${target}`)
      continue
    }
    if (rawAnchor) checkAnchor(rel, resolved, decodeURIComponent(rawAnchor))
  }

  for (const match of text.matchAll(/当前版本：\*{0,2}v([0-9]+\.[0-9]+\.[0-9]+)/g)) {
    if (match[1] !== version) errors.push(`${rel}: 当前版本 v${match[1]} != v${version}`)
  }
  for (const match of text.matchAll(/适用版本：v([0-9]+\.[0-9]+\.[0-9]+)/g)) {
    if (match[1] !== version) errors.push(`${rel}: 适用版本 v${match[1]} != v${version}`)
  }
}

function checkAnchor(sourceRel, targetFile, anchor) {
  const key = normalize(targetFile)
  const anchors = anchorsByFile.get(key)
  if (!anchors) return
  if (!anchors.has(anchor) && !anchors.has(anchor.toLowerCase())) {
    errors.push(`${sourceRel}: 锚点不存在 -> ${relative(root, targetFile)}#${anchor}`)
  }
}

const readmePath = join(root, 'README.md')
if (existsSync(readmePath)) {
  const readme = readFileSync(readmePath, 'utf8')
  for (const required of ['docs/README.md', 'docs/getting-started.md', 'docs/troubleshooting.md']) {
    if (!readme.includes(required)) errors.push(`README.md: 缺少文档入口 ${required}`)
  }
  if (/^## .*升级到 v\d/m.test(readme)) {
    errors.push('README.md: 不应包含版本升级章节，升级说明请放在 docs/reference/upgrade.md 或 CHANGELOG.md')
  }
  if (readme.split('\n').length > 260) {
    warnings.push('README.md 超过 260 行，考虑把细节移入 docs/')
  }
}

const envPrefixes = ['ASR_', 'OCR_', 'SUBX_', 'PG_', 'POSTGRES_', 'CHOWN_', 'HF_']
const envExact = new Set([
  'PUID',
  'PGID',
  'DB_PATH',
  'VIDEO_DIR',
  'TZ',
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'ALL_PROXY',
  'NO_PROXY',
  'DATABASE_URL',
  'RUN_AS_ROOT',
  'TRUST_PROXY',
  'NODE_ENV',
  'FFMPEG_PATH',
  'FFPROBE_PATH'
])

function isEnvName(name) {
  return envExact.has(name) || envPrefixes.some((prefix) => name.startsWith(prefix))
}

function collectEnvNames(text) {
  const names = new Set()
  for (const match of stripCodeBlocks(text).matchAll(/`([A-Z][A-Z0-9_]{2,})`/g)) {
    if (isEnvName(match[1])) names.add(match[1])
  }
  return names
}

const referenceFile = normalize(join(docsDir, 'reference/environment.md'))
const documentedEnv = existsSync(referenceFile) ? collectEnvNames(readFileSync(referenceFile, 'utf8')) : new Set()
const referencedEnv = new Set()
for (const file of files) {
  if (normalize(file) === referenceFile) continue
  if (relative(root, file) === 'CHANGELOG.md') continue
  for (const name of collectEnvNames(readFileSync(file, 'utf8'))) referencedEnv.add(name)
}
for (const name of referencedEnv) {
  if (!documentedEnv.has(name)) {
    errors.push(`docs/reference/environment.md: 缺少环境变量 ${name}（在其他文档中被引用）`)
  }
}

if (warnings.length) {
  console.warn(`文档检查警告 ${warnings.length} 条：`)
  for (const warning of warnings) console.warn(`  - ${warning}`)
}

if (errors.length) {
  console.error(`文档检查失败，共 ${errors.length} 个问题：`)
  for (const error of errors) console.error(`  - ${error}`)
  process.exit(1)
}

console.log(`文档检查通过：${files.length} 个文件，v${version}`)
