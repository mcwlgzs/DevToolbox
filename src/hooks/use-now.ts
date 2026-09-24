import { useSyncExternalStore } from 'react'

/**
 * 全局共享的「当前时间」外部存储。
 * 取值在 interval 回调里更新并通知订阅者，因此 getSnapshot 始终稳定，
 * 不会触发 React 的 “getSnapshot should be cached” 警告；
 * 服务端与 hydration 首次渲染取 server 快照（0），天然避免 hydration 不匹配。
 */
let current = 0
let timer: number | null = null
const listeners = new Set<() => void>()

function tick(): void {
  current = Date.now()
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)

  if (current === 0) tick()
  if (timer === null && typeof window !== 'undefined') {
    timer = window.setInterval(tick, 1000)
  }

  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && timer !== null) {
      window.clearInterval(timer)
      timer = null
    }
  }
}

function getSnapshot(): number {
  return current
}

function getServerSnapshot(): number {
  return 0
}

/** 当前时间戳（毫秒），每秒更新；未完成 hydration 时返回 0。 */
export function useNow(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
