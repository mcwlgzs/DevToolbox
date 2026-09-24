/** IPv4 子网计算：CIDR、掩码、地址范围、可用主机数、子网划分。 */

export interface SubnetInfo {
  /** 规范化后的 CIDR，例如 192.168.1.0/24 */
  cidr: string
  ip: string
  prefix: number
  netmask: string
  wildcard: string
  network: string
  broadcast: string
  firstHost: string
  lastHost: string
  /** 该网段总地址数（含网络号与广播地址） */
  totalAddresses: number
  /** 可用主机数 */
  usableHosts: number
  /** A/B/C/D/E 类 */
  ipClass: string
  isPrivate: boolean
  isLoopback: boolean
  isLinkLocal: boolean
  isMulticast: boolean
  ipBinary: string
  maskBinary: string
  /** 反向解析区域（用于 DNS 委派），例如 1.168.192.in-addr.arpa */
  reverseZone: string
  /** 该 IP 的完整 PTR 记录名，例如 10.1.168.192.in-addr.arpa */
  ptrName: string
}

export function parseIPv4(input: string): number | null {
  const clean = input.trim()
  const parts = clean.split('.')
  if (parts.length !== 4) return null

  let value = 0
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null
    const octet = Number.parseInt(part, 10)
    if (octet > 255) return null
    value = value * 256 + octet
  }
  return value >>> 0
}

export function formatIPv4(value: number): string {
  return [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255].join('.')
}

export function toBinary(value: number): string {
  return [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255]
    .map((octet) => octet.toString(2).padStart(8, '0'))
    .join('.')
}

/**
 * 解析 `192.168.1.10/24` 或 `192.168.1.10 255.255.255.0`。
 * 只给 IP 不给掩码时按有类地址推断。
 */
export function calculateSubnet(input: string, maskInput?: string): { ok: true; info: SubnetInfo } | { ok: false; error: string } {
  const trimmed = input.trim()
  if (!trimmed) return { ok: false, error: '请输入 IPv4 地址，例如 192.168.1.10/24' }

  let ipPart = trimmed
  let prefix: number | null = null

  if (trimmed.includes('/')) {
    const [address, prefixPart] = trimmed.split('/')
    ipPart = address
    const parsedPrefix = Number.parseInt(prefixPart, 10)
    if (Number.isNaN(parsedPrefix) || parsedPrefix < 0 || parsedPrefix > 32) {
      return { ok: false, error: `前缀长度「${prefixPart}」无效，应在 0–32 之间` }
    }
    prefix = parsedPrefix
  } else if (maskInput?.trim()) {
    const maskValue = parseIPv4(maskInput.trim())
    if (maskValue === null) return { ok: false, error: '子网掩码格式不正确' }
    // 校验掩码是否连续（高位全 1）
    const inverted = ~maskValue >>> 0
    if ((inverted & (inverted + 1)) !== 0) {
      return { ok: false, error: '子网掩码必须是连续的，例如 255.255.255.0' }
    }
    prefix = countBits(maskValue)
  }

  const ipValue = parseIPv4(ipPart)
  if (ipValue === null) return { ok: false, error: `IPv4 地址「${ipPart}」格式不正确（应为四段 0–255 的数字）` }

  if (prefix === null) prefix = classfulPrefix(ipValue)

  const maskValue = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0
  const wildcardValue = ~maskValue >>> 0
  const networkValue = (ipValue & maskValue) >>> 0
  const broadcastValue = (networkValue | wildcardValue) >>> 0

  const totalAddresses = 2 ** (32 - prefix)
  // /31 与 /32 是点对点与单主机特例，没有网络号 / 广播地址的保留
  const usableHosts = prefix >= 31 ? totalAddresses : Math.max(totalAddresses - 2, 0)
  const firstHostValue = prefix >= 31 ? networkValue : (networkValue + 1) >>> 0
  const lastHostValue = prefix >= 31 ? broadcastValue : (broadcastValue - 1) >>> 0

  // 反向解析区域：取网络地址的前 ceil(prefix/8) 段后逆序
  const networkOctets = formatIPv4(networkValue).split('.')
  const zoneParts = Math.max(1, Math.ceil(prefix / 8))
  const reverseZone = `${networkOctets.slice(0, zoneParts).reverse().join('.')}.in-addr.arpa`
  // 完整 PTR 名：该 IP 的四段全部逆序
  const ptrName = `${formatIPv4(ipValue).split('.').reverse().join('.')}.in-addr.arpa`

  return {
    ok: true,
    info: {
      cidr: `${formatIPv4(networkValue)}/${prefix}`,
      ip: formatIPv4(ipValue),
      prefix,
      netmask: formatIPv4(maskValue),
      wildcard: formatIPv4(wildcardValue),
      network: formatIPv4(networkValue),
      broadcast: formatIPv4(broadcastValue),
      firstHost: formatIPv4(firstHostValue),
      lastHost: formatIPv4(lastHostValue),
      totalAddresses,
      usableHosts,
      ipClass: classOf(ipValue),
      isPrivate: isPrivateIp(ipValue),
      isLoopback: (ipValue >>> 24) === 127,
      isLinkLocal: (ipValue >>> 16) === 0xa9fe,
      isMulticast: (ipValue >>> 28) === 0xe,
      ipBinary: toBinary(ipValue),
      maskBinary: toBinary(maskValue),
      reverseZone,
      ptrName,
    },
  }
}

