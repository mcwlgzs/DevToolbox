import { useMemo, useState } from 'react'
import { EraserIcon, ShieldAlertIcon, SparklesIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { CopyButton } from '@/components/copy-button'
import { IoPanel } from '@/components/io-panel'
import { Stat, StatGrid } from '@/components/stat'
import { HMAC_ALGORITHMS, KEY_FORMATS, hmacAll, parseKey, type HmacAlgorithm, type KeyFormat } from '@/lib/hmac'
import { formatCount } from '@/lib/format'
import { cn } from '@/lib/utils'

const ALGORITHM_NOTES: Record<HmacAlgorithm, string> = {
  sha256: '推荐：GitHub Webhook、AWS Signature V4、Stripe 等主流服务使用',
  sha1: '旧系统兼容：部分早期 API 与 OAuth 1.0 仍在使用',
  md5: '旧系统兼容：已不推荐用于新系统',
}

export function HmacTool() {
  const [key, setKey] = useState('')
  const [keyFormat, setKeyFormat] = useState<KeyFormat>('text')
  const [message, setMessage] = useState('')

  const parsedKey = useMemo(() => parseKey(key, keyFormat), [key, keyFormat])

  const results = useMemo(() => {
    if (!parsedKey.bytes || !message) return []
    return hmacAll(parsedKey.bytes, new TextEncoder().encode(message))
  }, [parsedKey.bytes, message])

  const keyBytes = parsedKey.bytes?.length ?? 0
  const hasInput = Boolean(parsedKey.bytes) && message.length > 0

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3 rounded-xl border border-border/70 bg-card/40 px-5 py-4">
        <div className="flex flex-col gap-2">
          <Label className="text-xs text-muted-foreground">密钥格式</Label>
          <Select value={keyFormat} onValueChange={(value) => setKeyFormat(value as KeyFormat)}>
            <SelectTrigger className="w-[170px]" size="sm" aria-label="密钥格式">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {KEY_FORMATS.map((format) => (
                <SelectItem key={format.value} value={format.value}>
                  {format.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex min-w-[260px] flex-1 flex-col gap-2">
          <Label htmlFor="hmac-key" className="text-xs text-muted-foreground">
            密钥（Secret）
          </Label>
          <input
            id="hmac-key"
            type="text"
            value={key}
            onChange={(event) => setKey(event.target.value)}
            spellCheck={false}
            autoComplete="off"
            placeholder={
              keyFormat === 'text' ? 'my-secret-key' : keyFormat === 'hex' ? '6d792d736563726574' : 'bXktc2VjcmV0'
            }
            className={cn(
              'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 font-mono text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30',
              parsedKey.error && 'border-destructive/60',
            )}
          />
        </div>

        <div className="flex items-center gap-2 pb-1.5">
          <Badge variant="outline" className="font-mono text-[11px]">
            {formatCount(keyBytes)} 字节
          </Badge>
        </div>

        <Button
          variant="outline"
          size="sm"
          className="mb-0.5"
          onClick={() => {
            setKey('my-secret-key')
            setKeyFormat('text')
            setMessage('hello world')
          }}
        >
          <SparklesIcon />
          示例
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="mb-0.5 text-muted-foreground"
          disabled={!key && !message}
          onClick={() => {
            setKey('')
            setMessage('')
          }}
        >
          <EraserIcon />
          清空
        </Button>
      </div>

      {parsedKey.error ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {parsedKey.error}
        </p>
      ) : null}

      <p className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
        <ShieldAlertIcon className="mt-px size-3.5 shrink-0" />
        <span>
          密钥只在你的浏览器内存中参与计算，页面不会把它发送到任何地方。但仍建议用测试密钥试跑，
          不要在生产环境粘贴长期有效的真实密钥。
        </span>
      </p>

      <IoPanel
        title="待签名的消息"
        description="通常是要签名的请求体、查询串或时间戳"
        action={
          <Badge variant="secondary" className="font-mono text-[11px]">
            {formatCount(message.length)} 字符
          </Badge>
        }
        value={message}
        onValueChange={setMessage}
        autoFocus
        spellCheck={false}
        placeholder="例如 timestamp=1700000000&nonce=abc"
        textareaClassName="min-h-[140px]"
      />

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold">签名结果</h2>
          {!hasInput ? (
            <span className="text-xs text-muted-foreground">填写密钥与消息后自动计算</span>
          ) : null}
        </div>

        <div className="grid gap-3 lg:grid-cols-3">
          {HMAC_ALGORITHMS.map((meta) => {
            const row = results.find((item) => item.algorithm === meta.value)
            const label = meta.label.replace('HMAC-', '').replace(/\s*（.*）$/, '')
            return (
              <article key={meta.value} className="flex flex-col gap-2 rounded-xl border border-border/70 bg-card/40 p-4">
                <header className="flex items-center gap-2">
                  <h3 className="font-mono text-sm font-semibold">{label}</h3>
                  {row ? (
                    <Badge variant="outline" className="ml-auto font-mono text-[10px]">
                      {row.hex.length * 4} bit
                    </Badge>
                  ) : null}
                </header>
                <code className="font-mono text-[11px] leading-relaxed break-all">{row?.hex || '—'}</code>
                <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
                  <CopyButton value={row?.hex ?? ''} label="复制 HEX" size="xs" />
                  <CopyButton value={row?.base64 ?? ''} label="复制 Base64" variant="secondary" size="xs" />
                </div>
                <p className="text-[11px] text-muted-foreground">{ALGORITHM_NOTES[meta.value]}</p>
              </article>
            )
          })}
        </div>
      </section>

      {hasInput ? (
        <StatGrid>
          <Stat label="密钥长度" value={`${keyBytes} 字节`} hint={keyBytes > 64 ? '超过 64 字节会先被哈希' : '未超过分组长度'} />
          <Stat label="消息长度" value={`${formatCount(message.length)} 字符`} hint={`${formatCount(new TextEncoder().encode(message).length)} 字节`} />
          <Stat label="算法数量" value="3 种" hint="SHA-256 / SHA-1 / MD5" />
          <Stat label="推荐算法" value="HMAC-SHA256" />
          <Stat label="实现方式" value="纯 JS" hint="不依赖 Web Crypto，file:// 也可用" />
          <Stat label="密钥格式" value={KEY_FORMATS.find((item) => item.value === keyFormat)?.label ?? keyFormat} />
        </StatGrid>
      ) : null}
    </div>
  )
}
