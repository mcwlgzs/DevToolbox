import { useState } from 'react'
import { LayoutGridIcon, PanelLeftCloseIcon, PanelLeftOpenIcon, ShieldCheckIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ThemeToggle } from '@/components/theme-toggle'
import { ToolIcon } from '@/components/tool-icons'
import { ToolSearch } from '@/components/tool-search'
import { Link } from '@/router/link'
import { useRouter } from '@/router/context'
import { CATEGORIES, SITE_NAME, TOOLS } from '@/tools/registry'
import { cn } from '@/lib/utils'
import { toggleSidebar, useSidebarCollapsed } from '@/hooks/use-sidebar'
import type { Theme } from '@/hooks/use-theme'

interface SiteHeaderProps {
  theme: Theme
  onToggleTheme: () => void
}

export function SiteHeader({ theme, onToggleTheme }: SiteHeaderProps) {
  const { path } = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)
  const collapsed = useSidebarCollapsed()
  const tools = TOOLS.filter((tool) => tool.slug !== '')

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur-xl">
      <div className="mx-auto flex h-14 w-full max-w-[1400px] items-center gap-3 px-4 sm:px-6">
        <Link
          to="/"
          className="flex shrink-0 items-center gap-2 rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <span className="flex size-8 items-center justify-center rounded-lg border border-border/70 bg-card text-primary">
            <ToolIcon slug="" className="size-4" />
          </span>
          <span className="flex flex-col leading-none">
            <span className="text-sm font-semibold tracking-tight">{SITE_NAME}</span>
            <span className="mt-0.5 hidden text-[10px] text-muted-foreground sm:block">
              开发者在线工具箱
            </span>
          </span>
        </Link>

        {/* 侧边栏收起 / 展开：紧挨着它控制的侧边栏放在左侧，
            而不是丢到右边的搜索框旁边——那样位置和对象离得太远，看着别扭。
            只对宽屏有意义，窄屏侧边栏本来就不显示。 */}
        <Button
          variant="outline"
          size="icon"
          className="hidden lg:inline-flex"
          aria-label={collapsed ? '展开侧边栏' : '收起侧边栏'}
          aria-expanded={!collapsed}
          aria-controls="tool-sidebar"
          onClick={toggleSidebar}
        >
          {collapsed ? <PanelLeftOpenIcon /> : <PanelLeftCloseIcon />}
        </Button>

        <div className="ml-auto flex items-center gap-2">
          <ToolSearch />

          <span className="hidden items-center gap-1.5 text-xs text-muted-foreground xl:inline-flex">
            <ShieldCheckIcon className="size-3.5" />
            数据不出浏览器
          </span>

          {/* 窄屏：弹出式工具导航；宽屏用左侧栏 */}
          <Button
            variant="outline"
            size="icon"
            className="lg:hidden"
            aria-label="打开工具列表"
            onClick={() => setMenuOpen(true)}
          >
            <LayoutGridIcon />
          </Button>

          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
        </div>
      </div>

      <Dialog open={menuOpen} onOpenChange={setMenuOpen}>
        <DialogContent className="top-[8%] max-h-[80svh] max-w-md translate-y-0 gap-4 overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">全部工具</DialogTitle>
            <DialogDescription>共 {tools.length} 个工具，全部在浏览器本地运行</DialogDescription>
          </DialogHeader>

          <nav className="flex flex-col gap-4" aria-label="工具导航">
            {CATEGORIES.map((category) => {
              const items = tools.filter((tool) => tool.category === category.id)
              if (items.length === 0) return null
              return (
                <div key={category.id} className="flex flex-col gap-1">
                  <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                    {category.name}
                  </span>
                  {items.map((tool) => (
                    <Link
                      key={tool.slug}
                      to={tool.path}
                      onClick={() => setMenuOpen(false)}
                      aria-current={tool.path === path ? 'page' : undefined}
                      className={cn(
                        'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors',
                        tool.path === path
                          ? 'bg-secondary font-medium text-secondary-foreground'
                          : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                      )}
                    >
                      <ToolIcon slug={tool.slug} className="size-4 shrink-0" />
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate">{tool.name}</span>
                        <span className="truncate text-[11px] text-muted-foreground">{tool.summary}</span>
                      </span>
                    </Link>
                  ))}
                </div>
              )
            })}
          </nav>
        </DialogContent>
      </Dialog>
    </header>
  )
}
