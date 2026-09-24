import { useMemo, useState } from 'react'
import { CalculatorIcon, EraserIcon, SparklesIcon, Trash2Icon, TriangleAlertIcon } from 'lucide-react'
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
import {
  DEFAULT_MATH_OPTIONS,
  MATH_CONSTANTS,
  MATH_FUNCTIONS,
  MATH_FUNCTION_NAMES,
  MATH_SAMPLES,
  evaluateMath,
  type AngleMode,
} from '@/lib/math-eval'
import { formatCount } from '@/lib/format'

/** 精度候选：直接对应 evaluateMath 的 precision 选项 */
const PRECISION_CHOICES: ReadonlyArray<{ value: number; label: string }> = [
  { value: 6, label: '6 位有效数字' },
  { value: 10, label: '10 位' },
  { value: 12, label: '12 位（默认）' },
  { value: 15, label: '15 位' },
]

/** 函数中文说明；未收录的函数统一显示「—」 */
const FUNCTION_NOTES: Record<string, string> = {
  sin: '正弦（入参按当前角度制解释）',
  cos: '余弦（入参按当前角度制解释）',
  tan: '正切（入参按当前角度制解释）',
  asin: '反正弦（结果按当前角度制输出）',
  acos: '反余弦（结果按当前角度制输出）',
  atan: '反正切（结果按当前角度制输出）',
  atan2: '两参数反正切 atan2(y, x)',
  sinh: '双曲正弦',
  cosh: '双曲余弦',
  tanh: '双曲正切',
  sqrt: '平方根',
  cbrt: '立方根',
  abs: '绝对值',
  ln: '自然对数（以 e 为底）',
  log: '对数：默认以 10 为底，log(x, b) 可指定底数',
  log2: '以 2 为底的对数',
  log10: '以 10 为底的对数',
  exp: 'e 的幂',
  floor: '向下取整',
  ceil: '向上取整',
  round: '四舍五入，round(x, n) 可指定小数位',
  trunc: '截断取整（丢弃小数部分）',
  sign: '符号函数（-1 / 0 / 1）',
  min: '取最小值',
  max: '取最大值',
  pow: '幂运算 pow(底数, 指数)',
  hypot: '平方和的平方根',
  gcd: '最大公约数',
  lcm: '最小公倍数',
  fact: '阶乘（非负整数）',
}

/** 需要展示的内置常量 */
const CONSTANT_NOTES: ReadonlyArray<{ name: string; note: string }> = [
  { name: 'pi', note: '圆周率 π' },
  { name: 'e', note: '自然常数 e' },
  { name: 'tau', note: '圆周常数 τ = 2π' },
]

/** 历史记录上限 */
const HISTORY_LIMIT = 20

/** 数值展示：整数原样输出，小数按 en-US 分组保留 12 位，非有限值显示 Infinity */
function formatValue(value: number): string {
  if (Number.isNaN(value)) return 'NaN'
  if (!Number.isFinite(value)) return value > 0 ? 'Infinity' : '-Infinity'
  if (Number.isInteger(value)) return String(value)
  return value.toLocaleString('en-US', { maximumFractionDigits: 12 })
}

/** 结果类型：整数 / 小数 / 科学计数法 */
function valueKind(value: number): string {
  if (!Number.isFinite(value)) return '科学计数法'
  if (Number.isInteger(value)) return '整数'
  const abs = Math.abs(value)
  if (abs !== 0 && (abs >= 1e15 || abs < 1e-6)) return '科学计数法'
  return '小数'
}

/** 参数个数文案：固定参数显示单个数字，可变参数显示区间 */
function arityLabel(definition: { min: number; max: number }): string {
  return definition.min === definition.max ? String(definition.min) : `${definition.min}–${definition.max}`
}

/** 常量取值：保留 8 位小数并去掉多余的 0 */
function formatConstant(value: number): string {
  return String(Number(value.toFixed(8)))
}

