import { useId, type KeyboardEvent, type ReactNode } from 'react'
import { CircleAlertIcon, TriangleAlertIcon } from 'lucide-react'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

interface IoPanelProps {
  title: string
  description?: string
  action?: ReactNode
  toolbar?: ReactNode
  footer?: ReactNode
  value: string
  onValueChange?: (value: string) => void
  onKeyDown?: (event: KeyboardEvent<HTMLTextAreaElement>) => void
  readOnly?: boolean
  autoFocus?: boolean
  placeholder?: string
  error?: string | null
  warnings?: string[]
  className?: string
  textareaClassName?: string
  spellCheck?: boolean
}

export function IoPanel({
  title,
  description,
  action,
  toolbar,
  footer,
  value,
  onValueChange,
  onKeyDown,
  readOnly = false,
  autoFocus = false,
  placeholder,
  error,
  warnings,
  className,
  textareaClassName,
  spellCheck = false,
}: IoPanelProps) {
  // 把可见的标题和输入框关联起来：读屏软件否则只会念出「编辑框」，不知道是哪个输入框
  const titleId = useId()

  return (
    <Card className={cn('gap-4 overflow-hidden py-5', className)}>
      <CardHeader className="gap-1 px-5">
        <CardTitle id={titleId} className="text-base">
          {title}
        </CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
        {action ? <CardAction>{action}</CardAction> : null}
      </CardHeader>

      <CardContent className="flex flex-col gap-3 px-5">
        {toolbar ? <div className="flex flex-wrap items-center gap-2">{toolbar}</div> : null}

        <Textarea
          value={value}
          readOnly={readOnly}
          autoFocus={autoFocus}
          spellCheck={spellCheck}
          aria-labelledby={titleId}
          onChange={(event) => onValueChange?.(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          className={cn(
            'scrollbar-thin min-h-[240px] resize-y bg-background/60 font-mono text-[13px] leading-relaxed break-all',
            error && 'border-destructive/60 focus-visible:ring-destructive/30',
            textareaClassName,
          )}
        />

        {error ? (
          <p className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            <CircleAlertIcon className="mt-px size-3.5 shrink-0" />
            <span>{error}</span>
          </p>
        ) : null}

        {warnings && warnings.length > 0 ? (
          <ul className="flex flex-col gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
            {warnings.map((warning) => (
              <li key={warning} className="flex items-start gap-2">
                <TriangleAlertIcon className="mt-px size-3.5 shrink-0" />
                <span>{warning}</span>
              </li>
            ))}
          </ul>
        ) : null}

        {footer ? <div className="flex flex-wrap items-center gap-2">{footer}</div> : null}
      </CardContent>
    </Card>
  )
}
