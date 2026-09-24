/** CSV 解析与 JSON 互转。支持引号包裹、字段内分隔符与换行。 */

export interface CsvOptions {
  delimiter: string
  hasHeader: boolean
  trimValues: boolean
}

export const DEFAULT_CSV_OPTIONS: CsvOptions = {
  delimiter: ',',
  hasHeader: true,
  trimValues: false,
}

export const DELIMITER_CHOICES: ReadonlyArray<{ value: string; label: string }> = [
  { value: ',', label: '逗号 ,' },
  { value: ';', label: '分号 ;' },
  { value: '\t', label: '制表符 Tab' },
  { value: '|', label: '竖线 |' },
]

export interface CsvParseResult {
  rows: string[][]
  error: string | null
  /** 第一行的列数，用于提示列数不一致 */
  columns: number
}

/** 从首行推断分隔符：取出现次数最多的候选。 */
export function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/)[0] ?? ''
  const candidates = [',', ';', '\t', '|']
  let best = ','
  let bestCount = 0
  for (const candidate of candidates) {
    const count = firstLine.split(candidate).length - 1
    if (count > bestCount) {
      best = candidate
      bestCount = count
    }
  }
  return best
}

/** 逐字符解析，正确处理双引号包裹与 "" 转义。 */
export function parseCsv(text: string, options: CsvOptions = DEFAULT_CSV_OPTIONS): CsvParseResult {
  const source = text.replace(/^\uFEFF/, '')
  if (!source.trim()) return { rows: [], error: null, columns: 0 }

  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let index = 0

  const pushField = () => {
    row.push(options.trimValues ? field.trim() : field)
    field = ''
  }
  const pushRow = () => {
    pushField()
    rows.push(row)
    row = []
  }

  while (index < source.length) {
    const char = source[index]

    if (inQuotes) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          field += '"'
          index += 2
          continue
        }
        inQuotes = false
        index += 1
        continue
      }
      field += char
      index += 1
      continue
    }

    if (char === '"' && field === '') {
      inQuotes = true
      index += 1
      continue
    }
    if (char === options.delimiter) {
      pushField()
      index += 1
      continue
    }
    if (char === '\r') {
      index += 1
      continue
    }
    if (char === '\n') {
      pushRow()
      index += 1
      continue
    }
    field += char
    index += 1
  }

  if (inQuotes) {
    return { rows, error: '存在没有闭合的双引号，请检查字段内的引号是否转义为 ""', columns: rows[0]?.length ?? 0 }
  }

  // 末尾没有换行时补最后一行；纯空白行忽略
  if (field !== '' || row.length > 0) pushRow()

  const cleaned = rows.filter((item) => !(item.length === 1 && item[0] === ''))
  return { rows: cleaned, error: null, columns: cleaned[0]?.length ?? 0 }
}

export interface CsvToJsonResult {
  ok: boolean
  error: string | null
  json: string
  count: number
  columns: string[]
}

/** CSV → JSON。有表头时输出对象数组，否则输出二维数组。 */
export function csvToJson(text: string, options: CsvOptions = DEFAULT_CSV_OPTIONS): CsvToJsonResult {
  const parsed = parseCsv(text, options)
  if (parsed.error) return { ok: false, error: parsed.error, json: '', count: 0, columns: [] }
  if (parsed.rows.length === 0) return { ok: true, error: null, json: '[]', count: 0, columns: [] }

  if (!options.hasHeader) {
    return {
      ok: true,
      error: null,
      json: JSON.stringify(parsed.rows, null, 2),
      count: parsed.rows.length,
      columns: [],
    }
  }

  const header = parsed.rows[0]
  const body = parsed.rows.slice(1)
  const objects = body.map((cells) => {
    const record: Record<string, string> = {}
    header.forEach((key, columnIndex) => {
      const name = key === '' ? `column_${columnIndex + 1}` : key
      record[name] = cells[columnIndex] ?? ''
    })
    return record
  })

  return { ok: true, error: null, json: JSON.stringify(objects, null, 2), count: objects.length, columns: header }
}

export interface JsonToCsvResult {
  ok: boolean
  error: string | null
  csv: string
  count: number
  columns: string[]
}

/** 生成 CSV 文本，自动给含分隔符 / 引号 / 换行的字段加引号。 */
export function rowsToCsv(rows: Array<Array<string | number | null | undefined>>, delimiter: string): string {
  const escape = (value: string | number | null | undefined) => {
    const text = value === null || value === undefined ? '' : String(value)
    return /["\n\r]/.test(text) || text.includes(delimiter) ? `"${text.replace(/"/g, '""')}"` : text
  }
  return rows.map((row) => row.map(escape).join(delimiter)).join('\n')
}

/** JSON → CSV。支持对象数组、二维数组与单个对象。 */
export function jsonToCsv(jsonText: string, delimiter = ','): JsonToCsvResult {
  const trimmed = jsonText.trim()
  if (!trimmed) return { ok: true, error: null, csv: '', count: 0, columns: [] }

  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch (error) {
    return {
      ok: false,
      error: `JSON 解析失败：${(error as Error).message}`,
      csv: '',
      count: 0,
      columns: [],
    }
  }

  const fail = (message: string): JsonToCsvResult => ({ ok: false, error: message, csv: '', count: 0, columns: [] })

  const flatten = (value: unknown): string | number => {
    if (value === null || value === undefined) return ''
    if (typeof value === 'object') return JSON.stringify(value)
    return value as string | number
  }

  // 二维数组
  if (Array.isArray(parsed) && parsed.every((item) => Array.isArray(item))) {
    const rows = parsed as unknown[][]
    const csv = rowsToCsv(rows.map((row) => row.map(flatten)), delimiter)
    return { ok: true, error: null, csv, count: rows.length, columns: [] }
  }

  // 数组，元素可能是对象或标量
  if (Array.isArray(parsed)) {
    const isObjectArray = parsed.every((item) => item !== null && typeof item === 'object' && !Array.isArray(item))
    if (!isObjectArray) {
      const rows = parsed.map((item) => [flatten(item)])
      return { ok: true, error: null, csv: rowsToCsv(rows, delimiter), count: rows.length, columns: ['value'] }
    }

    const objects = parsed as Array<Record<string, unknown>>
    const columns: string[] = []
    for (const object of objects) {
      for (const key of Object.keys(object)) {
        if (!columns.includes(key)) columns.push(key)
      }
    }
    const rows: Array<Array<string | number>> = [columns]
    for (const object of objects) {
      rows.push(columns.map((key) => flatten(object[key])))
    }
    return { ok: true, error: null, csv: rowsToCsv(rows, delimiter), count: objects.length, columns }
  }

  // 单个对象
  if (parsed !== null && typeof parsed === 'object') {
    const object = parsed as Record<string, unknown>
    const columns = Object.keys(object)
    const rows: Array<Array<string | number>> = [columns, columns.map((key) => flatten(object[key]))]
    return { ok: true, error: null, csv: rowsToCsv(rows, delimiter), count: 1, columns }
  }

  return fail('JSON 顶层需要是数组或对象；标量无法转换为表格')
}
