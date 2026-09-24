import { useMemo, useState } from 'react'
import { EraserIcon } from 'lucide-react'
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
import { CopyButton } from '@/components/copy-button'
import { Stat, StatGrid } from '@/components/stat'
import { CIDR_PRESETS, calculateSubnet, splitSubnet } from '@/lib/subnet'
import { formatCount } from '@/lib/format'
import { cn } from '@/lib/utils'

const PREFIXES = [8, 12, 16, 20, 22, 24, 25, 26, 27, 28, 29, 30, 31, 32]

export function SubnetTool() {
  const [input, setInput] = useState('192.168.1.10')
  const [maskInput, setMaskInput] = useState('255.255.255.0')
  const [mode, setMode] = useState<'cidr' | 'mask'>('cidr')
  const [splitPrefix, setSplitPrefix] = useState(26)

  const result = useMemo(
    () => calculateSubnet(input, mode === 'mask' ? maskInput : undefined),
    [input, maskInput, mode],
  )

  const info = result.ok ? result.info : null

  const split = useMemo(() => {
    if (!info) return { subnets: [], error: null as string | null }
    if (splitPrefix <= info.prefix) return { subnets: [], error: null }
    return splitSubnet(info.cidr, splitPrefix, 64)
  }, [info, splitPrefix])

  const rows = info
    ? [
        { label: '输入地址', value: info.ip },
        { label: '网络地址', value: info.network },
        { label: '广播地址', value: info.broadcast },
        { label: '可用地址范围', value: `${info.firstHost} – ${info.lastHost}` },
        { label: '子网掩码', value: info.netmask },
        { label: '反掩码（通配符）', value: info.wildcard },
        { label: '前缀长度', value: `/${info.prefix}` },
        { label: 'CIDR 表示', value: info.cidr },
        { label: '总地址数', value: formatCount(info.totalAddresses) },
        { label: '可用主机数', value: formatCount(info.usableHosts) },
        { label: '地址类别', value: info.ipClass },
        { label: '私有地址', value: info.isPrivate ? '是（RFC 1918）' : '否' },
        { label: '反向解析区域', value: info.reverseZone },
        { label: 'PTR 记录名', value: info.ptrName },
      ]
    : []

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-x-5 gap-y-3 rounded-xl border border-border/70 bg-card/40 px-5 py-4">
        <div className="flex flex-col gap-2">
          <Label className="text-xs text-muted-foreground">输入方式</Label>
          <Select value={mode} onValueChange={(value) => setMode(value as 'cidr' | 'mask')}>
            <SelectTrigger className="w-[180px]" size="sm" aria-label="输入方式">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="cidr">IP/前缀（192.168.1.10/24）</SelectItem>
              <SelectItem value="mask">IP + 子网掩码</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex min-w-[220px] flex-1 flex-col gap-2">
          <Label htmlFor="ip-input" className="text-xs text-muted-foreground">
            {mode === 'cidr' ? 'IPv4 地址 / CIDR' : 'IPv4 地址'}
          </Label>
          <Input
            id="ip-input"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            spellCheck={false}
            placeholder={mode === 'cidr' ? '192.168.1.10/24' : '192.168.1.10'}
            className={cn('h-9 font-mono text-sm', !result.ok && input && 'border-destructive/60')}
          />
        </div>

        {mode === 'mask' ? (
          <div className="flex w-[190px] flex-col gap-2">
            <Label htmlFor="mask-input" className="text-xs text-muted-foreground">
              子网掩码
            </Label>
            <Input
              id="mask-input"
              value={maskInput}
              onChange={(event) => setMaskInput(event.target.value)}
              spellCheck={false}
              placeholder="255.255.255.0"
              className="h-9 font-mono text-sm"
            />
          </div>
        ) : null}

        <Button
          variant="ghost"
          size="sm"
          className="mb-0.5 text-muted-foreground"
          onClick={() => setInput(mode === 'cidr' ? '192.168.1.10/24' : '192.168.1.10')}
        >
          <EraserIcon />
          重置
        </Button>
      </div>

      {!result.ok ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {result.error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-1.5">
        {CIDR_PRESETS.map((preset) => (
          <Button
            key={preset.cidr}
            variant="outline"
            size="sm"
            className="font-mono text-[11px]"
            title={preset.note}
            onClick={() => {
              setMode('cidr')
              setInput(preset.cidr)
            }}
          >
            {preset.cidr}
          </Button>
        ))}
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
        <section className="flex flex-col gap-3 rounded-xl border border-border/70 bg-card/40 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold">计算结果</h2>
            {info ? (
              <>
                <Badge variant="secondary" className="font-mono text-[11px]">
                  {info.cidr}
                </Badge>
                {info.isPrivate ? (
                  <Badge variant="outline" className="text-[11px]">
                    私有地址
                  </Badge>
                ) : null}
                {info.isLoopback ? (
                  <Badge variant="outline" className="text-[11px]">
                    回环
                  </Badge>
                ) : null}
                {info.isLinkLocal ? (
                  <Badge variant="outline" className="text-[11px]">
                    链路本地
                  </Badge>
                ) : null}
                {info.isMulticast ? (
                  <Badge variant="outline" className="text-[11px]">
                    组播
                  </Badge>
                ) : null}
              </>
            ) : null}
          </div>

          {info ? (
            <>
              <dl className="grid gap-2 sm:grid-cols-2">
                {rows.map((row) => (
                  <div
                    key={row.label}
                    className="flex items-center gap-3 rounded-lg border border-border/60 bg-background/50 px-3 py-2"
                  >
                    <dt className="w-[110px] shrink-0 text-[11px] text-muted-foreground">{row.label}</dt>
                    <dd className="min-w-0 flex-1 font-mono text-xs break-all">{row.value}</dd>
                    <CopyButton value={row.value} label="" variant="ghost" size="icon-xs" />
                  </div>
                ))}
              </dl>

              <div className="flex flex-col gap-2 rounded-lg border border-border/60 bg-background/50 px-3 py-2">
                <span className="text-[11px] text-muted-foreground">二进制</span>
                <code className="font-mono text-[11px] break-all">IP&nbsp;&nbsp;{info.ipBinary}</code>
                <code className="font-mono text-[11px] break-all">掩码 {info.maskBinary}</code>
              </div>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">输入合法的 IPv4 地址后显示结果</p>
          )}
        </section>

        <section className="flex flex-col gap-3 rounded-xl border border-border/70 bg-card/40 p-5">
          <h2 className="text-sm font-semibold">进一步划分子网</h2>
          <div className="flex items-center gap-2">
            <Label htmlFor="split-prefix" className="text-xs text-muted-foreground">
              新前缀
            </Label>
            <Select value={String(splitPrefix)} onValueChange={(value) => setSplitPrefix(Number(value))}>
              <SelectTrigger id="split-prefix" className="w-[120px]" size="sm" aria-label="新前缀长度">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PREFIXES.map((prefix) => (
                  <SelectItem key={prefix} value={String(prefix)}>
                    /{prefix}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {!info ? (
            <p className="text-xs text-muted-foreground">先输入一个网段</p>
          ) : splitPrefix <= info.prefix ? (
            <p className="text-xs text-muted-foreground">
              新前缀需要大于当前的 /{info.prefix}
            </p>
          ) : split.subnets.length === 0 ? (
            <p className="text-xs text-destructive">{split.error ?? '无法划分'}</p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                可划分出 {formatCount(2 ** (splitPrefix - info.prefix))} 个子网
                {split.subnets.length < 2 ** (splitPrefix - info.prefix) ? '（仅列出前 64 个）' : ''}
                ，每个含 {formatCount(2 ** (32 - splitPrefix))} 个地址
              </p>
              <div className="scrollbar-thin flex max-h-[240px] flex-col gap-1 overflow-y-auto rounded-lg border border-border/60 p-2">
                {split.subnets.map((subnet) => (
                  <code key={subnet} className="font-mono text-[11px]">
                    {subnet}
                  </code>
                ))}
              </div>
              <CopyButton value={split.subnets.join('\n')} label="复制全部子网" variant="secondary" />
            </>
          )}
        </section>
      </div>

      <StatGrid>
        <Stat label="CIDR" value={info ? info.cidr : '—'} />
        <Stat label="掩码" value={info ? info.netmask : '—'} />
        <Stat label="可用主机" value={info ? formatCount(info.usableHosts) : '—'} hint={info ? `共 ${formatCount(info.totalAddresses)} 个地址` : undefined} />
        <Stat label="地址类别" value={info ? info.ipClass : '—'} />
        <Stat label="私有地址" value={info ? (info.isPrivate ? '是' : '否') : '—'} />
        <Stat label="地址范围" value={info ? `${info.firstHost} – ${info.lastHost}` : '—'} />
      </StatGrid>
    </div>
  )
}
