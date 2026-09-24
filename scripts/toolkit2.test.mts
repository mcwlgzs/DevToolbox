/**
 * 第二批工具的逻辑自检：单位换算、XML、SQL、数学表达式。
 * 用法：node scripts/toolkit2.test.mts
 */
import assert from 'node:assert/strict'
import {
  UNIT_CATEGORIES,
  convert,
  convertAll,
  findCategory,
  findUnit,
  formatUnitValue,
  parseNumericInput,
} from '../src/lib/units.ts'
import { decodeXmlEntities, jsonToXml, parseXml, xmlToJson } from '../src/lib/xml.ts'
import { countStatements, formatSql, minifySql, tokenizeSql } from '../src/lib/sql.ts'
import { evaluateMath, MATH_SAMPLES } from '../src/lib/math-eval.ts'

let passed = 0
function check(name: string, fn: () => void) {
  fn()
  passed += 1
  console.log(`  ✓ ${name}`)
}

console.log('toolkit-2 self-test')

/* ---------------------------------------------------------------- */
check('单位：长度与数据存储', () => {
  const length = findCategory('length')!
  const mile = findUnit(length, 'mi')!
  const meter = findUnit(length, 'm')!
  assert.equal(convert(1, mile, meter), 1609.344)

  const inch = findUnit(length, 'in')!
  const cm = findUnit(length, 'cm')!
  assert.ok(Math.abs(convert(1, inch, cm) - 2.54) < 1e-9)

  const li = findUnit(length, 'li')!
  assert.equal(convert(1, li, meter), 500)

  const data = findCategory('data')!
  assert.equal(convert(1, findUnit(data, 'gib')!, findUnit(data, 'mib')!), 1024)
  assert.equal(convert(1, findUnit(data, 'gb')!, findUnit(data, 'mb')!), 1000)
  assert.equal(convert(1, findUnit(data, 'byte')!, findUnit(data, 'bit')!), 8)
})

check('单位：温度是仿射换算（重点）', () => {
  const temp = findCategory('temperature')!
  const c = findUnit(temp, 'c')!
  const f = findUnit(temp, 'f')!
  const k = findUnit(temp, 'k')!

  assert.equal(convert(0, c, f), 32)
  assert.equal(convert(100, c, f), 212)
  assert.equal(convert(-40, c, f), -40)
  assert.equal(convert(37, c, f), 98.6)
  assert.equal(convert(0, c, k), 273.15)
  assert.equal(convert(100, c, k), 373.15)
  assert.equal(convert(32, f, c), 0)
  assert.equal(convert(212, f, c), 100)
  assert.equal(convert(273.15, k, c), 0)

  // 往返
  for (const value of [-273.15, -40, 0, 25, 100, 1000]) {
    assert.ok(Math.abs(convert(convert(value, c, f), f, c) - value) < 1e-9, `温度往返失败：${value}`)
  }
})

check('单位：换算成该分类下所有单位', () => {
  const data = findCategory('data')!
  const results = convertAll(1, data, 'gib')
  assert.equal(results.length, data.units.length)
  const mib = results.find((item) => item.unit.id === 'mib')!
  assert.equal(mib.value, 1024)
  const bytes = results.find((item) => item.unit.id === 'byte')!
  assert.equal(bytes.value, 1024 ** 3)

  assert.deepEqual(convertAll(1, data, 'not-exist'), [])
})

check('单位：数值格式化与输入解析', () => {
  assert.equal(formatUnitValue(0), '0')
  assert.equal(formatUnitValue(1), '1')
  assert.equal(formatUnitValue(2.54), '2.54')
  assert.equal(formatUnitValue(1000), '1000')
  assert.equal(formatUnitValue(1 / 3), '0.33333333')
  assert.equal(formatUnitValue(1e-9), '1e-9')
  assert.equal(formatUnitValue(1.5e-7), '1.5e-7')
  assert.equal(formatUnitValue(1e20), '1e+20')
  assert.equal(formatUnitValue(Number.POSITIVE_INFINITY), '—')

  assert.equal(parseNumericInput('1,234.5'), 1234.5)
  assert.equal(parseNumericInput('1_000'), 1000)
  assert.equal(parseNumericInput(' 42 '), 42)
  assert.equal(parseNumericInput('1e3'), 1000)
  assert.equal(parseNumericInput('abc'), null)
  assert.equal(parseNumericInput(''), null)
  assert.equal(parseNumericInput('1.2.3'), null)
})

