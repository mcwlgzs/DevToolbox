import { StrictMode } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

const container = document.getElementById('root')

if (!container) {
  throw new Error('找不到 #root 挂载点')
}

const tree = (
  <StrictMode>
    <App />
  </StrictMode>
)

/** 规范化路径：统一成以 / 开头和结尾、去掉查询串与哈希。 */
function normalizeRoute(path: string): string {
  const clean = path.split('?')[0].split('#')[0]
  const withLeadingSlash = clean.startsWith('/') ? clean : `/${clean}`
  return withLeadingSlash.endsWith('/') ? withLeadingSlash : `${withLeadingSlash}/`
}

/**
 * 预渲染时会在 <html data-prerender="…"> 上记录该文件对应的路由。
 *
 * 只有当它和当前地址一致时才能 hydrate：静态托管把未知路径回退到 index.html 时
 * （例如 Netlify / vite preview 的 SPA 回退），服务端给的是首页 HTML，而客户端会渲染
 * 404 页面，直接 hydrate 会触发 React #418。此时改为完整客户端渲染更安全。
 */
const prerenderedRoute = document.documentElement.dataset.prerender
const currentRoute = normalizeRoute(window.location.pathname)
const canHydrate =
  prerenderedRoute !== undefined && normalizeRoute(prerenderedRoute) === currentRoute

if (container.firstChild && canHydrate) {
  hydrateRoot(container, tree)
} else {
  // 清掉不匹配的预渲染内容，避免 createRoot 追加后出现重复节点
  container.replaceChildren()
  createRoot(container).render(tree)
}
