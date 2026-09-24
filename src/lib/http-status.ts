/** HTTP 状态码与常见 MIME 类型速查数据。 */

export type StatusCategory = '1xx' | '2xx' | '3xx' | '4xx' | '5xx'

export interface HttpStatusEntry {
  code: number
  name: string
  description: string
  category: StatusCategory
  /** 使用注意或常见踩坑点 */
  note?: string
}

export const STATUS_CATEGORIES: ReadonlyArray<{ id: StatusCategory; name: string; meaning: string }> = [
  { id: '1xx', name: '1xx 信息', meaning: '请求已收到，需要继续处理' },
  { id: '2xx', name: '2xx 成功', meaning: '请求已成功被接收、理解并处理' },
  { id: '3xx', name: '3xx 重定向', meaning: '需要进一步操作才能完成请求' },
  { id: '4xx', name: '4xx 客户端错误', meaning: '请求有语法错误或无法完成' },
  { id: '5xx', name: '5xx 服务端错误', meaning: '服务器在处理请求时发生错误' },
]

export const HTTP_STATUSES: readonly HttpStatusEntry[] = [
  { code: 100, name: 'Continue', description: '客户端应继续发送请求体', category: '1xx' },
  { code: 101, name: 'Switching Protocols', description: '服务器同意切换协议，如升级到 WebSocket', category: '1xx' },
  { code: 102, name: 'Processing', description: '服务器已收到请求但尚未完成处理（WebDAV）', category: '1xx' },
  { code: 103, name: 'Early Hints', description: '在最终响应前提前返回部分响应头，用于预加载资源', category: '1xx' },

  { code: 200, name: 'OK', description: '请求成功，响应体包含结果', category: '2xx' },
  { code: 201, name: 'Created', description: '资源创建成功，通常用于 POST 后', category: '2xx', note: '建议在 Location 头返回新资源地址' },
  { code: 202, name: 'Accepted', description: '请求已接受但尚未处理完成，适合异步任务', category: '2xx' },
  { code: 204, name: 'No Content', description: '处理成功但不返回响应体', category: '2xx', note: '常用于 DELETE、PUT；响应不能带 body' },
  { code: 206, name: 'Partial Content', description: '返回部分内容，用于断点续传与视频拖动', category: '2xx', note: '需配合 Range / Content-Range 头' },

  { code: 301, name: 'Moved Permanently', description: '资源永久转移到新地址', category: '3xx', note: '浏览器与搜索引擎会缓存，慎重使用' },
  { code: 302, name: 'Found', description: '资源临时转移，后续仍用原地址', category: '3xx', note: '历史实现可能把 POST 改成 GET' },
  { code: 303, name: 'See Other', description: '用 GET 访问另一个地址查看结果', category: '3xx', note: 'PRG 模式（POST-Redirect-GET）常用' },
  { code: 304, name: 'Not Modified', description: '资源未变化，直接用本地缓存', category: '3xx', note: '配合 ETag / If-None-Match 协商缓存' },
  { code: 307, name: 'Temporary Redirect', description: '临时重定向且保持原请求方法', category: '3xx' },
  { code: 308, name: 'Permanent Redirect', description: '永久重定向且保持原请求方法', category: '3xx' },

  { code: 400, name: 'Bad Request', description: '请求语法错误或参数不合法', category: '4xx' },
  { code: 401, name: 'Unauthorized', description: '未认证，需要先登录', category: '4xx', note: '语义上是「未认证」，不是「无权限」' },
  { code: 402, name: 'Payment Required', description: '需要付费（保留状态码）', category: '4xx' },
  { code: 403, name: 'Forbidden', description: '已认证但无权访问该资源', category: '4xx', note: '不要在 403 里暴露资源是否存在' },
  { code: 404, name: 'Not Found', description: '请求的资源不存在', category: '4xx' },
  { code: 405, name: 'Method Not Allowed', description: '该资源不支持此 HTTP 方法', category: '4xx', note: '应返回 Allow 头列出支持的方法' },
  { code: 406, name: 'Not Acceptable', description: '无法满足 Accept 头要求的响应格式', category: '4xx' },
  { code: 408, name: 'Request Timeout', description: '服务器等待请求超时', category: '4xx' },
  { code: 409, name: 'Conflict', description: '请求与资源当前状态冲突', category: '4xx', note: '并发更新冲突、唯一键重复常用' },
  { code: 410, name: 'Gone', description: '资源曾存在但已被永久删除', category: '4xx', note: '比 404 更明确，利于搜索引擎移除索引' },
  { code: 411, name: 'Length Required', description: '缺少 Content-Length 头', category: '4xx' },
  { code: 412, name: 'Precondition Failed', description: '请求头中的前置条件不成立', category: '4xx' },
  { code: 413, name: 'Content Too Large', description: '请求体超过服务器允许的大小', category: '4xx', note: '文件上传报错常见原因' },
  { code: 414, name: 'URI Too Long', description: '请求的 URL 过长', category: '4xx' },
  { code: 415, name: 'Unsupported Media Type', description: '请求体的内容类型不被支持', category: '4xx', note: '接口要求 JSON 但发了表单时常见' },
  { code: 416, name: 'Range Not Satisfiable', description: 'Range 头指定的范围无法满足', category: '4xx' },
  { code: 418, name: "I'm a teapot", description: '愚人节彩蛋状态码（HTCPCP/1.0）', category: '4xx' },
  { code: 422, name: 'Unprocessable Content', description: '语法正确但语义校验失败', category: '4xx', note: '表单字段校验失败常用' },
  { code: 425, name: 'Too Early', description: '服务器不愿处理可能被重放的请求', category: '4xx' },
  { code: 428, name: 'Precondition Required', description: '要求请求带上条件头以避免并发覆盖', category: '4xx' },
  { code: 429, name: 'Too Many Requests', description: '请求过于频繁，被限流', category: '4xx', note: '通常配合 Retry-After 头' },
  { code: 431, name: 'Request Header Fields Too Large', description: '请求头过大', category: '4xx', note: 'Cookie 过多时会触发' },

  { code: 500, name: 'Internal Server Error', description: '服务器内部错误', category: '5xx', note: '不要把堆栈信息返回给客户端' },
  { code: 501, name: 'Not Implemented', description: '服务器不支持该请求方法', category: '5xx' },
  { code: 502, name: 'Bad Gateway', description: '网关或代理从上游收到无效响应', category: '5xx', note: '后端进程崩溃时 Nginx 常见' },
  { code: 503, name: 'Service Unavailable', description: '服务暂时不可用，通常是过载或维护', category: '5xx', note: '应配合 Retry-After' },
  { code: 504, name: 'Gateway Timeout', description: '网关等待上游响应超时', category: '5xx' },
  { code: 505, name: 'HTTP Version Not Supported', description: '不支持请求使用的 HTTP 版本', category: '5xx' },
  { code: 507, name: 'Insufficient Storage', description: '服务器存储空间不足（WebDAV）', category: '5xx' },
  { code: 508, name: 'Loop Detected', description: '检测到无限循环（WebDAV）', category: '5xx' },
]

