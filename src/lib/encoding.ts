/** 编码转换：HTML 实体、Unicode 转义、进制转换、字节 ⇄ 文本（多字符集解码）。 */

const NAMED_ENTITIES: Record<string, string> = {
  '&': 'amp',
  '<': 'lt',
  '>': 'gt',
  '"': 'quot',
  "'": 'apos',
  '\u00a0': 'nbsp',
  '\u00a9': 'copy',
  '\u00ae': 'reg',
  '\u2122': 'trade',
  '\u2026': 'hellip',
  '\u2013': 'ndash',
  '\u2014': 'mdash',
  '\u2018': 'lsquo',
  '\u2019': 'rsquo',
  '\u201c': 'ldquo',
  '\u201d': 'rdquo',
  '\u00b7': 'middot',
  '\u00d7': 'times',
  '\u00f7': 'divide',
  '\u2192': 'rarr',
  '\u2190': 'larr',
  '\u00b0': 'deg',
  '\u20ac': 'euro',
  '\u00a3': 'pound',
  '\u00a5': 'yen',
  '\u00a7': 'sect',
  '\u00b6': 'para',
  '\u2022': 'bull',
}

const REVERSE_ENTITIES: Record<string, string> = Object.fromEntries(
  Object.entries(NAMED_ENTITIES).map(([char, name]) => [name, char]),
)

/**
 * HTML 实体编码。
 * encodeAll = true 时把所有字符都转成数字实体，适合排查乱码。
 */
export function encodeHtmlEntities(text: string, encodeAll = false): string {
  if (encodeAll) {
    return [...text].map((char) => `&#x${char.codePointAt(0)!.toString(16).toUpperCase()};`).join('')
  }
  return [...text]
    .map((char) => {
      const name = NAMED_ENTITIES[char]
      if (name) return `&${name};`
      const code = char.codePointAt(0)!
      return code > 126 || code < 32 ? `&#${code};` : char
    })
    .join('')
}

/** HTML 实体解码，支持命名实体、十进制与十六进制数字实体。 */
export function decodeHtmlEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (whole, body: string) => {
    if (body.startsWith('#x') || body.startsWith('#X')) {
      const code = Number.parseInt(body.slice(2), 16)
      return Number.isNaN(code) ? whole : safeFromCodePoint(code, whole)
    }
    if (body.startsWith('#')) {
      const code = Number.parseInt(body.slice(1), 10)
      return Number.isNaN(code) ? whole : safeFromCodePoint(code, whole)
    }
    // 用 Object.hasOwn 查表：REVERSE_ENTITIES['constructor'] 会命中原型链上的函数，
    // 之前会把 &constructor; 解码成 "function Object() { [native code] }"
    const lower = body.toLowerCase()
    const char = Object.hasOwn(REVERSE_ENTITIES, lower)
      ? REVERSE_ENTITIES[lower]
      : Object.hasOwn(REVERSE_ENTITIES, body)
        ? REVERSE_ENTITIES[body]
        : undefined
    return char ?? whole
  })
}

function safeFromCodePoint(code: number, fallback: string): string {
  try {
    return String.fromCodePoint(code)
  } catch {
    return fallback
  }
}

/* ------------------------------------------------------------------ */
/* Unicode 转义                                                        */
/* ------------------------------------------------------------------ */

export type UnicodeStyle = 'js' | 'css' | 'html' | 'codepoint'

export const UNICODE_STYLES: ReadonlyArray<{ value: UnicodeStyle; label: string; sample: string }> =
  [
    { value: 'js', label: 'JavaScript \\uXXXX', sample: '\\u4e2d' },
    { value: 'css', label: 'CSS \\XXXX', sample: '\\4e2d ' },
    { value: 'html', label: 'HTML &#xXXXX;', sample: '&#x4E2D;' },
    { value: 'codepoint', label: '码点 U+XXXX', sample: 'U+4E2D' },
  ]

