import { useCallback, useEffect, useMemo, useState } from 'react'
import { BracesIcon, EraserIcon, SparklesIcon, WandSparklesIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CopyButton } from '@/components/copy-button'
import { IoPanel } from '@/components/io-panel'
import { Stat, StatGrid } from '@/components/stat'
import { downloadText, formatBytes, formatCount, ratioLabel } from '@/lib/format'

type Action = 'pretty2' | 'pretty4' | 'minify' | 'sort' | 'escape' | 'unescape'

interface JsonError {
  message: string
  line: number
  column: number
  snippet: string
}

interface ParseOutcome {
  output: string
  error: JsonError | null
}

const SAMPLE = `{"name":"DevToolbox","version":"1.0.0","tags":["base64","hash","json"],"nested":{"enabled":true,"count":3},"list":[1,2,3]}`

/** 从 JSON.parse 的报错中提取位置，并生成带插入符号的代码片段。 */
function describeError(source: string, error: unknown): JsonError {
  const message = error instanceof Error ? error.message : String(error)
  const positionMatch = /position (\d+)/.exec(message)
  const lineColumnMatch = /line (\d+) column (\d+)/.exec(message)

  let position = positionMatch ? Number(positionMatch[1]) : 0
  let line = lineColumnMatch ? Number(lineColumnMatch[1]) : 1
  let column = lineColumnMatch ? Number(lineColumnMatch[2]) : 1

  if (!lineColumnMatch && positionMatch) {
    const before = source.slice(0, position)
    const lines = before.split('\n')
    line = lines.length
    column = (lines[lines.length - 1]?.length ?? 0) + 1
  }
  if (!positionMatch && !lineColumnMatch) {
    position = 0
  }

  const sourceLines = source.split('\n')
  const targetLine = sourceLines[line - 1] ?? ''
  const caret = `${' '.repeat(Math.max(column - 1, 0))}^`
  const snippet =
    targetLine.length > 0
      ? `${line} | ${targetLine.slice(0, 160)}\n${' '.repeat(String(line).length)} | ${caret}`
      : ''

  return { message: message.replace(/\s*in JSON at position \d+.*$/, ''), line, column, snippet }
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b),
    )
    return Object.fromEntries(entries.map(([key, child]) => [key, sortKeys(child)]))
  }
  return value
}

function run(source: string, action: Action): ParseOutcome {
  if (!source.trim()) return { output: '', error: null }

  try {
    if (action === 'escape') {
      return { output: JSON.stringify(source), error: null }
    }
    if (action === 'unescape') {
      const parsed = JSON.parse(source)
      if (typeof parsed !== 'string') {
        return {
          output: '',
          error: {
            message: '反转义需要输入一个 JSON 字符串字面量（以双引号开头结尾）',
            line: 1,
            column: 1,
            snippet: '',
          },
        }
      }
      return { output: parsed, error: null }
    }

    const parsed: unknown = JSON.parse(source)
    if (action === 'minify') return { output: JSON.stringify(parsed), error: null }
    if (action === 'sort') return { output: JSON.stringify(sortKeys(parsed), null, 2), error: null }
    const indent = action === 'pretty4' ? 4 : 2
    return { output: JSON.stringify(parsed, null, indent), error: null }
  } catch (error) {
    return { output: '', error: describeError(source, error) }
  }
}

function countNodes(value: unknown): number {
  if (Array.isArray(value)) return value.reduce<number>((sum, item) => sum + countNodes(item), 1)
  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).reduce<number>(
      (sum, item) => sum + countNodes(item),
      1,
    )
  }
  return 1
}

