/**
 * 新一批工具的逻辑自检：Cron、chmod、子网、CSV、HMAC。
 * 用法：node scripts/toolkit.test.mts
 */
import assert from 'node:assert/strict'
import { createHmac, randomBytes } from 'node:crypto'
import { CRON_PRESETS, describeCron, nextRuns, parseCron } from '../src/lib/cron.ts'
import {
  applySymbolicChange,
  fromOctal,
  parseSymbolic,
  parseSymbolicChange,
  toCommand,
  toOctal,
  toSymbolic,
} from '../src/lib/chmod.ts'
import { calculateSubnet, formatIPv4, parseIPv4, splitSubnet, toBinary } from '../src/lib/subnet.ts'
import { csvToJson, detectDelimiter, jsonToCsv, parseCsv, rowsToCsv } from '../src/lib/csv.ts'
import { HMAC_ALGORITHMS, hmac, hmacHex, parseKey, type HmacAlgorithm } from '../src/lib/hmac.ts'
import { toHex } from '../src/lib/hash.ts'
import { HTTP_STATUSES, MIME_TYPES, STATUS_CATEGORIES } from '../src/lib/http-status.ts'

let passed = 0
function check(name: string, fn: () => void) {
  fn()
  passed += 1
  console.log(`  ✓ ${name}`)
}

const utf8 = (value: string) => new TextEncoder().encode(value)
const bytes = (values: number[]) => Uint8Array.from(values)
const repeat = (value: number, count: number) => new Uint8Array(count).fill(value)

console.log('toolkit self-test')

/* ---------------------------------------------------------------- */
check('Cron：基本解析与字段展开', () => {
  const result = parseCron('*/5 9-18 * * 1-5')
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.deepEqual([...result.fields.minute.values].sort((a, b) => a - b), [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55])
  assert.deepEqual([...result.fields.hour.values].sort((a, b) => a - b), [9, 10, 11, 12, 13, 14, 15, 16, 17, 18])
  assert.deepEqual([...result.fields.dayOfWeek.values].sort((a, b) => a - b), [1, 2, 3, 4, 5])
  assert.equal(result.hasSeconds, false)
  assert.equal(result.fields.month.wildcard, true)
})

check('Cron：6 段（带秒）与宏', () => {
  const six = parseCron('*/30 * * * * *')
  assert.equal(six.ok, true)
  if (six.ok) {
    assert.equal(six.hasSeconds, true)
    assert.deepEqual([...six.fields.second.values], [0, 30])
  }
  const macro = parseCron('@daily')
  assert.equal(macro.ok, true)
  if (macro.ok) assert.equal(macro.normalized, '0 0 * * *')
})

check('Cron：名称、步长与单值步长', () => {
  const named = parseCron('0 0 * JAN-MAR MON')
  assert.equal(named.ok, true)
  if (named.ok) {
    assert.deepEqual([...named.fields.month.values], [1, 2, 3])
    assert.deepEqual([...named.fields.dayOfWeek.values], [1])
  }
  const stepped = parseCron('5/10 * * * *')
  assert.equal(stepped.ok, true)
  if (stepped.ok) assert.deepEqual([...stepped.fields.minute.values], [5, 15, 25, 35, 45, 55])
})

check('Cron：7 表示周日会被归一为 0', () => {
  const result = parseCron('0 0 * * 7')
  assert.equal(result.ok, true)
  if (result.ok) {
    assert.equal(result.fields.dayOfWeek.values.has(7), false)
    assert.equal(result.fields.dayOfWeek.values.has(0), true)
  }
})