/** 只转义非 ASCII 字符，保留可读的英文与标点。 */
export function toUnicodeEscapes(text: string, style: UnicodeStyle, escapeAll = false): string {
  return [...text]
    .map((char) => {
      const code = char.codePointAt(0)!
      if (!escapeAll && code <= 126) return char

      if (style === 'js') {
        if (code > 0xffff) {
          const high = Math.floor((code - 0x10000) / 0x400) + 0xd800
          const low = ((code - 0x10000) % 0x400) + 0xdc00
          return `\\u${high.toString(16).padStart(4, '0')}\\u${low.toString(16).padStart(4, '0')}`
        }
        return `\\u${code.toString(16).padStart(4, '0')}`
      }
      if (style === 'css') {
        return `\\${code.toString(16)} `
      }
      if (style === 'html') {
        return `&#x${code.toString(16).toUpperCase()};`
      }
      return `U+${code.toString(16).toUpperCase().padStart(4, '0')}`
    })
    .join('')
}

/** 还原 \\uXXXX / \\u{XXXXX} / U+XXXX / &#xXXXX; 为字符。 */
export function fromUnicodeEscapes(text: string): string {
  return text
    .replace(/\\u\{([0-9a-fA-F]{1,6})\}/g, (whole, hex: string) => safeFromCodePoint(Number.parseInt(hex, 16), whole))
    .replace(/\\u([0-9a-fA-F]{4})/g, (whole, hex: string) => safeFromCodePoint(Number.parseInt(hex, 16), whole))
    .replace(/U\+([0-9a-fA-F]{4,6})/g, (whole, hex: string) => safeFromCodePoint(Number.parseInt(hex, 16), whole))
    .replace(/&#x([0-9a-fA-F]{1,6});/g, (whole, hex: string) => safeFromCodePoint(Number.parseInt(hex, 16), whole))
    .replace(/&#(\d{1,7});/g, (whole, dec: string) => safeFromCodePoint(Number.parseInt(dec, 10), whole))
    .replace(/\\x([0-9a-fA-F]{2})/g, (whole, hex: string) => safeFromCodePoint(Number.parseInt(hex, 16), whole))
}

/* ------------------------------------------------------------------ */
/* 进制转换                                                            */
/* ------------------------------------------------------------------ */

export const BASES: ReadonlyArray<{ value: number; label: string }> = [
  { value: 2, label: '二进制 (2)' },
  { value: 8, label: '八进制 (8)' },
  { value: 10, label: '十进制 (10)' },
  { value: 16, label: '十六进制 (16)' },
  { value: 32, label: 'Base32 (32)' },
  { value: 36, label: '36 进制 (36)' },
]

const DIGITS = '0123456789abcdefghijklmnopqrstuvwxyz'

/** 任意进制互转，支持大整数（用 BigInt），返回 null 表示输入非法。 */
export function convertBase(value: string, from: number, to: number): string | null {
  if (from < 2 || from > 36 || to < 2 || to > 36) return null

  let clean = value.trim().toLowerCase().replace(/[\s_]/g, '')
  if (!clean) return null

  // 先处理正负号：之前是「先无条件剥前缀、再找负号」，
  // 于是 '-0xff' 的 '-' 挡住了前缀匹配，'x' 被当成非法数字直接返回 null。
  let negative = false
  if (clean.startsWith('-')) {
    negative = true
    clean = clean.slice(1)
  } else if (clean.startsWith('+')) {
    clean = clean.slice(1)
  }

  // 只在进制真的匹配时剥前缀（0x→16、0b→2、0o→8）。
  // 否则 '0b1010' 按 16 进制解析时会被误当成二进制前缀，把 b 这个合法十六进制数字吃掉。
  const prefix = clean.slice(0, 2)
  if (
    (prefix === '0x' && from === 16) ||
    (prefix === '0b' && from === 2) ||
    (prefix === '0o' && from === 8)
  ) {
    clean = clean.slice(2)
  }
  if (!clean) return null

  let result = 0n
  const base = BigInt(from)
  for (const char of clean) {
    const digit = DIGITS.indexOf(char)
    if (digit < 0 || digit >= from) return null
    result = result * base + BigInt(digit)
  }

  if (result === 0n) return '0'
  let out = ''
  const target = BigInt(to)
  while (result > 0n) {
    out = DIGITS[Number(result % target)] + out
    result /= target
  }
  return (negative ? '-' : '') + out
}

export function groupDigits(value: string, size = 4, separator = ' '): string {
  // size ≤ 0 会让下面的 `i -= size` 永远不减小，变成真正的死循环（内存无限增长）。
  // 调用方目前有守卫，但函数自己必须能挡住非法参数。
  if (!Number.isFinite(size) || size < 1) return value
  const step = Math.floor(size)

  const negative = value.startsWith('-')
  const digits = negative ? value.slice(1) : value
  const chunks: string[] = []
  for (let i = digits.length; i > 0; i -= step) {
    chunks.unshift(digits.slice(Math.max(0, i - step), i))
  }
  return (negative ? '-' : '') + chunks.join(separator)
}

/* ------------------------------------------------------------------ */
/* 字节 ⇄ 文本                                                         */
/* ------------------------------------------------------------------ */

export const DECODE_ENCODINGS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'utf-8', label: 'UTF-8' },
  { value: 'gbk', label: 'GBK / GB2312（中文）' },
  { value: 'big5', label: 'Big5（繁体）' },
  { value: 'shift_jis', label: 'Shift_JIS（日文）' },
  { value: 'euc-kr', label: 'EUC-KR（韩文）' },
  { value: 'iso-8859-1', label: 'Latin-1' },
  { value: 'utf-16le', label: 'UTF-16 LE' },
]