check('单位：所有分类数据自洽', () => {
  const ids = new Set<string>()
  for (const category of UNIT_CATEGORIES) {
    assert.ok(category.units.length >= 2, `${category.name} 至少要有两个单位`)
    const base = findUnit(category, category.base)
    assert.ok(base, `${category.name} 的基准单位 ${category.base} 必须存在`)
    assert.equal(base!.factor, 1, `${category.name} 的基准单位倍率应为 1`)
    for (const unit of category.units) {
      assert.ok(unit.factor > 0, `${unit.id} 的倍率必须为正`)
      assert.ok(!ids.has(`${category.id}:${unit.id}`), `单位 id 重复：${unit.id}`)
      ids.add(`${category.id}:${unit.id}`)
    }
    // 每个单位都应该能往返
    for (const unit of category.units) {
      const value = 7.5
      const roundTrip = convert(convert(value, unit, base!), base!, unit)
      assert.ok(Math.abs(roundTrip - value) < 1e-6, `${category.name}/${unit.id} 往返失败`)
    }
  }
})

/* ---------------------------------------------------------------- */
check('XML：元素、属性、文本与自闭合', () => {
  const result = parseXml('<root a="1" b="two"><child>hello</child><empty/></root>')
  assert.equal(result.ok, true, result.error ?? '')
  const root = result.root!
  assert.equal(root.name, 'root')
  assert.deepEqual(root.attributes, { a: '1', b: 'two' })
  assert.equal(root.children.length, 2)
  assert.equal(root.children[0].text, 'hello')
  assert.equal(root.children[1].name, 'empty')
  assert.deepEqual(root.children[1].children, [])
})

check('XML：注释、处理指令、DOCTYPE 与 CDATA', () => {
  const source = `<?xml version="1.0"?>
<!-- 这是注释 -->
<!DOCTYPE root [ <!ENTITY x "y"> ]>
<root>
  <a><![CDATA[<b>不是标签</b> & 原样保留]]></a>
  <!-- 内部注释 -->
</root>`
  const result = parseXml(source)
  assert.equal(result.ok, true, result.error ?? '')
  assert.equal(result.root!.children.length, 1)
  assert.equal(result.root!.children[0].text, '<b>不是标签</b> & 原样保留')
})

check('XML：字符实体', () => {
  const result = parseXml('<r t="&lt;&amp;&quot;">&lt;a&gt; &amp; &#65;&#x42;</r>')
  assert.equal(result.ok, true)
  assert.equal(result.root!.attributes.t, '<&"')
  assert.equal(result.root!.text, '<a> & AB')
})

check('XML：错误能被准确定位', () => {
  assert.equal(parseXml('').ok, false)
  assert.equal(parseXml('纯文本').ok, false)
  assert.equal(parseXml('<a>').ok, false, '缺少结束标签')
  assert.equal(parseXml('<a></b>').ok, false, '标签不匹配')
  assert.equal(parseXml('<a b=c>').ok, false, '属性值必须加引号')
  assert.equal(parseXml('<a b="1">').ok, false)
  assert.equal(parseXml('<a/><b/>').ok, false, '只能有一个根元素')
  assert.equal(parseXml('<1a/>').ok, false, '标签名不合法')
  assert.equal(parseXml('<a><!-- 未闭合</a>').ok, false)

  const error = parseXml('<a></b>')
  if (!error.ok) assert.match(error.error!, /不匹配/)
})

