import { useMemo, useState } from 'react'
import { ClockIcon, EraserIcon, SparklesIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CopyButton } from '@/components/copy-button'
import { IoPanel } from '@/components/io-panel'
import { Stat, StatGrid } from '@/components/stat'
import { useNow } from '@/hooks/use-now'
import { cn } from '@/lib/utils'

type Unit = 'seconds' | 'milliseconds' | 'date'

interface Parsed {
  ms: number | null
  unit: Unit | null
  error: string | null
}

function parseInput(raw: string): Parsed {
  const value = raw.trim()
  if (!value) return { ms: null, unit: null, error: null }

  if (/^-?\d+$/.test(value)) {
    const numeric = Number(value)
    const digits = value.replace('-', '').length
    const isMilliseconds = digits >= 12
    const ms = isMilliseconds ? numeric : numeric * 1000
    if (!Number.isFinite(ms)) return { ms: null, unit: null, error: '数值超出可表示范围' }
    return { ms, unit: isMilliseconds ? 'milliseconds' : 'seconds', error: null }
  }

  const parsed = Date.parse(value)
  if (Number.isNaN(parsed)) {
    return { ms: null, unit: null, error: '无法识别的输入：请输入 Unix 时间戳或日期字符串' }
  }
  return { ms: parsed, unit: 'date', error: null }
}

function pad(value: number, length = 2): string {
  return String(value).padStart(length, '0')
}

