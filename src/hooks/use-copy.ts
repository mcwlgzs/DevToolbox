import { useCallback, useEffect, useRef, useState } from 'react'
import { copyToClipboard } from '@/lib/format'

/** 复制到剪贴板并在 1.6s 内保持“已复制”状态用于按钮反馈。 */
export function useCopy(resetDelay = 1600) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const timer = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current)
    }
  }, [])

  const copy = useCallback(
    async (value: string, key = 'default') => {
      const ok = await copyToClipboard(value)
      if (ok) {
        setCopiedKey(key)
        if (timer.current !== null) window.clearTimeout(timer.current)
        timer.current = window.setTimeout(() => setCopiedKey(null), resetDelay)
      }
      return ok
    },
    [resetDelay],
  )

  return { copy, copiedKey, isCopied: (key = 'default') => copiedKey === key }
}
