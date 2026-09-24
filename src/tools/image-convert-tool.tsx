import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  DownloadIcon,
  EraserIcon,
  FileArchiveIcon,
  ImagePlusIcon,
  ImagesIcon,
  PackageIcon,
  TriangleAlertIcon,
} from 'lucide-react'
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
import { Stat, StatGrid } from '@/components/stat'
import { ToolIcon } from '@/components/tool-icons'
import { Link } from '@/router/link'
import {
  OUTPUT_FORMATS,
  loadImage,
  outputFileName,
  processImage,
  type OutputFormat,
} from '@/lib/image'
import { downloadBlob, formatBytes, formatCount } from '@/lib/format'
import { createZip, zipFileName } from '@/lib/zip'
import { cn } from '@/lib/utils'

type Status = 'pending' | 'working' | 'done' | 'error'

interface Picked {
  id: string
  file: File
}

interface Result {
  status: Status
  blob?: Blob
  width?: number
  height?: number
  error?: string
}

interface Item extends Picked, Result {}

const QUALITY_PRESETS: ReadonlyArray<{ value: number; label: string }> = [
  { value: 0.6, label: '60% · 更小' },
  { value: 0.75, label: '75% · 均衡' },
  { value: 0.82, label: '82% · 推荐' },
  { value: 0.92, label: '92% · 高画质' },
]

let nextId = 0
const makeId = () => {
  nextId += 1
  return `item-${nextId}`
}

/**
 * 图片格式转换。
 *
 * 与「图片压缩」的分工：这里只改编码格式、保持原始像素尺寸，重点是**批量**——
 * 一次拖入多张、统一转格式、逐个下载或打包成 ZIP；缩放与体积对比在压缩工具里。
 * 两个工具共用 src/lib/image.ts 的加载与编码逻辑，所以解码失败的提示、
 * 「浏览器静默回退格式」的校验都是同一套，不会各自跑偏。
 */
