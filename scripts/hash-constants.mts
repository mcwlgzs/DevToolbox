/**
 * 重新生成 SHA-256 的常量表（仅用于核对，不参与构建）。
 *
 * K[i] = floor(frac(prime_i ^ (1/3)) * 2^32)
 * H[i] = floor(frac(prime_i ^ (1/2)) * 2^32)
 *
 * 用 BigInt 整数 k 次方根计算，避免手敲 64 个常量出错。
 * 用法：node scripts/hash-constants.mts
 * 输出应与 src/lib/hash.ts 中的 SHA256_K / SHA256_H 完全一致（FIPS 180-4 §4.2.2）。
 */

function firstPrimes(count: number): number[] {
  const primes: number[] = []
  for (let n = 2; primes.length < count; n += 1) {
    let isPrime = true
    for (let d = 2; d * d <= n; d += 1) {
      if (n % d === 0) {
        isPrime = false
        break
      }
    }
    if (isPrime) primes.push(n)
  }
  return primes
}

function bitLength(value: bigint): number {
  return value.toString(2).length
}

/** floor(n ** (1/degree))，整数牛顿迭代 */
function integerRoot(n: bigint, degree: number): bigint {
  if (n < 2n) return n
  const k = BigInt(degree)
  let x = 1n << BigInt(Math.ceil(bitLength(n) / degree) + 1)
  for (;;) {
    const next = ((k - 1n) * x + n / x ** (k - 1n)) / k
    if (next >= x) break
    x = next
  }
  return x
}

/** floor(frac(p ** (1/degree)) * 2^bits) */
function fractionBits(p: number, degree: number, bits: number): number {
  const prime = BigInt(p)
  const whole = integerRoot(prime, degree)
  const scaled = integerRoot(prime << BigInt(degree * bits), degree)
  return Number(scaled - (whole << BigInt(bits)))
}

const primes = firstPrimes(64)
const sha256K = primes.map((p) => fractionBits(p, 3, 32))
const sha256H = primes.slice(0, 8).map((p) => fractionBits(p, 2, 32))

const hex = (value: number) => `0x${value.toString(16).padStart(8, '0')}`

function formatTable(name: string, values: number[], perLine: number): string {
  const lines: string[] = []
  for (let i = 0; i < values.length; i += perLine) {
    lines.push('  ' + values.slice(i, i + perLine).map(hex).join(', ') + ',')
  }
  return `const ${name} = new Uint32Array([\n${lines.join('\n')}\n])`
}

console.log('// ==== SHA-256 K 表（前 64 个质数的立方根小数部分）====')
console.log(formatTable('SHA256_K', sha256K, 8))
console.log()
console.log('// ==== SHA-256 初始哈希（前 8 个质数的平方根小数部分）====')
console.log(formatTable('SHA256_H', sha256H, 8))
console.log()
console.log('// 预期：K[0]=0x428a2f98  K[63]=0xc67178f2  H[0]=0x6a09e667  H[7]=0x5be0cd19')
