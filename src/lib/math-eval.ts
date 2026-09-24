/**
 * 数学表达式求值：分词 → 调度场算法转逆波兰 → 栈式求值。
 * 纯函数实现，不使用 eval()，因此可以安全地对任意输入求值。
 */

export type AngleMode = 'rad' | 'deg'

export interface MathEvalOptions {
  angleMode: AngleMode
  /** 结果保留的有效数字位数 */
  precision: number
}

export const DEFAULT_MATH_OPTIONS: MathEvalOptions = { angleMode: 'rad', precision: 12 }

export interface MathEvalSuccess {
  ok: true
  value: number
  /** 归一化后的表达式，便于确认解析结果 */
  normalized: string
}

export interface MathEvalFailure {
  ok: false
  error: string
  position: number | null
}

export type MathEvalResult = MathEvalSuccess | MathEvalFailure

/* ------------------------------------------------------------------ */
/* 常量与函数                                                          */
/* ------------------------------------------------------------------ */

export const MATH_CONSTANTS: Record<string, number> = {
  pi: Math.PI,
  'π': Math.PI,
  e: Math.E,
  tau: Math.PI * 2,
  inf: Number.POSITIVE_INFINITY,
  infinity: Number.POSITIVE_INFINITY,
}

interface FunctionDef {
  min: number
  max: number
  /** 入参按角度处理（三角函数） */
  angle?: boolean
  /** 返回值按角度输出（反三角函数） */
  returnsAngle?: boolean
  fn: (...args: number[]) => number
}

const gcdOf = (a: number, b: number): number => {
  let x = Math.abs(Math.trunc(a))
  let y = Math.abs(Math.trunc(b))
  while (y !== 0) {
    const next = x % y
    x = y
    y = next
  }
  return x
}

export function factorial(value: number): number {
  if (!Number.isInteger(value) || value < 0) return Number.NaN
  if (value > 170) return Number.POSITIVE_INFINITY
  let result = 1
  for (let index = 2; index <= value; index += 1) result *= index
  return result
}

export const MATH_FUNCTIONS: Record<string, FunctionDef> = {
  sin: { min: 1, max: 1, angle: true, fn: Math.sin },
  cos: { min: 1, max: 1, angle: true, fn: Math.cos },
  tan: { min: 1, max: 1, angle: true, fn: Math.tan },
  asin: { min: 1, max: 1, returnsAngle: true, fn: Math.asin },
  acos: { min: 1, max: 1, returnsAngle: true, fn: Math.acos },
  atan: { min: 1, max: 1, returnsAngle: true, fn: Math.atan },
  atan2: { min: 2, max: 2, returnsAngle: true, fn: Math.atan2 },
  sinh: { min: 1, max: 1, fn: Math.sinh },
  cosh: { min: 1, max: 1, fn: Math.cosh },
  tanh: { min: 1, max: 1, fn: Math.tanh },
  sqrt: { min: 1, max: 1, fn: Math.sqrt },
  cbrt: { min: 1, max: 1, fn: Math.cbrt },
  abs: { min: 1, max: 1, fn: Math.abs },
  ln: { min: 1, max: 1, fn: Math.log },
  log: {
    min: 1,
    max: 2,
    fn: (value: number, base?: number) => {
      if (base === undefined) return Math.log10(value)
      // 底数必须为正且不等于 1，否则结果没有定义（返回 NaN 会被上层报为「不是有效数字」）
      if (!(base > 0) || base === 1) return Number.NaN
      return Math.log(value) / Math.log(base)
    },
  },
  log2: { min: 1, max: 1, fn: Math.log2 },
  log10: { min: 1, max: 1, fn: Math.log10 },
  exp: { min: 1, max: 1, fn: Math.exp },
  floor: { min: 1, max: 1, fn: Math.floor },
  ceil: { min: 1, max: 1, fn: Math.ceil },
  round: {
    min: 1,
    max: 2,
    // 不能直接用 toFixed：1.005 在二进制里是 1.00499999…，toFixed(2) 会得到 "1.00"。
    // 先用字符串移位（"1.005e2" 会被解析成精确的 100.5）再四舍五入，避免这类偏差。
    fn: (value: number, digits = 0) => {
      const places = Math.max(0, Math.min(15, Math.trunc(digits)))
      const shifted = Number(`${value}e${places}`)
      if (!Number.isFinite(shifted)) return value
      return Number(`${Math.round(shifted)}e-${places}`)
    },
  },
  trunc: { min: 1, max: 1, fn: Math.trunc },
  sign: { min: 1, max: 1, fn: Math.sign },
  min: { min: 1, max: 64, fn: (...args: number[]) => Math.min(...args) },
  max: { min: 1, max: 64, fn: (...args: number[]) => Math.max(...args) },
  pow: { min: 2, max: 2, fn: Math.pow },
  hypot: { min: 1, max: 64, fn: (...args: number[]) => Math.hypot(...args) },
  gcd: { min: 2, max: 64, fn: (...args: number[]) => args.reduce(gcdOf) },
  lcm: {
    min: 2,
    max: 64,
    fn: (...args: number[]) =>
      args.reduce((a, b) => (a === 0 || b === 0 ? 0 : Math.abs(a * b) / gcdOf(a, b))),
  },
  fact: { min: 1, max: 1, fn: factorial },
}

