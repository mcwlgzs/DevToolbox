import { useMemo, useState } from 'react'
import {
  EraserIcon,
  KeyRoundIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  SparklesIcon,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CopyButton } from '@/components/copy-button'
import { IoPanel } from '@/components/io-panel'
import { PersistentPanel } from '@/components/persistent-panel'
import { Stat, StatGrid } from '@/components/stat'
import { useNow } from '@/hooks/use-now'
import { decodeBase64 } from '@/lib/base64'
import { KEY_FORMATS, type KeyFormat } from '@/lib/hmac'
import {
  JWT_ALGORITHMS,
  JWT_SAMPLE_PAYLOAD,
  JWT_SAMPLE_TOKEN,
  decodeSegmentJson,
  signJwt,
  verifyJwt,
} from '@/lib/jwt'
import { formatCount } from '@/lib/format'
import { cn } from '@/lib/utils'

const TIME_CLAIMS: Record<string, string> = {
  exp: '过期时间',
  nbf: '生效时间',
  iat: '签发时间',
  auth_time: '认证时间',
  updated_at: '更新时间',
}

const CLAIM_PRESETS: ReadonlyArray<{ key: string; label: string; hint: string }> = [
  { key: 'sub', label: 'sub 主体', hint: '标识这个 Token 属于谁，通常是用户 ID' },
  { key: 'name', label: 'name 名称', hint: '显示名，可选' },
  { key: 'role', label: 'role 角色', hint: '常见于简易权限模型' },
  { key: 'iss', label: 'iss 签发者', hint: '签发这个 Token 的服务' },
  { key: 'aud', label: 'aud 受众', hint: '这个 Token 打算给谁用' },
  { key: 'jti', label: 'jti 编号', hint: 'Token 的唯一 ID，便于吊销' },
]

/* ------------------------------------------------------------------ */
/* 解析                                                                */
/* ------------------------------------------------------------------ */

interface Decoded {
  header: unknown
  payload: unknown
  signature: string
  headerText: string
  payloadText: string
  error: string | null
  warnings: string[]
}

const EMPTY: Decoded = {
  header: null,
  payload: null,
  signature: '',
  headerText: '',
  payloadText: '',
  error: null,
  warnings: [],
}

function decodeSegment(segment: string): { text: string; value: unknown; error: string | null } {
  const decoded = decodeBase64(segment)
  if (!decoded.ok) return { text: '', value: null, error: decoded.error }

  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(decoded.bytes)
  } catch {
    text = new TextDecoder('utf-8').decode(decoded.bytes)
  }

  try {
    return { text: JSON.stringify(JSON.parse(text), null, 2), value: JSON.parse(text), error: null }
  } catch {
    return { text, value: null, error: '该段是合法的 Base64URL，但不是有效的 JSON' }
  }
}

function parseToken(raw: string): Decoded {
  const token = raw.trim()
  if (!token) return EMPTY

  const segments = token.split('.')
  if (segments.length < 2) {
    return { ...EMPTY, error: 'JWT 至少包含两段（Header.Payload），当前输入没有 “.” 分隔符' }
  }
  if (segments.length > 3) {
    return { ...EMPTY, error: `JWT 通常由 3 段组成，当前检测到 ${segments.length} 段` }
  }

  const [headerSegment, payloadSegment, signatureSegment = ''] = segments
  const header = decodeSegment(headerSegment)
  const payload = decodeSegment(payloadSegment)

  const error = header.error
    ? `Header 解析失败：${header.error}`
    : payload.error
      ? `Payload 解析失败：${payload.error}`
      : null

  const warnings: string[] = []
  if (segments.length === 2) warnings.push('缺少第三段签名，这通常是未签名的 JWT')

  const algorithm =
    header.value && typeof header.value === 'object'
      ? String((header.value as Record<string, unknown>).alg ?? '')
      : ''
  if (algorithm.toLowerCase() === 'none') {
    warnings.push('alg 为 none：该 Token 未签名，不可用于任何鉴权场景')
  }

  return {
    header: header.value,
    payload: payload.value,
    signature: signatureSegment,
    headerText: header.text,
    payloadText: payload.text,
    error,
    warnings,
  }
}

function formatTimestamp(value: unknown): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  const ms = value > 1e12 ? value : value * 1000
  const date = new Date(ms)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString().replace('T', ' ').replace('.000Z', ' UTC')
}

