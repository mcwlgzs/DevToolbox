# DevToolbox · 开发者在线工具箱

23 个高频开发小工具，全部运行在浏览器本地。输入内容不发送到任何服务器，页面加载完成后断网也能继续使用。

> 工具选型参考了 [it-tools](https://github.com/CorentinTh/it-tools)（约 3 万 star）的公开清单，优先补齐其中「纯前端可完成、可测试」的高频项。

## 工具一览

| 分类 | 路由 | 工具 | 说明 |
| --- | --- | --- | --- |
| 编码 / 转换 | `/base64/` | Base64 编解码 | 文本 / 文件 / Data URL 互转，标准与 URL-Safe，MIME 换行 |
| | `/url/` | URL 编解码 | encodeURIComponent / encodeURI、查询参数解析成表格 |
| | `/encoding/` | 编码转换 | HTML 实体、Unicode 转义、2–36 进制大整数互转、GBK / Big5 字节解码 |
| 格式 / 校验 | `/json/` | JSON 格式化 | 美化 / 压缩 / 排序键名 / 转义、语法错误定位到行列 |
| | `/csv/` | CSV ⇄ JSON | 双向互转，正确处理引号内的逗号与换行 |
| | `/xml/` | XML ⇄ JSON | 双向互转，属性 `@` 前缀 / 文本键名 / 数组策略可调 |
| | `/sql/` | SQL 格式化 | 子句换行缩进、关键字大小写、压缩；字符串与注释原样保留 |
| | `/hash/` | 哈希 / MD5 校验 | 文本、单文件、整目录批量、重复检测、两份清单比对 |
| | `/hmac/` | HMAC 签名 | HMAC-SHA256 / SHA-1 / MD5，密钥支持 HEX 与 Base64 |
| | `/jwt/` | JWT 解析 / 签发 | 解析 Header / Payload，HS256 本地签发与验签，检查 exp / nbf |
| 文本处理 | `/regex/` | 正则表达式测试 | 实时高亮、捕获组、替换预览、12 组常用模式 |
| | `/diff/` | 文本对比 | 逐行 Diff，并排与 unified 视图，导出 .patch |
| | `/text/` | 文本变换 | 10 种命名风格、排序去重、行操作、字数统计、可撤销 |
| 图片 / 颜色 | `/image/` | 图片压缩 | 本地 Canvas 缩放与 JPEG / PNG / WebP 转换 |
| | `/color/` | 颜色转换 | HEX / RGB / HSL / HSV 互转、色阶、配色、WCAG 对比度 |
| 时间 / 生成 | `/timestamp/` | 时间戳转换 | 秒毫秒自动识别，UTC / 本地 / 星期 / 相对时间 |
| | `/cron/` | Cron 表达式 | 字段展开、中文含义、接下来 8 次运行时间 |
| | `/uuid/` | UUID 生成 | 批量 UUID v4、随机密码与字符串，熵估算 |
| 计算 / 换算 | `/units/` | 单位换算 | 13 类单位一次列出全部结果，含温度仿射换算与批量对照 |
| | `/math/` | 数学表达式计算器 | 29 个函数与常量、幂 / 阶乘 / 三角函数，不用 eval |
| 网络 / 系统 | `/subnet/` | IP 子网计算 | CIDR / 掩码换算、可用地址范围、子网划分 |
| | `/chmod/` | chmod 权限计算 | 八进制 ⇄ rwx ⇄ 符号写法，含 SUID / SGID / Sticky |
| | `/http/` | HTTP 状态码 | 1xx–5xx 状态码与 80+ MIME 类型速查，支持搜索 |

## 界面

- **左侧分类侧边栏**：宽屏下常驻，按分类分组列出全部工具；顶栏有收起 / 展开按钮，状态记在 `localStorage`，窄屏则折叠为顶栏弹出菜单。
- **Ctrl / ⌘ + K 命令面板**：搜索名称、简介与关键词，↑↓ 选择、回车打开、Esc 关闭。
- **最近使用**：记录最近 5 个工具，存 `localStorage`，可一键清空。
- **首屏即用**：工具标题、面包屑与操作区同屏；1440×900 下首个可操作元素位于 77–330px。

## 技术栈

| 层 | 选型 |
| --- | --- |
| 构建 | [Vite 8](https://vite.dev/)（生产构建附带**多路由预渲染**） |
| UI 框架 | [React 19](https://react.dev/) |
| 类型 | TypeScript 6（`strict`、`verbatimModuleSyntax`、`erasableSyntaxOnly`） |
| 样式 | [Tailwind CSS v4](https://tailwindcss.com/)（`@tailwindcss/vite` 插件，CSS-first，无 config 文件） |
| 组件 | [shadcn/ui](https://ui.shadcn.com/)（new-york / zinc，基于 `radix-ui` 统一包） |
| 图标 | [lucide-react](https://lucide.dev/) |
| 路由 | 自研极简 history 路由（约 90 行，零依赖，可 SSR） |
| 检查 | [oxlint](https://oxc.rs/) |

**运行时零业务依赖**：编解码、哈希、随机数、路由全部自己实现，只用到平台 API。

## 开始使用

```bash
npm install
npm run dev        # http://localhost:5173
```

## 脚本

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 开发服务器（HMR） |
| `npm run build` | `tsc -b` + `vite build` + **预渲染 25 个路由**，产物在 `dist/` |
| `npm run build:spa` | 跳过预渲染，仅用于对比排查 hydration 问题 |
| `npm run preview` | 预览生产构建（`vite preview` 支持目录 index 路由） |
| `npm run lint` | oxlint 静态检查 |
| `npm run test` | 编解码 / 哈希 / 清单 / 颜色 / 编码 / diff / 文本 / 正则 / 单位 / XML / SQL / 数学 / Cron / JWT 自检，共 175+ 项断言（Node 原生运行 `.mts`，无测试框架） |
| `npm run smoke` | 25 个路由的 SSR 渲染冒烟 |
| `node scripts/hash-constants.mts` | 重新推导 SHA-256 常量表，用于核对 |

## SEO

单页应用默认只有一个空的 `<div id="root">`，爬虫抓不到任何正文。本项目在构建期把**每个路由**预渲染成独立静态 HTML：

| 项 | 实现 |
| --- | --- |
| 静态正文 | `scripts/prerender.tsx` 对注册表里的每个工具执行 `renderToString(<App path=… />)`，分别写入 `dist/index.html` 与 `dist/<slug>/index.html`（每个 45–115 KB） |
| 每路由独立元信息 | 预渲染脚本替换 `index.html` 中 `<!-- seo:start -->` … `<!-- seo:end -->` 区块，写入该路由的 `<title>`、description、keywords、canonical、OG、Twitter |
| 结构化数据 | 每页 JSON-LD `@graph`：`WebApplication` + `WebPage` + `BreadcrumbList` + `FAQPage`（FAQ 文本与页面可见内容一致） |
| 语义结构 | 每页唯一 `h1`、分区 `h2`、FAQ 用 `h3`；FAQ 与正文在工具下方，不阻挡操作 |
| 内链 | 顶栏导航、首页工具卡片、页脚工具链接全部是真实 `<a href>`，爬虫可遍历全部 23 个工具，侧边栏与命令面板仍保留原生 `<a href>` |
| 爬虫文件 | `robots.txt` 与 `sitemap.xml`（含首页与 23 个工具，共 24 个 URL；404 不收录）由预渲染脚本生成 |
| 404 处理 | 生成 `dist/404.html`（`noindex`，不进入 sitemap）；客户端路由对未知路径渲染 404 页面 |
| 客户端接管 | `main.tsx` 比对 `<html data-prerender>` 与当前地址：一致才 `hydrateRoot`，否则 `createRoot` 完整渲染 |
| 可见面包屑 | 工具页有「全部工具 › 工具名」面包屑，与 JSON-LD 的 `BreadcrumbList` 一一对应 |
| 单一数据源 | `src/tools/registry.ts` 同时驱动导航、卡片、`<title>`、description、canonical、JSON-LD 与 sitemap，UI 与 SEO 不可能不一致 |

### 实测指标

| 项 | 数值 |
| --- | --- |
| 每页 title | 34–49 字 |
| 每页 description | 66–90 字（百度约显示 78 字） |
| 每页 `<h1>` | 恰好 1 个 |
| 每页正文（去标签） | 1,050–1,680 字 |
| 每页内链 | 10 个唯一站内链接 |
| 预渲染 HTML | 45–115 kB / 页 |
| JS | 764 kB（gzip 232 kB），**所有路由共用同一文件**，首次访问后全站命中缓存 |
| CSS | 64 kB（gzip 11 kB） |

### 部署前必做

`canonical`、`og:url`、`og:image`、`sitemap.xml` 都基于 `VITE_SITE_URL`。**占位值不改会指向错误域名，反而伤害 SEO**：

```bash
# .env.local（不提交版本库）或直接修改 .env
VITE_SITE_URL=https://your-domain.com
```

`npm run build` 会在域名仍是 `example.com` 时打印警告。

### 静态托管配置

产物是目录式多页站点（`/hash/` → `dist/hash/index.html`），并且带一个 `dist/404.html`。

| 托管 | 配置 |
| --- | --- |
| Netlify / Cloudflare Pages / GitHub Pages | 无需配置，自动使用 `404.html` 并返回 404 状态码 |
| Nginx | `try_files $uri $uri/ =404;` + `error_page 404 /404.html;` |
| Apache | `.htaccess` 里 `ErrorDocument 404 /404.html` |
| Vercel | 默认会回退到 `index.html`；如需真实 404 需配置 `routes`，或在 `vercel.json` 中设置 `"cleanUrls": true` 并保留 `404.html` |

> **为什么在意这件事**：如果托管方把未知路径回退成 `index.html`，非 JS 爬虫（尤其是百度）会拿到首页的 HTML 与 canonical，形成软 404。`main.tsx` 的 `data-prerender` 比对能保证**执行 JS 的客户端不会因内容不一致而 hydration 崩溃**，但静态响应本身的 404 状态码仍需要托管方配合。

## 目录结构

```
src/
├── App.tsx                     # 路由表 + 页面骨架 + SEO 同步
├── router/
│   ├── context.ts              # RouterContext 与 useRouter
│   ├── router.tsx              # RouterProvider（支持传入固定 path 以便预渲染）
│   └── link.tsx                # Link：拦截左键做客户端跳转，保留 Ctrl+点击等原生行为
├── tools/
│   ├── registry.ts             # ★ 全站单一数据源：路由、分类、标题、描述、关键词、正文、FAQ
│   ├── base64-tool.tsx         # 23 个工具页
│   ├── hash-tool.tsx           #   哈希页外壳（三个常驻面板，切换不丢状态）
│   ├── hash-single-panel.tsx   #     文本 / 单个文件
│   ├── hash-batch.tsx          #     批量计算与重复检测
│   ├── hash-manifest.tsx       #     清单比对
│   ├── encoding-tool.tsx       #   编码转换（HTML 实体 / Unicode / 进制 / 字节）
│   ├── regex-tool.tsx          #   正则测试
│   ├── diff-tool.tsx           #   文本对比
│   ├── text-tool.tsx           #   文本处理
│   ├── image-tool.tsx          #   图片压缩
│   ├── color-tool.tsx          #   颜色转换
│   ├── xml-tool.tsx            #   XML ⇄ JSON
│   ├── sql-tool.tsx            #   SQL 格式化 / 压缩
│   ├── units-tool.tsx          #   单位换算
│   ├── math-tool.tsx           #   数学表达式计算器
│   ├── url-tool.tsx
│   ├── json-tool.tsx
│   ├── csv-tool.tsx
│   ├── timestamp-tool.tsx
│   ├── uuid-tool.tsx
│   ├── hmac-tool.tsx
│   ├── cron-tool.tsx
│   ├── subnet-tool.tsx
│   ├── chmod-tool.tsx
│   ├── http-tool.tsx
│   └── jwt-tool.tsx            #   解析 / 签发 / 验签三个页签
├── components/
│   ├── tool-shell.tsx          # 工具页外壳 + ContentSection（正文与 FAQ）+ 首页分组
│   ├── tool-sidebar.tsx        # 宽屏分类侧边栏（含最近使用）
│   ├── tool-search.tsx         # Ctrl+K 命令面板
│   ├── site-header.tsx         # 顶栏（搜索 + 窄屏弹出菜单 + 主题）
│   ├── tool-icons.tsx
│   ├── text-workbench.tsx      # Base64 文本工作区
│   ├── file-workbench.tsx      # Base64 文件工作区
│   ├── encode-options.tsx      # 变体 / 编码 / 换行 / 填充选项
│   ├── io-panel.tsx            # 通用输入输出面板（错误与告警）
│   ├── copy-button.tsx         # 带“已复制”反馈
│   ├── stat.tsx                # 统计卡片
│   ├── theme-toggle.tsx
│   └── ui/                     # shadcn/ui 生成组件
├── hooks/
│   ├── use-theme.ts
│   ├── use-copy.ts
│   ├── use-hydrated.ts         # 区分 SSR 与 hydration 阶段（useSyncExternalStore）
│   ├── use-now.ts              # 全局共享时钟，每秒更新且 hydration 安全
│   └── use-recent-tools.ts     # 最近使用（localStorage + useSyncExternalStore）
├── lib/
│   ├── base64.ts               # Base64 编解码核心
│   ├── hash.ts                 # MD5 / SHA-1 / SHA-256：增量式 + 一次性入口
│   ├── manifest.ts             # 哈希清单解析 / 导出 / 比对
│   ├── files.ts                # 拖拽与文件夹递归收集
│   ├── regex.ts                # 正则执行、高亮、替换与模式库
│   ├── diff.ts                 # 行级 Diff（LCS，超限自动降级）
│   ├── text-transform.ts       # 大小写、行操作、排序去重、统计
│   ├── color.ts                # 颜色解析转换、色阶、WCAG 对比度
│   ├── encoding.ts             # HTML 实体 / Unicode / 进制 / 多字符集解码
│   ├── image.ts                # Canvas 缩放与格式转换
│   ├── random.ts               # UUID v4、无模偏差随机串、熵估算
│   ├── units.ts                # 13 类单位定义与仿射换算、数值格式化
│   ├── xml.ts                  # 手写 XML 解析器与 XML ⇄ JSON 映射
│   ├── sql.ts                  # SQL 分词、格式化与压缩（不改写字符串 / 注释）
│   ├── math-eval.ts            # 数学表达式：调度场算法转逆波兰后求值（不用 eval）
│   ├── jwt.ts                  # JWT 的 Base64URL、HS256 签发与定长比较验签
│   ├── seo.ts                  # 客户端路由切换时同步 head
│   ├── format.ts               # 字节格式化、剪贴板、下载、预览截断
│   └── utils.ts                # cn()
└── index.css                   # Tailwind v4 + shadcn 主题变量

public/
├── favicon.svg
└── og-image.png                # 1200×630 社交分享图

scripts/
├── prerender.tsx               # 多路由预渲染 + robots/sitemap 生成
├── ssr-smoke.tsx               # 25 路由 SSR 冒烟
├── base64.test.mts             # Base64 自检
├── hash.test.mts               # 哈希自检（官方向量 + node:crypto 交叉验证 + 增量/流式）
├── manifest.test.mts           # 清单解析 / 导出 / 比对自检
├── tools.test.mts              # 颜色 / 编码 / diff / 文本 / 正则自检
├── toolkit.test.mts            # 颜色 / 编码 / cron / 子网 / chmod / 图片等自检
├── toolkit2.test.mts           # 单位 / XML / SQL / 数学自检（含 SQL 安全红线用例）
├── jwt.test.mts                # JWT 自检（jwt.io 官方示例逐字节比对 + 篡改检测）
└── hash-constants.mts          # SHA-256 常量表推导脚本
```

## 实现要点

**哈希（`src/lib/hash.ts`）**
- MD5、SHA-1、SHA-256 全部为纯 JavaScript 实现：`crypto.subtle` 只在安全上下文（HTTPS / localhost）可用，用 `file://` 直接打开页面时会缺失，纯 JS 保证任何环境都能算。
- 提供两套入口：一次性（`hashBytes` / `hashBytesSync`）与**增量式**（`createHasher().update(chunk).digest()`）。
- 文件走增量式流式读取，默认 **4 MB 一片**，内存占用与文件大小无关：82 MB / 4 个文件 / 三种算法实测耗时 2.1 s，强制 GC 后 JS 堆仅 26 MB（其中最大单文件 60 MB）。
- 一次读取同时喂给多个算法，多算一种算法的成本远低于重复读盘。
- 在 HTTPS 环境下，内存中的数据（文本、小文件）会自动改用 Web Crypto 加速，两条路径结果一致（测试覆盖）。
- MD5 的 64 个常量按 RFC 1321 定义在运行时由 `Math.floor(abs(sin(i+1)) * 2^32)` 生成，杜绝手敲错误；SHA-256 的 K / H 表由 `scripts/hash-constants.mts` 用 BigInt 整数方根推导，与 FIPS 180-4 完全一致。
- 正确性由三层测试保证：官方测试向量、与 `node:crypto` 对 0–130 全部长度及 1 MB 随机数据交叉验证、增量更新在随机切分点/逐字节喂入/流式 7 字节切片下与一次性结果一致。

**清单与批量（`src/lib/manifest.ts` / `src/tools/hash-batch.tsx`）**
- 清单解析兼容三种格式：GNU coreutils（`md5sum` / `sha256sum` / `certutil` 输出，含二进制模式 `*` 前缀）、带表头的 CSV（本工具导出格式，正确处理引号内逗号）、以及 `文件名 哈希` 的松散格式；算法由哈希长度推断（32 → MD5，40 → SHA-1，64 → SHA-256）。
- 比对结果区分「内容变更 / 新增 / 缺失 / 一致 / 缺少该算法」，不会把「某一侧没算这个算法」误判成内容变更。
- 批量模式支持拖入整个文件夹（`webkitGetAsEntry` 递归）与文件夹选择器，按虚拟路径去重排序；相同哈希即内容完全相同，可直接筛出重复文件。
- 导出同时提供 CSV 与 `sha256sum -c` 可直接校验的清单。

**单位 / XML / SQL / 数学 / JWT（`src/lib/units.ts`、`xml.ts`、`sql.ts`、`math-eval.ts`、`jwt.ts`）**
- **单位**：13 类单位统一用 `factor + offset` 描述，温度这类「先加偏移再乘倍率」的仿射换算不需要单开分支；结果按数量级自动在普通小数与科学计数法之间选择并去掉尾随 0。
- **XML**：解析器手写，不依赖浏览器的 `DOMParser`，因此既能在 Node 里跑测试，也能给出精确到行列的错误位置；映射采用业界通用约定（属性前缀 `@`、文本键 `#text`、同名元素聚合为数组），前缀可改。
- **SQL**：先完整分词再排版，字符串、反引号 / 方括号标识符、`--` `#` `/* */` 注释一律作为整体保留，关键字大小写只作用于未加引号的单词。压缩同样基于 token 而不是正则——早期版本用正则收尾，会把 `'a , b'` 这类字符串内容一起改写，现在是红线用例。
- **数学**：调度场算法转逆波兰后栈式求值，完全不使用 `eval` / `new Function`；幂右结合（`2^3^2 = 512`）、一元负号低于幂（`-2^2 = -4`），指数位置的负号则属于指数本身（`2^-1 = 0.5`）。
- **JWT**：只做 HS256，因为项目内的纯 JS 哈希实现覆盖 MD5 / SHA-1 / SHA-256，没有 SHA-384 / SHA-512 与非对称算法——与其给出点了就报错的选项，不如只提供能真正算准的一种。签发结果与 jwt.io 官方示例逐字节一致；验签用定长比较，避免逐字符提前返回泄露前缀信息。

**预渲染与 hydration**
- 所有可能产生服务端/客户端差异的内容都被隔离：主题图标用 `useHydrated()`（`useSyncExternalStore` 的 server snapshot）推迟到 hydration 之后；随机 UUID 在 `useMemo` 中依赖 `hydrated`；实时时钟用 `use-now.ts` 的 server snapshot 返回 0；「最近使用」用同样的外部存储模式；哈希页的非默认标签面板在 hydration 之后才挂载。
- `<html data-prerender="…">` 记录每个静态文件对应的路由。客户端地址与它不一致时（典型场景：托管方把未知路径回退到 `index.html`）改用 `createRoot` 完整渲染，而不是硬 hydrate——否则服务端是首页、客户端是 404，会触发 React #418。
- **注意 `String.replace` 的替换串陷阱**：注入预渲染 HTML 时必须用函数式替换 `html.replace(marker, () => injected)`。字符串替换串里的 `$&`、`$'`、`` $` ``、`$1` 都是特殊模式——页面文案里出现 `$&`（例如正则工具的占位符说明）时会被替换成匹配到的标记，把产物 HTML 污染掉，并直接导致 hydration 失败。预渲染脚本现在会在每次注入后断言 `#root` 恰好出现一次。
- 实测 24 个路由（23 个工具页 + 首页）与 404 页均无 hydration 告警与未捕获异常（无头 Edge + CDP 逐页实测，含页签切换与输入联动）。

**性能与安全**
- 字节 → 二进制字符串按 32 KB 分块，避免 `String.fromCharCode(...bytes)` 触发调用栈溢出；超过 200,000 字符的输出只在 DOM 中截断预览，"复制"仍是完整数据。
- 随机串使用 `crypto.getRandomValues` 并用拒绝采样消除模偏差；图片单张上限约 4000 万像素，Base64 单文件上限 32 MB（哈希工具无限制）。
- 正则设 2000 条匹配上限、Diff 设 400 万单元格上限，避免超大输入卡死页面。

**健壮性边界（都写在代码里，不是靠"应该不会发生"）**

上线前做了一轮对抗性审查，下面这些是当时发现并修掉的真问题，现在都有回归测试兜着：

| 风险 | 处理方式 |
| --- | --- |
| **灾难性回溯（ReDoS）** | `(a+)+$` 这类嵌套量词在 32 个字符上就能把主线程占满几十秒，而 JS 的正则**无法在单次 `exec` 内中断**，任何"匹配次数上限"都拦不住。因此在 `runRegex` 与 `replaceWithRegex` 入口用 `findCatastrophicRisk()` 静态识别嵌套无上界量词与重复分支（`(a|a)*`），直接拒绝执行并说明原因；`(\d+)?`、`(?:GET|POST)+` 这类合法写法不会被误伤。 |
| **XML 深嵌套爆栈** | 解析与序列化都是递归的，几千层会把调用栈打爆成未捕获的 `RangeError`。现在 `parseXml` / `jsonToXml` 在 200 层处主动报错，四个递归函数都不再有崩溃路径。 |
| **渲染期未捕获异常** | `src/components/error-boundary.tsx` 提供了根级错误边界，按路由 key 隔离：某一个工具崩了只影响它自己，并给出"重试"与错误信息，而不是整页白屏。 |
| **localStorage 不可用** | 禁用站点数据时访问 `localStorage` 本身就会抛 `SecurityError`。主题与"最近使用"的读写全部包在 try/catch 里，不会让首次渲染失败。 |
| **拖错位置丢数据** | 只给拖拽区加 `onDrop` 是不够的：文件在页面其它位置松手，浏览器会默认用该文件替换当前页面。`Shell` 上挂着全局 `dragover` / `drop` 兜底，统一取消默认行为。 |
| **PostgreSQL `$$` 字符串** | 美元引用字符串曾被当成普通单词重新排版，等于改写要写进库的内容。现在 tokenizer 把 `$$...$$` / `$tag$...$tag$` 整体吞掉，格式化与压缩都逐字节保真（安全红线用例）。 |
| **SQL 压缩改写字符串** | 压缩完全基于 token 生成。早期版本用正则收尾清标点，`'a , b'` 会被改成 `'a,b'`——这是数据破坏，现在是回归测试。 |
| **静默算错** | 数学工具里 `1_000`、`1.2.3`、`1 000` 以前会被拆成两个数字触发隐式乘法，静默得到 0 / 0.36 / 0；`round(1.005,2)` 受浮点表示影响得到 1 而不是 1.01。现在都改为精确计算或明确报错。 |
| **原型链查表** | `decodeHtmlEntities('&constructor;')` 曾返回 `function Object() { [native code] }`。实体表、MIME 扩展名表、哈希列名表等全部改用 `Object.hasOwn`。 |
| **死循环** | `groupDigits(digits, 0)` 的 `i -= 0` 是真正的死循环；`runRegex` 的零长度匹配前进、Diff 的上限降级、Cron 的"永不成立表达式"都有对应保护。 |
| **输入判定自相矛盾** | Base64 工具的方向与徽章曾用两个不同谓词，出现过"标着疑似 Base64 却把它再编码一次"。现在两者共用 `analyzeInput()` 这一个来源。 |
| **Base64 误判** | 原先「长度 ≥ 44 且大小写混排」就判为 Base64，`thisIsALongCamelCaseIdentifierUsedAsATestValue` 这类普通标识符会被解成乱码（随机字母数字串誤判率约 28%）。现在必须出现 `+ / = - _` 这类 Base64 专有符号才认。 |
| **Latin-1 名不副实** | 浏览器按 WHATWG 标准把 `TextDecoder('iso-8859-1')` 实现为 windows-1252，而编码端按真 Latin-1 取值，同一个 `€` 编出来是 `?`、解回来却是 `€`。现在编码端补上 windows-1252 的 0x80–0x9F 映射表，标签也如实写成「Latin-1 / Windows-1252」。 |
| **去行号吃掉正文** | 「去掉行号」的正则把分隔符写成可选，`2024 was a year` 会被剥成 `was a year`。现在要求分隔符（`. ) : 、`）真实存在。 |
| **cron 的日 / 周语义** | crontab(5) 规定两个字段「都不是 `*`」时取「或」。之前用「是否覆盖全部取值」判断，`0 0 1-31 * 1` 被当成另一种语义，比服务器上少跑。现在按写法判断，说明文字与匹配逻辑共用同一套规则。 |
| **夏令时漏跑** | 春季跳进时被跳过的那一小时并不存在，`setHours` 会把它规范化到下一小时，之前的实现会把**一整天**的任务丢掉。现在照 Vixie 的做法在跳变后补跑（整点与非整点都覆盖）。 |
| **零散解析缺陷** | `parseByteInput('41%42')` 会静默丢掉 `41`；`convertBase('-0xff')` 返回 null、`('0b1010', 16)` 误剥前缀；`hexToBytes('0x41')` 与 `hmac.parseKey` 行为不一致；`computeTargetSize` 遇到非法缩放会产出 `NaN` 并流到界面上；数学里 `sqrt(1,)` 被算成两个参数；XML 的 DOCTYPE 扫描遇到注释/引号里的 `]` 会提前结束；JWT 的 `alg: 'hs256'` 通过校验却不提示写法不合规。以上都已修正并补了回归测试。 |

**已知取舍（有意为之，不是遗漏）**
- Base64 的"自动判断"本质上无法 100% 准确：像 `YQ==` 这种极短、或纯字母数字且不带 `+ / = - _` 的长串，既可能是 Base64 也可能是普通文本。本工具在两种情况下都按文本处理（宁可让用户手动切换，也不把内容解成乱码），三个方向卡片一直可见。
- JWT 只做 HS256：项目内的纯 JS 哈希没有 SHA-384 / SHA-512 与非对称算法，与其给出点了就报错的选项，不如只做能算准的一种。
- SQL 格式化会把未加引号的关键字转成大写（`int`、`not`、`null` 作为列名时也会变），这是所有关键字大小写转换器的共同行为；如果你的方言里存在大小写敏感的未加引号标识符，请把「关键字大小写」设为「保持原样」。


**Tailwind v4 CSS-first**
- 主题变量定义在 `src/index.css` 的 `:root` / `.dark`，经 `@theme inline` 暴露为工具类，无 `tailwind.config.js`。
- `index.html` 内联脚本在首屏绘制前根据 `localStorage` / 系统偏好确定深浅色，`useTheme` 再接管状态，无闪烁。

**首屏即用**
- 标题与工具主体同屏：1440×900 下首个可操作元素位于 77–330px，无需滚动；文本类工具的输入框自动聚焦，打开即可粘贴。
- 换工具不需要回到顶栏：宽屏点侧边栏、任意屏幕按 Ctrl / ⌘ + K 搜索。
