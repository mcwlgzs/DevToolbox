/**
 * 哈希清单的解析、导出与比对。
 *
 * 支持三种常见清单格式：
 *   1. GNU coreutils：`d41d8cd98f00b204e9800998ecf8427e  video.mp4`
 *      （`md5sum` / `sha256sum` / `certutil -hashfile` 的典型输出，二进制模式带 `*` 前缀）
 *   2. 带表头的 CSV：`name,size,md5,sha1,sha256`（本工具导出格式）
 *   3. 无表头的松散格式：`video.mp4 d41d8cd9…`
 *
 * 算法由哈希值长度推断：32 → MD5，40 → SHA-1，64 → SHA-256。
 */

// 用显式 .ts 扩展名：本文件会被 scripts/*.mts 在 Node 原生类型擦除下直接导入，
// Node 的 ESM 解析不做扩展名补全，而 Vite / tsc 都能正常处理。
import { algorithmMeta, type HashAlgorithm } from './hash.ts'

export interface HashRecord {
  /** 文件名或相对路径 */
  name: string
  size: number | null
  hashes: Partial<Record<HashAlgorithm, string>>
}

export type ManifestEntry = HashRecord

export interface ManifestParseResult {
  entries: ManifestEntry[]
  /** 无法识别的行 */
  errors: string[]
  /** 重名条目（后者被忽略） */
  duplicates: string[]
  /** 识别到的表头列（若输入是 CSV） */
  columns: string[]
}

const ALGORITHM_BY_LENGTH: Record<number, HashAlgorithm> = {
  32: 'md5',
  40: 'sha1',
  64: 'sha256',
}

const NAME_COLUMNS = new Set(['name', 'file', 'filename', 'path', '文件名', '路径', '文件'])
const SIZE_COLUMNS = new Set(['size', 'bytes', '大小', '字节', '字节数'])
const HASH_COLUMNS: Record<string, HashAlgorithm> = {
  md5: 'md5',
  sha1: 'sha1',
  'sha-1': 'sha1',
  sha256: 'sha256',
  'sha-256': 'sha256',
  hash: 'md5',
  '哈希': 'md5',
}

/** 归一化哈希值：去空白、转小写、去掉 0x 前缀。 */
export function normalizeHash(value: string): string {
  return value.trim().toLowerCase().replace(/^0x/, '')
}

/** 由长度推断算法；不是合法十六进制哈希时返回 null。 */
export function classifyHash(value: string): HashAlgorithm | null {
  const clean = normalizeHash(value)
  if (!/^[0-9a-f]+$/.test(clean)) return null
  return ALGORITHM_BY_LENGTH[clean.length] ?? null
}

function isSizeToken(value: string): boolean {
  return /^\d{1,15}$/.test(value.trim())
}

/** 按 CSV 规则切分一行，正确处理双引号包裹与 "" 转义。 */
function splitCsvLine(line: string): string[] {
  const fields: string[] = []
  let current = ''
  let inQuotes = false
  let quoted = false

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]

    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"'
          i += 1
        } else {
          inQuotes = false
        }
      } else {
        current += char
      }
      continue
    }

    if (char === '"' && current.trim() === '') {
      inQuotes = true
      quoted = true
      current = ''
      continue
    }
    if (char === ',') {
      fields.push(quoted ? current : current.trim())
      current = ''
      quoted = false
      continue
    }
    current += char
  }

  fields.push(quoted ? current : current.trim())
  return fields
}

interface HeaderMap {
  columns: string[]
  nameIndex: number
  sizeIndex: number
  hashIndex: Partial<Record<HashAlgorithm, number>>
}

function detectHeader(line: string): HeaderMap | null {
  if (!line.includes(',')) return null
  const fields = splitCsvLine(line).map((field) => field.toLowerCase())
  if (fields.length < 2) return null

  const known = fields.every(
    (field) => NAME_COLUMNS.has(field) || SIZE_COLUMNS.has(field) || Object.hasOwn(HASH_COLUMNS, field),
  )
  if (!known) return null

  const map: HeaderMap = { columns: fields, nameIndex: -1, sizeIndex: -1, hashIndex: {} }
  fields.forEach((field, index) => {
    if (NAME_COLUMNS.has(field) && map.nameIndex < 0) map.nameIndex = index
    else if (SIZE_COLUMNS.has(field) && map.sizeIndex < 0) map.sizeIndex = index
    else if (Object.hasOwn(HASH_COLUMNS, field)) map.hashIndex[HASH_COLUMNS[field]] = index
  })

  if (map.nameIndex < 0) map.nameIndex = 0
  return map
}

