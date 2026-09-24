/**
 * 纯浏览器端 Base64 编解码核心。
 * 无任何网络请求，全部在内存中完成。
 */

const CHUNK = 0x80_00

export type B64Variant = 'standard' | 'urlsafe'
export type WrapWidth = 0 | 64 | 76
export type TextEncoding = 'utf-8' | 'utf-16le' | 'iso-8859-1'

export const TEXT_ENCODINGS: ReadonlyArray<{ value: TextEncoding; label: string }> = [
  { value: 'utf-8', label: 'UTF-8' },
  { value: 'utf-16le', label: 'UTF-16 LE' },
  { value: 'iso-8859-1', label: 'Latin-1 / Windows-1252' },
]

export const WRAP_WIDTHS: ReadonlyArray<{ value: WrapWidth; label: string }> = [
  { value: 0, label: '不换行' },
  { value: 64, label: '每行 64 字符' },
  { value: 76, label: '每行 76 字符 (MIME)' },
]

export interface EncodeOptions {
  variant: B64Variant
  padding: boolean
  wrap: WrapWidth
}

export const DEFAULT_ENCODE_OPTIONS: EncodeOptions = {
  variant: 'standard',
  padding: true,
  wrap: 0,
}

export type DecodeResult =
  | { ok: true; bytes: Uint8Array; warnings: string[]; mime?: string }
  | { ok: false; error: string }

export type TextDecodeResult =
  | { ok: true; text: string; warnings: string[] }
  | { ok: false; error: string }

/* ------------------------------------------------------------------ */
/* bytes -> base64                                                     */
/* ------------------------------------------------------------------ */

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

export function base64ToBytes(input: string): Uint8Array {
  const binary = atob(input)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

function wrapLines(value: string, width: WrapWidth): string {
  if (width <= 0) return value
  const lines: string[] = []
  for (let i = 0; i < value.length; i += width) {
    lines.push(value.slice(i, i + width))
  }
  return lines.join('\n')
}

/** 字节数组 -> Base64 字符串，按选项套用 URL-Safe / padding / 换行。 */
export function encodeBytes(bytes: Uint8Array, options: EncodeOptions): string {
  let out = bytesToBase64(bytes)
  if (options.variant === 'urlsafe') {
    out = out.replace(/\+/g, '-').replace(/\//g, '_')
  }
  if (!options.padding) {
    out = out.replace(/=+$/, '')
  }
  return wrapLines(out, options.wrap)
}

/* ------------------------------------------------------------------ */
/* base64 -> bytes                                                     */
/* ------------------------------------------------------------------ */

const DATA_URL_RE = /^data:([^,]*),/i

/**
 * 清洗输入：去掉 Data URL 头部、空白字符，统一字符集并补齐 padding。
 */
export function normalizeBase64(raw: string): DecodeResult {
  const warnings: string[] = []
  let text = raw.trim()
  if (!text) return { ok: false, error: '输入为空' }

  let mime: string | undefined
  const dataUrl = DATA_URL_RE.exec(text)
  if (dataUrl) {
    const header = dataUrl[1] ?? ''
    mime = header.split(';')[0]?.trim() || undefined
    warnings.push(`已忽略 Data URL 头部${mime ? `（${mime}）` : ''}`)
    text = text.slice(dataUrl[0].length)
  }

  const hadWhitespace = /\s/.test(text)
  text = text.replace(/\s+/g, '')
  if (hadWhitespace) warnings.push('已移除输入中的空白字符与换行')

  const hasUrlSafe = /[-_]/.test(text)
  const hasStandard = /[+/]/.test(text)
  if (hasUrlSafe && hasStandard) {
    warnings.push('检测到 URL-Safe 与标准字符混用，已统一按 URL-Safe 解码')
  }
  if (hasUrlSafe) {
    text = text.replace(/-/g, '+').replace(/_/g, '/')
  }

  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(text)) {
    const bad = /[^A-Za-z0-9+/=]/.exec(text)?.[0]
    return {
      ok: false,
      error: bad
        ? `第 ${raw.indexOf(bad) + 1} 个字符 “${bad}” 不是合法的 Base64 字符`
        : '“=” 只能出现在末尾，且最多两个',
    }
  }

  const remainder = text.length % 4
  if (remainder === 1) {
    return { ok: false, error: 'Base64 数据长度无效（长度除 4 余 1）' }
  }
  if (remainder > 0) {
    text += '='.repeat(4 - remainder)
    warnings.push('已自动补齐缺失的 “=” 填充')
  }

  try {
    return { ok: true, bytes: base64ToBytes(text), warnings, mime }
  } catch {
    return { ok: false, error: 'Base64 解码失败，数据可能已损坏' }
  }
}

export function decodeBase64(raw: string): DecodeResult {
  return normalizeBase64(raw)
}

/* ------------------------------------------------------------------ */
/* 文本 <-> Base64                                                     */
/* ------------------------------------------------------------------ */

export function encodeText(text: string, encoding: TextEncoding, options: EncodeOptions): string {
  const bytes =
    encoding === 'utf-8'
      ? new TextEncoder().encode(text)
      : encodeWithLegacy(text, encoding)
  return encodeBytes(bytes, options)
}

/**
 * windows-1252 在 0x80–0x9F 区间与真正的 Latin-1 不同：那里放的是 € 、全角引号、™ 等字符。
 *
 * 浏览器的 `TextDecoder('iso-8859-1')` 按 WHATWG Encoding 标准就是 windows-1252，
 * 而编码这边之前按真 Latin-1 逐码点取值，两边对不上——同一个 € 编出来是 '?'，解回来却是 '€'。
 * 这里补上这张表，让编解码互为逆运算。
 */
const WINDOWS_1252_BYTES: Record<number, number> = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85,
  0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a,
  0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92,
  0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
  0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c,
  0x017e: 0x9e, 0x0178: 0x9f,
}

