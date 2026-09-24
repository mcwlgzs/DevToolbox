export function formatBytes(bytes: number, decimals = 1): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—'
  if (bytes < 1000) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB', 'PB', 'EB']
  let value = bytes / 1024
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  return `${value.toFixed(decimals)} ${units[unitIndex]}`
}

export function formatCount(value: number): string {
  return value.toLocaleString('zh-CN')
}

export function ratioLabel(input: number, output: number): string {
  if (!input || !output) return '—'
  return `${(output / input).toFixed(2)}×`
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // 继续尝试兜底方案
  }

  try {
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(area)
    return ok
  } catch {
    return false
  }
}

export function downloadBlob(data: BlobPart, filename: string, type = 'application/octet-stream'): void {
  const url = URL.createObjectURL(new Blob([data], { type }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export function downloadText(text: string, filename: string): void {
  downloadBlob(text, filename, 'text/plain;charset=utf-8')
}

export function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return file.arrayBuffer()
}

/** 大文本预览截断，避免把几十 MB 的字符串塞进 DOM。 */
export const PREVIEW_LIMIT = 200_000

export function withPreviewLimit(value: string): { text: string; truncated: boolean } {
  if (value.length <= PREVIEW_LIMIT) return { text: value, truncated: false }
  return { text: value.slice(0, PREVIEW_LIMIT), truncated: true }
}
