/**
 * 构建期预渲染（多路由）。
 *
 * 对注册表中的每个工具路由：
 *   1. 用 renderToString 把 <App path="…" /> 渲染为静态 HTML 注入 #root
 *   2. 替换 index.html 中 <!-- seo:start --> … <!-- seo:end --> 之间的
 *      title / description / canonical / Open Graph / Twitter / JSON-LD
 *   3. 输出到 dist/<slug>/index.html（首页为 dist/index.html）
 * 最后生成 robots.txt 与 sitemap.xml。
 *
 * 由 `npm run build` 调用：
 *   vite build --ssr scripts/prerender.tsx --outDir node_modules/.tmp/prerender
 *   node node_modules/.tmp/prerender/prerender.js
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { renderToString } from 'react-dom/server'
import App from '../src/App.tsx'
import { HOME_TOOL, SITE_NAME, TOOLS, toolUrl, type ToolMeta } from '../src/tools/registry.ts'

const siteUrl = (import.meta.env.VITE_SITE_URL || 'https://example.com').replace(/\/+$/, '')
const distDir = resolve(process.cwd(), 'dist')
const indexPath = resolve(distDir, 'index.html')
const ROOT_MARKER = '<div id="root"></div>'
const SEO_START = '<!-- seo:start'
const SEO_END = '<!-- seo:end -->'

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/"/g, '&quot;')
}

function fullTitle(tool: ToolMeta): string {
  return tool.slug ? `${tool.title} | ${SITE_NAME}` : tool.title
}

function buildSeoBlock(tool: ToolMeta): string {
  const url = toolUrl(tool, siteUrl)
  const title = fullTitle(tool)
  const image = `${siteUrl}/og-image.png`

  const graph: Record<string, unknown>[] = [
    {
      '@type': 'WebApplication',
      '@id': `${siteUrl}/#app`,
      name: SITE_NAME,
      alternateName: '开发者在线工具箱',
      url: `${siteUrl}/`,
      applicationCategory: 'DeveloperApplication',
      operatingSystem: 'Any',
      browserRequirements: '需要支持 ES2023 的现代浏览器（Chrome / Edge / Firefox / Safari）',
      inLanguage: 'zh-CN',
      description: HOME_TOOL.description,
      isAccessibleForFree: true,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'CNY' },
      featureList: TOOLS.filter((item) => item.slug).map((item) => item.name),
    },
    {
      '@type': 'WebPage',
      '@id': `${url}#page`,
      url,
      name: title,
      description: tool.description,
      inLanguage: 'zh-CN',
      isPartOf: { '@id': `${siteUrl}/#app` },
      about: tool.keywords.slice(0, 5),
      primaryImageOfPage: { '@type': 'ImageObject', url: image, width: 1200, height: 630 },
    },
    {
      '@type': 'BreadcrumbList',
      '@id': `${url}#breadcrumb`,
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: '全部工具', item: `${siteUrl}/` },
        ...(tool.slug
          ? [{ '@type': 'ListItem', position: 2, name: tool.name, item: url }]
          : []),
      ],
    },
    {
      '@type': 'FAQPage',
      '@id': `${url}#faq`,
      mainEntity: tool.faq.map((item) => ({
        '@type': 'Question',
        name: item.question,
        acceptedAnswer: { '@type': 'Answer', text: item.answer },
      })),
    },
  ]

  const jsonLd = JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(
    /</g,
    '\\u003c',
  )

  return [
    '<title>' + escapeHtml(title) + '</title>',
    `<meta name="description" content="${escapeAttr(tool.description)}" />`,
    `<meta name="keywords" content="${escapeAttr(tool.keywords.join(','))}" />`,
    '<meta name="robots" content="index, follow, max-image-preview:large" />',
    `<link rel="canonical" href="${url}" />`,
    '<meta property="og:type" content="website" />',
    `<meta property="og:site_name" content="${SITE_NAME}" />`,
    '<meta property="og:locale" content="zh_CN" />',
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:title" content="${escapeAttr(tool.title)}" />`,
    `<meta property="og:description" content="${escapeAttr(tool.description)}" />`,
    `<meta property="og:image" content="${image}" />`,
    '<meta property="og:image:width" content="1200" />',
    '<meta property="og:image:height" content="630" />',
    `<meta property="og:image:alt" content="${escapeAttr(title)}" />`,
    '<meta name="twitter:card" content="summary_large_image" />',
    `<meta name="twitter:title" content="${escapeAttr(tool.title)}" />`,
    `<meta name="twitter:description" content="${escapeAttr(tool.description)}" />`,
    `<meta name="twitter:image" content="${image}" />`,
    `<script type="application/ld+json">${jsonLd}</script>`,
  ].join('\n    ')
}

/* ------------------------------------------------------------------ */