export const MATH_FUNCTION_NAMES = Object.keys(MATH_FUNCTIONS)

/* ------------------------------------------------------------------ */
/* 分词                                                                */
/* ------------------------------------------------------------------ */

type TokenType = 'number' | 'name' | 'operator' | 'lparen' | 'rparen' | 'comma' | 'bang'

interface Token {
  type: TokenType
  value: string
  position: number
}

const OPERATOR_CHARS = '+-*/%^'
const SUPerscriptMap: Record<string, string> = { '×': '*', '÷': '/', '−': '-', '–': '-' }

function tokenize(input: string): { tokens: Token[]; error: MathEvalFailure | null } {
  const tokens: Token[] = []
  const source = input.replace(/[，]/g, ',')
  let index = 0

  while (index < source.length) {
    const char = source[index]

    if (/\s/.test(char)) {
      index += 1
      continue
    }

    if (char in SUPerscriptMap) {
      tokens.push({ type: 'operator', value: SUPerscriptMap[char], position: index })
      index += 1
      continue
    }

    // ** 必须早于单字符 * 判断
    if (source.startsWith('**', index)) {
      tokens.push({ type: 'operator', value: '^', position: index })
      index += 2
      continue
    }

    if (/\d/.test(char) || (char === '.' && /\d/.test(source[index + 1] ?? ''))) {
      const start = index
      if (source.startsWith('0x', index) || source.startsWith('0X', index)) {
        index += 2
        while (index < source.length && /[0-9a-fA-F]/.test(source[index])) index += 1
      } else {
        while (index < source.length && /\d/.test(source[index])) index += 1
        if (source[index] === '.') {
          index += 1
          while (index < source.length && /\d/.test(source[index])) index += 1
        }
        if (/[eE]/.test(source[index] ?? '')) {
          const save = index
          index += 1
          if (/[+-]/.test(source[index] ?? '')) index += 1
          if (/\d/.test(source[index] ?? '')) {
            while (index < source.length && /\d/.test(source[index])) index += 1
          } else {
            index = save
          }
        }
      }
      // 一个数字里出现第二个小数点（1.2.3、1..2）是明显的笔误，
      // 如果不报错会被拆成两个数字并触发隐式乘法，静默算出 0.36 / 0.2 这种错值
      if (source[index] === '.') {
        return { tokens, error: { ok: false, error: '数字里出现了多个小数点', position: index } }
      }
      tokens.push({ type: 'number', value: source.slice(start, index), position: start })
      continue
    }

    if (/[A-Za-z\u03c0]/.test(char)) {
      const start = index
      index += 1
      while (index < source.length && /[A-Za-z0-9_]/.test(source[index])) index += 1
      tokens.push({ type: 'name', value: source.slice(start, index), position: start })
      continue
    }

    if (char === '(') {
      tokens.push({ type: 'lparen', value: char, position: index })
      index += 1
      continue
    }
    if (char === ')') {
      tokens.push({ type: 'rparen', value: char, position: index })
      index += 1
      continue
    }
    if (char === ',') {
      tokens.push({ type: 'comma', value: char, position: index })
      index += 1
      continue
    }
    if (char === '!') {
      if (source[index + 1] === '=') {
        return { tokens, error: { ok: false, error: '不支持比较运算符 !=', position: index } }
      }
      tokens.push({ type: 'bang', value: char, position: index })
      index += 1
      continue
    }
    if (OPERATOR_CHARS.includes(char)) {
      tokens.push({ type: 'operator', value: char, position: index })
      index += 1
      continue
    }

    return { tokens, error: { ok: false, error: `无法识别的字符「${char}」`, position: index } }
  }

  return { tokens, error: null }
}