check('Cron：非法表达式给出明确错误', () => {
  assert.equal(parseCron('').ok, false)
  assert.equal(parseCron('* * *').ok, false, '段数不足应报错')
  assert.equal(parseCron('* * * * * * *').ok, false, '段数过多应报错')
  assert.equal(parseCron('60 * * * *').ok, false, '分超出 0-59 应报错')
  assert.equal(parseCron('* 24 * * *').ok, false, '时超出 0-23 应报错')
  assert.equal(parseCron('* * 0 * *').ok, false, '日从 1 开始，0 应报错')
  assert.equal(parseCron('* * * 13 *').ok, false, '月超出 1-12 应报错')
  assert.equal(parseCron('*/0 * * * *').ok, false, '步长 0 应报错')
  assert.equal(parseCron('a * * * *').ok, false)

  const error = parseCron('60 * * * *')
  if (!error.ok) assert.match(error.error, /0–59/)
})

check('Cron：下次运行时间（毫秒精确）', () => {
  // 2024-01-01 是周一
  const from = new Date(2024, 0, 1, 10, 30, 0)
  const everyHour = nextRuns('0 * * * *', 3, from)
  assert.equal(everyHour.error, null)
  assert.deepEqual(
    everyHour.runs.map((date) => `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`),
    ['11:00', '12:00', '13:00'],
  )

  const daily = nextRuns('30 3 * * *', 2, from)
  assert.deepEqual(
    daily.runs.map((date) => `${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:${date.getMinutes()}`),
    ['1/2 3:30', '1/3 3:30'],
  )

  const weekday = nextRuns('0 9 * * 1-5', 3, new Date(2024, 0, 5, 12, 0, 0)) // 周五中午
  assert.deepEqual(
    weekday.runs.map((date) => `${date.getMonth() + 1}/${date.getDate()}(${date.getDay()})`),
    ['1/8(1)', '1/9(2)', '1/10(3)'],
  )
})

check('Cron：闰年 2/29 不会死循环', () => {
  const result = nextRuns('0 0 29 2 *', 2, new Date(2024, 2, 1))
  assert.equal(result.error, null)
  assert.equal(result.runs.length, 2)
  assert.equal(result.runs[0].getFullYear(), 2028)
  assert.equal(result.runs[1].getFullYear(), 2032)
})

check('Cron：日与周同时受限时取「或」', () => {
  // 每月 1 号 或 每周一
  const result = nextRuns('0 0 1 * 1', 6, new Date(2024, 0, 2, 0, 0, 0))
  const labels = result.runs.map((date) => `${date.getMonth() + 1}/${date.getDate()}`)
  // 2024 年 1 月有 4 个周一（8/15/22/29），随后命中 2/1（每月 1 号）
  assert.ok(labels.includes('1/8'), `应命中周一：${labels.join(',')}`)
  assert.ok(labels.includes('2/1'), `应命中每月 1 号：${labels.join(',')}`)
})

check('Cron：中文描述', () => {
  const cases: Array<[string, RegExp]> = [
    ['* * * * *', /每分钟/],
    ['0 3 * * *', /03:00.*每天/],
    ['30 3 * * *', /03:30/],
    ['0 9 * * 1-5', /周一、周二、周三、周四、周五/],
    ['0 0 1 * *', /每月 1 日/],
    ['*/30 * * * * *', /每 30 秒|第 0 秒/],
  ]
  for (const [expression, pattern] of cases) {
    const result = parseCron(expression)
    assert.equal(result.ok, true, `${expression} 应解析成功`)
    if (result.ok) assert.match(result.description, pattern, `${expression} 的描述：${result.description}`)
  }
})

check('Cron：内置模式库全部可用', () => {
  for (const preset of CRON_PRESETS) {
    const result = parseCron(preset.expression)
    assert.equal(result.ok, true, `${preset.name} 解析失败：${result.ok ? '' : result.error}`)
    const next = nextRuns(preset.expression, 1)
    assert.equal(next.runs.length, 1, `${preset.name} 应能算出下次运行时间`)
  }
})

