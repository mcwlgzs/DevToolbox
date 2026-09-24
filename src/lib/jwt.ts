/**
 * JWT 的签发与验签（HS256）。
 *
 * 只做 HS256 是刻意的取舍：项目内的哈希实现是纯 JavaScript 的 MD5 / SHA-1 / SHA-256，
 * 没有 SHA-384 / SHA-512，也没有 RSA / ECDSA 这类非对称算法。
 * 与其在界面上摆一排点了就报错的选项，不如只提供实际使用最多、且真正能算准的这一种。
 */

import { base64ToBytes, bytesToBase64 } from './base64.ts'
import { hmac, parseKey, type KeyFormat } from './hmac.ts'

export type JwtAlgorithm = 'HS256'

export const JWT_ALGORITHMS: ReadonlyArray<{ value: JwtAlgorithm; label: string }> = [
  { value: 'HS256', label: 'HS256（HMAC-SHA256）' },
]

const HMAC_FOR: Record<JwtAlgorithm, 'sha256'> = { HS256: 'sha256' }

/* ------------------------------------------------------------------ */
/* Base64URL                                                           */
/* ------------------------------------------------------------------ */

/** Base64URL 编码：`+ /` 换成 `- _`，去掉末尾填充（RFC 7515 §2）。 */
export function base64UrlEncode(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export interface SegmentDecodeResult {
  bytes: Uint8Array | null
  error: string | null
}

/** Base64URL 解码；对缺失的填充与 `- _` 写法都兼容。 */
export function base64UrlDecode(segment: string): SegmentDecodeResult {
  // 规范里 JWT 片段不带填充，但手写的 Token 常带着 "="，这里一并容忍；
  // 标准 Base64 的 + / 也放行，方便处理被别的库重新编码过的 Token
  const clean = segment.trim().replace(/\s+/g, '').replace(/=+$/, '')
  if (!clean) return { bytes: null, error: '片段为空' }
  if (!/^[A-Za-z0-9+/\-_]+$/.test(clean)) {
    return { bytes: null, error: '片段含有 Base64URL 之外的字符' }
  }

  const standard = clean.replace(/-/g, '+').replace(/_/g, '/')
  const padded = standard + '='.repeat((4 - (standard.length % 4)) % 4)
  try {
    return { bytes: base64ToBytes(padded), error: null }
  } catch {
    return { bytes: null, error: '片段不是合法的 Base64URL' }
  }
}

/** 把一个 JS 值编码成 JWT 片段（紧凑 JSON + Base64URL）。 */
export function encodeSegment(value: unknown): string {
  return base64UrlEncode(new TextEncoder().encode(JSON.stringify(value)))
}

/** 解码 JWT 片段为 JS 值。 */
export function decodeSegmentJson(segment: string): { value: unknown; error: string | null } {
  const { bytes, error } = base64UrlDecode(segment)
  if (error || !bytes) return { value: null, error }

  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return { value: null, error: '片段不是合法的 UTF-8 文本' }
  }

  try {
    return { value: JSON.parse(text), error: null }
  } catch {
    return { value: null, error: '片段不是合法的 JSON' }
  }
}

/* ------------------------------------------------------------------ */
/* 签发                                                                */
/* ------------------------------------------------------------------ */

export interface JwtSignOptions {
  keyFormat: KeyFormat
  /** 自动补 iat（Payload 里已有则不动） */
  addIssuedAt: boolean
  /** 在头部写入 typ: JWT */
  addType: boolean
  /** 自动补 exp（Payload 里已有则不动），值为相对签发时间的秒数 */
  expiresIn?: number
  /** 当前时间（Unix 秒）；默认取系统时间，测试时可固定 */
  now?: number
}

export const DEFAULT_JWT_SIGN_OPTIONS: JwtSignOptions = {
  keyFormat: 'text',
  addIssuedAt: true,
  addType: true,
}

export type JwtSignResult =
  | { ok: true; token: string; header: string; payload: string; signature: string }
  | { ok: false; error: string }

