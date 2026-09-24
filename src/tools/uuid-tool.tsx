import { useMemo, useState } from 'react'
import { DicesIcon, DownloadIcon, RefreshCwIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CopyButton } from '@/components/copy-button'
import { IoPanel } from '@/components/io-panel'
import { Stat, StatGrid } from '@/components/stat'
import { useHydrated } from '@/hooks/use-hydrated'
import { downloadText, formatCount } from '@/lib/format'
import {
  buildCharset,
  entropyBits,
  randomString,
  strengthLabel,
  uuidV4,
  type CharsetOptions,
} from '@/lib/random'
import { cn } from '@/lib/utils'

type Mode = 'uuid' | 'string'

const STRENGTH_STYLES = {
  weak: 'border-destructive/40 bg-destructive/10 text-destructive',
  fair: 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400',
  good: 'border-sky-500/40 bg-sky-500/10 text-sky-600 dark:text-sky-400',
  strong: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
} as const

export function UuidTool() {
  const hydrated = useHydrated()
  const [mode, setMode] = useState<Mode>('uuid')
  const [count, setCount] = useState(5)
  const [seed, setSeed] = useState(0)
  const [uppercase, setUppercase] = useState(false)
  const [hyphens, setHyphens] = useState(true)
  const [length, setLength] = useState(16)
  const [charset, setCharset] = useState<CharsetOptions>({
    lower: true,
    upper: true,
    digits: true,
    symbols: false,
  })

  const safeCount = Math.min(Math.max(Math.trunc(count) || 1, 1), 500)
  const safeLength = Math.min(Math.max(Math.trunc(length) || 1, 4), 128)

  /**
   * 随机结果必须在 hydration 之后才生成，否则服务端预渲染的内容与客户端不一致。
   * useMemo 依赖 hydrated：hydration 首次渲染取 server 快照（false）→ 与预渲染一致，
   * 客户端接管后自动重算，全程不需要在 effect 里 setState。
   */
  const items = useMemo(() => {
    void seed // 依赖 seed 以支持「重新生成」
    if (!hydrated) return []
    if (mode === 'uuid') {
      return Array.from({ length: safeCount }, () => uuidV4({ uppercase, hyphens }))
    }
    const alphabet = buildCharset(charset)
    return Array.from({ length: safeCount }, () => randomString(safeLength, alphabet))
  }, [hydrated, mode, seed, safeCount, uppercase, hyphens, safeLength, charset])

  const output = items.join('\n')
  const alphabetSize = mode === 'uuid' ? 16 : buildCharset(charset).length
  const bits = mode === 'uuid' ? 122 : entropyBits(safeLength, alphabetSize)
  const strength = strengthLabel(bits)
  const regenerate = () => setSeed((current) => current + 1)

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-4 rounded-xl border border-border/70 bg-card/40 px-5 py-4">
        <div className="flex flex-col gap-2">
          <Label className="text-xs text-muted-foreground">生成数量</Label>
          <Input
            type="number"
            min={1}
            max={500}
            value={count}
            onChange={(event) => setCount(Number(event.target.value))}
            className="h-8 w-[100px] text-xs"
            aria-label="生成数量"
          />
        </div>

        {mode === 'uuid' ? (
          <>
            <div className="flex items-center gap-2 pb-1.5">
              <Switch id="uuid-upper" checked={uppercase} onCheckedChange={setUppercase} />
              <Label htmlFor="uuid-upper" className="text-xs text-muted-foreground">
                大写
              </Label>
            </div>
            <div className="flex items-center gap-2 pb-1.5">
              <Switch id="uuid-hyphen" checked={hyphens} onCheckedChange={setHyphens} />
              <Label htmlFor="uuid-hyphen" className="text-xs text-muted-foreground">
                保留连字符
              </Label>
            </div>
          </>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              <Label className="text-xs text-muted-foreground">长度（4–128）</Label>
              <Input
                type="number"
                min={4}
                max={128}
                value={length}
                onChange={(event) => setLength(Number(event.target.value))}
                className="h-8 w-[100px] text-xs"
                aria-label="随机字符串长度"
              />
            </div>
            {(
              [
                ['lower', '小写 a-z'],
                ['upper', '大写 A-Z'],
                ['digits', '数字 0-9'],
                ['symbols', '符号 !@#'],
              ] as Array<[keyof CharsetOptions, string]>
            ).map(([key, label]) => (
              <div key={key} className="flex items-center gap-2 pb-1.5">
                <Switch
                  id={`charset-${key}`}
                  checked={charset[key]}
                  onCheckedChange={(checked) => setCharset((current) => ({ ...current, [key]: checked }))}
                />
                <Label htmlFor={`charset-${key}`} className="text-xs text-muted-foreground">
                  {label}
                </Label>
              </div>
            ))}
          </>
        )}

        <Button size="sm" className="ml-auto" onClick={regenerate} disabled={!hydrated}>
          <RefreshCwIcon />
          重新生成
        </Button>
      </div>

      <Tabs value={mode} onValueChange={(value) => setMode(value as Mode)} className="gap-4">
        <TabsList className="w-full max-w-xs">
          <TabsTrigger value="uuid" className="gap-1.5">
            <DicesIcon />
            UUID v4
          </TabsTrigger>
          <TabsTrigger value="string" className="gap-1.5">
            <DicesIcon />
            随机字符串
          </TabsTrigger>
        </TabsList>

        <TabsContent value="uuid">
          <p className="text-xs text-muted-foreground">
            UUID v4 由 122 位随机数构成，格式为 8-4-4-4-12 共 36 个字符，适合数据库主键、请求追踪 ID 与文件名。
          </p>
        </TabsContent>
        <TabsContent value="string">
          <p className="text-xs text-muted-foreground">
            按所选长度与字符集生成随机密码或测试数据，使用浏览器内置的 crypto.getRandomValues，不是 Math.random。
          </p>
        </TabsContent>
      </Tabs>

      <IoPanel
        title={mode === 'uuid' ? 'UUID 列表' : '随机字符串列表'}
        description={items.length > 0 ? `已生成 ${formatCount(items.length)} 项` : '正在生成…'}
        action={
          <Badge variant="outline" className={cn('text-[11px]', STRENGTH_STYLES[strength.tone])}>
            熵约 {bits} bit · {strength.label}
          </Badge>
        }
        value={output}
        readOnly
        placeholder="点击「重新生成」生成内容"
        textareaClassName="min-h-[220px]"
        footer={
          <>
            <CopyButton value={output} label="复制全部" />
            <Button
              variant="outline"
              size="sm"
              disabled={!output}
              onClick={() => downloadText(output, mode === 'uuid' ? 'uuids.txt' : 'random-strings.txt')}
            >
              <DownloadIcon />
              下载
            </Button>
          </>
        }
      />

      <StatGrid>
        <Stat label="模式" value={mode === 'uuid' ? 'UUID v4' : '随机字符串'} />
        <Stat label="数量" value={formatCount(items.length)} />
        <Stat label="单项长度" value={mode === 'uuid' ? (hyphens ? '36' : '32') : String(safeLength)} />
        <Stat label="字符集大小" value={formatCount(alphabetSize)} hint={mode === 'uuid' ? '十六进制' : '自定义'} />
        <Stat label="熵" value={`${bits} bit`} hint="理论随机性" />
        <Stat label="随机源" value="getRandomValues" hint="密码学安全" />
      </StatGrid>
    </div>
  )
}
