import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CheckIcon,
  ClipboardPasteIcon,
  FileIcon,
  Trash2Icon,
  UploadCloudIcon,
  XIcon,
  ZapIcon,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CopyButton } from '@/components/copy-button'
import { IoPanel } from '@/components/io-panel'
import { PersistentPanel } from '@/components/persistent-panel'
import { Stat, StatGrid } from '@/components/stat'
import {
  HASH_ALGORITHMS,
  hasWebCrypto,
  hashAll,
  hashFileStream,
  type HashAlgorithm,
  type HashAlgorithmMeta,
} from '@/lib/hash'
import { formatBytes, formatCount } from '@/lib/format'
import { cn } from '@/lib/utils'

type Mode = 'text' | 'file'
type Hashes = Record<HashAlgorithm, string>

/** 纯 JS 实现要走完整文件，超过此大小提示耗时较长（不阻止）。 */
const SLOW_FILE_THRESHOLD = 2 * 1024 * 1024 * 1024

function normalizeExpected(value: string): string {
  return value.trim().toLowerCase().replace(/[\s:-]/g, '')
}

function algorithmOfLength(length: number): HashAlgorithmMeta | null {
  return HASH_ALGORITHMS.find((meta) => meta.hexLength === length) ?? null
}

interface MatchState {
  status: 'empty' | 'match' | 'mismatch' | 'length'
  label: string
}

function matchState(expected: string, actual: string, meta: HashAlgorithmMeta): MatchState {
  if (!expected) return { status: 'empty', label: '待比对' }
  if (expected.length !== meta.hexLength) return { status: 'length', label: '长度不符' }
  if (expected === actual) return { status: 'match', label: '一致' }
  return { status: 'mismatch', label: '不一致' }
}

const MATCH_STYLES: Record<MatchState['status'], string> = {
  empty: 'border-border/60 text-muted-foreground',
  match: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  mismatch: 'border-destructive/40 bg-destructive/10 text-destructive',
  length: 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400',
}