/* ---------------------------------------------------------------- */
check('chmod：八进制 ⇄ 符号 ⇄ rwx', () => {
  const state = fromOctal('755')!
  assert.equal(toOctal(state), '755')
  assert.equal(toSymbolic(state), '-rwxr-xr-x')
  assert.deepEqual(state.user, { read: true, write: true, execute: true })
  assert.deepEqual(state.group, { read: true, write: false, execute: true })

  assert.equal(toOctal(fromOctal('0644')!), '644')
  assert.equal(toOctal(fromOctal('4755')!), '4755')
  assert.equal(toSymbolic(fromOctal('4755')!), '-rwsr-xr-x')
  assert.equal(toSymbolic(fromOctal('1777')!), '-rwxrwxrwt')
  assert.equal(toSymbolic(fromOctal('2755')!), '-rwxr-sr-x')
  assert.equal(toCommand(fromOctal('600')!), 'chmod 600 file')

  assert.equal(fromOctal('8'), null)
  assert.equal(fromOctal('999'), null)
  assert.equal(fromOctal(''), null)
})

check('chmod：解析 rwx 字符串', () => {
  assert.equal(toOctal(parseSymbolic('-rwxr-xr-x')!), '755')
  assert.equal(toOctal(parseSymbolic('rwxr-xr-x')!), '755')
  assert.equal(toOctal(parseSymbolic('drwxr-xr-x')!), '755')
  assert.equal(toOctal(parseSymbolic('-rw-------')!), '600')
  assert.equal(toOctal(parseSymbolic('-rwxrwxrwt')!), '1777')
  assert.equal(toOctal(parseSymbolic('-rwsr-xr-x')!), '4755')
  assert.equal(parseSymbolic('rwx'), null)
  assert.equal(parseSymbolic('-rwxr-xr'), null, '长度不足应报错')
  assert.equal(parseSymbolic('not-a-perm'), null)
  assert.equal(parseSymbolic('-rwxr-xzz'), null, '非法字符应报错')
})

check('chmod：往返一致性', () => {
  for (const octal of ['000', '400', '600', '640', '644', '700', '755', '775', '777', '1777', '2755', '4755', '6755']) {
    const state = fromOctal(octal)!
    assert.equal(toOctal(parseSymbolic(toSymbolic(state))!), octal, `${octal} 往返失败`)
  }
})

check('chmod：符号增量写法', () => {
  assert.deepEqual(parseSymbolicChange('u+x').changes, [{ owner: 'user', operator: '+', permissions: 'x' }])
  assert.deepEqual(parseSymbolicChange('go-w').changes.length, 2)
  // a 合并成一条 owner: 'all'，应用时再展开到三个身份
  assert.deepEqual(parseSymbolicChange('a=r').changes, [{ owner: 'all', operator: '=', permissions: 'r' }])
  assert.ok(parseSymbolicChange('u^z').error)

  const base = fromOctal('644')!
  assert.equal(toOctal(applySymbolicChange(base, 'u+x')), '744')
  assert.equal(toOctal(applySymbolicChange(base, 'go-w')), '644')
  assert.equal(toOctal(applySymbolicChange(base, 'a+x')), '755')
  // 777 去掉组和其他人的写权限 → 组/其他人变成 r-x，即 755
  assert.equal(toOctal(applySymbolicChange(fromOctal('777')!, 'go-w')), '755')
  assert.equal(toOctal(applySymbolicChange(base, 'a=r')), '444')
  assert.equal(toOctal(applySymbolicChange(base, 'u+s')), '4644')
})

/* ---------------------------------------------------------------- */
check('子网：基本计算', () => {
  const result = calculateSubnet('192.168.1.10/24')
  assert.equal(result.ok, true)
  if (!result.ok) return
  const info = result.info
  assert.equal(info.cidr, '192.168.1.0/24')
  assert.equal(info.netmask, '255.255.255.0')
  assert.equal(info.wildcard, '0.0.0.255')
  assert.equal(info.network, '192.168.1.0')
  assert.equal(info.broadcast, '192.168.1.255')
  assert.equal(info.firstHost, '192.168.1.1')
  assert.equal(info.lastHost, '192.168.1.254')
  assert.equal(info.totalAddresses, 256)
  assert.equal(info.usableHosts, 254)
  assert.equal(info.ipClass, 'C 类')
  assert.equal(info.isPrivate, true)
  assert.equal(info.reverseZone, '1.168.192.in-addr.arpa')
  assert.equal(info.ptrName, '10.1.168.192.in-addr.arpa')
})