function encodeWithLegacy(text: string, encoding: TextEncoding): Uint8Array {
  if (encoding === 'iso-8859-1') {
    const bytes = new Uint8Array(text.length)
    for (let i = 0; i < text.length; i += 1) {
      const code = text.charCodeAt(i)
      // 0x00–0x7F 与 0xA0–0xFF 在 windows-1252 里与 Latin-1 相同，只有 0x80–0x9F 需要查表
      bytes[i] = code <= 0x7f || (code >= 0xa0 && code <= 0xff)
        ? code
        : Object.hasOwn(WINDOWS_1252_BYTES, code)
          ? WINDOWS_1252_BYTES[code]
          : 0x3f
    }
    return bytes
  }

  // utf-16le
  const bytes = new Uint8Array(text.length * 2)
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i)
    bytes[i * 2] = code & 0xff
    bytes[i * 2 + 1] = code >> 8
  }
  return bytes
}

/** 按所选编码计算文本占用的字节数（仅用于统计展示）。 */
export function textByteLength(text: string, encoding: TextEncoding): number {
  if (encoding === 'utf-8') return new TextEncoder().encode(text).length
  if (encoding === 'utf-16le') return text.length * 2
  return text.length
}

export function decodeText(
  bytes: Uint8Array,
  encoding: TextEncoding,
  rawInput: string,
): TextDecodeResult {
  try {
    const text = new TextDecoder(encoding, { fatal: true }).decode(bytes)
    return { ok: true, text, warnings: [] }
  } catch {
    // 严格解码失败时退回宽松模式，让用户至少能看到内容
    const lossy = new TextDecoder(encoding).decode(bytes)
    const replacementCount = (lossy.match(/\uFFFD/g) ?? []).length
    if (replacementCount === 0) {
      return { ok: true, text: lossy, warnings: [] }
    }
    const asLatin1 = new TextDecoder('iso-8859-1').decode(bytes)
    void rawInput
    return {
      ok: true,
      text: asLatin1,
      warnings: [
        `字节序列不是合法的 ${encoding.toUpperCase()} 文本（${replacementCount} 处无法映射），已改用 Latin-1 展示`,
      ],
    }
  }
}

/* ------------------------------------------------------------------ */
/* 输入形态分析                                                        */
/* ------------------------------------------------------------------ */

/** 试解码的规模上限：再大就只做字符集判断，避免每次输入都全量解码。 */
const TRIAL_DECODE_LIMIT = 200_000

/** 文本是否「基本可打印」——用来排除解码出的二进制乱码。 */
function isMostlyPrintable(text: string): boolean {
  if (text.length === 0) return false
  let printable = 0
  let total = 0
  for (const char of text) {
    total += 1
    const code = char.codePointAt(0) ?? 0
    if (code === 9 || code === 10 || code === 13 || (code >= 32 && code !== 127)) printable += 1
  }
  return printable / total >= 0.95
}

/**
 * 判断一段文本是否「像 Base64 编码后的文本」。
 *
 * 只检查字符集是不够的——`helloworld`、`test1234` 也全由合法字符组成。
 * 判定顺序：
 *   1. Data URL 直接算 Base64
 *   2. 长度与字符集必须合法
 *   3. 纯十六进制串排除（更像哈希 / 颜色值，不是 Base64）
 *   4. 试解码，解出**合法可打印 UTF-8** 才算数（覆盖绝大多数文本场景）
 *   5. 解出二进制但字符串足够长、且带有 Base64 特征（+/= 或大小写混排）时也算
 *      —— 例如 PNG 图片的 Base64，否则它会被当成普通文本再编码一次
 */
