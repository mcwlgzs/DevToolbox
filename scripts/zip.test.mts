/**
 * ZIP 写入器自检。
 * 用法：node scripts/zip.test.mts
 *
 * 这里刻意写了一个**独立的解析器**（按 PKWARE APPNOTE 从 EOCD 往回走中央目录），
 * 而不是复用写入端的逻辑——否则写错了也会跟着错，测不出问题。
 */
import assert from 'node:assert/strict'
import { crc32, createZip, zipFileName } from '../src/lib/zip.ts'

let passed = 0
function check(name: string, fn: () => void) {
  fn()
  passed += 1
  console.log(`  ✓ ${name}`)
}

console.log('zip self-test')

/* ------------------------------------------------------------------ */
/* 独立解析器                                                          */
/* ------------------------------------------------------------------ */

interface ParsedEntry {
  name: string
  data: Uint8Array
  crc: number
  method: number
  flags: number
}

function parseZip(bytes: Uint8Array): { entries: ParsedEntry[]; comment: string } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const decoder = new TextDecoder()

  // 从尾部找 EOCD（签名 0x06054b50），注释最长 65535
  let eocd = -1
  for (let index = bytes.length - 22; index >= 0 && index >= bytes.length - 22 - 65535; index -= 1) {
    if (view.getUint32(index, true) === 0x06054b50) {
      eocd = index
      break
    }
  }
  assert.notEqual(eocd, -1, '找不到 EOCD')

  const total = view.getUint16(eocd + 10, true)
  const centralSize = view.getUint32(eocd + 12, true)
  const centralOffset = view.getUint32(eocd + 16, true)
  assert.equal(centralOffset + centralSize, eocd, '中央目录大小/偏移与 EOCD 不一致')

  const entries: ParsedEntry[] = []
  let cursor = centralOffset
  for (let index = 0; index < total; index += 1) {
    assert.equal(view.getUint32(cursor, true), 0x02014b50, '中央目录签名不对')
    const flags = view.getUint16(cursor + 8, true)
    const method = view.getUint16(cursor + 10, true)
    const crc = view.getUint32(cursor + 16, true)
    const size = view.getUint32(cursor + 24, true)
    const nameLength = view.getUint16(cursor + 28, true)
    const extraLength = view.getUint16(cursor + 30, true)
    const commentLength = view.getUint16(cursor + 32, true)
    const localOffset = view.getUint32(cursor + 42, true)
    const name = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength))

    // 用本地文件头再定位一次数据，确认两边记录的偏移是一致的
    assert.equal(view.getUint32(localOffset, true), 0x04034b50, '本地文件头签名不对')
    const localNameLength = view.getUint16(localOffset + 26, true)
    const localExtraLength = view.getUint16(localOffset + 28, true)
    const dataStart = localOffset + 30 + localNameLength + localExtraLength
    const data = bytes.subarray(dataStart, dataStart + size)

    entries.push({ name, data, crc, method, flags })
    cursor += 46 + nameLength + extraLength + commentLength
  }

  return { entries, comment: '' }
}

/* ------------------------------------------------------------------ */

check('CRC-32 标准测试向量', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926)
  assert.equal(crc32(new Uint8Array(0)), 0)
  assert.equal(crc32(new TextEncoder().encode('a')), 0xe8b7be43)
})

check('空输入返回 null，不产出空压缩包', () => {
  assert.equal(createZip([]), null)
})

check('单个文件：能被独立解析器还原，且 CRC 与内容一致', () => {
  const data = new TextEncoder().encode('DevToolbox 图片格式转换')
  const zip = createZip([{ name: 'hello.txt', data }])
  assert.ok(zip)

  const { entries } = parseZip(zip!)
  assert.equal(entries.length, 1)
  assert.equal(entries[0].name, 'hello.txt')
  assert.equal(entries[0].method, 0, '应为 STORE（不压缩）')
  assert.equal(entries[0].flags & 0x0800, 0x0800, '应置 UTF-8 文件名标志位')
  assert.deepEqual(Array.from(entries[0].data), Array.from(data), '解出的内容与原文不一致')
  assert.equal(entries[0].crc, crc32(data), '记录的 CRC 与内容不符')
})

