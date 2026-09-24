import { useSyncExternalStore } from 'react'

/**
 * 侧边栏是否收起，存在 localStorage。
 *
 * 与「最近使用」用同一套模式：服务端 / hydration 首帧取 server 快照（展开），
 * 客户端接管后才读真实值，所以不会 hydration 不匹配。
 *
 * 真正的可见性由 `<html data-sidebar>` 上的属性 + index.css 里的一条规则决定，
 * React 不去改 aside 的 class —— 这样首帧 DOM 与服务端完全一致，
 * 而 index.html 的内联脚本能在首次绘制前就把属性设好，收起状态不会「先展开再收起来」闪一下。
 */

const STORAGE_KEY = 'devtoolbox:sidebar'

const listeners = new Set<() => void>()
let snapshot = false
let loaded = false

/** 把当前状态写到 <html> 上，供 CSS 使用。 */
function applyAttribute(collapsed: boolean): void {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.sidebar = collapsed ? 'collapsed' : 'expanded'
}

function load(): void {
  if (loaded || typeof window === 'undefined') return
  loaded = true
  try {
    snapshot = window.localStorage.getItem(STORAGE_KEY) === 'collapsed'
  } catch {
    snapshot = false
  }
  applyAttribute(snapshot)
}

function emit(): void {
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  load()
  // 其它标签页改了这个值时保持一致
  window.addEventListener('storage', handleStorage)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) window.removeEventListener('storage', handleStorage)
  }
}

function handleStorage(event: StorageEvent): void {
  if (event.key !== null && event.key !== STORAGE_KEY) return
  snapshot = event.newValue === 'collapsed'
  applyAttribute(snapshot)
  emit()
}

function getSnapshot(): boolean {
  load()
  return snapshot
}

/** 服务端与 hydration 首帧：一律按「展开」渲染，与预渲染产物一致。 */
function getServerSnapshot(): boolean {
  return false
}

export function setSidebarCollapsed(collapsed: boolean): void {
  if (typeof window === 'undefined') return
  snapshot = collapsed
  loaded = true
  applyAttribute(collapsed)
  try {
    window.localStorage.setItem(STORAGE_KEY, collapsed ? 'collapsed' : 'expanded')
  } catch {
    // 隐私模式 / 配额满：写不进去也不影响本次会话的显示
  }
  emit()
}

export function toggleSidebar(): void {
  setSidebarCollapsed(!getSnapshot())
}

export function useSidebarCollapsed(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
