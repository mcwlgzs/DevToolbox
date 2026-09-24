/**
 * 极简 XML 解析与 XML ⇄ JSON 互转。
 *
 * 为什么不用浏览器的 DOMParser？Node 端没有它，纯函数才能被单元测试覆盖。
 * 这里实现的是 XML 的常用子集：元素、属性、文本、CDATA、注释、处理指令、
 * 自闭合标签与字符实体。不处理 DTD 与命名空间前缀解析。
 */

export interface XmlNode {
  type: 'element' | 'text'
  name: string
  attributes: Record<string, string>
  children: XmlNode[]
  text: string
}

export interface XmlParseResult {
  ok: boolean
  error: string | null
  root: XmlNode | null
}

const NAME_START = /[A-Za-z_:]/
const NAME_CHAR = /[A-Za-z0-9_:.-]/

const NAMED_ENTITIES: Record<string, string> = {
  lt: '<',
  gt: '>',
  amp: '&',
  quot: '"',
  apos: "'",
  nbsp: '\u00a0',
}

export function decodeXmlEntities(text: string): string {
  // XML 规范里字符引用的十六进制前缀是 [xX]，大小写都合法
  return text.replace(/&(#x[0-9a-fA-F]+|#X[0-9a-fA-F]+|#[0-9]+|[a-zA-Z][a-zA-Z0-9]*);/g, (whole, body: string) => {
    if (body[1] === 'x' || body[1] === 'X') {
      const code = Number.parseInt(body.slice(2), 16)
      return Number.isNaN(code) ? whole : safeChar(code, whole)
    }
    if (body.startsWith('#')) {
      const code = Number.parseInt(body.slice(1), 10)
      return Number.isNaN(code) ? whole : safeChar(code, whole)
    }
    return NAMED_ENTITIES[body] ?? whole
  })
}

function safeChar(code: number, fallback: string): string {
  try {
    return String.fromCodePoint(code)
  } catch {
    return fallback
  }
}

