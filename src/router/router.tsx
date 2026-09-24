import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { RouterContext, type RouterValue } from '@/router/context'

function currentPathname(): string {
  if (typeof window === 'undefined') return '/'
  return window.location.pathname || '/'
}

interface RouterProviderProps {
  /**
   * 固定路径。预渲染 / SSR 与测试场景传入具体值；
   * 浏览器运行时省略，改为读取 location 并监听 popstate。
   */
  path?: string
  children: ReactNode
}

export function RouterProvider({ path, children }: RouterProviderProps) {
  const [internalPath, setInternalPath] = useState(() => path ?? currentPathname())
  const controlled = path !== undefined
  const activePath = controlled ? path : internalPath

  useEffect(() => {
    if (controlled) return
    const handlePopState = () => setInternalPath(currentPathname())
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [controlled])

  const navigate = useCallback(
    (to: string, options?: { replace?: boolean }) => {
      if (!controlled && to !== window.location.pathname) {
        if (options?.replace) window.history.replaceState(null, '', to)
        else window.history.pushState(null, '', to)
      }
      setInternalPath(to)
      if (!controlled) window.scrollTo({ top: 0, behavior: 'instant' })
    },
    [controlled],
  )

  const value = useMemo<RouterValue>(() => ({ path: activePath, navigate }), [activePath, navigate])

  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>
}