function parseCsvLine(line: string): HashRecord | null {
  const fields = splitCsvLine(line)
  const hashes: Partial<Record<HashAlgorithm, string>> = {}
  let name: string | null = null
  let size: number | null = null

  for (const field of fields) {
    const algorithm = classifyHash(field)
    if (algorithm && !hashes[algorithm]) {
      hashes[algorithm] = normalizeHash(field)
      continue
    }
    if (size === null && isSizeToken(field) && field.length > 0) {
      size = Number(field)
      continue
    }
    if (name === null && field.length > 0) name = field
  }

  if (!name || Object.keys(hashes).length === 0) return null
  return { name, size, hashes }
}

function parseCsvWithHeader(line: string, header: HeaderMap): HashRecord | null {
  const fields = splitCsvLine(line)
  const name = fields[header.nameIndex]?.trim()
  if (!name) return null

  const hashes: Partial<Record<HashAlgorithm, string>> = {}
  for (const [algorithm, index] of Object.entries(header.hashIndex) as Array<
    [HashAlgorithm, number]
  >) {
    const value = fields[index]
    if (value && classifyHash(value) === algorithm) hashes[algorithm] = normalizeHash(value)
  }
  if (Object.keys(hashes).length === 0) return null

  const sizeField = header.sizeIndex >= 0 ? fields[header.sizeIndex] : undefined
  const size = sizeField && isSizeToken(sizeField) ? Number(sizeField) : null
  return { name, size, hashes }
}

const COREUTILS_RE = /^([0-9a-fA-F]{32}|[0-9a-fA-F]{40}|[0-9a-fA-F]{64})[ \t]+[* ]?(.+)$/

function parseGenericLine(line: string): HashRecord | null {
  const coreutils = COREUTILS_RE.exec(line)
  if (coreutils) {
    const algorithm = classifyHash(coreutils[1])
    if (algorithm) {
      return {
        name: coreutils[2].trim(),
        size: null,
        hashes: { [algorithm]: normalizeHash(coreutils[1]) },
      }
    }
  }

  if (line.includes(',')) return parseCsvLine(line)

  // 松散格式：在空白分词中找出唯一一个哈希，其余部分按原顺序拼回文件名
  const tokens = line.split(/\s+/).filter(Boolean)
  const hashIndex = tokens.findIndex((token) => classifyHash(token) !== null)
  if (hashIndex < 0) return null

  const algorithm = classifyHash(tokens[hashIndex])
  if (!algorithm) return null

  const nameParts = tokens.filter((_, index) => index !== hashIndex)
  const name = nameParts.join(' ')
  if (!name) return null

  return { name, size: null, hashes: { [algorithm]: normalizeHash(tokens[hashIndex]) } }
}

export function parseManifest(text: string): ManifestParseResult {
  const entries: ManifestEntry[] = []
  const errors: string[] = []
  const duplicates: string[] = []
  const seen = new Set<string>()
  let header: HeaderMap | null = null
  let columns: string[] = []

  const lines = text.split(/\r?\n/)

  lines.forEach((line, index) => {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith(';')) return

    if (!header) {
      const detected = detectHeader(trimmed)
      if (detected) {
        header = detected
        columns = detected.columns
        return
      }
    }

    const record = header ? parseCsvWithHeader(trimmed, header) : parseGenericLine(trimmed)
    if (!record) {
      errors.push(`第 ${index + 1} 行无法识别：${trimmed.slice(0, 60)}`)
      return
    }
    if (seen.has(record.name)) {
      duplicates.push(record.name)
      return
    }
    seen.add(record.name)
    entries.push(record)
  })

  return { entries, errors, duplicates, columns }
}

/* ------------------------------------------------------------------ */
/* 导出                                                                */
/* ------------------------------------------------------------------ */