export function encodeXmlEntities(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

class Reader {
  index = 0
  readonly source: string

  // 不用参数属性（constructor(readonly x)）：erasableSyntaxOnly 禁止该写法
  constructor(source: string) {
    this.source = source
  }

  get done(): boolean {
    return this.index >= this.source.length
  }

  peek(offset = 0): string {
    return this.source[this.index + offset] ?? ''
  }

  startsWith(text: string): boolean {
    return this.source.startsWith(text, this.index)
  }

  skipWhitespace(): void {
    while (!this.done && /\s/.test(this.peek())) this.index += 1
  }
}

/**
 * 允许的最大嵌套深度。
 *
 * 解析与序列化都是递归实现，几千层的输入会把调用栈打爆成 `RangeError`
 * —— 那是未捕获异常，会让整个页面白屏。真实 XML 极少超过 50 层，
 * 因此这里主动设一个远低于栈上限的值，超出就明确报错而不是崩溃。
 */
export const MAX_XML_DEPTH = 200

/** 解析 XML 文本，返回根元素。 */
export function parseXml(source: string): XmlParseResult {
  const reader = new Reader(source.replace(/^\uFEFF/, ''))
  let root: XmlNode | null = null

  const fail = (message: string): XmlParseResult => ({
    ok: false,
    // 内部消息里可能已经带了位置，避免出现「（位置 3）（位置 3）」
    error: message.includes('（位置') ? message : `${message}（位置 ${reader.index}）`,
    root: null,
  })

  const readName = (): string | null => {
    if (reader.done || !NAME_START.test(reader.peek())) return null
    const start = reader.index
    reader.index += 1
    while (!reader.done && NAME_CHAR.test(reader.peek())) reader.index += 1
    return reader.source.slice(start, reader.index)
  }

  const skipMisc = (): string | null => {
    // 处理注释、处理指令、DOCTYPE 与空白
    for (;;) {
      reader.skipWhitespace()
      if (reader.startsWith('<!--')) {
        const end = reader.source.indexOf('-->', reader.index + 4)
        if (end < 0) return '注释没有闭合'
        reader.index = end + 3
        continue
      }
      if (reader.startsWith('<?')) {
        const end = reader.source.indexOf('?>', reader.index + 2)
        if (end < 0) return '处理指令没有闭合'
        reader.index = end + 2
        continue
      }
      if (reader.startsWith('<!DOCTYPE')) {
        let depth = 0
        while (!reader.done) {
          // 内部子集里的注释与引号内也可能出现 [ ]，
          // 不跳过它们会让 `<!DOCTYPE a [ <!-- ] --> ]>` 提前结束扫描，
          // 把后面的 `]><a/>` 当成正文 → 报「XML 必须以元素开始」。
          if (reader.startsWith('<!--')) {
            const end = reader.source.indexOf('-->', reader.index + 4)
            if (end < 0) return 'DOCTYPE 里的注释没有闭合'
            reader.index = end + 3
            continue
          }
          const char = reader.peek()
          if (char === '"' || char === "'") {
            const end = reader.source.indexOf(char, reader.index + 1)
            if (end < 0) return 'DOCTYPE 里的引号没有闭合'
            reader.index = end + 1
            continue
          }
          if (char === '[') depth += 1
          if (char === ']') depth -= 1
          if (char === '>' && depth <= 0) {
            reader.index += 1
            break
          }
          reader.index += 1
        }
        continue
      }
      return null
    }
  }

  const readAttributes = (): Record<string, string> | string => {
    const attributes: Record<string, string> = {}
    for (;;) {
      reader.skipWhitespace()
      const char = reader.peek()
      if (char === '>' || char === '/' || char === '') return attributes
      const name = readName()
      if (!name) return `属性名不合法（位置 ${reader.index}）`
      reader.skipWhitespace()
      if (reader.peek() !== '=') return `属性 ${name} 缺少 =`
      reader.index += 1
      reader.skipWhitespace()
      const quote = reader.peek()
      if (quote !== '"' && quote !== "'") return `属性 ${name} 的值必须用引号包裹`
      reader.index += 1
      const end = reader.source.indexOf(quote, reader.index)
      if (end < 0) return `属性 ${name} 的引号没有闭合`
      attributes[name] = decodeXmlEntities(reader.source.slice(reader.index, end))
      reader.index = end + 1
    }
  }

  const readElement = (depth: number): XmlNode | string => {
    if (depth > MAX_XML_DEPTH) {
      return `嵌套层级超过 ${MAX_XML_DEPTH} 层，已停止解析以免浏览器崩溃（位置 ${reader.index}）`
    }
    reader.index += 1 // 跳过 <
    const name = readName()
    if (!name) return `标签名不合法（位置 ${reader.index}）`

    const attributes = readAttributes()
    if (typeof attributes === 'string') return attributes

    const node: XmlNode = { type: 'element', name, attributes, children: [], text: '' }

    reader.skipWhitespace()
    if (reader.startsWith('/>')) {
      reader.index += 2
      return node
    }
    if (reader.peek() !== '>') return `标签 <${name}> 没有正确闭合`
    reader.index += 1

    // 读取子节点直到遇到 </name>
    for (;;) {
      if (reader.done) return `标签 <${name}> 缺少结束标签`

      if (reader.startsWith('</')) {
        reader.index += 2
        const closeName = readName()
        reader.skipWhitespace()
        if (reader.peek() !== '>') return `结束标签 </${closeName ?? '?'}> 格式错误`
        reader.index += 1
        if (closeName !== name) return `结束标签 </${closeName}> 与 <${name}> 不匹配`
        return node
      }

      if (reader.startsWith('<!--')) {
        const end = reader.source.indexOf('-->', reader.index + 4)
        if (end < 0) return '注释没有闭合'
        reader.index = end + 3
        continue
      }
      if (reader.startsWith('<![CDATA[')) {
        const end = reader.source.indexOf(']]>', reader.index + 9)
        if (end < 0) return 'CDATA 没有闭合'
        node.text += reader.source.slice(reader.index + 9, end)
        reader.index = end + 3
        continue
      }
      if (reader.startsWith('<?')) {
        const end = reader.source.indexOf('?>', reader.index + 2)
        if (end < 0) return '处理指令没有闭合'
        reader.index = end + 2
        continue
      }
      if (reader.startsWith('<')) {
        const child = readElement(depth + 1)
        if (typeof child === 'string') return child
        node.children.push(child)
        continue
      }

      const next = reader.source.indexOf('<', reader.index)
      const text = next < 0 ? reader.source.slice(reader.index) : reader.source.slice(reader.index, next)
      node.text += decodeXmlEntities(text)
      reader.index = next < 0 ? reader.source.length : next
    }
  }

  const miscError = skipMisc()
  if (miscError) return fail(miscError)

  if (!reader.startsWith('<')) return fail('XML 必须以元素开始')

  const result = readElement(1)
  if (typeof result === 'string') return fail(result)
  root = result

  const trailing = skipMisc()
  if (trailing) return fail(trailing)
  if (!reader.done) return fail('根元素之后还有多余内容')

  return { ok: true, error: null, root }
}

/* ------------------------------------------------------------------ */
/* XML ⇄ JSON                                                          */
/* ------------------------------------------------------------------ */

export interface XmlToJsonOptions {
  /** 属性前缀，默认 @ */
  attributePrefix: string
  /** 文本内容的键名，默认 #text */
  textKey: string
  /** 同名子元素始终用数组表示 */
  alwaysArray: boolean
  /** 忽略只有空白的文本节点 */
  ignoreWhitespace: boolean
}

export const DEFAULT_XML_OPTIONS: XmlToJsonOptions = {
  attributePrefix: '@',
  textKey: '#text',
  alwaysArray: false,
  ignoreWhitespace: true,
}

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }

function elementToValue(node: XmlNode, options: XmlToJsonOptions): JsonValue {
  const record: Record<string, JsonValue> = {}

  for (const [key, value] of Object.entries(node.attributes)) {
    record[`${options.attributePrefix}${key}`] = value
  }

  const text = options.ignoreWhitespace ? node.text.trim() : node.text
  const grouped = new Map<string, XmlNode[]>()
  for (const child of node.children) {
    const bucket = grouped.get(child.name)
    if (bucket) bucket.push(child)
    else grouped.set(child.name, [child])
  }

  const hasElementChildren = node.children.length > 0

  if (!hasElementChildren) {
    // 叶子节点：有属性时保留 #text，否则直接返回文本
    if (text !== '' || Object.keys(record).length === 0) {
      if (Object.keys(record).length === 0) return text
      record[options.textKey] = text
    }
    return record
  }

  if (text !== '') record[options.textKey] = text

  for (const [name, children] of grouped) {
    const values = children.map((child) => elementToValue(child, options))
    record[name] = options.alwaysArray || values.length > 1 ? values : values[0]
  }

  return record
}

export function xmlToJson(source: string, options: Partial<XmlToJsonOptions> = {}): {
  ok: boolean
  error: string | null
  value: JsonValue | null
} {
  const merged = { ...DEFAULT_XML_OPTIONS, ...options }
  const parsed = parseXml(source)
  if (!parsed.ok || !parsed.root) return { ok: false, error: parsed.error, value: null }

  // 根元素统一包一层 { 根名: ... }，与主流库一致
  const rootValue = elementToValue(parsed.root, merged)
  return { ok: true, error: null, value: { [parsed.root.name]: rootValue } as JsonValue }
}

/* ------------------------------------------------------------------ */

