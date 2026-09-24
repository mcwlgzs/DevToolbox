/**
 * 新增工具的核心逻辑自检：颜色、编码、diff、文本处理、正则。
 * 用法：node scripts/tools.test.mts
 */
import assert from 'node:assert/strict'
import {
  analyzeInput,
  base64ToBytes,
  decodeText,
  encodeText,
  extensionForMime,
  looksLikeBase64Text,
} from '../src/lib/base64.ts'
import { formatBytes } from '../src/lib/format.ts'
import { hexToBytes, toHex } from '../src/lib/hash.ts'
import { computeTargetSize } from '../src/lib/image.ts'
import {
  colorScale,
  contrastRatio,
  contrastVerdict,
  formatHsl,
  formatRgb,
  hexToRgb,
  hslToRgb,
  parseColor,
  readableForeground,
  rgbToHex,
  rgbToHsl,
  rgbToHsv,
} from '../src/lib/color.ts'
import {
  bytesToHex,
  convertBase,
  decodeBytesWithEncoding,
  decodeHtmlEntities,
  encodeHtmlEntities,
  fromUnicodeEscapes,
  groupDigits,
  parseByteInput,
  toUnicodeEscapes,
} from '../src/lib/encoding.ts'
import { diffLines, splitLines, toSideBySide, toUnifiedDiff } from '../src/lib/diff.ts'
import {
  addLineNumbers,
  dedupeLines,
  removeEmptyLines,
  sortLines,
  splitWords,
  stripLineNumbers,
  textStats,
  toCamelCase,
  transformCase,
  trimLines,
} from '../src/lib/text-transform.ts'
import {
  REGEX_PRESETS,
  buildRegex,
  highlightSegments,
  replaceWithRegex,
  runRegex,
  DEFAULT_FLAGS,
} from '../src/lib/regex.ts'

let passed = 0
function check(name: string, fn: () => void) {
  fn()
  passed += 1
  console.log(`  ✓ ${name}`)
}

console.log('tools self-test')

/* ---------------------------------------------------------------- */
check('颜色：HEX ⇄ RGB ⇄ HSL ⇄ HSV', () => {
  assert.deepEqual(hexToRgb('#ff0000'), { r: 255, g: 0, b: 0 })
  assert.deepEqual(hexToRgb('#f00'), { r: 255, g: 0, b: 0 })
  assert.deepEqual(hexToRgb('00ff00'), { r: 0, g: 255, b: 0 })
  assert.equal(hexToRgb('#xyz'), null)
  assert.equal(hexToRgb('#12345'), null)
  assert.equal(rgbToHex({ r: 255, g: 0, b: 0 }), '#ff0000')
  assert.equal(rgbToHex({ r: 0, g: 0, b: 0 }), '#000000')

  assert.deepEqual(rgbToHsl({ r: 255, g: 0, b: 0 }), { h: 0, s: 100, l: 50 })
  assert.deepEqual(rgbToHsl({ r: 0, g: 255, b: 0 }), { h: 120, s: 100, l: 50 })
  assert.deepEqual(rgbToHsl({ r: 0, g: 0, b: 255 }), { h: 240, s: 100, l: 50 })
  assert.deepEqual(rgbToHsl({ r: 255, g: 255, b: 255 }), { h: 0, s: 0, l: 100 })

  assert.deepEqual(hslToRgb({ h: 120, s: 100, l: 50 }), { r: 0, g: 255, b: 0 })
  assert.deepEqual(hslToRgb({ h: 0, s: 0, l: 0 }), { r: 0, g: 0, b: 0 })

  const hsv = rgbToHsv({ r: 255, g: 0, b: 0 })
  assert.deepEqual(hsv, { h: 0, s: 100, v: 100 })
})

check('颜色：往返转换不丢精度', () => {
  for (const hex of ['#000000', '#ffffff', '#3b82f6', '#ff8800', '#123456', '#abcdef', '#7f7f7f']) {
    const rgb = hexToRgb(hex)!
    const roundTrip = rgbToHex(hslToRgb(rgbToHsl(rgb)))
    assert.equal(roundTrip, hex, `${hex} 往返后变成 ${roundTrip}`)
  }
})

