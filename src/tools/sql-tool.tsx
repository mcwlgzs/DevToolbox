import { useMemo, useState } from 'react'
import { DownloadIcon, EraserIcon, SparklesIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CopyButton } from '@/components/copy-button'
import { IoPanel } from '@/components/io-panel'
import { Stat, StatGrid } from '@/components/stat'
import {
  DEFAULT_SQL_OPTIONS,
  SQL_DIALECT_NOTES,
  SQL_SAMPLE,
  countStatements,
  formatSql,
  minifySql,
  type SqlKeywordCase,
} from '@/lib/sql'
import { downloadText, formatCount } from '@/lib/format'

/** 两种处理模式：格式化（美化）与压缩（去空白）。 */
type ViewMode = 'format' | 'minify'

const KEYWORD_CASE_CHOICES: ReadonlyArray<{ value: SqlKeywordCase; label: string }> = [
  { value: 'upper', label: '转成大写' },
  { value: 'lower', label: '转成小写' },
  { value: 'preserve', label: '保持原样' },
]

const INDENT_CHOICES: ReadonlyArray<{ value: number; label: string }> = [
  { value: 2, label: '2 空格' },
  { value: 4, label: '4 空格' },
]

const BLANK_LINE_CHOICES: ReadonlyArray<{ value: number; label: string }> = [
  { value: 0, label: '0 行' },
  { value: 1, label: '1 行' },
  { value: 2, label: '2 行' },
]

