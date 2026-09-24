/**
 * SQL 格式化与压缩。
 *
 * 先分词（字符串、注释、标识符、数字、符号），再按子句关键字换行缩进。
 * 关键前提：**绝不改写字符串与注释的内容**，关键字大小写转换只作用于未加引号的单词。
 */

export type SqlKeywordCase = 'upper' | 'lower' | 'preserve'

export interface SqlFormatOptions {
  keywordCase: SqlKeywordCase
  /** 缩进空格数 */
  indent: number
  /** 逗号后换行（列表逐行展示） */
  commaNewline: boolean
  /** 语句之间插入的空行数 */
  blankLines: number
}

export const DEFAULT_SQL_OPTIONS: SqlFormatOptions = {
  keywordCase: 'upper',
  indent: 2,
  commaNewline: true,
  blankLines: 1,
}

export type SqlTokenType =
  | 'whitespace'
  | 'lineComment'
  | 'blockComment'
  | 'string'
  | 'quotedIdentifier'
  | 'number'
  | 'word'
  | 'punct'

export interface SqlToken {
  type: SqlTokenType
  value: string
}

export interface SqlResult {
  ok: boolean
  error: string | null
  sql: string
}

/** 会另起一行的子句关键字（多词关键字用空格分隔，比较时归一化）。 */
const CLAUSE_KEYWORDS = new Set([
  'SELECT', 'FROM', 'WHERE', 'GROUP BY', 'ORDER BY', 'HAVING', 'LIMIT', 'OFFSET',
  'UNION', 'UNION ALL', 'INTERSECT', 'EXCEPT', 'WITH', 'RETURNING', 'WINDOW',
  'INSERT INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE FROM', 'CREATE TABLE',
  'ALTER TABLE', 'DROP TABLE', 'TRUNCATE TABLE', 'ON CONFLICT',
  'LEFT JOIN', 'RIGHT JOIN', 'INNER JOIN', 'OUTER JOIN', 'FULL JOIN', 'CROSS JOIN',
  'LEFT OUTER JOIN', 'RIGHT OUTER JOIN', 'FULL OUTER JOIN', 'JOIN',
])

/** 会另起一行的布尔连接词（额外缩进一层）。 */
const BOOLEAN_KEYWORDS = new Set(['AND', 'OR', 'XOR'])

/** 需要保留大写的常见关键字（用于 preserve 之外的大小写转换）。 */
const KEYWORDS = new Set([
  ...CLAUSE_KEYWORDS,
  ...BOOLEAN_KEYWORDS,
  'AS', 'ON', 'USING', 'IN', 'NOT', 'NULL', 'IS', 'LIKE', 'ILIKE', 'BETWEEN', 'EXISTS',
  'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'DISTINCT', 'ALL', 'ANY', 'SOME', 'ASC', 'DESC',
  'PRIMARY KEY', 'FOREIGN KEY', 'REFERENCES', 'DEFAULT', 'UNIQUE', 'CHECK', 'INDEX',
  'INT', 'INTEGER', 'BIGINT', 'SMALLINT', 'VARCHAR', 'CHAR', 'TEXT', 'BOOLEAN', 'DATE',
  'TIMESTAMP', 'DECIMAL', 'NUMERIC', 'FLOAT', 'DOUBLE', 'SERIAL', 'UUID', 'JSON', 'JSONB',
  'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'COALESCE', 'NULLIF', 'CAST', 'OVER', 'PARTITION BY',
  'ROWS', 'RANGE', 'PRECEDING', 'FOLLOWING', 'UNBOUNDED', 'CURRENT ROW',
  'IF', 'IFNULL', 'IF EXISTS', 'IF NOT EXISTS', 'BEGIN', 'COMMIT', 'ROLLBACK', 'GRANT', 'REVOKE',
])