check('颜色：解析多种输入语法', () => {
  assert.deepEqual(parseColor('#f00')?.rgb, { r: 255, g: 0, b: 0 })
  assert.deepEqual(parseColor('rgb(255, 0, 0)')?.rgb, { r: 255, g: 0, b: 0 })
  assert.deepEqual(parseColor('rgb(100% 0% 0%)')?.rgb, { r: 255, g: 0, b: 0 })
  assert.deepEqual(parseColor('hsl(240, 100%, 50%)')?.rgb, { r: 0, g: 0, b: 255 })
  assert.deepEqual(parseColor('hsl(120 100% 50%)')?.rgb, { r: 0, g: 255, b: 0 })
  assert.equal(parseColor('rgba(255, 0, 0, 0.5)')?.alpha, 0.5)
  assert.equal(parseColor('#ff000080')?.alpha?.toFixed(3), (128 / 255).toFixed(3))
  assert.equal(parseColor('not-a-color'), null)
  assert.equal(parseColor(''), null)

  assert.equal(formatRgb({ r: 255, g: 0, b: 0 }), 'rgb(255, 0, 0)')
  assert.equal(formatRgb({ r: 255, g: 0, b: 0 }, 0.5), 'rgba(255, 0, 0, 0.5)')
  assert.equal(formatHsl({ h: 120, s: 100, l: 50 }), 'hsl(120, 100%, 50%)')
})

check('颜色：WCAG 对比度', () => {
  const black = { r: 0, g: 0, b: 0 }
  const white = { r: 255, g: 255, b: 255 }
  assert.equal(Math.round(contrastRatio(black, white) * 100) / 100, 21)
  assert.equal(contrastRatio(white, white), 1)

  const verdict = contrastVerdict(white, black)
  assert.equal(verdict.normalAA, true)
  assert.equal(verdict.normalAAA, true)
  assert.equal(verdict.largeAA, true)

  const poor = contrastVerdict({ r: 200, g: 200, b: 200 }, white)
  assert.equal(poor.normalAA, false)

  assert.equal(readableForeground({ r: 255, g: 255, b: 255 }), '#000000')
  assert.equal(readableForeground({ r: 0, g: 0, b: 0 }), '#ffffff')
})

check('颜色：色阶', () => {
  const scale = colorScale({ r: 59, g: 130, b: 246 })
  assert.equal(scale.length, 9)
  assert.deepEqual(scale.map((item) => item.step), [100, 200, 300, 400, 500, 600, 700, 800, 900])
  assert.equal(scale[4].hex, '#3b82f6')
  assert.equal(scale[0].hex, '#ffffff')
  assert.equal(scale[8].hex, '#000000')
})

/* ---------------------------------------------------------------- */
check('HTML 实体：编解码', () => {
  assert.equal(
    encodeHtmlEntities('<a href="x">&\'</a>'),
    '&lt;a href=&quot;x&quot;&gt;&amp;&apos;&lt;/a&gt;',
  )
  assert.equal(encodeHtmlEntities('©™…'), '&copy;&trade;&hellip;')
  assert.equal(decodeHtmlEntities('&lt;&gt;&amp;&#65;&#x42;'), '<>&AB')
  assert.equal(decodeHtmlEntities('&copy;2024'), '©2024')
  assert.equal(decodeHtmlEntities('&unknown;'), '&unknown;')
  assert.equal(decodeHtmlEntities(encodeHtmlEntities('中文 & <tag>')), '中文 & <tag>')
  assert.equal(encodeHtmlEntities('A', true), '&#x41;')
})

check('Unicode 转义：编码与还原', () => {
  assert.equal(toUnicodeEscapes('中', 'js'), '\\u4e2d')
  assert.equal(toUnicodeEscapes('中', 'css'), '\\4e2d ')
  assert.equal(toUnicodeEscapes('中', 'html'), '&#x4E2D;')
  assert.equal(toUnicodeEscapes('中', 'codepoint'), 'U+4E2D')
  assert.equal(toUnicodeEscapes('a中', 'js'), 'a\\u4e2d')
  assert.equal(toUnicodeEscapes('a中', 'js', true), '\\u0061\\u4e2d')

  // 代理对：emoji 会被拆成两个 \uXXXX
  const rocket = toUnicodeEscapes('🚀', 'js')
  assert.equal(rocket, '\\ud83d\\ude80')

  assert.equal(fromUnicodeEscapes('\\u4e2d'), '中')
  assert.equal(fromUnicodeEscapes('\\u{1f680}'), '🚀')
  assert.equal(fromUnicodeEscapes('U+4E2D'), '中')
  assert.equal(fromUnicodeEscapes('&#x4E2D;'), '中')
  assert.equal(fromUnicodeEscapes('&#20013;'), '中')
  assert.equal(fromUnicodeEscapes('\\x41'), 'A')
  assert.equal(fromUnicodeEscapes(toUnicodeEscapes('中文 🚀 test', 'js')), '中文 🚀 test')
})