function csvField(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

/** 导出 CSV（带表头），列顺序固定便于二次比对。 */
export function toCsv(
  records: readonly HashRecord[],
  algorithms: readonly HashAlgorithm[] = ['md5', 'sha1', 'sha256'],
): string {
  const header = ['name', 'size', ...algorithms].join(',')
  const rows = records.map((record) =>
    [
      csvField(record.name),
      record.size === null ? '' : String(record.size),
      ...algorithms.map((algorithm) => record.hashes[algorithm] ?? ''),
    ].join(','),
  )
  return [header, ...rows].join('\n')
}

/** 导出为 `sha256sum -c` 可直接校验的清单。 */
export function toChecksumText(
  records: readonly HashRecord[],
  algorithm: HashAlgorithm,
): string {
  return records
    .filter((record) => record.hashes[algorithm])
    .map((record) => `${record.hashes[algorithm]}  ${record.name}`)
    .join('\n')
}

/* ------------------------------------------------------------------ */
/* 比对                                                                */
/* ------------------------------------------------------------------ */

export type ChangeKind = 'added' | 'removed' | 'changed' | 'unchanged' | 'unknown'

export interface ComparisonRow {
  name: string
  kind: ChangeKind
  hashA: string | null
  hashB: string | null
  sizeA: number | null
  sizeB: number | null
}

export interface ComparisonSummary {
  added: number
  removed: number
  changed: number
  unchanged: number
  unknown: number
  total: number
}

export interface ComparisonResult {
  rows: ComparisonRow[]
  summary: ComparisonSummary
}

export const CHANGE_LABELS: Record<ChangeKind, string> = {
  added: '新增',
  removed: '缺失',
  changed: '内容变更',
  unchanged: '一致',
  unknown: '缺少该算法',
}

/**
 * 按文件名比对两份清单。
 * 某个文件在其中一份里没有目标算法的哈希值时记为 unknown，而不是误判为变更。
 */
export function compareManifests(
  a: readonly ManifestEntry[],
  b: readonly ManifestEntry[],
  algorithm: HashAlgorithm,
): ComparisonResult {
  const mapA = new Map(a.map((entry) => [entry.name, entry]))
  const mapB = new Map(b.map((entry) => [entry.name, entry]))
  const names = [...new Set([...mapA.keys(), ...mapB.keys()])].sort((x, y) =>
    x.localeCompare(y, 'zh-CN'),
  )

  const rows: ComparisonRow[] = names.map((name) => {
    const left = mapA.get(name)
    const right = mapB.get(name)
    const hashA = left?.hashes[algorithm] ?? null
    const hashB = right?.hashes[algorithm] ?? null

    let kind: ChangeKind
    if (!left) kind = 'added'
    else if (!right) kind = 'removed'
    else if (!hashA || !hashB) kind = 'unknown'
    else if (hashA === hashB) kind = 'unchanged'
    else kind = 'changed'

    return {
      name,
      kind,
      hashA,
      hashB,
      sizeA: left?.size ?? null,
      sizeB: right?.size ?? null,
    }
  })

  const summary: ComparisonSummary = {
    added: 0,
    removed: 0,
    changed: 0,
    unchanged: 0,
    unknown: 0,
    total: rows.length,
  }
  for (const row of rows) summary[row.kind] += 1

  return { rows, summary }
}

/** 找出清单内哈希相同的文件分组（用于定位重复文件）。 */
export function findDuplicateGroups(
  entries: readonly ManifestEntry[],
  algorithm: HashAlgorithm,
): Array<{ hash: string; names: string[] }> {
  const groups = new Map<string, string[]>()
  for (const entry of entries) {
    const hash = entry.hashes[algorithm]
    if (!hash) continue
    const bucket = groups.get(hash)
    if (bucket) bucket.push(entry.name)
    else groups.set(hash, [entry.name])
  }
  return [...groups.entries()]
    .filter(([, names]) => names.length > 1)
    .map(([hash, names]) => ({ hash, names }))
    .sort((x, y) => y.names.length - x.names.length)
}

/** 生成可读的比对报告文本。 */
export function formatComparisonReport(
  result: ComparisonResult,
  algorithm: HashAlgorithm,
  labelA = '清单 A',
  labelB = '清单 B',
): string {
  const { summary, rows } = result
  const meta = algorithmMeta(algorithm)
  const lines = [
    `哈希清单比对报告（${meta.label}）`,
    `${labelA} / ${labelB}`,
    '',
    `一致      ${summary.unchanged}`,
    `内容变更  ${summary.changed}`,
    `仅存在于 ${labelB}（新增）  ${summary.added}`,
    `仅存在于 ${labelA}（缺失）  ${summary.removed}`,
    `缺少 ${meta.label} 值  ${summary.unknown}`,
    `合计      ${summary.total}`,
    '',
  ]

  for (const kind of ['changed', 'added', 'removed', 'unknown'] as ChangeKind[]) {
    const group = rows.filter((row) => row.kind === kind)
    if (group.length === 0) continue
    lines.push(`── ${CHANGE_LABELS[kind]}（${group.length}）`)
    for (const row of group) {
      lines.push(`  ${row.name}`)
      if (row.hashA) lines.push(`    A: ${row.hashA}`)
      if (row.hashB) lines.push(`    B: ${row.hashB}`)
    }
    lines.push('')
  }

  return lines.join('\n')
}