function countBits(value: number): number {
  let count = 0
  for (let index = 31; index >= 0; index -= 1) {
    if ((value >>> index) & 1) count += 1
    else break
  }
  return count
}

function classfulPrefix(value: number): number {
  const first = value >>> 24
  if (first < 128) return 8
  if (first < 192) return 16
  if (first < 224) return 24
  return 24
}

function classOf(value: number): string {
  const first = value >>> 24
  if (first < 128) return 'A 类'
  if (first < 192) return 'B 类'
  if (first < 224) return 'C 类'
  if (first < 240) return 'D 类（组播）'
  return 'E 类（保留）'
}

export function isPrivateIp(value: number): boolean {
  const first = value >>> 24
  const second = (value >>> 16) & 255
  if (first === 10) return true
  if (first === 172 && second >= 16 && second <= 31) return true
  if (first === 192 && second === 168) return true
  return false
}

/** 把一个网段等分成若干更小的子网。 */
export function splitSubnet(cidr: string, newPrefix: number, limit = 256): { subnets: string[]; error: string | null } {
  const parsed = calculateSubnet(cidr)
  if (!parsed.ok) return { subnets: [], error: parsed.error }
  if (newPrefix <= parsed.info.prefix || newPrefix > 32) {
    return { subnets: [], error: `新前缀长度必须大于 ${parsed.info.prefix} 且不超过 32` }
  }

  const networkValue = parseIPv4(parsed.info.network)!
  const step = 2 ** (32 - newPrefix)
  const count = 2 ** (newPrefix - parsed.info.prefix)
  const subnets: string[] = []
  for (let index = 0; index < Math.min(count, limit); index += 1) {
    subnets.push(`${formatIPv4((networkValue + index * step) >>> 0)}/${newPrefix}`)
  }
  return { subnets, error: null }
}

export interface CidrPreset {
  cidr: string
  note: string
}

export const CIDR_PRESETS: readonly CidrPreset[] = [
  { cidr: '192.168.1.10/24', note: '家庭 / 办公室常见网段' },
  { cidr: '10.0.0.1/8', note: 'A 类私有地址' },
  { cidr: '172.16.0.1/12', note: 'Docker 默认网段' },
  { cidr: '10.0.0.0/16', note: 'Kubernetes Pod 网段' },
  { cidr: '192.168.0.0/16', note: 'VPC 常用网段' },
  { cidr: '100.64.0.0/10', note: '运营商级 NAT（CGNAT）' },
  { cidr: '169.254.0.0/16', note: '链路本地（APIPA）' },
  { cidr: '224.0.0.0/4', note: '组播地址' },
]