/** 字符串 → UTF-8 字节。浏览器只原生支持 UTF-8 编码（TextEncoder 的限制）。 */
export function textToUtf8Bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text)
}

export function bytesToHex(bytes: Uint8Array, separator = ' '): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join(separator)
}

export function bytesToPercent(bytes: Uint8Array, uppercase = false): string {
  return [...bytes]
    .map((byte) => {
      const hex = byte.toString(16).padStart(2, '0')
      return `%${uppercase ? hex.toUpperCase() : hex}`
    })
    .join('')
}

/** 解析十六进制 / 百分号 / 转义序列形式的字节串。 */
export function parseByteInput(input: string): { bytes: Uint8Array; error: string | null } {
  const value = input.trim()
  if (!value) return { bytes: new Uint8Array(0), error: null }

  // 三种写法可以混用。之前是「命中 % 就只取 %XX」，于是 '41%42' 会静默丢掉 41 那个字节；
  // 这里先把 %XX、\xXX、0xXX 统一还原成裸十六进制，剩下的整体按十六进制解析。
  const normalized = value
    .replace(/%([0-9a-fA-F]{2})/g, '$1')
    .replace(/\\x([0-9a-fA-F]{2})/g, '$1')
    .replace(/0x([0-9a-fA-F]{1,2})/g, '$1')

  const clean = normalized.replace(/[\s,:_-]/g, '')
  if (!/^[0-9a-fA-F]*$/.test(clean)) {
    return { bytes: new Uint8Array(0), error: '只接受十六进制字符，或用 %XX、\\xXX、0xXX 分隔的字节' }
  }
  if (clean.length % 2 !== 0) {
    return { bytes: new Uint8Array(0), error: '十六进制位数必须是偶数' }
  }

  const bytes = new Uint8Array(clean.length / 2)
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16)
  }
  return { bytes, error: null }
}

export interface DecodeBytesResult {
  text: string
  error: string | null
  /** 使用的解码器标签，用于确认浏览器是否真的支持该字符集 */
  actualEncoding: string
}

export function decodeBytesWithEncoding(bytes: Uint8Array, encoding: string): DecodeBytesResult {
  try {
    const decoder = new TextDecoder(encoding, { fatal: false })
    return { text: decoder.decode(bytes), error: null, actualEncoding: decoder.encoding }
  } catch {
    return {
      text: '',
      error: `当前浏览器不支持字符集 ${encoding}（支持的标签以 TextDecoder 为准）`,
      actualEncoding: '',
    }
  }
}