const template = readFileSync(indexPath, 'utf8')

if (!template.includes(ROOT_MARKER)) {
  console.error(`✗ dist/index.html 中找不到 ${ROOT_MARKER}`)
  process.exit(1)
}
if (!template.includes(SEO_START) || !template.includes(SEO_END)) {
  console.error('✗ dist/index.html 中缺少 seo:start / seo:end 标记')
  process.exit(1)
}

const seoStartIndex = template.indexOf(SEO_START)
const seoEndIndex = template.indexOf(SEO_END)
const head = template.slice(0, seoStartIndex)
const tail = template.slice(seoEndIndex + SEO_END.length)

/**
 * 在 <html> 上记录该文件对应的路由。
 * 客户端据此判断能否 hydrate：静态托管把未知路径回退到 index.html 时，
 * 服务端给的是首页 HTML，客户端却要渲染 404，直接 hydrate 会触发 React #418。
 */
function withPrerenderRoute(html: string, route: string): string {
  return html.replace(
    /<html([^>]*?)data-prerender="[^"]*"/,
    `<html$1data-prerender="${route}"`,
  )
}

const results: Array<{ path: string; chars: number; file: string }> = []

/**
 * 把预渲染的 HTML 注入 #root 占位符。
 *
 * 必须用「函数式替换」：String.replace 的字符串替换串里 `$&`、`$'`、`$\``、`$1`
 * 都是特殊模式。页面文案里出现 `$&`（例如正则工具的占位符说明）时，
 * 会被替换成匹配到的 `<div id="root"></div>`，把产物 HTML 污染掉。
 */
function injectRoot(html: string, appHtml: string): string {
  return html.replace(ROOT_MARKER, () => `<div id="root">${appHtml}</div>`)
}

/** 注入后必须只剩一个 #root；多出来说明替换串被当成了模式。 */
function assertSingleRoot(html: string, route: string): void {
  const count = html.split('<div id="root">').length - 1
  if (count !== 1) {
    console.error(`✗ ${route} 注入后出现 ${count} 个 #root，预渲染 HTML 已被污染`)
    process.exit(1)
  }
}

for (const tool of TOOLS) {
  const appHtml = renderToString(<App path={tool.path} />)

  const required = [
    tool.name,
    '常见问题',
    ...(tool.slug ? [tool.about[0].slice(0, 12)] : ['开发者在线工具箱']),
  ]
  const missing = required.filter((token) => !appHtml.includes(token))
  if (missing.length > 0) {
    console.error(`✗ ${tool.path} 预渲染内容缺少：${missing.join('、')}`)
    process.exit(1)
  }

  const seoBlock = buildSeoBlock(tool)
  const html = injectRoot(
    withPrerenderRoute(
      head +
        `<!-- seo:start 由 scripts/prerender.tsx 按路由替换为对应标题 / 描述 / canonical / JSON-LD -->\n    ` +
        seoBlock +
        '\n    ' +
        tail,
      tool.path,
    ),
    appHtml,
  )

  assertSingleRoot(html, tool.path)

  const outFile = tool.slug
    ? resolve(distDir, tool.slug, 'index.html')
    : resolve(distDir, 'index.html')

  mkdirSync(dirname(outFile), { recursive: true })
  writeFileSync(outFile, html, 'utf8')
  results.push({ path: tool.path, chars: appHtml.length, file: outFile.replace(distDir, 'dist') })
}