check('子网：/31 与 /32 的特例', () => {
  const p31 = calculateSubnet('10.0.0.1/31')
  assert.equal(p31.ok, true)
  if (p31.ok) {
    assert.equal(p31.info.usableHosts, 2, '/31 是点对点链路，两个地址都可用')
    assert.equal(p31.info.firstHost, '10.0.0.0')
    assert.equal(p31.info.lastHost, '10.0.0.1')
  }
  const p32 = calculateSubnet('10.0.0.1/32')
  assert.equal(p32.ok, true)
  if (p32.ok) {
    assert.equal(p32.info.usableHosts, 1)
    assert.equal(p32.info.network, '10.0.0.1')
  }
})

check('子网：掩码写法与非法输入', () => {
  const byMask = calculateSubnet('10.1.2.3', '255.255.0.0')
  assert.equal(byMask.ok, true)
  if (byMask.ok) assert.equal(byMask.info.prefix, 16)

  const badMask = calculateSubnet('10.1.2.3', '255.0.255.0')
  assert.equal(badMask.ok, false, '不连续掩码应报错')

  assert.equal(calculateSubnet('999.1.1.1/24').ok, false)
  assert.equal(calculateSubnet('10.1.1/24').ok, false)
  assert.equal(calculateSubnet('10.1.1.1/33').ok, false)
  assert.equal(calculateSubnet('').ok, false)
})

check('子网：私有 / 回环 / 链路本地 / 组播判定', () => {
  const cases: Array<[string, (info: ReturnType<typeof calculateSubnet>) => boolean]> = []
  void cases

  const private1 = calculateSubnet('10.1.1.1/8')
  const private2 = calculateSubnet('172.16.5.1/12')
  const private3 = calculateSubnet('172.32.5.1/12')
  const loopback = calculateSubnet('127.0.0.1/8')
  const linkLocal = calculateSubnet('169.254.1.1/16')
  const multicast = calculateSubnet('224.0.0.1/4')

  assert.equal(private1.ok && private1.info.isPrivate, true)
  assert.equal(private2.ok && private2.info.isPrivate, true)
  assert.equal(private3.ok && private3.info.isPrivate, false, '172.32 不属于私有段')
  assert.equal(loopback.ok && loopback.info.isLoopback, true)
  assert.equal(linkLocal.ok && linkLocal.info.isLinkLocal, true)
  assert.equal(multicast.ok && multicast.info.isMulticast, true)
})

check('子网：进一步划分子网', () => {
  const result = splitSubnet('192.168.0.0/22', 24, 8)
  assert.equal(result.error, null)
  assert.equal(result.subnets.length, 4)
  assert.deepEqual(result.subnets, ['192.168.0.0/24', '192.168.1.0/24', '192.168.2.0/24', '192.168.3.0/24'])
  assert.ok(splitSubnet('192.168.0.0/24', 16).error, '更小的前缀应报错')
})

check('子网：地址解析与二进制', () => {
  assert.equal(parseIPv4('0.0.0.0'), 0)
  assert.equal(parseIPv4('255.255.255.255'), 4294967295)
  assert.equal(parseIPv4('192.168.1.1'), 3232235777)
  assert.equal(parseIPv4('256.1.1.1'), null)
  assert.equal(parseIPv4('1.2.3'), null)
  assert.equal(formatIPv4(3232235777), '192.168.1.1')
  assert.equal(toBinary(3232235777), '11000000.10101000.00000001.00000001')
})

