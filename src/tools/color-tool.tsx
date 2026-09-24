import { useMemo, useState } from 'react'
import { CheckIcon, DicesIcon, XIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CopyButton } from '@/components/copy-button'
import { Stat, StatGrid } from '@/components/stat'
import {
  colorScale,
  complementary,
  contrastVerdict,
  formatHsl,
  formatHsv,
  formatRgb,
  harmony,
  harmonyKinds,
  parseColor,
  readableForeground,
  rgbToHex,
  rgbToHsl,
  rgbToHsv,
  type HarmonyKind,
  type RGB,
} from '@/lib/color'
import { cn } from '@/lib/utils'

const DEFAULT_HEX = '#3b82f6'

interface SwatchProps {
  hex: string
  label: string
}

function Swatch({ hex, label }: SwatchProps) {
  return (
    <div className="flex flex-col gap-1">
      <div
        className="h-12 w-full rounded-md border border-border/60"
        style={{ backgroundColor: hex }}
        title={hex}
      />
      <span className="text-center font-mono text-[10px] text-muted-foreground">{label}</span>
    </div>
  )
}

export function ColorTool() {
  const [input, setInput] = useState(DEFAULT_HEX)
  const [foreground, setForeground] = useState('#ffffff')
  const [background, setBackground] = useState(DEFAULT_HEX)
  const [harmonyKind, setHarmonyKind] = useState<HarmonyKind>('analogous')

  const parsed = useMemo(() => parseColor(input), [input])
  const rgb: RGB | null = parsed?.rgb ?? null

  const formats = useMemo(() => {
    if (!rgb) return []
    const hsl = rgbToHsl(rgb)
    const hsv = rgbToHsv(rgb)
    const alpha = parsed?.alpha ?? 1
    const hex8 = `${rgbToHex(rgb)}${Math.round(alpha * 255)
      .toString(16)
      .padStart(2, '0')}`
    return [
      { label: 'HEX', value: rgbToHex(rgb) },
      { label: 'HEX8（含透明度）', value: alpha < 1 ? hex8 : `${hex8}（不透明）` },
      { label: 'RGB', value: `${rgb.r}, ${rgb.g}, ${rgb.b}` },
      { label: 'CSS rgb()', value: formatRgb(rgb, alpha) },
      { label: 'CSS hsl()', value: formatHsl(hsl, alpha) },
      { label: 'HSL', value: `${hsl.h.toFixed(1)}°, ${hsl.s.toFixed(1)}%, ${hsl.l.toFixed(1)}%` },
      { label: 'HSV', value: formatHsv(hsv) },
      { label: '亮度（相对）', value: (rgb.r * 0.2126 + rgb.g * 0.7152 + rgb.b * 0.0722).toFixed(1) },
    ]
  }, [rgb, parsed?.alpha])

  const scale = useMemo(() => (rgb ? colorScale(rgb) : []), [rgb])
  const harmonyColors = useMemo(() => (rgb ? harmony(rgb, harmonyKind) : []), [rgb, harmonyKind])

  const fgRgb = useMemo(() => parseColor(foreground)?.rgb ?? null, [foreground])
  const bgRgb = useMemo(() => parseColor(background)?.rgb ?? null, [background])
  const verdict = useMemo(
    () => (fgRgb && bgRgb ? contrastVerdict(fgRgb, bgRgb) : null),
    [fgRgb, bgRgb],
  )

  const randomize = () => {
    const bytes = new Uint8Array(3)
    globalThis.crypto.getRandomValues(bytes)
    const hex = `#${[...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')}`
    setInput(hex)
  }

  return (
    <div className="flex flex-col gap-4">
      {/* 输入与预览 */}
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="flex flex-col gap-3 rounded-xl border border-border/70 bg-card/40 px-5 py-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex min-w-[220px] flex-1 flex-col gap-2">
              <Label htmlFor="color-input" className="text-xs text-muted-foreground">
                颜色输入
              </Label>
              <Input
                id="color-input"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="#3b82f6 / rgb(59,130,246) / hsl(217,91%,60%)"
                spellCheck={false}
                className={cn('h-10 font-mono text-sm', !parsed && input.trim() && 'border-destructive/60')}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="color-picker" className="text-xs text-muted-foreground">
                取色器
              </Label>
              <input
                id="color-picker"
                type="color"
                value={rgb ? rgbToHex(rgb) : DEFAULT_HEX}
                onChange={(event) => setInput(event.target.value)}
                className="h-10 w-[70px] cursor-pointer rounded-md border border-border/70 bg-transparent"
              />
            </div>
            <Button variant="outline" size="sm" className="mb-0.5" onClick={randomize}>
              <DicesIcon />
              随机
            </Button>
          </div>

          {!parsed && input.trim() ? (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              无法识别的颜色写法，支持 #rgb、#rrggbb、#rrggbbaa、rgb()、rgba()、hsl()、hsla()
            </p>
          ) : null}

          <div
            className="flex h-24 items-center justify-center rounded-lg border border-border/60 text-sm font-medium"
            style={{ backgroundColor: rgb ? rgbToHex(rgb) : 'transparent', color: rgb ? readableForeground(rgb) : undefined }}
          >
            {rgb ? `示例文字 · ${rgbToHex(rgb)}` : '输入颜色后显示预览'}
          </div>
        </div>

        <div className="flex flex-col gap-2 rounded-xl border border-border/70 bg-card/40 p-4">
          <h2 className="text-sm font-semibold">色阶（100–900）</h2>
          <div className="grid grid-cols-9 gap-1">
            {scale.map((item) => (
              <div key={item.step} className="flex flex-col gap-1">
                <div
                  className="h-10 rounded border border-border/50"
                  style={{ backgroundColor: item.hex }}
                  title={`${item.step} · ${item.hex}`}
                />
                <span className="text-center text-[9px] text-muted-foreground">{item.step}</span>
              </div>
            ))}
          </div>
          <div className="mt-1 flex flex-wrap gap-2">
            <CopyButton
              value={scale.map((item) => `${item.step}: ${item.hex}`).join('\n')}
              label="复制色阶"
              variant="secondary"
            />
            <CopyButton
              value={rgb ? `--color-500: ${rgbToHex(rgb)};` : ''}
              label="复制 CSS 变量"
              variant="ghost"
            />
          </div>
        </div>
      </div>

      {/* 格式列表 */}
      <section className="flex flex-col gap-3 rounded-xl border border-border/70 bg-card/40 p-5">
        <h2 className="text-sm font-semibold">各格式表示</h2>
        <dl className="grid gap-2 sm:grid-cols-2">
          {formats.map((item) => (
            <div
              key={item.label}
              className="flex items-center gap-3 rounded-lg border border-border/60 bg-background/50 px-3 py-2"
            >
              <dt className="w-[120px] shrink-0 text-[11px] text-muted-foreground">{item.label}</dt>
              <dd className="min-w-0 flex-1 font-mono text-xs break-all">{item.value}</dd>
              <CopyButton value={item.value} label="" variant="ghost" size="icon-xs" />
            </div>
          ))}
        </dl>
      </section>

      {/* 配色 */}
      <section className="flex flex-col gap-3 rounded-xl border border-border/70 bg-card/40 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold">配色方案</h2>
          <div className="flex flex-wrap gap-1.5">
            {harmonyKinds.map((kind) => (
              <Button
                key={kind.value}
                variant={harmonyKind === kind.value ? 'default' : 'outline'}
                size="sm"
                onClick={() => setHarmonyKind(kind.value)}
              >
                {kind.label}
              </Button>
            ))}
          </div>
          <Badge variant="outline" className="ml-auto font-mono text-[11px]">
            互补色 {rgb ? complementary(rgb) : '—'}
          </Badge>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {harmonyColors.map((hex, index) => (
            <Swatch key={`${hex}-${index}`} hex={hex} label={hex} />
          ))}
        </div>
      </section>

      {/* 对比度 */}
      <section className="flex flex-col gap-3 rounded-xl border border-border/70 bg-card/40 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold">WCAG 对比度检查</h2>
          <p className="text-xs text-muted-foreground">正文 AA ≥ 4.5:1，AAA ≥ 7:1</p>
          {verdict ? (
            <Badge
              variant="outline"
              className={cn(
                'ml-auto font-mono text-[11px]',
                verdict.normalAA
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                  : 'border-destructive/40 bg-destructive/10 text-destructive',
              )}
            >
              {verdict.ratio.toFixed(2)}:1
            </Badge>
          ) : null}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="fg-color" className="text-xs text-muted-foreground">
              文字颜色
            </Label>
            <div className="flex gap-2">
              <Input
                id="fg-color"
                value={foreground}
                onChange={(event) => setForeground(event.target.value)}
                className="h-9 font-mono text-xs"
                spellCheck={false}
              />
              <input
                type="color"
                aria-label="文字颜色取色器"
                value={fgRgb ? rgbToHex(fgRgb) : '#ffffff'}
                onChange={(event) => setForeground(event.target.value)}
                className="h-9 w-[52px] cursor-pointer rounded-md border border-border/70 bg-transparent"
              />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="bg-color" className="text-xs text-muted-foreground">
              背景颜色
            </Label>
            <div className="flex gap-2">
              <Input
                id="bg-color"
                value={background}
                onChange={(event) => setBackground(event.target.value)}
                className="h-9 font-mono text-xs"
                spellCheck={false}
              />
              <input
                type="color"
                aria-label="背景颜色取色器"
                value={bgRgb ? rgbToHex(bgRgb) : DEFAULT_HEX}
                onChange={(event) => setBackground(event.target.value)}
                className="h-9 w-[52px] cursor-pointer rounded-md border border-border/70 bg-transparent"
              />
            </div>
          </div>
        </div>

        <div
          className="flex flex-col gap-1 rounded-lg border border-border/60 px-4 py-3"
          style={{
            backgroundColor: bgRgb ? rgbToHex(bgRgb) : 'transparent',
            color: fgRgb ? rgbToHex(fgRgb) : undefined,
          }}
        >
          <span className="text-base">正文示例：这段文字是否符合对比度要求？</span>
          <span className="text-xl font-semibold">大号文字示例</span>
        </div>

        {verdict ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(
              [
                ['正文 AA (4.5:1)', verdict.normalAA],
                ['正文 AAA (7:1)', verdict.normalAAA],
                ['大字 AA (3:1)', verdict.largeAA],
                ['大字 AAA (4.5:1)', verdict.largeAAA],
              ] as Array<[string, boolean]>
            ).map(([label, pass]) => (
              <div
                key={label}
                className={cn(
                  'flex items-center gap-2 rounded-lg border px-3 py-2 text-xs',
                  pass
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                    : 'border-destructive/40 bg-destructive/10 text-destructive',
                )}
              >
                {pass ? <CheckIcon className="size-3.5" /> : <XIcon className="size-3.5" />}
                {label}
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <StatGrid>
        <Stat label="HEX" value={rgb ? rgbToHex(rgb) : '—'} />
        <Stat label="RGB" value={rgb ? `${rgb.r}, ${rgb.g}, ${rgb.b}` : '—'} />
        <Stat label="色相" value={rgb ? `${rgbToHsl(rgb).h.toFixed(0)}°` : '—'} hint="H" />
        <Stat label="饱和度" value={rgb ? `${rgbToHsl(rgb).s.toFixed(0)}%` : '—'} hint="S" />
        <Stat label="亮度" value={rgb ? `${rgbToHsl(rgb).l.toFixed(0)}%` : '—'} hint="L" />
        <Stat
          label="对比度"
          value={verdict ? `${verdict.ratio.toFixed(2)}:1` : '—'}
          hint={verdict ? (verdict.normalAA ? '满足正文 AA' : '不满足正文 AA') : '设置前景与背景'}
        />
      </StatGrid>
    </div>
  )
}
