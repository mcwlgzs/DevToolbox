/** 颜色解析与转换：HEX / RGB / HSL / HSV 互转、明暗色阶、WCAG 对比度。 */

export interface RGB {
  r: number
  g: number
  b: number
}

export interface HSL {
  h: number
  s: number
  l: number
}

export interface HSV {
  h: number
  s: number
  v: number
}

export interface ParsedColor {
  rgb: RGB
  alpha: number
  /** 原始输入的规范化形式，例如 #ff0000 */
  hex: string
}

const HEX_RE = /^#?([0-9a-f]{3,8})$/i
const RGB_RE = /^rgba?\(\s*([^)]+)\)$/i
const HSL_RE = /^hsla?\(\s*([^)]+)\)$/i

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

export function hexToRgb(hex: string): RGB | null {
  const match = HEX_RE.exec(hex.trim())
  if (!match) return null

  let digits = match[1]
  if (digits.length === 3 || digits.length === 4) {
    digits = digits
      .split('')
      .map((char) => char + char)
      .join('')
  }
  if (digits.length !== 6 && digits.length !== 8) return null

  return {
    r: Number.parseInt(digits.slice(0, 2), 16),
    g: Number.parseInt(digits.slice(2, 4), 16),
    b: Number.parseInt(digits.slice(4, 6), 16),
  }
}

export function rgbToHex(rgb: RGB): string {
  const part = (value: number) =>
    clamp(Math.round(value), 0, 255).toString(16).padStart(2, '0')
  return `#${part(rgb.r)}${part(rgb.g)}${part(rgb.b)}`
}

export function rgbToHsl(rgb: RGB): HSL {
  const r = rgb.r / 255
  const g = rgb.g / 255
  const b = rgb.b / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const delta = max - min

  let h = 0
  if (delta !== 0) {
    if (max === r) h = ((g - b) / delta) % 6
    else if (max === g) h = (b - r) / delta + 2
    else h = (r - g) / delta + 4
  }
  h = (h * 60 + 360) % 360

  const l = (max + min) / 2
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1))

  return { h, s: s * 100, l: l * 100 }
}

export function hslToRgb(hsl: HSL): RGB {
  const h = ((hsl.h % 360) + 360) % 360
  const s = clamp(hsl.s, 0, 100) / 100
  const l = clamp(hsl.l, 0, 100) / 100

  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2

  let rgb: [number, number, number]
  if (h < 60) rgb = [c, x, 0]
  else if (h < 120) rgb = [x, c, 0]
  else if (h < 180) rgb = [0, c, x]
  else if (h < 240) rgb = [0, x, c]
  else if (h < 300) rgb = [x, 0, c]
  else rgb = [c, 0, x]

  return {
    r: Math.round((rgb[0] + m) * 255),
    g: Math.round((rgb[1] + m) * 255),
    b: Math.round((rgb[2] + m) * 255),
  }
}

export function rgbToHsv(rgb: RGB): HSV {
  const r = rgb.r / 255
  const g = rgb.g / 255
  const b = rgb.b / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const delta = max - min

  let h = 0
  if (delta !== 0) {
    if (max === r) h = ((g - b) / delta) % 6
    else if (max === g) h = (b - r) / delta + 2
    else h = (r - g) / delta + 4
  }
  h = (h * 60 + 360) % 360

  return { h, s: max === 0 ? 0 : (delta / max) * 100, v: max * 100 }
}

/** 解析 #rgb / #rrggbb / #rrggbbaa / rgb() / rgba() / hsl() / hsla() */
export function parseColor(input: string): ParsedColor | null {
  const value = input.trim()
  if (!value) return null

  /**
   * alpha 可以是 0–1 的小数，也可以是 0%–100% 的百分比（CSS Color 4 允许）。
   * 之前只按小数解析，"50%" 会得到 1（完全不透明）。
   */
  const parseAlpha = (raw: string | undefined): number => {
    if (raw === undefined) return 1
    const isPercent = raw.trim().endsWith('%')
    const value = Number.parseFloat(raw)
    if (Number.isNaN(value)) return 1
    return clamp(isPercent ? value / 100 : value, 0, 1)
  }

  const rgbMatch = RGB_RE.exec(value)
  if (rgbMatch) {
    const parts = rgbMatch[1].split(/[,/\s]+/).filter(Boolean)
    if (parts.length < 3) return null
    const channel = (raw: string) =>
      raw.endsWith('%')
        ? clamp((Number.parseFloat(raw) / 100) * 255, 0, 255)
        : clamp(Number.parseFloat(raw), 0, 255)
    const alpha = parseAlpha(parts[3])
    if (parts.slice(0, 3).some((part) => Number.isNaN(Number.parseFloat(part)))) return null
    const rgb = { r: channel(parts[0]), g: channel(parts[1]), b: channel(parts[2]) }
    return { rgb, alpha: Number.isNaN(alpha) ? 1 : alpha, hex: rgbToHex(rgb) }
  }

  const hslMatch = HSL_RE.exec(value)
  if (hslMatch) {
    const parts = hslMatch[1].split(/[,/\s]+/).filter(Boolean)
    if (parts.length < 3) return null
    const h = Number.parseFloat(parts[0])
    const s = Number.parseFloat(parts[1])
    const l = Number.parseFloat(parts[2])
    if ([h, s, l].some((part) => Number.isNaN(part))) return null
    const alpha = parseAlpha(parts[3])
    const rgb = hslToRgb({ h, s, l })
    return { rgb, alpha: Number.isNaN(alpha) ? 1 : alpha, hex: rgbToHex(rgb) }
  }

  const hexMatch = HEX_RE.exec(value)
  if (hexMatch) {
    const rgb = hexToRgb(value)
    if (!rgb) return null
    const digits = hexMatch[1]
    let alpha = 1
    if (digits.length === 4) alpha = Number.parseInt(digits[3] + digits[3], 16) / 255
    if (digits.length === 8) alpha = Number.parseInt(digits.slice(6, 8), 16) / 255
    return { rgb, alpha, hex: rgbToHex(rgb) }
  }

  return null
}

