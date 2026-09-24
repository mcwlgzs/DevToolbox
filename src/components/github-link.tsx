import { SITE_REPO_URL } from '@/tools/registry'
import { cn } from '@/lib/utils'

/**
 * GitHub 标志（内联 SVG）。
 *
 * 不用 lucide 的图标：品牌图标已经从 lucide 里移除了。
 * 内联一个 path 既不引入依赖，也和站点「运行时零业务依赖」的定位一致。
 */
function GitHubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className={className} aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  )
}

/**
 * 页脚的源码仓库链接。
 *
 * 用新标签页打开：工具页里往往有用户还没复制走的输入或结果，
 * 同标签跳走会把这些状态一起丢掉。
 */
export function GitHubLink({ className }: { className?: string }) {
  return (
    <a
      href={SITE_REPO_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'inline-flex items-center gap-1.5 text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline',
        className,
      )}
    >
      <GitHubMark className="size-3.5 shrink-0" />
      GitHub 仓库
    </a>
  )
}
