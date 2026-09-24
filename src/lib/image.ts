/** 图片处理：缩放、格式转换、质量压缩，全部通过 Canvas 在本地完成。 */

export type OutputFormat = 'image/jpeg' | 'image/png' | 'image/webp'

export const OUTPUT_FORMATS: ReadonlyArray<{ value: OutputFormat; label: string; lossy: boolean }> = [
  { value: 'image/jpeg', label: 'JPEG（体积最小，无透明）', lossy: true },
  { value: 'image/png', label: 'PNG（无损，支持透明）', lossy: false },
  { value: 'image/webp', label: 'WebP（现代格式，兼顾两者）', lossy: true },
]

export const MAX_PIXELS = 40_000_000 // 约 40MP，避免移动端内存溢出

export interface ImageSource {
  file: File
  width: number
  height: number
  /** 目标尺寸会被限制在这个范围内 */
  bitmap: ImageBitmap
}

export interface ResizeOptions {
  /** 最大宽度，0 表示不限制 */
  maxWidth: number
  /** 最大高度，0 表示不限制 */
  maxHeight: number
  /** 缩放百分比，100 表示原始尺寸 */
  scale: number
  format: OutputFormat
  /** 0–1，仅对 JPEG / WebP 生效 */
  quality: number
  /** 是否在缩放时保持宽高比（总是 true，保留字段便于以后扩展） */
  keepAspectRatio?: boolean
}

export function isImageFile(file: File): boolean {
  return file.type.startsWith('image/')
}

export async function loadImage(file: File): Promise<ImageSource> {
  const bitmap = await createImageBitmap(file)
  if (bitmap.width * bitmap.height > MAX_PIXELS) {
    bitmap.close()
    throw new Error('图片像素过大（超过 4000 万像素），请先在其他工具中缩小')
  }
  return { file, width: bitmap.width, height: bitmap.height, bitmap }
}

/** 计算目标尺寸：先按百分比缩放，再按最大边长等比收缩，且不会放大。 */
export function computeTargetSize(
  width: number,
  height: number,
  options: Pick<ResizeOptions, 'maxWidth' | 'maxHeight' | 'scale'>,
): { width: number; height: number } {
  // 这个函数必须总是返回有限的正整数：非法的 scale / 尺寸会让结果变成 NaN，
  // 而 NaN 会一路流到界面上的「目标尺寸」和缩放百分比里。
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return { width: 1, height: 1 }
  }

  const scale = Number.isFinite(options.scale) && options.scale > 0 ? options.scale : 100
  const widthLimit =
    Number.isFinite(options.maxWidth) && options.maxWidth > 0 ? options.maxWidth : Number.POSITIVE_INFINITY
  const heightLimit =
    Number.isFinite(options.maxHeight) && options.maxHeight > 0 ? options.maxHeight : Number.POSITIVE_INFINITY

  let targetWidth = width * (scale / 100)
  let targetHeight = height * (scale / 100)

  const ratio = Math.min(widthLimit / targetWidth, heightLimit / targetHeight, 1)
  targetWidth *= ratio
  targetHeight *= ratio

  return {
    width: Math.max(1, Math.round(targetWidth)),
    height: Math.max(1, Math.round(targetHeight)),
  }
}

export interface ProcessedImage {
  blob: Blob
  width: number
  height: number
  format: OutputFormat
  /** 与原图相比的体积变化比例，负数表示变小 */
  sizeDelta: number
}

export async function processImage(
  source: ImageSource,
  options: ResizeOptions,
): Promise<ProcessedImage> {
  const target = computeTargetSize(source.width, source.height, options)

  const canvas = document.createElement('canvas')
  canvas.width = target.width
  canvas.height = target.height

  const context = canvas.getContext('2d')
  if (!context) throw new Error('当前浏览器不支持 Canvas 2D')

  // JPEG 不支持透明，先铺白底，避免透明区域变成黑色
  if (options.format === 'image/jpeg') {
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, target.width, target.height)
  }
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(source.bitmap, 0, 0, target.width, target.height)

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(
      resolve,
      options.format,
      options.format === 'image/png' ? undefined : options.quality,
    )
  })

  if (!blob) throw new Error('导出失败，可能是格式或尺寸不受支持')

  return {
    blob,
    width: target.width,
    height: target.height,
    format: options.format,
    sizeDelta: (blob.size - source.file.size) / source.file.size,
  }
}

export function extensionFor(format: OutputFormat): string {
  if (format === 'image/jpeg') return 'jpg'
  if (format === 'image/webp') return 'webp'
  return 'png'
}

/** 去掉原扩展名，换成目标格式的扩展名。 */
export function outputFileName(name: string, format: OutputFormat): string {
  const base = name.replace(/\.[^./\\]+$/, '') || 'image'
  return `${base}.${extensionFor(format)}`
}

/** 网格采样出主色，用于预览与配色参考。 */
export function averageColor(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
): { r: number; g: number; b: number } {
  const { data } = context.getImageData(0, 0, width, height)
  let r = 0
  let g = 0
  let b = 0
  let count = 0

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 16) continue
    r += data[i]
    g += data[i + 1]
    b += data[i + 2]
    count += 1
  }

  if (count === 0) return { r: 0, g: 0, b: 0 }
  return { r: Math.round(r / count), g: Math.round(g / count), b: Math.round(b / count) }
}
