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
expectMatch('docs/usage.md', new RegExp(`适用版本：v${semver}`), '适用版本')
expectMatch('docs/deployment.md', new RegExp(`适用版本：v${semver}`), '适用版本')
expectMatch('docs/postgresql-evaluation.md', new RegExp(`适用版本：v${semver}`), '适用版本')
expectMatch('docs/asr-benchmark.md', new RegExp(`适用版本：v${semver}`), '适用版本')
expectMatch('docs/testing-guide.md', new RegExp(`版本：v${semver}`), '版本')
expectMatch('Dockerfile', new RegExp(`# SubX v${semver}`), '镜像版本注释')
expectMatch('docker-compose.yml', new RegExp(`# SubX v${semver}`), 'Compose 版本注释')
expectMatch('.env.example', new RegExp(`# SubX v${semver}`), '环境变量示例版本')
expectMatch('server/api/openapi.json.get.ts', new RegExp(`version: '${semver}'`), 'OpenAPI 版本')
expectMatch('.github/workflows/cleanup-old-images.yml', new RegExp(`v${semver},${semver},latest`), '镜像清理保留版本')
expectMatch('scripts/pull-image.sh', new RegExp(`DEFAULT_VERSION="${semver}"`), '拉取脚本默认版本')
expectMatch('docker-compose.yml', new RegExp(`image: ghcr\\.io/marod1m/subx:v${semver}`), '主镜像 tag')
expectMatch('docker-compose.yml', new RegExp(`image: ghcr\\.io/marod1m/subx-asr:v${semver}`), 'ASR 镜像 tag')
expectMatch('docker-compose.yml', new RegExp(`image: ghcr\\.io/marod1m/subx-ocr:v${semver}`), 'OCR 镜像 tag')

const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'))
if (String(lock.version || '') !== version) throw new Error(`package-lock.json version ${lock.version} != ${version}`)
if (String(lock.packages?.['']?.version || '') !== version) throw new Error(`package-lock.json root package version ${lock.packages?.['']?.version} != ${version}`)

console.log(`Version check passed: v${version}`)
