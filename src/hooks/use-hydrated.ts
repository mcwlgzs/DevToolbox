import { useSyncExternalStore } from 'react'

const noopSubscribe = () => () => {}

/**
 * 是否已在客户端完成 hydration。
 * 服务端 / 预渲染与 hydration 首次渲染返回 false，客户端接管后返回 true，
 * 用于避免「依赖主题、随机数、时间」的内容产生 hydration 不匹配。
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  )
}
