import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeftRightIcon, EraserIcon, PlayIcon, SparklesIcon } from 'lucide-react'
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
import { downloadText, formatCount } from '@/lib/format'

type Mode = 'component' | 'full'
type Direction = 'encode' | 'decode'

const SAMPLE = 'https://example.com/搜索?q=中文 关键词&tag=开发 工具#锚点'

interface QueryParam {
  key: string
  value: string
}

function runConversion(source: string, mode: Mode, direction: Direction, componentSafe: boolean) {
  if (!source) return { output: '', error: null as string | null }

  try {
    if (direction === 'encode') {
      if (mode === 'full') return { output: encodeURI(source), error: null }
      return { output: encodeURIComponent(source), error: null }
    }

    if (mode === 'full') {
      // decodeURI 不处理 %23 等保留字符的转义，需要时再走一次组件解码
      const once = decodeURI(source)
      return { output: componentSafe ? decodeURIComponent(once) : once, error: null }
    }
    return { output: decodeURIComponent(source), error: null }
  } catch {
    return {
      output: '',
      error:
        direction === 'decode'
          ? '解码失败：字符串中存在孤立的 “%” 或后面不是两位十六进制数字'
          : '编码失败：输入包含无法编码的字符（如未配对的代理项）',
    }
  }
}

function parseQuery(source: string): { params: QueryParam[]; error: string | null; base: string } {
  const raw = source.trim()
  if (!raw) return { params: [], error: null, base: '' }

  try {
    const url = new URL(raw.includes('://') ? raw : `https://placeholder.local/${raw.replace(/^\//, '')}`)
    const params: QueryParam[] = []
    for (const [key, value] of url.searchParams.entries()) {
      params.push({ key, value })
    }
    const base = raw.includes('://') ? `${url.origin}${url.pathname}` : url.search
    return { params, error: null, base }
  } catch {
    return { params: [], error: '无法解析为 URL，请检查格式', base: '' }
  }
}

export function UrlTool() {
  const [mode, setMode] = useState<Mode>('component')
  const [direction, setDirection] = useState<Direction>('encode')
  const [source, setSource] = useState('')
  const [live, setLive] = useState(true)
  const [deepDecode, setDeepDecode] = useState(false)
  const [result, setResult] = useState({ output: '', error: null as string | null })

  const convert = useCallback(() => {
    setResult(runConversion(source, mode, direction, deepDecode))
  }, [source, mode, direction, deepDecode])

  useEffect(() => {
    if (!live) return
    const timer = window.setTimeout(convert, 90)
    return () => window.clearTimeout(timer)
  }, [live, convert])

  const query = useMemo(() => parseQuery(source), [source])

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-4 rounded-xl border border-border/70 bg-card/40 px-5 py-4">
        <div className="flex flex-col gap-2">
          <Label className="text-xs text-muted-foreground">模式</Label>
          <Select value={mode} onValueChange={(value) => setMode(value as Mode)}>
            <SelectTrigger aria-label="模式" className="w-[190px]" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="component">组件编码 (encodeURIComponent)</SelectItem>
              <SelectItem value="full">整条 URL (encodeURI)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-2">
          <Label className="text-xs text-muted-foreground">方向</Label>
          <Select value={direction} onValueChange={(value) => setDirection(value as Direction)}>
            <SelectTrigger aria-label="方向" className="w-[130px]" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="encode">编码</SelectItem>
              <SelectItem value="decode">解码</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2 pb-1.5">
          <Switch id="url-live" checked={live} onCheckedChange={setLive} />
          <Label htmlFor="url-live" className="text-xs text-muted-foreground">
            实时转换
          </Label>
        </div>

        {mode === 'full' && direction === 'decode' ? (
          <div className="flex items-center gap-2 pb-1.5">
            <Switch id="url-deep" checked={deepDecode} onCheckedChange={setDeepDecode} />
            <Label htmlFor="url-deep" className="text-xs text-muted-foreground">
              二次解码（还原参数中的转义）
            </Label>
          </div>
        ) : null}
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
        <IoPanel
          title={direction === 'encode' ? '原始内容' : '已编码内容'}
          description={direction === 'encode' ? '输入需要百分号编码的文本或 URL' : '粘贴需要解码的内容'}
          action={
            <Badge variant="secondary" className="text-[11px]">
              {mode === 'full' ? 'encodeURI' : 'encodeURIComponent'}
            </Badge>
          }
          value={source}
          onValueChange={setSource}
          autoFocus
          spellCheck={false}
          placeholder={direction === 'encode' ? SAMPLE : 'https%3A%2F%2Fexample.com%2F%E6%90%9C%E7%B4%A2'}
          toolbar={
            <>
              <Button variant="outline" size="sm" onClick={() => setSource(SAMPLE)}>
                <SparklesIcon />
                示例
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

        <div className="flex justify-center lg:h-full lg:flex-col lg:justify-center">
          <Button
            variant="secondary"
            size="icon"
            className="lg:size-11"
            aria-label="切换编码与解码方向"
            onClick={() => {
              setSource(result.output)
              setResult({ output: '', error: null })
              setDirection((current) => (current === 'encode' ? 'decode' : 'encode'))
            }}
            disabled={!result.output}
          >
            <ArrowLeftRightIcon className="lg:rotate-90" />
          </Button>
        </div>

        <IoPanel
          title={direction === 'encode' ? '编码结果' : '解码结果'}
          description={result.output ? `${formatCount(result.output.length)} 个字符` : '实时显示转换结果'}
          value={result.output}
          readOnly
          placeholder="结果显示在这里"
          error={result.error}
          footer={
            <>
              <CopyButton value={result.output} />
              <Button
                variant="outline"
                size="sm"
                disabled={!result.output}
                onClick={() => downloadText(result.output, direction === 'encode' ? 'encoded.txt' : 'decoded.txt')}
              >
                下载
              </Button>
              {!live ? (
                <Button size="sm" className="ml-auto" onClick={convert}>
                  <PlayIcon />
                  转换
                </Button>
              ) : null}
            </>
          }
        />
      </div>

      {source.trim() ? (
        <section className="flex flex-col gap-3 rounded-xl border border-border/70 bg-card/40 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold">查询参数解析</h2>
            <Badge variant="outline" className="text-[11px]">
              {query.params.length} 个参数
            </Badge>
          </div>

          {query.error ? (
            <p className="text-xs text-destructive">{query.error}</p>
          ) : query.params.length === 0 ? (
            <p className="text-xs text-muted-foreground">输入中未检测到查询参数（?a=1&amp;b=2）</p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-border/60">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">参数名（已解码）</th>
                    <th className="px-3 py-2 font-medium">参数值（已解码）</th>
                    <th className="px-3 py-2 font-medium">原始值</th>
                  </tr>
                </thead>
                <tbody>
                  {query.params.map((param, index) => (
                    <tr key={`${param.key}-${index}`} className="border-t border-border/50">
                      <td className="px-3 py-2 font-mono break-all">{param.key}</td>
                      <td className="px-3 py-2 font-mono break-all">{param.value}</td>
                      <td className="px-3 py-2 font-mono break-all text-muted-foreground">
                        {encodeURIComponent(param.value)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}
    </div>
  )
}