/** 常见函数名：这些关键字后面紧跟的括号是调用，不加空格（COUNT(*) 而不是 COUNT (*)）。 */
const FUNCTION_KEYWORDS = new Set([
  'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'COALESCE', 'NULLIF', 'CAST', 'IFNULL',
  'ROW_NUMBER', 'RANK', 'DENSE_RANK', 'LAG', 'LEAD', 'NTILE',
  'SUBSTRING', 'SUBSTR', 'TRIM', 'LTRIM', 'RTRIM', 'UPPER', 'LOWER', 'LENGTH',
  'ROUND', 'FLOOR', 'CEIL', 'CEILING', 'ABS', 'POWER', 'SQRT', 'MOD',
  'NOW', 'DATE_TRUNC', 'EXTRACT', 'CONVERT', 'GREATEST', 'LEAST', 'CONCAT',
  'JSON_EXTRACT', 'JSON_VALUE', 'ARRAY_AGG', 'STRING_AGG', 'GROUP_CONCAT',
])

/** 多词关键字：按最长优先匹配，避免把 GROUP BY 拆成 GROUP + BY。 */
const MULTI_WORD_KEYWORDS = [...KEYWORDS]
  .filter((keyword) => keyword.includes(' '))
  .sort((a, b) => b.length - a.length)

