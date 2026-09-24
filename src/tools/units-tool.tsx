import { useState } from 'react'
import { ArrowLeftRightIcon, EraserIcon } from 'lucide-react'
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
import { Textarea } from '@/components/ui/textarea'
import { CopyButton } from '@/components/copy-button'
import { Stat, StatGrid } from '@/components/stat'
import {
  UNIT_CATEGORIES,
  convert,
  convertAll,
  findCategory,
  findUnit,
  formatUnitValue,
  parseNumericInput,
  type UnitCategory,
  type UnitDef,
} from '@/lib/units'
import { formatCount } from '@/lib/format'
import { cn } from '@/lib/utils'

/** 首次进入的默认分类与默认来源/目标单位：长度 + 千米 → 米。 */
const DEFAULT_CATEGORY_ID = 'length'
const DEFAULT_FROM_ID = 'km'
const DEFAULT_TO_ID = 'm'

/** 下拉与统计里的单位文案：名称 (symbol)。 */
function unitLabel(unit: UnitDef): string {
  return `${unit.name} (${unit.symbol})`
}

export function UnitsTool() {
  // 分类与来源/目标单位
  const [categoryId, setCategoryId] = useState(DEFAULT_CATEGORY_ID)
  const [fromId, setFromId] = useState(DEFAULT_FROM_ID)
  const [toId, setToId] = useState(DEFAULT_TO_ID)
  // 单个数量输入与批量输入（每行一个数字）
  const [valueInput, setValueInput] = useState('1')
  const [batchInput, setBatchInput] = useState('')

  // 分类兜底：即使状态里的 id 失效也不会崩溃
  const category = findCategory(categoryId) ?? UNIT_CATEGORIES[0]
  const fromUnit = findUnit(category, fromId) ?? category.units[0]
  const toUnit = findUnit(category, toId) ?? category.units[0]
  const baseUnit = findUnit(category, category.base) ?? category.units[0]

  // 解析输入：null 表示无效，此时界面进入空状态
  const parsed = parseNumericInput(valueInput)
  const hasValue = parsed !== null
  const result = parsed === null ? null : convert(parsed, fromUnit, toUnit)
  const valueText = parsed === null ? '' : formatUnitValue(parsed)
  const resultText = result === null ? '' : formatUnitValue(result)
  const equation =
    result === null ? '' : `${valueText} ${fromUnit.name} = ${resultText} ${toUnit.name}`

  // 「全部单位」表格的数据，统一走 convertAll
  const allValues = parsed === null ? [] : convertAll(parsed, category, fromUnit.id)

  // 「批量对照」：逐行解析，行数一一对应，无法解析的行显示「—」
  const batchRows = batchInput.trim()
    ? batchInput.split('\n').map((line, index) => {
        const value = parseNumericInput(line)
        return {
          key: `${index}-${line}`,
          index: index + 1,
          source: line.trim() || '—',
          target:
            value === null
              ? '—'
              : `${formatUnitValue(convert(value, fromUnit, toUnit))} ${toUnit.symbol}`,
        }
      })
    : []

  // 切换分类：来源取基准单位，目标取同分类下第一个不同的单位
  const selectCategory = (next: UnitCategory) => {
    const nextFrom = findUnit(next, next.base) ?? next.units[0]
    setCategoryId(next.id)
    setFromId(nextFrom.id)
    setToId(next.units.find((unit) => unit.id !== nextFrom.id)?.id ?? nextFrom.id)
  }

  // 来源与目标重复时自动错开，避免出现「1 米 = 1 米」
  const selectFromUnit = (nextId: string) => {
    setFromId(nextId)
    if (nextId === toId) setToId(fromId)
  }

  const selectToUnit = (nextId: string) => {
    setToId(nextId)
    if (nextId === fromId) setFromId(toId)
  }

  // 交换：把结果变成新的输入，同时互换两个单位
  const swap = () => {
    if (parsed === null || result === null || !Number.isFinite(result)) return
    setValueInput(resultText)
    setFromId(toUnit.id)
    setToId(fromUnit.id)
  }

  const reset = () => {
    setValueInput('1')
    setBatchInput('')
  }

  return (
    <div className="flex flex-col gap-4">
      {/* 顶部选项条：一排可换行的分类按钮 + 数量输入 */}
      <div className="flex flex-col gap-4 rounded-xl border border-border/70 bg-card/40 px-5 py-4">
        <div className="flex flex-col gap-2">
          <Label className="text-xs text-muted-foreground">分类</Label>
          <div className="flex flex-wrap gap-1.5">
            {UNIT_CATEGORIES.map((item) => {
              const active = item.id === category.id
              return (
                <Button
                  key={item.id}
                  variant={active ? 'default' : 'outline'}
                  size="sm"
                  aria-pressed={active}
                  onClick={() => selectCategory(item)}
                >
                  {item.name}
                </Button>
              )
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-start gap-x-5 gap-y-3">
          <div className="flex min-w-[220px] flex-1 flex-col gap-2">
            <Label htmlFor="unit-value" className="text-xs text-muted-foreground">
              数量
            </Label>
            <Input
              id="unit-value"
              value={valueInput}
              onChange={(event) => setValueInput(event.target.value)}
              spellCheck={false}
              inputMode="decimal"
              placeholder="1"
              aria-invalid={!hasValue}
              className={cn('h-9 font-mono text-sm', !hasValue && 'border-destructive/60')}
            />
            <p className="text-[11px] text-muted-foreground">
              支持小数、千分位、下划线与科学计数法，例如 1000 / 1,000 / 1_000 / 1e3
            </p>
            {hasValue ? null : <p className="text-xs text-destructive">请输入有效数字</p>}
          </div>

          <div className="flex w-[220px] flex-col gap-2">
            <Label htmlFor="from-unit" className="text-xs text-muted-foreground">
              单位
            </Label>
            <Select value={fromUnit.id} onValueChange={selectFromUnit}>
              <SelectTrigger id="from-unit" className="w-full" size="sm" aria-label="来源单位">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {category.units.map((unit) => (
                  <SelectItem key={unit.id} value={unit.id}>
                    {unitLabel(unit)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            variant="ghost"
            size="sm"
            className="mt-6 text-muted-foreground"
            disabled={!valueInput && !batchInput}
            onClick={reset}
          >
            <EraserIcon />
            重置
          </Button>
        </div>
      </div>

      {hasValue && result !== null ? (
        <>
          {/* 换算结果：等式 + 目标单位选择 + 交换 */}
          <section className="flex flex-col gap-3 rounded-xl border border-border/70 bg-card/40 p-5">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold">换算结果</h2>
              <Badge variant="outline" className="text-[11px]">
                {category.name}
              </Badge>
              <Badge variant="secondary" className="font-mono text-[11px]">
                {fromUnit.symbol} → {toUnit.symbol}
              </Badge>
            </div>

            <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
              <div className="flex flex-col gap-2">
                <Label htmlFor="to-unit" className="text-xs text-muted-foreground">
                  目标单位
                </Label>
                <Select value={toUnit.id} onValueChange={selectToUnit}>
                  <SelectTrigger id="to-unit" className="w-[220px]" size="sm" aria-label="目标单位">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {category.units.map((unit) => (
                      <SelectItem key={unit.id} value={unit.id}>
                        {unitLabel(unit)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button
                variant="secondary"
                size="sm"
                className="mt-6"
                onClick={swap}
                disabled={!Number.isFinite(result)}
                aria-label="交换输入值与目标单位"
              >
                <ArrowLeftRightIcon />
                交换
              </Button>

              <CopyButton
                value={equation}
                label="复制等式"
                variant="outline"
                size="sm"
                className="mt-6"
              />
            </div>

            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-lg border border-border/60 bg-background/50 px-4 py-4">
              <span className="font-mono text-3xl font-semibold tabular-nums">{valueText}</span>
              <span className="text-sm text-muted-foreground">
                {fromUnit.name}（{fromUnit.symbol}）
              </span>
              <span className="px-1 text-lg text-muted-foreground">=</span>
              <span className="font-mono text-3xl font-semibold tabular-nums text-primary">
                {resultText}
              </span>
              <span className="text-sm text-muted-foreground">
                {toUnit.name}（{toUnit.symbol}）
              </span>
            </div>

            <p className="text-xs text-muted-foreground">
              等式：<code className="font-mono text-foreground">{equation}</code>
            </p>
          </section>

          {/* 全部单位：convertAll 的结果逐行列出 */}
          {allValues.length > 0 ? (
            <section className="flex flex-col gap-3 rounded-xl border border-border/70 bg-card/40 p-5">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-semibold">全部单位</h2>
                <Badge variant="secondary" className="text-[11px]">
                  {formatCount(allValues.length)} 个单位
                </Badge>
                <span className="text-xs text-muted-foreground">
                  来自 {valueText} {fromUnit.name}
                </span>
              </div>

              <div className="overflow-x-auto rounded-lg border border-border/60">
                <table aria-label="全部单位换算结果" className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-muted/40 text-muted-foreground">
                      <th scope="col" className="px-3 py-2 font-medium">
                        名称
                      </th>
                      <th scope="col" className="px-3 py-2 font-medium">
                        symbol
                      </th>
                      <th scope="col" className="px-3 py-2 font-medium">
                        数值
                      </th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">
                        复制
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {allValues.map(({ unit, value }) => (
                      <tr
                        key={unit.id}
                        className={cn(
                          'border-t border-border/50',
                          unit.id === fromUnit.id && 'bg-muted/30',
                        )}
                      >
                        <td className="px-3 py-2">
                          {unit.name}
                          {unit.id === baseUnit.id ? (
                            <span className="ml-2 text-[10px] text-muted-foreground">基准</span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 font-mono text-muted-foreground">{unit.symbol}</td>
                        <td className="px-3 py-2 font-mono tabular-nums">
                          {formatUnitValue(value)}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <CopyButton
                            value={formatUnitValue(value)}
                            label=""
                            aria-label={`复制 ${unit.name} 的换算结果 ${formatUnitValue(value)}`}
                            variant="ghost"
                            size="icon-sm"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {/* 批量对照：每行一个数字，逐行输出到目标单位 */}
          <section className="flex flex-col gap-3 rounded-xl border border-border/70 bg-card/40 p-5">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold">批量对照</h2>
              <Badge variant="outline" className="text-[11px]">
                每行一个数值 · {fromUnit.name} → {toUnit.name}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              每行输入一个数字，下面按行输出换算到「{unitLabel(toUnit)}」的结果，行数一一对应；
              无法解析的行显示「—」。
            </p>
            <Textarea
              id="batch-input"
              value={batchInput}
              onChange={(event) => setBatchInput(event.target.value)}
              spellCheck={false}
              aria-label="批量输入"
              placeholder={'1\n2.5\n1000\n3e6'}
              className="scrollbar-thin min-h-[120px] resize-y bg-background/60 font-mono text-[13px]"
            />

            {batchRows.length > 0 ? (
              <div className="overflow-x-auto rounded-lg border border-border/60">
                <table aria-label="批量对照结果" className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-muted/40 text-muted-foreground">
                      <th scope="col" className="w-12 px-3 py-2 font-medium">
                        行
                      </th>
                      <th scope="col" className="px-3 py-2 font-medium">
                        输入
                      </th>
                      <th scope="col" className="px-3 py-2 font-medium">
                        结果
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {batchRows.map((row) => (
                      <tr key={row.key} className="border-t border-border/50">
                        <td className="px-3 py-2 font-mono text-muted-foreground">{row.index}</td>
                        <td className="px-3 py-2 font-mono">{row.source}</td>
                        <td
                          className={cn(
                            'px-3 py-2 font-mono tabular-nums',
                            row.target === '—' && 'text-destructive',
                          )}
                        >
                          {row.target}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                在上方每行输入一个数字，即可逐行查看换算结果。
              </p>
            )}
          </section>
        </>
      ) : (
        // 空状态：没有有效输入时不渲染结果、单位表、批量对照与统计
        <p className="rounded-xl border border-dashed border-border/70 bg-card/40 px-5 py-6 text-center text-xs text-muted-foreground">
          输入有效数字后，这里会显示换算结果、全部单位与批量对照。
        </p>
      )}

      {hasValue && result !== null ? (
        <StatGrid>
          <Stat
            label="分类"
            value={category.name}
            hint={`共 ${formatCount(UNIT_CATEGORIES.length)} 个分类`}
          />
          <Stat
            label="单位个数"
            value={formatCount(category.units.length)}
            hint={`来源 ${fromUnit.symbol} → 目标 ${toUnit.symbol}`}
          />
          <Stat label="基准单位" value={unitLabel(baseUnit)} />
          <Stat label="输入数值" value={valueText} hint={unitLabel(fromUnit)} />
          <Stat
            label="换算说明"
            value="结果最多 8 位有效数字"
            hint="超出范围自动使用科学计数法"
          />
        </StatGrid>
      ) : null}
    </div>
  )
}