check('进制转换（含大整数）', () => {
  assert.equal(convertBase('ff', 16, 2), '11111111')
  assert.equal(convertBase('255', 10, 16), 'ff')
  assert.equal(convertBase('11111111', 2, 10), '255')
  assert.equal(convertBase('zz', 36, 10), '1295')
  assert.equal(convertBase('0b1010', 2, 10), '10')
  assert.equal(convertBase('0xff', 16, 10), '255')
  assert.equal(convertBase('-ff', 16, 10), '-255')
  assert.equal(convertBase('0', 10, 2), '0')

  // 超出 Number 安全范围：BigInt 保证精确
  assert.equal(convertBase('ffffffffffffffff', 16, 10), '18446744073709551615')
  assert.equal(convertBase('18446744073709551615', 10, 16), 'ffffffffffffffff')

  assert.equal(convertBase('2', 2, 10), null)
  assert.equal(convertBase('', 10, 2), null)
  assert.equal(convertBase('xyz', 16, 10), null)

  assert.equal(groupDigits('11111111', 4), '1111 1111')
  assert.equal(groupDigits('111', 4), '111')
})

check('字节 ⇄ 文本：解析与多字符集解码', () => {
  assert.equal(bytesToHex(new Uint8Array([0x48, 0x65])), '48 65')
  assert.equal(parseByteInput('48 65 6c 6c 6f').bytes.length, 5)
  assert.equal(parseByteInput('48656c6c6f').bytes.length, 5)
  assert.equal(parseByteInput('%48%65').bytes.length, 2)
  assert.equal(parseByteInput('\\x48\\x65').bytes.length, 2)
  assert.equal(parseByteInput('0x48, 0x65').bytes.length, 2)
  assert.equal(parseByteInput('48 6').error !== null, true, '奇数位应报错')
  assert.equal(parseByteInput('zz').error !== null, true, '非十六进制应报错')
  assert.equal(parseByteInput('').bytes.length, 0)

  const utf8 = new TextEncoder().encode('Hello 中文')
  const decoded = decodeBytesWithEncoding(utf8, 'utf-8')
  assert.equal(decoded.text, 'Hello 中文')
  assert.equal(decoded.error, null)

  // GBK 的 “中文” 字节
  const gbk = decodeBytesWithEncoding(new Uint8Array([0xd6, 0xd0, 0xce, 0xc4]), 'gbk')
  if (gbk.error === null) {
    assert.equal(gbk.text, '中文', 'GBK 解码应还原为“中文”')
  } else {
    console.log('    （当前 Node 未内置 GBK 解码器，浏览器端可用）')
  }

  assert.equal(decodeBytesWithEncoding(new Uint8Array([0x41]), 'not-a-charset').error !== null, true)
})

check('编码：groupDigits 对非法位数不能死循环', () => {
  // 回归：size ≤ 0 时 `i -= size` 永不减小，是真正的死循环且内存无限增长
  const started = Date.now()
  assert.equal(groupDigits('12345678', 0), '12345678')
  assert.equal(groupDigits('12345678', -4), '12345678')
  assert.equal(groupDigits('12345678', 4), '1234 5678')
  assert.ok(Date.now() - started < 500, 'groupDigits 没有立刻返回')
})

check('编码：HTML 实体查表不能命中原型链', () => {
  // 回归：之前 &constructor; 会被解码成 "function Object() { [native code] }"
  assert.equal(decodeHtmlEntities('&constructor;'), '&constructor;')
  assert.equal(decodeHtmlEntities('&toString;'), '&toString;')
  assert.equal(decodeHtmlEntities('&hasOwnProperty;'), '&hasOwnProperty;')
  assert.equal(decodeHtmlEntities('&amp;'), '&', '正常实体仍要能解码')
})