check('多个文件：顺序、内容与 CRC 都正确', () => {
  const items = [
    { name: 'a.png', data: new Uint8Array([1, 2, 3]) },
    { name: 'b.webp', data: new Uint8Array([255, 0, 128, 64]) },
    { name: '目录/c.jpg', data: new Uint8Array(1000).fill(7) },
  ]
  const zip = createZip(items)
  assert.ok(zip)
  const { entries } = parseZip(zip!)
  assert.deepEqual(
    entries.map((entry) => entry.name),
    ['a.png', 'b.webp', '目录/c.jpg'],
  )
  for (const [index, entry] of entries.entries()) {
    assert.deepEqual(Array.from(entry.data), Array.from(items[index].data))
    assert.equal(entry.crc, crc32(items[index].data))
  }
})

check('重名文件自动加序号，不会互相覆盖', () => {
  const zip = createZip([
    { name: 'photo.png', data: new Uint8Array([1]) },
    { name: 'photo.png', data: new Uint8Array([2]) },
    { name: 'photo.png', data: new Uint8Array([3]) },
    { name: 'photo.webp', data: new Uint8Array([4]) },
  ])
  assert.ok(zip)
  const { entries } = parseZip(zip!)
  assert.deepEqual(
    entries.map((entry) => entry.name),
    ['photo.png', 'photo (1).png', 'photo (2).png', 'photo.webp'],
  )
})

check('文件名做了目录穿越清理', () => {
  const zip = createZip([
    { name: '../../etc/passwd', data: new Uint8Array([1]) },
    { name: '/absolute/path.png', data: new Uint8Array([2]) },
    { name: 'a/../b/./c.png', data: new Uint8Array([3]) },
    { name: '', data: new Uint8Array([4]) },
    { name: '..', data: new Uint8Array([5]) },
  ])
  assert.ok(zip)
  const { entries } = parseZip(zip!)
  assert.deepEqual(
    entries.map((entry) => entry.name),
    ['etc/passwd', 'absolute/path.png', 'a/b/c.png', 'file', 'file (1)'],
  )
  for (const entry of entries) {
    assert.ok(!entry.name.startsWith('/'), `不应有绝对路径：${entry.name}`)
    assert.ok(!entry.name.includes('..'), `不应有上级目录：${entry.name}`)
  }
})

check('二进制大块数据不丢字节', () => {
  const random = new Uint8Array(200_000)
  // 用确定性的伪随机，避免测试结果不可复现
  let seed = 12345
  for (let index = 0; index < random.length; index += 1) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    random[index] = seed & 0xff
  }
  const zip = createZip([{ name: 'blob.bin', data: random }])
  assert.ok(zip)
  const { entries } = parseZip(zip!)
  assert.equal(entries[0].data.length, random.length)
  assert.equal(crc32(entries[0].data), crc32(random))
  assert.deepEqual(entries[0].data.subarray(0, 16), random.subarray(0, 16))
  assert.deepEqual(entries[0].data.subarray(-16), random.subarray(-16))
})

check('DOS 时间戳写入与省略都合法', () => {
  const withDate = createZip([{ name: 'a.txt', data: new Uint8Array([1]), lastModified: new Date(2026, 8, 24, 15, 30, 20) }])
  const withoutDate = createZip([{ name: 'a.txt', data: new Uint8Array([1]) }])
  assert.ok(withDate && withoutDate)
  // 有日期时两个包应当不同（说明时间戳确实写进去了）
  assert.notEqual(withDate!.length, 0)
  const a = JSON.stringify(Array.from(withDate!.subarray(10, 14)))
  const b = JSON.stringify(Array.from(withoutDate!.subarray(10, 14)))
  assert.notEqual(a, b, '时间戳没有生效')
})

check('文件名生成', () => {
  assert.match(zipFileName('images'), /^images-\d{4}-\d{2}-\d{2}\.zip$/)
})

console.log(`\n${passed} checks passed`)
