/**
 * 极简 ZIP 写入器（只用 STORE 存储方式，不做压缩）。
 *
 * 为什么自己写：批量转换图片后逐个下载，浏览器会弹「允许多个下载」，
 * 体验很差；而引入 jszip / fflate 这类库会打破「运行时零业务依赖」。
 * 图片本身已经是压缩过的，再 deflate 一次收益极小，所以用 STORE 足够。
 *
 * 只实现写，不实现读。格式依据 PKWARE APPNOTE：
 *   每个文件 = 本地文件头 + 原始数据
 *   结尾     = 中央目录（每文件一条）+ 中央目录结束记录（EOCD）
 */

/** CRC-32 查表，多项式 0xEDB88320（与 ZIP / PNG 使用的一致）。 */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let index = 0; index < 256; index += 1) {
    let value = index
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    }
    table[index] = value >>> 0
  }
  return table
})()

/** 计算 CRC-32。标准测试向量：CRC32("123456789") === 0xCBF43926。 */
export function crc32(bytes: Uint8Array, seed = 0): number {
  let crc = (seed ^ 0xffffffff) >>> 0
  for (let index = 0; index < bytes.length; index += 1) {
    crc = (CRC_TABLE[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8)) >>> 0
  }
  return (crc ^ 0xffffffff) >>> 0
}

export interface ZipEntry {
  /** 压缩包内的文件名（会做去重与路径清理） */
  name: string
  data: Uint8Array
  /** 文件修改时间，用于 ZIP 内的 DOS 时间戳；省略则用 1980-01-01（便于测试得到确定结果） */
  lastModified?: Date
}

/** DOS 时间 / 日期：日期从 1980 年起算，秒只有 2 秒精度。 */
function toDosDateTime(date: Date | undefined): { time: number; date: number } {
  if (!date || Number.isNaN(date.getTime()) || date.getFullYear() < 1980) {
    return { time: 0, date: (1 << 5) | 1 } // 1980-01-01 00:00:00
  }
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1)
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  return { time: time & 0xffff, date: day & 0xffff }
}

/** 清理文件名：去掉目录穿越与开头的斜杠，空名回退。 */
function sanitizeName(name: string): string {
  const cleaned = name
    .replace(/\\/g, '/')
    .split('/')
    .filter((part) => part !== '' && part !== '.' && part !== '..')
    .join('/')
  return cleaned || 'file'
}

/** 同名文件加 (1)、(2) 后缀，保证压缩包里不重名。 */
function uniqueName(name: string, used: Set<string>): string {
  if (!used.has(name)) {
    used.add(name)
    return name
  }
  const dot = name.lastIndexOf('.')
  const base = dot > 0 ? name.slice(0, dot) : name
  const ext = dot > 0 ? name.slice(dot) : ''
  for (let index = 1; ; index += 1) {
    const candidate = `${base} (${index})${ext}`
    if (!used.has(candidate)) {
      used.add(candidate)
      return candidate
    }
  }
}

const MAX_UINT32 = 0xffffffff

/**
 * 生成一个 ZIP 文件。没有任何条目时返回 null。
 *
 * 返回类型写成 `Uint8Array<ArrayBuffer>`（而不是默认的 `ArrayBufferLike`）：
 * 这样它能直接作为 BlobPart 传给 Blob / downloadBlob，
 * 不必在调用处做一次多余的拷贝。
 */
export function createZip(entries: readonly ZipEntry[]): Uint8Array<ArrayBuffer> | null {
  if (entries.length === 0) return null

  const encoder = new TextEncoder()
  const used = new Set<string>()
  const prepared = entries.map((entry) => {
    const nameBytes = encoder.encode(uniqueName(sanitizeName(entry.name), used))
    const { time, date } = toDosDateTime(entry.lastModified)
    return { nameBytes, data: entry.data, crc: crc32(entry.data), time, date }
  })

  const totalData = prepared.reduce((sum, item) => sum + item.data.length, 0)
  const centralSize = prepared.reduce((sum, item) => sum + 46 + item.nameBytes.length, 0)
  const localSize = prepared.reduce((sum, item) => sum + 30 + item.nameBytes.length + item.data.length, 0)
  if (totalData > MAX_UINT32 || localSize + centralSize + 22 > MAX_UINT32) {
    // STORE 方式没有 ZIP64，超过 4 GB 必须用 ZIP64，这里明确拒绝而不是产出坏文件
    throw new Error('打包内容超过 4 GB，超出本工具的 ZIP 写入范围')
  }

  const output = new Uint8Array(localSize + centralSize + 22)
  const view = new DataView(output.buffer)
  let offset = 0
  const writeUint16 = (value: number) => {
    view.setUint16(offset, value, true)
    offset += 2
  }
  const writeUint32 = (value: number) => {
    view.setUint32(offset, value >>> 0, true)
    offset += 4
  }
  const writeBytes = (bytes: Uint8Array) => {
    output.set(bytes, offset)
    offset += bytes.length
  }

  const offsets: number[] = []

  // 本地文件头 + 数据
  for (const item of prepared) {
    offsets.push(offset)
    writeUint32(0x04034b50) // 本地文件头签名
    writeUint16(20) // 需要的版本 2.0
    writeUint16(0x0800) // 通用标志位：文件名是 UTF-8
    writeUint16(0) // 压缩方式：0 = STORE
    writeUint16(item.time)
    writeUint16(item.date)
    writeUint32(item.crc)
    writeUint32(item.data.length) // 压缩后大小 = 原始大小
    writeUint32(item.data.length)
    writeUint16(item.nameBytes.length)
    writeUint16(0) // 扩展字段长度
    writeBytes(item.nameBytes)
    writeBytes(item.data)
  }

  // 中央目录
  const centralOffset = offset
  prepared.forEach((item, index) => {
    writeUint32(0x02014b50) // 中央目录签名
    writeUint16(20) // 创建版本
    writeUint16(20) // 需要的版本
    writeUint16(0x0800)
    writeUint16(0)
    writeUint16(item.time)
    writeUint16(item.date)
    writeUint32(item.crc)
    writeUint32(item.data.length)
    writeUint32(item.data.length)
    writeUint16(item.nameBytes.length)
    writeUint16(0) // 扩展字段
    writeUint16(0) // 注释
    writeUint16(0) // 起始磁盘号
    writeUint16(0) // 内部属性
    writeUint32(0) // 外部属性
    writeUint32(offsets[index])
    writeBytes(item.nameBytes)
  })

  // 中央目录结束记录。
  // 注意：centralSizeActual 必须在这里先算好——写成 `offset - centralOffset` 会多算，
  // 因为此时 offset 已经越过了 EOCD 的签名与前四个 uint16（共 12 字节）。
  const centralSizeActual = offset - centralOffset
  writeUint32(0x06054b50)
  writeUint16(0) // 当前磁盘号
  writeUint16(0) // 中央目录所在磁盘号
  writeUint16(prepared.length)
  writeUint16(prepared.length)
  writeUint32(centralSizeActual) // 中央目录大小
  writeUint32(centralOffset)
  writeUint16(0) // 注释长度

  return output
}

/** 生成一个安全的 .zip 文件名。 */
export function zipFileName(prefix = 'images'): string {
  const stamp = new Date().toISOString().slice(0, 10)
  return `${prefix}-${stamp}.zip`
}
