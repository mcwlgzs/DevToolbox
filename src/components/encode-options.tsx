import type { ReactNode } from 'react'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import {
  TEXT_ENCODINGS,
  WRAP_WIDTHS,
  type B64Variant,
  type EncodeOptions,
  type TextEncoding,
} from '@/lib/base64'

interface EncodeOptionsControlsProps {
  options: EncodeOptions
  onOptionsChange: (next: EncodeOptions) => void
  encoding?: TextEncoding
  onEncodingChange?: (next: TextEncoding) => void
  disabled?: boolean
  children?: ReactNode
}

export function EncodeOptionsControls({
  options,
  onOptionsChange,
  encoding,
  onEncodingChange,
  disabled,
  children,
}: EncodeOptionsControlsProps) {
  return (
    <div className="flex flex-wrap items-end gap-x-6 gap-y-4 rounded-xl border border-border/70 bg-card/40 px-5 py-4">
      <div className="flex flex-col gap-2">
        <Label className="text-xs text-muted-foreground">字符集变体</Label>
        <Select
          disabled={disabled}
          value={options.variant}
          onValueChange={(value) => onOptionsChange({ ...options, variant: value as B64Variant })}
        >
          <SelectTrigger className="w-[160px]" size="sm" aria-label="字符集变体">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="standard">标准 (+ / =)</SelectItem>
            <SelectItem value="urlsafe">URL-Safe (- _)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {encoding && onEncodingChange ? (
        <div className="flex flex-col gap-2">
          <Label className="text-xs text-muted-foreground">文本编码</Label>
          <Select
            disabled={disabled}
            value={encoding}
            onValueChange={(value) => onEncodingChange(value as TextEncoding)}
          >
            <SelectTrigger className="w-[150px]" size="sm" aria-label="文本编码">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TEXT_ENCODINGS.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <Label className="text-xs text-muted-foreground">输出换行</Label>
        <Select
          disabled={disabled}
          value={String(options.wrap)}
          onValueChange={(value) =>
            onOptionsChange({ ...options, wrap: Number(value) as EncodeOptions['wrap'] })
          }
        >
          <SelectTrigger className="w-[170px]" size="sm" aria-label="输出换行">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {WRAP_WIDTHS.map((item) => (
              <SelectItem key={item.value} value={String(item.value)}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-2 pb-1.5">
        <Switch
          id="padding-switch"
          disabled={disabled}
          checked={options.padding}
          onCheckedChange={(checked) => onOptionsChange({ ...options, padding: checked })}
        />
        <Label htmlFor="padding-switch" className="text-xs text-muted-foreground">
          保留填充 (=)
        </Label>
      </div>

      {children}
    </div>
  )
}