/* ------------------------------------------------------------------ */
/* 调度场算法                                                          */
/* ------------------------------------------------------------------ */

const PRECEDENCE: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2, '%': 2, u: 3, '^': 4, '!': 6 }
const RIGHT_ASSOCIATIVE = new Set(['^', 'u'])
/** 后缀运算符，优先级高于所有二元运算符 */
const POSTFIX = new Set(['!'])

type RpnItem =
  | { kind: 'number'; value: number }
  | { kind: 'operator'; value: string; position: number }
  | { kind: 'function'; name: string; arity: number; position: number }

type StackEntry =
  | { kind: 'lparen'; position: number; commas: number }
  | { kind: 'function'; name: string; position: number }
  | { kind: 'operator'; value: string; position: number }

function isValueEnd(token: Token | null): boolean {
  if (!token) return false
  if (token.type === 'number' || token.type === 'rparen' || token.type === 'bang') return true
  return token.type === 'name' && Object.hasOwn(MATH_CONSTANTS, token.value.toLowerCase())
}

export function evaluateMath(input: string, options: Partial<MathEvalOptions> = {}): MathEvalResult {
  const merged = { ...DEFAULT_MATH_OPTIONS, ...options }
  const source = input.trim()
  if (!source) return { ok: false, error: '表达式为空', position: null }

  const { tokens, error } = tokenize(source)
  if (error) return error
  if (tokens.length === 0) return { ok: false, error: '表达式为空', position: null }

  const output: RpnItem[] = []
  const stack: StackEntry[] = []
  let previous: Token | null = null

  const pushOperator = (value: string, position: number, precedenceOverride?: number) => {
    const currentPrecedence = precedenceOverride ?? PRECEDENCE[value] ?? 0
    while (stack.length > 0) {
      const top = stack[stack.length - 1]
      if (top.kind !== 'operator') break
      const topPrecedence = PRECEDENCE[top.value] ?? 0
      // 后缀运算符不参与比较；左结合的相等优先级要弹出
      if (topPrecedence > currentPrecedence || (topPrecedence === currentPrecedence && !RIGHT_ASSOCIATIVE.has(value))) {
        output.push({ kind: 'operator', value: top.value, position: top.position })
        stack.pop()
        continue
      }
      break
    }
    stack.push({ kind: 'operator', value, position })
  }

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]
    const before = tokens[index - 1] ?? null

    // 两个数字紧挨着（"1 000"）从来不是有意的隐式乘法，而是漏写运算符。
    // 如果按隐式乘法处理会算成 1×000 = 0，静默给出一个看似合理的错值。
    if (previous?.type === 'number' && token.type === 'number') {
      return {
        ok: false,
        error: `「${previous.value}」和「${token.value}」之间缺少运算符`,
        position: token.position,
      }
    }

    // 隐式乘法：2pi、2(3+4)、(1+2)(3+4)、(1+2)3
    if (
      isValueEnd(previous) &&
      (token.type === 'number' ||
        token.type === 'lparen' ||
        (token.type === 'name' && Object.hasOwn(MATH_CONSTANTS, token.value.toLowerCase())))
    ) {
      pushOperator('*', token.position)
    }

    if (token.type === 'number') {
      const value = token.value.toLowerCase().startsWith('0x')
        ? Number.parseInt(token.value.slice(2), 16)
        : Number(token.value)
      if (!Number.isFinite(value)) {
        return { ok: false, error: `数字「${token.value}」无法解析`, position: token.position }
      }
      output.push({ kind: 'number', value })
      previous = token
      continue
    }

    if (token.type === 'name') {
      const lower = token.value.toLowerCase()
      if (Object.hasOwn(MATH_FUNCTIONS, lower)) {
        const next = tokens[index + 1]
        if (!next || next.type !== 'lparen') {
          return { ok: false, error: `函数 ${lower} 后面需要跟括号，例如 ${lower}(1)`, position: token.position }
        }
        stack.push({ kind: 'function', name: lower, position: token.position })
        previous = token
        continue
      }
      if (Object.hasOwn(MATH_CONSTANTS, lower)) {
        output.push({ kind: 'number', value: MATH_CONSTANTS[lower] })
        previous = token
        continue
      }
      return { ok: false, error: `未知的函数或常量「${token.value}」`, position: token.position }
    }

    if (token.type === 'lparen') {
      stack.push({ kind: 'lparen', position: token.position, commas: 0 })
      previous = token
      continue
    }

    if (token.type === 'comma') {
      // 结尾的逗号（sqrt(1,)）不该被算成一个空参数，
      // 否则参数个数报告会变成「需要 1 个，实际给了 2 个」这种误导性提示
      if (tokens[index + 1]?.type === 'rparen') {
        previous = token
        continue
      }

      let found = false
      while (stack.length > 0) {
        const top = stack[stack.length - 1]
        if (top.kind === 'lparen') {
          top.commas += 1
          found = true
          break
        }
        if (top.kind === 'operator') {
          output.push({ kind: 'operator', value: top.value, position: top.position })
          stack.pop()
          continue
        }
        break
      }
      if (!found) return { ok: false, error: '逗号只能出现在函数参数列表中', position: token.position }
      previous = token
      continue
    }

    if (token.type === 'rparen') {
      // 先弹出括号内的运算符，取出该括号累计的逗号数（= 参数个数 - 1）
      let commas = -1
      while (stack.length > 0) {
        const top = stack[stack.length - 1]
        if (top.kind === 'operator') {
          output.push({ kind: 'operator', value: top.value, position: top.position })
          stack.pop()
          continue
        }
        if (top.kind === 'lparen') {
          commas = top.commas
          stack.pop()
          break
        }
        // 函数在左括号「下面」，正常不会在这里遇到
        break
      }
      if (commas < 0) return { ok: false, error: '括号不匹配：有多余的右括号', position: token.position }

      // 左括号左侧若紧邻函数名，这对括号就是它的参数列表
      const below = stack[stack.length - 1]
      if (below && below.kind === 'function') {
        stack.pop()
        output.push({
          kind: 'function',
          name: below.name,
          arity: commas + 1,
          position: below.position,
        })
      }

      previous = token
      continue
    }

    if (token.type === 'bang') {
      output.push({ kind: 'operator', value: '!', position: token.position })
      previous = token
      continue
    }

    // 运算符
    const isUnary =
      !POSTFIX.has(token.value) &&
      (before === null || before.type === 'operator' || before.type === 'lparen' || before.type === 'comma')

    if (isUnary) {
      if (token.value === '-') {
        // 紧跟 ^ 的一元负号属于指数本身（2^-1 = 0.5），必须压过 ^ 的优先级；
        // 其他位置保持低于 ^，这样 -2^2 = -(2^2) = -4。
        const exponentPosition = before?.type === 'operator' && before.value === '^'
        pushOperator('u', token.position, exponentPosition ? (PRECEDENCE['^'] ?? 4) + 1 : undefined)
        previous = token
        continue
      }
      if (token.value === '+') {
        previous = token
        continue
      }
      return { ok: false, error: `运算符「${token.value}」缺少左操作数`, position: token.position }
    }

    pushOperator(token.value, token.position)
    previous = token
  }

  while (stack.length > 0) {
    const top = stack.pop()!
    if (top.kind === 'lparen') return { ok: false, error: '括号不匹配：缺少右括号', position: top.position }
    if (top.kind === 'operator') {
      output.push({ kind: 'operator', value: top.value, position: top.position })
      continue
    }
    return { ok: false, error: `函数「${top.name}」缺少括号`, position: top.position }
  }

  return runRpn(output, merged, tokens.map((token) => token.value).join(' '))
}

