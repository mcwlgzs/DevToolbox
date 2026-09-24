import { useMemo, useState } from 'react'
import { EraserIcon, HistoryIcon, RotateCcwIcon, SparklesIcon, WandSparklesIcon } from 'lucide-react'
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
import { CopyButton } from '@/components/copy-button'
import { IoPanel } from '@/components/io-panel'
import { Stat, StatGrid } from '@/components/stat'
import {
  CASE_MODES,
  SORT_MODES,
  addLineNumbers,
  collapseSpaces,
  dedupeLines,
  removeEmptyLines,
  reverseText,
  sortLines,
  stripLineNumbers,
  textStats,
  transformCase,
  trimLines,
  type CaseMode,
  type SortMode,
} from '@/lib/text-transform'
import { downloadText, formatCount } from '@/lib/format'

const SAMPLE = `  Hello World  
  hello world  
GET user by id
getUserByID
a10
a2
a1

  多余空格   的行`

const HISTORY_LIMIT = 30

export function TextTool() {
  const [value, setValue] = useState('')
  const [history, setHistory] = useState<string[]>([])
  const [caseMode, setCaseMode] = useState<CaseMode>('camel')
  const [sortMode, setSortMode] = useState<SortMode>('asc')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [trimBeforeDedupe, setTrimBeforeDedupe] = useState(true)
  const [keepEmpty, setKeepEmpty] = useState(false)

  const stats = useMemo(() => textStats(value), [value])

  /** 所有变换都走这里，统一记录历史以支持撤销。 */
  const apply = (transform: (input: string) => string) => {
    setValue((current) => {
      const next = transform(current)
      if (next === current) return current
      setHistory((stack) => [...stack.slice(-(HISTORY_LIMIT - 1)), current])
      return next
    })
  }

  const undo = () => {
    setHistory((stack) => {
      if (stack.length === 0) return stack
      setValue(stack[stack.length - 1])
      return stack.slice(0, -1)
    })
  }

  const reset = () => {
    if (value === '') return
    setHistory((stack) => [...stack.slice(-(HISTORY_LIMIT - 1)), value])
    setValue('')
  }

  return (
    <div className="flex flex-col gap-4">
      {/* 操作面板 */}
      <div className="flex flex-col gap-4 rounded-xl border border-border/70 bg-card/40 px-5 py-4">
        <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
          <div className="flex flex-col gap-2">
            <Label className="text-xs text-muted-foreground">大小写 / 命名风格</Label>
            <div className="flex items-center gap-2">
              <Select value={caseMode} onValueChange={(next) => setCaseMode(next as CaseMode)}>
                <SelectTrigger className="w-[190px]" size="sm" aria-label="大小写模式">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CASE_MODES.map((mode) => (
                    <SelectItem key={mode.value} value={mode.value}>
                      {mode.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                disabled={!value}
                onClick={() => apply((input) => transformCase(input, caseMode))}
              >
                应用
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label className="text-xs text-muted-foreground">排序</Label>
            <div className="flex items-center gap-2">
              <Select value={sortMode} onValueChange={(next) => setSortMode(next as SortMode)}>
                <SelectTrigger className="w-[200px]" size="sm" aria-label="排序方式">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SORT_MODES.map((mode) => (
                    <SelectItem key={mode.value} value={mode.value}>
                      {mode.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" disabled={!value} onClick={() => apply((input) => sortLines(input, sortMode))}>
                应用
              </Button>
            </div>
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-2 pb-0.5">
            <Button variant="outline" size="sm" disabled={history.length === 0} onClick={undo}>
              <RotateCcwIcon />
              撤销{history.length > 0 ? ` (${history.length})` : ''}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setValue(SAMPLE)}>
              <SparklesIcon />
              示例
            </Button>
            <Button variant="ghost" size="sm" className="text-muted-foreground" disabled={!value} onClick={reset}>
              <EraserIcon />
              清空
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
          <span className="text-xs text-muted-foreground">行操作</span>
          <Button variant="outline" size="sm" disabled={!value} onClick={() => apply(trimLines)}>
            去首尾空白
          </Button>
          <Button variant="outline" size="sm" disabled={!value} onClick={() => apply(removeEmptyLines)}>
            删除空行
          </Button>
          <Button variant="outline" size="sm" disabled={!value} onClick={() => apply(collapseSpaces)}>
            压缩空格
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!value}
            onClick={() =>
              apply((input) => dedupeLines(input, { caseSensitive, trimLines: trimBeforeDedupe, keepEmpty }))
            }
          >
            去重
          </Button>
          <Button variant="outline" size="sm" disabled={!value} onClick={() => apply((input) => addLineNumbers(input))}>
            加行号
          </Button>
          <Button variant="outline" size="sm" disabled={!value} onClick={() => apply(stripLineNumbers)}>
            去行号
          </Button>
          <Button variant="outline" size="sm" disabled={!value} onClick={() => apply((input) => sortLines(input, 'reverse'))}>
            反转行序
          </Button>
          <Button variant="outline" size="sm" disabled={!value} onClick={() => apply(reverseText)}>
            反转字符
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-border/60 pt-3">
          <span className="text-xs text-muted-foreground">去重选项</span>
          <div className="flex items-center gap-2">
            <Switch id="dedupe-case" checked={caseSensitive} onCheckedChange={setCaseSensitive} />
            <Label htmlFor="dedupe-case" className="text-xs text-muted-foreground">
              区分大小写
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="dedupe-trim" checked={trimBeforeDedupe} onCheckedChange={setTrimBeforeDedupe} />
            <Label htmlFor="dedupe-trim" className="text-xs text-muted-foreground">
              比较前去除首尾空白
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="dedupe-empty" checked={keepEmpty} onCheckedChange={setKeepEmpty} />
            <Label htmlFor="dedupe-empty" className="text-xs text-muted-foreground">
              保留空行
            </Label>
          </div>
        </div>
      </div>

      <IoPanel
        title="工作区"
        description="所有操作都作用于这段文本，可随时撤销"
        action={
          <Badge variant="secondary" className="font-mono text-[11px]">
            {formatCount(stats.lines)} 行 · {formatCount(stats.characters)} 字符
          </Badge>
        }
        value={value}
        onValueChange={(next) => {
          setValue(next)
          setHistory([])
        }}
        autoFocus
        spellCheck={false}
        placeholder="粘贴需要处理的文本，然后使用上方按钮批量变换…"
        textareaClassName="min-h-[280px]"
        footer={
          <>
            <CopyButton value={value} label="复制结果" />
            <Button
              variant="outline"
              size="sm"
              disabled={!value}
              onClick={() => downloadText(value, 'processed.txt')}
            >
              下载
            </Button>
            <span className="ml-auto flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <WandSparklesIcon className="size-3.5" />
              共 {CASE_MODES.length} 种大小写风格 · {SORT_MODES.length} 种排序方式
            </span>
          </>
        }
      />

      {value ? (
        <StatGrid>
          <Stat label="字符数" value={formatCount(stats.characters)} />
          <Stat label="不含空白" value={formatCount(stats.charactersNoSpace)} />
          <Stat label="词数" value={formatCount(stats.words)} hint="中文按字计" />
          <Stat label="行数" value={formatCount(stats.lines)} hint={`非空 ${formatCount(stats.nonEmptyLines)}`} />
          <Stat label="中文字数" value={formatCount(stats.cjk)} />
          <Stat label="UTF-8 字节" value={formatCount(stats.bytes)} hint={`约 ${stats.readingMinutes} 分钟读完`} />
        </StatGrid>
      ) : null}

      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <HistoryIcon className="size-3.5" />
        每次操作前都会保存快照，最多保留 {HISTORY_LIMIT} 步，点「撤销」即可回退。
        {history.length > 0 ? ` 当前可回退 ${history.length} 步。` : ''}
      </p>
    </div>
  )
}