/* 404 页面 ---------------------------------------------------------- */

// 用一个注册表里不存在的路径渲染，客户端路由同样会走 NotFoundPage，
// 因此「静态托管的 404.html」与「SPA 回退到 index.html 后的客户端渲染」结果一致。
const notFoundAppHtml = renderToString(<App path="/__not-found__/" />)
if (!notFoundAppHtml.includes('页面不存在')) {
  console.error('✗ 404 页面预渲染失败')
  process.exit(1)
}

const notFoundSummary = '这个地址没有对应的工具，请从工具箱首页选择需要的工具。'
const notFoundSeo = [
  `<title>页面不存在 | ${SITE_NAME}</title>`,
  `<meta name="description" content="${notFoundSummary}" />`,
  '<meta name="robots" content="noindex, follow" />',
  `<meta property="og:title" content="页面不存在 | ${SITE_NAME}" />`,
  `<meta property="og:description" content="${notFoundSummary}" />`,
].join('\n    ')

const notFoundFile = resolve(distDir, '404.html')
const notFoundHtml = injectRoot(
  withPrerenderRoute(
    head +
      '<!-- seo:start 404 页面：noindex，不进入 sitemap -->\n    ' +
      notFoundSeo +
      '\n    ' +
      tail,
    // 故意用一个不会真实存在的路由，客户端永远走完整渲染，避免 SPA 回退时 hydrate 失败
    '/__not-found__/',
  ),
  notFoundAppHtml,
)
assertSingleRoot(notFoundHtml, '(404)')
writeFileSync(notFoundFile, notFoundHtml, 'utf8')
results.push({
  path: '(404)',
  chars: notFoundAppHtml.length,
  file: notFoundFile.replace(distDir, 'dist'),
})

/* robots.txt + sitemap.xml ------------------------------------------ */

writeFileSync(
  resolve(distDir, 'robots.txt'),
  ['User-agent: *', 'Allow: /', '', `Sitemap: ${siteUrl}/sitemap.xml`, ''].join('\n'),
  'utf8',
)

const today = new Date().toISOString().slice(0, 10)
writeFileSync(
  resolve(distDir, 'sitemap.xml'),
  [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...TOOLS.map((tool) =>
      [
        '  <url>',
        `    <loc>${toolUrl(tool, siteUrl)}</loc>`,
        `    <lastmod>${today}</lastmod>`,
        `    <changefreq>${tool.slug ? 'monthly' : 'weekly'}</changefreq>`,
        `    <priority>${tool.slug ? '0.8' : '1.0'}</priority>`,
        '  </url>',
      ].join('\n'),
    ),
    '</urlset>',
    '',
  ].join('\n'),
  'utf8',
)

console.log(`✓ 预渲染完成，共 ${results.length} 个路由：`)
for (const result of results) {
  console.log(`    ${result.path.padEnd(12)} → ${result.file} （${result.chars.toLocaleString('en-US')} 字符）`)
}
console.log(`✓ 生成 robots.txt 与 sitemap.xml（站点 ${siteUrl}）`)

if (template.includes('%VITE_SITE_URL%')) {
  console.warn('! index.html 中仍存在未替换的 %VITE_SITE_URL%，请检查 .env 配置')
}
if (siteUrl.includes('example.com')) {
  console.warn(
    `! 站点域名仍是占位值 ${siteUrl}，canonical / OG / sitemap 会指向错误地址；` +
      '部署前请在 .env 或 .env.local 中设置 VITE_SITE_URL',
  )
}