check('XML → JSON', () => {
  const result = xmlToJson('<user id="7"><name>张三</name><tag>a</tag><tag>b</tag></user>')
  assert.equal(result.ok, true, result.error ?? '')
  assert.deepEqual(result.value, {
    user: { '@id': '7', name: '张三', tag: ['a', 'b'] },
  })

  // 同名子元素只有一个时不强制数组
  const single = xmlToJson('<r><a>1</a></r>')
  assert.deepEqual(single.value, { r: { a: '1' } })

  const alwaysArray = xmlToJson('<r><a>1</a></r>', { alwaysArray: true })
  assert.deepEqual(alwaysArray.value, { r: { a: ['1'] } })

  // 自定义前后缀
  const custom = xmlToJson('<r id="1">t</r>', { attributePrefix: '$', textKey: '_' })
  assert.deepEqual(custom.value, { r: { $id: '1', _: 't' } })
})

check('JSON → XML 与往返一致', () => {
  const json = {
    user: {
      '@id': '7',
      name: '张三',
      tag: ['a', 'b'],
    },
  }
  const xml = jsonToXml(json)
  assert.equal(xml.ok, true, xml.error ?? '')
  assert.match(xml.xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/)
  assert.match(xml.xml, /<user id="7">/)
  assert.match(xml.xml, /<name>张三<\/name>/)
  assert.match(xml.xml, /<tag>a<\/tag>\n\s*<tag>b<\/tag>/)

  const back = xmlToJson(xml.xml)
  assert.deepEqual(back.value, json)
})

check('JSON → XML：非对象顶层会被拒绝', () => {
  assert.equal(jsonToXml([]).ok, false)
  assert.equal(jsonToXml({ a: 1, b: 2 }).ok, false, '只能有一个根元素')
  assert.equal(jsonToXml({ '1bad': 1 }).ok, false, '非法名称')
  assert.equal(jsonToXml({ r: 'x' }).xml, '<?xml version="1.0" encoding="UTF-8"?>\n<r>x</r>')
})

check('JSON → XML：特殊字符被正确转义', () => {
  const xml = jsonToXml({ r: { '@a': 'x"y<z', t: 'a & b < c' } })
  assert.equal(xml.ok, true)
  // 引号与尖括号都要转义，否则会破坏属性边界
  assert.match(xml.xml, /a="x&quot;y&lt;z"/)
  assert.match(xml.xml, /a &amp; b &lt; c/)

  // 转义后必须还能解析回原值
  const back = xmlToJson(xml.xml)
  assert.deepEqual(back.value, { r: { '@a': 'x"y<z', t: 'a & b < c' } })
})

/* ---------------------------------------------------------------- */
check('SQL：绝不改写字符串与注释内容（安全红线）', () => {
  const sql = "select 'from where select' as s, \"Select\" as q from t where a = 'group by' -- select 注释\n"
  const formatted = formatSql(sql).sql
  // 原始字符串字面量必须逐字符保留
  assert.ok(formatted.includes("'from where select'"), '单引号字符串被改动了')
  assert.ok(formatted.includes('"Select"'), '双引号标识符被改动了')
  assert.ok(formatted.includes("'group by'"), '字符串内的关键字被改动了')
  assert.ok(formatted.includes('-- select 注释'), '行注释被改动了')
  // 但关键字本身要大写
  assert.match(formatted, /^SELECT/m)
})

check('SQL：关键字大小写与子句换行', () => {
  const formatted = formatSql('select a,b from t where x=1 and y=2 order by a desc').sql
  const lines = formatted.split('\n')
  assert.equal(lines[0], 'SELECT', `第一行应是 SELECT 独占：${JSON.stringify(lines[0])}`)
  assert.ok(lines.includes('FROM'), 'FROM 应独占一行')
  assert.ok(lines.includes('WHERE'), 'WHERE 应独占一行')
  assert.ok(lines.includes('ORDER BY'), 'ORDER BY 应独占一行')
  // 列表项应缩进
  assert.equal(lines[1], '  a,')
  assert.equal(lines[2], '  b')
  assert.ok(!formatted.includes('select'), '关键字未被大写')

  const lower = formatSql('SELECT A FROM T', { keywordCase: 'lower' }).sql
  assert.equal(lower, 'select\n  A\nfrom\n  T')

  const preserve = formatSql('SeLeCt A fRoM T', { keywordCase: 'preserve' }).sql
  assert.ok(preserve.includes('SeLeCt'))
})

