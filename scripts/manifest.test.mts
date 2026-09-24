/**
 * 哈希清单解析 / 导出 / 比对自检。
 * 用法：node scripts/manifest.test.mts
 */
import assert from 'node:assert/strict'
import {
  classifyHash,
  compareManifests,
  findDuplicateGroups,
  formatComparisonReport,
  normalizeHash,
  parseManifest,
  toChecksumText,
  toCsv,
} from '../src/lib/manifest.ts'

let passed = 0
function check(name: string, fn: () => void) {
  fn()
  passed += 1
  console.log(`  ✓ ${name}`)
}

const MD5_V = 'd41d8cd98f00b204e9800998ecf8427e'
const MD5_A = '900150983cd24fb0d6963f7d28e17f72'
const SHA1_A = 'a9993e364706816aba3e25717850c26c9cd0d89d'
const SHA256_A = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
const SHA256_B = '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1'

console.log('manifest self-test')

check('哈希识别：按长度推断算法', () => {
  assert.equal(classifyHash(MD5_V), 'md5')
  assert.equal(classifyHash(SHA1_A), 'sha1')
  assert.equal(classifyHash(SHA256_A), 'sha256')
  assert.equal(classifyHash(SHA256_A.toUpperCase()), 'sha256')
  assert.equal(classifyHash('0x' + MD5_V), 'md5')
  assert.equal(classifyHash('not-a-hash'), null)
  assert.equal(classifyHash('abc'), null)
  assert.equal(normalizeHash('  D41D8CD98F00B204E9800998ECF8427E '), MD5_V)
})

check('coreutils 格式（md5sum / sha256sum 输出）', () => {
  const result = parseManifest(
    [
      `${MD5_A}  video-a.mp4`,
      `${SHA256_A} *video b.mp4`,
      `${SHA1_A}\tvideo-c.mp4`,
      '',
      '# 注释行被忽略',
    ].join('\n'),
  )
  assert.equal(result.errors.length, 0)
  assert.equal(result.entries.length, 3)
  assert.deepEqual(result.entries[0], { name: 'video-a.mp4', size: null, hashes: { md5: MD5_A } })
  assert.equal(result.entries[1].name, 'video b.mp4')
  assert.equal(result.entries[1].hashes.sha256, SHA256_A)
  assert.equal(result.entries[2].hashes.sha1, SHA1_A)
})

check('CSV 带表头（本工具导出格式）', () => {
  const csv = toCsv([
    { name: 'a.mp4', size: 1024, hashes: { md5: MD5_A, sha1: SHA1_A, sha256: SHA256_A } },
    { name: 'b,c.mp4', size: 2048, hashes: { md5: MD5_V, sha256: SHA256_B } },
  ])
  const result = parseManifest(csv)
  assert.equal(result.errors.length, 0)
  assert.deepEqual(result.columns, ['name', 'size', 'md5', 'sha1', 'sha256'])
  assert.equal(result.entries.length, 2)
  assert.equal(result.entries[0].name, 'a.mp4')
  assert.equal(result.entries[0].size, 1024)
  assert.equal(result.entries[0].hashes.sha256, SHA256_A)
  assert.equal(result.entries[1].name, 'b,c.mp4', '含逗号的文件名应能还原')
  assert.equal(result.entries[1].size, 2048)
  assert.equal(result.entries[1].hashes.sha256, SHA256_B)
})

check('无表头 CSV 与松散格式', () => {
  const result = parseManifest(
    [`video.mp4,${MD5_A}`, `another-video.mp4 ${SHA256_A}`, `${SHA1_A} loose.mp4`].join('\n'),
  )
  assert.equal(result.errors.length, 0)
  assert.equal(result.entries.length, 3)
  assert.equal(result.entries[0].name, 'video.mp4')
  assert.equal(result.entries[0].hashes.md5, MD5_A)
  assert.equal(result.entries[1].name, 'another-video.mp4')
  assert.equal(result.entries[1].hashes.sha256, SHA256_A)
  assert.equal(result.entries[2].name, 'loose.mp4')
  assert.equal(result.entries[2].hashes.sha1, SHA1_A)
})