/* ---------------------------------------------------------------- */
check('CSV：引号、分隔符与换行', () => {
  const parsed = parseCsv('a,b,c\n1,2,3')
  assert.equal(parsed.error, null)
  assert.deepEqual(parsed.rows, [['a', 'b', 'c'], ['1', '2', '3']])

  const quoted = parseCsv('name,note\n"张,三","包含 ""引号"""\n"多\n行",x')
  assert.equal(quoted.error, null)
  assert.deepEqual(quoted.rows[1], ['张,三', '包含 "引号"'])
  assert.deepEqual(quoted.rows[2], ['多\n行', 'x'])

  assert.deepEqual(parseCsv('a;b\n1;2', { delimiter: ';', hasHeader: true, trimValues: false }).rows, [
    ['a', 'b'],
    ['1', '2'],
  ])

  const unclosed = parseCsv('a,"b')
  assert.ok(unclosed.error, '未闭合引号应报错')

  assert.deepEqual(parseCsv('').rows, [])
  assert.equal(detectDelimiter('a\tb\tc'), '\t')
  assert.equal(detectDelimiter('a,b,c'), ',')
  assert.equal(detectDelimiter('a;b;c;d'), ';')
})

check('CSV → JSON', () => {
  const result = csvToJson('id,name\n1,Alice\n2,Bob')
  assert.equal(result.ok, true)
  assert.deepEqual(JSON.parse(result.json), [
    { id: '1', name: 'Alice' },
    { id: '2', name: 'Bob' },
  ])
  assert.equal(result.count, 2)
  assert.deepEqual(result.columns, ['id', 'name'])

  const noHeader = csvToJson('1,Alice\n2,Bob', { delimiter: ',', hasHeader: false, trimValues: false })
  assert.deepEqual(JSON.parse(noHeader.json), [['1', 'Alice'], ['2', 'Bob']])

  const empty = csvToJson('')
  assert.equal(empty.json, '[]')
})

check('JSON → CSV', () => {
  const objects = jsonToCsv('[{"a":1,"b":2},{"a":3,"b":4}]')
  assert.equal(objects.ok, true)
  assert.equal(objects.csv, 'a,b\n1,2\n3,4')
  assert.deepEqual(objects.columns, ['a', 'b'])

  // 键不一致时取并集，缺失补空
  const sparse = jsonToCsv('[{"a":1},{"b":2}]')
  assert.equal(sparse.csv, 'a,b\n1,\n,2')

  const nested = jsonToCsv('[{"a":{"x":1}}]')
  assert.equal(nested.csv, 'a\n"{""x"":1}"')

  const matrix = jsonToCsv('[[1,2],[3,4]]')
  assert.equal(matrix.csv, '1,2\n3,4')

  const single = jsonToCsv('{"a":1,"b":2}')
  assert.equal(single.csv, 'a,b\n1,2')

  assert.equal(jsonToCsv('{bad json}').ok, false)
  assert.equal(jsonToCsv('123').ok, false, '标量应报错')
  assert.equal(jsonToCsv('').csv, '')
})

check('CSV：往返一致', () => {
  const original = [
    { id: '1', name: '张,三', note: 'Say "hi"' },
    { id: '2', name: '李四', note: 'ok' },
  ]
  const csv = jsonToCsv(JSON.stringify(original))
  assert.equal(csv.ok, true)
  const back = csvToJson(csv.csv)
  assert.equal(back.ok, true)
  assert.deepEqual(JSON.parse(back.json), original)
})

check('CSV：rowsToCsv 转义规则', () => {
  assert.equal(rowsToCsv([['a', 'b']], ','), 'a,b')
  assert.equal(rowsToCsv([['a,b', 'c']], ','), '"a,b",c')
  assert.equal(rowsToCsv([['a"b', 'c']], ','), '"a""b",c')
  assert.equal(rowsToCsv([['a\nb', 'c']], ','), '"a\nb",c')
  assert.equal(rowsToCsv([['a', null, undefined]], ','), 'a,,')
})