function isNameStart(char: string): boolean {
  return /[A-Za-z_@#$]/.test(char)
}

function isNameChar(char: string): boolean {
  return /[A-Za-z0-9_@#$]/.test(char)
}

/** 分词。遇到未闭合的字符串或注释会返回错误。 */
export function tokenizeSql(sql: string): { tokens: SqlToken[]; error: string | null } {
  const tokens: SqlToken[] = []
  let index = 0

  while (index < sql.length) {
    const char = sql[index]

    if (/\s/.test(char)) {
      const start = index
      while (index < sql.length && /\s/.test(sql[index])) index += 1
      tokens.push({ type: 'whitespace', value: sql.slice(start, index) })
      continue
    }

    // 行注释：-- 或 #（MySQL）。`#>` 是 PostgreSQL 运算符，要留给下面的运算符分支
    if (sql.startsWith('--', index) || (char === '#' && sql[index + 1] !== '>')) {
      const start = index
      while (index < sql.length && sql[index] !== '\n') index += 1
      tokens.push({ type: 'lineComment', value: sql.slice(start, index) })
      continue
    }

    // 块注释
    if (sql.startsWith('/*', index)) {
      const end = sql.indexOf('*/', index + 2)
      if (end < 0) return { tokens, error: `块注释没有闭合（位置 ${index}）` }
      tokens.push({ type: 'blockComment', value: sql.slice(index, end + 2) })
      index = end + 2
      continue
    }

    // PostgreSQL 美元引用字符串：$$...$$ 或 $tag$...$tag$
    // 必须在这里整体吞掉：否则 $$ 内的内容会被当成普通单词重新排版（等于改写用户数据），
    // 且里面的分号会被 countStatements 当成语句分隔。
    if (char === '$') {
      const opening = /^\$([A-Za-z_\u0080-\uffff][A-Za-z0-9_\u0080-\uffff]*)?\$/.exec(sql.slice(index))
      if (opening) {
        const delimiter = opening[0]
        const end = sql.indexOf(delimiter, index + delimiter.length)
        if (end < 0) return { tokens, error: `美元引用字符串没有闭合（位置 ${index}）` }
        tokens.push({ type: 'string', value: sql.slice(index, end + delimiter.length) })
        index = end + delimiter.length
        continue
      }
    }

    // 字符串 / 引号标识符
    if (char === "'" || char === '"' || char === '`') {
      const isIdentifier = char !== "'"
      const start = index
      index += 1
      let closed = false
      while (index < sql.length) {
        if (sql[index] === '\\' && char === "'") {
          index += 2
          continue
        }
        if (sql[index] === char) {
          if (sql[index + 1] === char) {
            index += 2
            continue
          }
          index += 1
          closed = true
          break
        }
        index += 1
      }
      if (!closed) return { tokens, error: `引号没有闭合（位置 ${start}）` }
      tokens.push({
        type: isIdentifier ? 'quotedIdentifier' : 'string',
        value: sql.slice(start, index),
      })
      continue
    }

    // SQL Server 风格 [标识符]
    if (char === '[') {
      const end = sql.indexOf(']', index + 1)
      if (end < 0) return { tokens, error: `方括号标识符没有闭合（位置 ${index}）` }
      tokens.push({ type: 'quotedIdentifier', value: sql.slice(index, end + 1) })
      index = end + 1
      continue
    }

    // 数字
    if (/\d/.test(char) || (char === '.' && /\d/.test(sql[index + 1] ?? ''))) {
      const start = index
      while (index < sql.length && /[\d.eExX_a-fA-F]/.test(sql[index])) {
        // 只在 0x 前缀或指数位置允许字母，避免吞掉后续标识符
        if (/[a-fA-F]/.test(sql[index]) && !/^0[xX]/.test(sql.slice(start))) break
        if (/[eE]/.test(sql[index]) && !/[+\-\d]/.test(sql[index + 1] ?? '')) break
        index += 1
      }
      tokens.push({ type: 'number', value: sql.slice(start, index) })
      continue
    }

    // 单词
    if (isNameStart(char)) {
      const start = index
      while (index < sql.length && isNameChar(sql[index])) index += 1
      tokens.push({ type: 'word', value: sql.slice(start, index) })
      continue
    }

    // 运算符与标点
    const threeChar = sql.slice(index, index + 3)
    if (['->>', '#>>', '<=>', '!~~', '~~*', '!~*'].includes(threeChar)) {
      tokens.push({ type: 'punct', value: threeChar })
      index += 3
      continue
    }
    const twoChar = sql.slice(index, index + 2)
    // `#>` 是 PostgreSQL 的 JSON 取值运算符，必须早于 `#` 行注释判断，
    // 否则 `data#>'{a}'` 会被整段当成 MySQL 的 # 注释，语义完全变了
    if (['<=', '>=', '<>', '!=', '||', '::', '->', '=>', '#>'].includes(twoChar)) {
      tokens.push({ type: 'punct', value: twoChar })
      index += 2
      continue
    }
    tokens.push({ type: 'punct', value: char })
    index += 1
  }

  return { tokens, error: null }
}

interface MeaningfulToken {
  /** 第一个 token（用于取位置与类型） */
  token: SqlToken
  /** 完整原文；多词关键字已拼成一个（保留原写法的大小写） */
  text: string
  /** 归一化大写形式 */
  upper: string
  /** 该条目消耗的 token 数 */
  phraseLength: number
  /** 是否关键字 */
  isKeyword: boolean
}

/** 把 token 流合并多词关键字，便于后续判断。 */
function annotate(tokens: SqlToken[]): MeaningfulToken[] {
  const meaningful = tokens.filter((token) => token.type !== 'whitespace')
  const result: MeaningfulToken[] = []

  for (let index = 0; index < meaningful.length; index += 1) {
    const token = meaningful[index]
    const base = token.type === 'word' ? token.value.toUpperCase() : token.value

    if (token.type === 'word') {
      let matchedPhrase: string | null = null
      let matchedParts: string[] = []

      for (const phrase of MULTI_WORD_KEYWORDS) {
        const parts = phrase.split(' ')
        // 首词必须与当前 token 相同，否则会张冠李戴
        // （曾经的 bug：看到 `b from` 就把 b 当成 DELETE FROM 的开头）
        if (parts[0] !== base) continue

        let matched = true
        for (let offset = 1; offset < parts.length; offset += 1) {
          const next = meaningful[index + offset]
          if (!next || next.type !== 'word' || next.value.toUpperCase() !== parts[offset]) {
            matched = false
            break
          }
        }
        if (matched) {
          matchedPhrase = phrase
          matchedParts = parts
          break
        }
      }

      if (matchedPhrase) {
        result.push({
          token,
          text: meaningful
            .slice(index, index + matchedParts.length)
            .map((item) => item.value)
            .join(' '),
          upper: matchedPhrase,
          phraseLength: matchedParts.length,
          isKeyword: KEYWORDS.has(matchedPhrase),
        })
        index += matchedParts.length - 1
        continue
      }
    }

    result.push({
      token,
      text: token.value,
      upper: base,
      phraseLength: 1,
      isKeyword: token.type === 'word' && KEYWORDS.has(base),
    })
  }

  return result
}

function applyCase(value: string, keywordCase: SqlKeywordCase): string {
  if (keywordCase === 'upper') return value.toUpperCase()
  if (keywordCase === 'lower') return value.toLowerCase()
  return value
}

function formatValue(item: MeaningfulToken, options: SqlFormatOptions): string {
  return item.isKeyword ? applyCase(item.text, options.keywordCase) : item.text
}

/** 该条目是否是一个「值」——用于判断 +/- 是一元符号还是二元运算符。 */
function isValueLike(item: MeaningfulToken | undefined): boolean {
  if (!item) return false
  if (item.token.type === 'number' || item.token.type === 'string' || item.token.type === 'quotedIdentifier') return true
  if (item.token.type === 'word') return !item.isKeyword
  return item.token.type === 'punct' && (item.token.value === ')' || item.token.value === ']')
}

/** 格式化 SQL。 */
export function formatSql(sql: string, options: Partial<SqlFormatOptions> = {}): SqlResult {
  const merged = { ...DEFAULT_SQL_OPTIONS, ...options }
  const { tokens, error } = tokenizeSql(sql)
  if (error) return { ok: false, error, sql: '' }
  if (!sql.trim()) return { ok: true, error: null, sql: '' }

  const items = annotate(tokens)
  const indentUnit = ' '.repeat(merged.indent)
  const lines: string[] = []
  /** 当前行内容与它的缩进层级 */
  let current = ''
  let currentIndent = 0
  /** 子查询深度：每进一层子查询，子句关键字再缩进两格 */
  let depth = 0
  let parenStack: boolean[] = []
  /** 当前子句「内容」的缩进层级（AND / OR 与注释都对齐到它） */
  let clauseContentIndent = 1
  /** 上一个条目是一元正负号时，本条目不再补空格 */
  let pendingGlue = false

  /** 子查询第 d 层的子句关键字缩进层级；第 0 层为顶格。 */
  const clauseIndent = (d: number) => (d === 0 ? 0 : d * 2)

  const flush = () => {
    const text = current.trim()
    if (text) lines.push(indentUnit.repeat(Math.max(0, currentIndent)) + text)
    current = ''
  }
  /** 断行并设定下一行的缩进 */
  const breakTo = (indent: number) => {
    flush()
    currentIndent = indent
  }

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]
    const { token, upper } = item
    const previous = items[index - 1]
    const insideSubquery = parenStack.includes(true)
    const glued = pendingGlue
    pendingGlue = false

    if (token.type === 'lineComment' || token.type === 'blockComment') {
      breakTo(clauseContentIndent)
      current = token.value.trimEnd()
      flush()
      currentIndent = clauseContentIndent
      continue
    }

    if (CLAUSE_KEYWORDS.has(upper)) {
      // 顶层子句从第 0 层重新开始；子查询里的子句跟在括号缩进之后
      if (!insideSubquery) depth = 0
      const indent = clauseIndent(depth)
      breakTo(indent)
      current = applyCase(item.text, merged.keywordCase)
      // 关键字独占一行，后面的内容缩进一层
      flush()
      clauseContentIndent = indent + 1
      currentIndent = clauseContentIndent
      continue
    }

    if (BOOLEAN_KEYWORDS.has(upper)) {
      breakTo(clauseContentIndent)
      current = `${applyCase(item.text, merged.keywordCase)} `
      continue
    }

    if (token.type === 'punct' && token.value === '(') {
      const nextIsSubquery = items[index + 1] ? CLAUSE_KEYWORDS.has(items[index + 1].upper) : false
      // 函数调用不加空格（COUNT(*)）；关键字后的括号保留空格（IN (1, 2)）
      const tightCall =
        Boolean(previous) &&
        previous!.token.type === 'word' &&
        (!previous!.isKeyword || FUNCTION_KEYWORDS.has(previous!.upper))
      const needsSpaceBeforeParen =
        !tightCall && current !== '' && !current.endsWith(' ') && !current.endsWith('(')
      current += needsSpaceBeforeParen ? ' (' : '('
      parenStack.push(nextIsSubquery)
      if (nextIsSubquery) {
        // 括号单独占一行，子查询里的子句再缩进一层
        flush()
        depth += 1
        currentIndent = clauseIndent(depth)
      }
      continue
    }

    if (token.type === 'punct' && token.value === ')') {
      const wasSubquery = parenStack.pop() ?? false
      if (wasSubquery) {
        depth = Math.max(0, depth - 1)
        // 右括号与它的左括号对齐
        breakTo(clauseIndent(depth) + 1)
      }
      current = current.trimEnd() + ')'
      continue
    }

    if (token.type === 'punct' && token.value === ',') {
      current = current.trimEnd() + ','
      if (merged.commaNewline) flush()
      else current += ' '
      continue
    }

    if (token.type === 'punct' && token.value === ';') {
      current = current.trimEnd() + ';'
      flush()
      for (let extra = 0; extra < merged.blankLines; extra += 1) lines.push('')
      depth = 0
      currentIndent = 0
      clauseContentIndent = 1
      parenStack = []
      continue
    }

    const value = formatValue(item, merged)
    /** 一元正负号：前面按常规加空格，后面的数字要贴紧（`-1` 而不是 `- 1`） */
    const unarySign =
      token.type === 'punct' &&
      (token.value === '-' || token.value === '+') &&
      !isValueLike(previous)
    const needsSpace =
      !glued &&
      current !== '' &&
      !current.endsWith(' ') &&
      !current.endsWith('(') &&
      !current.endsWith('.') &&
      value !== '.' &&
      value !== ')' &&
      value !== ',' &&
      !(previous && previous.token.type === 'punct' && previous.token.value === '.') &&
      !(item.token.type === 'punct' && item.token.value === '::') &&
      !(previous && previous.token.type === 'punct' && previous.token.value === '::')

    current += needsSpace ? ` ${value}` : value
    pendingGlue = unarySign
  }

  flush()

  // 折叠多余空行；允许的空行数由 blankLines 决定。
  // 这里不能用固定的 /\n{3,}/ 正则——那样 blankLines=2 会退化成 1，选项形同虚设。
  const cleanedLines: string[] = []
  let blankRun = 0
  for (const line of lines) {
    if (line === '') {
      blankRun += 1
      if (blankRun > merged.blankLines) continue
    } else {
      blankRun = 0
    }
    cleanedLines.push(line)
  }

  return { ok: true, error: null, sql: cleanedLines.join('\n').trim() }
}

