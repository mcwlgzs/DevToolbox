import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  DownloadIcon,
  FileIcon,
  FileUpIcon,
  KeyRoundIcon,
  LinkIcon,
  Trash2Icon,
  UploadCloudIcon,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CopyButton } from '@/components/copy-button'
import { EncodeOptionsControls } from '@/components/encode-options'
import { IoPanel } from '@/components/io-panel'
import { Stat, StatGrid } from '@/components/stat'
import {
  decodeBase64,
  encodeBytes,
  extensionForMime,
  parseDataUrlHeader,
  type EncodeOptions,
} from '@/lib/base64'
import { downloadBlob, downloadText, formatBytes, formatCount, withPreviewLimit } from '@/lib/format'
import { cn } from '@/lib/utils'

const MAX_FILE_SIZE = 32 * 1024 * 1024

interface EncodedFile {
  name: string
  size: number
  type: string
  base64: string
  dataUrl: string
}

interface DecodedFile {
  bytes: Uint8Array
  mime?: string
}

function useFileUrl(file: File | null) {
  const url = useMemo(() => (file ? URL.createObjectURL(file) : null), [file])

  useEffect(() => {
    if (!url) return
    return () => URL.revokeObjectURL(url)
  }, [url])

  return url
}

function useObjectUrl(bytes: Uint8Array | null, mime: string | undefined) {
  const url = useMemo(() => {
    if (!bytes || !mime?.startsWith('image/')) return null
    return URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }))
  }, [bytes, mime])

  useEffect(() => {
    if (!url) return
    return () => URL.revokeObjectURL(url)
  }, [url])

  return url
}

