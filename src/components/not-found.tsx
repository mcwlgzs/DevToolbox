import { CompassIcon, SearchXIcon } from 'lucide-react'
import { ToolIcon } from '@/components/tool-icons'
import { Link } from '@/router/link'
import { TOOLS } from '@/tools/registry'

/**
 * 404 页面。
 * 静态托管上会输出为 dist/404.html（返回 404 状态码）；
 * 若托管方把所有未知路径回退到 index.html，客户端路由也会渲染这个页面，
 * 并把它标记为 noindex，避免产生软 404。
 */
export function NotFoundPage() {
  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col items-center gap-3 py-8 text-center">
        <span className="flex size-12 items-center justify-center rounded-full border border-border/70 bg-card text-muted-foreground">
          <SearchXIcon className="size-6" />
        </span>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">页面不存在</h1>
        <p className="max-w-xl text-sm text-muted-foreground text-balance">
          这个地址没有对应的工具，可能是链接输入有误或页面已经调整。下面是全部可用的工具。
        </p>
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 rounded-md border border-border/70 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent"
        >
          <CompassIcon className="size-3.5" />
          返回工具箱首页
        </Link>
      </section>

      <section aria-label="全部工具" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {TOOLS.filter((tool) => tool.slug).map((tool) => (
          <Link
            key={tool.slug}
            to={tool.path}
            className="group flex items-center gap-2.5 rounded-xl border border-border/70 bg-card/50 p-4 transition-colors hover:border-primary/50 hover:bg-card"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-background text-primary">
              <ToolIcon slug={tool.slug} className="size-4" />
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="text-sm font-semibold tracking-tight">{tool.name}</span>
              <span className="truncate text-xs text-muted-foreground">{tool.summary}</span>
            </span>
          </Link>
        ))}
      </section>
    </div>
  )
}
