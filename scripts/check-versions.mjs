import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
const version = String(pkg.version || '')
if (!version) throw new Error('package.json version is missing')

function read(path) {
  return readFileSync(path, 'utf8')
}

function expectMatch(path, pattern, label) {
  const text = read(path)
  if (!pattern.test(text)) {
    throw new Error(`${path}: ${label} does not match v${version}`)
  }
}

const semver = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

expectMatch('README.md', new RegExp(`当前版本：\\*\\*v${semver}\\*\\*`), '当前版本')

const versionedDocs = [
  'docs/README.md',
  'docs/usage.md',
  'docs/deployment.md',
  'docs/getting-started.md',
  'docs/operations.md',
  'docs/troubleshooting.md',
  'docs/guide/translation.md',
  'docs/guide/media-asr.md',
  'docs/guide/ocr.md',
  'docs/guide/automation.md',
  'docs/guide/review-export.md',
  'docs/reference/environment.md',
  'docs/reference/upgrade.md',
  'docs/development/maintenance.md',
  'docs/development/testing-guide.md',
  'docs/development/postgresql.md',
  'docs/development/asr-benchmark.md'
]
for (const path of versionedDocs) {
  expectMatch(path, new RegExp(`适用版本：v${semver}`), '适用版本')
}
expectMatch('docs/development/testing-guide.md', new RegExp(`版本：v${semver}`), '版本')
expectMatch('Dockerfile', new RegExp(`# SubX v${semver}`), '镜像版本注释')
expectMatch('docker-compose.yml', new RegExp(`# SubX v${semver}`), 'Compose 版本注释')
expectMatch('.env.example', new RegExp(`# SubX v${semver}`), '环境变量示例版本')
expectMatch('server/api/openapi.json.get.ts', new RegExp(`version: '${semver}'`), 'OpenAPI 版本')
expectMatch('scripts/pull-image.sh', new RegExp(`DEFAULT_VERSION="${semver}"`), '拉取脚本默认版本')
expectMatch('docker-compose.yml', new RegExp(`image: ghcr\\.io/marod1m/subx:v${semver}`), '主镜像 tag')
expectMatch('docker-compose.yml', new RegExp(`image: ghcr\\.io/marod1m/subx-asr:v${semver}`), 'ASR 镜像 tag')
expectMatch('docker-compose.yml', new RegExp(`image: ghcr\\.io/marod1m/subx-ocr:v${semver}`), 'OCR 镜像 tag')

expectMatch('README.md', new RegExp(`image: ghcr\\.io/marod1m/subx:v${semver}`), 'README 镜像 tag')
expectMatch('docs/deployment.md', new RegExp(`image: ghcr\\.io/marod1m/subx:v${semver}`), '部署主镜像 tag')
expectMatch('CHANGELOG.md', new RegExp(`## v${semver} - \\d{4}-\\d{2}-\\d{2}`), 'CHANGELOG 版本')

const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'))
if (String(lock.version || '') !== version) throw new Error(`package-lock.json version ${lock.version} != ${version}`)
if (String(lock.packages?.['']?.version || '') !== version) throw new Error(`package-lock.json root package version ${lock.packages?.['']?.version} != ${version}`)

console.log(`Version check passed: v${version}`)
