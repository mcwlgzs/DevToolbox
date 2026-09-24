/** 正则表达式执行与高亮。用于正则测试工具，纯函数、可测试。 */

export interface RegexFlags {
  global: boolean
  ignoreCase: boolean
  multiline: boolean
  dotAll: boolean
  unicode: boolean
  sticky: boolean
}

export const DEFAULT_FLAGS: RegexFlags = {
  global: true,
  ignoreCase: false,
  multiline: false,
  dotAll: false,
  unicode: false,
  sticky: false,
}

export const FLAG_LABELS: ReadonlyArray<{ key: keyof RegexFlags; flag: string; label: string }> = [
  { key: 'global', flag: 'g', label: '全局匹配' },
  { key: 'ignoreCase', flag: 'i', label: '忽略大小写' },
  { key: 'multiline', flag: 'm', label: '多行模式（^ $ 匹配每行）' },
  { key: 'dotAll', flag: 's', label: '. 匹配换行' },
  { key: 'unicode', flag: 'u', label: 'Unicode 模式' },
  { key: 'sticky', flag: 'y', label: '粘性匹配' },
]

export function flagsToString(flags: RegexFlags): string {
  return FLAG_LABELS.filter((item) => flags[item.key])
    .map((item) => item.flag)
    .join('')
}

export interface RegexCapture {
  name: string | null
  value: string | undefined
  index: number
}

export interface RegexMatch {
  index: number
  end: number
  value: string
  captures: RegexCapture[]
  named: Record<string, string | undefined>
}

export interface RegexRunResult {
  matches: RegexMatch[]
  error: string | null
  /** 达到匹配上限而提前停止 */
  truncated: boolean
  durationMs: number
  flags: string
}

/** 把正则错误信息里的 JS 术语换成中文提示。 */
function humanizeError(message: string): string {
  if (/Invalid regular expression/i.test(message)) {
    return message.replace(/^Invalid regular expression:\s*/i, '正则语法错误：')
  }
  if (/Invalid flags/i.test(message)) return '修饰符无效'
  if (/Unterminated group/i.test(message)) return '括号没有闭合'
  if (/Unmatched \)/i.test(message)) return '存在多余的右括号'
  return message
}

export function buildRegex(
  pattern: string,
  flags: RegexFlags,
): { regex: RegExp | null; error: string | null } {
  if (!pattern) return { regex: null, error: null }
  try {
    return { regex: new RegExp(pattern, flagsToString(flags)), error: null }
  } catch (error) {
    return { regex: null, error: humanizeError((error as Error).message) }
  }
}

/** 默认匹配数量上限，避免超大文本产出上百万条匹配把页面卡死。 */
export const DEFAULT_MATCH_LIMIT = 2000

/**
 * 读取从 index 开始的量词，并判断它是否「无上界」。
 *
 * `{2,}` 是无上界的（可以无限重复），`{2,5}` 与 `{2}` 不是。
 */
function readQuantifier(pattern: string, index: number): { unbounded: boolean; end: number } | null {
  const char = pattern[index]
  if (char === '*' || char === '+') return { unbounded: true, end: index + 1 }
  if (char === '?') return { unbounded: false, end: index + 1 }
  if (char === '{') {
    const close = pattern.indexOf('}', index)
    if (close < 0) return null
    const match = /^(\d+)(,(\d*))?$/.exec(pattern.slice(index + 1, close))
    if (!match) return null
    // 有逗号且逗号后面没有数字 → {2,}，无上界
    return { unbounded: match[2] !== undefined && match[3] === '', end: close + 1 }
  }
  return null
}

/** 分组体里是否存在完全相同的分支（(a|a) 这类）。 */
function hasIdenticalAlternatives(body: string): boolean {
  const branches: string[] = []
  let depth = 0
  let current = ''

  for (let index = 0; index < body.length; index += 1) {
    const char = body[index]
    if (char === '\\') {
      current += char + (body[index + 1] ?? '')
      index += 1
      continue
    }
    if (char === '[' || char === '(') depth += 1
    else if (char === ']' || char === ')') depth -= 1
    else if (char === '|' && depth === 0) {
      branches.push(current)
      current = ''
      continue
    }
    current += char
  }
  branches.push(current)

  if (branches.length < 2) return false
  const normalized = branches.map((branch) => branch.replace(/^\?:/, '').trim())
  return new Set(normalized).size !== normalized.length
}

