import type { ReactNode } from 'react'
import { ChevronRightIcon } from 'lucide-react'
import { ToolIcon } from '@/components/tool-icons'
import { Link } from '@/router/link'
import { HOME_TOOL, CATEGORIES, TOOLS, type ToolMeta } from '@/tools/registry'

interface ToolShellProps {
  tool: ToolMeta
  children: ReactNode
}

/** 工具页外壳：面包屑 + 紧凑标题（首屏即用）+ 工具主体 + 可索引的正文与 FAQ。 */
export function ToolShell({ tool, children }: ToolShellProps) {
  return (
    <div className="flex flex-col gap-4">
      {/* 可见面包屑：与 JSON-LD 中的 BreadcrumbList 对应 */}
      <nav
        aria-label="面包屑"
        className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
      >
        <Link to="/" className="transition-colors hover:text-foreground hover:underline">
          全部工具
        </Link>
        <ChevronRightIcon className="size-3" aria-hidden="true" />
        <span className="text-foreground">{tool.name}</span>
      </nav>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-card text-primary">
          <ToolIcon slug={tool.slug} className="size-4" />
        </span>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{tool.name}</h1>
        <p className="w-full text-xs text-muted-foreground sm:w-auto sm:text-sm">{tool.summary}</p>
      </div>

      {children}

      <ContentSection tool={tool} />
    </div>
  )
}

/** 工具下方的正文与 FAQ —— 供搜索引擎抓取的实质内容。 */
export function ContentSection({ tool }: { tool: ToolMeta }) {
  const headingId = `about-${tool.slug || 'home'}`

  return (
    <section aria-labelledby={headingId} className="mt-4 border-t border-border/60 pt-8">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
        <div className="flex flex-col gap-3">
          <h2 id={headingId} className="text-lg font-semibold tracking-tight">
            关于{tool.slug ? tool.name : '这个工具箱'}
          </h2>
          {tool.about.map((paragraph) => (
            <p key={paragraph.slice(0, 24)} className="text-sm leading-relaxed text-muted-foreground">
              {paragraph}
            </p>
          ))}
        </div>

        <div className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold tracking-tight">常见问题</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {tool.faq.map((item) => (
              <article
                key={item.question}
                className="flex flex-col gap-1.5 rounded-xl border border-border/60 bg-card/40 p-4"
              >
                <h3 className="text-sm font-medium">{item.question}</h3>
                <p className="text-xs leading-relaxed text-muted-foreground">{item.answer}</p>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

function ToolCard({ tool }: { tool: ToolMeta }) {
  return (
    <Link
      to={tool.path}
      className="group flex flex-col gap-2 rounded-xl border border-border/70 bg-card/50 p-4 transition-colors hover:border-primary/50 hover:bg-card focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <span className="flex items-center gap-2">
        <span className="flex size-8 items-center justify-center rounded-lg border border-border/70 bg-background text-primary">
          <ToolIcon slug={tool.slug} className="size-4" />
        </span>
        <span className="text-sm font-semibold tracking-tight">{tool.name}</span>
      </span>
      <span className="text-xs leading-relaxed text-muted-foreground">{tool.summary}</span>
      <span className="mt-1 flex flex-wrap gap-1">
        {tool.keywords.slice(0, 3).map((keyword) => (
          <span
            key={keyword}
            className="rounded-full border border-border/60 px-2 py-0.5 font-mono text-[10px] text-muted-foreground"
          >
            {keyword}
          </span>
        ))}
      </span>
    </Link>
  )
}

/** 首页：按分类分组的工具导航，一次点击即可到达任意工具。 */
export function HomePage() {
  const tools = TOOLS.filter((tool) => tool.slug !== '')

  return (
    <div className="flex flex-col gap-7">
      <section className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">开发者在线工具箱</h1>
        <p className="max-w-3xl text-xs leading-relaxed text-muted-foreground sm:text-sm">
          {tools.length} 个高频开发小工具，全部在浏览器本地运行，输入内容不会上传到任何服务器，
          页面加载完成后断网也能继续使用。按{' '}
          <kbd className="rounded border border-border/70 bg-muted px-1.5 py-0.5 font-mono text-[10px]">
            Ctrl / ⌘ + K
          </kbd>{' '}
          可以随时搜索并切换工具。
        </p>
      </section>

      {CATEGORIES.map((category) => {
        const items = tools.filter((tool) => tool.category === category.id)
        if (items.length === 0) return null
        const headingId = `category-${category.id}`
        return (
          <section key={category.id} aria-labelledby={headingId} className="flex flex-col gap-3">
            <div className="flex flex-col gap-0.5">
              <h2 id={headingId} className="text-base font-semibold tracking-tight">
                {category.name}
              </h2>
              <p className="text-xs text-muted-foreground">{category.description}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {items.map((tool) => (
                <ToolCard key={tool.slug} tool={tool} />
              ))}
            </div>
          </section>
        )
      })}

      <ContentSection tool={HOME_TOOL} />
    </div>
  )
}