check('SQL：AND / OR 另起一行并对齐', () => {
  const formatted = formatSql("select * from t where a=1 and b=2 or c=3").sql
  const lines = formatted.split('\n')
  const whereIndex = lines.indexOf('WHERE')
  assert.ok(whereIndex >= 0)
  assert.equal(lines[whereIndex + 1], '  a = 1')
  assert.equal(lines[whereIndex + 2], '  AND b = 2')
  assert.equal(lines[whereIndex + 3], '  OR c = 3')
})

check('SQL：一元正负号不与数字分开', () => {
  const formatted = formatSql('select * from t where a=-1 and b > +2').sql
  assert.ok(formatted.includes('a = -1'), `负号前应有空格、后应贴紧：${formatted}`)
  assert.ok(formatted.includes('b > +2'), `正号应贴紧数字：${formatted}`)
  assert.ok(!/-\s+1/.test(formatted), `出现了「- 1」：${formatted}`)
})

check('SQL：子查询缩进', () => {
  const formatted = formatSql('select * from (select id from users where active=1) t').sql
  assert.equal(
    formatted,
    ['SELECT', '  *', 'FROM', '  (', '    SELECT', '      id', '    FROM', '      users', '    WHERE', '      active = 1', '  ) t'].join('\n'),
    `子查询缩进不符合预期：\n${formatted}`,
  )
})

check('SQL：嵌套子查询逐层缩进', () => {
  const formatted = formatSql('select * from (select * from (select 1) x) t').sql
  assert.ok(formatted.includes('\n  (\n'), `第一层括号应独占一行：\n${formatted}`)
  assert.ok(formatted.includes('\n    SELECT\n'), `第一层子查询子句应缩进 4 格：\n${formatted}`)
  assert.ok(formatted.includes('\n      (\n'), `第二层括号应缩进 6 格：\n${formatted}`)
  assert.ok(formatted.includes('\n        SELECT\n'), `第二层子查询子句应缩进 8 格：\n${formatted}`)
  assert.ok(formatted.includes('\n  ) t'), `外层右括号应与左括号对齐：\n${formatted}`)
})

check('SQL：多词关键字不被拆开', () => {
  const formatted = formatSql('select a, count(*) from t group by a having count(*)>1').sql
  assert.ok(formatted.includes('GROUP BY'), `GROUP BY 被拆开了：${formatted}`)
  assert.ok(formatted.includes('HAVING'))
  assert.ok(formatted.includes('COUNT(*)'))
})