function isValidName(name: string): boolean {
  return /^[A-Za-z_:][A-Za-z0-9_:.-]*$/.test(name)
}

/** 序列化过程中的可预期失败（非法名称 / 层级过深），由 jsonToXml 统一转成 {ok:false}。 */
class XmlBuildError extends Error {}

function escapeText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function escapeAttribute(value: string): string {
  return escapeText(value).replace(/"/g, '&quot;')
}

function valueToXml(name: string, value: JsonValue, options: XmlToJsonOptions, indent: number): string {
  if (indent > MAX_XML_DEPTH) {
    throw new XmlBuildError(`嵌套层级超过 ${MAX_XML_DEPTH} 层，已停止生成以免浏览器崩溃`)
  }
  if (!isValidName(name)) {
    throw new XmlBuildError(
      `「${name}」不是合法的 XML 元素名。名称需以字母、下划线或冒号开头，可含数字、点与连字符` +
        `（如果它本该是属性，请检查「属性前缀」是否与 JSON 里的键一致）`,
    )
  }

  const pad = '  '.repeat(indent)
  const attributePrefix = options.attributePrefix
  // 空前缀会让 key.startsWith('') 恒为真，把所有子元素都当成属性并 String() 化
  // —— 那会产出 book="[object Object]"。空前缀就当作「不使用属性」。
  const isAttribute = (key: string) => attributePrefix !== '' && key.startsWith(attributePrefix)

  if (value === null || value === undefined) return `${pad}<${name}/>`
  if (typeof value !== 'object') return `${pad}<${name}>${escapeText(String(value))}</${name}>`
  if (Array.isArray(value)) {
    return value.map((item) => valueToXml(name, item, options, indent)).join('\n')
  }

  const entries = Object.entries(value)
  const attributes = entries.filter(([key]) => isAttribute(key))
  const children = entries.filter(([key]) => !isAttribute(key) && key !== options.textKey)
  const text = entries.find(([key]) => key === options.textKey)?.[1]

  const attributeText = attributes
    .map(([key, item]) => {
      const attributeName = key.slice(attributePrefix.length)
      if (!isValidName(attributeName)) {
        throw new XmlBuildError(
          `「${key}」去掉属性前缀后是「${attributeName}」，不是合法的 XML 属性名`,
        )
      }
      return ` ${attributeName}="${escapeAttribute(String(item))}"`
    })
    .join('')

  if (children.length === 0) {
    const textValue = text === undefined ? '' : escapeText(String(text))
    if (textValue === '') return `${pad}<${name}${attributeText}/>`
    return `${pad}<${name}${attributeText}>${textValue}</${name}>`
  }

  const inner = children
    .map(([key, item]) => valueToXml(key, item, options, indent + 1))
    .join('\n')
  const textLine = text === undefined ? '' : `\n${pad}  ${escapeText(String(text))}`
  return `${pad}<${name}${attributeText}>${textLine}\n${inner}\n${pad}</${name}>`
}

export function jsonToXml(
  value: JsonValue,
  options: Partial<XmlToJsonOptions> = {},
  declaration = true,
): { ok: boolean; error: string | null; xml: string } {
  const merged = { ...DEFAULT_XML_OPTIONS, ...options }

  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, error: 'JSON 顶层需要是一个对象，且只能有一个根元素', xml: '' }
  }

  const roots = Object.entries(value)
  if (roots.length !== 1) {
    return {
      ok: false,
      error: `XML 只能有一个根元素，当前顶层有 ${roots.length} 个键`,
      xml: '',
    }
  }

  const [rootName, rootValue] = roots[0]

  try {
    const body = valueToXml(rootName, rootValue, merged, 0)
    const xml = declaration ? `<?xml version="1.0" encoding="UTF-8"?>\n${body}` : body
    return { ok: true, error: null, xml }
  } catch (error) {
    if (error instanceof XmlBuildError) return { ok: false, error: error.message, xml: '' }
    throw error
  }
}
