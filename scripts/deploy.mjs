#!/usr/bin/env node
/**
 * 一键部署：构建 → 打包 → 上传 → 解压 → 修权限 → 重载 nginx。
 *
 * 用法：
 *   node scripts/deploy.mjs                正式部署
 *   node scripts/deploy.mjs --dry-run      只做本地部分（构建 + 打包 + 自检），不连服务器
 *   node scripts/deploy.mjs --skip-build   复用现有 dist，不重新构建
 *
 * 配置（优先级：环境变量 > deploy.config.json > 默认值）：
 *   DEPLOY_HOST    必填，服务器地址
 *   DEPLOY_USER    默认 root
 *   DEPLOY_PORT    默认 22
 *   DEPLOY_PATH    默认 /var/www/devtoolbox/dist
 *   DEPLOY_OWNER   默认 www-data:www-data（留空则跳过 chown）
 *   DEPLOY_RELOAD  默认 nginx（留空则跳过重载）
 *
 * 真正的服务器信息请写进 deploy.config.json —— 它已被 .gitignore 排除，不会进公开仓库。
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const ROOT = process.cwd()
const DIST = join(ROOT, 'dist')
const args = new Set(process.argv.slice(2))
const DRY_RUN = args.has('--dry-run')
const SKIP_BUILD = args.has('--skip-build')

const DEFAULTS = {
  user: 'root',
  port: '22',
  path: '/var/www/devtoolbox/dist',
  owner: 'www-data:www-data',
  reload: 'nginx',
}

/** 拒绝把内容铺到危险的目录上：解压前会清空目标目录，路径写错就是灾难。 */
const FORBIDDEN_PATHS = [
  '/', '/bin', '/boot', '/dev', '/etc', '/home', '/lib', '/opt', '/proc', '/root',
  '/run', '/sbin', '/srv', '/sys', '/tmp', '/usr', '/var', '/var/www', '/www',
]

function readConfigFile() {
  const file = join(ROOT, 'deploy.config.json')
  if (!existsSync(file)) return {}
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'))
    return typeof parsed === 'object' && parsed !== null ? parsed : {}
  } catch (error) {
    fail(`deploy.config.json 不是合法 JSON：${error.message}`)
  }
}

const fileConfig = readConfigFile()
const config = {
  host: process.env.DEPLOY_HOST ?? fileConfig.host ?? '',
  user: process.env.DEPLOY_USER ?? fileConfig.user ?? DEFAULTS.user,
  port: String(process.env.DEPLOY_PORT ?? fileConfig.port ?? DEFAULTS.port),
  path: process.env.DEPLOY_PATH ?? fileConfig.path ?? DEFAULTS.path,
  owner: process.env.DEPLOY_OWNER ?? fileConfig.owner ?? DEFAULTS.owner,
  reload: process.env.DEPLOY_RELOAD ?? fileConfig.reload ?? DEFAULTS.reload,
}

function log(step, message) {
  console.log(`\n[${step}] ${message}`)
}
function fail(message) {
  console.error(`\n✗ ${message}`)
  process.exit(1)
}
function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, { stdio: 'inherit', ...options })
  if (result.error) fail(`无法执行 ${command}：${result.error.message}`)
  return result.status ?? 1
}

/* ---------------- 1. 配置与前置检查 ---------------- */
if (!DRY_RUN && !config.host) {
  fail(
    '缺少服务器地址。请设置 DEPLOY_HOST 环境变量，或创建 deploy.config.json：\n' +
      '  { "host": "1.2.3.4", "user": "root", "path": "/var/www/devtoolbox/dist" }',
  )
}

const normalizedPath = config.path.replace(/\/+$/, '') || '/'
if (FORBIDDEN_PATHS.includes(normalizedPath)) {
  fail(
    `DEPLOY_PATH 指向了 ${normalizedPath}，这太危险了。\n` +
      '  部署前会清空目标目录，请务必指向一个专属子目录，例如 /var/www/devtoolbox/dist。',
  )
}
if (normalizedPath.split('/').filter(Boolean).length < 2) {
  fail(`DEPLOY_PATH（${normalizedPath}）层级太浅，请至少用两级目录，例如 /var/www/devtoolbox/dist。`)
}

for (const bin of ['tar', 'scp', 'ssh']) {
  if (DRY_RUN && bin !== 'tar') continue
  const probe = spawnSync(process.platform === 'win32' ? 'where' : 'which', [bin], { stdio: 'ignore' })
  if (probe.status !== 0) fail(`找不到 ${bin}，请先安装 OpenSSH 客户端（Windows 可在「可选功能」里装）。`)
}

/* ---------------- 2. 构建 ---------------- */
if (SKIP_BUILD) {
  log('1/6', '跳过构建（--skip-build）')
} else {
  log('1/6', '构建站点（npm run build）')
  const code = run('npm', ['run', 'build'], { shell: process.platform === 'win32' })
  if (code !== 0) fail('构建失败，已中止部署，服务器上的内容保持不变。')
}

/* ---------------- 3. 产物自检 ---------------- */
log('2/6', '自检 dist 产物')
if (!existsSync(DIST)) fail('dist 目录不存在。')