export function looksLikeBase64Text(raw: string): boolean {
  const trimmed = raw.trim()
  if (!trimmed) return false

  if (DATA_URL_RE.test(trimmed)) return true

  const compact = trimmed.replace(/\s+/g, '')
  if (compact.length < 8) return false
  // 长度除 4 余 1 在任何 Base64 变体下都不合法
  if (compact.length % 4 === 1) return false
  // 含 = 时必须在末尾
  if (!/^[A-Za-z0-9+/\-_]*={0,2}$/.test(compact)) return false
  // 纯十六进制：64 位 SHA-256、32 位 MD5、颜色值都属于这一类，不应该被解码
  if (/^[0-9a-fA-F]+$/.test(compact)) return false

  if (compact.length > TRIAL_DECODE_LIMIT) return true

  const decoded = normalizeBase64(compact)
  if (!decoded.ok || decoded.bytes.length === 0) return false

  try {
    // fatal: true —— 必须是完整合法的 UTF-8，二进制内容会抛错
    const text = new TextDecoder('utf-8', { fatal: true }).decode(decoded.bytes)
    if (isMostlyPrintable(text)) return true
  } catch {
    // 落到下面按二进制 Base64 判断
  }

  // 二进制 Base64（图片、密钥、压缩包等）：解码结果是二进制，没法靠可读性判断，
  // 只能看它有没有「Base64 才有」的特征符号。
  //
  // 这里曾经用「长度 ≥ 44 且大小写混排」，结果 thisIsALongCamelCaseIdentifierUsedAsATestValue
  // 这类普通标识符会被判成 Base64 并被解成乱码（随机字母数字串的误判率约 28%）。
  // 单纯的「长 + 大小写混排」不足以说明问题，必须出现 + / = 或 URL-Safe 的 - _。
  const hasStandardSymbols = /[+/]/.test(compact)
  const hasUrlSafeSymbols = /[-_]/.test(compact)
  const hasPadding = compact.endsWith('=')
  if (!hasStandardSymbols && !hasUrlSafeSymbols && !hasPadding) return false

  // 带 = 填充的最短合法 Base64 是 4 字符，但那太短、误判成本高；
  // 这里统一要求足够长，短输入宁可当成文本让用户手动锁定方向。
  return compact.length >= 16
}

export type InputKind = 'empty' | 'base64' | 'data-url' | 'plain-text'

export interface InputAnalysis {
  kind: InputKind
  label: string
  detail: string
  confidence: number
}

export function analyzeInput(raw: string): InputAnalysis {
  const trimmed = raw.trim()
  if (!trimmed) {
    return { kind: 'empty', label: '等待输入', detail: '粘贴内容后将自动识别', confidence: 0 }
  }

  if (DATA_URL_RE.test(trimmed)) {
    const mime = DATA_URL_RE.exec(trimmed)?.[1]?.split(';')[0] ?? 'unknown'
    return {
      kind: 'data-url',
      label: 'Data URL',
      detail: `内联资源 · ${mime || 'unknown'}`,
      confidence: 0.98,
    }
  }

  const compact = trimmed.replace(/\s+/g, '')
  const charsetLooksBase64 = /^[A-Za-z0-9+/\-_]+={0,2}$/.test(compact) && compact.length % 4 !== 1

  // 与 looksLikeBase64Text 共用同一个判定。
  // 之前这里只看字符集，导致「徽章说疑似 Base64、自动方向却按文本编码」这种自相矛盾。
  if (charsetLooksBase64 && looksLikeBase64Text(trimmed)) {
    const hasUrlSafe = /[-_]/.test(compact)
    const hasStandard = /[+/]/.test(compact)
    const charset = hasUrlSafe && !hasStandard ? 'URL-Safe' : hasStandard && !hasUrlSafe ? '标准字符集' : '混合字符集'
    return {
      kind: 'base64',
      label: '疑似 Base64',
      detail: `${charset} · ${compact.length} 字符`,
      confidence: 0.8,
    }
  }

  return {
    kind: 'plain-text',
    label: '普通文本',
    detail: '按所选编码进行编码',
    confidence: 0.6,
  }
}

/* ------------------------------------------------------------------ */
/* 文件辅助                                                            */
/* ------------------------------------------------------------------ */

const EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'application/pdf': 'pdf',
  'application/json': 'json',
  'application/zip': 'zip',
  'text/plain': 'txt',
  'text/html': 'html',
  'text/css': 'css',
  'text/csv': 'csv',
  'audio/mpeg': 'mp3',
  'video/mp4': 'mp4',
}

export function extensionForMime(mime: string | undefined): string {
  if (!mime) return 'bin'
  // hasOwn：mime 为 "constructor" 之类时不能命中原型链
  const key = mime.toLowerCase()
  return Object.hasOwn(EXT_BY_MIME, key) ? EXT_BY_MIME[key] : 'bin'
}

export function parseDataUrlHeader(value: string): { mime: string; base64: boolean } | null {
  const match = /^data:([^,]*),/i.exec(value.trim())
  if (!match) return null
  const header = match[1] ?? ''
  return { mime: header.split(';')[0]?.trim() ?? '', base64: /;base64/i.test(header) }
}
