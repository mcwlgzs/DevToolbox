/**
 * 摘要算法：MD5 / SHA-1 / SHA-256，全部为纯 JavaScript 实现。
 *
 * 为什么不用 Web Crypto？`crypto.subtle` 只在安全上下文（HTTPS / localhost）可用，
 * 用 file:// 直接打开页面时会缺失；而且它不支持 MD5，也不支持增量更新——
 * 意味着必须先把这个文件读进内存，几个 GB 的视频无法处理。
 *
 * 因此这里提供两套入口：
 *   - 一次性：md5 / sha1 / sha256 / hashBytes
 *   - 增量式：createHasher().update(chunk).digest()，配合 hashFileStream 分块读文件，
 *     内存占用恒定（默认 4 MB 切片），可处理任意大小的文件。
 *
 * 两者结果完全一致（由 scripts/hash.test.mts 与 node:crypto 交叉验证覆盖）。
 */

export type HashAlgorithm = 'md5' | 'sha1' | 'sha256'

export interface HashAlgorithmMeta {
  value: HashAlgorithm
  label: string
  bits: number
  hexLength: number
  note: string
}

export const HASH_ALGORITHMS: readonly HashAlgorithmMeta[] = [
  {
    value: 'md5',
    label: 'MD5',
    bits: 128,
    hexLength: 32,
    note: '速度快，广泛用于文件校验；已不适合用于安全场景',
  },
  {
    value: 'sha1',
    label: 'SHA-1',
    bits: 160,
    hexLength: 40,
    note: '已被证明存在碰撞，仅建议用于兼容旧系统',
  },
  {
    value: 'sha256',
    label: 'SHA-256',
    bits: 256,
    hexLength: 64,
    note: '推荐：完整性校验、签名、口令派生的事实标准',
  },
]

export function algorithmMeta(algorithm: HashAlgorithm): HashAlgorithmMeta {
  return HASH_ALGORITHMS.find((meta) => meta.value === algorithm) ?? HASH_ALGORITHMS[0]
}

export function hexLengthOf(algorithm: HashAlgorithm): number {
  return algorithmMeta(algorithm).hexLength
}

/* ------------------------------------------------------------------ */
/* 工具函数                                                            */
/* ------------------------------------------------------------------ */

function rotl(value: number, shift: number): number {
  return ((value << shift) | (value >>> (32 - shift))) >>> 0
}

function rotr(value: number, shift: number): number {
  return ((value >>> shift) | (value << (32 - shift))) >>> 0
}

export function toHex(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 1) {
    out += bytes[i].toString(16).padStart(2, '0')
  }
  return out
}