/** 压缩时紧贴前一个 token（中间不留空格）的标点。 */
const MINIFY_TIGHT_BEFORE = new Set([')', ',', ';', '.', '::'])
/** 压缩时后面不加空格的标点。 */
const MINIFY_TIGHT_AFTER = new Set(['(', ',', '.', '::'])
/** 两侧可以安全去掉空格的比较 / 取值运算符。 */
const MINIFY_SAFE_OPERATORS = new Set([
  '=', '<', '>', '<=', '>=', '<>', '!=', '<=>', '->', '->>', '#>', '#>>', '=>',
])
/** 与相邻符号贴在一起会产生新符号（-- 、/* 、||）的运算符，保留空格。 */
const MINIFY_RISKY = new Set(['+', '-', '/', '*', '%', '|', '||', '&'])

function isFunctionName(token: SqlToken | undefined): boolean {
  if (!token || token.type !== 'word') return false
  const upper = token.value.toUpperCase()
  return !KEYWORDS.has(upper) || FUNCTION_KEYWORDS.has(upper)
}

/**
 * 压缩成尽量少的空白。**字符串与注释原样保留**——绝不按字符做正则替换，
 * 否则 `'a , b'` 这种字符串内容会被一起改写。
 */
export function minifySql(sql: string): SqlResult {
  const { tokens, error } = tokenizeSql(sql)
  if (error) return { ok: false, error, sql: '' }
  if (!sql.trim()) return { ok: true, error: null, sql: '' }

  const meaningful = tokens.filter((token) => token.type !== 'whitespace')
  let out = ''

  for (let index = 0; index < meaningful.length; index += 1) {
    const token = meaningful[index]
    const previous = meaningful[index - 1]
    const isPunct = token.type === 'punct'
    const prevIsPunct = previous?.type === 'punct'

    if (token.type === 'lineComment') {
      // 行注释会把后面的语句注释掉，压缩时必须保留换行
      out = `${out.trimEnd()} ${token.value}\n`
      continue
    }

    let needsSpace = index > 0 && out !== '' && !out.endsWith('\n')
    if (needsSpace) {
      if (isPunct && MINIFY_TIGHT_BEFORE.has(token.value)) needsSpace = false
      else if (prevIsPunct && MINIFY_TIGHT_AFTER.has(previous!.value)) needsSpace = false
      else if (isPunct && token.value === '(') needsSpace = !isFunctionName(previous)
      else if (
        (isPunct && MINIFY_SAFE_OPERATORS.has(token.value)) ||
        (prevIsPunct && MINIFY_SAFE_OPERATORS.has(previous!.value))
      ) {
        // 两侧都不是 +/-/*/| 这类贴在一起会变成别的符号的运算符时，才可以去掉空格
        const left = previous?.type === 'punct' ? previous.value : ''
        const right = isPunct ? token.value : ''
        if (!MINIFY_RISKY.has(left) && !MINIFY_RISKY.has(right)) needsSpace = false
      }
    }

    out += (needsSpace ? ' ' : '') + token.value
  }

  return { ok: true, error: null, sql: out.replace(/\s+$/g, '').trim() }
}

