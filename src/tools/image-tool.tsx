import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DownloadIcon, EraserIcon, ImageIcon, Trash2Icon, UploadCloudIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Stat, StatGrid } from '@/components/stat'
import {
  OUTPUT_FORMATS,
  computeTargetSize,
  isImageFile,
  loadImage,
  outputFileName,
  processImage,
  type ImageSource,
  type OutputFormat,
  type ProcessedImage,
} from '@/lib/image'
import { formatBytes, formatCount } from '@/lib/format'
import { cn } from '@/lib/utils'

interface Options {
  maxWidth: number
  maxHeight: number
  scale: number
  format: OutputFormat
  quality: number
}

const DEFAULT_OPTIONS: Options = {
  maxWidth: 0,
  maxHeight: 0,
  scale: 100,
  format: 'image/webp',
  quality: 0.82,
}

export function ImageTool() {
  const [file, setFile] = useState<File | null>(null)
  const [loaded, setLoaded] = useState<{ file: File; source: ImageSource } | null>(null)
  const [options, setOptions] = useState<Options>(DEFAULT_OPTIONS)
  const [output, setOutput] = useState<ProcessedImage | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // 派生出「当前图片」：一旦 file 变了，旧 source 立刻视为不存在。
  // 这一点很关键——换图时旧 ImageBitmap 已经被 close()，
  // 如果这段时间里重新编码的 effect 还在用旧 bitmap，drawImage 会抛 InvalidStateError。
  const source = loaded && loaded.file === file ? loaded.source : null

  const sourceUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file])
  useEffect(() => {
    if (!sourceUrl) return
    return () => URL.revokeObjectURL(sourceUrl)
  }, [sourceUrl])

  const outputUrl = useMemo(
    () => (output ? URL.createObjectURL(output.blob) : null),
    [output],
  )
  useEffect(() => {
    if (!outputUrl) return
    return () => URL.revokeObjectURL(outputUrl)
  }, [outputUrl])

  const acceptFile = useCallback((next: File | undefined) => {
    if (!next) return
    setOutput(null)
    setError(null)
    if (!isImageFile(next)) {
      setFile(null)
      setLoaded(null)
      setError('只支持图片文件（PNG / JPEG / WebP / GIF / AVIF 等浏览器可解码的格式）')
      return
    }
    setFile(next)
  }, [])

  // 解码原图
  useEffect(() => {
    if (!file) return
    let cancelled = false
    let loadedSource: ImageSource | null = null

    void (async () => {
      setBusy(true)
      try {
        const result = await loadImage(file)
        loadedSource = result
        if (cancelled) {
          result.bitmap.close()
          return
        }
        setLoaded({ file, source: result })
      } catch (caught) {
        if (!cancelled) setError((caught as Error).message || '图片解码失败')
      } finally {
        if (!cancelled) setBusy(false)
      }
    })()

    return () => {
      cancelled = true
      loadedSource?.bitmap.close()
    }
  }, [file])

  // 重新编码
  useEffect(() => {
    if (!source) return
    let cancelled = false

    void (async () => {
      setBusy(true)
      try {
        const result = await processImage(source, options)
        if (cancelled) return
        setOutput(result)
        setError(null)
      } catch (caught) {
        if (!cancelled) setError((caught as Error).message || '导出失败')
      } finally {
        if (!cancelled) setBusy(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [source, options])

  const targetPreview = source ? computeTargetSize(source.width, source.height, options) : null
  const saved = output && source ? source.file.size - output.blob.size : 0
  const savedRatio = output && source && source.file.size > 0 ? saved / source.file.size : 0

  const download = () => {
    if (!output || !file) return
    const url = URL.createObjectURL(output.blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = outputFileName(file.name, output.format)
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
    setTimeout(() => URL.revokeObjectURL(url), 2000)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-4 rounded-xl border border-border/70 bg-card/40 px-5 py-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="format-select" className="text-xs text-muted-foreground">
            输出格式
          </Label>
          <Select
            value={options.format}
            onValueChange={(value) => setOptions((current) => ({ ...current, format: value as OutputFormat }))}
          >
            <SelectTrigger id="format-select" className="w-[260px]" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {OUTPUT_FORMATS.map((format) => (
                <SelectItem key={format.value} value={format.value}>
                  {format.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="scale-input" className="text-xs text-muted-foreground">
            缩放（%）
          </Label>
          <Input
            id="scale-input"
            type="number"
            min={1}
            max={400}
            value={options.scale}
            onChange={(event) => setOptions((current) => ({ ...current, scale: Number(event.target.value) || 100 }))}
            className="h-8 w-[100px] text-xs"
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="max-width" className="text-xs text-muted-foreground">
            最大宽度（0=不限）
          </Label>
          <Input
            id="max-width"
            type="number"
            min={0}
            value={options.maxWidth}
            onChange={(event) => setOptions((current) => ({ ...current, maxWidth: Math.max(0, Math.floor(Number(event.target.value) || 0)) }))}
            className="h-8 w-[130px] text-xs"
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="max-height" className="text-xs text-muted-foreground">
            最大高度（0=不限）
          </Label>
          <Input
            id="max-height"
            type="number"
            min={0}
            value={options.maxHeight}
            onChange={(event) => setOptions((current) => ({ ...current, maxHeight: Math.max(0, Math.floor(Number(event.target.value) || 0)) }))}
            className="h-8 w-[130px] text-xs"
          />
        </div>

        <div className="flex min-w-[240px] grow basis-[280px] flex-col gap-2">
          <Label htmlFor="quality-range" className="text-xs text-muted-foreground">
            质量 {Math.round(options.quality * 100)}%
            {options.format === 'image/png' ? '（PNG 无损，此参数无效）' : ''}
          </Label>
          <input
            id="quality-range"
            type="range"
            min={10}
            max={100}
            value={Math.round(options.quality * 100)}
            disabled={options.format === 'image/png'}
            onChange={(event) => setOptions((current) => ({ ...current, quality: Number(event.target.value) / 100 }))}
            className="mt-2 h-2 w-full min-w-[200px] cursor-pointer appearance-none rounded-full bg-muted accent-primary disabled:opacity-40"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 pb-1.5">
          <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
            <ImageIcon />
            选择图片
          </Button>
          {file ? (
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => {
                setFile(null)
                setLoaded(null)
                setOutput(null)
                setError(null)
                setOptions(DEFAULT_OPTIONS)
              }}
            >
              <Trash2Icon />
              清除
            </Button>
          ) : null}
        </div>

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          aria-label="选择要压缩的图片"
          className="hidden"
          onChange={(event) => {
            acceptFile(event.target.files?.[0])
            event.target.value = ''
          }}
        />
      </div>

      {!file ? (
        <div
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              inputRef.current?.click()
            }
          }}
          onDragOver={(event) => {
            event.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault()
            setDragging(false)
            acceptFile(event.dataTransfer.files?.[0])
          }}
          className={cn(
            'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 py-14 text-center transition-colors',
            dragging ? 'border-primary bg-primary/5' : 'border-border bg-card/40 hover:border-primary/60',
          )}
        >
          <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <UploadCloudIcon className="size-6" />
          </span>
          <span className="text-sm font-medium">把图片拖到这里，或点击选择</span>
          <span className="text-xs text-muted-foreground">
            支持 PNG / JPEG / WebP / GIF / AVIF · 单张上限约 4000 万像素 · 图片不会上传
          </span>
        </div>
      ) : null}

      {error ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      ) : null}

      {source && targetPreview ? (
        <div className="grid items-start gap-4 lg:grid-cols-3">
          <section className="flex flex-col gap-3 rounded-xl border border-border/70 bg-card/40 p-4">
            <header className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold">原图</h2>
              <Badge variant="secondary" className="font-mono text-[11px]">
                {source.width}×{source.height}
              </Badge>
            </header>
            {sourceUrl ? (
              <img
                src={sourceUrl}
                alt="原图预览"
                className="max-h-[260px] w-full rounded-lg border border-border/60 object-contain"
              />
            ) : null}
            <dl className="flex flex-col gap-1 text-xs text-muted-foreground">
              <div className="flex justify-between gap-3">
                <dt>文件名</dt>
                <dd className="truncate font-mono">{file?.name}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>体积</dt>
                <dd className="font-mono">{formatBytes(source.file.size)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>类型</dt>
                <dd className="font-mono">{source.file.type || '未知'}</dd>
              </div>
            </dl>
          </section>

          <section className="flex flex-col gap-3 rounded-xl border border-border/70 bg-card/40 p-4">
            <header className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold">压缩结果</h2>
              {busy ? <Badge variant="secondary">处理中…</Badge> : null}
              {output ? (
                <Badge variant="outline" className="font-mono text-[11px]">
                  {output.width}×{output.height}
                </Badge>
              ) : null}
            </header>
            {outputUrl ? (
              <img
                src={outputUrl}
                alt="压缩结果预览"
                className="max-h-[260px] w-full rounded-lg border border-border/60 object-contain"
              />
            ) : (
              <div className="flex h-[200px] items-center justify-center rounded-lg border border-border/60 text-xs text-muted-foreground">
                处理中…
              </div>
            )}
            {output ? (
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant="outline"
                    className={cn(
                      'font-mono text-[11px]',
                      saved > 0
                        ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                        : 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400',
                    )}
                  >
                    {formatBytes(output.blob.size)}
                    {saved !== 0 ? ` · ${saved > 0 ? '减小' : '增大'} ${Math.abs(savedRatio * 100).toFixed(1)}%` : ''}
                  </Badge>
                  <Button size="sm" onClick={download}>
                    <DownloadIcon />
                    下载
                  </Button>
                </div>
                <p className="font-mono text-[11px] text-muted-foreground">
                  {outputFileName(file?.name ?? 'image', output.format)}
                </p>
              </div>
            ) : null}
          </section>

          <section className="flex flex-col gap-3 rounded-xl border border-border/70 bg-card/40 p-5">
            <h2 className="text-sm font-semibold">处理摘要</h2>
            <ul className="flex flex-col gap-2 text-xs text-muted-foreground">
              <li className="flex justify-between gap-3">
                <span>目标尺寸</span>
                <span className="font-mono text-foreground">
                  {targetPreview.width}×{targetPreview.height}
                </span>
              </li>
              <li className="flex justify-between gap-3">
                <span>缩放比例</span>
                <span className="font-mono text-foreground">
                  {((targetPreview.width / source.width) * 100).toFixed(1)}%
                </span>
              </li>
              <li className="flex justify-between gap-3">
                <span>输出格式</span>
                <span className="font-mono text-foreground">{output?.format ?? options.format}</span>
              </li>
              <li className="flex justify-between gap-3">
                <span>无损</span>
                <span className="font-mono text-foreground">{options.format === 'image/png' ? '是' : '否'}</span>
              </li>
              <li className="flex justify-between gap-3">
                <span>透明通道</span>
                <span className="font-mono text-foreground">
                  {options.format === 'image/jpeg' ? '会被白底替换' : '保留'}
                </span>
              </li>
              <li className="flex justify-between gap-3">
                <span>像素总量</span>
                <span className="font-mono text-foreground">
                  {formatCount(targetPreview.width * targetPreview.height)}
                </span>
              </li>
            </ul>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              全部处理都在本地 Canvas 完成：图片只经过 File API 读入内存，页面不发送任何包含图片的请求。
            </p>
          </section>
        </div>
      ) : null}

      {source ? (
        <StatGrid>
          <Stat label="原图尺寸" value={`${source.width}×${source.height}`} />
          <Stat label="原图体积" value={formatBytes(source.file.size)} />
          <Stat label="输出尺寸" value={output ? `${output.width}×${output.height}` : '—'} />
          <Stat label="输出体积" value={output ? formatBytes(output.blob.size) : '—'} />
          <Stat
            label="节省"
            value={output ? `${savedRatio >= 0 ? '' : '+'}${(-savedRatio * 100).toFixed(1)}%` : '—'}
            hint={saved >= 0 ? '体积减小' : '体积增大'}
          />
          <Stat label="输出格式" value={options.format.replace('image/', '').toUpperCase()} />
        </StatGrid>
      ) : null}

      <p className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <EraserIcon className="size-3.5" />
        照片类内容建议用 JPEG 或 WebP（质量 70–85%），截图、图标、需要透明的素材用 PNG 或 WebP。
      </p>
    </div>
  )
}