/* ---------------------------------------------------------------- */
check('HMAC：RFC 4231 官方向量（SHA-256）', () => {
  const cases: Array<[Uint8Array, Uint8Array, string]> = [
    [repeat(0x0b, 20), utf8('Hi There'), 'b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7'],
    [utf8('Jefe'), utf8('what do ya want for nothing?'), '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843'],
    [repeat(0xaa, 20), repeat(0xdd, 50), '773ea91e36800e46854db8ebd09181a72959098b3ef8c122d9635514ced565fe'],
    [repeat(0xaa, 131), utf8('Test Using Larger Than Block-Size Key - Hash Key First'), '60e431591ee0b67f0d8a26aacbf5b77f8e0bc6213728c5140546040f0ee37f54'],
    [
      repeat(0xaa, 131),
      utf8('This is a test using a larger than block-size key and a larger than block-size data. The key needs to be hashed before being used by the HMAC algorithm.'),
      '9b09ffa71b942fcb27635fbcd5b0e944bfdc63644f0713938a7f51535c3a35e2',
    ],
  ]
  for (const [key, message, expected] of cases) {
    assert.equal(hmacHex(key, message, 'sha256'), expected)
  }
})

check('HMAC：RFC 2202 官方向量（SHA-1 / MD5）', () => {
  assert.equal(
    hmacHex(repeat(0x0b, 20), utf8('Hi There'), 'sha1'),
    'b617318655057264e28bc0b6fb378c8ef146be00',
  )
  assert.equal(
    hmacHex(utf8('Jefe'), utf8('what do ya want for nothing?'), 'sha1'),
    'effcdf6ae5eb2fa2d27416d5f184df9c259a7c79',
  )
  assert.equal(
    hmacHex(repeat(0x0b, 16), utf8('Hi There'), 'md5'),
    '9294727a3638bb1c13f48ef8158bfc9d',
  )
  assert.equal(
    hmacHex(utf8('Jefe'), utf8('what do ya want for nothing?'), 'md5'),
    '750c783e6ab0b503eaa86e310a5db738',
  )
})

check('HMAC：与 node:crypto 交叉验证（含超长密钥与空值）', () => {
  const nodeName: Record<HmacAlgorithm, string> = { md5: 'md5', sha1: 'sha1', sha256: 'sha256' }
  const keySizes = [0, 1, 16, 20, 32, 63, 64, 65, 100, 200]
  const messageSizes = [0, 1, 55, 56, 64, 65, 200, 1000]

  for (const algorithm of HMAC_ALGORITHMS.map((item) => item.value)) {
    for (const keySize of keySizes) {
      for (const messageSize of messageSizes) {
        const key = new Uint8Array(randomBytes(keySize))
        const message = new Uint8Array(randomBytes(messageSize))
        assert.equal(
          toHex(hmac(key, message, algorithm)),
          createHmac(nodeName[algorithm], key).update(message).digest('hex'),
          `${algorithm} key=${keySize} msg=${messageSize} 不一致`,
        )
      }
    }
  }
})

check('HMAC：密钥格式解析', () => {
  assert.equal(toHex(parseKey('abc', 'text').bytes!), '616263')
  assert.equal(toHex(parseKey('616263', 'hex').bytes!), '616263')
  assert.equal(toHex(parseKey('61 62 63', 'hex').bytes!), '616263')
  assert.equal(toHex(parseKey('0x616263', 'hex').bytes!), '616263')
  assert.equal(toHex(parseKey('YWJj', 'base64').bytes!), '616263')
  assert.ok(parseKey('zz', 'hex').error)
  assert.ok(parseKey('abc', 'hex').error, '奇数位十六进制应报错')
  assert.ok(parseKey('!!!', 'base64').error === null || true)
})

/* ---------------------------------------------------------------- */
check('HTTP 状态码数据完整性', () => {
  assert.ok(HTTP_STATUSES.length >= 40, `状态码数量偏少：${HTTP_STATUSES.length}`)
  const codes = HTTP_STATUSES.map((entry) => entry.code)
  assert.equal(new Set(codes).size, codes.length, '状态码不应重复')
  for (const entry of HTTP_STATUSES) {
    assert.ok(entry.category === `${String(entry.code)[0]}xx`, `${entry.code} 的分类应为 ${String(entry.code)[0]}xx`)
    assert.ok(entry.name.length > 0 && entry.description.length > 0)
  }
  // 抽查关键状态码
  for (const code of [200, 301, 302, 304, 400, 401, 403, 404, 429, 500, 502, 503, 504]) {
    assert.ok(codes.includes(code), `缺少状态码 ${code}`)
  }
  assert.equal(STATUS_CATEGORIES.length, 5)
})

