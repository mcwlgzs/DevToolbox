/** chmod 权限计算：八进制 ⇄ 符号表示 ⇄ rwx 字符串，含 SUID / SGID / Sticky。 */

export interface PermissionBits {
  read: boolean
  write: boolean
  execute: boolean
}

export interface ChmodState {
  user: PermissionBits
  group: PermissionBits
  other: PermissionBits
  setuid: boolean
  setgid: boolean
  sticky: boolean
}

export type ChmodOwner = 'user' | 'group' | 'other'

export const OWNER_LABELS: Record<ChmodOwner, string> = {
  user: '所有者',
  group: '所属组',
  other: '其他人',
}

export function emptyState(): ChmodState {
  const none: PermissionBits = { read: false, write: false, execute: false }
  return {
    user: { ...none },
    group: { ...none },
    other: { ...none },
    setuid: false,
    setgid: false,
    sticky: false,
  }
}

function bitsToDigit(bits: PermissionBits): number {
  return (bits.read ? 4 : 0) + (bits.write ? 2 : 0) + (bits.execute ? 1 : 0)
}

function digitToBits(digit: number): PermissionBits {
  return { read: (digit & 4) !== 0, write: (digit & 2) !== 0, execute: (digit & 1) !== 0 }
}

/** 解析八进制写法，支持 3 位（755）、4 位（4755）与前置 0（0755 / 04755 / 0o755）。 */
export function fromOctal(input: string): ChmodState | null {
  let raw = input.trim().toLowerCase()
  if (raw.startsWith('0o')) raw = raw.slice(2)
  // 5 位的前置 0（04755）再剥一层
  if (raw.length === 5 && raw.startsWith('0')) raw = raw.slice(1)
  // 注意：不能去掉全部前导 0——「000」是合法权限，去掉就变成空字符串了
  if (!/^[0-7]{3,4}$/.test(raw)) return null

  const padded = raw.padStart(4, '0')
  const special = Number.parseInt(padded[0], 10)
  const [u, g, o] = [padded[1], padded[2], padded[3]].map((digit) => Number.parseInt(digit, 10))

  return {
    user: digitToBits(u),
    group: digitToBits(g),
    other: digitToBits(o),
    setuid: (special & 4) !== 0,
    setgid: (special & 2) !== 0,
    sticky: (special & 1) !== 0,
  }
}

/** 输出 4 位八进制；没有特殊位时省略首位。 */
export function toOctal(state: ChmodState): string {
  const special = (state.setuid ? 4 : 0) + (state.setgid ? 2 : 0) + (state.sticky ? 1 : 0)
  const base = `${bitsToDigit(state.user)}${bitsToDigit(state.group)}${bitsToDigit(state.other)}`
  return special > 0 ? `${special}${base}` : base
}

/** 输出完整 rwx 字符串，例如 -rwxr-xr-x。 */
export function toSymbolic(state: ChmodState): string {
  const part = (bits: PermissionBits, special: boolean, specialChar: string) => {
    const execute = bits.execute ? (special ? specialChar : 'x') : special ? specialChar.toUpperCase() : '-'
    return `${bits.read ? 'r' : '-'}${bits.write ? 'w' : '-'}${execute}`
  }
  return `-${part(state.user, state.setuid, 's')}${part(state.group, state.setgid, 's')}${part(
    state.other,
    state.sticky,
    't',
  )}`
}

/**
 * 解析 rwx 字符串（10 位含文件类型，或 9 位纯权限）。
 * 返回 null 表示格式不合法。
 */
export function parseSymbolic(input: string): ChmodState | null {
  const clean = input.trim()
  if (!/^[-dlbcps]?[rwxsStT-]{9}$/.test(clean)) return null
  const body = clean.slice(-9)

  const state = emptyState()
  const owners: ChmodOwner[] = ['user', 'group', 'other']
  const specialChars = ['s', 's', 't']

  owners.forEach((owner, index) => {
    const chunk = body.slice(index * 3, index * 3 + 3)
    const specialChar = specialChars[index]
    state[owner] = {
      read: chunk[0] === 'r',
      write: chunk[1] === 'w',
      execute: chunk[2] === 'x' || chunk[2] === specialChar,
    }
    const hasSpecial = chunk[2] === specialChar || chunk[2] === specialChar.toUpperCase()
    if (index === 0) state.setuid = hasSpecial
    if (index === 1) state.setgid = hasSpecial
    if (index === 2) state.sticky = hasSpecial
  })

  return state
}

export interface SymbolicChange {
  owner: ChmodOwner | 'all'
  operator: '+' | '-' | '='
  permissions: string
}

const OWNER_LETTERS: Record<string, ChmodOwner> = { u: 'user', g: 'group', o: 'other' }

