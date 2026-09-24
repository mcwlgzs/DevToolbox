import { useEffect, useMemo, useRef, useState } from 'react'
import { CornerDownLeftIcon, SearchIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ToolIcon } from '@/components/tool-icons'
import { useRouter } from '@/router/context'
import { pushRecentTool, useRecentTools } from '@/hooks/use-recent-tools'
import { CATEGORIES, TOOLS, type ToolMeta } from '@/tools/registry'
import { cn } from '@/lib/utils'

/** 工具是否匹配关键词：名称、简介、关键词、分类名都参与。 */
function matches(tool: ToolMeta, query: string): boolean {
  if (!query) return true
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  const category = CATEGORIES.find((item) => item.id === tool.category)?.name ?? ''
  const haystack = [tool.name, tool.summary, tool.description, category, ...tool.keywords]
    .join(' ')
    .toLowerCase()
  return needle.split(/\s+/).every((part) => haystack.includes(part))
}

export function ToolSearch() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const listRef = useRef<HTMLUListElement>(null)
  const { navigate } = useRouter()
  const recentSlugs = useRecentTools()

  // 最近使用不再占用侧边栏，改为在这里把常用工具排到前面（避免列表重复）
  const searchable = useMemo(() => {
    const tools = TOOLS.filter((tool) => tool.slug !== '')
    const order = new Map(recentSlugs.map((slug, index) => [slug, index]))
    return [...tools].sort((a, b) => {
      const rankA = order.get(a.slug) ?? Number.MAX_SAFE_INTEGER
      const rankB = order.get(b.slug) ?? Number.MAX_SAFE_INTEGER
      return rankA - rankB
    })
  }, [recentSlugs])

  const recentSet = useMemo(() => new Set(recentSlugs), [recentSlugs])
  const results = useMemo(() => searchable.filter((tool) => matches(tool, query)), [searchable, query])
  const showRecentBadge = query.trim() === ''

  // Ctrl / ⌘ + K 打开
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setOpen((current) => !current)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  useEffect(() => {
    if (!open) return
    const node = listRef.current?.querySelector<HTMLElement>('[data-active="true"]')
    node?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex, open, results])

  const go = (tool: ToolMeta) => {
    pushRecentTool(tool.slug)
    navigate(tool.path)
    setOpen(false)
    setQuery('')
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((index) => Math.min(index + 1, results.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((index) => Math.max(index - 1, 0))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const tool = results[activeIndex]
      if (tool) go(tool)
    }
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="h-9 w-9 justify-center gap-2 px-0 text-muted-foreground sm:w-[220px] sm:justify-start sm:px-3"
        onClick={() => setOpen(true)}
        aria-label="搜索工具（Ctrl+K）"
      >
        <SearchIcon className="size-4 shrink-0" />
        <span className="hidden sm:inline">搜索工具…</span>
        <kbd className="ml-auto hidden rounded border border-border/70 bg-muted px-1.5 py-0.5 font-mono text-[10px] sm:inline">
          ⌘K
        </kbd>
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) setQuery('')
        }}
      >
        <DialogContent className="top-[12%] max-w-xl translate-y-0 gap-0 overflow-hidden p-0">
          <DialogHeader className="sr-only">
            <DialogTitle>搜索工具</DialogTitle>
            <DialogDescription>输入关键词筛选工具箱里的工具</DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
            <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
                // 关键词一变就把高亮重置到第一项，避免指向已不存在的行
                setActiveIndex(0)
              }}
              onKeyDown={handleKeyDown}
              placeholder="搜索：base64、哈希、正则、图片压缩…"
              autoFocus
              spellCheck={false}
              aria-label="搜索工具"
              className="h-8 border-0 bg-transparent px-0 text-sm shadow-none focus-visible:ring-0 dark:bg-transparent"
            />
            <kbd className="hidden rounded border border-border/70 bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:block">
              Esc
            </kbd>
          </div>

          <ul ref={listRef} className="scrollbar-thin max-h-[52vh] overflow-y-auto p-2">
            {results.length === 0 ? (
              <li className="px-3 py-8 text-center text-xs text-muted-foreground">
                没有匹配「{query}」的工具
              </li>
            ) : (
              results.map((tool, index) => (
                <li key={tool.slug}>
                  <button
                    type="button"
                    data-active={index === activeIndex}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => go(tool)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors',
                      index === activeIndex ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50',
                    )}
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-background text-primary">
                      <ToolIcon slug={tool.slug} className="size-4" />
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span className="flex items-center gap-1.5 text-sm font-medium">
                        {tool.name}
                        {showRecentBadge && recentSet.has(tool.slug) ? (
                          <span className="rounded border border-border/70 px-1 py-px text-[10px] font-normal text-muted-foreground">
                            最近
                          </span>
                        ) : null}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">{tool.summary}</span>
                    </span>
                    {index === activeIndex ? (
                      <CornerDownLeftIcon className="ml-auto size-3.5 shrink-0 text-muted-foreground" />
                    ) : null}
                  </button>
                </li>
              ))
            )}
          </ul>

          <div className="flex items-center gap-4 border-t border-border/60 px-4 py-2 text-[11px] text-muted-foreground">
            <span>↑↓ 选择</span>
            <span>↵ 打开</span>
            <span className="ml-auto">共 {results.length} 个工具</span>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