export function FileWorkbench() {
  const [options, setOptions] = useState<EncodeOptions>({
    variant: 'standard',
    padding: true,
    wrap: 0,
  })

  const [file, setFile] = useState<File | null>(null)
  const [encoded, setEncoded] = useState<EncodedFile | null>(null)
  const [encodeError, setEncodeError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const [b64Input, setB64Input] = useState('')
  const [decoded, setDecoded] = useState<DecodedFile | null>(null)
  const [decodeError, setDecodeError] = useState<string | null>(null)
  const [outputName, setOutputName] = useState('')

  useEffect(() => {
    if (!file) return

    let cancelled = false

    void (async () => {
      setBusy(true)
      setEncodeError(null)
      try {
        const buffer = await file.arrayBuffer()
        if (cancelled) return
        const bytes = new Uint8Array(buffer)
        const base64 = encodeBytes(bytes, options)
        const mime = file.type || 'application/octet-stream'
        setEncoded({
          name: file.name,
          size: file.size,
          type: mime,
          base64,
          dataUrl: `data:${mime};base64,${base64.replace(/\s+/g, '')}`,
        })
        setOutputName(`${file.name}.base64.txt`)
      } catch {
        if (!cancelled) setEncodeError('读取文件失败，请重试')
      } finally {
        if (!cancelled) setBusy(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [file, options])

  const acceptFile = useCallback((next: File | undefined) => {
    if (!next) return
    setDecoded(null)
    setDecodeError(null)
    if (next.size > MAX_FILE_SIZE) {
      setFile(null)
      setEncoded(null)
      setEncodeError(`文件过大（${formatBytes(next.size)}），上限为 ${formatBytes(MAX_FILE_SIZE)}`)
      return
    }
    setEncoded(null)
    setEncodeError(null)
    setFile(next)
  }, [])

  const handleDecode = () => {
    const result = decodeBase64(b64Input)
    if (!result.ok) {
      setDecoded(null)
      setDecodeError(result.error)
      return
    }
    const header = parseDataUrlHeader(b64Input)
    const mime = result.mime ?? header?.mime ?? undefined
    setDecoded({ bytes: result.bytes, mime: mime || undefined })
    setDecodeError(null)
    setOutputName(`decoded.${extensionForMime(mime)}`)
  }

  const preview = encoded ? withPreviewLimit(encoded.base64) : null
  const imageUrl = useObjectUrl(decoded?.bytes ?? null, decoded?.mime)
  const sourceImageUrl = useFileUrl(file && file.type.startsWith('image/') ? file : null)

  return (
    <div className="flex flex-col gap-5">
      <EncodeOptionsControls options={options} onOptionsChange={setOptions} />

      <div className="grid items-start gap-4 lg:grid-cols-2">
        {/* 文件 -> Base64 */}
        <div className="flex flex-col gap-4">
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
              'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 py-8 text-center transition-colors',
              dragging
                ? 'border-primary bg-primary/5'
                : 'border-border bg-card/40 hover:border-primary/60 hover:bg-card/70',
            )}
          >
            <span className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <UploadCloudIcon className="size-5" />
            </span>
            <span className="text-sm font-medium">拖拽文件到此处，或点击选择</span>
            <span className="text-xs text-muted-foreground">
              支持任意类型 · 单文件上限 {formatBytes(MAX_FILE_SIZE)} · 不会上传到任何服务器
            </span>
            <input
              ref={inputRef}
              type="file"
              aria-label="选择要编码为 Base64 的文件"
              className="hidden"
              onChange={(event) => {
                acceptFile(event.target.files?.[0])
                event.target.value = ''
              }}
            />
          </div>

          <IoPanel
            title="Base64 输出"
            description={
              encoded
                ? `${encoded.name} · ${formatBytes(encoded.size)} · ${encoded.type}`
                : '选择文件后自动生成'
            }
            action={
              busy ? (
                <Badge variant="secondary">读取中…</Badge>
              ) : encoded ? (
                <Badge variant="outline" className="font-mono text-[11px]">
                  {options.variant === 'urlsafe' ? 'URL-Safe' : 'STANDARD'}
                </Badge>
              ) : null
            }
            value={preview?.text ?? ''}
            readOnly
            placeholder="等待选择文件…"
            error={encodeError}
            warnings={
              preview?.truncated
                ? [`内容较大，仅预览前 ${formatCount(preview.text.length)} 个字符；“复制”仍为完整数据`]
                : undefined
            }
            textareaClassName="min-h-[180px]"
            footer={
              <>
                <CopyButton value={encoded?.base64 ?? ''} label="复制 Base64" />
                <CopyButton
                  value={encoded?.dataUrl ?? ''}
                  label="复制 Data URL"
                  variant="secondary"
                />
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!encoded}
                  onClick={() => encoded && downloadBlob(encoded.base64, outputName || 'file.base64.txt')}
                >
                  <DownloadIcon />
                  导出 .txt
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto text-muted-foreground"
                  disabled={!file && !encoded}
                  onClick={() => {
                    setFile(null)
                    setEncoded(null)
                    setEncodeError(null)
                  }}
                >
                  <Trash2Icon />
                  清除
                </Button>
              </>
            }
          />

          {sourceImageUrl ? (
            <div className="rounded-xl border border-border/70 bg-card/40 p-4">
              <p className="mb-3 text-xs text-muted-foreground">原图预览</p>
              <img
                src={sourceImageUrl}
                alt={file?.name ?? '原图预览'}
                className="max-h-56 w-auto rounded-lg border border-border/60 object-contain"
              />
            </div>
          ) : null}
        </div>

        {/* Base64 -> 文件 */}
        <div className="flex flex-col gap-4">
          <IoPanel
            title="Base64 输入"
            description="粘贴 Base64 或 Data URL，还原为文件"
            action={
              <Badge variant="secondary" className="font-mono text-[11px]">
                B64 → FILE
              </Badge>
            }
            value={b64Input}
            onValueChange={setB64Input}
            placeholder="data:image/png;base64,iVBORw0KGgo…"
            error={decodeError}
            textareaClassName="min-h-[180px]"
            toolbar={
              <>
                <Button
                  size="sm"
                  onClick={handleDecode}
                  disabled={b64Input.trim().length === 0}
                >
                  <KeyRoundIcon />
                  解码为文件
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                  onClick={() => {
                    setB64Input('')
                    setDecoded(null)
                    setDecodeError(null)
                  }}
                >
                  <Trash2Icon />
                  清空
                </Button>
              </>
            }
            footer={
              <>
                <CopyButton value={b64Input} label="复制输入" />
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!b64Input}
                  onClick={() => downloadText(b64Input, 'base64-input.txt')}
                >
                  <DownloadIcon />
                  导出输入
                </Button>
              </>
            }
          />

          <div className="rounded-xl border border-border/70 bg-card/40 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">解码结果</p>
              {decoded ? (
                <Badge variant="outline" className="font-mono text-[11px]">
                  {decoded.mime ?? 'application/octet-stream'}
                </Badge>
              ) : null}
            </div>

            {decoded ? (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-background/50 px-3 py-2">
                  <FileIcon className="size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {outputName || `decoded.${extensionForMime(decoded.mime)}`}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatBytes(decoded.bytes.byteLength)} · {formatCount(decoded.bytes.byteLength)} 字节
                    </p>
                  </div>
                </div>

                {imageUrl ? (
                  <img
                    src={imageUrl}
                    alt="解码预览"
                    className="max-h-56 w-auto rounded-lg border border-border/60 object-contain"
                  />
                ) : null}

                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    value={outputName}
                    onChange={(event) => setOutputName(event.target.value)}
                    placeholder="输出文件名"
                    className="h-8 w-[200px] text-xs"
                  />
                  <Button
                    size="sm"
                    onClick={() =>
                      downloadBlob(
                        decoded.bytes as BlobPart,
                        outputName || `decoded.${extensionForMime(decoded.mime)}`,
                        decoded.mime ?? 'application/octet-stream',
                      )
                    }
                  >
                    <DownloadIcon />
                    下载文件
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const text = new TextDecoder('utf-8').decode(decoded.bytes)
                      downloadBlob(text, 'decoded-as-text.txt', 'text/plain;charset=utf-8')
                    }}
                  >
                    <FileUpIcon />
                    按 UTF-8 文本导出
                  </Button>
                </div>
              </div>
            ) : (
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <LinkIcon className="size-3.5" />
                解码后这里会显示文件类型、大小、图片预览与下载按钮
              </p>
            )}
          </div>
        </div>
      </div>

      <StatGrid>
        <Stat
          label="源文件"
          value={encoded ? encoded.name : '—'}
          hint={encoded ? encoded.type : '尚未选择'}
        />
        <Stat label="原始大小" value={encoded ? formatBytes(encoded.size) : '—'} />
        <Stat
          label="Base64 长度"
          value={encoded ? formatCount(encoded.base64.replace(/\s+/g, '').length) : '—'}
          hint={encoded ? formatBytes(encoded.base64.replace(/\s+/g, '').length) : undefined}
        />
        <Stat
          label="膨胀率"
          value={encoded ? `${(encoded.base64.replace(/\s+/g, '').length / Math.max(encoded.size, 1)).toFixed(2)}×` : '—'}
          hint="Base64 约增加 33%"
        />
        <Stat label="解码大小" value={decoded ? formatBytes(decoded.bytes.byteLength) : '—'} />
        <Stat label="解码类型" value={decoded?.mime ?? '—'} />
      </StatGrid>
    </div>
  )
}