function localDateTime(ms: number): string {
  const date = new Date(ms)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

function toDatetimeLocalValue(ms: number): string {
  const date = new Date(ms)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

function relativeLabel(ms: number, now: number): string {
  const diff = ms - now
  const absolute = Math.abs(diff)
  const units: Array<[number, string]> = [
    [1000, '秒'],
    [60_000, '分钟'],
    [3_600_000, '小时'],
    [86_400_000, '天'],
    [2_592_000_000, '个月'],
    [31_536_000_000, '年'],
  ]
  if (absolute < 1000) return '就是现在'

  let chosen = units[0]
  for (const unit of units) {
    if (absolute >= unit[0]) chosen = unit
  }
  const amount = Math.floor(absolute / chosen[0])
  return diff < 0 ? `${amount} ${chosen[1]}前` : `${amount} ${chosen[1]}后`
}

const WEEKDAYS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']

export function TimestampTool() {
  const now = useNow()
  const [input, setInput] = useState('')

  const parsed = useMemo(() => parseInput(input), [input])
  const effectiveMs = parsed.ms ?? (now > 0 ? now : null)

  const rows = useMemo(() => {
    if (effectiveMs === null) return []
    const date = new Date(effectiveMs)
    return [
      { label: '秒级时间戳', value: String(Math.floor(effectiveMs / 1000)) },
      { label: '毫秒级时间戳', value: String(effectiveMs) },
      { label: 'ISO 8601 (UTC)', value: date.toISOString() },
      { label: 'UTC 字符串', value: date.toUTCString() },
      { label: '本地时间', value: localDateTime(effectiveMs) },
      { label: '日期', value: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` },
      { label: '星期', value: WEEKDAYS[date.getDay()] ?? '—' },
      { label: '相对现在', value: now > 0 ? relativeLabel(effectiveMs, now) : '—' },
      { label: 'RFC 2822', value: date.toString() },
      { label: '十六进制', value: `0x${Math.floor(effectiveMs / 1000).toString(16).toUpperCase()}` },
    ]
  }, [effectiveMs, now])

  const currentSeconds = now > 0 ? Math.floor(now / 1000) : 0
  const isFuture = effectiveMs !== null && now > 0 && effectiveMs > now

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl border border-border/70 bg-card/40 px-5 py-4">
        <div className="flex items-center gap-2">
          <ClockIcon className="size-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">当前 Unix 时间戳</span>
        </div>
        <span className="font-mono text-lg font-semibold tabular-nums">
          {now > 0 ? currentSeconds : '—'}
        </span>
        <Badge variant="outline" className="font-mono text-[11px]">
          {now > 0 ? now : '—'} ms
        </Badge>
        <div className="ml-auto flex items-center gap-2">
          <CopyButton value={now > 0 ? String(currentSeconds) : ''} label="复制秒级" />
          <CopyButton value={now > 0 ? String(now) : ''} label="复制毫秒" variant="secondary" />
        </div>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <IoPanel
          title="时间戳 / 日期输入"
          description="自动识别秒（10 位）、毫秒（13 位）或日期字符串"
          action={
            parsed.unit ? (
              <Badge variant="secondary" className="text-[11px]">
                {parsed.unit === 'seconds' ? '秒级' : parsed.unit === 'milliseconds' ? '毫秒级' : '日期字符串'}
              </Badge>
            ) : null
          }
          value={input}
          onValueChange={setInput}
          autoFocus
          spellCheck={false}
          placeholder="1735689600 或 2025-01-01T00:00:00Z"
          error={parsed.error}
          textareaClassName="min-h-[140px]"
          toolbar={
            <>
              <Button
                variant="outline"
                size="sm"
                disabled={now === 0}
                onClick={() => setInput(String(currentSeconds))}
              >
                <SparklesIcon />
                填入当前时间戳
              </Button>
              <Button variant="outline" size="sm" onClick={() => setInput('2025-01-01T00:00:00Z')}>
                <SparklesIcon />
                示例
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                onClick={() => setInput('')}
              >
                <EraserIcon />
                清空
              </Button>
            </>
          }
          footer={
            <>
              <Label htmlFor="datetime-local" className="text-xs text-muted-foreground">
                用日期选择器反查时间戳
              </Label>
              <Input
                id="datetime-local"
                type="datetime-local"
                step={1}
                className="h-9 w-[230px] text-xs"
                value={parsed.ms !== null ? toDatetimeLocalValue(parsed.ms) : ''}
                onChange={(event) => {
                  const value = event.target.value
                  if (!value) {
                    setInput('')
                    return
                  }
                  const ms = new Date(value).getTime()
                  if (!Number.isNaN(ms)) setInput(String(ms))
                }}
              />
            </>
          }
        />

        <section className="flex h-full flex-col gap-3 rounded-xl border border-border/70 bg-card/40 p-5">
          <header className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold">转换结果</h2>
            {effectiveMs !== null ? (
              <Badge
                variant="outline"
                className={cn(
                  'text-[11px]',
                  isFuture
                    ? 'border-sky-500/40 bg-sky-500/10 text-sky-600 dark:text-sky-400'
                    : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
                )}
              >
                {isFuture ? '未来时间' : '已过去'}
              </Badge>
            ) : null}
          </header>

          {rows.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              输入 Unix 时间戳或日期字符串后，这里会列出 UTC、本地时间、星期与相对时间。
            </p>
          ) : (
            <dl className="flex flex-col divide-y divide-border/50 overflow-hidden rounded-lg border border-border/60">
              {rows.map((row) => (
                <div key={row.label} className="flex items-center gap-3 px-3 py-2 odd:bg-muted/20">
                  <dt className="w-[110px] shrink-0 text-[11px] text-muted-foreground">{row.label}</dt>
                  <dd className="min-w-0 flex-1 font-mono text-xs break-all">{row.value}</dd>
                  <CopyButton value={row.value} label="" variant="ghost" size="icon-xs" />
                </div>
              ))}
            </dl>
          )}
        </section>
      </div>

      <StatGrid>
        <Stat label="输入单位" value={parsed.unit ?? (input.trim() ? '无法识别' : '—')} hint="秒 / 毫秒 / 日期" />
        <Stat label="秒级" value={effectiveMs !== null ? String(Math.floor(effectiveMs / 1000)) : '—'} />
        <Stat label="毫秒级" value={effectiveMs !== null ? String(effectiveMs) : '—'} />
        <Stat label="UTC 日期" value={effectiveMs !== null ? new Date(effectiveMs).toISOString().slice(0, 10) : '—'} />
        <Stat label="本地日期" value={effectiveMs !== null ? localDateTime(effectiveMs).slice(0, 10) : '—'} />
        <Stat
          label="相对现在"
          value={now > 0 && effectiveMs !== null ? relativeLabel(effectiveMs, now) : '—'}
        />
      </StatGrid>
    </div>
  )
}
