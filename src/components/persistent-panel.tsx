import type { ReactNode } from 'react'
import { TabsContent } from '@/components/ui/tabs'
import { useHydrated } from '@/hooks/use-hydrated'
import { cn } from '@/lib/utils'

/**
 * 常驻挂载的 Tabs 面板：切换页签时用 CSS 隐藏而不是卸载，已输入的内容与算好的结果不会丢。
 *
 * 预渲染阶段只输出当前页签的内容，避免把用户看不到的内容写进静态 HTML：
 * hydration 前与预渲染保持一致，客户端接管后再挂载其余面板。
 */
export function PersistentPanel({
  value,
  children,
  className,
}: {
  value: string
  children: ReactNode
  className?: string
}) {
  const hydrated = useHydrated()

  if (!hydrated) {
    return (
      <TabsContent value={value} className={className}>
        {children}
      </TabsContent>
    )
  }

  return (
    <TabsContent value={value} forceMount className={cn('data-[state=inactive]:hidden', className)}>
      {children}
    </TabsContent>
  )
}
