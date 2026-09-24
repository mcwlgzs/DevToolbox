import { useEffect, type ComponentType } from 'react'
import { Separator } from '@/components/ui/separator'
import { TooltipProvider } from '@/components/ui/tooltip'
import { NotFoundPage } from '@/components/not-found'
import { ErrorBoundary } from '@/components/error-boundary'
import { GitHubLink } from '@/components/github-link'
import { HomePage, ToolShell } from '@/components/tool-shell'
import { SiteHeader } from '@/components/site-header'
import { ToolSidebar } from '@/components/tool-sidebar'
import { RouterProvider } from '@/router/router'
import { useRouter } from '@/router/context'
import { useTheme } from '@/hooks/use-theme'
import { pushRecentTool } from '@/hooks/use-recent-tools'
import { applySeo } from '@/lib/seo'
import { findTool, SITE_NAME, TOOLS } from '@/tools/registry'
import { Base64Tool } from '@/tools/base64-tool'
import { ChmodTool } from '@/tools/chmod-tool'
import { ColorTool } from '@/tools/color-tool'
import { CronTool } from '@/tools/cron-tool'
import { CsvTool } from '@/tools/csv-tool'
import { DiffTool } from '@/tools/diff-tool'
import { EncodingTool } from '@/tools/encoding-tool'
import { HashTool } from '@/tools/hash-tool'
import { HmacTool } from '@/tools/hmac-tool'
import { HttpTool } from '@/tools/http-tool'
import { ImageTool } from '@/tools/image-tool'
import { JsonTool } from '@/tools/json-tool'
import { JwtTool } from '@/tools/jwt-tool'
import { MathTool } from '@/tools/math-tool'
import { RegexTool } from '@/tools/regex-tool'
import { SqlTool } from '@/tools/sql-tool'
import { SubnetTool } from '@/tools/subnet-tool'
import { TextTool } from '@/tools/text-tool'
import { TimestampTool } from '@/tools/timestamp-tool'
import { UnitsTool } from '@/tools/units-tool'
import { UrlTool } from '@/tools/url-tool'
import { UuidTool } from '@/tools/uuid-tool'
import { XmlTool } from '@/tools/xml-tool'

const RENDERERS: Record<string, ComponentType> = {
  '': HomePage,
  base64: Base64Tool,
  hash: HashTool,
  url: UrlTool,
  json: JsonTool,
  timestamp: TimestampTool,
  uuid: UuidTool,
  jwt: JwtTool,
  encoding: EncodingTool,
  regex: RegexTool,
  diff: DiffTool,
  text: TextTool,
  image: ImageTool,
  color: ColorTool,
  csv: CsvTool,
  hmac: HmacTool,
  cron: CronTool,
  subnet: SubnetTool,
  chmod: ChmodTool,
  http: HttpTool,
  xml: XmlTool,
  sql: SqlTool,
  units: UnitsTool,
  math: MathTool,
}

/** 客户端路由切换后同步 <title> / description / canonical / og，并记录「最近使用」。 */
function SeoEffect() {
  const { path } = useRouter()
  const tool = findTool(path)

  useEffect(() => {
    applySeo(tool)
  }, [tool])

  useEffect(() => {
    if (tool?.slug) pushRecentTool(tool.slug)
  }, [tool])

  return null
}

function Routes() {
  const { path } = useRouter()
  const tool = findTool(path)

  if (!tool) {
    return (
      <ErrorBoundary key="not-found">
        <NotFoundPage />
      </ErrorBoundary>
    )
  }
  if (!tool.slug) {
    return (
      <ErrorBoundary key="home">
        <HomePage />
      </ErrorBoundary>
    )
  }

  const Renderer = RENDERERS[tool.slug] ?? HomePage

  return (
    // key 用路由：切换工具时重置边界状态，一个工具崩了不会连累下一个
    <ErrorBoundary key={tool.slug}>
      <ToolShell tool={tool}>
        <Renderer />
      </ToolShell>
    </ErrorBoundary>
  )
}

function Shell() {
  const { theme, toggle } = useTheme()

  return (
    <TooltipProvider>
      {/*
        全局拖放兜底：只有拖拽区自己处理 drop 是不够的 —— 文件在页面其它任何位置松手，
        浏览器默认会用这个文件替换当前页面（可预览的直接打开、其它类型直接下载），
        用户已经输入的内容与算好的结果会全部丢失。这里统一取消默认行为，
        真正的落点仍然由各工具自己的 onDrop 处理。
      */}
      <div
        className="relative flex min-h-svh flex-col overflow-x-clip"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => event.preventDefault()}
      >
        <div className="grid-backdrop pointer-events-none absolute inset-x-0 top-0 h-[380px] opacity-30" />

        <SiteHeader theme={theme} onToggleTheme={toggle} />

        {/* 宽屏：左侧分类侧边栏 + 右侧内容；窄屏侧边栏隐藏，改用顶栏弹出菜单 */}
        <div className="relative mx-auto flex w-full max-w-[1400px] flex-1 items-start gap-0 px-4 sm:px-6">
          <ToolSidebar />
          <main id="main" className="min-w-0 flex-1 py-5 pb-14 lg:pl-6">
            <a
              href="#main"
              className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:border focus:border-border focus:bg-background focus:px-3 focus:py-1.5 focus:text-sm"
            >
              跳到主内容
            </a>
            <Routes />
          </main>
        </div>

        <footer className="border-t border-border/60">
          <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-3 px-4 py-6 sm:px-6">
            <Separator />
            <nav aria-label="全部工具" className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
              {TOOLS.filter((tool) => tool.slug).map((tool) => (
                <a
                  key={tool.slug}
                  href={tool.path}
                  className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                >
                  {tool.name}
                </a>
              ))}
            </nav>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <p className="text-xs text-muted-foreground">
                {SITE_NAME} · 全部计算在浏览器本地完成，数据不上传 · 快捷键 Ctrl / ⌘ + K 搜索工具
              </p>
              <GitHubLink className="text-xs" />
            </div>
          </div>
        </footer>
      </div>
    </TooltipProvider>
  )
}

interface AppProps {
  /**
   * 预渲染时传入固定路径；浏览器运行时省略，由 RouterProvider 读取 location。
   */
  path?: string
}

function App({ path }: AppProps) {
  return (
    <RouterProvider path={path}>
      <SeoEffect />
      <Shell />
    </RouterProvider>
  )
}

export default App