/** 解析 chmod 的符号增量写法，例如 u+x、go-w、a=r。 */
export function parseSymbolicChange(input: string): { changes: SymbolicChange[]; error: string | null } {
  const changes: SymbolicChange[] = []
  for (const clause of input.trim().split(',')) {
    const match = /^([ugoa]*)([+\-=])([rwxXst]*)$/.exec(clause.trim())
    if (!match) return { changes: [], error: `无法识别的写法：「${clause}」` }
    const [, who, operator, permissions] = match
    // who 是字母 u/g/o，必须映射成内部使用的 user/group/other
    const owners: Array<ChmodOwner | 'all'> =
      who === '' || who === 'a'
        ? ['all']
        : [...who]
            .map((letter) => OWNER_LETTERS[letter])
            .filter((owner): owner is ChmodOwner => owner !== undefined)
    for (const owner of owners) {
      changes.push({ owner, operator: operator as '+' | '-' | '=', permissions })
    }
  }
  return { changes, error: null }
}

/** 把符号增量应用到当前权限上。 */
export function applySymbolicChange(state: ChmodState, input: string): ChmodState {
  const { changes, error } = parseSymbolicChange(input)
  if (error) return state

  const next: ChmodState = {
    user: { ...state.user },
    group: { ...state.group },
    other: { ...state.other },
    setuid: state.setuid,
    setgid: state.setgid,
    sticky: state.sticky,
  }
  const owners: ChmodOwner[] = ['user', 'group', 'other']

  for (const change of changes) {
    const targets = change.owner === 'all' ? owners : [change.owner]
    for (const owner of targets) {
      if (change.operator === '=') {
        next[owner] = { read: false, write: false, execute: false }
        // `=` 是「精确设定」：范围里包含的特殊位也要一起清零。
        // 这是 GNU coreutils 的行为（modechange.c 里 '=' 用 affected 位掩码），
        // 否则 `chmod u=rwx` 作用在 4755 上会错误地保留 SUID。
        if (owner === 'user') next.setuid = false
        if (owner === 'group') next.setgid = false
        if (owner === 'other') next.sticky = false
      }
      const set = (bit: 'read' | 'write' | 'execute', char: string) => {
        if (!change.permissions.includes(char)) return
        if (change.operator === '-') next[owner][bit] = false
        else next[owner][bit] = true
      }
      set('read', 'r')
      set('write', 'w')
      set('execute', 'x')
      if (change.permissions.includes('s')) {
        if (owner === 'user') next.setuid = change.operator !== '-'
        if (owner === 'group') next.setgid = change.operator !== '-'
      }
      if (change.permissions.includes('t') && owner === 'other') {
        next.sticky = change.operator !== '-'
      }
    }
  }

  return next
}

/** 生成可直接执行的 chmod 命令。 */
export function toCommand(state: ChmodState, target = 'file'): string {
  return `chmod ${toOctal(state)} ${target}`
}

/** 常见权限组合的解释。 */
export interface PermissionNote {
  octal: string
  symbolic: string
  meaning: string
}

export const COMMON_PERMISSIONS: readonly PermissionNote[] = [
  { octal: '644', symbolic: '-rw-r--r--', meaning: '普通文件：所有者可读写，其他人只读' },
  { octal: '600', symbolic: '-rw-------', meaning: '私密文件：只有所有者可读写（如 ~/.ssh/id_rsa）' },
  { octal: '755', symbolic: '-rwxr-xr-x', meaning: '可执行文件 / 目录：所有人可读可执行，只有所有者可写' },
  { octal: '700', symbolic: '-rwx------', meaning: '私有目录：只有所有者可访问' },
  { octal: '775', symbolic: '-rwxrwxr-x', meaning: '团队目录：组内成员可读写执行' },
  { octal: '664', symbolic: '-rw-rw-r--', meaning: '团队文件：组内成员可读写' },
  { octal: '777', symbolic: '-rwxrwxrwx', meaning: '完全开放，生产环境应避免' },
  { octal: '400', symbolic: '-r--------', meaning: '只读，连所有者也不能改' },
  { octal: '555', symbolic: '-r-xr-xr-x', meaning: '只读可执行' },
  { octal: '4755', symbolic: '-rwsr-xr-x', meaning: 'SUID：执行时临时获得文件所有者权限（如 passwd）' },
  { octal: '2755', symbolic: '-rwxr-sr-x', meaning: 'SGID：继承目录所属组，常用于共享目录' },
  { octal: '1777', symbolic: '-rwxrwxrwt', meaning: 'Sticky：只有文件所有者能删除自己的文件（如 /tmp）' },
]
