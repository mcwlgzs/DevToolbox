/**
 * 密码学安全随机数封装。
 * `crypto.getRandomValues` 在非安全上下文（http:// 且非 localhost）同样可用，
 * 与只在安全上下文才存在的 crypto.subtle 不同（实测：局域网 IP 下 subtle 为 undefined，
 * 而 getRandomValues 仍在）。仅在极老的环境下回落到 Math.random。
 */

const FALLBACK_ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

export function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length)
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(bytes)
    return bytes
  }
  for (let i = 0; i < length; i += 1) {
    bytes[i] = Math.floor(Math.random() * 256)
  }
  return bytes
}

/** 无模偏差的随机整数（拒绝采样）。 */
function randomInt(maxExclusive: number): number {
  if (maxExclusive <= 0) return 0
  const limit = Math.floor(0x1_0000_0000 / maxExclusive) * maxExclusive
  const buffer = new Uint32Array(1)
  for (;;) {
    if (typeof globalThis.crypto?.getRandomValues === 'function') {
      globalThis.crypto.getRandomValues(buffer)
    } else {
      buffer[0] = Math.floor(Math.random() * 0x1_0000_0000)
    }
    if (buffer[0] < limit) return buffer[0] % maxExclusive
  }
}

export function uuidV4(options: { uppercase?: boolean; hyphens?: boolean } = {}): string {
  const bytes = randomBytes(16)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80

  let hex = ''
  for (let i = 0; i < 16; i += 1) {
    hex += bytes[i].toString(16).padStart(2, '0')
  }

  const value = options.hyphens === false
    ? hex
    : `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`

  return options.uppercase ? value.toUpperCase() : value
}

export interface CharsetOptions {
  lower: boolean
  upper: boolean
  digits: boolean
  symbols: boolean
}

export const CHARSET_PARTS = {
  lower: 'abcdefghijklmnopqrstuvwxyz',
  upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  digits: '0123456789',
  symbols: '!@#$%^&*()-_=+[]{};:,.?/~',
} as const

export function buildCharset(options: CharsetOptions): string {
  let charset = ''
  if (options.lower) charset += CHARSET_PARTS.lower
  if (options.upper) charset += CHARSET_PARTS.upper
  if (options.digits) charset += CHARSET_PARTS.digits
  if (options.symbols) charset += CHARSET_PARTS.symbols
  return charset || FALLBACK_ALPHABET
}

export function randomString(length: number, charset: string): string {
  const source = charset.length > 0 ? charset : FALLBACK_ALPHABET
  let out = ''
  for (let i = 0; i < length; i += 1) {
    out += source[randomInt(source.length)]
  }
  return out
}

/** 熵估算（比特）：length × log2(字符集大小)。 */
export function entropyBits(length: number, charsetSize: number): number {
  return Math.round(length * Math.log2(Math.max(charsetSize, 2)))
}

export function strengthLabel(bits: number): { label: string; tone: 'weak' | 'fair' | 'good' | 'strong' } {
  if (bits < 40) return { label: '偏弱', tone: 'weak' }
  if (bits < 64) return { label: '一般', tone: 'fair' }
  if (bits < 90) return { label: '较强', tone: 'good' }
  return { label: '很强', tone: 'strong' }
}