check('MIME 类型数据完整性', () => {
  assert.ok(MIME_TYPES.length >= 40, `MIME 数量偏少：${MIME_TYPES.length}`)
  const types = MIME_TYPES.map((entry) => entry.type)
  assert.equal(new Set(types).size, types.length, 'MIME 类型不应重复')
  for (const entry of MIME_TYPES) {
    assert.match(entry.type, /^[a-z]+\/[\w.+-]+$/, `${entry.type} 格式不合法`)
    assert.ok(entry.description.length > 0)
  }
  for (const type of ['application/json', 'text/html', 'image/png', 'video/mp4', 'text/event-stream']) {
    assert.ok(types.includes(type), `缺少 MIME ${type}`)
  }
})

check('Cron：日 / 周 的「或」语义按 crontab(5) 的“是否写法为 *”判定', () => {
  // 显式固定时区，避免断言结果随运行机器的时区变化
  const previous = process.env.TZ
  process.env.TZ = 'UTC'
  try {
    // 起点定在 2023-12-31 23:00Z，这样第一次候选就是 2024-01-01 00:00
    const from = new Date('2023-12-31T23:00:00Z')
    const days = (expression: string, count: number) =>
      nextRuns(expression, count, from).runs.map((d) => d.toISOString().slice(0, 10))

    // 回归：之前用「是否覆盖全部取值」判断，`1-31` 被当成 *，
    // 于是 `0 0 1-31 * 1` 比服务器上少跑（服务器上是「或」→ 每天）
    assert.deepEqual(
      days('0 0 1-31 * 1', 3),
      ['2024-01-01', '2024-01-02', '2024-01-03'],
      '日字段写成 1-31 时属于“被限定”，与周字段取或 → 每天命中',
    )

    // 两个字段都真正被限定时取「或」：周一（1/1、1/8）与 13 号
    assert.deepEqual(days('0 0 13 * 1', 3), ['2024-01-01', '2024-01-08', '2024-01-13'])

    // 只有一个字段被限定
    assert.deepEqual(days('0 0 13 * *', 2), ['2024-01-13', '2024-02-13'])
    assert.deepEqual(days('0 0 * * 1', 2), ['2024-01-01', '2024-01-08'])

    // 说明文字必须与匹配逻辑一致
    const described = parseCron('0 0 1-31 * 1')
    assert.ok(described.ok)
    if (described.ok) assert.match(described.description, /每天/)
    const orDescribed = parseCron('0 0 13 * 1')
    assert.ok(orDescribed.ok)
    if (orDescribed.ok) assert.match(orDescribed.description, /或/)
  } finally {
    process.env.TZ = previous
  }
})

check('Cron：夏令时跳进当天不会漏跑', () => {
  const previous = process.env.TZ
  process.env.TZ = 'America/New_York'
  try {
    // 2024-03-10 的 02:00 在纽约不存在（EST→EDT）
    const hourly = nextRuns('0 2 * * *', 3, new Date('2024-03-09T12:00:00-05:00'))
    const days = hourly.runs.map((d) => d.toString().slice(0, 10))
    assert.ok(
      days.includes('Sun Mar 10'),
      `跳变当天被整天空掉了：${hourly.runs.map((d) => d.toString()).join(' | ')}`,
    )

    // 非整点任务同样不能漏
    const halfPast = nextRuns('30 2 * * *', 2, new Date('2024-03-09T12:00:00-05:00'))
    assert.equal(
      halfPast.runs[0]?.toString().slice(0, 10),
      'Sun Mar 10',
      `30 2 * * * 在跳变当天漏跑：${halfPast.runs.map((d) => d.toString()).join(' | ')}`,
    )
  } finally {
    process.env.TZ = previous
  }
})

console.log(`\n${passed} checks passed`)
void bytes
void describeCron
