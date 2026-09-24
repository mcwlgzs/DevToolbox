/** 文件选择与拖拽相关的工具函数（批量场景）。 */

/** 虚拟路径：拖入文件夹时保留相对路径，便于区分同名文件。 */
export function fileDisplayName(file: File): string {
  return file.webkitRelativePath || file.name
}

function readAllDirectoryEntries(
  reader: FileSystemDirectoryReader,
): Promise<FileSystemEntry[]> {
  return new Promise((resolve) => {
    const collected: FileSystemEntry[] = []
    const readBatch = () => {
      reader.readEntries((batch) => {
        if (batch.length === 0) {
          resolve(collected)
          return
        }
        collected.push(...batch)
        readBatch()
      }, () => resolve(collected))
    }
    readBatch()
  })
}

function entryToFile(entry: FileSystemFileEntry, prefix: string): Promise<File | null> {
  return new Promise((resolve) => {
    entry.file(
      (file) => {
        const path = `${prefix}${file.name}`
        if (path !== file.name) {
          try {
            Object.defineProperty(file, 'webkitRelativePath', { value: path })
          } catch {
            // 无法改写时退化为仅文件名
          }
        }
        resolve(file)
      },
      () => resolve(null),
    )
  })
}

async function walkEntry(entry: FileSystemEntry, prefix: string, out: File[]): Promise<void> {
  if (entry.isFile) {
    const file = await entryToFile(entry as FileSystemFileEntry, prefix)
    if (file) out.push(file)
    return
  }
  if (entry.isDirectory) {
    const directory = entry as FileSystemDirectoryEntry
    const children = await readAllDirectoryEntries(directory.createReader())
    for (const child of children) {
      await walkEntry(child, `${prefix}${entry.name}/`, out)
    }
  }
}

/**
 * 从拖拽事件收集文件，支持拖入整个文件夹（递归读取）。
 * 不支持 webkitGetAsEntry 时退化为 dataTransfer.files。
 */
export async function collectDroppedFiles(dataTransfer: DataTransfer): Promise<File[]> {
  // 必须在任何 await 之前把 files 快照下来：按 HTML 规范，拖拽数据只在 drop 事件
  // 派发期间可用，事件处理返回后 DataTransfer 进入保护模式，
  // 此时再读 dataTransfer.files 通常会得到空列表。
  const filesSnapshot = Array.from(dataTransfer.files ?? [])
  const items = Array.from(dataTransfer.items ?? [])
  const entries = items
    .filter((item) => item.kind === 'file')
    .map((item) =>
      typeof item.webkitGetAsEntry === 'function' ? item.webkitGetAsEntry() : null,
    )
    .filter((entry): entry is FileSystemEntry => entry !== null)

  if (entries.length === 0) {
    return filesSnapshot
  }

  const collected: File[] = []
  for (const entry of entries) {
    await walkEntry(entry, '', collected)
  }
  return collected.length > 0 ? collected : filesSnapshot
}

/** 合并文件列表并按虚拟路径去重 + 排序。 */
export function mergeFiles(current: readonly File[], incoming: readonly File[]): File[] {
  const map = new Map<string, File>()
  for (const file of current) map.set(fileDisplayName(file), file)
  for (const file of incoming) map.set(fileDisplayName(file), file)
  return [...map.values()].sort((a, b) =>
    fileDisplayName(a).localeCompare(fileDisplayName(b), 'zh-CN'),
  )
}

export function totalSize(files: readonly File[]): number {
  return files.reduce((sum, file) => sum + file.size, 0)
}
