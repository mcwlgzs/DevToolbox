import { createContext, useContext } from 'react'

export interface RouterValue {
  /** 当前路径，始终是注册表中的规范路径 */
  path: string
  navigate: (to: string, options?: { replace?: boolean }) => void
}

export const RouterContext = createContext<RouterValue | null>(null)

export function useRouter(): RouterValue {
  const value = useContext(RouterContext)
  if (!value) throw new Error('useRouter 必须在 <RouterProvider> 内使用')
  return value
}
