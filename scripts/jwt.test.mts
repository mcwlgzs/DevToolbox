/**
 * JWT 签发 / 验签自检。
 * 用法：node scripts/jwt.test.mts
 *
 * 关键用例是 jwt.io 官方示例（HS256 + your-256-bit-secret），
 * 它能一次性证明 Base64URL 编码、头部序列化与 HMAC-SHA256 三者都对。
 */
import assert from 'node:assert/strict'
import { hmac } from '../src/lib/hmac.ts'
import {
  base64UrlDecode,
  base64UrlEncode,
  decodeSegmentJson,
  encodeSegment,
  signJwt,
  timingSafeEqual,
  verifyJwt,
} from '../src/lib/jwt.ts'

let passed = 0
function check(name: string, fn: () => void) {
  fn()
  passed += 1
  console.log(`  ✓ ${name}`)
}

console.log('jwt self-test')

const EXPECTED_TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'
const EXPECTED_PAYLOAD = '{"sub":"1234567890","name":"John Doe","iat":1516239022}'
const SECRET = 'your-256-bit-secret'

check('Base64URL：编码去掉填充并把 + / 换成 - _', () => {
  // 0xFB 0xFF 会产出 "+/" 的变体，正好覆盖替换逻辑
  assert.equal(base64UrlEncode(new Uint8Array([0xfb, 0xff, 0xbf])), '-_-_')
  assert.equal(base64UrlEncode(new TextEncoder().encode('a')), 'YQ')
  assert.ok(!base64UrlEncode(new Uint8Array([1, 2, 3])).includes('='))
})

check('Base64URL：解码兼容缺填充与两种字符集', () => {
  const withPadding = base64UrlDecode('YQ==')
  assert.equal(withPadding.error, null)
  assert.deepEqual(Array.from(withPadding.bytes!), [0x61])

  assert.deepEqual(Array.from(base64UrlDecode('-_-_').bytes!), [0xfb, 0xff, 0xbf])
  assert.deepEqual(Array.from(base64UrlDecode('+/+/').bytes!), [0xfb, 0xff, 0xbf])

  assert.equal(base64UrlDecode('').bytes, null)
  assert.match(base64UrlDecode('YQ$a').error!, /Base64URL/)
})

check('片段编解码往返一致', () => {
  const value = { sub: '1234567890', 名称: '中文', n: [1, 2, 3] }
  const segment = encodeSegment(value)
  const decoded = decodeSegmentJson(segment)
  assert.equal(decoded.error, null)
  assert.deepEqual(decoded.value, value)

  assert.match(decodeSegmentJson(base64UrlEncode(new TextEncoder().encode('{bad'))).error!, /JSON/)
  assert.match(decodeSegmentJson(encodeSegment(undefined)).error!, /片段为空/)
  assert.match(decodeSegmentJson('!!!').error!, /Base64URL/)
})

check('HS256 签发与 jwt.io 官方示例逐字节一致', () => {
  const result = signJwt(EXPECTED_PAYLOAD, SECRET)
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.token, EXPECTED_TOKEN, '签发结果与官方示例不一致')
})

check('签发：自动补 iat，且不覆盖已有的 iat', () => {
  const fixed = signJwt('{"sub":"1"}', SECRET, { now: 1_700_000_000 })
  assert.equal(fixed.ok, true)
  if (!fixed.ok) return
  const payload = decodeSegmentJson(fixed.payload).value as Record<string, unknown>
  assert.equal(payload.iat, 1_700_000_000)

  const kept = signJwt(EXPECTED_PAYLOAD, SECRET, { now: 1_700_000_000 })
  assert.equal(kept.ok, true)
  if (!kept.ok) return
  const keptPayload = decodeSegmentJson(kept.payload).value as Record<string, unknown>
  assert.equal(keptPayload.iat, 1516239022, '已有的 iat 被覆盖了')

  const withoutIat = signJwt('{"sub":"1"}', SECRET, { addIssuedAt: false })
  assert.equal(withoutIat.ok, true)
  if (!withoutIat.ok) return
  assert.equal((decodeSegmentJson(withoutIat.payload).value as Record<string, unknown>).iat, undefined)
})

