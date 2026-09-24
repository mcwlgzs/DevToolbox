/**
 * Cron 表达式解析与下次运行时间计算。
 * 支持 5 段（分 时 日 月 周）与 6 段（秒 分 时 日 月 周），以及 @daily 等宏。
 */

export type CronFieldKey = 'second' | 'minute' | 'hour' | 'dayOfMonth' | 'month' | 'dayOfWeek'

export interface CronField {
  key: CronFieldKey
  label: string
  min: number
  max: number
  /** 原始写法 */
  raw: string
  /** 展开后的取值集合 */
  values: Set<number>
  /** 覆盖了该字段的全部可能取值（`*` 或 `1-31` 这种完整区间） */
  wildcard: boolean
  /**
   * 原始写法就是 `*` 或 `?`（语法上的星号）。
   *
   * 日 / 周 的「或」语义只看这个，不看取值范围：crontab(5) 的原文是
   * 「if both fields are restricted (i.e., aren't `*`)」——`1-31` 写法上不是 `*`，
   * 所以它算「被限定」，与周字段之间取「或」。之前用 wildcard 判断，
   * `0 0 1-31 * 1` 被当成「每天」以外的语义，与服务器上的实际行为不一致。
   */
  starred: boolean
}

export type CronFields = Record<CronFieldKey, CronField>

export interface CronParseSuccess {
  ok: true
  fields: CronFields
  hasSeconds: boolean
  normalized: string
  description: string
}

export interface CronParseFailure {
  ok: false
  error: string
}

export type CronParseResult = CronParseSuccess | CronParseFailure

const FIELD_DEFS: Array<{ key: CronFieldKey; label: string; min: number; max: number }> = [
  { key: 'second', label: '秒', min: 0, max: 59 },
  { key: 'minute', label: '分', min: 0, max: 59 },
  { key: 'hour', label: '时', min: 0, max: 23 },
  { key: 'dayOfMonth', label: '日', min: 1, max: 31 },
  { key: 'month', label: '月', min: 1, max: 12 },
  { key: 'dayOfWeek', label: '周', min: 0, max: 7 },
]

const MONTH_NAMES: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
}

const WEEKDAY_NAMES: Record<string, number> = {
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
}

export const CRON_MACROS: Record<string, string> = {
  '@yearly': '0 0 1 1 *',
  '@annually': '0 0 1 1 *',
  '@monthly': '0 0 1 * *',
  '@weekly': '0 0 * * 0',
  '@daily': '0 0 * * *',
  '@midnight': '0 0 * * *',
  '@hourly': '0 * * * *',
  '@every_minute': '* * * * *',
  '@every_second': '* * * * * *',
}

const WEEKDAY_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

function resolveName(token: string, fieldKey: CronFieldKey): number | null {
  const lower = token.toLowerCase()
  if (fieldKey === 'month' && lower in MONTH_NAMES) return MONTH_NAMES[lower]
  if (fieldKey === 'dayOfWeek' && lower in WEEKDAY_NAMES) return WEEKDAY_NAMES[lower]
  const numeric = Number.parseInt(token, 10)
  return Number.isNaN(numeric) ? null : numeric
}

function parseField(
  raw: string,
  def: { key: CronFieldKey; label: string; min: number; max: number },
): { values: Set<number>; wildcard: boolean } | { error: string } {
  const values = new Set<number>()
  const wildcard = raw === '*' || raw === '?'

  for (const part of raw.split(',')) {
    const segment = part.trim()
    if (!segment) return { error: `${def.label} 字段存在空的分段` }

    const [rangePart, stepPart] = segment.split('/')
    let step = 1
    if (stepPart !== undefined) {
      step = Number.parseInt(stepPart, 10)
      if (Number.isNaN(step) || step < 1) return { error: `${def.label} 字段的步长「${stepPart}」无效` }
    }

    let start: number
    let end: number

    if (rangePart === '*' || rangePart === '?') {
      start = def.min
      end = def.max
    } else if (rangePart.includes('-')) {
      const [startToken, endToken] = rangePart.split('-')
      const parsedStart = resolveName(startToken, def.key)
      const parsedEnd = resolveName(endToken, def.key)
      if (parsedStart === null || parsedEnd === null) {
        return { error: `${def.label} 字段的范围「${rangePart}」无法识别` }
      }
      start = parsedStart
      end = parsedEnd
    } else {
      const parsed = resolveName(rangePart, def.key)
      if (parsed === null) return { error: `${def.label} 字段的取值「${rangePart}」无法识别` }
      start = parsed
      // 单值 + 步长（如 5/10）表示「从 5 开始按步长递增」
      end = stepPart !== undefined ? def.max : parsed
    }

    if (start < def.min || end > def.max || start > end) {
      return { error: `${def.label} 字段的取值必须在 ${def.min}–${def.max} 之间（收到 ${start}-${end}）` }
    }

    for (let value = start; value <= end; value += step) values.add(value)
  }

  if (values.size === 0) return { error: `${def.label} 字段没有匹配到任何取值` }
  return { values, wildcard }
}