check('Base64：MIME 查表不能命中原型链', () => {
  assert.equal(extensionForMime('constructor'), 'bin')
  assert.equal(extensionForMime('toString'), 'bin')
  assert.equal(extensionForMime('image/png'), 'png')
  assert.equal(extensionForMime('IMAGE/PNG'), 'png')
})

/* ---------------------------------------------------------------- */
check('文本对比：基本增删改', () => {
  const result = diffLines('a\nb\nc', 'a\nx\nc')
  assert.deepEqual(result.stats, { added: 1, removed: 1, unchanged: 2 })
  assert.equal(result.coarse, false)
  assert.deepEqual(
    result.lines.map((line) => line.op),
    ['equal', 'delete', 'insert', 'equal'],
  )
  assert.deepEqual(
    result.lines.map((line) => [line.leftNumber, line.rightNumber]),
    [
      [1, 1],
      [2, null],
      [null, 2],
      [3, 3],
    ],
  )
})

check('文本对比：相同、纯新增、纯删除、空输入', () => {
  assert.equal(diffLines('a\nb', 'a\nb').stats.unchanged, 2)
  assert.equal(diffLines('a\nb', 'a\nb').stats.added, 0)

  const added = diffLines('', 'x\ny')
  assert.deepEqual(added.stats, { added: 2, removed: 0, unchanged: 0 })

  const removed = diffLines('x\ny', '')
  assert.deepEqual(removed.stats, { added: 0, removed: 2, unchanged: 0 })

  assert.deepEqual(diffLines('', '').stats, { added: 0, removed: 0, unchanged: 0 })
})

check('文本对比：公共前后缀被正确裁剪', () => {
  const left = ['header', ...Array.from({ length: 50 }, (_, i) => `line-${i}`), 'footer'].join('\n')
  const right = ['header', ...Array.from({ length: 50 }, (_, i) => `line-${i}`), 'tail', 'footer'].join('\n')
  const result = diffLines(left, right)
  // header + 50 行 + footer 全部相同，只有 tail 是新增
  assert.deepEqual(result.stats, { added: 1, removed: 0, unchanged: 52 })
  assert.equal(result.coarse, false)
})

check('文本对比：超大规模退化为粗粒度并标记', () => {
  const big = Array.from({ length: 2100 }, (_, i) => `a-${i}`).join('\n')
  const other = Array.from({ length: 2100 }, (_, i) => `b-${i}`).join('\n')
  const result = diffLines(big, other)
  assert.equal(result.coarse, true)
  assert.deepEqual(result.stats, { added: 2100, removed: 2100, unchanged: 0 })
})

check('文本对比：unified 与并排输出', () => {
  const result = diffLines('a\nb\nc\nd\ne', 'a\nB\nc\nd\ne')
  const unified = toUnifiedDiff(result, 'old.txt', 'new.txt')
  assert.match(unified, /^--- old\.txt\n\+\+\+ new\.txt/)
  assert.match(unified, /@@ -\d+,\d+ \+\d+,\d+ @@/)
  assert.match(unified, /^-b$|^-b/m)
  assert.match(unified, /^\+B$/m)

  const rows = toSideBySide(result)
  assert.equal(rows.length, 5)
  assert.equal(rows[1].kind, 'change')
  assert.equal(rows[1].left?.text, 'b')
  assert.equal(rows[1].right?.text, 'B')

  const inserted = toSideBySide(diffLines('a', 'a\nb\nc'))
  assert.equal(inserted.filter((row) => row.kind === 'insert').length, 2)
})

check('文本对比：CRLF 归一化', () => {
  assert.deepEqual(splitLines('a\r\nb\rc'), ['a', 'b', 'c'])
  assert.equal(diffLines('a\r\nb', 'a\nb').stats.unchanged, 2)
})