export function ImageConvertTool() {
  /**
   * 状态刻意拆成「选中的文件」和「每张的结果」两份。
   *
   * 如果合成一份 items 并让转换的 effect 依赖它，effect 内部又会 setItems 改它，
   * 于是每次状态更新都会让 effect 重跑、取消上一轮再从头开始——死循环。
   * 拆开之后 effect 只依赖 files / format / quality，写结果不影响依赖。
   */
  const [files, setFiles] = useState<Picked[]>([])
  const [results, setResults] = useState<Record<string, Result>>({})
  const [format, setFormat] = useState<OutputFormat>('image/webp')
  const [quality, setQuality] = useState(0.82)
  const [dragging, setDragging] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  /** 每轮转换的编号：用户中途改选项时，旧的一轮结果不许再写回状态 */
  const runRef = useRef(0)

  const addFiles = useCallback((incoming: readonly File[]) => {
    const images = incoming.filter((file) => file.type.startsWith('image/'))
    const skipped = incoming.length - images.length
    setNotice(
      skipped > 0
        ? `已忽略 ${skipped} 个非图片文件${images.length === 0 ? '' : `，加入 ${images.length} 张图片`}`
        : null,
    )
    if (images.length === 0) return
    setFiles((current) => [...current, ...images.map((file) => ({ id: makeId(), file }))])
  }, [])

  /**
   * 逐个转换。
   *
   * 刻意串行而不是 Promise.all：批量几十张图时并行解码会把内存打满；
   * 每张处理完立刻 close() 掉 ImageBitmap，内存占用与图片数量无关。
   */
  useEffect(() => {
    if (files.length === 0) return
    runRef.current += 1
    const runId = runRef.current
    let cancelled = false

    void (async () => {
      for (const picked of files) {
        if (cancelled || runRef.current !== runId) return

        setResults((current) => ({
          ...current,
          [picked.id]: { ...current[picked.id], status: 'working', error: undefined },
        }))

        try {
          const source = await loadImage(picked.file)
          try {
            const result = await processImage(source, {
              scale: 100,
              maxWidth: 0,
              maxHeight: 0,
              format,
              quality,
            })
            if (cancelled || runRef.current !== runId) return
            setResults((current) => ({
              ...current,
              [picked.id]: {
                status: 'done',
                blob: result.blob,
                width: result.width,
                height: result.height,
              },
            }))
          } finally {
            // 立刻释放位图，否则批量处理时内存会一路涨上去
            source.bitmap.close()
          }
        } catch (error) {
          if (cancelled || runRef.current !== runId) return
          setResults((current) => ({
            ...current,
            [picked.id]: { status: 'error', error: (error as Error).message },
          }))
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [files, format, quality])

  /** 改格式或质量：已有结果作废，全部重转。 */
  const invalidate = (next: { format?: OutputFormat; quality?: number }) => {
    if (next.format !== undefined) setFormat(next.format)
    if (next.quality !== undefined) setQuality(next.quality)
    setResults({})
  }

  const items: Item[] = useMemo(
    () => files.map((picked) => ({ ...picked, ...(results[picked.id] ?? { status: 'pending' as Status }) })),
    [files, results],
  )

  const done = useMemo(() => items.filter((item) => item.status === 'done' && item.blob), [items])
  const failed = useMemo(() => items.filter((item) => item.status === 'error'), [items])
  const working = useMemo(() => items.filter((item) => item.status === 'working').length, [items])

  const totalIn = items.reduce((sum, item) => sum + item.file.size, 0)
  const totalOut = done.reduce((sum, item) => sum + (item.blob?.size ?? 0), 0)
  const totalInDone = done.reduce((sum, item) => sum + item.file.size, 0)
  const saving = totalInDone > 0 ? 1 - totalOut / totalInDone : 0
  const isLossy = OUTPUT_FORMATS.find((item) => item.value === format)?.lossy ?? false

  const downloadOne = (item: Item) => {
    if (!item.blob) return
    downloadBlob(item.blob, outputFileName(item.file.name, format), format)
  }

  const downloadZip = async () => {
    if (done.length === 0) return
    const entries = await Promise.all(
      done.map(async (item) => ({
        name: outputFileName(item.file.name, format),
        data: new Uint8Array(await item.blob!.arrayBuffer()),
        lastModified: new Date(item.file.lastModified),
      })),
    )
    const bytes = createZip(entries)
    if (!bytes) return
    downloadBlob(bytes, zipFileName('images'), 'application/zip')
  }

  const reset = () => {
    setFiles([])
    setResults({})
    setNotice(null)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-4 rounded-xl border border-border/70 bg-card/40 px-5 py-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="convert-format" className="text-xs text-muted-foreground">
            输出格式
          </Label>
          <Select value={format} onValueChange={(value) => invalidate({ format: value as OutputFormat })}>
            <SelectTrigger
              id="convert-format"
              className="w-[240px]"
              size="sm"
              aria-label="输出格式"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {OUTPUT_FORMATS.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="convert-quality" className="text-xs text-muted-foreground">
            质量{isLossy ? '' : '（PNG 无损，此项无效）'}
          </Label>
          <div className="flex items-center gap-2">
            <Select
              value={String(quality)}
              onValueChange={(value) => invalidate({ quality: Number(value) })}
              disabled={!isLossy}
            >
              <SelectTrigger
                id="convert-quality"
                className="w-[160px]"
                size="sm"
                aria-label="输出质量"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {QUALITY_PRESETS.map((item) => (
                  <SelectItem key={item.value} value={String(item.value)}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2 pb-0.5">
          <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
            <ImagePlusIcon />
            选择图片
          </Button>
          <Button variant="ghost" size="sm" className="text-muted-foreground" disabled={items.length === 0} onClick={reset}>
            <EraserIcon />
            清空
          </Button>
        </div>
      </div>

      {/* 拖放区：不改变像素尺寸，只重新编码 */}
      <div
        onDragOver={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault()
          setDragging(false)
          addFiles(Array.from(event.dataTransfer.files))
        }}
        className={cn(
          'flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 py-8 text-center transition-colors',
          dragging ? 'border-primary bg-primary/5' : 'border-border bg-card/40 hover:border-primary/60',
        )}
      >
        <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <ImagesIcon className="size-5" />
        </span>
        <span className="text-sm font-medium">
          把图片拖到这里，或
          <button type="button" className="mx-1 underline underline-offset-4" onClick={() => inputRef.current?.click()}>
            选择多张
          </button>
        </span>
        <span className="text-xs text-muted-foreground">
          只重新编码，<strong className="font-medium">不改变像素尺寸</strong> · 支持 PNG / JPEG / WebP / GIF / AVIF 等浏览器可解码的格式
          {items.length > 0 ? ` · 已加入 ${formatCount(items.length)} 张` : ''}
        </span>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          aria-label="选择要转换格式的图片"
          className="hidden"
          onChange={(event) => {
            addFiles(Array.from(event.target.files ?? []))
            event.target.value = ''
          }}
        />
      </div>

      {notice ? (
        <p className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
          <TriangleAlertIcon className="mt-px size-3.5 shrink-0" />
          <span>{notice}</span>
        </p>
      ) : null}

      {items.length > 0 ? (
        <section className="flex flex-col gap-3 rounded-xl border border-border/70 bg-card/40 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold">转换列表</h2>
            <Badge variant="outline" className="text-[11px]">
              共 {formatCount(items.length)} 张
            </Badge>
            {working > 0 ? (
              <Badge variant="secondary" className="text-[11px]">
                正在转换 {working} 张…
              </Badge>
            ) : null}
            {failed.length > 0 ? (
              <Badge variant="outline" className="border-destructive/40 text-[11px] text-destructive">
                {failed.length} 张失败
              </Badge>
            ) : null}

            <Button
              variant="outline"
              size="sm"
              className="ml-auto"
              disabled={done.length === 0}
              onClick={() => void downloadZip()}
            >
              <FileArchiveIcon />
              打包下载 ZIP（{done.length}）
            </Button>
          </div>

          <div className="overflow-x-auto rounded-lg border border-border/60">
            <table aria-label="图片格式转换结果" className="w-full text-left text-xs">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">文件</th>
                  <th className="px-3 py-2 font-medium">尺寸</th>
                  <th className="px-3 py-2 font-medium">原始</th>
                  <th className="px-3 py-2 font-medium">转换后</th>
                  <th className="px-3 py-2 font-medium">状态</th>
                  <th className="px-3 py-2 text-right font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-t border-border/50">
                    <td className="max-w-[260px] truncate px-3 py-2" title={item.file.name}>
                      {item.file.name}
                    </td>
                    <td className="px-3 py-2 font-mono text-muted-foreground">
                      {item.width && item.height ? `${item.width}×${item.height}` : '—'}
                    </td>
                    <td className="px-3 py-2 font-mono">{formatBytes(item.file.size)}</td>
                    <td className="px-3 py-2 font-mono">
                      {item.blob ? formatBytes(item.blob.size) : '—'}
                    </td>
                    <td className="px-3 py-2">
                      {item.status === 'done' ? (
                        <span className="text-emerald-600 dark:text-emerald-400">完成</span>
                      ) : item.status === 'working' ? (
                        <span className="text-muted-foreground">转换中…</span>
                      ) : item.status === 'error' ? (
                        <span className="text-destructive" title={item.error}>
                          失败
                        </span>
                      ) : (
                        <span className="text-muted-foreground">等待中</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={!item.blob}
                        aria-label={`下载 ${item.file.name} 的转换结果`}
                        onClick={() => downloadOne(item)}
                      >
                        <DownloadIcon />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {failed.length > 0 ? (
            <ul className="flex flex-col gap-1 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {failed.slice(0, 5).map((item) => (
                <li key={item.id}>
                  <span className="font-medium">{item.file.name}</span>：{item.error}
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      {items.length > 0 ? (
        <StatGrid>
          <Stat label="图片数" value={formatCount(items.length)} />
          <Stat label="原始总体积" value={formatBytes(totalIn)} />
          <Stat label="转换后总体积" value={done.length > 0 ? formatBytes(totalOut) : '—'} />
          <Stat
            label="体积变化"
            value={saving !== 0 ? `${saving > 0 ? '减小' : '增大'} ${Math.abs(saving * 100).toFixed(1)}%` : '—'}
            hint="同格式互转可能变大"
          />
          <Stat label="输出格式" value={format.replace('image/', '').toUpperCase()} />
          <Stat label="像素尺寸" value="保持原样" hint="需要缩放请用图片压缩" />
        </StatGrid>
      ) : (
        <p className="text-xs text-muted-foreground">
          只想缩小体积、需要缩放或调质量？用
          <Link to="/image/" className="mx-1 inline-flex items-center gap-1 underline underline-offset-4">
            <ToolIcon slug="image" className="size-3.5" />
            图片压缩
          </Link>
          。
        </p>
      )}

      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <PackageIcon className="mt-px size-3.5 shrink-0" />
        <span>
          所有转换都在浏览器本地完成，图片不会上传到任何服务器；打包用的 ZIP 也是本地生成的，
          没有引入第三方压缩库。
        </span>
      </p>
    </div>
  )
}
