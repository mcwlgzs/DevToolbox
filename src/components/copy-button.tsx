import type { ComponentProps } from 'react'
import { CheckIcon, CopyIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useCopy } from '@/hooks/use-copy'

interface CopyButtonProps extends Omit<ComponentProps<typeof Button>, 'onClick' | 'value'> {
  value: string
  label?: string
  copiedLabel?: string
  disabled?: boolean
  /** 无可视文字时给屏幕阅读器用的名称；调用方可直接用 aria-label 覆盖 */
  name?: string
}

export function CopyButton({
  value,
  label = '复制',
  copiedLabel = '已复制',
  name,
  disabled,
  variant = 'outline',
  size = 'sm',
  ...props
}: CopyButtonProps) {
  const { copy, isCopied } = useCopy()
  const copied = isCopied('self')
  const blocked = disabled || value.length === 0

  // label 为空时会渲染成纯图标按钮，必须补一个可访问名称，否则读屏软件只会念出「按钮」
  const accessibleName = label ? undefined : name || (copied ? copiedLabel : '复制')

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      disabled={blocked}
      onClick={() => void copy(value, 'self')}
      aria-label={accessibleName}
      {...props}
    >
      {copied ? <CheckIcon className="text-emerald-500" /> : <CopyIcon />}
      {label ? <span>{copied ? copiedLabel : label}</span> : null}
    </Button>
  )
}
