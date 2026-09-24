import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CopyIcon,
  DownloadIcon,
  FolderOpenIcon,
  LayersIcon,
  Trash2Icon,
  UploadCloudIcon,
  XIcon,
  ZapIcon,
} from 'lucide-react'
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
import { Switch } from '@/components/ui/switch'
import { CopyButton } from '@/components/copy-button'
import { Stat, StatGrid } from '@/components/stat'
import { HASH_ALGORITHMS, algorithmMeta, hashFileStream, type HashAlgorithm } from '@/lib/hash'
import { collectDroppedFiles, fileDisplayName, mergeFiles, totalSize } from '@/lib/files'
import { findDuplicateGroups, toChecksumText, toCsv, type HashRecord } from '@/lib/manifest'
import { downloadText, formatBytes, formatCount } from '@/lib/format'
import { cn } from '@/lib/utils'

interface BatchRow extends HashRecord {
  size: number
  durationMs: number
  status: 'ok' | 'error'
  error?: string
}

interface Progress {
  index: number
  total: number
  ratio: number
  current: string
  bytesDone: number
}

const IDLE_PROGRESS: Progress = { index: 0, total: 0, ratio: 0, current: '', bytesDone: 0 }

/** 表格渲染上限，避免几千行时 DOM 过重；复制与导出始终包含全部结果。 */
const MAX_RENDERED_ROWS = 300

