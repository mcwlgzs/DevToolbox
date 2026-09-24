import { useMemo, useState } from 'react'
import { BookOpenIcon, EraserIcon, PlayIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { CopyButton } from '@/components/copy-button'
import { IoPanel } from '@/components/io-panel'
import { Stat, StatGrid } from '@/components/stat'
import {
  DEFAULT_FLAGS,
  FLAG_LABELS,
  REGEX_PRESETS,
  highlightSegments,
  replaceWithRegex,
  runRegex,
  type RegexFlags,
  type RegexRunResult,
} from '@/lib/regex'
import { formatCount } from '@/lib/format'
import { cn } from '@/lib/utils'

const EMPTY_RESULT: RegexRunResult = {
  matches: [],
  error: null,
  truncated: false,
  durationMs: 0,
  flags: '',
}

/** 高亮预览的最大字符数，避免超大文本生成过多 DOM 节点。 */
const MAX_HIGHLIGHT_CHARS = 20_000

export function RegexTool() {
  const [pattern, setPattern] = useState('')
  const [flags, setFlags] = useState<RegexFlags>({ ...DEFAULT_FLAGS })
  const [text, setText] = useState('')
  const [replacement, setReplacement] = useState('')
  const [showPresets, setShowPresets] = useState(false)

  // 只有 pattern 非空才调用 runRegex：runRegex 内部会用 performance.now() 计时，
  // 空输入时提前返回可以避免在渲染期调用非纯函数。
  const result = useMemo(
    () => (pattern ? runRegex(pattern, flags, text) : EMPTY_RESULT),
    [pattern, flags, text],
  )

  const replaced = useMemo(
    () => (pattern ? replaceWithRegex(pattern, flags, text, replacement) : null),
    [pattern, flags, text, replacement],
  )

  const segments = useMemo(() => {
    if (!text || result.matches.length === 0) return null
    return highlightSegments(text.slice(0, MAX_HIGHLIGHT_CHARS), result.matches)
  }, [text, result.matches])

  const flagsString = FLAG_LABELS.filter((item) => flags[item.key])
    .map((item) => item.flag)
    .join('')

  return (
    <div className="flex flex-col gap-4">
      {/* 表达式与修饰符 */}
      <div className="flex flex-col gap-3 rounded-xl border border-border/70 bg-card/40 px-5 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-lg text-muted-foreground">/</span>
          <Input
            value={pattern}
            onChange={(event) => setPattern(event.target.value)}
            placeholder="输入正则表达式，例如 (?<year>\d{4})-(\d{2})"
            spellCheck={false}
            aria-label="正则表达式"
            className={cn(
              'h-10 min-w-[240px] flex-1 font-mono text-sm',
              result.error && 'border-destructive/60 focus-visible:ring-destructive/30',
            )}
          />
          <span className="font-mono text-lg text-muted-foreground">/{flagsString}</span>
          <Button variant="outline" size="sm" onClick={() => setShowPresets((current) => !current)}>
            <BookOpenIcon />
            常用模式
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={() => {
              setPattern('')
              setText('')
              setReplacement('')
            }}
          >
            <EraserIcon />
            清空
          </Button>
        </div>

        {result.error ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {result.error}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {FLAG_LABELS.map((item) => (
            <div key={item.key} className="flex items-center gap-2">
              <Switch
                id={`flag-${item.key}`}
                checked={flags[item.key]}
                onCheckedChange={(checked) =>
                  setFlags((current) => {
                    // g 与 y 互斥：sticky 只从 lastIndex 开始匹配，两者同时开启时
                    // 「匹配数」会只剩第一处，而替换统计仍按全局算，同一页出现两个矛盾的数字。
                    // 勾选其中一个就把另一个关掉，不要用 disabled 表达互斥（那样开关会一直显示为已勾选）。
                    if (item.key === 'global' && checked) return { ...current, global: true, sticky: false }
                    if (item.key === 'sticky' && checked) return { ...current, sticky: true, global: false }
                    return { ...current, [item.key]: checked }
                  })
                }
              />
              <Label htmlFor={`flag-${item.key}`} className="text-xs text-muted-foreground">
                <span className="mr-1 font-mono text-foreground">{item.flag}</span>
                {item.label}
              </Label>
            </div>
          ))}
        </div>

        {showPresets ? (
          <div className="flex flex-wrap gap-1.5 border-t border-border/60 pt-3">
            {REGEX_PRESETS.map((preset) => (
              <Button
                key={preset.name}
                variant="outline"
                size="sm"
                onClick={() => {
                  setPattern(preset.pattern)
                  setText(preset.sample)
                  setReplacement('')
                  setFlags({
                    ...DEFAULT_FLAGS,
                    global: preset.flags.includes('g'),
                    ignoreCase: preset.flags.includes('i'),
                    multiline: preset.flags.includes('m'),
                    dotAll: preset.flags.includes('s'),
                    unicode: preset.flags.includes('u'),
                    sticky: false,
                  })
                  setShowPresets(false)
                }}
              >
                {preset.name}
              </Button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <IoPanel
          title="测试文本"
          description="输入或粘贴要匹配的文本，右侧实时高亮"
          action={
            <Badge variant="secondary" className="font-mono text-[11px]">
              {formatCount(text.length)} 字符
            </Badge>
          }
          value={text}
          onValueChange={setText}
          autoFocus
          spellCheck={false}
          placeholder="把要测试的文本粘贴到这里…"
          textareaClassName="min-h-[200px]"
        />

        <section className="flex flex-col gap-3 rounded-xl border border-border/70 bg-card/40 p-5">
          <header className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold">高亮预览</h2>
            {result.matches.length > 0 ? (
              <Badge variant="secondary" className="text-[11px]">
                {formatCount(result.matches.length)} 处匹配
              </Badge>
            ) : null}
            {result.truncated ? (
              <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-[11px] text-amber-600 dark:text-amber-400">
                已达到 2000 条上限，结果被截断
              </Badge>
            ) : null}
          </header>

          <pre className="scrollbar-thin m-0 max-h-[280px] min-h-[200px] overflow-auto rounded-lg border border-border/60 bg-background/60 p-3 font-mono text-[13px] leading-relaxed whitespace-pre-wrap break-all">
            {text.length === 0 ? (
              <span className="text-muted-foreground">输入测试文本后，命中的内容会在这里高亮</span>
            ) : segments ? (
              segments.map((segment, index) =>
                segment.matchIndex === null ? (
                  <span key={index}>{segment.text}</span>
                ) : (
                  <mark
                    key={index}
                    className="rounded bg-primary/25 px-0.5 text-foreground"
                    title={`第 ${segment.matchIndex + 1} 处匹配`}
                  >
                    {segment.text}
                  </mark>
                ),
              )
            ) : (
              <span className="text-muted-foreground">没有匹配</span>
            )}
            {text.length > MAX_HIGHLIGHT_CHARS ? (
              <span className="text-muted-foreground">
                {`\n\n（预览仅显示前 ${formatCount(MAX_HIGHLIGHT_CHARS)} 个字符，匹配统计基于全文）`}
              </span>
            ) : null}
          </pre>
        </section>
      </div>

      {/* 匹配明细 */}
      {result.matches.length > 0 ? (
        <section className="flex flex-col gap-3 rounded-xl border border-border/70 bg-card/40 p-5">
          <h2 className="text-sm font-semibold">匹配明细</h2>
          <div className="scrollbar-thin max-h-[320px] overflow-auto rounded-lg border border-border/60">
            <table aria-label="正则匹配明细" className="w-full min-w-[640px] text-left text-xs">
              <thead className="sticky top-0 bg-muted/60 text-muted-foreground backdrop-blur">
                <tr>
                  <th className="w-[50px] px-3 py-2 font-medium">#</th>
                  <th className="w-[90px] px-3 py-2 font-medium">起始位置</th>
                  <th className="px-3 py-2 font-medium">匹配内容</th>
                  <th className="px-3 py-2 font-medium">捕获组</th>
                  <th className="w-[60px] px-3 py-2 font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {result.matches.slice(0, 500).map((match, index) => {
                  const named = Object.entries(match.named).filter(([, value]) => value !== undefined)
                  return (
                    <tr key={`${match.index}-${index}`} className="border-t border-border/50 align-top">
                      <td className="px-3 py-2 font-mono text-muted-foreground">{index + 1}</td>
                      <td className="px-3 py-2 font-mono text-muted-foreground">{match.index}</td>
                      <td className="px-3 py-2 font-mono break-all">{match.value || '（空匹配）'}</td>
                      <td className="px-3 py-2 font-mono break-all text-muted-foreground">
                        {match.captures.length === 0 && named.length === 0
                          ? '—'
                          : [
                              ...match.captures.map((capture, i) => `$${i + 1}=${capture.value ?? 'undefined'}`),
                              ...named.map(([name, value]) => `${name}=${value ?? 'undefined'}`),
                            ].join('  ')}
                      </td>
                      <td className="px-3 py-2">
                        <CopyButton value={match.value} label="" variant="ghost" size="icon-xs" />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {result.matches.length > 500 ? (
            <p className="text-[11px] text-muted-foreground">
              明细仅展示前 500 条，共 {formatCount(result.matches.length)} 条。
            </p>
          ) : null}
        </section>
      ) : null}

      {/* 替换 */}
      <section className="flex flex-col gap-3 rounded-xl border border-border/70 bg-card/40 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold">替换预览</h2>
          <span className="text-xs text-muted-foreground">
            支持 $1、$&lt;name&gt;、$&amp; 等替换语法
          </span>
          {replaced && replaced.error ? (
            <Badge variant="destructive" className="text-[11px]">
              {replaced.error}
            </Badge>
          ) : replaced && result.matches.length > 0 ? (
            <Badge variant="outline" className="ml-auto text-[11px]">
              替换 {formatCount(replaced.count)} 处
            </Badge>
          ) : null}
        </div>

        <Input
          value={replacement}
          onChange={(event) => setReplacement(event.target.value)}
          placeholder="替换为…（例如 [$&] 或 $<year>年）"
          spellCheck={false}
          aria-label="替换内容"
          className="h-9 font-mono text-xs"
        />

        <pre className="scrollbar-thin m-0 max-h-[220px] min-h-[90px] overflow-auto rounded-lg border border-border/60 bg-background/60 p-3 font-mono text-[13px] leading-relaxed whitespace-pre-wrap break-all">
          {replaced && replaced.output ? replaced.output : <span className="text-muted-foreground">替换结果会显示在这里</span>}
        </pre>

        <div className="flex flex-wrap items-center gap-2">
          <CopyButton value={replaced?.output ?? ''} label="复制替换结果" />
          <Button
            variant="outline"
            size="sm"
            disabled={!replaced?.output}
            onClick={() => {
              if (replaced?.output) setText(replaced.output)
            }}
          >
            <PlayIcon />
            用结果替换测试文本
          </Button>
        </div>
      </section>

      {pattern && text ? (
        <StatGrid>
          <Stat label="匹配数量" value={formatCount(result.matches.length)} hint={result.truncated ? '已截断' : undefined} />
          <Stat label="修饰符" value={flagsString || '无'} hint={flags.global ? '全局' : '仅首个'} />
          <Stat label="捕获组" value={String(result.matches[0]?.captures.length ?? 0)} hint="以第一处匹配为准" />
          <Stat label="命名组" value={String(Object.keys(result.matches[0]?.named ?? {}).length)} />
          <Stat label="耗时" value={result.durationMs > 0 ? `${result.durationMs.toFixed(2)} ms` : '—'} />
          <Stat label="表达式长度" value={String(pattern.length)} />
        </StatGrid>
      ) : null}
    </div>
  )
}