export function hexToBytes(hex: string): Uint8Array | null {
  // 容忍常见写法：允许 0x 前缀，以及空格 / 冒号 / 连字符分隔，
  // 与 hmac.parseKey 的十六进制分支保持一致（之前 '0x41' 会被判为非法）
  const clean = hex
    .trim()
    .toLowerCase()
    .replace(/^0x/, '')
    .replace(/[\s:-]/g, '')
  if (clean.length === 0 || clean.length % 2 !== 0 || !/^[0-9a-f]+$/.test(clean)) return null
  const bytes = new Uint8Array(clean.length / 2)
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

/* ------------------------------------------------------------------ */
/* 增量式哈希器                                                        */
/* ------------------------------------------------------------------ */

const BLOCK_SIZE = 64

/** 处理一个 512 位分块。scratch 至少 80 个 word，由调用方复用避免反复分配。 */
type BlockProcessor = (
  view: DataView,
  offset: number,
  state: Uint32Array,
  scratch: Uint32Array,
) => void

export interface Hasher {
  /** 追加数据块，可以任意切分。 */
  update(chunk: Uint8Array): void
  /** 收尾并返回摘要字节，之后不可再 update。 */
  digest(): Uint8Array
  /** 已接收的字节数。 */
  readonly totalBytes: number
}

interface HasherSpec {
  initState: () => Uint32Array
  processBlock: BlockProcessor
  littleEndianLength: boolean
  toBytes: (state: Uint32Array) => Uint8Array
}

/**
 * 通用分块驱动器：缓存不足 64 字节的尾部，满了就交给 processBlock，
 * digest 时按 Merkle–Damgård 结构补位并写入 64 位比特长度。
 */
function createHasherFrom(spec: HasherSpec): Hasher {
  const state = spec.initState()
  const scratch = new Uint32Array(80)
  const tail = new Uint8Array(BLOCK_SIZE)
  let buffered = 0
  let total = 0
  let finished = false

  const tailView = new DataView(tail.buffer)

  return {
    get totalBytes() {
      return total
    },

    update(chunk: Uint8Array): void {
      if (finished) throw new Error('哈希器已收尾，不能再 update')
      if (chunk.length === 0) return
      total += chunk.length

      let offset = 0

      if (buffered > 0) {
        const take = Math.min(BLOCK_SIZE - buffered, chunk.length)
        tail.set(chunk.subarray(0, take), buffered)
        buffered += take
        offset = take
        if (buffered === BLOCK_SIZE) {
          spec.processBlock(tailView, 0, state, scratch)
          buffered = 0
        }
      }

      if (offset + BLOCK_SIZE <= chunk.length) {
        const view = new DataView(chunk.buffer, chunk.byteOffset, chunk.length)
        while (offset + BLOCK_SIZE <= chunk.length) {
          spec.processBlock(view, offset, state, scratch)
          offset += BLOCK_SIZE
        }
      }

      if (offset < chunk.length) {
        tail.set(chunk.subarray(offset), 0)
        buffered = chunk.length - offset
      }
    },

    digest(): Uint8Array {
      if (finished) throw new Error('哈希器已收尾，不能重复 digest')
      finished = true

      // 剩余字节 + 0x80 + 补零 + 8 字节长度，总长必须是 64 的倍数
      const tailLength = buffered < 56 ? BLOCK_SIZE : BLOCK_SIZE * 2
      const finalBlock = new Uint8Array(tailLength)
      finalBlock.set(tail.subarray(0, buffered))
      finalBlock[buffered] = 0x80

      const view = new DataView(finalBlock.buffer)
      const bitLength = BigInt(total) * 8n
      const low = Number(bitLength & 0xffff_ffffn)
      const high = Number(bitLength >> 32n)

      if (spec.littleEndianLength) {
        view.setUint32(tailLength - 8, low, true)
        view.setUint32(tailLength - 4, high, true)
      } else {
        view.setUint32(tailLength - 8, high, false)
        view.setUint32(tailLength - 4, low, false)
      }

      for (let offset = 0; offset < tailLength; offset += BLOCK_SIZE) {
        spec.processBlock(view, offset, state, scratch)
      }

      return spec.toBytes(state)
    },
  }
}

/* ------------------------------------------------------------------ */
/* MD5 (RFC 1321)                                                      */
/* ------------------------------------------------------------------ */

/** K[i] = floor(abs(sin(i + 1)) * 2^32)，即 RFC 1321 定义的常量表 */
const MD5_K = (() => {
  const table = new Uint32Array(64)
  for (let i = 0; i < 64; i += 1) {
    table[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4_294_967_296)
  }
  return table
})()

const MD5_S = new Uint8Array([
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14,
  20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6,
  10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
])

function md5Block(view: DataView, offset: number, state: Uint32Array, scratch: Uint32Array): void {
  for (let i = 0; i < 16; i += 1) {
    scratch[i] = view.getUint32(offset + i * 4, true)
  }

  let a = state[0]
  let b = state[1]
  let c = state[2]
  let d = state[3]

  for (let i = 0; i < 64; i += 1) {
    let f: number
    let g: number

    if (i < 16) {
      f = (b & c) | (~b & d)
      g = i
    } else if (i < 32) {
      f = (d & b) | (~d & c)
      g = (5 * i + 1) % 16
    } else if (i < 48) {
      f = b ^ c ^ d
      g = (3 * i + 5) % 16
    } else {
      f = c ^ (b | ~d)
      g = (7 * i) % 16
    }

    const previousD = d
    d = c
    c = b
    b = (b + rotl((a + f + MD5_K[i] + scratch[g]) | 0, MD5_S[i])) | 0
    a = previousD
  }

  state[0] = (state[0] + a) | 0
  state[1] = (state[1] + b) | 0
  state[2] = (state[2] + c) | 0
  state[3] = (state[3] + d) | 0
}

export function createMd5(): Hasher {
  return createHasherFrom({
    initState: () => Uint32Array.from([0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476]),
    processBlock: md5Block,
    littleEndianLength: true,
    toBytes: (state) => {
      const out = new Uint8Array(16)
      const view = new DataView(out.buffer)
      for (let i = 0; i < 4; i += 1) view.setUint32(i * 4, state[i] >>> 0, true)
      return out
    },
  })
}

/* ------------------------------------------------------------------ */
/* SHA-1 (FIPS 180-4)                                                  */
/* ------------------------------------------------------------------ */

function sha1Block(view: DataView, offset: number, state: Uint32Array, scratch: Uint32Array): void {
  const w = scratch
  for (let i = 0; i < 16; i += 1) {
    w[i] = view.getUint32(offset + i * 4, false)
  }
  for (let i = 16; i < 80; i += 1) {
    w[i] = rotl(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1)
  }

  let a = state[0]
  let b = state[1]
  let c = state[2]
  let d = state[3]
  let e = state[4]

  for (let i = 0; i < 80; i += 1) {
    let f: number
    let k: number

    if (i < 20) {
      f = (b & c) | (~b & d)
      k = 0x5a827999
    } else if (i < 40) {
      f = b ^ c ^ d
      k = 0x6ed9eba1
    } else if (i < 60) {
      f = (b & c) | (b & d) | (c & d)
      k = 0x8f1bbcdc
    } else {
      f = b ^ c ^ d
      k = 0xca62c1d6
    }

    const temp = (rotl(a, 5) + f + e + k + w[i]) | 0
    e = d
    d = c
    c = rotl(b, 30)
    b = a
    a = temp
  }

  state[0] = (state[0] + a) | 0
  state[1] = (state[1] + b) | 0
  state[2] = (state[2] + c) | 0
  state[3] = (state[3] + d) | 0
  state[4] = (state[4] + e) | 0
}

export function createSha1(): Hasher {
  return createHasherFrom({
    initState: () =>
      Uint32Array.from([0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0]),
    processBlock: sha1Block,
    littleEndianLength: false,
    toBytes: (state) => {
      const out = new Uint8Array(20)
      const view = new DataView(out.buffer)
      for (let i = 0; i < 5; i += 1) view.setUint32(i * 4, state[i] >>> 0, false)
      return out
    },
  })
}

/* ------------------------------------------------------------------ */
/* SHA-256 (FIPS 180-4)                                                */
/* ------------------------------------------------------------------ */

/** 前 64 个质数立方根的小数部分 × 2^32，可用 scripts/hash-constants.mts 重新核对 */
const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
])