/* ---------------------------------------------------------------- */
check('文本处理：单词拆分与命名风格', () => {
  assert.deepEqual(splitWords('foo bar_baz-qux'), ['foo', 'bar', 'baz', 'qux'])
  assert.deepEqual(splitWords('HTTPServer'), ['HTTP', 'Server'])
  assert.deepEqual(splitWords('getUserByID'), ['get', 'User', 'By', 'ID'])

  assert.equal(toCamelCase('foo bar_baz-qux'), 'fooBarBazQux')
  assert.equal(toCamelCase('HTTPServer'), 'httpServer')
  assert.equal(transformCase('hello world', 'pascal'), 'HelloWorld')
  assert.equal(transformCase('HelloWorld', 'snake'), 'hello_world')
  assert.equal(transformCase('HelloWorld', 'kebab'), 'hello-world')
  assert.equal(transformCase('HelloWorld', 'constant'), 'HELLO_WORLD')
  assert.equal(transformCase('HelloWorld', 'dot'), 'hello.world')
  assert.equal(transformCase('hello world', 'upper'), 'HELLO WORLD')
  assert.equal(transformCase('HELLO WORLD', 'lower'), 'hello world')
  assert.equal(transformCase('hello world', 'title'), 'Hello World')
  assert.equal(transformCase('hello. world!', 'sentence'), 'Hello. World!')
})

check('文本处理：排序与去重', () => {
  assert.equal(sortLines('b\na\nc', 'asc'), 'a\nb\nc')
  assert.equal(sortLines('b\na\nc', 'desc'), 'c\nb\na')
  assert.equal(sortLines('aaa\nb\ncc', 'lengthAsc'), 'b\ncc\naaa')
  assert.equal(sortLines('10\n9\n100', 'numeric'), '9\n10\n100')
  assert.equal(sortLines('a10\na2\na1', 'natural'), 'a1\na2\na10')
  assert.equal(sortLines('a\nb\nc', 'reverse'), 'c\nb\na')

  const shuffled = sortLines('1\n2\n3\n4\n5', 'shuffle', () => 0.5)
  assert.equal(shuffled.split('\n').sort().join(','), '1,2,3,4,5', '打乱不应丢失元素')

  assert.equal(
    dedupeLines('a\nb\na\nc\nb', { caseSensitive: true, trimLines: false, keepEmpty: true }),
    'a\nb\nc',
  )
  assert.equal(
    dedupeLines('A\na', { caseSensitive: false, trimLines: false, keepEmpty: true }),
    'A',
  )
  assert.equal(
    dedupeLines(' a \n a \n b ', { caseSensitive: true, trimLines: true, keepEmpty: true }),
    'a\nb',
  )
  assert.equal(
    dedupeLines('a\n\nb', { caseSensitive: true, trimLines: false, keepEmpty: false }),
    'a\nb',
  )
})

check('文本处理：行操作', () => {
  assert.equal(trimLines('  a  \n b '), 'a\nb')
  assert.equal(removeEmptyLines('a\n\n \nb'), 'a\nb')
  assert.equal(addLineNumbers('a\nb', 1, '. '), '1. a\n2. b')
  assert.equal(addLineNumbers('a\nb', 10, ': '), '10: a\n11: b')
  assert.equal(stripLineNumbers('1. a\n2) b\n3: c'), 'a\nb\nc')
})

check('文本处理：统计', () => {
  const stats = textStats('中文 abc def\n第二行')
  assert.equal(stats.cjk, 5)
  assert.equal(stats.lines, 2)
  assert.equal(stats.nonEmptyLines, 2)
  assert.equal(stats.bytes, new TextEncoder().encode('中文 abc def\n第二行').length)
  assert.ok(stats.words >= 7)
  assert.equal(textStats('').lines, 0)
  assert.equal(textStats('').bytes, 0)
})

/* ---------------------------------------------------------------- */
check('正则：基本匹配与捕获组', () => {
  const result = runRegex('\\d+', DEFAULT_FLAGS, 'a1b22c333')
  assert.equal(result.error, null)
  assert.deepEqual(result.matches.map((m) => m.value), ['1', '22', '333'])
  assert.deepEqual(result.matches.map((m) => m.index), [1, 3, 6])

  const groups = runRegex('(\\d)(\\d)', DEFAULT_FLAGS, '12 34')
  assert.equal(groups.matches.length, 2)
  assert.deepEqual(groups.matches[0].captures.map((c) => c.value), ['1', '2'])

  const named = runRegex('(?<y>\\d{4})-(?<m>\\d{2})', DEFAULT_FLAGS, '2024-01')
  assert.equal(named.matches[0].named.y, '2024')
  assert.equal(named.matches[0].named.m, '01')
})

