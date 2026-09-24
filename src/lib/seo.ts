import { SITE_NAME, type ToolMeta } from '@/tools/registry'

/** 更新 <meta name=...> / <meta property=...> 的 content。 */
function setMeta(attribute: 'name' | 'property', key: string, content: string): void {
  const element = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`)
  if (element) element.content = content
}

function canonicalOrigin(): string {
  const canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')
  try {
    return canonical ? new URL(canonical.href).origin : ''
  } catch {
    return ''
  }
}

function setCanonical(href: string): void {
  const canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')
  if (canonical) canonical.href = href
}

/**
 * 客户端路由切换后同步页面的 SEO 信息。
 * tool 为 undefined 表示当前路径不存在（404），此时标记 noindex，避免产生软 404。
 * canonical 只替换路径、保留预渲染写入的站点源，避免把 VITE_SITE_URL 覆盖成运行时域名。
 */
export function applySeo(tool: ToolMeta | undefined): void {
  if (typeof document === 'undefined') return

  if (!tool) {
    document.title = `页面不存在 | ${SITE_NAME}`
    const summary = '这个地址没有对应的工具，请从工具箱首页选择需要的工具。'
    setMeta('name', 'description', summary)
    setMeta('name', 'robots', 'noindex, follow')
    setMeta('property', 'og:title', `页面不存在 | ${SITE_NAME}`)
    setMeta('property', 'og:description', summary)
    setMeta('name', 'twitter:title', `页面不存在 | ${SITE_NAME}`)
    setMeta('name', 'twitter:description', summary)
    return
  }

  setMeta('name', 'robots', 'index, follow, max-image-preview:large')

  const fullTitle = tool.slug ? `${tool.title} | ${SITE_NAME}` : tool.title
  document.title = fullTitle

  setMeta('name', 'description', tool.description)
  setMeta('property', 'og:title', tool.title)
  setMeta('property', 'og:description', tool.description)
  setMeta('name', 'twitter:title', tool.title)
  setMeta('name', 'twitter:description', tool.description)

  const origin = canonicalOrigin()
  if (origin) {
    setMeta('property', 'og:url', `${origin}${tool.path}`)
    setCanonical(`${origin}${tool.path}`)
  }
}
