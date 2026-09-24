/**
 * 无依赖自检脚本：node scripts/base64.test.mts
 * 直接运行 TypeScript（Node 24 原生类型擦除）。
 */
import assert from 'node:assert/strict'
import {
  analyzeInput,
  decodeBase64,
  decodeText,
  encodeBytes,
  encodeText,
  extensionForMime,
  looksLikeBase64Text,
  textByteLength,
  type EncodeOptions,
} from '../src/lib/base64.ts'

const std: EncodeOptions = { variant: 'standard', padding: true, wrap: 0 }
const urlSafe: EncodeOptions = { variant: 'urlsafe', padding: false, wrap: 0 }

let passed = 0
function check(name: string, fn: () => void) {
  fn()
  passed += 1
  console.log(`  ✓ ${name}`)
}

console.log('base64 codec self-test')

check('RFC 4648 标准向量', () => {
  const vectors: Array<[string, string]> = [
    ['', ''],
    ['f', 'Zg=='],
    ['fo', 'Zm8='],
    ['foo', 'Zm9v'],
    ['foob', 'Zm9vYg=='],
    ['fooba', 'Zm9vYmE='],
    ['foobar', 'Zm9vYmFy'],
  ]
  for (const [plain, b64] of vectors) {
    assert.equal(encodeText(plain, 'utf-8', std), b64, `encode ${plain}`)
    if (plain === '') continue // 空输入按 UI 约定视为错误，仅校验编码结果
    const decoded = decodeBase64(b64)
    assert.ok(decoded.ok, `decode ${b64}`)
    const text = decodeText(decoded.bytes, 'utf-8', b64)
    assert.ok(text.ok)
    assert.equal(text.text, plain, `roundtrip ${plain}`)
  }
})

check('UTF-8 多字节往返', () => {
  const value = 'Base64 编解码 · 世界 🚀'
  const encoded = encodeText(value, 'utf-8', std)
  const decoded = decodeBase64(encoded)
  assert.ok(decoded.ok)
  const text = decodeText(decoded.bytes, 'utf-8', encoded)
  assert.ok(text.ok)
  assert.equal(text.text, value)
  assert.equal(decoded.bytes.length, textByteLength(value, 'utf-8'))
})

check('URL-Safe 且省略填充', () => {
  const bytes = new Uint8Array([0xfb, 0xff, 0xbf])
  const encoded = encodeBytes(bytes, urlSafe)
  assert.equal(encoded, '-_-_')
  const decoded = decodeBase64(encoded)
  assert.ok(decoded.ok)
  assert.deepEqual([...decoded.bytes], [0xfb, 0xff, 0xbf])
})

check('MIME 换行还原', () => {
  const bytes = new Uint8Array(200).map((_, index) => index)
  const encoded = encodeBytes(bytes, { variant: 'standard', padding: true, wrap: 76 })
  assert.ok(encoded.includes('\n'))
  assert.ok(encoded.split('\n').every((line) => line.length <= 76))
  const decoded = decodeBase64(encoded)
  assert.ok(decoded.ok)
  assert.deepEqual([...decoded.bytes], [...bytes])
})

check('容忍空白、缺失填充与 Data URL 头部', () => {
  const decoded = decodeBase64('data:text/plain;base64,  Zm9v\n  YmFy ')
  assert.ok(decoded.ok)
  assert.equal(decoded.mime, 'text/plain')
  assert.equal(new TextDecoder().decode(decoded.bytes), 'foobar')
  assert.ok(decoded.warnings.length > 0)
})

check('非法输入被拒绝', () => {
  assert.equal(decodeBase64('').ok, false)
  assert.equal(decodeBase64('Zm9v!').ok, false)
  assert.equal(decodeBase64('Z').ok, false)
})

check('UTF-16LE 编码往返', () => {
  const value = 'Base64 测试'
  const encoded = encodeText(value, 'utf-16le', std)
  const decoded = decodeBase64(encoded)
  assert.ok(decoded.ok)
  const text = decodeText(decoded.bytes, 'utf-16le', encoded)
  assert.ok(text.ok)
  assert.equal(text.text, value)
})

check('二进制字节保真（非文本）', () => {
  const bytes = new Uint8Array(256).map((_, index) => index)
  const decoded = decodeBase64(encodeBytes(bytes, std))
  assert.ok(decoded.ok)
  assert.deepEqual([...decoded.bytes], [...bytes])
  // 非法 UTF-8 时应退回 Latin-1 并给出告警
  const text = decodeText(decoded.bytes, 'utf-8', '')
  assert.ok(text.ok)
  if (text.ok) assert.ok(text.warnings.length > 0)
})

check('输入形态识别', () => {
  assert.equal(analyzeInput('  ').kind, 'empty')
  assert.equal(analyzeInput('data:image/png;base64,iVBORw0KGgo=').kind, 'data-url')
  assert.equal(analyzeInput('Zm9vYmFyZm9vYmFy').kind, 'base64')
  assert.equal(analyzeInput('hello world 你好').kind, 'plain-text')
})