const htmlFiles = []
const walk = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walk(full)
    else if (entry.name.endsWith('.html')) htmlFiles.push(full)
  }
}
walk(DIST)

for (const required of ['index.html', '404.html', 'sitemap.xml', 'robots.txt']) {
  if (!existsSync(join(DIST, required))) fail(`dist 里缺少 ${required}，产物不完整。`)
}
if (htmlFiles.length < 25) fail(`dist 里只有 ${htmlFiles.length} 个 HTML，期望至少 25 个（首页 + 23 工具 + 404）。`)

// 预渲染的每个页面都必须能在没有任何后端的情况下直接打开
const homeHtml = readFileSync(join(DIST, 'index.html'), 'utf8')
const canonical = /<link rel="canonical" href="([^"]+)"/.exec(homeHtml)?.[1] ?? ''
if (canonical.includes('example.com')) {
  fail(`canonical 仍指向占位域名（${canonical}）。请先在 .env 里设置 VITE_SITE_URL，再重新构建。`)
}
console.log(`  · ${htmlFiles.length} 个 HTML 页面`)
console.log(`  · canonical = ${canonical}`)
console.log(`  · 404.html 存在，sitemap.xml / robots.txt 存在`)
if (existsSync(join(DIST, 'CNAME'))) console.log('  · CNAME 存在（GitHub Pages 自定义域名）')

/* ---------------- 4. 打包 ---------------- */
log('3/6', '打包 dist 内容')
const staging = mkdtempSync(join(tmpdir(), 'devtoolbox-deploy-'))
const archive = join(staging, 'dist.tar.gz')
// -C dist . ：把 dist 里的内容放到压缩包根部，解压后不会多出一层 dist/
const packCode = run('tar', ['-czf', archive, '-C', DIST, '.'])
if (packCode !== 0) fail('打包失败。')
const sizeMb = (statSync(archive).size / 1024 / 1024).toFixed(2)
console.log(`  · ${archive}（${sizeMb} MB）`)

if (DRY_RUN) {
  log('4/6', '--dry-run：跳过上传与远端操作')
  console.log('  自检与打包都通过了，正式部署请去掉 --dry-run。')
  rmSync(staging, { recursive: true, force: true })
  process.exit(0)
}

/* ---------------- 5. 上传 ---------------- */
const target = `${config.user}@${config.host}`
const remoteArchive = `/tmp/devtoolbox-dist-${Date.now()}.tar.gz`

log('4/6', `上传到 ${target}:${remoteArchive}`)
const sshBase = ['-p', config.port, '-o', 'ServerAliveInterval=15']
if (run('scp', [...sshBase, archive, `${target}:${remoteArchive}`]) !== 0) {
  fail('上传失败。请确认 SSH 能免密登录（ssh-copy-id），或服务器地址/端口是否正确。')
}

/* ---------------- 6. 远端解压与重载 ---------------- */
log('5/6', '远端解压与修权限')
const remoteScript = [
  'set -e',
  `mkdir -p "${normalizedPath}"`,
  // 先清空：否则删掉的旧路由会以陈旧目录的形式继续被访问到
  `find "${normalizedPath}" -mindepth 1 -delete`,
  `tar -xzf "${remoteArchive}" -C "${normalizedPath}"`,
  config.owner ? `chown -R ${config.owner} "${normalizedPath}"` : '',
  `find "${normalizedPath}" -type d -exec chmod 755 {} +`,
  `find "${normalizedPath}" -type f -exec chmod 644 {} +`,
  `rm -f "${remoteArchive}"`,
  `echo "  已解压到 ${normalizedPath}"`,
  `ls "${normalizedPath}" | head -8`,
]
  .filter(Boolean)
  .join('\n')

const sshArgs = ['-p', config.port, '-o', 'ServerAliveInterval=15']
// -t 让 sudo 能弹密码提示（远端用 root 时无影响）
if (process.stdin.isTTY) sshArgs.push('-t')
if (run('ssh', [...sshArgs, target, remoteScript]) !== 0) fail('远端解压失败，服务器上的旧版本可能已被清空，请检查后重跑。')

if (config.reload) {
  log('6/6', `重载 ${config.reload}`)
  const reloadScript = [
    'set -e',
    'if command -v nginx >/dev/null 2>&1; then',
    '  sudo nginx -t',
    '  sudo systemctl reload nginx',
    '  echo "  nginx 已重载"',
    'else',
    '  echo "  未检测到 nginx，跳过重载（静态托管无需此步）"',
    'fi',
  ].join('\n')
  if (run('ssh', [...sshArgs, target, reloadScript]) !== 0) {
    console.log('\n⚠ 重载 nginx 失败，但文件已经上传成功。请手动执行 sudo nginx -t && sudo systemctl reload nginx。')
  }
} else {
  log('6/6', '跳过重载（DEPLOY_RELOAD 为空）')
}

rmSync(staging, { recursive: true, force: true })

console.log(`\n✓ 部署完成：${config.host}${normalizedPath}`)
console.log('  提示：首次部署后请确认 DNS 已解析、证书已签发，并访问一次检查 404 页面。')
