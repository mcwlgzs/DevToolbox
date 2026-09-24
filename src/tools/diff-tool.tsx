import { useMemo, useState } from 'react'
import { DownloadIcon, EraserIcon, SparklesIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CopyButton } from '@/components/copy-button'
import { IoPanel } from '@/components/io-panel'
import { Stat, StatGrid } from '@/components/stat'
import { diffLines, toSideBySide, toUnifiedDiff } from '@/lib/diff'
import { downloadText, formatCount } from '@/lib/format'
import { cn } from '@/lib/utils'

const SAMPLE_LEFT = `{
  "name": "devtoolbox",
  "version": "1.0.0",
  "port": 3000,
  "debug": false,
  "features": ["base64", "hash", "json"]
}`

const SAMPLE_RIGHT = `{
  "name": "devtoolbox",
  "version": "1.1.0",
  "port": 5173,
  "debug": true,
  "features": ["base64", "hash", "json", "regex", "diff"]
}`

export function DiffTool() {
  const [left, setLeft] = useState('')
  const [right, setRight] = useState('')
  const [view, setView] = useState<'side' | 'unified'>('side')
  const [ignoreWhitespace, setIgnoreWhitespace] = useState(false)

  const normalize = (text: string) => (ignoreWhitespace ? text.replace(/[ \t]+/g, ' ').replace(/[ \t]+$/gm, '') : text)

  const result = useMemo(
    () => diffLines(normalize(left), normalize(right)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [left, right, ignoreWhitespace],
  )

  const rows = useMemo(() => toSideBySide(result), [result])
  const unified = useMemo(() => toUnifiedDiff(result, '旧文本', '新文本'), [result])
  const hasInput = left !== '' || right !== ''
  const identical = hasInput && result.stats.added === 0 && result.stats.removed === 0

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl border border-border/70 bg-card/40 px-5 py-4">
        <div className="flex items-center gap-2">
          <Switch id="ignore-ws" checked={ignoreWhitespace} onCheckedChange={setIgnoreWhitespace} />
          <Label htmlFor="ignore-ws" className="text-xs text-muted-foreground">
            忽略行首行尾空白差异
          </Label>
        </div>

        {hasInput ? (
          identical ? (
            <Badge
              variant="outline"
              className="border-emerald-500/40 bg-emerald-500/10 text-[11px] text-emerald-600 dark:text-emerald-400"
            >
              两份内容完全一致
            </Badge>
          ) : (
            <Badge variant="outline" className="gap-2 font-mono text-[11px]">
              <span className="text-emerald-600 dark:text-emerald-400">+{formatCount(result.stats.added)}</span>
              <span className="text-destructive">-{formatCount(result.stats.removed)}</span>
            </Badge>
          )
        ) : null}

        {result.coarse ? (
          <Badge
            variant="outline"
            className="border-amber-500/40 bg-amber-500/10 text-[11px] text-amber-600 dark:text-amber-400"
          >
            输入过大，已使用整块替换的近似对比
          </Badge>
        ) : null}

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setLeft(SAMPLE_LEFT)
              setRight(SAMPLE_RIGHT)
            }}
          >
            <SparklesIcon />
            示例
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            disabled={!hasInput}
            onClick={() => {
              setLeft('')
              setRight('')
            }}
          >
            <EraserIcon />
            清空
          </Button>
        </div>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <IoPanel
          title="原始文本（A）"
          description="旧版本 / 修改前的内容"
          action={
            <Badge variant="secondary" className="font-mono text-[11px]">
              {formatCount(left === '' ? 0 : left.split('\n').length)} 行
            </Badge>
          }
          value={left}
          onValueChange={setLeft}
          autoFocus
          spellCheck={false}
          placeholder="粘贴修改前的内容…"
          textareaClassName="min-h-[200px]"
        />
        <IoPanel
          title="对照文本（B）"
          description="新版本 / 修改后的内容"
          action={
            <Badge variant="secondary" className="font-mono text-[11px]">
              {formatCount(right === '' ? 0 : right.split('\n').length)} 行
            </Badge>
          }
          value={right}
          onValueChange={setRight}
          spellCheck={false}
          placeholder="粘贴修改后的内容…"
          textareaClassName="min-h-[200px]"
        />
      </div>

      <Tabs value={view} onValueChange={(value) => setView(value as 'side' | 'unified')} className="gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <TabsList className="w-full max-w-xs">
            <TabsTrigger value="side">并排视图</TabsTrigger>
            <TabsTrigger value="unified">统一视图</TabsTrigger>
          </TabsList>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <CopyButton value={view === 'unified' ? unified : ''} label="复制 unified diff" />
            <Button
              variant="outline"
              size="sm"
              disabled={!hasInput}
              onClick={() => downloadText(unified, 'diff.patch')}
            >
              <DownloadIcon />
              导出 .patch
            </Button>
          </div>
        </div>

        <TabsContent value="side">
          <div className="scrollbar-thin max-h-[560px] overflow-auto rounded-xl border border-border/60">
            {!hasInput ? (
              <p className="px-4 py-6 text-center text-xs text-muted-foreground">
                在左右两侧粘贴文本后，这里会显示逐行对比
              </p>
            ) : (
              <table aria-label="文本差异并排对比" className="w-full min-w-[720px] border-collapse text-left font-mono text-[12px]">
                <tbody>
                  {rows.map((row, index) => (
                    <tr key={index} className="align-top">
                      <td
                        className={cn(
                          'w-[46px] border-r border-border/40 px-2 py-0.5 text-right text-[10px] text-muted-foreground select-none',
                          row.kind === 'delete' || row.kind === 'change' ? 'bg-destructive/10' : '',
                        )}
                      >
                        {row.left?.leftNumber ?? ''}
                      </td>
                      <td
                        className={cn(
                          'px-3 py-0.5 whitespace-pre-wrap break-all',
                          row.kind === 'delete' || row.kind === 'change'
                            ? 'bg-destructive/10 text-destructive'
                            : 'text-muted-foreground',
                        )}
                      >
                        {row.left?.text ?? ''}
                      </td>
                      <td
                        className={cn(
                          'w-[46px] border-r border-l border-border/40 px-2 py-0.5 text-right text-[10px] text-muted-foreground select-none',
                          row.kind === 'insert' || row.kind === 'change' ? 'bg-emerald-500/10' : '',
                        )}
                      >
                        {row.right?.rightNumber ?? ''}
                      </td>
                      <td
                        className={cn(
                          'px-3 py-0.5 whitespace-pre-wrap break-all',
                          row.kind === 'insert' || row.kind === 'change'
                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                            : 'text-muted-foreground',
                        )}
                      >
                        {row.right?.text ?? ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </TabsContent>

        <TabsContent value="unified">
          <pre className="scrollbar-thin m-0 max-h-[560px] min-h-[160px] overflow-auto rounded-xl border border-border/60 bg-background/60 p-4 font-mono text-[12px] leading-relaxed whitespace-pre-wrap break-all">
            {hasInput ? (
              unified.split('\n').map((line, index) => (
                <div
                  key={index}
                  className={cn(
                    line.startsWith('+') && !line.startsWith('+++')
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                      : line.startsWith('-') && !line.startsWith('---')
                        ? 'bg-destructive/10 text-destructive'
                        : line.startsWith('@@')
                          ? 'text-sky-600 dark:text-sky-400'
                          : 'text-muted-foreground',
                  )}
                >
                  {line || ' '}
                </div>
              ))
            ) : (
              <span className="text-muted-foreground">粘贴文本后这里会显示 unified diff</span>
            )}
          </pre>
        </TabsContent>
      </Tabs>

      {hasInput ? (
        <StatGrid>
          <Stat label="新增行" value={formatCount(result.stats.added)} />
          <Stat label="删除行" value={formatCount(result.stats.removed)} />
          <Stat label="相同行" value={formatCount(result.stats.unchanged)} />
          <Stat label="差异区块" value={String(rows.filter((row) => row.kind !== 'equal').length)} hint="并排视图行数" />
          <Stat label="相似度" value={similarity(result.stats)} />
          <Stat label="算法" value={result.coarse ? '粗粒度' : 'LCS 精确'} hint="超 400 万单元格自动降级" />
        </StatGrid>
      ) : null}
    </div>
  )
}

function similarity(stats: { added: number; removed: number; unchanged: number }): string {
  const total = stats.added + stats.removed + stats.unchanged
  if (total === 0) return '—'
  return `${((stats.unchanged / total) * 100).toFixed(1)}%`
}
