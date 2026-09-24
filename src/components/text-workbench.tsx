import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowLeftRightIcon,
  ArrowRightIcon,
  ClipboardPasteIcon,
  DownloadIcon,
  EraserIcon,
  PlayIcon,
  SparklesIcon,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { CopyButton } from '@/components/copy-button'
import { EncodeOptionsControls } from '@/components/encode-options'
import { IoPanel } from '@/components/io-panel'
import { Stat, StatGrid } from '@/components/stat'
import {
  analyzeInput,
  decodeBase64,
  decodeText,
  encodeText,
  textByteLength,
  type EncodeOptions,
  type TextEncoding,
} from '@/lib/base64'
import { downloadText, formatBytes, formatCount, ratioLabel } from '@/lib/format'
import { cn } from '@/lib/utils'

type Direction = 'encode' | 'decode'

interface Conversion {
  output: string
  error: string | null
  warnings: string[]
  inputBytes: number
  outputBytes: number
}

const EMPTY: Conversion = { output: '', error: null, warnings: [], inputBytes: 0, outputBytes: 0 }

const SAMPLE_TEXT = 'DevToolbox · Hello, 世界! 🚀'

function runConversion(
  source: string,
  direction: Direction,
  encoding: TextEncoding,
  options: EncodeOptions,
): Conversion {
  if (!source.trim()) return EMPTY

  if (direction === 'encode') {
    const output = encodeText(source, encoding, options)
    return {
      output,
      error: null,
      warnings: [],
      inputBytes: textByteLength(source, encoding),
      outputBytes: output.length,
    }
  }

  const decoded = decodeBase64(source)
  if (!decoded.ok) {
    return { output: '', error: decoded.error, warnings: [], inputBytes: source.length, outputBytes: 0 }
  }

  const text = decodeText(decoded.bytes, encoding, source)
  if (!text.ok) {
    return {
      output: '',
      error: text.error,
      warnings: decoded.warnings,
      inputBytes: source.length,
      outputBytes: decoded.bytes.length,
    }
  }

  return {
    output: text.text,
    error: null,
    warnings: [...decoded.warnings, ...text.warnings],
    inputBytes: source.length,
    outputBytes: decoded.bytes.length,
  }
}

/**
 * 方向模式。
 * - auto：根据输入内容自动判断（粘贴 Base64 就解码，粘贴普通文本就编码）
 * - encode / decode：用户手动锁定，不再自动切换
 */
type DirectionMode = 'auto' | 'encode' | 'decode'

/** 方向选项：label 是主标题，hint 用「A → B」直观说明转换关系。 */
const DIRECTION_OPTIONS: ReadonlyArray<{ value: DirectionMode; label: string; hint: string }> = [
  { value: 'auto', label: '自动判断', hint: '按内容自动选择方向' },
  { value: 'encode', label: '编码', hint: '文本 → Base64' },
  { value: 'decode', label: '解码', hint: 'Base64 → 文本' },
]