export function formatRgb(rgb: RGB, alpha = 1): string {
  const r = Math.round(rgb.r)
  const g = Math.round(rgb.g)
  const b = Math.round(rgb.b)
  return alpha >= 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${round(alpha, 2)})`
}

export function formatHsl(hsl: HSL, alpha = 1): string {
  const h = round(hsl.h, 1)
  const s = round(hsl.s, 1)
  const l = round(hsl.l, 1)
  return alpha >= 1
    ? `hsl(${h}, ${s}%, ${l}%)`
    : `hsla(${h}, ${s}%, ${l}%, ${round(alpha, 2)})`
}

export function formatHsv(hsv: HSV): string {
  return `hsv(${round(hsv.h, 1)}, ${round(hsv.s, 1)}%, ${round(hsv.v, 1)}%)`
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

/* ------------------------------------------------------------------ */
/* 对比度（WCAG 2.1）                                                  */
/* ------------------------------------------------------------------ */

/** 相对亮度，输入为 0–255 的 sRGB 分量。 */
export function relativeLuminance(rgb: RGB): number {
  const channel = (value: number) => {
    const v = value / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b)
}

/** 对比度，范围 1–21。 */
export function contrastRatio(a: RGB, b: RGB): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const lighter = Math.max(la, lb)
  const darker = Math.min(la, lb)
  return (lighter + 0.05) / (darker + 0.05)
}

export interface ContrastVerdict {
  ratio: number
  normalAA: boolean
  normalAAA: boolean
  largeAA: boolean
  largeAAA: boolean
}

export function contrastVerdict(a: RGB, b: RGB): ContrastVerdict {
  const ratio = contrastRatio(a, b)
  return {
    ratio,
    normalAA: ratio >= 4.5,
    normalAAA: ratio >= 7,
    largeAA: ratio >= 3,
    largeAAA: ratio >= 4.5,
  }
}

/** 自动选择黑或白作为前景色，保证在给定背景上可读。 */
export function readableForeground(background: RGB): string {
  return contrastRatio(background, { r: 255, g: 255, b: 255 }) >=
    contrastRatio(background, { r: 0, g: 0, b: 0 })
    ? '#ffffff'
    : '#000000'
}

/* ------------------------------------------------------------------ */
/* 色阶                                                                */
/* ------------------------------------------------------------------ */

/** 生成 tints（向白）与 shades（向黑），返回 100–900 的色阶。 */
export function colorScale(rgb: RGB): Array<{ step: number; hex: string }> {
  const steps = [100, 200, 300, 400, 500, 600, 700, 800, 900]
  return steps.map((step) => {
    const t = (step - 500) / 400
    const target = t < 0 ? 255 : 0
    const amount = Math.abs(t)
    return {
      step,
      hex: rgbToHex({
        r: rgb.r + (target - rgb.r) * amount,
        g: rgb.g + (target - rgb.g) * amount,
        b: rgb.b + (target - rgb.b) * amount,
      }),
    }
  })
}

/** 互补色（H 旋转 180°）。 */
export function complementary(rgb: RGB): string {
  const hsl = rgbToHsl(rgb)
  return rgbToHex(hslToRgb({ ...hsl, h: (hsl.h + 180) % 360 }))
}

/** 生成一组和谐配色（类比 / 三角 / 四角 / 单色）。 */
export type HarmonyKind = 'analogous' | 'triadic' | 'tetradic' | 'monochromatic'

export const harmonyKinds: ReadonlyArray<{ value: HarmonyKind; label: string }> = [
  { value: 'analogous', label: '类比色' },
  { value: 'triadic', label: '三角配色' },
  { value: 'tetradic', label: '四角配色' },
  { value: 'monochromatic', label: '单色变化' },
]

export function harmony(rgb: RGB, kind: HarmonyKind): string[] {
  const hsl = rgbToHsl(rgb)
  const rotate = (delta: number) => rgbToHex(hslToRgb({ ...hsl, h: (hsl.h + delta + 360) % 360 }))

  if (kind === 'analogous') return [rotate(-30), rotate(-15), rgbToHex(rgb), rotate(15), rotate(30)]
  if (kind === 'triadic') return [rgbToHex(rgb), rotate(120), rotate(240)]
  if (kind === 'tetradic') return [rgbToHex(rgb), rotate(90), rotate(180), rotate(270)]
  return [-30, -15, 15, 30].map((delta) =>
    rgbToHex(hslToRgb({ ...hsl, s: clamp(hsl.s + delta, 0, 100) })),
  )
}