/* ------------------------------------------------------------------ */

function runRpn(rpn: RpnItem[], options: MathEvalOptions, source: string): MathEvalResult {
  const stack: number[] = []
  const toRadians = (value: number) => (options.angleMode === 'deg' ? (value * Math.PI) / 180 : value)
  const fromRadians = (value: number) => (options.angleMode === 'deg' ? (value * 180) / Math.PI : value)

  for (const item of rpn) {
    if (item.kind === 'number') {
      stack.push(item.value)
      continue
    }

    if (item.kind === 'operator') {
      if (item.value === 'u') {
        const operand = stack.pop()
        if (operand === undefined) return { ok: false, error: '表达式不完整', position: item.position }
        stack.push(-operand)
        continue
      }
      if (item.value === '!') {
        const operand = stack.pop()
        if (operand === undefined) return { ok: false, error: '阶乘缺少操作数', position: item.position }
        if (!Number.isInteger(operand) || operand < 0) {
          return {
            ok: false,
            error: `阶乘只支持非负整数，收到的是 ${operand}`,
            position: item.position,
          }
        }
        stack.push(factorial(operand))
        continue
      }
      const right = stack.pop()
      const left = stack.pop()
      if (left === undefined || right === undefined) {
        return { ok: false, error: `运算符「${item.value}」缺少操作数`, position: item.position }
      }
      if ((item.value === '/' || item.value === '%') && right === 0) {
        return { ok: false, error: '除数为 0', position: item.position }
      }
      switch (item.value) {
        case '+':
          stack.push(left + right)
          break
        case '-':
          stack.push(left - right)
          break
        case '*':
          stack.push(left * right)
          break
        case '/':
          stack.push(left / right)
          break
        case '%':
          stack.push(left % right)
          break
        case '^':
          stack.push(left ** right)
          break
        default:
          return { ok: false, error: `未知运算符「${item.value}」`, position: item.position }
      }
      continue
    }

    const definition = MATH_FUNCTIONS[item.name]
    if (!definition) return { ok: false, error: `未知函数「${item.name}」`, position: item.position }
    // arity 在解析阶段记录；为 0 时退化为 1
    const arity = item.arity > 0 ? item.arity : 1
    if (arity < definition.min || arity > definition.max) {
      return {
        ok: false,
        error: `函数「${item.name}」需要 ${definition.min === definition.max ? definition.min : `${definition.min}–${definition.max}`} 个参数，实际给了 ${arity} 个`,
        position: item.position,
      }
    }
    if (stack.length < arity) {
      return { ok: false, error: `函数「${item.name}」缺少参数`, position: item.position }
    }
    const args = stack.splice(stack.length - arity, arity)
    const prepared = definition.angle ? args.map(toRadians) : args
    let result = definition.fn(...prepared)
    if (definition.returnsAngle) result = fromRadians(result)
    stack.push(result)
  }

  if (stack.length === 0) return { ok: false, error: '表达式没有结果', position: null }
  if (stack.length > 1) return { ok: false, error: '表达式不完整，可能缺少运算符', position: null }
  const value = stack[0]
  if (Number.isNaN(value)) return { ok: false, error: '计算结果不是有效数字，请检查函数定义域（负数开平方、非整数阶乘、对数底数不合法等）', position: null }
  return { ok: true, value: Number(value.toPrecision(options.precision)), normalized: source }
}

export const MATH_SAMPLES: ReadonlyArray<{ label: string; expression: string; note: string }> = [
  { label: '四则运算', expression: '(12 + 8) * 3 / 4 - 5', note: '支持括号与优先级' },
  { label: '幂与开方', expression: '2^10 + sqrt(144) - cbrt(27)', note: '^ 与 ** 都表示幂' },
  { label: '三角函数', expression: 'sin(pi/6) + cos(60)', note: '切到「角度制」后 60 会被当作 60°' },
  { label: '对数与指数', expression: 'log(1000) + ln(e^2)', note: 'log 默认以 10 为底，log(x, b) 可指定底数' },
  { label: '阶乘', expression: '5! / (2! * 3!)', note: '! 是阶乘' },
  { label: '整数函数', expression: 'gcd(48, 36) + lcm(4, 6)', note: '最大公约数与最小公倍数' },
  { label: '取整舍入', expression: 'round(3.14159, 2) + floor(2.9) + ceil(2.1)', note: 'round 支持指定小数位' },
  { label: '隐式乘法', expression: '2pi * 3', note: '数字与常量之间可省略乘号' },
]