check('正则：零长度匹配不会死循环', () => {
  const result = runRegex('a*', { ...DEFAULT_FLAGS }, 'bbb')
  assert.equal(result.error, null)
  assert.equal(result.matches.length, 4)
  assert.deepEqual(result.matches.map((m) => m.value), ['', '', '', ''])
})

check('正则：非全局模式只返回第一个', () => {
  const result = runRegex('\\d', { ...DEFAULT_FLAGS, global: false }, '1 2 3')
  assert.equal(result.matches.length, 1)
  assert.equal(result.matches[0].value, '1')
})

check('正则：修饰符拼接与语法错误提示', () => {
  assert.equal(
    runRegex('a', { ...DEFAULT_FLAGS, ignoreCase: true, multiline: true }, 'A').matches.length,
    1,
  )
  const error = runRegex('(', DEFAULT_FLAGS, 'x')
  assert.ok(error.error, '应返回错误')
  assert.match(error.error!, /正则语法错误|括号/)
  assert.equal(runRegex('(?:', DEFAULT_FLAGS, 'x').error !== null, true)
  assert.equal(buildRegex('', DEFAULT_FLAGS).regex, null)
  assert.equal(buildRegex('a', DEFAULT_FLAGS).error, null)
})

check('正则：命中数量上限', () => {
  const text = 'a'.repeat(5000)
  const result = runRegex('a', DEFAULT_FLAGS, text, 100)
  assert.equal(result.matches.length, 100)
  assert.equal(result.truncated, true)
})

check('正则：高亮分段拼接后与原文一致', () => {
  const text = 'foo 123 bar 456 baz'
  const result = runRegex('\\d+', DEFAULT_FLAGS, text)
  const segments = highlightSegments(text, result.matches)
  assert.equal(segments.map((s) => s.text).join(''), text)
  assert.deepEqual(
    segments.filter((s) => s.matchIndex !== null).map((s) => s.text),
    ['123', '456'],
  )
})

check('正则：替换（含 $1 与函数式替换）', () => {
  const simple = replaceWithRegex('\\d+', DEFAULT_FLAGS, 'a1b22', 'N')
  assert.equal(simple.output, 'aNbN')
  assert.equal(simple.count, 2)

  const grouped = replaceWithRegex('(\\w+)@(\\w+)', DEFAULT_FLAGS, 'me@here', '$2#$1')
  assert.equal(grouped.output, 'here#me')

  const notGlobal = replaceWithRegex('\\d', { ...DEFAULT_FLAGS, global: false }, 'a1b2', 'N')
  assert.equal(notGlobal.output, 'aNb2')

  const bad = replaceWithRegex('(', DEFAULT_FLAGS, 'x', 'y')
  assert.ok(bad.error)
})

check('正则：内置模式库全部可编译且能匹配自己的示例', () => {
  for (const preset of REGEX_PRESETS) {
    const flags: typeof DEFAULT_FLAGS = {
      ...DEFAULT_FLAGS,
      global: preset.flags.includes('g'),
      ignoreCase: preset.flags.includes('i'),
      multiline: preset.flags.includes('m'),
      dotAll: preset.flags.includes('s'),
      unicode: preset.flags.includes('u'),
      sticky: false,
    }
    const result = runRegex(preset.pattern, flags, preset.sample)
    assert.equal(result.error, null, `${preset.name} 编译失败：${result.error}`)
    assert.ok(result.matches.length > 0, `${preset.name} 未匹配到示例内容`)
  }
  assert.equal(new Set(REGEX_PRESETS.map((p) => p.name)).size, REGEX_PRESETS.length)
})