/** 用 HS256 签发一个 JWT。 */
export function signJwt(
  payloadText: string,
  secret: string,
  options: Partial<JwtSignOptions> = {},
): JwtSignResult {
  const merged = { ...DEFAULT_JWT_SIGN_OPTIONS, ...options }
  if (!secret) return { ok: false, error: '请填写签名密钥' }

  let parsed: unknown
  const trimmed = payloadText.trim()
  try {
    parsed = trimmed ? JSON.parse(trimmed) : {}
  } catch (error) {
    return { ok: false, error: `Payload 不是合法 JSON：${(error as Error).message}` }
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, error: 'Payload 必须是一个 JSON 对象' }
  }

  const payload: Record<string, unknown> = { ...(parsed as Record<string, unknown>) }
  const now = merged.now ?? Math.floor(Date.now() / 1000)
  if (merged.addIssuedAt && payload.iat === undefined) payload.iat = now
  if (merged.expiresIn !== undefined && payload.exp === undefined) {
    const issuedAt = typeof payload.iat === 'number' ? payload.iat : now
    payload.exp = issuedAt + merged.expiresIn
  }

  const header: Record<string, unknown> = { alg: 'HS256' }
  if (merged.addType) header.typ = 'JWT'

  const { bytes: keyBytes, error: keyError } = parseKey(secret, merged.keyFormat)
  if (keyError) return { ok: false, error: keyError }
  if (!keyBytes || keyBytes.length === 0) return { ok: false, error: '密钥不能为空' }

  const headerSegment = encodeSegment(header)
  const payloadSegment = encodeSegment(payload)
  const signingInput = `${headerSegment}.${payloadSegment}`
  const signature = base64UrlEncode(hmac(keyBytes, new TextEncoder().encode(signingInput), HMAC_FOR.HS256))

  return {
    ok: true,
    token: `${signingInput}.${signature}`,
    header: headerSegment,
    payload: payloadSegment,
    signature,
  }
}

/* ------------------------------------------------------------------ */
/* 验签                                                                */
/* ------------------------------------------------------------------ */

export interface JwtVerifyOptions {
  keyFormat: KeyFormat
  /** 校验 exp / nbf */
  checkTime: boolean
  /** 当前时间（Unix 秒） */
  now?: number
  /** 允许的时钟偏移（秒），默认放行 0 秒 */
  clockTolerance?: number
}

export const DEFAULT_JWT_VERIFY_OPTIONS: JwtVerifyOptions = {
  keyFormat: 'text',
  checkTime: true,
}

export interface JwtVerifyResult {
  ok: boolean
  /** 签名是否匹配 */
  valid: boolean
  algorithm: string
  header: unknown
  payload: unknown
  /** exp 是否已过；没有 exp 时为 null */
  expired: boolean | null
  /** nbf 是否还没到；没有 nbf 时为 null */
  notYetValid: boolean | null
  error: string | null
  warnings: string[]
}

/**
 * 比较两个等长字符串的每一个字符，不因内容不同而提前返回。
 *
 * 长度不等时直接返回 false：签名长度是公开且固定的（HS256 恒为 43 个 Base64URL 字符），
 * 不构成秘密泄露。真正要避免的是「逐字符比较、一遇不同就 return」——那会泄露前缀匹配长度。
 */
export function timingSafeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false
  let diff = 0
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index)
  }
  return diff === 0
}

const FAIL = (error: string, extra: Partial<JwtVerifyResult> = {}): JwtVerifyResult => ({
  ok: false,
  valid: false,
  algorithm: '—',
  header: null,
  payload: null,
  expired: null,
  notYetValid: null,
  error,
  warnings: [],
  ...extra,
})

