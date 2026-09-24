/**
 * HMAC（RFC 2104）实现，构建在纯 JS 的 MD5 / SHA-1 / SHA-256 之上。
 * 不依赖 Web Crypto，因此在 http:// 这类非安全上下文（crypto.subtle 不可用）下同样能算。
 */

import { createHasher, toHex, type HashAlgorithm } from './hash.ts'

/** 允许的 HMAC 算法（不含 MD5 之外的弱算法警告由 UI 呈现）。 */
export type HmacAlgorithm = Extract<HashAlgorithm, 'md5' | 'sha1' | 'sha256'>

export const HMAC_ALGORITHMS: ReadonlyArray<{ value: HmacAlgorithm; label: string }> = [
  { value: 'sha256', label: 'HMAC-SHA256（推荐）' },
  { value: 'sha1', label: 'HMAC-SHA1（旧系统兼容）' },
  { value: 'md5', label: 'HMAC-MD5（旧系统兼容）' },
]

/** 这三种算法的分组长度都是 64 字节。 */
const BLOCK_SIZE = 64
const IPAD = 0x36
const OPAD = 0x5c

function normalizeKey(key: Uint8Array, algorithm: HmacAlgorithm): Uint8Array {
  if (key.length === BLOCK_SIZE) return key
  if (key.length < BLOCK_SIZE) {
    const padded = new Uint8Array(BLOCK_SIZE)
    padded.set(key)
    return padded
  }
  // RFC 2104：超长密钥先用它自己的哈希算法压缩，而不是统一用 SHA-256
  const hasher = createHasher(algorithm)
  hasher.update(key)
  const digest = hasher.digest()
  const padded = new Uint8Array(BLOCK_SIZE)
  padded.set(digest)
  return padded
}

/** 计算 HMAC，返回原始摘要字节。 */
export function hmac(key: Uint8Array, message: Uint8Array, algorithm: HmacAlgorithm): Uint8Array {
  const blockKey = normalizeKey(key, algorithm)

  const innerPad = new Uint8Array(BLOCK_SIZE)
  const outerPad = new Uint8Array(BLOCK_SIZE)
  for (let index = 0; index < BLOCK_SIZE; index += 1) {
    innerPad[index] = blockKey[index] ^ IPAD
    outerPad[index] = blockKey[index] ^ OPAD
  }

  const inner = createHasher(algorithm)
  inner.update(innerPad)
  inner.update(message)
  const innerDigest = inner.digest()

  const outer = createHasher(algorithm)
  outer.update(outerPad)
  outer.update(innerDigest)
  return outer.digest()
}

export function hmacHex(key: Uint8Array, message: Uint8Array, algorithm: HmacAlgorithm): string {
  return toHex(hmac(key, message, algorithm))
}

/* ------------------------------------------------------------------ */
/* 密钥输入的多种写法                                                  */
/* ------------------------------------------------------------------ */

export type KeyFormat = 'text' | 'hex' | 'base64'

export const KEY_FORMATS: ReadonlyArray<{ value: KeyFormat; label: string }> = [
  { value: 'text', label: '文本（UTF-8）' },
  { value: 'hex', label: '十六进制' },
  { value: 'base64', label: 'Base64' },
]

function base64ToBytes(input: string): Uint8Array | null {
  try {
    const clean = input.trim().replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/')
    const padded = clean + '='.repeat((4 - (clean.length % 4)) % 4)
    const binary = atob(padded)
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
    return bytes
  } catch {
    return null
  }
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index])
  return btoa(binary)
}

export interface KeyParseResult {
  bytes: Uint8Array | null
  error: string | null
}

export function parseKey(input: string, format: KeyFormat): KeyParseResult {
  if (format === 'text') return { bytes: new TextEncoder().encode(input), error: null }

  if (format === 'hex') {
    const clean = input.trim().replace(/[\s:]/g, '').replace(/^0x/i, '')
    if (clean.length === 0) return { bytes: new Uint8Array(0), error: null }
    if (!/^[0-9a-fA-F]+$/.test(clean) || clean.length % 2 !== 0) {
      return { bytes: null, error: '十六进制密钥必须是偶数位的 0–9 / a–f' }
    }
    const bytes = new Uint8Array(clean.length / 2)
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Number.parseInt(clean.slice(index * 2, index * 2 + 2), 16)
    }
    return { bytes, error: null }
  }

  const bytes = base64ToBytes(input)
  if (!bytes) return { bytes: null, error: 'Base64 密钥格式不正确' }
  return { bytes, error: null }
}

export interface HmacRow {
  algorithm: HmacAlgorithm
  label: string
  hex: string
  base64: string
}

/** 一次算出全部算法的 HMAC。 */
export function hmacAll(key: Uint8Array, message: Uint8Array): HmacRow[] {
  return HMAC_ALGORITHMS.map((item) => {
    const digest = hmac(key, message, item.value)
    return {
      algorithm: item.value,
      label: item.label.replace(/\s*（.*）$/, ''),
      hex: toHex(digest),
      base64: bytesToBase64(digest),
    }
  })
}
