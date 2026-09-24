/**
 * SSR 渲染冒烟测试：不依赖 dist，直接验证每个路由都能在 Node 端渲染出关键内容。
 * 用法：npm run smoke
 */
import { renderToString } from 'react-dom/server'
import App from '../src/App.tsx'
import { TOOLS } from '../src/tools/registry.ts'

const EXPECTED: Record<string, string[]> = {
  '/': ['开发者在线工具箱', 'Base64 编解码', '哈希 / MD5 校验', '常见问题'],
  '/base64/': ['Base64 编解码', '自动判断', '① 输入 · 原始文本', '② 输出 · Base64'],
  '/hash/': ['哈希 / MD5 校验', 'MD5', 'SHA-1', 'SHA-256', '校验比对'],
  '/url/': ['URL 编解码', 'encodeURIComponent', '查询参数解析'],
  '/json/': ['JSON 格式化', '压缩一行', '排序键名'],
  '/timestamp/': ['时间戳转换', '当前 Unix 时间戳', 'ISO 8601'],
  '/uuid/': ['UUID 生成', 'UUID v4', '随机字符串'],
  '/jwt/': ['JWT 解析 / 签发', 'Header', 'Payload', '签名算法', '签发', '验签'],
  '/encoding/': ['编码转换', 'HTML 实体', 'Unicode 转义', '进制转换', '字节与文本'],
  '/regex/': ['正则表达式测试', '测试文本', '高亮预览', '替换预览', '常用模式'],
  '/diff/': ['文本对比', '原始文本（A）', '对照文本（B）', '并排视图', '统一视图'],
  '/text/': ['文本变换', '大小写 / 命名风格', '行操作', '工作区', '撤销'],
  '/image/': ['图片压缩', '把图片拖到这里', '输出格式'],
  // 只检查首屏必然存在的内容：转换列表与打包按钮要等用户加入图片后才渲染
  '/image-convert/': ['图片格式转换', '输出格式', '选择图片', '把图片拖到这里', '不改变像素尺寸'],
  '/color/': ['颜色转换', '各格式表示', '配色方案', 'WCAG 对比度检查'],
  '/csv/': ['CSV ⇄ JSON', 'CSV 输入', '第一行是表头', '自动识别'],
  '/xml/': ['XML ⇄ JSON', 'XML 输入', 'JSON 输出', '属性前缀', '文本键名'],
  '/sql/': ['SQL 格式化', 'SQL 输入', '格式化结果', '关键字大小写', '方言说明'],
  '/hmac/': ['HMAC 签名', '待签名的消息', '签名结果', 'HMAC-SHA256'],
  '/cron/': ['Cron 表达式', '字段解析', '接下来 8 次运行时间', '含义'],
  '/subnet/': ['IP 子网计算', '计算结果', '进一步划分子网', '可用地址范围'],
  '/chmod/': ['chmod 权限计算', '按位勾选', '八进制输入', '常见权限速查'],
  '/http/': ['HTTP 状态码', 'MIME 类型', 'Content-Type 速查', 'Not Found'],
  '/units/': ['单位换算', '换算结果', '全部单位', '批量对照'],
  '/math/': ['数学表达式计算器', '表达式', '计算结果', '常用函数', '角度制'],
}

let failures = 0
let total = 0

for (const tool of TOOLS) {
  const html = renderToString(<App path={tool.path} />)
  total += 1

  const required = [
    ...(EXPECTED[tool.path] ?? []),
    `<h1`,
    tool.name,
    tool.faq[0].question,
    tool.about[0].slice(0, 12),
    ...(tool.slug ? ['aria-label="面包屑"'] : []),
  ]

  const missing = required.filter((token) => !html.includes(token))
  if (missing.length > 0) {
    failures += 1
    console.log(`  ✗ ${tool.path} 缺少：${missing.join('、')}`)
  } else {
    console.log(`  ✓ ${tool.path} 渲染正常（${html.length.toLocaleString('en-US')} 字符）`)
  }
}

// 未注册路径必须渲染 404 页面，而不是回落到首页
{
  const html = renderToString(<App path="/__not-found__/" />)
  total += 1
  const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html)?.[1]?.trim() ?? ''
  const ok = h1 === '页面不存在' && html.includes('返回工具箱首页')
  if (!ok) failures += 1
  console.log(
    `${ok ? '  ✓' : '  ✗'} 未知路径渲染 404 页面（h1="${h1}"，${html.length.toLocaleString('en-US')} 字符）`,
  )
}

if (failures > 0) {
  console.error(`\nSSR 冒烟测试失败：${failures}/${total} 个路由有问题`)
  process.exit(1)
}

console.log(`\nSSR 冒烟测试通过：${total} 个路由全部渲染正常`)