check('正则：嵌套量词被拒绝执行（ReDoS 防护）', () => {
  // 这些写法在特定输入上会指数级回溯，单次 exec 无法中断 → 主线程冻结数十秒。
  // 实测 (a+)+$ 匹配 26 个 a 加一个 b 已经要 0.7 秒，32 个字符就是几十秒。
  const dangerous = ['(a+)+$', '(a*)*', '(a|a)*', '(\\w+\\s?)*', '((a+))+', '(a+){2,}']
  for (const pattern of dangerous) {
    const started = Date.now()
    const result = runRegex(pattern, DEFAULT_FLAGS, `${'a'.repeat(40)}b`)
    const elapsed = Date.now() - started
    assert.ok(result.error, `${pattern} 应该被拒绝执行`)
    assert.match(result.error!, /卡死|回溯/)
    assert.ok(elapsed < 500, `${pattern} 拒绝得太慢（${elapsed}ms），说明还是跑了`)
  }

  // 替换是第二个入口，同样必须被拦住
  const replaceStarted = Date.now()
  const replaced = replaceWithRegex('(a+)+$', DEFAULT_FLAGS, `${'a'.repeat(40)}b`, 'X')
  assert.ok(replaced.error, '替换路径也要拦')
  assert.ok(Date.now() - replaceStarted < 500)

  // 正常写法不能被误伤
  for (const pattern of ['(\\d+)?', '(?:GET|POST)+', '(foo|bar)*', 'a+b*c?', '[a+]+', '(\\d{2,5})']) {
    assert.equal(
      runRegex(pattern, DEFAULT_FLAGS, 'GETPOST 12345').error,
      null,
      `${pattern} 是合法写法，被误判成危险模式`,
    )
  }
})

check('正则：非全局替换无匹配时 count 为 0', () => {
  const noMatch = replaceWithRegex('z', { ...DEFAULT_FLAGS, global: false }, 'abc', 'X')
  assert.equal(noMatch.count, 0, '没有匹配却报了 1 处')
  assert.equal(noMatch.output, 'abc')

  const matched = replaceWithRegex('b', { ...DEFAULT_FLAGS, global: false }, 'abc', 'X')
  assert.equal(matched.count, 1)
  assert.equal(matched.output, 'aXc')
})

check('文本处理：去行号不能吃掉普通句子里的数字', () => {
  // 回归：分隔符曾经是可选的，于是「2024 was a year」被剥成「was a year」
  assert.equal(stripLineNumbers('2024 was a year'), '2024 was a year')
  assert.equal(stripLineNumbers('42 是答案'), '42 是答案')
  assert.equal(stripLineNumbers('1. a\n2) b\n3: c'), 'a\nb\nc')
  assert.equal(stripLineNumbers('1、第一项\n2、第二项'), '第一项\n第二项')
  assert.equal(stripLineNumbers('  7) 缩进也要认'), '缩进也要认')
  // 真正带分隔符的「年份 + 句点」仍按行号处理（无法与有序列表区分）
  assert.equal(stripLineNumbers('2024. 年度总结'), '年度总结')
})

check('格式化：字节单位覆盖到 PB / EB', () => {
  assert.equal(formatBytes(1024), '1.0 KB')
  assert.equal(formatBytes(1024 ** 4), '1.0 TB')
  assert.equal(formatBytes(1024 ** 5), '1.0 PB')
  assert.equal(formatBytes(1024 ** 6), '1.0 EB')
  assert.equal(formatBytes(-1), '—')
  assert.equal(formatBytes(Number.NaN), '—')
})

check('图片：computeTargetSize 永远返回有限正整数', () => {
  assert.deepEqual(computeTargetSize(800, 600, { maxWidth: 0, maxHeight: 0, scale: 100 }), {
    width: 800,
    height: 600,
  })
  // 非法 scale / 尺寸以前会产生 NaN，NaN 会一路流到界面上的目标尺寸与百分比
  for (const options of [
    { maxWidth: 0, maxHeight: 0, scale: 0 },
    { maxWidth: 0, maxHeight: 0, scale: Number.NaN },
    { maxWidth: -100, maxHeight: -100, scale: 50 },
  ]) {
    const result = computeTargetSize(800, 600, options)
    assert.ok(Number.isFinite(result.width) && result.width > 0, `width 非法：${result.width}`)
    assert.ok(Number.isFinite(result.height) && result.height > 0, `height 非法：${result.height}`)
  }
  assert.deepEqual(computeTargetSize(0, 0, { maxWidth: 0, maxHeight: 0, scale: 100 }), {
    width: 1,
    height: 1,
  })
})