interface MathHistoryEntry {
  expression: string
  result: string
}

export function MathTool() {
  const [expression, setExpression] = useState('')
  const [angleMode, setAngleMode] = useState<AngleMode>(DEFAULT_MATH_OPTIONS.angleMode)
  const [precision, setPrecision] = useState(DEFAULT_MATH_OPTIONS.precision)
  const [history, setHistory] = useState<MathHistoryEntry[]>([])

  // 实时求值：选项对象每次渲染都会重建，所以只把基本类型放进依赖数组
  const result = useMemo(() => {
    if (!expression.trim()) return null
    return evaluateMath(expression, { angleMode, precision })
  }, [expression, angleMode, precision])

  const displayValue = result && result.ok ? formatValue(result.value) : ''

  /** 按 Enter 记录一条历史：去重、最新在最前、最多保留 20 条 */
  const pushHistory = () => {
    const trimmed = expression.trim()
    if (!trimmed || !result) return
    const value = result.ok ? formatValue(result.value) : result.error
    setHistory((current) =>
      [{ expression: trimmed, result: value }, ...current.filter((item) => item.expression !== trimmed)].slice(
        0,
        HISTORY_LIMIT,
      ),
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* 顶部选项条 */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl border border-border/70 bg-card/40 px-5 py-4">
        <div className="flex flex-col gap-2">
          <Label className="text-xs text-muted-foreground">角度制</Label>
          <Select value={angleMode} onValueChange={(value) => setAngleMode(value as AngleMode)}>
            <SelectTrigger className="w-[180px]" size="sm" aria-label="角度制">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="rad">弧度制（rad）</SelectItem>
              <SelectItem value="deg">角度制（deg）</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-2">
          <Label className="text-xs text-muted-foreground">精度</Label>
          <Select value={String(precision)} onValueChange={(value) => setPrecision(Number(value))}>
            <SelectTrigger className="w-[170px]" size="sm" aria-label="精度">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRECISION_CHOICES.map((choice) => (
                <SelectItem key={choice.value} value={String(choice.value)}>
                  {choice.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2 pb-0.5">
          <Button variant="outline" size="sm" onClick={() => setExpression(MATH_SAMPLES[0].expression)}>
            <SparklesIcon />
            示例
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            disabled={!expression}
            onClick={() => setExpression('')}
          >
            <EraserIcon />
            清空
          </Button>
        </div>
      </div>

      {/* 输入 + 结果卡片 */}
      <section className="flex flex-col gap-4 rounded-xl border border-border/70 bg-card/40 p-5">
        <div className="flex flex-col gap-2">
          <Label htmlFor="math-expression" className="text-xs text-muted-foreground">
            表达式
          </Label>
          <Input
            id="math-expression"
            className="h-12 font-mono text-base"
            value={expression}
            onChange={(event) => setExpression(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') pushHistory()
            }}
            placeholder="例如：(12 + 8) * 3 / 4 - 5"
            spellCheck={false}
            autoComplete="off"
            autoFocus
            aria-label="数学表达式"
          />
        </div>

        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold">计算结果</h2>
          {result === null ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <CalculatorIcon className="size-4" />
              输入表达式后实时显示结果，按 Enter 可记录到历史记录。
            </p>
          ) : result.ok ? (
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-2xl font-mono font-semibold break-all">{displayValue}</span>
              <CopyButton value={displayValue} label="" size="icon-sm" aria-label="复制结果" />
              <Badge variant="outline" className="font-mono text-[11px]">
                {result.normalized}
              </Badge>
            </div>
          ) : (
            <p className="flex items-center gap-2 text-sm text-destructive">
              <TriangleAlertIcon className="size-4 shrink-0" />
              <span className="break-all">
                {result.error}
                {result.position !== null ? `（位置 ${result.position}）` : ''}
              </span>
            </p>
          )}
        </div>
      </section>

      {/* 常用样例 */}
      <section className="flex flex-col gap-3 rounded-xl border border-border/70 bg-card/40 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold">常用样例</h2>
          <Badge variant="outline" className="text-[11px]">
            {MATH_SAMPLES.length} 个
          </Badge>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {MATH_SAMPLES.map((sample) => (
            <button
              key={sample.expression}
              type="button"
              onClick={() => setExpression(sample.expression)}
              className="flex flex-col gap-1.5 rounded-lg border border-border/60 bg-card/40 px-3 py-2.5 text-left transition-colors hover:border-primary/50 hover:bg-accent"
            >
              <span className="text-sm font-medium">{sample.label}</span>
              <span className="font-mono text-xs break-all">{sample.expression}</span>
              <span className="text-xs text-muted-foreground">{sample.note}</span>
            </button>
          ))}
        </div>
      </section>

      {/* 常用函数 */}
      <section className="flex flex-col gap-3 rounded-xl border border-border/70 bg-card/40 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold">常用函数</h2>
          <Badge variant="outline" className="text-[11px]">
            {MATH_FUNCTION_NAMES.length} 个
          </Badge>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {MATH_FUNCTION_NAMES.map((name) => {
            const definition = MATH_FUNCTIONS[name]
            return (
              <div
                key={name}
                className="flex items-start justify-between gap-3 rounded-lg border border-border/60 bg-card/40 px-3 py-2"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="font-mono text-sm font-medium">{name}</span>
                  <span className="text-xs text-muted-foreground">{FUNCTION_NOTES[name] ?? '—'}</span>
                </div>
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  参数 <span className="font-mono text-foreground">{arityLabel(definition)}</span>
                </span>
              </div>
            )
          })}
        </div>

        <div className="flex flex-col gap-2 border-t border-border/60 pt-3">
          <h3 className="text-xs font-semibold text-muted-foreground">内置常量</h3>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {CONSTANT_NOTES.map((item) => (
              <div
                key={item.name}
                className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-card/40 px-3 py-2"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="font-mono text-sm font-medium">{item.name}</span>
                  <span className="text-xs text-muted-foreground">{item.note}</span>
                </div>
                <span className="shrink-0 font-mono text-xs text-muted-foreground">
                  {formatConstant(MATH_CONSTANTS[item.name])}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 历史记录：没有记录时整块不渲染 */}
      {history.length > 0 ? (
        <section className="flex flex-col gap-3 rounded-xl border border-border/70 bg-card/40 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold">历史记录</h2>
            <Badge variant="outline" className="text-[11px]">
              {history.length} / {HISTORY_LIMIT}
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto text-muted-foreground"
              onClick={() => setHistory([])}
            >
              <Trash2Icon />
              清空历史
            </Button>
          </div>
          <ul className="flex flex-col gap-1">
            {history.map((item, index) => (
              <li key={`${index}-${item.expression}`}>
                <button
                  type="button"
                  onClick={() => setExpression(item.expression)}
                  className="w-full rounded-md px-2 py-1.5 text-left font-mono text-xs break-all transition-colors hover:bg-accent"
                >
                  {item.expression} = {item.result}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* 底部统计：表达式为空时隐藏 */}
      {expression.trim() ? (
        <StatGrid>
          <Stat label="状态" value={result === null ? '等待输入' : result.ok ? '成功' : '出错'} />
          <Stat label="结果类型" value={result && result.ok ? valueKind(result.value) : '—'} />
          <Stat label="表达式长度" value={formatCount(expression.length)} />
          <Stat label="可用函数数" value={String(MATH_FUNCTION_NAMES.length)} />
          <Stat label="角度制" value={angleMode === 'rad' ? '弧度制 rad' : '角度制 deg'} />
          <Stat label="精度" value={`${precision} 位有效数字`} />
        </StatGrid>
      ) : null}
    </div>
  )
}
