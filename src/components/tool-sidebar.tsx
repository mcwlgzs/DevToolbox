import { ClockIcon } from 'lucide-react'
import { ToolIcon } from '@/components/tool-icons'
import { Link } from '@/router/link'
import { useRouter } from '@/router/context'
import { CATEGORIES, TOOLS, type ToolMeta } from '@/tools/registry'
import { cn } from '@/lib/utils'

interface SidebarLinkProps {
  tool: ToolMeta
  active: boolean
}

function SidebarLink({ tool, active }: SidebarLinkProps) {
  return (
    <Link
      to={tool.path}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors',
        active
          ? 'bg-secondary font-medium text-secondary-foreground'
          : 'text-muted-foreground hover:bg-accent hover:text-foreground',
      )}
    >
      <ToolIcon slug={tool.slug} className="size-4 shrink-0" />
      <span className="truncate">{tool.name}</span>
    </Link>
  )
}

/** 宽屏侧边栏：按分类分组的全部工具。
 *  不在这里重复「最近使用」——13 个工具已经全部可见，重复列表只是噪音；
 *  最近使用改为在 Ctrl+K 面板里把常用工具排在前面。 */
export function ToolSidebar({ className }: { className?: string }) {
  const { path } = useRouter()
  const tools = TOOLS.filter((tool) => tool.slug !== '')

  return (
    <aside
      id="tool-sidebar"
      data-slot="tool-sidebar"
      className={cn(
        'scrollbar-thin sticky top-14 hidden max-h-[calc(100svh-3.5rem)] w-[212px] shrink-0 overflow-y-auto border-r border-border/60 pr-3 lg:block',
        className,
      )}
      aria-label="工具导航"
    >
      <nav className="flex flex-col gap-4 py-5">
        <Link
          to="/"
          aria-current={path === '/' ? 'page' : undefined}
          className={cn(
            'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors',
            path === '/'
              ? 'bg-secondary font-medium text-secondary-foreground'
              : 'text-muted-foreground hover:bg-accent hover:text-foreground',
          )}
        >
          <ClockIcon className="size-4 shrink-0" />
          全部工具
        </Link>

        {CATEGORIES.map((category) => {
          const items = tools.filter((tool) => tool.category === category.id)
          if (items.length === 0) return null
          return (
            <div key={category.id} className="flex flex-col gap-1">
              <span className="px-2.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                {category.name}
              </span>
              {items.map((tool) => (
                <SidebarLink key={tool.slug} tool={tool} active={tool.path === path} />
              ))}
            </div>
          )
        })}
      </nav>
    </aside>
  )
}