check('签发：expiresIn 基于 iat 补 exp，且不覆盖已有 exp', () => {
  const signed = signJwt('{"sub":"1"}', SECRET, { now: 1_700_000_000, expiresIn: 3600 })
  assert.equal(signed.ok, true)
  if (!signed.ok) return
  const payload = decodeSegmentJson(signed.payload).value as Record<string, unknown>
  assert.equal(payload.iat, 1_700_000_000)
  assert.equal(payload.exp, 1_700_003_600)

  const existing = signJwt('{"sub":"1","exp":99}', SECRET, { now: 1_700_000_000, expiresIn: 3600 })
  assert.equal(existing.ok, true)
  if (!existing.ok) return
  assert.equal((decodeSegmentJson(existing.payload).value as Record<string, unknown>).exp, 99)

  // 没有 iat 时就以当前时间为基准
  const noIat = signJwt('{"sub":"1"}', SECRET, {
    now: 1_700_000_000,
    addIssuedAt: false,
    expiresIn: 60,
  })
  assert.equal(noIat.ok, true)
  if (!noIat.ok) return
  const noIatPayload = decodeSegmentJson(noIat.payload).value as Record<string, unknown>
  assert.equal(noIatPayload.iat, undefined)
  assert.equal(noIatPayload.exp, 1_700_000_060)
})

check('签发：拒绝非法输入', () => {
  assert.match((signJwt('{"a":1}', '') as { error: string }).error, /密钥/)
  assert.match((signJwt('{a:1}', SECRET) as { error: string }).error, /JSON/)
  assert.match((signJwt('[1,2]', SECRET) as { error: string }).error, /JSON 对象/)
  assert.match((signJwt('"abc"', SECRET) as { error: string }).error, /JSON 对象/)
  // 空白 Payload 视为空对象
  const empty = signJwt('', SECRET)
  assert.equal(empty.ok, true)
})

check('签发：密钥支持文本 / 十六进制 / Base64 三种写法', () => {
  const payload = '{"sub":"1"}'
  const text = signJwt(payload, 'hello', { keyFormat: 'text' })
  const hex = signJwt(payload, '68656c6c6f', { keyFormat: 'hex' })
  const base64 = signJwt(payload, 'aGVsbG8=', { keyFormat: 'base64' })
  assert.equal(text.ok && hex.ok && base64.ok, true)
  if (!text.ok || !hex.ok || !base64.ok) return
  assert.equal(text.token, hex.token, 'hex 密钥与等价文本密钥结果不同')
  assert.equal(text.token, base64.token, 'base64 密钥与等价文本密钥结果不同')

  const bad = signJwt(payload, 'zz', { keyFormat: 'hex' })
  assert.equal(bad.ok, false)
})

check('验签：官方示例通过', () => {
  const result = verifyJwt(EXPECTED_TOKEN, SECRET)
  assert.equal(result.error, null)
  assert.equal(result.valid, true)
  assert.equal(result.algorithm, 'HS256')
  assert.deepEqual(result.payload, JSON.parse(EXPECTED_PAYLOAD))
  assert.equal(result.expired, null, '示例没有 exp')
})

check('验签：错误密钥必须失败', () => {
  const result = verifyJwt(EXPECTED_TOKEN, 'wrong-secret')
  assert.equal(result.valid, false)
  assert.equal(result.error, null, '密钥错误是「验签不通过」，不是解析错误')
})

check('验签：篡改 Payload 必须被发现', () => {
  const [header, , signature] = EXPECTED_TOKEN.split('.')
  const forgedPayload = encodeSegment({ sub: '1234567890', name: 'John Doe', iat: 1516239022, admin: true })
  const forged = `${header}.${forgedPayload}.${signature}`
  const result = verifyJwt(forged, SECRET)
  assert.equal(result.valid, false, '篡改后的 Token 竟然验签通过')
})

check('验签：定长比较', () => {
  assert.equal(timingSafeEqual('abc', 'abc'), true)
  assert.equal(timingSafeEqual('abc', 'abd'), false)
  assert.equal(timingSafeEqual('abc', 'abcd'), false)
})

check('验签：拒绝结构不合法与不支持的算法', () => {
  assert.match(verifyJwt('', SECRET).error!, /Token 为空/)
  assert.match(verifyJwt('a.b', SECRET).error!, /3 段/)
  assert.match(verifyJwt('a.b.c.d', SECRET).error!, /3 段/)
  assert.match(verifyJwt(`${encodeSegment({ alg: 'HS256' })}.e30.`, SECRET).error!, /缺少签名段/)

  const none = signJwt('{"sub":"1"}', SECRET)
  assert.equal(none.ok, true)
  if (!none.ok) return
  const parts = none.token.split('.')
  const noneToken = `${encodeSegment({ alg: 'none', typ: 'JWT' })}.${parts[1]}.`
  assert.match(verifyJwt(noneToken, SECRET).error!, /none/)

  const rs256 = `${encodeSegment({ alg: 'RS256', typ: 'JWT' })}.${parts[1]}.${parts[2]}`
  assert.match(verifyJwt(rs256, SECRET).error!, /只能校验 HS256/)
})

