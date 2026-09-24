import { useMemo, useState } from 'react'
import { EraserIcon, SparklesIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CopyButton } from '@/components/copy-button'
import { Stat, StatGrid } from '@/components/stat'
import { CRON_PRESETS, nextRuns, parseCron } from '@/lib/cron'
import { useNow } from '@/hooks/use-now'
import { cn } from '@/lib/utils'

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

function formatRun(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())} ${WEEKDAYS[date.getDay()]}`
}

function formatRelative(date: Date, now: number): string {
  const diff = date.getTime() - now
  if (diff < 60_000) return `${Math.max(1, Math.round(diff / 1000))} 秒后`
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)} 分钟后`
  if (diff < 86_400_000) return `${(diff / 3_600_000).toFixed(1)} 小时后`
  return `${Math.round(diff / 86_400_000)} 天后`
}

export function CronTool() {
  const [expression, setExpression] = useState('0 9 * * 1-5')
  const now = useNow()
  // 按分钟取整，避免每秒重算
  const minuteTick = now === 0 ? 0 : Math.floor(now / 60_000)

  const parsed = useMemo(() => parseCron(expression), [expression])

  const runs = useMemo(() => {
    if (!parsed.ok || minuteTick === 0) return []
    return nextRuns(expression, 8, new Date(minuteTick * 60_000)).runs
  }, [expression, parsed.ok, minuteTick])

  const fieldRows = useMemo(() => {
    if (!parsed.ok) return []
    const keys = parsed.hasSeconds
      ? (['second', 'minute', 'hour', 'dayOfMonth', 'month', 'dayOfWeek'] as const)
      : (['minute', 'hour', 'dayOfMonth', 'month', 'dayOfWeek'] as const)
    return keys.map((key) => {
      const field = parsed.fields[key]
      const values = [...field.values].sort((a, b) => a - b)
      const preview = values.length > 20 ? `${values.slice(0, 20).join(', ')} …` : values.join(', ')
      return { label: field.label, raw: field.raw, count: values.length, preview, wildcard: field.wildcard }
    })
  }, [parsed])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-xl border border-border/70 bg-card/40 px-5 py-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex min-w-[260px] flex-1 flex-col gap-2">
            <Label htmlFor="cron-input" className="text-xs text-muted-foreground">
              Cron 表达式（5 段「分 时 日 月 周」或 6 段「秒 + 上述」，支持 @daily 等宏）
            </Label>
            <Input
              id="cron-input"
              value={expression}
              onChange={(event) => setExpression(event.target.value)}
              spellCheck={false}
              placeholder="*/5 9-18 * * 1-5"
              className={cn('h-10 font-mono text-base', !parsed.ok && expression.trim() && 'border-destructive/60')}
            />
          </div>
          <Button variant="outline" size="sm" className="mb-0.5" onClick={() => setExpression('*/15 9-18 * * 1-5')}>
            <SparklesIcon />
            示例
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="mb-0.5 text-muted-foreground"
            disabled={!expression}
            onClick={() => setExpression('')}
          >
            <EraserIcon />
            清空
          </Button>
        </div>

        {parsed.ok ? (
          <p className="rounded-md border border-border/60 bg-background/60 px-3 py-2 text-sm">
            <span className="mr-2 text-xs text-muted-foreground">含义</span>
            {parsed.description}
          </p>
        ) : (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {parsed.error}
          </p>
        )}

        <div className="flex flex-wrap gap-1.5 border-t border-border/60 pt-3">
          {CRON_PRESETS.map((preset) => (
            <Button
              key={preset.expression}
              variant={expression === preset.expression ? 'default' : 'outline'}
              size="sm"
              title={preset.note || preset.expression}
              onClick={() => setExpression(preset.expression)}
            >
              {preset.name}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <section className="flex flex-col gap-3 rounded-xl border border-border/70 bg-card/40 p-5">
          <h2 className="text-sm font-semibold">字段解析</h2>
          <div className="overflow-hidden rounded-lg border border-border/60">
            <table aria-label="Cron 字段解析" className="w-full text-left text-xs">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="w-[60px] px-3 py-2 font-medium">字段</th>
                  <th className="w-[90px] px-3 py-2 font-medium">写法</th>
                  <th className="w-[70px] px-3 py-2 font-medium">取值数</th>
                  <th className="px-3 py-2 font-medium">展开</th>
                </tr>
              </thead>
              <tbody>
                {fieldRows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">
                      表达式合法后这里会显示每个字段的展开结果
                    </td>
                  </tr>
                ) : (
                  fieldRows.map((row) => (
                    <tr key={row.label} className="border-t border-border/50">
                      <td className="px-3 py-2">{row.label}</td>
                      <td className="px-3 py-2 font-mono">{row.raw}</td>
                      <td className="px-3 py-2 font-mono text-muted-foreground">
                        {row.wildcard ? '全部' : row.count}
                      </td>
                      <td className="px-3 py-2 font-mono break-all text-muted-foreground">{row.preview}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="flex flex-col gap-3 rounded-xl border border-border/70 bg-card/40 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold">接下来 8 次运行时间</h2>
            <Badge variant="outline" className="text-[11px]">
              本地时区
            </Badge>
            {runs.length > 0 ? (
              <CopyButton
                value={runs.map((date) => formatRun(date)).join('\n')}
                label=""
                aria-label="复制接下来 8 次运行时间"
                variant="ghost"
                size="icon-xs"
                className="ml-auto"
              />
            ) : null}
          </div>
          {runs.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {parsed.ok ? '正在计算…' : '表达式合法后这里会列出后续运行时间'}
            </p>
          ) : (
            <ol className="flex flex-col divide-y divide-border/50 overflow-hidden rounded-lg border border-border/60">
              {runs.map((date, index) => (
                <li key={date.getTime()} className="flex items-center gap-3 px-3 py-2">
                  <span className="w-5 shrink-0 font-mono text-[11px] text-muted-foreground">{index + 1}</span>
                  <span className="min-w-0 flex-1 truncate font-mono text-xs">{formatRun(date)}</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {minuteTick > 0 ? formatRelative(date, minuteTick * 60_000) : ''}
                  </span>
                </li>
              ))}
            </ol>
          )}
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            注意标准 cron 的语义：<span className="font-mono">日</span> 与 <span className="font-mono">周</span>{' '}
            同时被限定时是「或」的关系（例如 <span className="font-mono">0 0 1 * 1</span> 表示每月 1 号<span className="mx-1">或</span>每周一）。
            本工具按此语义计算。
          </p>
        </section>
      </div>

      {parsed.ok ? (
        <StatGrid>
          <Stat label="段数" value={parsed.hasSeconds ? '6 段（含秒）' : '5 段'} />
          <Stat label="规范化" value={parsed.normalized} />
          <Stat label="下次运行" value={runs[0] ? formatRun(runs[0]).slice(5, 16) : '—'} hint={runs[0] ? formatRelative(runs[0], minuteTick * 60_000) : undefined} />
          <Stat label="频率" value={frequency(expression)} />
          <Stat label="月" value={parsed.fields.month.wildcard ? '每月' : [...parsed.fields.month.values].join(',')} />
          <Stat label="周" value={parsed.fields.dayOfWeek.wildcard ? '每天' : [...parsed.fields.dayOfWeek.values].map((d) => WEEKDAYS[d]).join('、')} />
        </StatGrid>
      ) : null}
    </div>
  )
}

function frequency(expression: string): string {
  const parts = expression.trim().split(/\s+/)
  const minute = parts.length === 6 ? parts[1] : parts[0]
  const hour = parts.length === 6 ? parts[2] : parts[1]
  if (minute.startsWith('*/')) return `每 ${minute.slice(2)} 分钟`
  if (minute === '*' && hour === '*') return '每分钟'
  if (hour === '*') return '每小时'
  if (hour.includes(',')) return '每天多次'
  return '每天一次'
}
