/**
 * 摘要算法自检：
 *  1) RFC 1321 / FIPS 180-4 官方测试向量
 *  2) 与 Node 内置 crypto 交叉验证（随机长度 + 随机内容），覆盖所有填充边界
 *  3) 纯 JS 同步实现与 Web Crypto 异步路径结果一致
 * 用法：node scripts/hash.test.mts
 */
import assert from 'node:assert/strict'
import { createHash, randomBytes } from 'node:crypto'
import {
  createHasher,
  hashAll,
  hashBytes,
  hashBytesSync,
  hashFileStream,
  hashText,
  hexToBytes,
  toHex,
  type HashAlgorithm,
} from '../src/lib/hash.ts'

const utf8 = (value: string) => new TextEncoder().encode(value)
const nodeHash = (bytes: Uint8Array, algorithm: HashAlgorithm) =>
  createHash(algorithm).update(bytes).digest('hex')

const MD5_VECTORS: Array<[string, string]> = [
  ['', 'd41d8cd98f00b204e9800998ecf8427e'],
  ['a', '0cc175b9c0f1b6a831c399e269772661'],
  ['abc', '900150983cd24fb0d6963f7d28e17f72'],
  ['message digest', 'f96b697d7cb7938d525a2f31aaf161d0'],
  ['abcdefghijklmnopqrstuvwxyz', 'c3fcd3d76192e4007dfb496cca67e13b'],
  ['ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789', 'd174ab98d277d9f5a5611c2c9f419d9f'],
  [
    '12345678901234567890123456789012345678901234567890123456789012345678901234567890',
    '57edf4a22be3c955ac49da2e2107b67a',
  ],
]

const SHA1_VECTORS: Array<[string, string]> = [
  ['', 'da39a3ee5e6b4b0d3255bfef95601890afd80709'],
  ['abc', 'a9993e364706816aba3e25717850c26c9cd0d89d'],
  ['abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq', '84983e441c3bd26ebaae4aa1f95129e5e54670f1'],
]