export function HashSinglePanel() {
  const [mode, setMode] = useState<Mode>('text')
  const [text, setText] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [uppercase, setUppercase] = useState(false)
  const [hashes, setHashes] = useState<Hashes | null>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [expected, setExpected] = useState('')
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const webCrypto = hasWebCrypto()

  useEffect(() => {
    if (mode !== 'text' || !text) return
    let cancelled = false
    const timer = window.setTimeout(() => {
      void (async () => {
        setBusy(true)
        try {
          const result = await hashAll(new TextEncoder().encode(text))
          if (cancelled) return
          setHashes(result)
        } finally {
          if (!cancelled) setBusy(false)
        }
      })()
    }, 120)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [mode, text])

  // 文件走流式路径：内存占用恒定，可处理任意大小
  useEffect(() => {
    if (mode !== 'file' || !file) return
    const controller = new AbortController()
    let cancelled = false

    void (async () => {
      setBusy(true)
      setProgress(0)
      try {
        const result = await hashFileStream(file, ['md5', 'sha1', 'sha256'], {
          signal: controller.signal,
          onProgress: (update) => {
            if (!cancelled) setProgress(update.ratio)
          },
        })
        if (!cancelled) setHashes(result)
      } catch (caught) {
        if (!cancelled && (caught as Error).name !== 'AbortError') {
          setError('读取文件失败，请重试')
        }
      } finally {
        if (!cancelled) setBusy(false)
      }
    })()

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [mode, file])

  const acceptFile = useCallback((next: File | undefined) => {
    if (!next) return
    setHashes(null)
    setProgress(0)
    setError(null)
    setFile(next)
  }, [])

  const switchMode = (next: Mode) => {
    setMode(next)
    setHashes(null)
    setError(null)
  }

  const normalizedExpected = normalizeExpected(expected)
  const expectedAlgorithm = algorithmOfLength(normalizedExpected.length)
  const sourceSize = mode === 'text' ? new TextEncoder().encode(text).length : (file?.size ?? 0)

  const handlePasteExpected = async () => {
    try {
      const value = await navigator.clipboard.readText()
      if (value) setExpected(value.trim())
    } catch {
      // 剪贴板不可用时忽略
    }
  }

  const compareLabel = useMemo(() => {
    if (!normalizedExpected || !expectedAlgorithm || !hashes) return '—'
    return matchState(normalizedExpected, hashes[expectedAlgorithm.value] ?? '', expectedAlgorithm).label
  }, [normalizedExpected, expectedAlgorithm, hashes])

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-4 rounded-xl border border-border/70 bg-card/40 px-5 py-4">
        <div className="flex items-center gap-2 pb-1.5">
          <Switch id="hash-upper" checked={uppercase} onCheckedChange={setUppercase} />
          <Label htmlFor="hash-upper" className="text-xs text-muted-foreground">
            输出大写
          </Label>
        </div>
        <div className="flex items-center gap-2 pb-1.5">
          <Badge variant={webCrypto ? 'secondary' : 'outline'} className="gap-1 text-[11px]">
            <ZapIcon className="size-3" />
            {webCrypto ? '内存数据走 Web Crypto 加速' : '纯 JS 模式（file:// 环境）'}
          </Badge>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 pb-1.5">
          {HASH_ALGORITHMS.map((meta) => (
            <span
              key={meta.value}
              className="rounded-full border border-border/60 px-2.5 py-1 font-mono text-[11px] text-muted-foreground"
            >
              {meta.label}
            </span>
          ))}
        </div>
      </div>

      <Tabs value={mode} onValueChange={(value) => switchMode(value as Mode)} className="gap-4">
        <TabsList className="w-full max-w-xs">
          <TabsTrigger value="text">文本</TabsTrigger>
          <TabsTrigger value="file">文件</TabsTrigger>
        </TabsList>

        <PersistentPanel value="text">
          <IoPanel
            title="待计算内容"
            description="输入或粘贴文本，下方实时给出三种摘要"
            action={
              <Badge variant="secondary" className="font-mono text-[11px]">
                {formatCount(text.length)} 字符
              </Badge>
            }
            value={text}
            onValueChange={(value) => {
              setText(value)
              if (!value) {
                setHashes(null)
                setError(null)
              }
            }}
            autoFocus
            spellCheck={false}
            placeholder="在此输入或粘贴需要计算哈希的文本…"
            toolbar={
              <>
                <Button variant="outline" size="sm" onClick={() => setText('hello world')}>
                  示例
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                  onClick={() => {
                    setText('')
                    setHashes(null)
                    setError(null)
                  }}
                >
                  <Trash2Icon />
                  清空
                </Button>
              </>
            }
          />
        </PersistentPanel>

        <PersistentPanel value="file" className="flex flex-col gap-4">
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
              分块流式读取（4 MB/块），内存占用与文件大小无关 · 文件不会上传
            </span>
            <input
              ref={inputRef}
              type="file"
              className="hidden"
              onChange={(event) => {
                acceptFile(event.target.files?.[0])
                event.target.value = ''
              }}
            />
          </div>

          {file ? (
            <div className="flex flex-col gap-3 rounded-xl border border-border/60 bg-card/40 px-4 py-3">
              <div className="flex items-center gap-3">
                <FileIcon className="size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatBytes(file.size)} · {file.type || '未知类型'}
                    {file.size > SLOW_FILE_THRESHOLD ? ' · 文件较大，纯 JS 计算需要一段时间' : ''}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                  onClick={() => {
                    setFile(null)
                    setHashes(null)
                    setError(null)
                  }}
                >
                  <Trash2Icon />
                  移除
                </Button>
              </div>

              {busy ? (
                <div className="flex flex-col gap-1">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-[width] duration-150"
                      style={{ width: `${Math.round(progress * 100)}%` }}
                    />
                  </div>
                  <span className="text-[11px] text-muted-foreground">
                    已读取 {Math.round(progress * 100)}%
                  </span>
                </div>
              ) : null}
            </div>
          ) : null}
        </PersistentPanel>
      </Tabs>

      {error ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      ) : null}

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold">计算结果</h2>
          {busy ? <Badge variant="secondary">计算中…</Badge> : null}
        </div>

        <div className="grid gap-3 lg:grid-cols-3">
          {HASH_ALGORITHMS.map((meta) => {
            const raw = hashes?.[meta.value] ?? ''
            const display = uppercase ? raw.toUpperCase() : raw
            const state = matchState(normalizedExpected, raw, meta)

            return (
              <article
                key={meta.value}
                className="flex flex-col gap-2 rounded-xl border border-border/70 bg-card/40 p-4"
              >
                <header className="flex items-center gap-2">
                  <h3 className="font-mono text-sm font-semibold">{meta.label}</h3>
                  <span className="text-[11px] text-muted-foreground">{meta.bits} 位</span>
                  <span
                    className={cn(
                      'ml-auto inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px]',
                      MATCH_STYLES[state.status],
                    )}
                  >
                    {state.status === 'match' ? <CheckIcon className="size-3" /> : null}
                    {state.status === 'mismatch' ? <XIcon className="size-3" /> : null}
                    {state.label}
                  </span>
                </header>

                <code className="font-mono text-[11px] leading-relaxed break-all text-foreground">
                  {display || '—'}
                </code>

                <div className="mt-auto flex items-center gap-2 pt-1">
                  <CopyButton value={display} label="复制" />
                  <span className="text-[11px] text-muted-foreground">{meta.note}</span>
                </div>
              </article>
            )
          })}
        </div>
      </section>

      <section className="flex flex-col gap-3 rounded-xl border border-border/70 bg-card/40 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold">校验比对</h2>
          <p className="text-xs text-muted-foreground">
            粘贴官方公布的 MD5 / SHA-1 / SHA-256 值，自动判断文件是否一致
          </p>
          {normalizedExpected && expectedAlgorithm ? (
            <Badge variant="outline" className="ml-auto font-mono text-[11px]">
              识别为 {expectedAlgorithm.label}
            </Badge>
          ) : normalizedExpected ? (
            <Badge variant="outline" className="ml-auto text-[11px] text-amber-600 dark:text-amber-400">
              长度 {normalizedExpected.length} 不是常见摘要长度
            </Badge>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={expected}
            onChange={(event) => setExpected(event.target.value)}
            placeholder="例如 d41d8cd98f00b204e9800998ecf8427e"
            spellCheck={false}
            className="h-9 max-w-xl flex-1 font-mono text-xs"
            aria-label="期望的哈希值"
          />
          <Button variant="outline" size="sm" onClick={() => void handlePasteExpected()}>
            <ClipboardPasteIcon />
            粘贴
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            disabled={!expected}
            onClick={() => setExpected('')}
          >
            <Trash2Icon />
            清空
          </Button>
        </div>
      </section>

      {hashes ? (
        <StatGrid>
          <Stat label="模式" value={mode === 'text' ? '文本' : '文件'} hint={webCrypto ? 'Web Crypto' : '纯 JS'} />
          <Stat label="输入大小" value={formatBytes(sourceSize)} hint={`${formatCount(sourceSize)} 字节`} />
          <Stat label="输入字符" value={mode === 'text' ? formatCount(text.length) : '—'} />
          <Stat label="算法" value={`${HASH_ALGORITHMS.length} 种`} hint="MD5 / SHA-1 / SHA-256" />
          <Stat label="比对结果" value={compareLabel} hint={expectedAlgorithm?.label ?? '未识别算法'} />
          <Stat
            label="预览"
            value={hashes.sha256 ? `${hashes.sha256.slice(0, 10)}…` : '—'}
            hint="SHA-256 前 10 位"
          />
        </StatGrid>
      ) : null}
    </div>
  )
}