check('自动方向判断：真正的 Base64 会被识别', () => {
  // 标准与 URL-Safe 变体
  assert.equal(looksLikeBase64Text(encodeText('hello world', 'utf-8', std)), true)
  assert.equal(looksLikeBase64Text(encodeText('hello world', 'utf-8', urlSafe)), true)
  assert.equal(looksLikeBase64Text(encodeText('中文内容 · 测试', 'utf-8', std)), true)
  assert.equal(looksLikeBase64Text(encodeText('{"a":1,"b":[2,3]}', 'utf-8', std)), true)
  assert.equal(looksLikeBase64Text(encodeText('x'.repeat(500), 'utf-8', std)), true)
  // 带换行的 MIME 输出
  assert.equal(
    looksLikeBase64Text(encodeBytes(new Uint8Array(200).map((_, i) => i + 32), { variant: 'standard', padding: true, wrap: 76 })),
    true,
  )
  // Data URL
  assert.equal(looksLikeBase64Text('data:text/plain;base64,aGVsbG8gd29ybGQ='), true)
  assert.equal(looksLikeBase64Text('data:image/png;base64,iVBORw0KGgoAAAANSUhEUg=='), true)
})

check('自动方向判断：普通文本不会被误判', () => {
  // 这些字符串全都由合法 Base64 字符组成，只看字符集必然误判
  const plainTexts = [
    'helloworld',
    'test1234',
    'hello world',
    'HelloWorld',
    'abcdefgh',
    'deadbeefdeadbeef',
    'aaaaaaaaaaaaaaaaaaaa',
    '这是一个中文句子，需要被编码',
    'The quick brown fox jumps over the lazy dog',
    'function getUserById(id) { return id }',
    'aGVsbG8', // 长度 7，太短
    '',
    '   ',
  ]
  for (const value of plainTexts) {
    assert.equal(looksLikeBase64Text(value), false, `不应被识别为 Base64：${JSON.stringify(value)}`)
  }
})

check('自动方向判断：非法长度与字符集直接排除', () => {
  assert.equal(looksLikeBase64Text('Zm9v!'), false, '含非法字符')
  assert.equal(looksLikeBase64Text('Z'), false)
  assert.equal(looksLikeBase64Text('Zm9vYmFyY'), false, '长度除 4 余 1')
  assert.equal(looksLikeBase64Text('aGVsbG8gd29ybGQ='), true)
})

check('自动方向判断：哈希与十六进制串不会被误判', () => {
  const md5 = '900150983cd24fb0d6963f7d28e17f72'
  const sha256 = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
  const hmac = '90eb182d8396f16d4341d582047f45c0a97d73388c5377d9ced478a2212295ad'
  for (const value of [md5, sha256, hmac]) {
    assert.equal(looksLikeBase64Text(value), false, `哈希不应被解码：${value.slice(0, 16)}…`)
  }
})

check('自动方向判断：二进制 Base64（图片）会被识别', () => {
  // 常见的 1×1 PNG 的 Base64 前两段
  const pngBase64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
  assert.equal(looksLikeBase64Text(pngBase64), true)

  // 任意二进制字节：足够长 + 含大小写混排 → 判定为 Base64
  const binary = encodeBytes(
    new Uint8Array(200).map((_, index) => (index * 37 + 11) % 256),
    { variant: 'standard', padding: true, wrap: 0 },
  )
  assert.equal(looksLikeBase64Text(binary), true)

  // 但短的全小写字母串不该被当成 Base64
  assert.equal(looksLikeBase64Text('helloworldhelloworldhelloworldhelloworld'), false)
  assert.equal(looksLikeBase64Text('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'), false)
})

check('自动方向判断：与手动解码结果一致（不会「能解码却判成文本」）', () => {
  const samples = ['hello', '中文', '{"k":"v"}', 'a\nb\nc', '🚀 emoji', '<html></html>']
  for (const sample of samples) {
    const encoded = encodeText(sample, 'utf-8', std)
    assert.equal(looksLikeBase64Text(encoded), true, `应识别为 Base64：${sample}`)
    const decoded = decodeBase64(encoded)
    assert.ok(decoded.ok)
    const text = decodeText(decoded.bytes, 'utf-8', encoded)
    assert.ok(text.ok)
    assert.equal(text.text, sample, '自动解码后应还原原文')
  }
})

check('MIME 扩展名映射', () => {
  assert.equal(extensionForMime('image/png'), 'png')
  assert.equal(extensionForMime('application/json'), 'json')
  assert.equal(extensionForMime('application/x-unknown'), 'bin')
  assert.equal(extensionForMime(undefined), 'bin')
})

console.log(`\n${passed} checks passed`)