export interface MimeEntry {
  type: string
  description: string
  category: string
  extension: string
}

export const MIME_TYPES: readonly MimeEntry[] = [
  { type: 'text/plain', description: '纯文本', category: '文本', extension: '.txt' },
  { type: 'text/html', description: 'HTML 网页', category: '文本', extension: '.html' },
  { type: 'text/css', description: 'CSS 样式表', category: '文本', extension: '.css' },
  { type: 'text/csv', description: '逗号分隔表格', category: '文本', extension: '.csv' },
  { type: 'text/markdown', description: 'Markdown 文档', category: '文本', extension: '.md' },
  { type: 'text/xml', description: 'XML 文档', category: '文本', extension: '.xml' },
  { type: 'text/event-stream', description: 'SSE 服务器推送事件', category: '文本', extension: '' },
  { type: 'text/javascript', description: 'JavaScript（旧写法）', category: '文本', extension: '.js' },

  { type: 'application/json', description: 'JSON 数据', category: '应用', extension: '.json' },
  { type: 'application/ld+json', description: 'JSON-LD 结构化数据', category: '应用', extension: '.jsonld' },
  { type: 'application/xml', description: 'XML 数据', category: '应用', extension: '.xml' },
  { type: 'application/javascript', description: 'JavaScript 脚本', category: '应用', extension: '.js' },
  { type: 'application/pdf', description: 'PDF 文档', category: '应用', extension: '.pdf' },
  { type: 'application/zip', description: 'ZIP 压缩包', category: '应用', extension: '.zip' },
  { type: 'application/gzip', description: 'GZIP 压缩包', category: '应用', extension: '.gz' },
  { type: 'application/x-tar', description: 'TAR 归档', category: '应用', extension: '.tar' },
  { type: 'application/wasm', description: 'WebAssembly 模块', category: '应用', extension: '.wasm' },
  { type: 'application/octet-stream', description: '未知二进制流（强制下载）', category: '应用', extension: '.bin' },
  { type: 'application/x-www-form-urlencoded', description: '表单提交（键值对）', category: '应用', extension: '' },
  { type: 'application/x-ndjson', description: '换行分隔的 JSON 流', category: '应用', extension: '.ndjson' },
  { type: 'application/vnd.api+json', description: 'JSON:API 规范', category: '应用', extension: '' },
  { type: 'application/vnd.ms-excel', description: 'Excel 97-2003 表格', category: '应用', extension: '.xls' },
  { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', description: 'Excel 工作簿', category: '应用', extension: '.xlsx' },
  { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', description: 'Word 文档', category: '应用', extension: '.docx' },
  { type: 'application/x-font-ttf', description: 'TrueType 字体', category: '应用', extension: '.ttf' },
  { type: 'application/x-7z-compressed', description: '7-Zip 压缩包', category: '应用', extension: '.7z' },
  { type: 'application/vnd.rar', description: 'RAR 压缩包', category: '应用', extension: '.rar' },

  { type: 'image/jpeg', description: 'JPEG 图片', category: '图片', extension: '.jpg' },
  { type: 'image/png', description: 'PNG 图片（支持透明）', category: '图片', extension: '.png' },
  { type: 'image/gif', description: 'GIF 动图', category: '图片', extension: '.gif' },
  { type: 'image/webp', description: 'WebP 图片', category: '图片', extension: '.webp' },
  { type: 'image/avif', description: 'AVIF 图片', category: '图片', extension: '.avif' },
  { type: 'image/svg+xml', description: 'SVG 矢量图', category: '图片', extension: '.svg' },
  { type: 'image/x-icon', description: '网站图标', category: '图片', extension: '.ico' },
  { type: 'image/bmp', description: 'BMP 位图', category: '图片', extension: '.bmp' },
  { type: 'image/tiff', description: 'TIFF 图片', category: '图片', extension: '.tiff' },
  { type: 'image/heic', description: 'HEIC 图片（iPhone 默认）', category: '图片', extension: '.heic' },

  { type: 'audio/mpeg', description: 'MP3 音频', category: '音视频', extension: '.mp3' },
  { type: 'audio/ogg', description: 'Ogg 音频', category: '音视频', extension: '.ogg' },
  { type: 'audio/wav', description: 'WAV 音频', category: '音视频', extension: '.wav' },
  { type: 'audio/aac', description: 'AAC 音频', category: '音视频', extension: '.aac' },
  { type: 'audio/flac', description: 'FLAC 无损音频', category: '音视频', extension: '.flac' },
  { type: 'video/mp4', description: 'MP4 视频', category: '音视频', extension: '.mp4' },
  { type: 'video/webm', description: 'WebM 视频', category: '音视频', extension: '.webm' },
  { type: 'video/quicktime', description: 'QuickTime 视频', category: '音视频', extension: '.mov' },
  { type: 'video/x-msvideo', description: 'AVI 视频', category: '音视频', extension: '.avi' },
  { type: 'video/mp2t', description: 'MPEG-TS 流（HLS 切片）', category: '音视频', extension: '.ts' },
  { type: 'application/vnd.apple.mpegurl', description: 'HLS 播放列表', category: '音视频', extension: '.m3u8' },
  { type: 'application/dash+xml', description: 'MPEG-DASH 清单', category: '音视频', extension: '.mpd' },

  { type: 'multipart/form-data', description: '表单文件上传', category: '其它', extension: '' },
  { type: 'font/woff', description: 'WOFF 网页字体', category: '其它', extension: '.woff' },
  { type: 'font/woff2', description: 'WOFF2 网页字体', category: '其它', extension: '.woff2' },
  { type: 'application/x-protobuf', description: 'Protocol Buffers', category: '其它', extension: '.pb' },
  { type: 'application/graphql', description: 'GraphQL 查询', category: '其它', extension: '' },
]

/** 常见 MIME 类型与 Content-Type 的对应速查（用于回答「该用什么」）。 */
export const CONTENT_TYPE_CHEATSHEET: ReadonlyArray<{ scenario: string; value: string }> = [
  { scenario: '返回 JSON 接口', value: 'application/json; charset=utf-8' },
  { scenario: '返回纯文本', value: 'text/plain; charset=utf-8' },
  { scenario: '返回 HTML 页面', value: 'text/html; charset=utf-8' },
  { scenario: '表单登录（键值对）', value: 'application/x-www-form-urlencoded' },
  { scenario: '上传文件', value: 'multipart/form-data; boundary=----boundary' },
  { scenario: '流式返回（SSE）', value: 'text/event-stream' },
  { scenario: '触发浏览器下载', value: 'application/octet-stream' },
  { scenario: '允许跨域调用', value: 'Access-Control-Allow-Origin: *' },
]