export function SqlTool() {
  const [view, setView] = useState<ViewMode>('format')
  const [input, setInput] = useState('')
  const [keywordCase, setKeywordCase] = useState<SqlKeywordCase>(DEFAULT_SQL_OPTIONS.keywordCase)
  const [indent, setIndent] = useState(DEFAULT_SQL_OPTIONS.indent)
  const [commaNewline, setCommaNewline] = useState(DEFAULT_SQL_OPTIONS.commaNewline)
  const [blankLines, setBlankLines] = useState(DEFAULT_SQL_OPTIONS.blankLines)

  // 选项对象每次渲染都会重建，直接写在 memo 内部，避免把对象塞进依赖数组导致缓存永远失效
  const formatted = useMemo(
    () => formatSql(input, { keywordCase, indent, commaNewline, blankLines }),
    [input, keywordCase, indent, commaNewline, blankLines],
  )
  const minified = useMemo(() => minifySql(input), [input])

  const isFormat = view === 'format'
  const output = isFormat ? formatted.sql : minified.sql
  const error = isFormat ? formatted.error : minified.error

  /** 只有真正有内容（非纯空白）时才展示统计与结果描述。 */
  const hasInput = input.trim().length > 0
  const statements = useMemo(() => (hasInput ? countStatements(input) : 0), [input, hasInput])
  const outputLines = output ? output.split('\n').length : 0

  const keywordCaseLabel =
    KEYWORD_CASE_CHOICES.find((choice) => choice.value === keywordCase)?.label ?? '保持原样'

  // 出错时结果为空字符串，此时算出来的「节省 100%」会误导，所以显示占位符
  const savedPercent =
    hasInput && !minified.error ? Math.round((1 - minified.sql.length / input.length) * 100) : null

  /** 两个页签共用的输入面板：状态提升到组件顶层，切页签不会丢内容。 */
  const inputPanel = (
    <IoPanel
      title="SQL 输入"
      description="支持字符串、注释与多词关键字；只调整空白与关键字大小写，不改写内容"
      action={
        <Badge variant="secondary" className="font-mono text-[11px]">
          {formatCount(input.length)} 字符
        </Badge>
      }
      value={input}
      onValueChange={setInput}
      autoFocus
      spellCheck={false}
      placeholder={"select id, name from users where status = 'active';"}
      textareaClassName="min-h-[260px]"
    />
  )

  return (
    <div className="flex flex-col gap-4">
      <Tabs value={view} onValueChange={(next) => setView(next as ViewMode)} className="gap-4">
        {/* 页签与选项条在同一行 */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl border border-border/70 bg-card/40 px-5 py-4">
          <TabsList>
            <TabsTrigger value="format">格式化</TabsTrigger>
            <TabsTrigger value="minify">压缩</TabsTrigger>
          </TabsList>

          <div className="flex flex-col gap-2">
            <Label className="text-xs text-muted-foreground">关键字大小写</Label>
            <Select
              value={keywordCase}
              onValueChange={(next) => setKeywordCase(next as SqlKeywordCase)}
            >
              <SelectTrigger className="w-[140px]" size="sm" aria-label="关键字大小写">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {KEYWORD_CASE_CHOICES.map((choice) => (
                  <SelectItem key={choice.value} value={choice.value}>
                    {choice.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label className="text-xs text-muted-foreground">缩进</Label>
            <Select value={String(indent)} onValueChange={(next) => setIndent(Number(next))}>
              <SelectTrigger className="w-[120px]" size="sm" aria-label="缩进">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INDENT_CHOICES.map((choice) => (
                  <SelectItem key={choice.value} value={String(choice.value)}>
                    {choice.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2 pb-1.5">
            <Switch id="sql-comma-newline" checked={commaNewline} onCheckedChange={setCommaNewline} />
            <Label htmlFor="sql-comma-newline" className="text-xs text-muted-foreground">
              逗号后换行
            </Label>
          </div>

          <div className="flex flex-col gap-2">
            <Label className="text-xs text-muted-foreground">语句之间空行</Label>
            <Select value={String(blankLines)} onValueChange={(next) => setBlankLines(Number(next))}>
              <SelectTrigger className="w-[110px]" size="sm" aria-label="语句之间空行">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BLANK_LINE_CHOICES.map((choice) => (
                  <SelectItem key={choice.value} value={String(choice.value)}>
                    {choice.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-2 pb-0.5">
            <Button variant="outline" size="sm" onClick={() => setInput(SQL_SAMPLE)}>
              <SparklesIcon />
              示例
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              disabled={!input}
              onClick={() => setInput('')}
            >
              <EraserIcon />
              清空
            </Button>
          </div>
        </div>

        <TabsContent value="format" className="flex flex-col gap-4">
          <div className="grid items-start gap-4 lg:grid-cols-2">
            {inputPanel}
            <IoPanel
              title="格式化结果"
              description={output ? `共 ${formatCount(outputLines)} 行` : '格式化结果会显示在这里'}
              value={output}
              readOnly
              placeholder="格式化结果会显示在这里"
              error={error}
              textareaClassName="min-h-[260px]"
              footer={
                <>
                  <CopyButton value={output} />
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!output}
                    onClick={() => downloadText(output, 'formatted.sql')}
                  >
                    <DownloadIcon />
                    下载
                  </Button>
                </>
              }
            />
          </div>

          {hasInput ? (
            <StatGrid>
              <Stat label="语句数" value={formatCount(statements)} />
              <Stat label="原文字符" value={formatCount(input.length)} />
              <Stat label="结果字符" value={formatCount(output.length)} />
              <Stat label="结果行数" value={output ? formatCount(outputLines) : '—'} />
              <Stat label="关键字大小写" value={keywordCaseLabel} />
              <Stat label="缩进" value={`${indent} 空格`} />
            </StatGrid>
          ) : null}
        </TabsContent>

        <TabsContent value="minify" className="flex flex-col gap-4">
          <div className="grid items-start gap-4 lg:grid-cols-2">
            {inputPanel}
            <IoPanel
              title="压缩结果"
              description={output ? `共 ${formatCount(outputLines)} 行` : '压缩结果会显示在这里'}
              value={output}
              readOnly
              placeholder="压缩结果会显示在这里"
              error={error}
              textareaClassName="min-h-[260px]"
              footer={
                <>
                  <CopyButton value={output} />
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!output}
                    onClick={() => downloadText(output, 'minified.sql')}
                  >
                    <DownloadIcon />
                    下载
                  </Button>
                </>
              }
            />
          </div>

          {hasInput ? (
            <StatGrid>
              <Stat label="语句数" value={formatCount(statements)} />
              <Stat label="原文字符" value={formatCount(input.length)} />
              <Stat label="压缩后字符" value={formatCount(minified.sql.length)} />
              <Stat
                label="节省百分比"
                value={savedPercent === null ? '—' : `${savedPercent}%`}
              />
            </StatGrid>
          ) : null}
        </TabsContent>
      </Tabs>

      {/* 方言说明 */}
      <section className="flex flex-col gap-3 rounded-xl border border-border/70 bg-card/40 p-5">
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-semibold">方言说明</h2>
          <p className="text-xs text-muted-foreground">
            格式化只调整空白与关键字大小写，
            <strong className="font-medium text-foreground">不改写字符串和注释的内容</strong>。
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {SQL_DIALECT_NOTES.map((note) => (
            <div
              key={note.label}
              className="flex flex-col gap-1 rounded-lg border border-border/60 bg-background/40 px-4 py-3"
            >
              <span className="text-xs font-medium text-foreground">{note.label}</span>
              <span className="text-xs leading-relaxed text-muted-foreground">{note.text}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
