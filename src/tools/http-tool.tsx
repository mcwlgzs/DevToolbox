import { useMemo, useState } from 'react'
import { SearchIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CopyButton } from '@/components/copy-button'
import { Stat, StatGrid } from '@/components/stat'
import { CONTENT_TYPE_CHEATSHEET, HTTP_STATUSES, MIME_TYPES, STATUS_CATEGORIES } from '@/lib/http-status'
import { formatCount } from '@/lib/format'
import { cn } from '@/lib/utils'

const CATEGORY_STYLES: Record<string, string> = {
  '1xx': 'border-sky-500/40 bg-sky-500/10 text-sky-600 dark:text-sky-400',
  '2xx': 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  '3xx': 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400',
  '4xx': 'border-orange-500/40 bg-orange-500/10 text-orange-600 dark:text-orange-400',
  '5xx': 'border-destructive/40 bg-destructive/10 text-destructive',
}

function match(haystack: string[], query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  return needle.split(/\s+/).every((part) => haystack.join(' ').toLowerCase().includes(part))
}

export function HttpTool() {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<string>('all')
  const [mimeCategory, setMimeCategory] = useState<string>('all')

  const mimeCategories = useMemo(
    () => ['all', ...new Set(MIME_TYPES.map((entry) => entry.category))],
    [],
  )

  const statuses = useMemo(
    () =>
      HTTP_STATUSES.filter((entry) => {
        if (category !== 'all' && entry.category !== category) return false
        return match([String(entry.code), entry.name, entry.description, entry.note ?? ''], query)
      }),
    [query, category],
  )

  const mimes = useMemo(
    () =>
      MIME_TYPES.filter((entry) => {
        if (mimeCategory !== 'all' && entry.category !== mimeCategory) return false
        return match([entry.type, entry.description, entry.extension, entry.category], query)
      }),
    [query, mimeCategory],
  )

  return (
    <Tabs defaultValue="status" className="gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <TabsList className="w-full max-w-xs">
          <TabsTrigger value="status">HTTP 状态码</TabsTrigger>
          <TabsTrigger value="mime">MIME 类型</TabsTrigger>
        </TabsList>
        <div className="relative ml-auto min-w-[220px] flex-1">
          <SearchIcon className="absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索：404、Not Found、429、json、image…"
            aria-label="搜索状态码或 MIME 类型"
            spellCheck={false}
            className="h-9 pl-9 text-xs"
          />
        </div>
      </div>

      <TabsContent value="status" className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-1.5">
          <Button
            variant={category === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setCategory('all')}
          >
            全部 {HTTP_STATUSES.length}
          </Button>
          {STATUS_CATEGORIES.map((item) => (
            <Button
              key={item.id}
              variant={category === item.id ? 'default' : 'outline'}
              size="sm"
              title={item.meaning}
              onClick={() => setCategory(item.id)}
            >
              {item.name}
            </Button>
          ))}
        </div>

        <div className="overflow-x-auto rounded-xl border border-border/60">
          <table aria-label="HTTP 状态码" className="w-full min-w-[720px] text-left text-xs">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th className="w-[70px] px-3 py-2 font-medium">状态码</th>
                <th className="w-[190px] px-3 py-2 font-medium">名称</th>
                <th className="px-3 py-2 font-medium">含义</th>
                <th className="w-[70px] px-3 py-2 font-medium">复制</th>
              </tr>
            </thead>
            <tbody>
              {statuses.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">
                    没有匹配「{query}」的状态码
                  </td>
                </tr>
              ) : (
                statuses.map((entry) => (
                  <tr key={entry.code} className="border-t border-border/50 align-top">
                    <td className="px-3 py-2">
                      <span
                        className={cn(
                          'inline-block rounded-md border px-2 py-0.5 font-mono font-medium',
                          CATEGORY_STYLES[entry.category],
                        )}
                      >
                        {entry.code}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono">{entry.name}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {entry.description}
                      {entry.note ? (
                        <span className="mt-0.5 block text-[11px] text-amber-600 dark:text-amber-400">
                          提示：{entry.note}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">
                      <CopyButton value={`${entry.code} ${entry.name}`} label="" variant="ghost" size="icon-xs" />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </TabsContent>

      <TabsContent value="mime" className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-1.5">
          <Button
            variant={mimeCategory === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setMimeCategory('all')}
          >
            全部 {MIME_TYPES.length}
          </Button>
          {mimeCategories
            .filter((item) => item !== 'all')
            .map((item) => (
              <Button
                key={item}
                variant={mimeCategory === item ? 'default' : 'outline'}
                size="sm"
                onClick={() => setMimeCategory(item)}
              >
                {item}
              </Button>
            ))}
        </div>

        <div className="overflow-x-auto rounded-xl border border-border/60">
          <table aria-label="MIME 类型" className="w-full min-w-[680px] text-left text-xs">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th className="w-[280px] px-3 py-2 font-medium">MIME 类型</th>
                <th className="px-3 py-2 font-medium">说明</th>
                <th className="w-[90px] px-3 py-2 font-medium">扩展名</th>
                <th className="w-[70px] px-3 py-2 font-medium">复制</th>
              </tr>
            </thead>
            <tbody>
              {mimes.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">
                    没有匹配「{query}」的 MIME 类型
                  </td>
                </tr>
              ) : (
                mimes.map((entry) => (
                  <tr key={entry.type} className="border-t border-border/50">
                    <td className="px-3 py-2 font-mono break-all">{entry.type}</td>
                    <td className="px-3 py-2 text-muted-foreground">{entry.description}</td>
                    <td className="px-3 py-2 font-mono text-muted-foreground">{entry.extension || '—'}</td>
                    <td className="px-3 py-2">
                      <CopyButton value={entry.type} label="" variant="ghost" size="icon-xs" />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <section className="flex flex-col gap-3 rounded-xl border border-border/70 bg-card/40 p-5">
          <h2 className="text-sm font-semibold">Content-Type 速查</h2>
          <dl className="grid gap-2 sm:grid-cols-2">
            {CONTENT_TYPE_CHEATSHEET.map((item) => (
              <div
                key={item.scenario}
                className="flex items-center gap-3 rounded-lg border border-border/60 bg-background/50 px-3 py-2"
              >
                <dt className="w-[150px] shrink-0 text-[11px] text-muted-foreground">{item.scenario}</dt>
                <dd className="min-w-0 flex-1 font-mono text-[11px] break-all">{item.value}</dd>
                <CopyButton value={item.value} label="" variant="ghost" size="icon-xs" />
              </div>
            ))}
          </dl>
        </section>
      </TabsContent>

      <StatGrid>
        <Stat label="状态码总数" value={formatCount(HTTP_STATUSES.length)} />
        <Stat label="匹配到的状态码" value={formatCount(statuses.length)} />
        <Stat label="MIME 类型总数" value={formatCount(MIME_TYPES.length)} />
        <Stat label="匹配到的 MIME" value={formatCount(mimes.length)} />
        <Stat label="2xx 成功" value={String(HTTP_STATUSES.filter((entry) => entry.category === '2xx').length)} />
        <Stat label="4xx / 5xx" value={`${HTTP_STATUSES.filter((entry) => entry.category === '4xx').length} / ${HTTP_STATUSES.filter((entry) => entry.category === '5xx').length}`} />
      </StatGrid>

      <p className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <Badge variant="outline" className="text-[10px]">
          参考
        </Badge>
        状态码语义以 RFC 9110 为准；MIME 类型以 IANA 注册表为准。搜索支持中文与英文关键词。
      </p>
    </Tabs>
  )
}
