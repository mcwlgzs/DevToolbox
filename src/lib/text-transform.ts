/** 文本处理：大小写转换、行操作、排序去重、统计。全部为纯函数。 */

export type CaseMode =
  | 'upper'
  | 'lower'
  | 'title'
  | 'sentence'
  | 'camel'
  | 'pascal'
  | 'snake'
  | 'kebab'
  | 'constant'
  | 'dot'

export const CASE_MODES: ReadonlyArray<{ value: CaseMode; label: string }> = [
  { value: 'upper', label: '全部大写' },
  { value: 'lower', label: '全部小写' },
  { value: 'title', label: '每词首字母大写' },
  { value: 'sentence', label: '句首大写' },
  { value: 'camel', label: 'camelCase' },
  { value: 'pascal', label: 'PascalCase' },
  { value: 'snake', label: 'snake_case' },
  { value: 'kebab', label: 'kebab-case' },
  { value: 'constant', label: 'CONSTANT_CASE' },
  { value: 'dot', label: 'dot.case' },
]

/** 拆分为单词：支持下划线、中划线、空格、驼峰边界与连续大写缩写。 */
export function splitWords(input: string): string[] {
  return input
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[\s_\-.]+/)
    .filter(Boolean)
}

export function toCamelCase(input: string): string {
  const words = splitWords(input)
  return words
    .map((word, index) =>
      index === 0
        ? word.toLowerCase()
        : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
    )
    .join('')
}

export function transformCase(text: string, mode: CaseMode): string {
  if (mode === 'upper') return text.toUpperCase()
  if (mode === 'lower') return text.toLowerCase()
  if (mode === 'title') {
    return text.replace(/\b([\p{L}\p{N}])([\p{L}\p{N}']*)/gu, (_, first: string, rest: string) =>
      first.toUpperCase() + rest.toLowerCase(),
    )
  }
  if (mode === 'sentence') {
    return text
      .toLowerCase()
      .replace(/(^\s*|[.!?。！？]\s*)(\p{L})/gu, (_, prefix: string, char: string) =>
        prefix + char.toUpperCase(),
      )
  }

  return text
    .split('\n')
    .map((line) => {
      if (!line.trim()) return line
      const words = splitWords(line)
      if (words.length === 0) return line
      const lower = words.map((word) => word.toLowerCase())
      if (mode === 'camel') return toCamelCase(line)
      if (mode === 'pascal') return lower.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('')
      if (mode === 'snake') return lower.join('_')
      if (mode === 'constant') return lower.join('_').toUpperCase()
      if (mode === 'kebab') return lower.join('-')
      return lower.join('.')
    })
    .join('\n')
}

/* ------------------------------------------------------------------ */
/* 行操作                                                              */
/* ------------------------------------------------------------------ */

export type SortMode =
  | 'asc'
  | 'desc'
  | 'lengthAsc'
  | 'lengthDesc'
  | 'numeric'
  | 'natural'
  | 'reverse'
  | 'shuffle'

export const SORT_MODES: ReadonlyArray<{ value: SortMode; label: string }> = [
  { value: 'asc', label: '字母升序' },
  { value: 'desc', label: '字母降序' },
  { value: 'lengthAsc', label: '长度升序' },
  { value: 'lengthDesc', label: '长度降序' },
  { value: 'numeric', label: '按数值' },
  { value: 'natural', label: '自然顺序（a2 < a10）' },
  { value: 'reverse', label: '反转行序' },
  { value: 'shuffle', label: '随机打乱' },
]

const collator = new Intl.Collator('zh-CN', { numeric: false, sensitivity: 'variant' })
const naturalCollator = new Intl.Collator('zh-CN', { numeric: true, sensitivity: 'variant' })

export function sortLines(text: string, mode: SortMode, random: () => number = Math.random): string {
  const lines = text.split('\n')
  if (mode === 'reverse') return [...lines].reverse().join('\n')
  if (mode === 'shuffle') {
    const copy = [...lines]
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1))
      ;[copy[i], copy[j]] = [copy[j], copy[i]]
    }
    return copy.join('\n')
  }

  const sorted = [...lines].sort((a, b) => {
    if (mode === 'asc') return collator.compare(a, b)
    if (mode === 'desc') return collator.compare(b, a)
    if (mode === 'lengthAsc') return a.length - b.length || collator.compare(a, b)
    if (mode === 'lengthDesc') return b.length - a.length || collator.compare(a, b)
    if (mode === 'natural') return naturalCollator.compare(a, b)
    const na = Number.parseFloat(a)
    const nb = Number.parseFloat(b)
    const aValid = !Number.isNaN(na)
    const bValid = !Number.isNaN(nb)
    if (aValid && bValid) return na - nb
    if (aValid) return -1
    if (bValid) return 1
    return collator.compare(a, b)
  })
  return sorted.join('\n')
}

export interface DedupeOptions {
  caseSensitive: boolean
  trimLines: boolean
  keepEmpty: boolean
}

export function dedupeLines(text: string, options: DedupeOptions): string {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of text.split('\n')) {
    const line = options.trimLines ? raw.trim() : raw
    if (!options.keepEmpty && line === '') continue
    const key = options.caseSensitive ? line : line.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(line)
  }
  return out.join('\n')
}

export function trimLines(text: string): string {
  return text
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
}

export function removeEmptyLines(text: string): string {
  return text
    .split('\n')
    .filter((line) => line.trim() !== '')
    .join('\n')
}

export function collapseSpaces(text: string): string {
  return text
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
}

export function addLineNumbers(text: string, start = 1, separator = '. '): string {
  return text
    .split('\n')
    .map((line, index) => `${index + start}${separator}${line}`)
    .join('\n')
}

export function stripLineNumbers(text: string): string {
  return text
    .split('\n')
    // 分隔符必须真的存在：之前的 `[.)\]:\t]?` 把分隔符写成可选，
    // 于是「2024 was a year」这种以数字开头的普通句子会被吃掉年份，属于静默改内容。
    .map((line) => line.replace(/^\s*\d+\s*[.)\]:、\t]\s*/, ''))
    .join('\n')
}

export function reverseText(text: string): string {
  return [...text].reverse().join('')
}

export function escapeBackslashes(text: string): string {
  return text
    .split('\n')
    .map((line) => line.replace(/\\(?![nrtbfv0'"\\/u])/g, '\\\\'))
    .join('\n')
}

/* ------------------------------------------------------------------ */
/* 统计                                                                */
/* ------------------------------------------------------------------ */

export interface TextStats {
  characters: number
  charactersNoSpace: number
  words: number
  lines: number
  nonEmptyLines: number
  cjk: number
  bytes: number
  readingMinutes: number
}

const CJK_RE = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u3040-\u30ff]/g

export function textStats(text: string): TextStats {
  const cjk = text.match(CJK_RE)?.length ?? 0
  const latinWords = text
    .replace(CJK_RE, ' ')
    .split(/\s+/)
    .filter(Boolean).length
  const lines = text === '' ? 0 : text.split('\n').length

  return {
    characters: [...text].length,
    charactersNoSpace: [...text.replace(/\s/g, '')].length,
    words: latinWords + cjk,
    lines,
    nonEmptyLines: text === '' ? 0 : text.split('\n').filter((line) => line.trim() !== '').length,
    cjk,
    bytes: new TextEncoder().encode(text).length,
    readingMinutes: Math.max(1, Math.round((latinWords + cjk) / 300)),
  }
}
