import { useSyncExternalStore } from 'react'

/**
 * 「最近使用」工具列表，存在 localStorage。
 *
 * 用 useSyncExternalStore 而不是 useState + useEffect：
 * 服务端 / hydration 首次渲染取 server 快照（空数组），客户端接管后才显示真实记录，
 * 既不会 hydration 不匹配，也不需要额外的 effect。
 */

const STORAGE_KEY = 'devtoolbox:recent'
const MAX_RECENT = 5
const EMPTY: readonly string[] = Object.freeze([])

let snapshot: readonly string[] = EMPTY
let loaded = false
const listeners = new Set<() => void>()

function load(): void {
  if (loaded || typeof window === 'undefined') return
  loaded = true
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    if (Array.isArray(parsed)) {
      snapshot = Object.freeze(parsed.filter((item): item is string => typeof item === 'string'))
    }
  } catch {
    snapshot = EMPTY
  }
}

function emit(): void {
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  load()
  return () => {
    listeners.delete(listener)
  }
}

function getSnapshot(): readonly string[] {
  load()
  return snapshot
}

function getServerSnapshot(): readonly string[] {
  return EMPTY
}

/** 记录一次访问，最新的排在最前。 */
export function pushRecentTool(slug: string): void {
  if (!slug || typeof window === 'undefined') return
  load()
  const next = [slug, ...snapshot.filter((item) => item !== slug)].slice(0, MAX_RECENT)
  snapshot = Object.freeze(next)
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // 隐私模式下 localStorage 可能不可写，忽略即可
  }
  emit()
}

export function clearRecentTools(): void {
  snapshot = EMPTY
  loaded = true
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // 忽略
  }
  emit()
}

export function useRecentTools(): readonly string[] {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
