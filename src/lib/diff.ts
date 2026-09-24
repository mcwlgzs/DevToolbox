/**
 * 行级文本对比。
 *
 * 策略：先裁掉公共前后缀（真实文本的差异通常只占一小部分），
 * 再对中间部分做 LCS 动态规划；如果中间部分超出规模上限，
 * 退化为「整块替换」的粗粒度结果，并在结果里标记 coarse，由 UI 明确告知用户。
 */

export type DiffOp = 'equal' | 'insert' | 'delete'

export interface DiffLine {
  op: DiffOp
  text: string
  /** 在左侧文本中的行号（1 起），不存在时为 null */
  leftNumber: number | null
  /** 在右侧文本中的行号（1 起），不存在时为 null */
  rightNumber: number | null
}

export interface DiffStats {
  added: number
  removed: number
  unchanged: number
}

export interface DiffResult {
  lines: DiffLine[]
  stats: DiffStats
  /** 输入过大、使用了近似算法 */
  coarse: boolean
}

/** DP 单元格上限，约合两侧各 2000 行。 */
const MAX_DP_CELLS = 4_000_000

export function splitLines(text: string): string[] {
  if (text === '') return []
  return text.replace(/\r\n?/g, '\n').split('\n')
}

export function diffLines(left: string, right: string): DiffResult {
  const a = splitLines(left)
  const b = splitLines(right)

  // 公共前后缀
  let prefix = 0
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix += 1

  let suffix = 0
  while (
    suffix < a.length - prefix &&
    suffix < b.length - prefix &&
    a[a.length - 1 - suffix] === b[b.length - 1 - suffix]
  ) {
    suffix += 1
  }

  const middleA = a.slice(prefix, a.length - suffix)
  const middleB = b.slice(prefix, b.length - suffix)

  const ops: Array<{ op: DiffOp; text: string }> = []
  for (let i = 0; i < prefix; i += 1) ops.push({ op: 'equal', text: a[i] })

  let coarse = false
  if (middleA.length > 0 || middleB.length > 0) {
    if (middleA.length * middleB.length <= MAX_DP_CELLS) {
      ops.push(...diffWithLcs(middleA, middleB))
    } else {
      coarse = true
      for (const text of middleA) ops.push({ op: 'delete', text })
      for (const text of middleB) ops.push({ op: 'insert', text })
    }
  }

  for (let i = a.length - suffix; i < a.length; i += 1) ops.push({ op: 'equal', text: a[i] })

  // 编行号
  const lines: DiffLine[] = []
  let leftNumber = 0
  let rightNumber = 0
  const stats: DiffStats = { added: 0, removed: 0, unchanged: 0 }

  for (const item of ops) {
    if (item.op === 'equal') {
      leftNumber += 1
      rightNumber += 1
      stats.unchanged += 1
      lines.push({ op: 'equal', text: item.text, leftNumber, rightNumber })
    } else if (item.op === 'delete') {
      leftNumber += 1
      stats.removed += 1
      lines.push({ op: 'delete', text: item.text, leftNumber, rightNumber: null })
    } else {
      rightNumber += 1
      stats.added += 1
      lines.push({ op: 'insert', text: item.text, leftNumber: null, rightNumber })
    }
  }

  return { lines, stats, coarse }
}

/** 标准 LCS 动态规划 + 回溯，规模已在调用方限制。 */
function diffWithLcs(a: string[], b: string[]): Array<{ op: DiffOp; text: string }> {
  const n = a.length
  const m = b.length
  const width = m + 1
  const dp = new Uint32Array((n + 1) * width)

  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[i * width + j] =
        a[i] === b[j]
          ? dp[(i + 1) * width + (j + 1)] + 1
          : Math.max(dp[(i + 1) * width + j], dp[i * width + (j + 1)])
    }
  }

  const ops: Array<{ op: DiffOp; text: string }> = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ op: 'equal', text: a[i] })
      i += 1
      j += 1
    } else if (dp[(i + 1) * width + j] >= dp[i * width + (j + 1)]) {
      ops.push({ op: 'delete', text: a[i] })
      i += 1
    } else {
      ops.push({ op: 'insert', text: b[j] })
      j += 1
    }
  }
  while (i < n) {
    ops.push({ op: 'delete', text: a[i] })
    i += 1
  }
  while (j < m) {
    ops.push({ op: 'insert', text: b[j] })
    j += 1
  }
  return ops
}

/** 生成统一 diff（unified）文本，可直接贴进 code review。 */
export function toUnifiedDiff(
  result: DiffResult,
  leftLabel = 'a',
  rightLabel = 'b',
  context = 3,
): string {
  const { lines } = result
  const out: string[] = [`--- ${leftLabel}`, `+++ ${rightLabel}`]

  const changed = lines
    .map((line, index) => (line.op === 'equal' ? -1 : index))
    .filter((index) => index >= 0)

  if (changed.length === 0) return out.join('\n')

  // 合并相邻变更块（含上下文），生成 hunk
  const hunks: Array<[number, number]> = []
  for (const index of changed) {
    const start = Math.max(0, index - context)
    const end = Math.min(lines.length - 1, index + context)
    const last = hunks[hunks.length - 1]
    if (last && start <= last[1] + 1) last[1] = Math.max(last[1], end)
    else hunks.push([start, end])
  }

  for (const [start, end] of hunks) {
    const slice = lines.slice(start, end + 1)
    const leftStart = slice.find((line) => line.leftNumber !== null)?.leftNumber ?? 0
    const rightStart = slice.find((line) => line.rightNumber !== null)?.rightNumber ?? 0
    const leftCount = slice.filter((line) => line.leftNumber !== null).length
    const rightCount = slice.filter((line) => line.rightNumber !== null).length

    out.push(`@@ -${leftStart},${leftCount} +${rightStart},${rightCount} @@`)
    for (const line of slice) {
      const marker = line.op === 'equal' ? ' ' : line.op === 'delete' ? '-' : '+'
      out.push(`${marker}${line.text}`)
    }
  }

  return out.join('\n')
}

export interface SideBySideRow {
  left: DiffLine | null
  right: DiffLine | null
  kind: 'equal' | 'change' | 'delete' | 'insert'
}

/** 并排视图：把连续的删除/新增配对成同一行，便于左右对照。 */
export function toSideBySide(result: DiffResult): SideBySideRow[] {
  const rows: SideBySideRow[] = []
  const lines = result.lines
  let index = 0

  while (index < lines.length) {
    const line = lines[index]
    if (line.op === 'equal') {
      rows.push({ left: line, right: line, kind: 'equal' })
      index += 1
      continue
    }

    const deletes: DiffLine[] = []
    const inserts: DiffLine[] = []
    while (index < lines.length && lines[index].op === 'delete') {
      deletes.push(lines[index])
      index += 1
    }
    while (index < lines.length && lines[index].op === 'insert') {
      inserts.push(lines[index])
      index += 1
    }

    const pairCount = Math.max(deletes.length, inserts.length)
    for (let i = 0; i < pairCount; i += 1) {
      const left = deletes[i] ?? null
      const right = inserts[i] ?? null
      rows.push({
        left,
        right,
        kind: left && right ? 'change' : left ? 'delete' : 'insert',
      })
    }
  }

  return rows
}