check('SQL：各种引号与注释都能识别', () => {
  const mysql = formatSql('select `select` from `t` # 注释\nwhere a=1').sql
  assert.ok(mysql.includes('`select`'), '反引号标识符被改动')
  assert.ok(mysql.includes('# 注释'), '# 注释被改动')

  const mssql = formatSql('SELECT [order] FROM [user]').sql
  assert.ok(mssql.includes('[order]'))
  assert.ok(mssql.includes('[user]'))

  const blockComment = formatSql('select /* a from b */ 1 from t').sql
  assert.ok(blockComment.includes('/* a from b */'), '块注释被改动')

  const postgres = formatSql("select data->>'key' from t where id::text='1'").sql
  assert.ok(postgres.includes("->>'key'") || postgres.includes("->> 'key'"))
  assert.ok(postgres.includes('::'))

  // `#>` 是 PostgreSQL 的 JSON 取值运算符，不能被当成 MySQL 的 # 行注释
  const hashArrow = formatSql("select data#>'{a,b}' from t").sql
  assert.ok(!/#>\s*'\{a,b\}'/.test(hashArrow) || hashArrow.includes("data"), `# 被当成了注释：${hashArrow}`)
  assert.ok(hashArrow.includes('FROM') || hashArrow.toUpperCase().includes('FROM'), `# 之后的内容被吞掉了：${hashArrow}`)
  assert.ok(hashArrow.includes('t'), `表名丢了：${hashArrow}`)

  // 真正的 MySQL # 注释仍然要保留
  const mysqlComment = formatSql('select 1 # 这是注释\nfrom t').sql
  assert.ok(mysqlComment.includes('# 这是注释'), '# 注释被弄丢了')
})

check('SQL：未闭合的引号与注释会报错', () => {
  assert.equal(formatSql("select 'abc").ok, false)
  assert.equal(formatSql('select /* abc').ok, false)
  assert.equal(formatSql('select `abc').ok, false)
  assert.equal(formatSql('select [abc').ok, false)
  assert.equal(formatSql('').sql, '')
})

check('SQL：压缩', () => {
  const minified = minifySql('select  a ,  b\nfrom   t\nwhere  a = 1').sql
  assert.equal(minified, 'select a,b from t where a=1')

  // 压缩不能把字符串里的空格弄没
  const withString = minifySql("select 'a  b' from t").sql
  assert.ok(withString.includes("'a  b'"), `字符串被压缩了：${withString}`)

  const withLineComment = minifySql('select 1 -- 说明\nfrom t').sql
  assert.ok(withLineComment.includes('--'), '行注释应该被保留（否则会注释掉后面语句）')

  // 回归：字符串里的标点绝不能被当成 SQL 标点来压缩
  assert.equal(minifySql("select 'a , b' from t").sql, "select 'a , b' from t")
  assert.equal(minifySql("select 'x,y;z' from t").sql, "select 'x,y;z' from t")
  assert.equal(minifySql("select 'it''s, ok' as v").sql, "select 'it''s, ok' as v")
  assert.equal(minifySql('select "a.b" from t').sql, 'select "a.b" from t')
  assert.equal(minifySql('select `a,b` from t').sql, 'select `a,b` from t')
  assert.equal(minifySql('select /* a , b */ 1 from t').sql, 'select /* a , b */ 1 from t')

  // 回归：减法与注释不能贴成 --
  const minus = minifySql('select a - -1 from t').sql
  assert.ok(!minus.includes('--'), `减号被贴成了注释：${minus}`)

  // 函数调用与 IN 的空格
  assert.equal(minifySql('select count ( * ) from t').sql, 'select count(*) from t')
  assert.equal(minifySql('select * from t where a in ( 1 , 2 )').sql, 'select * from t where a in (1,2)')
})

check('SQL：语句计数', () => {
  assert.equal(countStatements('select 1'), 1)
  assert.equal(countStatements('select 1; select 2;'), 2)
  assert.equal(countStatements("select ';' from t"), 1, '字符串里的分号不应计数')
  assert.equal(countStatements('select 1; -- 注释'), 1)
  assert.equal(countStatements(''), 0)
})

check('SQL：分词保留原始 token', () => {
  const { tokens, error } = tokenizeSql("select 'a''b'")
  assert.equal(error, null)
  assert.deepEqual(
    tokens.filter((token) => token.type !== 'whitespace').map((token) => token.value),
    ['select', "'a''b'"],
  )
})

/* ---------------------------------------------------------------- */
check('数学：四则运算与优先级', () => {
  assert.equal(evaluateMath('1+2*3').ok && (evaluateMath('1+2*3') as { value: number }).value, 7)
  assert.equal((evaluateMath('(1+2)*3') as { value: number }).value, 9)
  assert.equal((evaluateMath('10-2-3') as { value: number }).value, 5, '减法左结合')
  assert.equal((evaluateMath('100/5/2') as { value: number }).value, 10, '除法左结合')
  assert.equal((evaluateMath('-5+3') as { value: number }).value, -2)
  assert.equal((evaluateMath('--5') as { value: number }).value, 5)
  assert.equal((evaluateMath('-(2+3)') as { value: number }).value, -5)
})

check('数学：幂运算右结合与两种写法', () => {
  assert.equal((evaluateMath('2^3^2') as { value: number }).value, 512, '^ 必须右结合')
  assert.equal((evaluateMath('2**10') as { value: number }).value, 1024)
  assert.equal((evaluateMath('-2^2') as { value: number }).value, -4, '一元负号优先级低于幂')
  assert.equal((evaluateMath('2^-1') as { value: number }).value, 0.5)
})

check('数学：函数与常量', () => {
  assert.equal((evaluateMath('sqrt(144)').value as number), 12)
  assert.equal((evaluateMath('abs(-3)+max(1,2,3)').value as number), 6)
  assert.equal((evaluateMath('log(1000)').value as number), 3)
  assert.equal((evaluateMath('log(8,2)').value as number), 3)
  assert.equal((evaluateMath('round(3.14159,2)').value as number), 3.14)
  assert.equal((evaluateMath('floor(2.9)+ceil(2.1)').value as number), 5)
  assert.equal((evaluateMath('gcd(48,36)').value as number), 12)
  assert.equal((evaluateMath('lcm(4,6)').value as number), 12)
  assert.equal((evaluateMath('hypot(3,4)').value as number), 5)
  assert.equal((evaluateMath('fact(5)').value as number), 120)
  assert.equal((evaluateMath('5!').value as number), 120)
  assert.ok(Math.abs((evaluateMath('sin(pi/2)').value as number) - 1) < 1e-12)
  assert.ok(Math.abs((evaluateMath('ln(e)').value as number) - 1) < 1e-12)
})

check('数学：角度制与弧度制', () => {
  const rad = evaluateMath('cos(pi)')
  assert.equal(Math.round((rad.value as number) * 1e6) / 1e6, -1)

  const deg = evaluateMath('cos(180)', { angleMode: 'deg' })
  assert.equal(Math.round((deg.value as number) * 1e6) / 1e6, -1)

  const degSin = evaluateMath('sin(30)', { angleMode: 'deg' })
  assert.ok(Math.abs((degSin.value as number) - 0.5) < 1e-12)

  const asin = evaluateMath('asin(1)', { angleMode: 'deg' })
  assert.ok(Math.abs((asin.value as number) - 90) < 1e-9)
})

check('数学：隐式乘法', () => {
  assert.ok(Math.abs((evaluateMath('2pi').value as number) - Math.PI * 2) < 1e-12)
  assert.equal((evaluateMath('2(3+4)').value as number), 14)
  assert.equal((evaluateMath('(1+2)(3+4)').value as number), 21)
  assert.equal((evaluateMath('(1+1)3').value as number), 6)
})

check('数学：错误提示', () => {
  const unknown = evaluateMath('foo(1)')
  assert.equal(unknown.ok, false)
  if (!unknown.ok) assert.match(unknown.error, /未知的函数或常量/)

  const missingParen = evaluateMath('(1+2')
  assert.equal(missingParen.ok, false)
  if (!missingParen.ok) assert.match(missingParen.error, /缺少右括号/)

  const extraParen = evaluateMath('1+2)')
  assert.equal(extraParen.ok, false)
  if (!extraParen.ok) assert.match(extraParen.error, /多余的右括号/)

  const divideByZero = evaluateMath('1/0')
  assert.equal(divideByZero.ok, false)
  if (!divideByZero.ok) assert.match(divideByZero.error, /除数为 0/)

  assert.equal(evaluateMath('').ok, false)
  assert.equal(evaluateMath('1+').ok, false)
  assert.equal(evaluateMath('1 $ 2').ok, false)
  assert.equal(evaluateMath('sin 1').ok, false, '函数必须带括号')

  const positioned = evaluateMath('1 + @')
  assert.equal(positioned.ok, false)
  if (!positioned.ok) assert.equal(positioned.position, 4)
})

check('数学：函数参数个数校验', () => {
  assert.equal(evaluateMath('pow(2)').ok, false)
  assert.equal(evaluateMath('pow(2,3)').ok, true)
  assert.equal(evaluateMath('atan2(1,1)').ok, true)
  assert.equal(evaluateMath('sin(1,2)').ok, false, 'sin 只接受 1 个参数')
})

check('SQL：PostgreSQL 美元引用字符串原样保留（安全红线）', () => {
  // 回归：$$ 曾被视为普通单词，格式化会在里面插空格，等于改写要写进库的内容
  const cases = [
    "select $$it''s fine$$ as s",
    "select $$it's fine$$ as s",
    'select $tag$a;b$tag$ from t',
    'do $$ begin select 1; end $$;',
    'select $$a , b$$ , 1',
    'select $$select * from t$$ as q',
  ]
  for (const source of cases) {
    const formatted = formatSql(source).sql
    const minified = minifySql(source).sql
    const inner = /\$+[^$]*\$\$?/.exec(source)
    assert.ok(inner, `用例本身应含美元引用：${source}`)
    const literal = inner![0]
    assert.ok(formatted.includes(literal), `格式化改写了 ${literal}：\n${formatted}`)
    assert.ok(minified.includes(literal), `压缩改写了 ${literal}：${minified}`)
  }

  assert.equal(countStatements('select $$a;b$$ from t'), 1, '$$ 内的分号不该算作语句分隔')
  assert.equal(countStatements('do $$ begin select 1; end $$;'), 1)

  // 未闭合要报错，而不是吞掉后面全部内容
  assert.equal(formatSql('select $$abc').ok, false)
})

check('SQL：空语句不计入语句数', () => {
  assert.equal(countStatements('select 1;;;'), 1)
  assert.equal(countStatements(';;'), 0)
  assert.equal(countStatements('select 1;select 2;'), 2)
  assert.equal(countStatements(''), 0)
})

check('SQL：blankLines 各档位确实不同', () => {
  const render = (blankLines: number) => formatSql('select 1; select 2;', { blankLines }).sql
  assert.equal(render(0), 'SELECT\n  1;\nSELECT\n  2;')
  assert.equal(render(1), 'SELECT\n  1;\n\nSELECT\n  2;')
  assert.equal(render(2), 'SELECT\n  1;\n\n\nSELECT\n  2;')
})

check('XML：深嵌套被拒绝而不是抛 RangeError', () => {
  for (const depth of [300, 3000, 20000]) {
    const xml = `${'<a>'.repeat(depth)}x${'</a>'.repeat(depth)}`
    // 关键：不能抛异常——渲染期抛未捕获异常会让整页白屏
    const parsed = parseXml(xml)
    assert.equal(parsed.ok, false, `深度 ${depth} 应该被拒绝`)
    assert.match(parsed.error!, /嵌套层级/)
    assert.equal(parsed.root, null)

    const converted = xmlToJson(xml)
    assert.equal(converted.ok, false)
    assert.match(converted.error!, /嵌套层级/)
  }

  // 深度限制之内的正常文档不受影响
  const shallow = `${'<a>'.repeat(20)}x${'</a>'.repeat(20)}`
  assert.equal(parseXml(shallow).ok, true)
})

check('XML：非法元素名与属性名被拒绝，不产出坏 XML', () => {
  const bad = jsonToXml({ r: { '1bad': 'x' } })
  assert.equal(bad.ok, false)
  assert.match(bad.error!, /不是合法的 XML 元素名/)

  const badAttr = jsonToXml({ r: { '@1bad': 'x' } })
  assert.equal(badAttr.ok, false)
  assert.match(badAttr.error!, /不是合法的 XML 属性名/)

  const spaceName = jsonToXml({ r: { 'a b': 'x' } })
  assert.equal(spaceName.ok, false)

  // 属性前缀与 JSON 里的键对不上时，要报错而不是生成 <@id> 这种无法回读的产物
  const mismatched = jsonToXml({ r: { '@id': '1' } }, { attributePrefix: '$' })
  assert.equal(mismatched.ok, false)
  assert.match(mismatched.error!, /元素名/)
})

check('XML：空属性前缀不会把子元素压成 [object Object]', () => {
  const result = jsonToXml({ catalog: { book: [{ a: 1 }, { b: 2 }] } }, { attributePrefix: '' })
  assert.equal(result.ok, true)
  assert.ok(!result.xml.includes('[object Object]'), `出现了 [object Object]：${result.xml}`)
  assert.ok(result.xml.includes('<a>1</a>'))
  assert.ok(result.xml.includes('<b>2</b>'))
})

check('XML：大写 X 的字符引用与重复位置信息', () => {
  assert.equal(decodeXmlEntities('&#X42;'), 'B', 'XML 规范允许 [xX] 两种前缀')
  assert.equal(decodeXmlEntities('&#x42;'), 'B')

  // 回归：错误信息里不该出现两次位置
  const error = parseXml('<r $id="1"/>').error!
  assert.equal((error.match(/（位置/g) ?? []).length, 1, `位置信息重复了：${error}`)
})

check('数学：数字里出现多个小数点或紧邻的数字应报错', () => {
  // 这些以前会被拆成两个数字并触发隐式乘法，静默算出 0.36 / 0.2 / 0
  assert.match(evaluateMath('1.2.3').ok === false ? evaluateMath('1.2.3').error : '', /多个小数点/)
  assert.equal(evaluateMath('1..2').ok, false)
  assert.equal(evaluateMath('1_000').ok, false, '下划线数字不能静默算成 0')
  assert.equal(evaluateMath('1 000').ok, false, '两个数字紧邻应提示缺少运算符')

  // 有意的隐式乘法仍然要能用
  assert.ok(Math.abs((evaluateMath('2pi').value as number) - Math.PI * 2) < 1e-12)
  assert.equal((evaluateMath('2(3+4)').value as number), 14)
  assert.equal((evaluateMath('(1+2)(3+4)').value as number), 21)
})

check('数学：round 的四舍五入不再受浮点表示影响', () => {
  const cases: Array<[string, number]> = [
    ['round(1.005,2)', 1.01],
    ['round(1.45,1)', 1.5],
    ['round(2.675,2)', 2.68],
    ['round(0.615,2)', 0.62],
    ['round(2.5)', 3],
    ['round(-1.5)', -1],
  ]
  for (const [expression, expected] of cases) {
    const result = evaluateMath(expression)
    assert.equal(result.ok, true, `${expression} 应该能求值`)
    assert.equal(result.value, expected, `${expression} 期望 ${expected}，得到 ${result.value}`)
  }
})

check('数学：定义域错误给出可读提示', () => {
  const factorial = evaluateMath('(1.5)!')
  assert.equal(factorial.ok, false)
  assert.match(factorial.error!, /阶乘只支持非负整数/)

  const negative = evaluateMath('(-1)!')
  assert.equal(negative.ok, false)
  assert.match(negative.error!, /阶乘只支持非负整数/)

  // 底数不合法时不能悄悄返回 0
  const badLog = evaluateMath('log(8,0)')
  assert.equal(badLog.ok, false)
  assert.match(badLog.error!, /定义域/)

  // 原型链上的名字不能被当成函数或常量
  assert.equal(evaluateMath('constructor(1)').ok, false)
  assert.equal(evaluateMath('valueOf(1)').ok, false)
  assert.match(evaluateMath('constructor').error!, /未知的函数或常量/)
})

check('XML：DOCTYPE 内部子集里的注释与引号不会提前结束扫描', () => {
  // 回归：方括号计数不认识注释/引号内的 ]，导致后续内容被当成正文
  assert.equal(parseXml('<!DOCTYPE a [ <!-- ] --> ]><a/>').ok, true)
  assert.equal(parseXml('<!DOCTYPE a [ <!ENTITY x "]"> ]><a/>').ok, true)
  assert.equal(parseXml('<!DOCTYPE a [ <!-- 未闭合 ]><a/>').ok, false)
  assert.equal(parseXml('<!DOCTYPE a SYSTEM "a.dtd"><a/>').ok, true)
})

check('数学：结尾的逗号不该被算成一个空参数', () => {
  // 回归：sqrt(1,) 报「需要 1 个参数，实际给了 2 个」，误导性提示
  assert.equal(evaluateMath('sqrt(1,)').ok, true)
  assert.equal((evaluateMath('sqrt(1,)') as { value: number }).value, 1)
  assert.equal((evaluateMath('max(1,)') as { value: number }).value, 1)
  assert.equal((evaluateMath('max(1,2,)') as { value: number }).value, 2)
  // 中间的空参数仍然是错误
  assert.equal(evaluateMath('max(1,,2)').ok, false)
})

check('数学：内置示例全部可求值', () => {
  for (const sample of MATH_SAMPLES) {
    const result = evaluateMath(sample.expression, { angleMode: 'deg' })
    assert.equal(result.ok, true, `示例「${sample.label}」求值失败：${result.ok ? '' : result.error}`)
    if (result.ok) assert.ok(Number.isFinite(result.value), `示例「${sample.label}」结果不是有限数`)
  }
})

console.log(`\n${passed} checks passed`)