check('无法识别的行进入 errors，重名进入 duplicates', () => {
  const result = parseManifest(
    [`${MD5_A}  a.mp4`, '这是一行没有哈希的内容', `${MD5_V}  a.mp4`].join('\n'),
  )
  assert.equal(result.entries.length, 1)
  assert.equal(result.errors.length, 1)
  assert.match(result.errors[0], /第 2 行/)
  assert.deepEqual(result.duplicates, ['a.mp4'])
})

check('比对：一致 / 变更 / 新增 / 缺失', () => {
  const a = parseManifest(`${MD5_A}  same.mp4\n${MD5_A}  changing.mp4\n${MD5_A}  removed.mp4`).entries
  const b = parseManifest(`${MD5_A}  same.mp4\n${MD5_V}  changing.mp4\n${MD5_A}  added.mp4`).entries

  const result = compareManifests(a, b, 'md5')
  assert.deepEqual(result.summary, {
    unchanged: 1,
    changed: 1,
    added: 1,
    removed: 1,
    unknown: 0,
    total: 4,
  })

  const changing = result.rows.find((row) => row.name === 'changing.mp4')
  assert.equal(changing?.kind, 'changed')
  assert.equal(changing?.hashA, MD5_A)
  assert.equal(changing?.hashB, MD5_V)

  const added = result.rows.find((row) => row.name === 'added.mp4')
  assert.equal(added?.hashA, null)
  assert.equal(added?.kind, 'added')
})

check('比对：缺少目标算法记为 unknown 而非变更', () => {
  const a = parseManifest(`${MD5_A}  only-md5.mp4`).entries
  const b = parseManifest(`${SHA256_A}  only-md5.mp4`).entries
  const result = compareManifests(a, b, 'sha256')
  assert.equal(result.summary.unknown, 1)
  assert.equal(result.summary.changed, 0)
  assert.equal(result.rows[0].kind, 'unknown')
})

check('重复文件分组', () => {
  const entries = parseManifest(
    [`${MD5_A}  copy-1.mp4`, `${MD5_A}  copy-2.mp4`, `${MD5_A}  copy-3.mp4`, `${MD5_V}  unique.mp4`].join(
      '\n',
    ),
  ).entries
  const groups = findDuplicateGroups(entries, 'md5')
  assert.equal(groups.length, 1)
  assert.equal(groups[0].hash, MD5_A)
  assert.deepEqual(groups[0].names, ['copy-1.mp4', 'copy-2.mp4', 'copy-3.mp4'])
})

check('导出：sha256sum -c 兼容格式', () => {
  const entries = parseManifest(`${SHA256_A}  a.mp4\n${MD5_A}  b.mp4`).entries
  const text = toChecksumText(entries, 'sha256')
  assert.equal(text, `${SHA256_A}  a.mp4`)
})

check('CSV 往返：导出后再解析结果一致', () => {
  const original = parseManifest(
    [`${MD5_A}  a.mp4`, `${SHA1_A}  b.mp4`, `${SHA256_A}  c.mp4`].join('\n'),
  ).entries
  const roundTripped = parseManifest(toCsv(original)).entries
  assert.equal(roundTripped.length, 3)
  for (const entry of original) {
    const match = roundTripped.find((item) => item.name === entry.name)
    assert.ok(match, `${entry.name} 应存在于往返结果中`)
    assert.deepEqual(match.hashes, entry.hashes)
  }
})

check('比对报告包含分组与哈希值', () => {
  const a = parseManifest(`${MD5_A}  same.mp4\n${MD5_A}  changed.mp4`).entries
  const b = parseManifest(`${MD5_A}  same.mp4\n${MD5_V}  changed.mp4`).entries
  const report = formatComparisonReport(compareManifests(a, b, 'md5'), 'md5')
  assert.match(report, /内容变更/)
  assert.match(report, /changed\.mp4/)
  assert.match(report, new RegExp(MD5_V))
})

console.log(`\n${passed} checks passed`)