/**
 * 检测会触发灾难性回溯（ReDoS）的嵌套量词写法，例如 `(a+)+`、`(a*)*`、`(a|a)*`。
 *
 * 为什么必须直接拒绝：JavaScript 的正则在单次 `exec` 内部开始指数级回溯后**无法中断**，
 * 匹配数量上限只在两次 exec 之间生效，对一次调用内的回溯完全无效。
 * 实测 `(a+)+$` 匹配 26 个 a 加一个 b 需要 0.7 秒，每多 2 个字符约翻 4 倍，
 * 32 个字符就要几十秒——主线程被占满，输入框、按钮全部无响应，只能强杀标签页。
 */
export function findCatastrophicRisk(pattern: string): string | null {
  const stack: Array<{ start: number; hasUnbounded: boolean }> = []
  let index = 0
  let inClass = false

  while (index < pattern.length) {
    const char = pattern[index]

    if (char === '\\') {
      index += 2
      continue
    }
    if (inClass) {
      if (char === ']') inClass = false
      index += 1
      continue
    }
    if (char === '[') {
      inClass = true
      index += 1
      continue
    }
    if (char === '(') {
      stack.push({ start: index, hasUnbounded: false })
      index += 1
      continue
    }
    if (char === ')') {
      const group = stack.pop()
      const closeIndex = index
      index += 1
      const quantifier = readQuantifier(pattern, index)
      const outerUnbounded = quantifier?.unbounded ?? false
      const body = group ? pattern.slice(group.start + 1, closeIndex) : ''

      if (outerUnbounded && group?.hasUnbounded) {
        return `分组「(${body})」里已经用量词，外面又套了一层「${pattern[index]}」，会指数级回溯并卡死页面，因此不予执行`
      }
      if (outerUnbounded && hasIdenticalAlternatives(body)) {
        return `分组「(${body})」里的分支可以匹配完全相同的内容，外面又套了无上界量词，会指数级回溯，因此不予执行`
      }
      if (quantifier) index = quantifier.end
      // 内层带量词会向上冒泡：((a+))+ 也要被拦住
      if (stack.length > 0 && (outerUnbounded || (group?.hasUnbounded ?? false))) {
        stack[stack.length - 1].hasUnbounded = true
      }
      continue
    }

    const quantifier = readQuantifier(pattern, index)
    if (quantifier) {
      if (quantifier.unbounded && stack.length > 0) stack[stack.length - 1].hasUnbounded = true
      index = quantifier.end
      continue
    }
    index += 1
  }

  return null
}

export function runRegex(
  pattern: string,
  flags: RegexFlags,
  text: string,
  limit = DEFAULT_MATCH_LIMIT,
): RegexRunResult {
  const started = performance.now()
  const risk = findCatastrophicRisk(pattern)
  const { regex, error } = risk
    ? { regex: null, error: `为避免卡死页面已拒绝执行：${risk}` }
    : buildRegex(pattern, flags)
  const result = (matches: RegexMatch[], truncated: boolean): RegexRunResult => ({
    matches,
    error,
    truncated,
    durationMs: performance.now() - started,
    flags: flagsToString(flags),
  })

  if (error) return result([], false)
  if (!regex || !text) return result([], false)

  const matches: RegexMatch[] = []
  let truncated = false

  if (!regex.global && !regex.sticky) {
    const match = regex.exec(text)
    if (match) matches.push(toMatch(match))
    return result(matches, false)
  }

  regex.lastIndex = 0
  let guard = 0
  const maxIterations = limit * 4 + 1000

  while (guard < maxIterations) {
    guard += 1
    const match = regex.exec(text)
    if (!match) break
    matches.push(toMatch(match))

    // 零长度匹配必须手动前进，否则会死循环
    if (match[0] === '') regex.lastIndex += 1
    if (matches.length >= limit) {
      truncated = true
      break
    }
    if (regex.lastIndex > text.length) break
  }

  return result(matches, truncated)
}

function toMatch(match: RegExpExecArray): RegexMatch {
  const captures: RegexCapture[] = []
  for (let i = 1; i < match.length; i += 1) {
    captures.push({ name: null, value: match[i], index: i })
  }

  const named: Record<string, string | undefined> = {}
  if (match.groups) {
    for (const [name, value] of Object.entries(match.groups)) {
      named[name] = value
      const numeric = Number.parseInt(name, 10)
      if (!Number.isNaN(numeric)) continue
    }
  }

  return {
    index: match.index,
    end: match.index + match[0].length,
    value: match[0],
    captures,
    named,
  }
}

export interface TextSegment {
  text: string
  /** 命中第几个匹配（从 0 起），未命中为 null */
  matchIndex: number | null
  /** 是否为捕获组内部（用于次级高亮） */
  isCapture: boolean
}