/** 前 8 个质数平方根的小数部分 × 2^32 */
const SHA256_H = new Uint32Array([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
])

function sha256Block(view: DataView, offset: number, state: Uint32Array, scratch: Uint32Array): void {
  const w = scratch
  for (let i = 0; i < 16; i += 1) {
    w[i] = view.getUint32(offset + i * 4, false)
  }
  for (let i = 16; i < 64; i += 1) {
    const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3)
    const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10)
    w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0
  }

  let a = state[0]
  let b = state[1]
  let c = state[2]
  let d = state[3]
  let e = state[4]
  let f = state[5]
  let g = state[6]
  let h = state[7]

  for (let i = 0; i < 64; i += 1) {
    const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)
    const ch = (e & f) ^ (~e & g)
    const temp1 = (h + S1 + ch + SHA256_K[i] + w[i]) | 0
    const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)
    const maj = (a & b) ^ (a & c) ^ (b & c)
    const temp2 = (S0 + maj) | 0

    h = g
    g = f
    f = e
    e = (d + temp1) | 0
    d = c
    c = b
    b = a
    a = (temp1 + temp2) | 0
  }

  state[0] = (state[0] + a) | 0
  state[1] = (state[1] + b) | 0
  state[2] = (state[2] + c) | 0
  state[3] = (state[3] + d) | 0
  state[4] = (state[4] + e) | 0
  state[5] = (state[5] + f) | 0
  state[6] = (state[6] + g) | 0
  state[7] = (state[7] + h) | 0
}

export function createSha256(): Hasher {
  return createHasherFrom({
    initState: () => Uint32Array.from(SHA256_H),
    processBlock: sha256Block,
    littleEndianLength: false,
    toBytes: (state) => {
      const out = new Uint8Array(32)
      const view = new DataView(out.buffer)
      for (let i = 0; i < 8; i += 1) view.setUint32(i * 4, state[i] >>> 0, false)
      return out
    },
  })
}

export function createHasher(algorithm: HashAlgorithm): Hasher {
  if (algorithm === 'md5') return createMd5()
  if (algorithm === 'sha1') return createSha1()
  return createSha256()
}

/* ------------------------------------------------------------------ */
/* 一次性入口                                                          */
/* ------------------------------------------------------------------ */