/** 判断字段是否覆盖了全部可能取值（等价于 *）。 */
function isFullRange(values: Set<number>, def: { min: number; max: number }): boolean {
  for (let value = def.min; value <= def.max; value += 1) {
    if (!values.has(value)) return false
  }
  return true
}

export function parseCron(expression: string): CronParseResult {
  const trimmed = expression.trim()
  if (!trimmed) return { ok: false, error: '表达式为空' }

  const macro = CRON_MACROS[trimmed.toLowerCase()]
  const source = macro ?? trimmed
  const parts = source.split(/\s+/)

  if (parts.length !== 5 && parts.length !== 6) {
    return {
      ok: false,
      error: `Cron 表达式应为 5 段（分 时 日 月 周）或 6 段（秒 + 上述 5 段），当前是 ${parts.length} 段`,
    }
  }

  const hasSeconds = parts.length === 6
  const defs = hasSeconds ? FIELD_DEFS : FIELD_DEFS.slice(1)
  const fields = {} as CronFields

  for (let index = 0; index < defs.length; index += 1) {
    const def = defs[index]
    const raw = parts[index]
    const parsed = parseField(raw, def)
    if ('error' in parsed) return { ok: false, error: parsed.error }

    // 周字段允许 0 和 7 都表示周日，统一成 0
    if (def.key === 'dayOfWeek' && parsed.values.has(7)) {
      parsed.values.delete(7)
      parsed.values.add(0)
    }

    fields[def.key] = {
      key: def.key,
      label: def.label,
      min: def.min,
      max: def.max,
      raw,
      values: parsed.values,
      wildcard: parsed.wildcard || isFullRange(parsed.values, def),
      starred: raw === '*' || raw === '?',
    }
  }

  return {
    ok: true,
    fields,
    hasSeconds,
    normalized: parts.join(' '),
    description: describeCron(fields, hasSeconds),
  }
}

/* ------------------------------------------------------------------ */
/* 中文描述                                                            */
/* ------------------------------------------------------------------ */

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function sorted(values: Set<number>): number[] {
  return [...values].sort((a, b) => a - b)
}

function joinList(values: number[], suffix = ''): string {
  return values.map((value) => `${value}${suffix}`).join('、')
}

export function describeCron(fields: CronFields, hasSeconds: boolean): string {
  const parts: string[] = []

  // 时间部分
  const hours = sorted(fields.hour.values)
  const minutes = sorted(fields.minute.values)
  if (fields.hour.wildcard && fields.minute.wildcard) {
    parts.push(hasSeconds ? '每秒' : '每分钟')
  } else if (fields.hour.wildcard) {
    parts.push(`每小时的第 ${joinList(minutes, ' 分')}`)
  } else if (hours.length === 1 && minutes.length === 1) {
    parts.push(`${pad(hours[0])}:${pad(minutes[0])}`)
  } else {
    parts.push(`${joinList(hours, ' 时')} ${joinList(minutes, ' 分')}`)
  }
  if (hasSeconds && !fields.second.wildcard) {
    parts.push(`第 ${joinList(sorted(fields.second.values), ' 秒')}`)
  }

  // 日期部分
  const months = sorted(fields.month.values)
  const doms = sorted(fields.dayOfMonth.values)
  const dows = sorted(fields.dayOfWeek.values)

  if (!fields.month.wildcard) parts.push(`${joinList(months, ' 月')}`)

  // 说明文字必须与上面的匹配逻辑用同一套规则，否则会出现「说明写每天、实际每周」
  const domAlways = fields.dayOfMonth.wildcard
  const dowAlways = fields.dayOfWeek.wildcard
  const dayAlways = fields.dayOfMonth.starred
    ? dowAlways
    : fields.dayOfWeek.starred
      ? domAlways
      : domAlways || dowAlways

  if (dayAlways) {
    parts.push('每天')
  } else if (fields.dayOfMonth.starred) {
    parts.push(dows.map((d) => WEEKDAY_LABELS[d]).join('、'))
  } else if (fields.dayOfWeek.starred) {
    parts.push(`每月 ${joinList(doms, ' 日')}`)
  } else {
    // 日与周同时被限定：标准 cron 语义下取「或」
    parts.push(`每月的 ${joinList(doms, ' 日')} 或 ${dows.map((d) => WEEKDAY_LABELS[d]).join('、')}`)
  }

  return parts.join(' · ')
}

/* ------------------------------------------------------------------ */
/* 下次运行时间                                                        */
/* ------------------------------------------------------------------ */

const MAX_ITERATIONS = 500_000

