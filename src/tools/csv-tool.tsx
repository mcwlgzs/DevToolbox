import { useMemo, useState } from 'react'
import { ArrowLeftRightIcon, DownloadIcon, EraserIcon, SparklesIcon } from 'lucide-react'
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
  DELIMITER_CHOICES,
  csvToJson,
  detectDelimiter,
  jsonToCsv,
  parseCsv,
} from '@/lib/csv'
import { downloadText, formatCount } from '@/lib/format'

const SAMPLE_CSV = `id,name,email,role
1,张三,zhang@example.com,admin
2,"李四, 四",li@example.com,user
3,"王五 ""小王""",wang@example.com,user`

const SAMPLE_JSON = `[
  { "id": 1, "name": "张三", "role": "admin" },
  { "id": 2, "name": "李四", "role": "user" }
]`

type Direction = 'csv2json' | 'json2csv'

export function CsvTool() {
  const [direction, setDirection] = useState<Direction>('csv2json')
  const [csvInput, setCsvInput] = useState('')
  const [jsonInput, setJsonInput] = useState('')
  const [autoDelimiter, setAutoDelimiter] = useState(true)
  const [delimiter, setDelimiter] = useState(',')
  const [hasHeader, setHasHeader] = useState(true)
  const [trimValues, setTrimValues] = useState(false)

  // 注意：只有「CSV → JSON」方向才该拿 CSV 输入去推断分隔符。
  // 切到「JSON → CSV」时 csvInput 仍然留在状态里，如果继续参与推断，
  // 输出的 CSV 会莫名其妙地跟着上一段 CSV 的分隔符走（而且分隔符下拉还会被禁用）。
  const isCsvToJson = direction === 'csv2json'
  const effectiveDelimiter =
    autoDelimiter && isCsvToJson && csvInput ? detectDelimiter(csvInput) : delimiter

  // 直接把选项写在 memo 内部：options 对象每次渲染都会重建，放进依赖数组会让缓存失效
  const fromCsv = useMemo(
    () => csvToJson(csvInput, { delimiter: effectiveDelimiter, hasHeader, trimValues }),
    [csvInput, effectiveDelimiter, hasHeader, trimValues],
  )
  const fromJson = useMemo(() => jsonToCsv(jsonInput, effectiveDelimiter), [jsonInput, effectiveDelimiter])

  const output = isCsvToJson ? fromCsv.json : fromJson.csv
  const error = isCsvToJson ? fromCsv.error : fromJson.error
  const count = isCsvToJson ? fromCsv.count : fromJson.count
  const columns = isCsvToJson ? fromCsv.columns : fromJson.columns

  const parsedPreview = useMemo(() => {
    if (!isCsvToJson) return null
    const parsed = parseCsv(csvInput, { delimiter: effectiveDelimiter, hasHeader, trimValues })
    return parsed.rows.slice(0, 6)
  }, [csvInput, effectiveDelimiter, hasHeader, trimValues, isCsvToJson])

  const swap = () => {
    if (isCsvToJson) {
      setJsonInput(fromCsv.json)
      setCsvInput('')
      setDirection('json2csv')
    } else {
      setCsvInput(fromJson.csv)
      setJsonInput('')
      setDirection('csv2json')
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl border border-border/70 bg-card/40 px-5 py-4">
        <div className="flex flex-col gap-2">
          <Label className="text-xs text-muted-foreground">方向</Label>
          <Select value={direction} onValueChange={(value) => setDirection(value as Direction)}>
            <SelectTrigger className="w-[180px]" size="sm" aria-label="转换方向">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="csv2json">CSV → JSON</SelectItem>
              <SelectItem value="json2csv">JSON → CSV</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-2">
          <Label className="text-xs text-muted-foreground">分隔符</Label>
          <div className="flex items-center gap-2">
            <Select
              value={delimiter}
              onValueChange={setDelimiter}
              disabled={autoDelimiter && isCsvToJson && !!csvInput}
            >
              <SelectTrigger className="w-[150px]" size="sm" aria-label="分隔符">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DELIMITER_CHOICES.map((choice) => (
                  <SelectItem key={choice.value} value={choice.value}>
                    {choice.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-1.5">
              <Switch id="auto-delimiter" checked={autoDelimiter} onCheckedChange={setAutoDelimiter} />
              <Label htmlFor="auto-delimiter" className="text-xs text-muted-foreground">
                自动识别
              </Label>
            </div>
          </div>
        </div>

        {isCsvToJson ? (
          <>
            <div className="flex items-center gap-2 pb-1.5">
              <Switch id="has-header" checked={hasHeader} onCheckedChange={setHasHeader} />
              <Label htmlFor="has-header" className="text-xs text-muted-foreground">
                第一行是表头
              </Label>
            </div>
            <div className="flex items-center gap-2 pb-1.5">
              <Switch id="trim-values" checked={trimValues} onCheckedChange={setTrimValues} />
              <Label htmlFor="trim-values" className="text-xs text-muted-foreground">
                去除字段首尾空白
              </Label>
            </div>
          </>
        ) : null}

        <div className="ml-auto flex flex-wrap items-center gap-2 pb-0.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setCsvInput(SAMPLE_CSV)
              setJsonInput(SAMPLE_JSON)
            }}
          >
            <SparklesIcon />
            示例
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            disabled={!csvInput && !jsonInput}
            onClick={() => {
              setCsvInput('')
              setJsonInput('')
            }}
          >
            <EraserIcon />
            清空
          </Button>
        </div>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
        <IoPanel
          title={isCsvToJson ? 'CSV 输入' : 'JSON 输入'}
          description={
            isCsvToJson
              ? `支持引号包裹、字段内分隔符与换行${csvInput ? ` · 识别为「${effectiveDelimiter === '\t' ? 'Tab' : effectiveDelimiter}」` : ''}`
              : '支持对象数组、二维数组与单个对象'
          }
          action={
            <Badge variant="secondary" className="font-mono text-[11px]">
              {formatCount((isCsvToJson ? csvInput : jsonInput).length)} 字符
            </Badge>
          }
          value={isCsvToJson ? csvInput : jsonInput}
          onValueChange={isCsvToJson ? setCsvInput : setJsonInput}
          autoFocus
          spellCheck={false}
          placeholder={isCsvToJson ? 'id,name\n1,张三\n2,李四' : '[{ "id": 1, "name": "张三" }]'}
          textareaClassName="min-h-[220px]"
        />

        <div className="flex justify-center lg:h-full lg:flex-col lg:justify-center">
          <Button
            variant="secondary"
            size="icon"
            className="lg:size-11"
            onClick={swap}
            disabled={!output}
            aria-label="交换输入与输出"
          >
            <ArrowLeftRightIcon className="lg:rotate-90" />
          </Button>
        </div>

        <IoPanel
          title={isCsvToJson ? 'JSON 输出' : 'CSV 输出'}
          description={output ? `共 ${formatCount(count)} 行数据` : '转换结果会显示在这里'}
          value={output}
          readOnly
          placeholder="转换结果会显示在这里"
          error={error}
          textareaClassName="min-h-[220px]"
          footer={
            <>
              <CopyButton value={output} />
              <Button
                variant="outline"
                size="sm"
                disabled={!output}
                onClick={() => downloadText(output, isCsvToJson ? 'data.json' : 'data.csv')}
              >
                <DownloadIcon />
                下载
              </Button>
            </>
          }
        />
      </div>

      {isCsvToJson && parsedPreview && parsedPreview.length > 0 ? (
        <section className="flex flex-col gap-3 rounded-xl border border-border/70 bg-card/40 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold">解析预览</h2>
            <Badge variant="outline" className="text-[11px]">
              前 {parsedPreview.length} 行
            </Badge>
          </div>
          <div className="overflow-x-auto rounded-lg border border-border/60">
            <table aria-label="CSV 解析预览" className="w-full text-left text-xs">
              <tbody>
                {parsedPreview.map((row, rowIndex) => {
                  // 表头行要用 th，否则读屏软件听到的只是一串没有列名的值
                  const isHeaderRow = rowIndex === 0 && hasHeader
                  return (
                    <tr
                      key={rowIndex}
                      className={isHeaderRow ? 'bg-muted/40 font-medium' : 'border-t border-border/50'}
                    >
                      {row.map((cell, cellIndex) =>
                        isHeaderRow ? (
                          <th
                            key={cellIndex}
                            scope="col"
                            className="max-w-[240px] truncate px-3 py-2 text-left font-mono"
                          >
                            {cell}
                          </th>
                        ) : (
                          <td key={cellIndex} className="max-w-[240px] truncate px-3 py-2 font-mono">
                            {cell}
                          </td>
                        ),
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <StatGrid>
        <Stat label="方向" value={isCsvToJson ? 'CSV → JSON' : 'JSON → CSV'} />
        <Stat label="数据行数" value={output ? formatCount(count) : '—'} />
        <Stat label="列数" value={columns.length ? String(columns.length) : '—'} hint={columns.slice(0, 3).join(', ')} />
        <Stat label="分隔符" value={effectiveDelimiter === '\t' ? 'Tab' : effectiveDelimiter} />
        <Stat label="输入字符" value={formatCount((isCsvToJson ? csvInput : jsonInput).length)} />
        <Stat label="输出字符" value={formatCount(output.length)} />
      </StatGrid>
    </div>
  )
}