export function JsonTool() {
  const [source, setSource] = useState('')
  const [action, setAction] = useState<Action>('pretty2')
  const [live, setLive] = useState(true)
  const [result, setResult] = useState<ParseOutcome>({ output: '', error: null })

  const convert = useCallback(() => {
    setResult(run(source, action))
  }, [source, action])

  useEffect(() => {
    if (!live) return
    const timer = window.setTimeout(convert, 120)
    return () => window.clearTimeout(timer)
  }, [live, convert])

  // 这几项只和 source / result 有关，必须缓存：否则粘贴几 MB 的 JSON 之后，
  // 每敲一个字符都会重新 JSON.parse 整份文档并做两次全文 UTF-8 编码，输入明显掉帧。
  const nodeCount = useMemo(() => {
    if (!source.trim()) return 0
    try {
      return countNodes(JSON.parse(source))
    } catch {
      return 0
    }
  }, [source])

  const inputBytes = useMemo(() => new TextEncoder().encode(source).length, [source])
  const outputBytes = useMemo(
    () => new TextEncoder().encode(result.output).length,
    [result.output],
  )
  const warning = result.error?.snippet
    ? [`出错位置（第 ${result.error.line} 行，第 ${result.error.column} 列）：\n${result.error.snippet}`]
    : undefined

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-4 rounded-xl border border-border/70 bg-card/40 px-5 py-4">
        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              ['pretty2', '格式化 2 空格'],
              ['pretty4', '格式化 4 空格'],
              ['minify', '压缩一行'],
              ['sort', '排序键名'],
              ['escape', '转义为字符串'],
              ['unescape', '反转义'],
            ] as Array<[Action, string]>
          ).map(([value, label]) => (
            <Button
              key={value}
              variant={action === value ? 'default' : 'outline'}
              size="sm"
              onClick={() => setAction(value)}
            >
              {label}
            </Button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2 pb-1.5">
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={() => setLive((current) => !current)}
          >
            {live ? '实时：开' : '实时：关'}
          </Button>
          {!live ? (
            <Button size="sm" onClick={convert}>
              <WandSparklesIcon />
              执行
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <IoPanel
          title="JSON 输入"
          description="粘贴需要格式化、压缩或校验的 JSON"
          action={
            <Badge variant="secondary" className="font-mono text-[11px]">
              {formatCount(source.length)} 字符
            </Badge>
          }
          value={source}
          onValueChange={setSource}
          autoFocus
          spellCheck={false}
          placeholder={'{\n  "hello": "world"\n}'}
          toolbar={
            <>
              <Button variant="outline" size="sm" onClick={() => setSource(SAMPLE)}>
                <SparklesIcon />
                示例
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSource(JSON.stringify(SAMPLE))}
              >
                <SparklesIcon />
                转义示例
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                onClick={() => {
                  setSource('')
                  setResult({ output: '', error: null })
                }}
              >
                <EraserIcon />
                清空
              </Button>
            </>
          }
        />

        <IoPanel
          title="处理结果"
          description={result.output ? `共 ${formatCount(result.output.length)} 个字符` : '结果会实时显示在这里'}
          action={
            <Badge variant="outline" className="gap-1 font-mono text-[11px]">
              <BracesIcon className="size-3" />
              {action === 'escape' || action === 'unescape' ? 'STRING' : 'JSON'}
            </Badge>
          }
          value={result.output}
          readOnly
          placeholder="转换结果会显示在这里"
          error={result.error ? `${result.error.message}（第 ${result.error.line} 行，第 ${result.error.column} 列）` : null}
          warnings={warning}
          footer={
            <>
              <CopyButton value={result.output} />
              <Button
                variant="outline"
                size="sm"
                disabled={!result.output}
                onClick={() => downloadText(result.output, 'formatted.json')}
              >
                下载
              </Button>
            </>
          }
        />
      </div>

      {source.trim() ? (
        <StatGrid>
          <Stat label="状态" value={result.error ? '语法错误' : '合法 JSON'} />
          <Stat label="输入字节" value={formatBytes(inputBytes)} />
          <Stat label="输出字节" value={formatBytes(outputBytes)} hint={`比例 ${ratioLabel(inputBytes, outputBytes)}`} />
          <Stat label="节点数" value={nodeCount ? formatCount(nodeCount) : '—'} hint="含数组与对象" />
          <Stat label="行数" value={result.output ? formatCount(result.output.split('\n').length) : '—'} />
          <Stat label="操作" value={action} />
        </StatGrid>
      ) : null}
    </div>
  )
}