export function HashBatchPanel() {
  const [files, setFiles] = useState<File[]>([])
  const [algorithms, setAlgorithms] = useState<HashAlgorithm[]>(['md5'])
  const [rows, setRows] = useState<BatchRow[]>([])
  const [running, setRunning] = useState(false)
  const [completedAll, setCompletedAll] = useState(false)
  const [progress, setProgress] = useState<Progress>(IDLE_PROGRESS)
  const [filter, setFilter] = useState('')
  const [onlyDuplicates, setOnlyDuplicates] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [pickedAlgorithm, setPickedAlgorithm] = useState<HashAlgorithm>('md5')
  const [dropError, setDropError] = useState<string | null>(null)
  const filesInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  // 派生而非用 effect 同步：取消勾选某个算法时自动回退到第一个可用算法
  const activeAlgorithm = algorithms.includes(pickedAlgorithm)
    ? pickedAlgorithm
    : (algorithms[0] ?? 'md5')

  useEffect(() => {
    if (files.length === 0 || algorithms.length === 0) return
    const controller = new AbortController()
    abortRef.current = controller
    let cancelled = false

    void (async () => {
      setRunning(true)
      setCompletedAll(false)
      setRows([])
      let bytesDone = 0
      const collected: BatchRow[] = []

      for (let index = 0; index < files.length; index += 1) {
        if (controller.signal.aborted) break
        const file = files[index]
        const name = fileDisplayName(file)
        setProgress({ index: index + 1, total: files.length, ratio: 0, current: name, bytesDone })

        const started = performance.now()
        try {
          const hashes = await hashFileStream(file, algorithms, {
            signal: controller.signal,
            onProgress: (update) => {
              if (cancelled) return
              setProgress({
                index: index + 1,
                total: files.length,
                ratio: update.ratio,
                current: name,
                bytesDone: bytesDone + update.loaded,
              })
            },
          })
          collected.push({
            name,
            size: file.size,
            hashes,
            durationMs: performance.now() - started,
            status: 'ok',
          })
        } catch (error) {
          if (controller.signal.aborted || (error as Error).name === 'AbortError') break
          collected.push({
            name,
            size: file.size,
            hashes: {},
            durationMs: performance.now() - started,
            status: 'error',
            error: '读取失败',
          })
        }

        bytesDone += file.size
        if (cancelled) return
        setRows([...collected])
      }

      if (!cancelled) {
        setRunning(false)
        setCompletedAll(!controller.signal.aborted)
        abortRef.current = null
      }
    })()

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [files, algorithms])

  const addFiles = useCallback((incoming: readonly File[]) => {
    if (incoming.length === 0) return
    setFiles((current) => mergeFiles(current, incoming))
  }, [])

  const duplicateGroups = useMemo(
    () => findDuplicateGroups(rows.filter((row) => row.status === 'ok'), activeAlgorithm),
    [rows, activeAlgorithm],
  )

  const duplicateNames = useMemo(() => {
    const map = new Map<string, number>()
    for (const group of duplicateGroups) {
      for (const name of group.names) map.set(name, group.names.length)
    }
    return map
  }, [duplicateGroups])

  const visibleRows = useMemo(() => {
    const keyword = filter.trim().toLowerCase()
    return rows.filter((row) => {
      if (keyword && !row.name.toLowerCase().includes(keyword)) return false
      if (onlyDuplicates && !duplicateNames.has(row.name)) return false
      return true
    })
  }, [rows, filter, onlyDuplicates, duplicateNames])

  const okRows = useMemo(() => rows.filter((row) => row.status === 'ok'), [rows])
  const failedCount = rows.length - okRows.length
  const totalDuration = rows.reduce((sum, row) => sum + row.durationMs, 0)
  const grandTotal = useMemo(() => totalSize(files), [files])
  const overallRatio =
    progress.total === 0 ? 0 : Math.min(1, (progress.index - 1 + progress.ratio) / progress.total)
  // 批量跑完后 progress 已归零，用 completedAll 明确表达「100%」而不是「0%」
  const shownRatio = completedAll ? 1 : overallRatio
  const shownBytes = completedAll ? grandTotal : progress.bytesDone

  const checksumText = useMemo(
    () => toChecksumText(okRows, activeAlgorithm),
    [okRows, activeAlgorithm],
  )

  const exportCsv = () => downloadText(toCsv(okRows, algorithms), 'hashes.csv')
  const exportChecksum = () => downloadText(checksumText, `checksums-${activeAlgorithm}.txt`)

  const toggleAlgorithm = (algorithm: HashAlgorithm) => {
    setRows([])
    setAlgorithms((current) =>
      current.includes(algorithm)
        ? current.filter((item) => item !== algorithm)
        : [...current, algorithm],
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-4 rounded-xl border border-border/70 bg-card/40 px-5 py-4">
        <div className="flex flex-col gap-2">
          <Label className="text-xs text-muted-foreground">计算算法（可多选）</Label>
          <div className="flex flex-wrap items-center gap-1.5">
            {HASH_ALGORITHMS.map((meta) => (
              <Button
                key={meta.value}
                variant={algorithms.includes(meta.value) ? 'default' : 'outline'}
                size="sm"
                aria-pressed={algorithms.includes(meta.value)}
                aria-label={`计算算法：${meta.label}`}
                onClick={() => toggleAlgorithm(meta.value)}
              >
                {meta.label}
              </Button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="display-algorithm" className="text-xs text-muted-foreground">
            表格显示的算法
          </Label>
          <Select
            value={activeAlgorithm}
            onValueChange={(value) => setPickedAlgorithm(value as HashAlgorithm)}
          >
            <SelectTrigger
              id="display-algorithm"
              size="sm"
              className="w-[130px]"
              aria-label="表格显示的算法"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {algorithms.map((algorithm) => (
                <SelectItem key={algorithm} value={algorithm}>
                  {algorithmMeta(algorithm).label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2 pb-1.5">
          <Button variant="outline" size="sm" onClick={() => filesInputRef.current?.click()}>
            <LayersIcon />
            选择文件
          </Button>
          <Button variant="outline" size="sm" onClick={() => folderInputRef.current?.click()}>
            <FolderOpenIcon />
            选择文件夹
          </Button>
          {files.length > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => {
                setFiles([])
                setRows([])
                setProgress(IDLE_PROGRESS)
              }}
            >
              <Trash2Icon />
              清空
            </Button>
          ) : null}
        </div>

        <input
          ref={filesInputRef}
          type="file"
          multiple
          aria-label="选择要计算哈希的文件"
          className="hidden"
          onChange={(event) => {
            addFiles(Array.from(event.target.files ?? []))
            event.target.value = ''
          }}
        />
        <input
          ref={folderInputRef}
          type="file"
          multiple
          aria-label="选择要计算哈希的文件夹"
          className="hidden"
          // @ts-expect-error 非标准属性，但 Chrome / Edge / Safari / Firefox 均已支持
          webkitdirectory=""
          onChange={(event) => {
            addFiles(Array.from(event.target.files ?? []))
            event.target.value = ''
          }}
        />
      </div>

      <div
        onDragOver={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault()
          setDragging(false)
          // 拖拽遍历目录时可能失败；不兜住的话只有控制台一条 unhandled rejection
          void collectDroppedFiles(event.dataTransfer)
            .then(addFiles)
            .catch(() => setDropError('读取拖入的文件失败，请重试或改用「选择文件」'))
        }}
        className={cn(
          'flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 py-6 text-center transition-colors',
          dragging
            ? 'border-primary bg-primary/5'
            : 'border-border bg-card/40 hover:border-primary/60',
        )}
      >
        <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <UploadCloudIcon className="size-5" />
        </span>
        <span className="text-sm font-medium">
          把文件或整个文件夹拖到这里
          {files.length > 0 ? `（已选 ${formatCount(files.length)} 个文件）` : ''}
        </span>
        <span className="text-xs text-muted-foreground">
          逐个文件分块流式读取（4 MB/块），内存占用与文件总大小无关 · 文件不会上传
        </span>
      </div>

      {dropError ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {dropError}
        </p>
      ) : null}

      {files.length > 0 ? (
        <div className="flex flex-col gap-2 rounded-xl border border-border/70 bg-card/40 px-5 py-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs text-muted-foreground">
              {running
                ? `正在计算 ${progress.index}/${progress.total} · ${progress.current}`
                : rows.length > 0
                  ? `计算完成，共 ${formatCount(rows.length)} 个文件`
                  : '准备中…'}
            </span>
            {running ? (
              <Button
                variant="outline"
                size="sm"
                className="ml-auto"
                onClick={() => abortRef.current?.abort()}
              >
                <XIcon />
                取消
              </Button>
            ) : null}
          </div>

          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-150"
              style={{ width: `${Math.round(shownRatio * 100)}%` }}
            />
          </div>
          <span className="text-[11px] text-muted-foreground">
            总进度 {Math.round(shownRatio * 100)}% · 已读取 {formatBytes(shownBytes)} /{' '}
            {formatBytes(grandTotal)}
          </span>
        </div>
      ) : null}

      {rows.length > 0 ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="按文件名筛选…"
              className="h-9 max-w-xs flex-1 text-xs"
              aria-label="按文件名筛选"
            />
            <div className="flex items-center gap-2">
              <Switch
                id="only-duplicates"
                checked={onlyDuplicates}
                onCheckedChange={setOnlyDuplicates}
              />
              <Label htmlFor="only-duplicates" className="text-xs text-muted-foreground">
                只看重复文件
              </Label>
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <CopyButton value={checksumText} label="复制校验清单" />
              <Button variant="outline" size="sm" onClick={exportCsv} disabled={okRows.length === 0}>
                <DownloadIcon />
                导出 CSV
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={exportChecksum}
                disabled={okRows.length === 0}
              >
                <DownloadIcon />
                {algorithmMeta(activeAlgorithm).label} 清单
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-border/60">
            <table aria-label="批量哈希结果" className="w-full min-w-[720px] text-left text-xs">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">文件</th>
                  <th className="w-[90px] px-3 py-2 font-medium">大小</th>
                  <th className="px-3 py-2 font-medium">
                    {algorithmMeta(activeAlgorithm).label}
                  </th>
                  <th className="w-[70px] px-3 py-2 font-medium">耗时</th>
                  <th className="w-[70px] px-3 py-2 font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.slice(0, MAX_RENDERED_ROWS).map((row) => {
                  const value = row.hashes[activeAlgorithm] ?? ''
                  const duplicateCount = duplicateNames.get(row.name)
                  return (
                    <tr key={row.name} className="border-t border-border/50 align-top">
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono break-all">{row.name}</span>
                          {duplicateCount ? (
                            <Badge
                              variant="outline"
                              className="shrink-0 border-amber-500/40 bg-amber-500/10 text-[10px] text-amber-600 dark:text-amber-400"
                            >
                              重复 ×{duplicateCount}
                            </Badge>
                          ) : null}
                          {row.status === 'error' ? (
                            <Badge variant="destructive" className="shrink-0 text-[10px]">
                              {row.error ?? '失败'}
                            </Badge>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-3 py-2 font-mono whitespace-nowrap text-muted-foreground">
                        {formatBytes(row.size)}
                      </td>
                      <td className="px-3 py-2 font-mono break-all">{value || '—'}</td>
                      <td className="px-3 py-2 font-mono whitespace-nowrap text-muted-foreground">
                        {row.durationMs < 1000
                          ? `${Math.round(row.durationMs)}ms`
                          : `${(row.durationMs / 1000).toFixed(1)}s`}
                      </td>
                      <td className="px-3 py-2">
                        <CopyButton value={value} label="" variant="ghost" size="icon-xs" />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {visibleRows.length > MAX_RENDERED_ROWS ? (
            <p className="text-[11px] text-muted-foreground">
              共 {formatCount(visibleRows.length)} 行，表格仅渲染前 {MAX_RENDERED_ROWS} 行；
              复制与导出始终包含全部结果。
            </p>
          ) : null}
        </>
      ) : (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <CopyIcon className="size-3.5" />
          选择文件后会自动开始计算，可导出 CSV，或导出 `sha256sum -c` 可直接校验的清单。
        </p>
      )}

      {files.length > 0 ? (
        <StatGrid>
          <Stat label="文件数" value={formatCount(files.length)} hint={running ? '计算中' : undefined} />
          <Stat label="总大小" value={formatBytes(grandTotal)} />
          <Stat label="已完成" value={formatCount(okRows.length)} />
          <Stat label="失败" value={formatCount(failedCount)} hint={failedCount ? '读取失败' : '无'} />
          <Stat
            label="重复组"
            value={duplicateGroups.length ? String(duplicateGroups.length) : '0'}
            hint={
              duplicateGroups.length
                ? `涉及 ${duplicateNames.size} 个文件`
                : `${algorithmMeta(activeAlgorithm).label} 无重复`
            }
          />
          <Stat
            label="总耗时"
            value={totalDuration > 0 ? `${(totalDuration / 1000).toFixed(1)}s` : '—'}
            hint={
              totalDuration > 0 && grandTotal > 0
                ? `${formatBytes(grandTotal / (totalDuration / 1000))}/s`
                : undefined
            }
          />
        </StatGrid>
      ) : null}

      <p className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <ZapIcon className="size-3.5" />
        纯 JS 实现速度约 100–300 MB/s：MD5 单算法最快；同时勾选三个算法会增加约 3 倍耗时。
      </p>
    </div>
  )
}