const SHA256_VECTORS: Array<[string, string]> = [
  ['', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
  ['abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
  [
    'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq',
    '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
  ],
]

let passed = 0
async function check(name: string, fn: () => void | Promise<void>) {
  await fn()
  passed += 1
  console.log(`  ✓ ${name}`)
}

console.log('hash self-test (RFC 1321 / FIPS 180-4 vectors + node:crypto 交叉验证)')

await check('MD5 官方测试向量', () => {
  for (const [input, expected] of MD5_VECTORS) {
    assert.equal(hashBytesSync(utf8(input), 'md5'), expected, `md5(${JSON.stringify(input)})`)
  }
})

await check('SHA-1 官方测试向量', () => {
  for (const [input, expected] of SHA1_VECTORS) {
    assert.equal(hashBytesSync(utf8(input), 'sha1'), expected, `sha1(${JSON.stringify(input)})`)
  }
})

await check('SHA-256 官方测试向量', () => {
  for (const [input, expected] of SHA256_VECTORS) {
    assert.equal(hashBytesSync(utf8(input), 'sha256'), expected, `sha256(${JSON.stringify(input)})`)
  }
})

await check('百万字符 “a” 长消息向量', () => {
  const million = utf8('a'.repeat(1_000_000))
  assert.equal(hashBytesSync(million, 'md5'), '7707d6ae4e027c70eea2a935c2296f21')
  assert.equal(hashBytesSync(million, 'sha1'), '34aa973cd4c4daa4f61eeb2bdbad27316534016f')
  assert.equal(
    hashBytesSync(million, 'sha256'),
    'cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0',
  )
})

await check('与 node:crypto 交叉验证随机字节（覆盖 0–130 全部填充边界）', () => {
  for (let length = 0; length <= 130; length += 1) {
    const bytes = new Uint8Array(randomBytes(length))
    for (const algorithm of ['md5', 'sha1', 'sha256'] as HashAlgorithm[]) {
      assert.equal(
        hashBytesSync(bytes, algorithm),
        nodeHash(bytes, algorithm),
        `${algorithm} 长度 ${length} 不一致`,
      )
    }
  }
})

await check('与 node:crypto 交叉验证大输入与随机内容', () => {
  const sizes = [255, 256, 257, 1000, 4096, 65536, 1_000_000]
  for (const size of sizes) {
    const bytes = new Uint8Array(randomBytes(size))
    for (const algorithm of ['md5', 'sha1', 'sha256'] as HashAlgorithm[]) {
      assert.equal(hashBytesSync(bytes, algorithm), nodeHash(bytes, algorithm), `${algorithm} @${size}`)
    }
  }
})

await check('UTF-8 多字节与 emoji 内容', () => {
  const cases = ['中文', 'é\u0301', '🚀🚀🚀', '𠮷野家', 'a'.repeat(55), 'a'.repeat(56), 'a'.repeat(64)]
  for (const value of cases) {
    const bytes = utf8(value)
    for (const algorithm of ['md5', 'sha1', 'sha256'] as HashAlgorithm[]) {
      assert.equal(hashBytesSync(bytes, algorithm), nodeHash(bytes, algorithm), `${algorithm} ${value}`)
    }
  }
})

await check('异步入口与 Web Crypto 路径结果一致', async () => {
  assert.equal(typeof globalThis.crypto?.subtle?.digest, 'function', 'Node 应提供 crypto.subtle')
  for (const algorithm of ['md5', 'sha1', 'sha256'] as HashAlgorithm[]) {
    for (const input of ['', 'abc', '中文内容 🚀', 'a'.repeat(10_000)]) {
      const bytes = utf8(input)
      const viaAsync = await hashBytes(bytes, algorithm)
      assert.equal(viaAsync, hashBytesSync(bytes, algorithm), `${algorithm} 异步/同步不一致`)
      assert.equal(viaAsync, nodeHash(bytes, algorithm), `${algorithm} 与 node:crypto 不一致`)
    }
  }
})

await check('hashAll / hashText 便捷入口', async () => {
  const all = await hashAll(utf8('abc'))
  assert.equal(all.md5, '900150983cd24fb0d6963f7d28e17f72')
  assert.equal(all.sha1, 'a9993e364706816aba3e25717850c26c9cd0d89d')
  assert.equal(all.sha256, 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  assert.equal(await hashText('abc', 'md5'), '900150983cd24fb0d6963f7d28e17f72')
  assert.equal(await hashText('abc', 'sha256').then((v) => v.length), 64)
})

await check('增量更新：随机切分点与一次性结果一致', () => {
  for (const size of [0, 1, 55, 56, 63, 64, 65, 127, 128, 129, 1000, 4097]) {
    const data = new Uint8Array(randomBytes(size))
    for (const algorithm of ['md5', 'sha1', 'sha256'] as HashAlgorithm[]) {
      const hasher = createHasher(algorithm)
      let offset = 0
      while (offset < size) {
        const step = 1 + Math.floor(Math.random() * 97)
        hasher.update(data.subarray(offset, Math.min(offset + step, size)))
        offset += step
      }
      assert.equal(
        toHex(hasher.digest()),
        nodeHash(data, algorithm),
        `${algorithm} @${size} 随机切分不一致`,
      )
    }
  }
})

await check('增量更新：逐字节喂入', () => {
  const data = new Uint8Array(randomBytes(300))
  for (const algorithm of ['md5', 'sha1', 'sha256'] as HashAlgorithm[]) {
    const hasher = createHasher(algorithm)
    for (let i = 0; i < data.length; i += 1) hasher.update(data.subarray(i, i + 1))
    assert.equal(toHex(hasher.digest()), nodeHash(data, algorithm), `${algorithm} 逐字节不一致`)
  }
})

await check('增量更新：totalBytes 与 digest 后禁止更新', () => {
  const hasher = createHasher('sha256')
  hasher.update(new Uint8Array(100))
  hasher.update(new Uint8Array(28))
  assert.equal(hasher.totalBytes, 128)
  hasher.digest()
  assert.throws(() => hasher.update(new Uint8Array(1)), /已收尾/)
  assert.throws(() => hasher.digest(), /已收尾/)
})

await check('hashFileStream：流式读取与一次性结果一致（含 0 字节）', async () => {
  for (const size of [0, 1, 63, 64, 65, 1000, 100_000]) {
    const data = new Uint8Array(randomBytes(size))
    const blob = new Blob([data])
    const progress = []
    const streamed = await hashFileStream(blob, ['md5', 'sha1', 'sha256'], {
      sliceSize: 7, // 强制跨多个分块与不完整尾部
      onProgress: (p) => progress.push(p.ratio),
    })
    for (const algorithm of ['md5', 'sha1', 'sha256'] as HashAlgorithm[]) {
      assert.equal(streamed[algorithm], nodeHash(data, algorithm), `${algorithm} @${size} 流式不一致`)
    }
    assert.ok(progress.length > 0, '应至少回调一次进度')
    assert.equal(progress[progress.length - 1], 1)
  }
})

await check('hashFileStream：默认切片大小处理 1 MB 文件', async () => {
  const data = new Uint8Array(randomBytes(1_000_000))
  const result = await hashFileStream(new Blob([data]), ['md5'])
  assert.equal(result.md5, nodeHash(data, 'md5'))
})

await check('hex 互转', () => {
  const bytes = hexToBytes('00ff10Ab')
  assert.ok(bytes)
  assert.deepEqual([...bytes], [0x00, 0xff, 0x10, 0xab])
  assert.equal(toHex(bytes), '00ff10ab')
  assert.equal(hexToBytes('xyz'), null)
  assert.equal(hexToBytes('abc'), null)
  assert.equal(hexToBytes(''), null)
})

console.log(`\n${passed} checks passed`)