/** 把文本切成「命中 / 未命中」片段，供高亮渲染。 */
export function highlightSegments(text: string, matches: readonly RegexMatch[]): TextSegment[] {
  const segments: TextSegment[] = []
  let cursor = 0

  matches.forEach((match, index) => {
    if (match.index < cursor) return
    if (match.index > cursor) {
      segments.push({ text: text.slice(cursor, match.index), matchIndex: null, isCapture: false })
    }
    segments.push({
      text: text.slice(match.index, match.end),
      matchIndex: index,
      isCapture: false,
    })
    cursor = Math.max(cursor, match.end)
  })

  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), matchIndex: null, isCapture: false })
  }
  return segments
}

export interface ReplaceResult {
  output: string
  error: string | null
  count: number
}

/** 替换。未勾选全局时只替换第一处，与 JavaScript 的 String.replace 行为一致。 */
export function replaceWithRegex(
  pattern: string,
  flags: RegexFlags,
  text: string,
  replacement: string,
): ReplaceResult {
  // 替换同样会执行正则，必须走同一套 ReDoS 守卫
  const risk = findCatastrophicRisk(pattern)
  if (risk) return { output: text, error: `为避免卡死页面已拒绝执行：${risk}`, count: 0 }

  const effective: RegexFlags = { ...flags, sticky: false }
  const { regex, error } = buildRegex(pattern, effective)
  if (error) return { output: text, error, count: 0 }
  if (!regex) return { output: text, error: null, count: 0 }

  // 非全局时 count 也要反映「到底匹配上没有」：以前无论有没有匹配都报 1 处
  const count = runRegex(pattern, effective, text).matches.length
  try {
    return { output: text.replace(regex, replacement), error: null, count }
  } catch (caught) {
    return { output: text, error: humanizeError((caught as Error).message), count: 0 }
  }
}

export interface RegexPreset {
  name: string
  pattern: string
  flags: string
  sample: string
}

export const REGEX_PRESETS: readonly RegexPreset[] = [
  {
    name: '邮箱地址',
    pattern: '[\\w.+-]+@[\\w-]+\\.[\\w.]+',
    flags: 'g',
    sample: '联系 admin@example.com 或 support@dev.tools.cn 获取帮助',
  },
  {
    name: 'URL',
    pattern: 'https?://[^\\s"\'<>]+',
    flags: 'gi',
    sample: '访问 https://example.com/path?a=1 或 http://test.local 查看',
  },
  {
    name: 'IPv4',
    pattern: '\\b(?:\\d{1,3}\\.){3}\\d{1,3}\\b',
    flags: 'g',
    sample: '服务器 192.168.1.1 与 10.0.0.254，本机 127.0.0.1',
  },
  {
    name: '中文字符',
    pattern: '[\\u4e00-\\u9fa5]+',
    flags: 'g',
    sample: 'Hello 世界，这是 mixed 中英文 text 文本',
  },
  {
    name: '手机号（中国大陆）',
    pattern: '1[3-9]\\d{9}',
    flags: 'g',
    sample: '联系方式：13812345678 或 15900001111',
  },
  {
    name: '日期 YYYY-MM-DD',
    pattern: '(\\d{4})-(\\d{2})-(\\d{2})',
    flags: 'g',
    sample: '开始 2024-01-15，结束 2025-12-31',
  },
  {
    name: '时间 HH:MM:SS',
    pattern: '\\b([01]\\d|2[0-3]):([0-5]\\d)(?::([0-5]\\d))?\\b',
    flags: 'g',
    sample: '09:30 开始，18:00:00 结束',
  },
  {
    name: 'HTML 标签',
    pattern: '</?([a-z][a-z0-9]*)\\b[^>]*>',
    flags: 'gi',
    sample: '<div class="a"><span>文本</span></div>',
  },
  {
    name: '十六进制颜色',
    pattern: '#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})\\b',
    flags: 'g',
    sample: '主色 #3b82f6，背景 #fff，边框 #1F2937',
  },
  {
    name: '重复单词',
    pattern: '\\b(\\w+)\\s+\\1\\b',
    flags: 'gi',
    sample: 'This is is a a test test case',
  },
  {
    name: '行尾空白',
    pattern: '[ \\t]+$',
    flags: 'gm',
    sample: '第一行   \n第二行\t\n第三行',
  },
  {
    name: '信用卡号（脱敏用）',
    pattern: '\\b(\\d{4})[ -]?(\\d{4})[ -]?(\\d{4})[ -]?(\\d{4})\\b',
    flags: 'g',
    sample: '卡号 4111 1111 1111 1111 与 5500000000000004',
  },
]