check('编码：十六进制写法与进制前缀', () => {
  // 回归：命中 % 就只取 %XX，'41%42' 里的 41 被静默丢掉
  assert.equal(bytesToHex(parseByteInput('41%42').bytes), '41 42')
  assert.equal(bytesToHex(parseByteInput('\\x41 42').bytes), '41 42')
  assert.equal(bytesToHex(parseByteInput('0x41 %42 \\x43').bytes), '41 42 43')
  assert.equal(parseByteInput('zz').error !== null, true)
  assert.equal(parseByteInput('%4').error !== null, true)

  // 回归：'-0xff' 的负号挡住了前缀匹配 → 返回 null
  assert.equal(convertBase('-0xff', 16, 10), '-255')
  assert.equal(convertBase('+ff', 16, 10), '255')
  assert.equal(convertBase('0xff', 16, 10), '255')
  assert.equal(convertBase('0b1010', 2, 10), '10')
  assert.equal(convertBase('0o17', 8, 10), '15')
  // 进制不匹配时不该剥掉前缀：'0b1010' 在 16 进制下是合法的十六进制数
  assert.equal(convertBase('0b1010', 16, 10), String(Number.parseInt('0b1010', 16)))
  assert.equal(convertBase('-0b1010', 16, 10), String(-Number.parseInt('0b1010', 16)))
})

check('Base64 判定：普通标识符不再被误判', () => {
  // 回归：只看「长度 ≥ 44 + 大小写混排」，驼峰标识符会被判成 Base64 解出乱码
  assert.equal(looksLikeBase64Text('thisIsALongCamelCaseIdentifierUsedAsATestValue'), false)
  assert.equal(looksLikeBase64Text('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'), false)
  assert.equal(looksLikeBase64Text('这是一段普通的中文说明文字，不该被当成 Base64'), false)
  assert.equal(looksLikeBase64Text('5d41402abc4b2a76b9719d911017c592'), false, 'MD5 摘要不该被解码')

  // 真正的 Base64 仍要认出来（含短二进制负载）
  assert.equal(looksLikeBase64Text('SGVsbG8sIHdvcmxkIQ=='), true)
  assert.equal(looksLikeBase64Text('AAAAAAAAAAAAAAAAAAAAAA=='), true, '16 字节全零的 Base64')
  assert.equal(looksLikeBase64Text('2jmj7l5rSw0yVb/vlWAYkK/YBwk='), true)
  assert.equal(looksLikeBase64Text('data:text/plain;base64,SGVsbG8='), true)

  // 判定与徽章必须一致（曾经一个说 base64、另一个说 plain-text）
  for (const sample of [
    'thisIsALongCamelCaseIdentifierUsedAsATestValue',
    'SGVsbG8sIHdvcmxkIQ==',
    'AAAAAAAAAAAAAAAAAAAAAA==',
    'getUserById',
  ]) {
    assert.equal(
      analyzeInput(sample).kind === 'base64',
      looksLikeBase64Text(sample),
      `${sample} 的两处判定不一致`,
    )
  }
})

check('Base64：Latin-1 实为 windows-1252，编解码必须可往返', () => {
  // 回归：编码按真 Latin-1、解码走 TextDecoder（标准规定等价 windows-1252），
  // 同一个 € 编出来是 '?'，解回来却是 '€'
  const options = { variant: 'standard', padding: true, wrap: 0 }
  for (const text of ['€ 12.5', '“quoted”', '™ © ®', 'café naïve', 'Œuvre', '— dash –']) {
    const encoded = encodeText(text, 'iso-8859-1', options)
    const decoded = decodeText(base64ToBytes(encoded), 'iso-8859-1', options)
    assert.equal(decoded.ok, true, `${text} 解码失败`)
    if (decoded.ok) assert.equal(decoded.text, text, `${text} 往返后变成 ${decoded.text}`)
  }
})

check('哈希：hexToBytes 与 hmac.parseKey 的十六进制写法一致', () => {
  assert.equal(toHex(hexToBytes('0x41')!), '41')
  assert.equal(toHex(hexToBytes('41')!), '41')
  assert.equal(toHex(hexToBytes('41 42')!), '4142')
  assert.equal(hexToBytes('0x4'), null, '奇数位仍应拒绝')
  assert.equal(hexToBytes('zz'), null)
})

console.log(`\n${passed} checks passed`)