export function TextWorkbench() {
  const [direction, setDirection] = useState<DirectionMode>('auto')
  const [source, setSource] = useState('')
  const [result, setResult] = useState<Conversion>(EMPTY)
  const [encoding, setEncoding] = useState<TextEncoding>('utf-8')
  const [options, setOptions] = useState<EncodeOptions>({
    variant: 'standard',
    padding: true,
    wrap: 0,
  })
  const [live, setLive] = useState(true)

  // 输入判定只有这一个来源：自动方向与上方的徽章/提示必须一致。
  // 之前方向用 looksLikeBase64Text、徽章用 analyzeInput，两个谓词会打架——
  // 短二进制负载（如 16 字节 AES key）的 Base64 会被徽章标成「疑似 Base64」，
  // 方向却判成编码，于是把 Base64 又编码了一次。
  const analysis = useMemo(() => analyzeInput(source), [source])
  const detectedBase64 = analysis.kind === 'base64' || analysis.kind === 'data-url'
  const effectiveDirection: Direction = direction === 'auto' ? (detectedBase64 ? 'decode' : 'encode') : direction

  const convert = useCallback(() => {
    setResult(runConversion(source, effectiveDirection, encoding, options))
  }, [source, effectiveDirection, encoding, options])

  useEffect(() => {
    if (!live) return
    const delay = source.length > 20_000 ? 260 : 90
    const timer = window.setTimeout(convert, delay)
    return () => window.clearTimeout(timer)
  }, [live, convert, source.length])

  const isEncode = effectiveDirection === 'encode'

  const handleSwap = () => {
    setSource(result.output)
    setResult(EMPTY)
    // 交换后方向也要翻转，并锁定为手动，避免自动判断又切回来
    setDirection(isEncode ? 'decode' : 'encode')
  }

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (text) setSource(text)
    } catch {
      // 浏览器拒绝读取剪贴板时静默忽略，用户可手动粘贴
    }
  }

  const handleSample = () => {
    setDirection('encode')
    setSource(SAMPLE_TEXT)
  }

  const encodedSample = encodeText(SAMPLE_TEXT, 'utf-8', options)

  const directionHint =
    direction !== 'auto'
      ? '已锁定方向，不会再自动切换'
      : !source.trim()
        ? '粘贴 Base64 会自动解码，粘贴普通文本会自动编码'
        : detectedBase64
          ? '按内容判断：这是 Base64，正在解码'
          : '按内容判断：这是普通文本，正在编码'

  return (
    <div className="flex flex-col gap-4">
      {/* ---------- 方向选择：整页最显眼的一块 ---------- */}
      <section
        aria-label="选择转换方向"
        className="flex flex-col gap-3 rounded-xl border border-border/70 bg-card/40 p-3 sm:p-4"
      >
        <div className="grid gap-2 sm:grid-cols-3">
          {DIRECTION_OPTIONS.map((option) => {
            const active = direction === option.value
            const isEffective =
              direction === 'auto' && option.value !== 'auto' && option.value === effectiveDirection
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={active}
                onClick={() => setDirection(option.value)}
                className={cn(
                  'relative flex flex-col items-start gap-1 rounded-lg border px-4 py-3 text-left transition-colors',
                  active
                    ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                    : 'border-border/70 bg-background/40 hover:border-primary/50 hover:bg-accent/50',
                )}
              >
                <span className="flex w-full items-center gap-2">
                  <span className={cn('text-base font-semibold', active ? '' : 'text-foreground')}>
                    {option.label}
                  </span>
                  {/* 自动模式下，标出实际生效的那一项 */}
                  {isEffective ? (
                    <span
                      className={cn(
                        'ml-auto rounded-full border px-2 py-0.5 text-[10px]',
                        active
                          ? 'border-primary-foreground/40'
                          : 'border-primary/50 bg-primary/10 text-primary',
                      )}
                    >
                      当前
                    </span>
                  ) : null}
                </span>
                <span
                  className={cn(
                    'font-mono text-[11px]',
                    active ? 'text-primary-foreground/75' : 'text-muted-foreground',
                  )}
                >
                  {option.hint}
                </span>
              </button>
            )
          })}
        </div>

        <p className="text-center text-xs text-muted-foreground">
          {direction === 'auto' ? (
            <>
              <span className="font-medium text-foreground">自动判断</span> · {directionHint}
            </>
          ) : (
            <>
              已手动锁定为 <span className="font-medium text-foreground">{isEncode ? '编码' : '解码'}</span> ·{' '}
              {directionHint}
            </>
          )}
        </p>
      </section>

      <EncodeOptionsControls
        options={options}
        onOptionsChange={setOptions}
        encoding={encoding}
        onEncodingChange={setEncoding}
      >
        <div className="ml-auto flex items-center gap-2 pb-1.5">
          <Switch id="live-switch" checked={live} onCheckedChange={setLive} />
          <Label htmlFor="live-switch" className="text-xs text-muted-foreground">
            实时转换
          </Label>
        </div>
      </EncodeOptionsControls>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
        <IoPanel
          title={isEncode ? '① 输入 · 原始文本' : '① 输入 · Base64'}
          description={isEncode ? '把要编码的文本粘贴到这里' : '把要解码的 Base64 粘贴到这里'}
          action={
            <Badge variant="secondary" className="font-mono text-[11px]">
              {analysis.label}
            </Badge>
          }
          value={source}
          onValueChange={setSource}
          autoFocus
          spellCheck={isEncode}
          placeholder={isEncode ? '在此输入或粘贴文本…' : '例如：QmFzZTY0IFN0dWRpbw=='}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
              event.preventDefault()
              convert()
            }
          }}
          toolbar={
            <>
              <Button variant="outline" size="sm" onClick={() => void handlePaste()}>
                <ClipboardPasteIcon />
                粘贴
              </Button>
              <Button variant="outline" size="sm" onClick={handleSample}>
                <SparklesIcon />
                示例文本
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setDirection('decode')
                  setSource(encodedSample)
                }}
              >
                <SparklesIcon />
                示例 Base64
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                onClick={() => {
                  setSource('')
                  setResult(EMPTY)
                }}
              >
                <EraserIcon />
                清空
              </Button>
            </>
          }
        />

        {/* 中间的转换公式 + 交换 */}
        <div className="flex items-center justify-center gap-3 lg:h-full lg:flex-col lg:gap-2 lg:justify-center">
          <div
            aria-label={`转换方向：${isEncode ? '文本 到 Base64' : 'Base64 到 文本'}`}
            className="flex items-center gap-2 rounded-full border border-border/70 bg-card/60 px-3 py-1.5 lg:flex-col lg:rounded-xl lg:px-2.5 lg:py-3"
          >
            <span className="font-mono text-[10px] whitespace-nowrap text-muted-foreground">
              {isEncode ? '文本' : 'BASE64'}
            </span>
            <ArrowRightIcon className="size-4 shrink-0 text-primary lg:rotate-90" />
            <span className="font-mono text-[10px] whitespace-nowrap text-muted-foreground">
              {isEncode ? 'BASE64' : '文本'}
            </span>
          </div>
          <Button
            variant="ghost"
            size="xs"
            className="text-muted-foreground"
            onClick={handleSwap}
            disabled={!result.output}
            aria-label="交换输入与输出"
          >
            <ArrowLeftRightIcon />
            交换
          </Button>
        </div>

        <IoPanel
          title={isEncode ? '② 输出 · Base64' : '② 输出 · 文本'}
          description={
            result.output
              ? `共 ${formatCount(result.output.length)} 个字符`
              : copyDescription(analysis.kind, isEncode)
          }
          action={
            <Badge variant="outline" className="font-mono text-[11px]">
              {isEncode ? 'TEXT → B64' : 'B64 → TEXT'}
            </Badge>
          }
          value={result.output}
          readOnly
          placeholder="转换结果会显示在这里"
          error={result.error}
          warnings={result.warnings}
          footer={
            <>
              <CopyButton value={result.output} label={isEncode ? '复制 Base64' : '复制文本'} />
              <Button
                variant="outline"
                size="sm"
                disabled={!result.output}
                onClick={() => downloadText(result.output, isEncode ? 'encoded.txt' : 'decoded.txt')}
              >
                <DownloadIcon />
                下载
              </Button>
              {!live ? (
                <Button size="sm" className="ml-auto" onClick={convert}>
                  <PlayIcon />
                  转换 (Ctrl+Enter)
                </Button>
              ) : null}
            </>
          }
        />
      </div>

      {source.trim() ? (
        <StatGrid>
          <Stat
            label="当前方向"
            value={isEncode ? '编码' : '解码'}
            hint={isEncode ? '文本 → Base64' : 'Base64 → 文本'}
          />
          <Stat label="输入字符" value={formatCount(source.length)} />
          <Stat label="输入字节" value={formatBytes(result.inputBytes)} hint={encoding.toUpperCase()} />
          <Stat label="输出字符" value={formatCount(result.output.length)} />
          <Stat label="输出字节" value={formatBytes(result.outputBytes)} />
          <Stat label="字节比" value={ratioLabel(result.inputBytes, result.outputBytes)} hint="输出 / 输入" />
        </StatGrid>
      ) : null}
    </div>
  )
}

function copyDescription(kind: string, isEncode: boolean): string {
  if (isEncode) return '按所选变体生成 Base64'
  if (kind === 'data-url') return '检测到 Data URL，将自动剥离头部'
  if (kind === 'plain-text') return '输入看起来不是 Base64，解码可能失败'
  return '自动修正 URL-Safe、空白与填充'
}