function ParseTab() {
  const [token, setToken] = useState('')
  const nowMs = useNow()
  const decoded = useMemo(() => parseToken(token), [token])

  const claims = useMemo(() => {
    if (!decoded.payload || typeof decoded.payload !== 'object') return []
    return Object.entries(decoded.payload as Record<string, unknown>).map(([key, value]) => ({
      key,
      value: typeof value === 'string' ? value : JSON.stringify(value),
      time: formatTimestamp(value),
    }))
  }, [decoded.payload])

  const expiration = useMemo(() => {
    if (!decoded.payload || typeof decoded.payload !== 'object') return null
    const exp = (decoded.payload as Record<string, unknown>).exp
    const formatted = formatTimestamp(exp)
    if (!formatted || typeof exp !== 'number') return null
    const ms = exp > 1e12 ? exp : exp * 1000
    return { formatted, expired: nowMs > 0 && ms < nowMs }
  }, [decoded.payload, nowMs])

  const algorithm =
    decoded.header && typeof decoded.header === 'object'
      ? String((decoded.header as Record<string, unknown>).alg ?? '—')
      : '—'

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl border border-border/70 bg-card/40 px-5 py-4">
        <div className="flex items-center gap-2">
          <KeyRoundIcon className="size-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">签名算法</span>
          <Badge variant="secondary" className="font-mono text-[11px]">
            {algorithm}
          </Badge>
        </div>

        {expiration ? (
          <Badge
            variant="outline"
            className={cn(
              'gap-1 text-[11px]',
              expiration.expired
                ? 'border-destructive/40 bg-destructive/10 text-destructive'
                : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
            )}
          >
            {expiration.expired ? <ShieldAlertIcon className="size-3" /> : <ShieldCheckIcon className="size-3" />}
            {expiration.expired ? '已过期' : '未过期'} · exp {expiration.formatted}
          </Badge>
        ) : null}

        <p className="ml-auto text-xs text-muted-foreground">
          解析只是解码，不代表签名有效；需要校验请切到「验签」
        </p>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <IoPanel
          title="JWT 输入"
          description="粘贴完整的 Token（Header.Payload.Signature）"
          action={
            <Badge variant="secondary" className="font-mono text-[11px]">
              {token.trim() ? `${token.trim().split('.').length} 段` : '等待输入'}
            </Badge>
          }
          value={token}
          onValueChange={setToken}
          autoFocus
          spellCheck={false}
          placeholder={JWT_SAMPLE_TOKEN}
          error={decoded.error}
          warnings={decoded.warnings}
          textareaClassName="min-h-[220px]"
          toolbar={
            <>
              <Button variant="outline" size="sm" onClick={() => setToken(JWT_SAMPLE_TOKEN)}>
                <SparklesIcon />
                示例
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                onClick={() => setToken('')}
              >
                <EraserIcon />
                清空
              </Button>
            </>
          }
        />

        <div className="flex flex-col gap-4">
          <IoPanel
            title="Header"
            description="描述签名算法与类型"
            action={<CopyButton value={decoded.headerText} label="" variant="ghost" size="icon-sm" />}
            value={decoded.headerText}
            readOnly
            placeholder="解码后的 Header 会显示在这里"
            textareaClassName="min-h-[120px]"
          />
          <IoPanel
            title="Payload"
            description="业务声明（claims），任何人都能解码查看"
            action={<CopyButton value={decoded.payloadText} label="" variant="ghost" size="icon-sm" />}
            value={decoded.payloadText}
            readOnly
            placeholder="解码后的 Payload 会显示在这里"
            textareaClassName="min-h-[180px]"
          />
        </div>
      </div>

      {claims.length > 0 ? (
        <section className="flex flex-col gap-3 rounded-xl border border-border/70 bg-card/40 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold">声明（Claims）</h2>
            <Badge variant="outline" className="text-[11px]">
              {claims.length} 项
            </Badge>
          </div>
          <div className="overflow-hidden rounded-lg border border-border/60">
            <table aria-label="JWT 声明" className="w-full text-left text-xs">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">名称</th>
                  <th className="px-3 py-2 font-medium">值</th>
                  <th className="px-3 py-2 font-medium">解析为时间</th>
                </tr>
              </thead>
              <tbody>
                {claims.map((claim) => (
                  <tr key={claim.key} className="border-t border-border/50">
                    <td className="px-3 py-2 align-top font-mono break-all">
                      {claim.key}
                      {TIME_CLAIMS[claim.key] ? (
                        <span className="ml-1 text-[10px] text-muted-foreground">
                          {TIME_CLAIMS[claim.key]}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 align-top font-mono break-all">{claim.value}</td>
                    <td className="px-3 py-2 align-top font-mono break-all text-muted-foreground">
                      {claim.time ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {token.trim() ? (
        <StatGrid>
          <Stat label="状态" value={decoded.error ? '解析失败' : '解析成功'} />
          <Stat label="段数" value={String(token.trim().split('.').length)} hint="标准为 3 段" />
          <Stat label="签名算法" value={algorithm} />
          <Stat label="声明数" value={claims.length ? String(claims.length) : '—'} />
          <Stat
            label="过期时间"
            value={expiration ? expiration.formatted.slice(0, 19) : '—'}
            hint={expiration ? (expiration.expired ? '已过期' : '仍有效') : '未设置 exp'}
          />
          <Stat
            label="签名段长度"
            value={decoded.signature ? String(decoded.signature.length) : '—'}
            hint="Base64URL 字符数"
          />
        </StatGrid>
      ) : null}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 签发                                                                */
/* ------------------------------------------------------------------ */

/** 剩余有效期选项；value 本身就是秒数，直接传给 signJwt。 */
const LIFETIME_CHOICES: ReadonlyArray<{ value: string; label: string }> = [
  { value: '900', label: '15 分钟' },
  { value: '3600', label: '1 小时' },
  { value: '86400', label: '1 天' },
  { value: '604800', label: '7 天' },
  { value: '2592000', label: '30 天' },
]

function SignTab() {
  const [payloadText, setPayloadText] = useState('')
  const [secret, setSecret] = useState('')
  const [keyFormat, setKeyFormat] = useState<KeyFormat>('text')
  const [addIssuedAt, setAddIssuedAt] = useState(true)
  const [lifetime, setLifetime] = useState('no-exp')
  const [withExp, setWithExp] = useState(true)

  const signed = useMemo(() => {
    if (!payloadText.trim()) return null
    // exp 的补齐交给 signJwt 处理：时间戳是「脏」输入，不该在渲染期读取
    const expiresIn = withExp && lifetime !== 'no-exp' ? Number(lifetime) : undefined
    return signJwt(payloadText, secret, { keyFormat, addIssuedAt, expiresIn })
  }, [payloadText, secret, keyFormat, addIssuedAt, lifetime, withExp])

  const token = signed && signed.ok ? signed.token : ''
  const error = signed && !signed.ok ? signed.error : null

  // 字段数直接数最终 Token 里的键，避免把「自动补齐」的选项重复计入
  const payloadFieldCount = useMemo(() => {
    if (!signed || !signed.ok) return '—'
    const decoded = decodeSegmentJson(signed.payload)
    if (decoded.error || !decoded.value || typeof decoded.value !== 'object') return '—'
    return String(Object.keys(decoded.value as Record<string, unknown>).length)
  }, [signed])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl border border-border/70 bg-card/40 px-5 py-4">
        <div className="flex flex-col gap-2">
          <Label className="text-xs text-muted-foreground">签名算法</Label>
          <Select value="HS256" disabled>
            <SelectTrigger className="w-[220px]" size="sm" aria-label="签名算法">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {JWT_ALGORITHMS.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-2">
          <Label className="text-xs text-muted-foreground">密钥写法</Label>
          <Select value={keyFormat} onValueChange={(value) => setKeyFormat(value as KeyFormat)}>
            <SelectTrigger className="w-[170px]" size="sm" aria-label="密钥写法">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {KEY_FORMATS.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-2">
          <Label className="text-xs text-muted-foreground">有效期</Label>
          <div className="flex items-center gap-2">
            <Select value={lifetime} onValueChange={setLifetime} disabled={!withExp}>
              <SelectTrigger className="w-[140px]" size="sm" aria-label="有效期">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="no-exp">不设置</SelectItem>
                {LIFETIME_CHOICES.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-1.5">
              <Switch id="with-exp" checked={withExp} onCheckedChange={setWithExp} />
              <Label htmlFor="with-exp" className="text-xs text-muted-foreground">
                自动补 exp
              </Label>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 pb-1.5">
          <Switch id="add-iat" checked={addIssuedAt} onCheckedChange={setAddIssuedAt} />
          <Label htmlFor="add-iat" className="text-xs text-muted-foreground">
            自动补 iat
          </Label>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2 pb-0.5">
          <Button variant="outline" size="sm" onClick={() => setPayloadText(JWT_SAMPLE_PAYLOAD)}>
            <SparklesIcon />
            示例
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            disabled={!payloadText && !secret}
            onClick={() => {
              setPayloadText('')
              setSecret('')
            }}
          >
            <EraserIcon />
            清空
          </Button>
        </div>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <IoPanel
          title="Payload（JSON）"
          description="要放进 Token 的业务数据；exp / iat 由上方选项自动补齐"
          value={payloadText}
          onValueChange={setPayloadText}
          spellCheck={false}
          placeholder={'{\n  "sub": "1234567890",\n  "name": "张三"\n}'}
          textareaClassName="min-h-[200px]"
          toolbar={CLAIM_PRESETS.map((preset) => (
            <Button
              key={preset.key}
              variant="outline"
              size="sm"
              title={preset.hint}
              onClick={() => {
                let current: Record<string, unknown> = {}
                try {
                  const parsed: unknown = JSON.parse(payloadText || '{}')
                  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                    current = parsed as Record<string, unknown>
                  }
                } catch {
                  current = {}
                }
                if (current[preset.key] !== undefined) return
                current[preset.key] = ''
                setPayloadText(JSON.stringify(current, null, 2))
              }}
            >
              + {preset.label}
            </Button>
          ))}
        />

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2 rounded-xl border border-border/70 bg-card/40 px-5 py-4">
            <Label htmlFor="jwt-secret" className="text-xs text-muted-foreground">
              签名密钥（HMAC secret）
            </Label>
            <Input
              id="jwt-secret"
              type="text"
              value={secret}
              spellCheck={false}
              autoComplete="off"
              className="font-mono"
              placeholder="your-256-bit-secret"
              onChange={(event) => setSecret(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              密钥只参与本地计算，不会被发送；长期有效的生产密钥请不要粘贴到任何在线页面。
            </p>
          </div>

          <IoPanel
            title="生成的 Token"
            description={token ? '可直接用于本地调试' : '填写 Payload 与密钥后自动生成'}
            value={token}
            readOnly
            placeholder="生成的 JWT 会显示在这里"
            error={error}
            textareaClassName="min-h-[160px]"
            footer={<CopyButton value={token} />}
          />
        </div>
      </div>

      {token ? (
        <StatGrid>
          <Stat label="算法" value="HS256" hint="HMAC-SHA256" />
          <Stat label="Token 长度" value={formatCount(token.length)} hint="字符" />
          <Stat label="段数" value={String(token.split('.').length)} />
          <Stat
            label="密钥长度"
            value={keyFormat === 'text' ? String(new TextEncoder().encode(secret).length) : '—'}
            hint={keyFormat === 'text' ? 'UTF-8 字节' : '按所选写法解释'}
          />
          <Stat label="Payload 字段" value={payloadFieldCount} hint="最终 Token 里的字段数" />
          <Stat label="状态" value={secret ? '已签名' : '缺少密钥'} />
        </StatGrid>
      ) : null}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 验签                                                                */
/* ------------------------------------------------------------------ */

function VerifyTab() {
  const [token, setToken] = useState('')
  const [secret, setSecret] = useState('')
  const [keyFormat, setKeyFormat] = useState<KeyFormat>('text')

  const result = useMemo(
    () => (token.trim() ? verifyJwt(token, secret, { keyFormat }) : null),
    [token, secret, keyFormat],
  )

  const state = !result
    ? 'idle'
    : result.error
      ? 'error'
      : result.valid
        ? 'valid'
        : 'invalid'

  return (
    <div className="flex flex-col gap-4">
      <div
        className={cn(
          'flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border px-5 py-4 text-sm',
          state === 'valid' && 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
          state === 'invalid' && 'border-destructive/40 bg-destructive/10 text-destructive',
          state === 'error' && 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400',
          state === 'idle' && 'border-border/70 bg-card/40 text-muted-foreground',
        )}
      >
        {state === 'valid' ? <ShieldCheckIcon className="size-4" /> : null}
        {state === 'invalid' || state === 'error' ? <ShieldAlertIcon className="size-4" /> : null}
        <span className="font-medium">
          {state === 'idle' && '等待输入：粘贴 Token 与密钥后自动校验'}
          {state === 'valid' && '签名有效：内容与密钥完全匹配'}
          {state === 'invalid' && '签名不匹配：Token 被篡改，或密钥不对'}
          {state === 'error' && (result?.error ?? '无法校验')}
        </span>
        {state !== 'idle' && result?.algorithm && result.algorithm !== '—' ? (
          <Badge variant="outline" className="ml-auto font-mono text-[11px]">
            {result.algorithm}
          </Badge>
        ) : null}
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <IoPanel
          title="待校验的 Token"
          description="完整的 Header.Payload.Signature"
          value={token}
          onValueChange={setToken}
          spellCheck={false}
          placeholder={JWT_SAMPLE_TOKEN}
          textareaClassName="min-h-[200px]"
          warnings={result?.warnings}
          toolbar={
            <>
              <Button variant="outline" size="sm" onClick={() => setToken(JWT_SAMPLE_TOKEN)}>
                <SparklesIcon />
                示例
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                onClick={() => setToken('')}
              >
                <EraserIcon />
                清空
              </Button>
            </>
          }
        />

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2 rounded-xl border border-border/70 bg-card/40 px-5 py-4">
            <Label htmlFor="verify-secret" className="text-xs text-muted-foreground">
              验签密钥
            </Label>
            <Input
              id="verify-secret"
              value={secret}
              spellCheck={false}
              autoComplete="off"
              className="font-mono"
              placeholder="your-256-bit-secret"
              onChange={(event) => setSecret(event.target.value)}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Select value={keyFormat} onValueChange={(value) => setKeyFormat(value as KeyFormat)}>
                <SelectTrigger className="w-[170px]" size="sm" aria-label="密钥写法">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {KEY_FORMATS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-xs text-muted-foreground">
                比较使用定长算法，不会因为逐字符比较而泄露前缀
              </span>
            </div>
          </div>

          <IoPanel
            title="解析出的 Payload"
            description="签名有效也不代表内容可信，仍要检查 exp 与业务字段"
            action={
              <CopyButton
                value={result?.payload ? JSON.stringify(result.payload, null, 2) : ''}
                label=""
                variant="ghost"
                size="icon-sm"
              />
            }
            value={result?.payload ? JSON.stringify(result.payload, null, 2) : ''}
            readOnly
            placeholder="Payload 会显示在这里"
            textareaClassName="min-h-[160px]"
          />
        </div>
      </div>

      {result ? (
        <StatGrid>
          <Stat label="签名校验" value={result.valid ? '通过' : '未通过'} hint={result.error ?? undefined} />
          <Stat label="算法" value={result.algorithm} hint={result.algorithm === 'HS256' ? '已支持' : '不支持'} />
          <Stat
            label="过期状态"
            value={result.expired === null ? '未设置 exp' : result.expired ? '已过期' : '仍有效'}
          />
          <Stat
            label="生效状态"
            value={result.notYetValid === null ? '未设置 nbf' : result.notYetValid ? '尚未生效' : '已生效'}
          />
          <Stat label="密钥写法" value={KEY_FORMATS.find((item) => item.value === keyFormat)?.label ?? keyFormat} />
          <Stat label="Token 长度" value={formatCount(token.trim().length)} hint="字符" />
        </StatGrid>
      ) : null}
    </div>
  )
}

/* ------------------------------------------------------------------ */

export function JwtTool() {
  return (
    <Tabs defaultValue="parse" className="gap-4">
      <TabsList>
        <TabsTrigger value="parse">解析</TabsTrigger>
        <TabsTrigger value="sign">签发</TabsTrigger>
        <TabsTrigger value="verify">验签</TabsTrigger>
      </TabsList>

      {/* 常驻挂载：粘贴 Token 后切到「签发」再切回来，内容不该消失 */}
      <PersistentPanel value="parse">
        <ParseTab />
      </PersistentPanel>
      <PersistentPanel value="sign">
        <SignTab />
      </PersistentPanel>
      <PersistentPanel value="verify">
        <VerifyTab />
      </PersistentPanel>
    </Tabs>
  )
}
