import { useMemo, useState } from 'react'
import { EraserIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { CopyButton } from '@/components/copy-button'
import { Stat, StatGrid } from '@/components/stat'
import {
  COMMON_PERMISSIONS,
  OWNER_LABELS,
  applySymbolicChange,
  emptyState,
  fromOctal,
  parseSymbolicChange,
  toCommand,
  toOctal,
  toSymbolic,
  type ChmodOwner,
  type ChmodState,
} from '@/lib/chmod'
import { cn } from '@/lib/utils'

const OWNERS: ChmodOwner[] = ['user', 'group', 'other']
const BITS: Array<{ key: 'read' | 'write' | 'execute'; char: string; label: string }> = [
  { key: 'read', char: 'r', label: '读' },
  { key: 'write', char: 'w', label: '写' },
  { key: 'execute', char: 'x', label: '执行' },
]

export function ChmodTool() {
  const [state, setState] = useState<ChmodState>(() => fromOctal('755')!)
  const [octalInput, setOctalInput] = useState('755')
  const [symbolicInput, setSymbolicInput] = useState('')
  const [symbolicError, setSymbolicError] = useState<string | null>(null)

  const octal = useMemo(() => toOctal(state), [state])
  const symbolic = useMemo(() => toSymbolic(state), [state])

  const updateFromOctal = (value: string) => {
    setOctalInput(value)
    const parsed = fromOctal(value)
    if (parsed) setState(parsed)
  }

  const toggleBit = (owner: ChmodOwner, bit: 'read' | 'write' | 'execute') => {
    setState((current) => {
      const next: ChmodState = {
        ...current,
        [owner]: { ...current[owner], [bit]: !current[owner][bit] },
      }
      setOctalInput(toOctal(next))
      return next
    })
  }

  const toggleSpecial = (key: 'setuid' | 'setgid' | 'sticky') => {
    setState((current) => {
      const next = { ...current, [key]: !current[key] }
      setOctalInput(toOctal(next))
      return next
    })
  }

  const applySymbolic = () => {
    const { error } = parseSymbolicChange(symbolicInput)
    if (error) {
      setSymbolicError(error)
      return
    }
    setSymbolicError(null)
    setState((current) => {
      const next = applySymbolicChange(current, symbolicInput)
      setOctalInput(toOctal(next))
      return next
    })
    setSymbolicInput('')
  }

  const setPreset = (value: string) => {
    const parsed = fromOctal(value)
    if (!parsed) return
    setState(parsed)
    setOctalInput(value)
  }

  const octalValid = fromOctal(octalInput) !== null

  return (
    <div className="flex flex-col gap-4">
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* 勾选矩阵 */}
        <section className="flex flex-col gap-4 rounded-xl border border-border/70 bg-card/40 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold">按位勾选</h2>
            <Badge variant="secondary" className="ml-auto font-mono">
              {octal}
            </Badge>
          </div>

          <div className="flex flex-col gap-3">
            {OWNERS.map((owner) => (
              <div key={owner} className="flex items-center gap-3">
                <span className="w-[70px] shrink-0 text-xs text-muted-foreground">{OWNER_LABELS[owner]}</span>
                <div className="flex gap-1.5">
                  {BITS.map((bit) => {
                    const active = state[owner][bit.key]
                    return (
                      <button
                        key={bit.key}
                        type="button"
                        aria-pressed={active}
                        aria-label={`${OWNER_LABELS[owner]} ${bit.label}`}
                        onClick={() => toggleBit(owner, bit.key)}
                        className={cn(
                          'flex size-9 items-center justify-center rounded-md border font-mono text-sm transition-colors',
                          active
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border/70 text-muted-foreground hover:bg-accent',
                        )}
                      >
                        {bit.char}
                      </button>
                    )
                  })}
                </div>
                <span className="ml-2 font-mono text-xs text-muted-foreground">
                  {state[owner].read ? 'r' : '-'}
                  {state[owner].write ? 'w' : '-'}
                  {state[owner].execute ? 'x' : '-'}
                </span>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-2 border-t border-border/60 pt-3">
            <span className="text-xs text-muted-foreground">特殊位</span>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              <div className="flex items-center gap-2">
                <Switch id="setuid" checked={state.setuid} onCheckedChange={() => toggleSpecial('setuid')} />
                <Label htmlFor="setuid" className="text-xs">
                  SUID（4）
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch id="setgid" checked={state.setgid} onCheckedChange={() => toggleSpecial('setgid')} />
                <Label htmlFor="setgid" className="text-xs">
                  SGID（2）
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch id="sticky" checked={state.sticky} onCheckedChange={() => toggleSpecial('sticky')} />
                <Label htmlFor="sticky" className="text-xs">
                  Sticky（1）
                </Label>
              </div>
            </div>
          </div>
        </section>

        {/* 输入输出 */}
        <div className="flex flex-col gap-4">
          <section className="flex flex-col gap-3 rounded-xl border border-border/70 bg-card/40 p-5">
            <h2 className="text-sm font-semibold">八进制输入</h2>
            <Input
              value={octalInput}
              onChange={(event) => updateFromOctal(event.target.value)}
              spellCheck={false}
              aria-label="八进制权限"
              className={cn('h-10 font-mono text-base', !octalValid && octalInput && 'border-destructive/60')}
            />
            {!octalValid && octalInput ? (
              <p className="text-xs text-destructive">需要 3–4 位 0–7 的数字，例如 755、0644、4755</p>
            ) : null}
            <pre className="m-0 rounded-lg border border-border/60 bg-background/60 px-3 py-2 font-mono text-lg">
              {symbolic}
            </pre>
            <div className="flex flex-wrap gap-1.5">
              {['644', '600', '755', '700', '775', '664', '777', '4755', '2775', '1777'].map((value) => (
                <Button
                  key={value}
                  variant={octal === value ? 'default' : 'outline'}
                  size="sm"
                  className="font-mono"
                  onClick={() => setPreset(value)}
                >
                  {value}
                </Button>
              ))}
            </div>
          </section>

          <section className="flex flex-col gap-3 rounded-xl border border-border/70 bg-card/40 p-5">
            <h2 className="text-sm font-semibold">符号增量</h2>
            <div className="flex gap-2">
              <Input
                value={symbolicInput}
                onChange={(event) => {
                  setSymbolicInput(event.target.value)
                  setSymbolicError(null)
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') applySymbolic()
                }}
                spellCheck={false}
                placeholder="u+x、go-w、a=r、u+s"
                aria-label="符号权限增量"
                className="h-9 font-mono text-xs"
              />
              <Button size="sm" onClick={applySymbolic} disabled={!symbolicInput.trim()}>
                应用
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                onClick={() => {
                  setState(emptyState())
                  setOctalInput('000')
                }}
              >
                <EraserIcon />
                清零
              </Button>
            </div>
            {symbolicError ? <p className="text-xs text-destructive">{symbolicError}</p> : null}
            <p className="text-[11px] text-muted-foreground">
              在 <span className="font-mono">{symbolic}</span> 基础上执行 <span className="font-mono">{symbolicInput || '…'}</span>
            </p>
          </section>

          <section className="flex flex-col gap-3 rounded-xl border border-border/70 bg-card/40 p-5">
            <h2 className="text-sm font-semibold">可直接使用</h2>
            <div className="flex flex-wrap items-center gap-2">
              <code className="rounded-md border border-border/60 bg-background/60 px-3 py-2 font-mono text-sm">
                {toCommand(state, 'file')}
              </code>
              <CopyButton value={toCommand(state, 'file')} label="复制命令" />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <code className="rounded-md border border-border/60 bg-background/60 px-3 py-2 font-mono text-sm">
                {toCommand(state, 'dir/')}
              </code>
              <CopyButton value={toCommand(state, 'dir/')} label="复制（目录）" variant="secondary" />
            </div>
            <div className="flex flex-wrap gap-2">
              <CopyButton value={octal} label="复制八进制" variant="secondary" />
              <CopyButton value={symbolic} label="复制 rwx" variant="secondary" />
            </div>
          </section>
        </div>
      </div>

      <section className="flex flex-col gap-3 rounded-xl border border-border/70 bg-card/40 p-5">
        <h2 className="text-sm font-semibold">常见权限速查</h2>
        <div className="overflow-x-auto rounded-lg border border-border/60">
          <table aria-label="常见权限含义" className="w-full min-w-[560px] text-left text-xs">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th className="w-[80px] px-3 py-2 font-medium">八进制</th>
                <th className="w-[130px] px-3 py-2 font-medium">rwx</th>
                <th className="px-3 py-2 font-medium">含义</th>
                <th className="w-[60px] px-3 py-2 font-medium">套用</th>
              </tr>
            </thead>
            <tbody>
              {COMMON_PERMISSIONS.map((item) => (
                <tr key={item.octal} className="border-t border-border/50">
                  <td className="px-3 py-2 font-mono">{item.octal}</td>
                  <td className="px-3 py-2 font-mono text-muted-foreground">{item.symbolic}</td>
                  <td className="px-3 py-2 text-muted-foreground">{item.meaning}</td>
                  <td className="px-3 py-2">
                    <Button variant="ghost" size="xs" onClick={() => setPreset(item.octal)}>
                      套用
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <StatGrid>
        <Stat label="八进制" value={octal} />
        <Stat label="rwx" value={symbolic} />
        <Stat label="命令" value={toCommand(state, 'file')} />
        <Stat
          label="特殊位"
          value={
            [state.setuid ? 'SUID' : null, state.setgid ? 'SGID' : null, state.sticky ? 'Sticky' : null]
              .filter(Boolean)
              .join(' + ') || '无'
          }
        />
        <Stat
          label="可执行文件数"
          value={String(OWNERS.filter((owner) => state[owner].execute).length)}
          hint="含 x 位的身份数"
        />
        <Stat label="状态" value={octalValid ? '格式合法' : '输入非法'} />
      </StatGrid>
    </div>
  )
}