check('验签：exp / nbf 判定', () => {
  const token = signJwt('{"sub":"1","exp":1000,"nbf":500}', SECRET, { addIssuedAt: false })
  assert.equal(token.ok, true)
  if (!token.ok) return

  const before = verifyJwt(token.token, SECRET, { now: 400 })
  assert.equal(before.valid, true)
  assert.equal(before.expired, false)
  assert.equal(before.notYetValid, true, 'nbf 未到应判定为尚未生效')

  const inside = verifyJwt(token.token, SECRET, { now: 700 })
  assert.equal(inside.expired, false)
  assert.equal(inside.notYetValid, false)

  const after = verifyJwt(token.token, SECRET, { now: 2000 })
  assert.equal(after.expired, true)
  assert.equal(after.notYetValid, false)

  // 关掉时间校验后只看签名
  const noTime = verifyJwt(token.token, SECRET, { now: 2000, checkTime: false })
  assert.equal(noTime.expired, null)
  assert.equal(noTime.notYetValid, null)

  // 时钟偏移
  const tolerated = verifyJwt(token.token, SECRET, { now: 1005, clockTolerance: 10 })
  assert.equal(tolerated.expired, false)
})

check('签发 → 验签 使用中文与 emoji 也一致', () => {
  const payload = '{"名称":"工具箱 🚀","说明":"中文测试"}'
  const signed = signJwt(payload, '密钥', { keyFormat: 'text', addIssuedAt: false })
  assert.equal(signed.ok, true)
  if (!signed.ok) return
  const verified = verifyJwt(signed.token, '密钥')
  assert.equal(verified.valid, true)
  assert.deepEqual(verified.payload, JSON.parse(payload))
})

check('验签：exp / nbf 不是数字时必须给出警告', () => {
  // 回归：exp 写成字符串时以前会静默放过，UI 显示成「未设置 exp」，看起来像永不过期
  const signed = signJwt('{"sub":"1","exp":"100"}', SECRET, { addIssuedAt: false })
  assert.equal(signed.ok, true)
  if (!signed.ok) return
  const result = verifyJwt(signed.token, SECRET, { now: 2_000_000_000 })
  assert.equal(result.valid, true, '签名本身是有效的')
  assert.equal(result.expired, null, '无法判定过期时间')
  assert.ok(
    result.warnings.some((warning) => warning.includes('exp')),
    `应提示 exp 不是数字，实际警告：${JSON.stringify(result.warnings)}`,
  )
})

check('验签：Payload 不是对象时给出警告', () => {
  // 手工签一个 Payload 为数组的 Token：签名本身有效，但结构不合预期
  const header = encodeSegment({ alg: 'HS256', typ: 'JWT' })
  const payload = encodeSegment([1, 2, 3])
  const signature = base64UrlEncode(
    hmac(new TextEncoder().encode(SECRET), new TextEncoder().encode(`${header}.${payload}`), 'sha256'),
  )
  const result = verifyJwt(`${header}.${payload}.${signature}`, SECRET)
  assert.equal(result.valid, true, '签名应校验通过')
  assert.deepEqual(result.payload, [1, 2, 3])
  assert.ok(
    result.warnings.some((warning) => warning.includes('Payload')),
    `应提示 Payload 不是对象，实际：${JSON.stringify(result.warnings)}`,
  )
})

check('验签：alg 大小写不规范时给出警告并归一显示', () => {
  const header = encodeSegment({ alg: 'hs256', typ: 'JWT' })
  const payload = encodeSegment({ sub: '1' })
  const signature = base64UrlEncode(
    hmac(new TextEncoder().encode(SECRET), new TextEncoder().encode(`${header}.${payload}`), 'sha256'),
  )
  const result = verifyJwt(`${header}.${payload}.${signature}`, SECRET)
  assert.equal(result.valid, true, '宽容地照常校验')
  assert.equal(result.algorithm, 'HS256', '对外统一显示注册值写法')
  assert.ok(
    result.warnings.some((warning) => warning.includes('alg')),
    `应提示 alg 写法不规范，实际：${JSON.stringify(result.warnings)}`,
  )

  // 规范写法不该产生这条警告
  const proper = verifyJwt(
    signJwt('{"sub":"1"}', SECRET, { addIssuedAt: false }).ok
      ? (signJwt('{"sub":"1"}', SECRET, { addIssuedAt: false }) as { token: string }).token
      : '',
    SECRET,
  )
  assert.equal(proper.warnings.some((warning) => warning.includes('alg')), false)
})

console.log(`\n${passed} checks passed`)