/** 校验签名（以及可选的 exp / nbf）。 */
export function verifyJwt(
  token: string,
  secret: string,
  options: Partial<JwtVerifyOptions> = {},
): JwtVerifyResult {
  const merged = { ...DEFAULT_JWT_VERIFY_OPTIONS, ...options }
  const trimmed = token.trim()
  if (!trimmed) return FAIL('Token 为空')

  const segments = trimmed.split('.')
  if (segments.length !== 3) {
    return FAIL(`JWT 需要 3 段（Header.Payload.Signature），当前有 ${segments.length} 段`)
  }
  const [headerSegment, payloadSegment, signatureSegment] = segments

  const header = decodeSegmentJson(headerSegment)
  if (header.error) return FAIL(`Header 解码失败：${header.error}`)
  const payload = decodeSegmentJson(payloadSegment)
  if (payload.error) return FAIL(`Payload 解码失败：${payload.error}`)

  const headerRecord =
    header.value && typeof header.value === 'object' ? (header.value as Record<string, unknown>) : {}
  const algorithm = String(headerRecord.alg ?? '')
  const warnings: string[] = []

  // alg 与签名段的问题要先于「缺签名」给出，否则 alg:none 这种最危险的情况会被笼统的提示盖过去
  if (algorithm.toUpperCase() === 'NONE') {
    return FAIL('alg 为 none：该 Token 未签名，任何内容都可以被伪造', {
      algorithm,
      header: header.value,
      payload: payload.value,
    })
  }
  if (algorithm.toUpperCase() !== 'HS256') {
    return FAIL(`本工具只能校验 HS256，该 Token 使用 ${algorithm || '未知算法'}`, {
      algorithm,
      header: header.value,
      payload: payload.value,
    })
  }
  // RFC 7515 的 alg 取值是大小写敏感的，'hs256' 并不是注册值。
  // 这里宽容地照常校验，但要明确提示，并且对外统一显示成规范写法。
  if (algorithm !== 'HS256') {
    warnings.push(`alg 写法不规范（"${algorithm}"），注册值是 "HS256"，请确认签发方是否合规`)
  }
  if (!signatureSegment) {
    return FAIL('缺少签名段，无法验签', { algorithm, header: header.value, payload: payload.value })
  }
  if (!secret) {
    return FAIL('请填写用于验签的密钥', { algorithm, header: header.value, payload: payload.value })
  }

  const { bytes: keyBytes, error: keyError } = parseKey(secret, merged.keyFormat)
  if (keyError) return FAIL(keyError, { algorithm, header: header.value, payload: payload.value })
  if (!keyBytes || keyBytes.length === 0) {
    return FAIL('密钥不能为空', { algorithm, header: header.value, payload: payload.value })
  }

  const expected = base64UrlEncode(
    hmac(keyBytes, new TextEncoder().encode(`${headerSegment}.${payloadSegment}`), HMAC_FOR.HS256),
  )
  const valid = timingSafeEqual(expected, signatureSegment)

  if (!headerRecord.typ) warnings.push('Header 里没有 typ 字段，规范建议写成 "JWT"')

  const payloadRecord =
    payload.value && typeof payload.value === 'object' ? (payload.value as Record<string, unknown>) : {}
  if (
    payload.value === null ||
    typeof payload.value !== 'object' ||
    Array.isArray(payload.value)
  ) {
    warnings.push('Payload 不是一个 JSON 对象，请确认 Token 是否符合预期')
  }
  const now = merged.now ?? Math.floor(Date.now() / 1000)
  const tolerance = merged.clockTolerance ?? 0

  let expired: boolean | null = null
  let notYetValid: boolean | null = null

  if (merged.checkTime) {
    // exp / nbf 存在但不是数字时不能静默放过：那会把「已过期」显示成「未设置 exp」
    for (const claim of ['exp', 'nbf'] as const) {
      const value = payloadRecord[claim]
      if (value !== undefined && (typeof value !== 'number' || !Number.isFinite(value))) {
        warnings.push(`${claim} 不是数字（实际是 ${typeof value}），本次未做时间校验`)
      }
    }
    if (typeof payloadRecord.exp === 'number' && Number.isFinite(payloadRecord.exp)) {
      expired = now > payloadRecord.exp + tolerance
    }
    if (typeof payloadRecord.nbf === 'number' && Number.isFinite(payloadRecord.nbf)) {
      notYetValid = now + tolerance < payloadRecord.nbf
    }
  }

  return {
    ok: true,
    valid,
    // 对外统一显示规范写法，避免界面上一会儿 HS256 一会儿 hs256
    algorithm: algorithm.toUpperCase(),
    header: header.value,
    payload: payload.value,
    expired,
    notYetValid,
    error: null,
    warnings,
  }
}

/** 界面上的示例载荷。 */
export const JWT_SAMPLE_PAYLOAD = `{
  "sub": "1234567890",
  "name": "DevToolbox",
  "role": "admin",
  "iat": 1735689600,
  "exp": 1767225600
}`

export const JWT_SAMPLE_TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'

export const JWT_SAMPLE_SECRET = 'your-256-bit-secret'