export interface NextRunResult {
  runs: Date[]
  error: string | null
  /** 是否因为超出搜索上限而提前停止 */
  exhausted: boolean
}

/** 计算接下来 count 次运行时间（本地时区）。 */
export function nextRuns(expression: string, count = 5, from: Date = new Date()): NextRunResult {
  const parsed = parseCron(expression)
  if (!parsed.ok) return { runs: [], error: parsed.error, exhausted: false }

  const { fields, hasSeconds } = parsed
  const stepMs = hasSeconds ? 1000 : 60_000
  const runs: Date[] = []

  // 从下一个时间单位开始（不含当前时刻）
  const cursor = new Date(Math.floor(from.getTime() / stepMs) * stepMs + stepMs)
  let iterations = 0
  /**
   * 夏令时「跳进」时，被跳过的那一小时不存在，Date 会把它规范化到下一小时。
   * 这里记下「哪一小时的运行被顺延到了 hour+1」，让同一小时内的分钟 / 秒继续正常匹配，
   * 否则 `30 2 * * *` 这类非整点任务在跳变当天仍然会被整天丢掉。
   */
  let dstShiftedHour: number | null = null

  while (runs.length < count && iterations < MAX_ITERATIONS) {
    iterations += 1

    if (!fields.month.values.has(cursor.getMonth() + 1)) {
      cursor.setMonth(cursor.getMonth() + 1, 1)
      cursor.setHours(0, 0, 0, 0)
      dstShiftedHour = null
      continue
    }

    const domMatch = fields.dayOfMonth.values.has(cursor.getDate())
    const dowMatch = fields.dayOfWeek.values.has(cursor.getDay())
    // crontab(5)：两个字段「都被限定」时取「或」，否则只由被限定的那个决定。
    // 「被限定」= 写法上不是 `*`，因此 `1-31` 也算被限定。
    const dayMatches = fields.dayOfMonth.starred
      ? dowMatch
      : fields.dayOfWeek.starred
        ? domMatch
        : domMatch || dowMatch

    if (!dayMatches) {
      cursor.setDate(cursor.getDate() + 1)
      cursor.setHours(0, 0, 0, 0)
      dstShiftedHour = null
      continue
    }

    const currentHour = cursor.getHours()
    const hourMatches =
      fields.hour.values.has(currentHour) ||
      (dstShiftedHour !== null && currentHour === dstShiftedHour + 1)

    if (!hourMatches) {
      dstShiftedHour = null
      const intended: number = currentHour + 1
      cursor.setHours(intended, 0, 0, 0)
      // 想要的那个整点确实在集合里，且刚好被跳变后移了一小时 → 认这一次（Vixie 也是跳变后补跑）
      if (cursor.getHours() === intended + 1 && fields.hour.values.has(intended)) {
        dstShiftedHour = intended
      } else {
        continue
      }
    }

    if (!fields.minute.values.has(cursor.getMinutes())) {
      cursor.setMinutes(cursor.getMinutes() + 1, 0, 0)
      continue
    }

    if (hasSeconds && !fields.second.values.has(cursor.getSeconds())) {
      cursor.setSeconds(cursor.getSeconds() + 1, 0)
      continue
    }

    runs.push(new Date(cursor))
    if (hasSeconds) cursor.setSeconds(cursor.getSeconds() + 1, 0)
    else cursor.setMinutes(cursor.getMinutes() + 1, 0, 0)
  }

  return { runs, error: null, exhausted: runs.length < count }
}

export interface CronPreset {
  name: string
  expression: string
  note: string
}

export const CRON_PRESETS: readonly CronPreset[] = [
  { name: '每分钟', expression: '* * * * *', note: '用于高频采集' },
  { name: '每 5 分钟', expression: '*/5 * * * *', note: '常见监控间隔' },
  { name: '每小时整点', expression: '0 * * * *', note: '整点任务' },
  { name: '每天凌晨 2 点', expression: '0 2 * * *', note: '备份 / 清理' },
  { name: '每天 3:30', expression: '30 3 * * *', note: '' },
  { name: '工作日 9 点', expression: '0 9 * * 1-5', note: '周一至周五' },
  { name: '每周一 0 点', expression: '0 0 * * 1', note: '周报 / 重置' },
  { name: '每月 1 号 0 点', expression: '0 0 1 * *', note: '月度任务' },
  { name: '每 15 分钟（工作时间）', expression: '*/15 9-18 * * 1-5', note: '9–18 点之间' },
  { name: '每季度首日', expression: '0 0 1 1,4,7,10 *', note: '1/4/7/10 月' },
  { name: '每 30 秒', expression: '*/30 * * * * *', note: '需要 6 段写法' },
  { name: '2 月 29 日', expression: '0 0 29 2 *', note: '闰年才有一次' },
]
