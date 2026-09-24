import { useMemo, useRef, useState } from 'react'
import {
  ArrowLeftRightIcon,
  DownloadIcon,
  FileUpIcon,
  SparklesIcon,
  Trash2Icon,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { CopyButton } from '@/components/copy-button'
import { IoPanel } from '@/components/io-panel'
import { Stat, StatGrid } from '@/components/stat'
import { algorithmMeta, type HashAlgorithm } from '@/lib/hash'
import {
  CHANGE_LABELS,
  compareManifests,
  formatComparisonReport,
  parseManifest,
  type ChangeKind,
} from '@/lib/manifest'
import { downloadText, formatBytes, formatCount } from '@/lib/format'
import { cn } from '@/lib/utils'

const SAMPLE_A = [
  '# 拷贝前的清单（md5sum 输出）',
  'd41d8cd98f00b204e9800998ecf8427e  video-01.mp4',
  '900150983cd24fb0d6963f7d28e17f72  video-02.mp4',
  '0cc175b9c0f1b6a831c399e269772661  video-03.mp4',
  'f96b697d7cb7938d525a2f31aaf161d0  video-04.mp4',
].join('\n')

const SAMPLE_B = [
  '# 拷贝后的清单：02 内容变了、03 丢了、05 是新增的',
  'd41d8cd98f00b204e9800998ecf8427e  video-01.mp4',
  'c3fcd3d76192e4007dfb496cca67e13b  video-02.mp4',
  'f96b697d7cb7938d525a2f31aaf161d0  video-04.mp4',
  'd174ab98d277d9f5a5611c2c9f419d9f  video-05.mp4',
].join('\n')

const KIND_ORDER: ChangeKind[] = ['changed', 'added', 'removed', 'unknown', 'unchanged']

const KIND_STYLES: Record<ChangeKind, string> = {
  changed: 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400',
  added: 'border-sky-500/40 bg-sky-500/10 text-sky-600 dark:text-sky-400',
  removed: 'border-destructive/40 bg-destructive/10 text-destructive',
  unknown: 'border-border/60 text-muted-foreground',
  unchanged: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
}

const ALL_ALGORITHMS: HashAlgorithm[] = ['md5', 'sha1', 'sha256']

export function HashManifestPanel() {
  const [textA, setTextA] = useState('')
  const [textB, setTextB] = useState('')
  const [pickedAlgorithm, setPickedAlgorithm] = useState<HashAlgorithm>('md5')
  const [kindFilter, setKindFilter] = useState<'all' | ChangeKind>('all')
  const [importError, setImportError] = useState<string | null>(null)
  const fileARef = useRef<HTMLInputElement>(null)
  const fileBRef = useRef<HTMLInputElement>(null)

  const parsedA = useMemo(() => parseManifest(textA), [textA])
  const parsedB = useMemo(() => parseManifest(textB), [textB])

  const available = useMemo(() => {
    const counts: Record<HashAlgorithm, number> = { md5: 0, sha1: 0, sha256: 0 }
    for (const entry of [...parsedA.entries, ...parsedB.entries]) {
      for (const algorithm of ALL_ALGORITHMS) {
        if (entry.hashes[algorithm]) counts[algorithm] += 1
      }
    }
    return ALL_ALGORITHMS.filter((algorithm) => counts[algorithm] > 0)
  }, [parsedA.entries, parsedB.entries])

  // 派生而非 effect：勾选的算法不可用时自动回退
  const activeAlgorithm = available.includes(pickedAlgorithm)
    ? pickedAlgorithm
    : (available[0] ?? 'md5')

  const ready = parsedA.entries.length > 0 && parsedB.entries.length > 0
  const comparison = useMemo(
    () => compareManifests(parsedA.entries, parsedB.entries, activeAlgorithm),
    [parsedA.entries, parsedB.entries, activeAlgorithm],
  )

  const visibleRows = useMemo(
    () =>
      kindFilter === 'all'
        ? comparison.rows
        : comparison.rows.filter((row) => row.kind === kindFilter),
    [comparison.rows, kindFilter],
  )

  const report = useMemo(
    () => (ready ? formatComparisonReport(comparison, activeAlgorithm) : ''),
    [ready, comparison, activeAlgorithm],
  )

  const importInto = async (file: File | undefined, target: 'a' | 'b') => {
    if (!file) return
    let content: string
    try {
      content = await file.text()
    } catch {
      // 选好文件后又被删除/改名时 file.text() 会拒绝。
      // 这里必须自己兜住：否则只有控制台一条 unhandled rejection，界面上看不出没导入成功。
      setImportError(`读取「${file.name}」失败，请确认文件仍然存在后重试`)
      return
    }
    setImportError(null)
    if (target === 'a') setTextA(content)
    else setTextB(content)
  }

  const swap = () => {
    setTextA(textB)
    setTextB(textA)
  }

  const panelData = [
    {
      key: 'a' as const,
      title: '清单 A（基线）',
      description: '拷贝前 / 服务器上 / 原始文件的哈希清单',
      value: textA,
      setValue: setTextA,
      parsed: parsedA,
      inputRef: fileARef,
    },
    {
      key: 'b' as const,
      title: '清单 B（对照）',
      description: '拷贝后 / 本地 / 待校验文件的哈希清单',
      value: textB,
      setValue: setTextB,
      parsed: parsedB,
      inputRef: fileBRef,
    },
  ]

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl border border-border/70 bg-card/40 px-5 py-4">
        <div className="flex flex-col gap-2">
          <Label className="text-xs text-muted-foreground">按哪种哈希比对</Label>
          <div className="flex flex-wrap items-center gap-1.5">
            {available.length === 0 ? (
              <span className="text-xs text-muted-foreground">粘贴清单后自动识别</span>
            ) : (
              available.map((algorithm) => (
                <Button
                  key={algorithm}
                  variant={activeAlgorithm === algorithm ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setPickedAlgorithm(algorithm)}
                >
                  {algorithmMeta(algorithm).label}
                </Button>
              ))
            )}
          </div>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setTextA(SAMPLE_A)
              setTextB(SAMPLE_B)
            }}
          >
            <SparklesIcon />
            载入示例
          </Button>
          <Button variant="outline" size="sm" onClick={swap} disabled={!textA && !textB}>
            <ArrowLeftRightIcon />
            交换 A / B
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            disabled={!textA && !textB}
            onClick={() => {
              setTextA('')
              setTextB('')
              setKindFilter('all')
            }}
          >
            <Trash2Icon />
            清空
          </Button>
        </div>
      </div>

      {importError ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {importError}
        </p>
      ) : null}

      <div className="grid items-start gap-4 lg:grid-cols-2">
        {panelData.map((panel) => (
          <IoPanel
            key={panel.key}
            title={panel.title}
            description={panel.description}
            action={
              <Badge variant="secondary" className="font-mono text-[11px]">
                {panel.parsed.entries.length} 条
              </Badge>
            }
            value={panel.value}
            onValueChange={panel.setValue}
            spellCheck={false}
            placeholder={
              '支持三种格式：\n' +
              'd41d8cd98f00b204e9800998ecf8427e  video.mp4\n' +
              'name,size,md5,sha1,sha256\n' +
              'video.mp4 d41d8cd98f00b204e9800998ecf8427e'
            }
            error={panel.parsed.errors.length > 0 ? panel.parsed.errors.slice(0, 3).join('；') : null}
            warnings={
              panel.parsed.duplicates.length > 0
                ? [`${panel.parsed.duplicates.length} 个重名文件被忽略：${panel.parsed.duplicates.slice(0, 3).join('、')}`]
                : undefined
            }
            textareaClassName="min-h-[200px]"
            toolbar={
              <>
                <Button variant="outline" size="sm" onClick={() => panel.inputRef.current?.click()}>
                  <FileUpIcon />
                  导入文件
                </Button>
                <input
                  ref={panel.inputRef}
                  type="file"
                  accept=".txt,.csv,.md5,.sha1,.sha256,text/plain,text/csv"
                  aria-label={panel.key === 'a' ? '导入清单 A' : '导入清单 B'}
                  className="hidden"
                  onChange={(event) => {
                    void importInto(event.target.files?.[0], panel.key)
                    event.target.value = ''
                  }}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                  disabled={!panel.value}
                  onClick={() => panel.setValue('')}
                >
                  <Trash2Icon />
                  清空
                </Button>
              </>
            }
          />
        ))}
      </div>

      {ready ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setKindFilter('all')}
              className={cn(
                'rounded-full border px-3 py-1 text-xs transition-colors',
                kindFilter === 'all'
                  ? 'border-primary bg-primary/10 text-foreground'
                  : 'border-border/60 text-muted-foreground hover:text-foreground',
              )}
            >
              全部 {comparison.summary.total}
            </button>
            {KIND_ORDER.filter((kind) => comparison.summary[kind] > 0).map((kind) => (
              <button
                key={kind}
                type="button"
                onClick={() => setKindFilter(kind)}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs transition-colors',
                  kindFilter === kind ? 'border-primary bg-primary/10' : 'hover:opacity-80',
                  KIND_STYLES[kind],
                )}
              >
                {CHANGE_LABELS[kind]} {comparison.summary[kind]}
              </button>
            ))}

            <div className="ml-auto flex flex-wrap items-center gap-2">
              <CopyButton value={report} label="复制报告" />
              <Button
                variant="outline"
                size="sm"
                onClick={() => downloadText(report, 'hash-comparison.txt')}
              >
                <DownloadIcon />
                导出报告
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-border/60">
            <table aria-label="哈希清单比对结果" className="w-full min-w-[760px] text-left text-xs">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">文件</th>
                  <th className="w-[90px] px-3 py-2 font-medium">状态</th>
                  <th className="px-3 py-2 font-medium">清单 A</th>
                  <th className="px-3 py-2 font-medium">清单 B</th>
                  <th className="w-[110px] px-3 py-2 font-medium">大小 A → B</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => (
                  <tr key={row.name} className="border-t border-border/50 align-top">
                    <td className="px-3 py-2 font-mono break-all">{row.name}</td>
                    <td className="px-3 py-2">
                      <span
                        className={cn(
                          'inline-block rounded-full border px-2 py-0.5 text-[10px] whitespace-nowrap',
                          KIND_STYLES[row.kind],
                        )}
                      >
                        {CHANGE_LABELS[row.kind]}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono break-all text-muted-foreground">
                      {row.hashA ?? '—'}
                    </td>
                    <td className="px-3 py-2 font-mono break-all text-muted-foreground">
                      {row.hashB ?? '—'}
                    </td>
                    <td className="px-3 py-2 font-mono whitespace-nowrap text-muted-foreground">
                      {row.sizeA === null && row.sizeB === null
                        ? '—'
                        : `${row.sizeA === null ? '—' : formatBytes(row.sizeA)} → ${
                            row.sizeB === null ? '—' : formatBytes(row.sizeB)
                          }`}
                    </td>
                  </tr>
                ))}
                {visibleRows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                      该分类下没有文件
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <p className="rounded-xl border border-border/60 bg-card/40 px-5 py-4 text-xs text-muted-foreground">
          把两份清单分别粘贴到上面两个输入框（或导入 `.txt` / `.csv` 文件）即可自动比对。
          支持 `md5sum` / `sha256sum` 的输出、本工具导出的 CSV，以及 `文件名 哈希` 的松散格式。
        </p>
      )}

      {textA.trim() || textB.trim() ? (
        <StatGrid>
          <Stat label="清单 A" value={formatCount(parsedA.entries.length)} hint="基线条目数" />
          <Stat label="清单 B" value={formatCount(parsedB.entries.length)} hint="对照条目数" />
          <Stat label="比对算法" value={ready ? algorithmMeta(activeAlgorithm).label : '—'} />
          <Stat
            label="内容变更"
            value={ready ? formatCount(comparison.summary.changed) : '—'}
            hint="同名但哈希不同"
          />
          <Stat
            label="新增 / 缺失"
            value={ready ? `${comparison.summary.added} / ${comparison.summary.removed}` : '—'}
            hint="仅在 B / 仅在 A"
          />
          <Stat
            label="一致"
            value={ready ? formatCount(comparison.summary.unchanged) : '—'}
            hint="内容完全相同"
          />
        </StatGrid>
      ) : null}
    </div>
  )
}