/** 同步实现，任何环境都可用。 */
export function hashBytesSync(bytes: Uint8Array, algorithm: HashAlgorithm): string {
  const hasher = createHasher(algorithm)
  hasher.update(bytes)
  return toHex(hasher.digest())
}

export function md5(bytes: Uint8Array): Uint8Array {
  const hasher = createMd5()
  hasher.update(bytes)
  return hasher.digest()
}

export function sha1(bytes: Uint8Array): Uint8Array {
  const hasher = createSha1()
  hasher.update(bytes)
  return hasher.digest()
}

export function sha256(bytes: Uint8Array): Uint8Array {
  const hasher = createSha256()
  hasher.update(bytes)
  return hasher.digest()
}

function webCryptoName(algorithm: HashAlgorithm): string | null {
  if (algorithm === 'sha1') return 'SHA-1'
  if (algorithm === 'sha256') return 'SHA-256'
  return null
}

/** 是否可用 Web Crypto 加速（仅安全上下文）。 */
export function hasWebCrypto(): boolean {
  return typeof globalThis.crypto?.subtle?.digest === 'function'
}

/**
 * 内存中数据的摘要。非 MD5 且处于安全上下文时走 Web Crypto（更快），
 * 否则用纯 JS 实现，两条路径结果一致。
 */
export async function hashBytes(bytes: Uint8Array, algorithm: HashAlgorithm): Promise<string> {
  const name = webCryptoName(algorithm)
  if (name && hasWebCrypto()) {
    const digest = await globalThis.crypto.subtle.digest(name, bytes as unknown as BufferSource)
    return toHex(new Uint8Array(digest))
  }
  return hashBytesSync(bytes, algorithm)
}

export async function hashText(text: string, algorithm: HashAlgorithm): Promise<string> {
  return hashBytes(new TextEncoder().encode(text), algorithm)
}

/** 一次性算出多个算法，避免多次遍历数据。 */
export async function hashAll(
  bytes: Uint8Array,
  algorithms: readonly HashAlgorithm[] = ['md5', 'sha1', 'sha256'],
): Promise<Record<HashAlgorithm, string>> {
  const result = {} as Record<HashAlgorithm, string>
  await Promise.all(
    algorithms.map(async (algorithm) => {
      result[algorithm] = await hashBytes(bytes, algorithm)
    }),
  )
  return result
}

/* ------------------------------------------------------------------ */
/* 流式文件哈希                                                        */
/* ------------------------------------------------------------------ */

/** 默认切片大小：4 MB。内存占用与文件大小无关。 */
export const DEFAULT_SLICE_SIZE = 4 * 1024 * 1024

export interface FileHashProgress {
  /** 已读取字节数 */
  loaded: number
  /** 文件总字节数 */
  total: number
  /** 处理进度 0–1 */
  ratio: number
}

/**
 * 流式读取文件并计算摘要。
 * 一次读取同时喂给多个算法，因此多算一个算法的成本远低于重复读盘。
 */
export async function hashFileStream(
  file: Blob,
  algorithms: readonly HashAlgorithm[],
  options: {
    sliceSize?: number
    onProgress?: (progress: FileHashProgress) => void
    signal?: AbortSignal
  } = {},
): Promise<Record<HashAlgorithm, string>> {
  const sliceSize = options.sliceSize ?? DEFAULT_SLICE_SIZE
  const hashers = algorithms.map((algorithm) => createHasher(algorithm))
  const total = file.size
  let loaded = 0

  while (loaded < total) {
    if (options.signal?.aborted) throw new DOMException('已取消', 'AbortError')
    const end = Math.min(loaded + sliceSize, total)
    const buffer = await file.slice(loaded, end).arrayBuffer()
    const chunk = new Uint8Array(buffer)
    for (const hasher of hashers) hasher.update(chunk)
    loaded = end
    options.onProgress?.({ loaded, total, ratio: total === 0 ? 1 : loaded / total })
  }

  if (total === 0) {
    options.onProgress?.({ loaded: 0, total: 0, ratio: 1 })
  }

  const result = {} as Record<HashAlgorithm, string>
  algorithms.forEach((algorithm, index) => {
    result[algorithm] = toHex(hashers[index].digest())
  })
  return result
}

/** 读取文件并计算单个摘要（内部走流式路径）。 */
export async function hashFile(file: Blob, algorithm: HashAlgorithm): Promise<string> {
  const result = await hashFileStream(file, [algorithm])
  return result[algorithm]
}