/** 粗略统计语句数量（按分号切分，忽略字符串与注释内的分号）。 */
export function countStatements(sql: string): number {
  const { tokens } = tokenizeSql(sql)
  let count = 0
  let hasContent = false
  for (const token of tokens) {
    if (token.type === 'whitespace' || token.type === 'lineComment' || token.type === 'blockComment') continue
    // 连续的分号是空语句，不该各算一条
    if (token.type === 'punct' && token.value === ';') {
      if (hasContent) count += 1
      hasContent = false
      continue
    }
    hasContent = true
  }
  return count + (hasContent ? 1 : 0)
}

export const SQL_SAMPLE = `select u.id,u.name,count(o.id) as order_count from users u left join orders o on o.user_id=u.id where u.status='active' and o.created_at>='2024-01-01' group by u.id,u.name having count(o.id)>3 order by order_count desc limit 20;`

export const SQL_DIALECT_NOTES: ReadonlyArray<{ label: string; text: string }> = [
  { label: '通用', text: '关键字大小写、换行缩进都不影响执行结果，可以放心格式化。' },
  { label: 'MySQL', text: '反引号 ` 包裹的标识符与 # 行注释会被正确识别，不会被改写。' },
  { label: 'PostgreSQL', text: '支持 :: 转型、-> / ->> JSON 取值与 $$ 字符串（视为普通单词处理）。' },
  { label: 'SQL Server', text: '[方括号] 标识符会被识别为整体，内部内容不会被改动。' },
]
