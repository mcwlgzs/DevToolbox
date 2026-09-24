import { useMemo, useState } from 'react'
import { ArrowLeftRightIcon, EraserIcon, SparklesIcon } from 'lucide-react'
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
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CopyButton } from '@/components/copy-button'
import { IoPanel } from '@/components/io-panel'
import { Stat, StatGrid } from '@/components/stat'
import {
  BASES,
  DECODE_ENCODINGS,
  UNICODE_STYLES,
  bytesToHex,
  bytesToPercent,
  convertBase,
  decodeBytesWithEncoding,
  decodeHtmlEntities,
  encodeHtmlEntities,
  fromUnicodeEscapes,
  groupDigits,
  parseByteInput,
  textToUtf8Bytes,
  toUnicodeEscapes,
  type UnicodeStyle,
} from '@/lib/encoding'
import { formatCount } from '@/lib/format'

type Direction = 'encode' | 'decode'

export function EncodingTool() {
  /* ---------------- HTML 实体 ---------------- */
  const [htmlInput, setHtmlInput] = useState('')
  const [htmlDirection, setHtmlDirection] = useState<Direction>('encode')
  const [encodeAll, setEncodeAll] = useState(false)

  const htmlOutput = useMemo(() => {
    if (!htmlInput) return ''
    return htmlDirection === 'encode'
      ? encodeHtmlEntities(htmlInput, encodeAll)
      : decodeHtmlEntities(htmlInput)
  }, [htmlInput, htmlDirection, encodeAll])

  /* ---------------- Unicode 转义 ---------------- */
  const [unicodeInput, setUnicodeInput] = useState('')
  const [unicodeDirection, setUnicodeDirection] = useState<Direction>('encode')
  const [unicodeStyle, setUnicodeStyle] = useState<UnicodeStyle>('js')
  const [escapeAll, setEscapeAll] = useState(false)

  const unicodeOutput = useMemo(() => {
    if (!unicodeInput) return ''
    return unicodeDirection === 'encode'
      ? toUnicodeEscapes(unicodeInput, unicodeStyle, escapeAll)
      : fromUnicodeEscapes(unicodeInput)
  }, [unicodeInput, unicodeDirection, unicodeStyle, escapeAll])

  /* ---------------- 进制转换 ---------------- */
  const [baseInput, setBaseInput] = useState('')
  const [fromBase, setFromBase] = useState(16)
  const [toBase, setToBase] = useState(10)
  const [groupSize, setGroupSize] = useState(4)

  const baseResult = useMemo(() => {
    if (!baseInput.trim()) return { value: '', error: null as string | null, decimal: '' }
    const value = convertBase(baseInput, fromBase, toBase)
    return {
      value: value ?? '',
      error: value === null ? `输入不是合法的 ${fromBase} 进制数` : null,
      decimal: convertBase(baseInput, fromBase, 10) ?? '',
    }
  }, [baseInput, fromBase, toBase])

  const groupedBase = useMemo(
    () => (baseResult.value && groupSize > 0 ? groupDigits(baseResult.value, groupSize) : ''),
    [baseResult.value, groupSize],
  )

  /* ---------------- 字节 ⇄ 文本 ---------------- */
  const [byteInput, setByteInput] = useState('')
  const [byteEncoding, setByteEncoding] = useState('utf-8')
  const [textInput, setTextInput] = useState('')

  const byteResult = useMemo(() => {
    const parsed = parseByteInput(byteInput)
    if (parsed.error) return { text: '', error: parsed.error, hex: '', percent: '', bytes: 0 }
    const decoded = decodeBytesWithEncoding(parsed.bytes, byteEncoding)
    return {
      text: decoded.text,
      error: decoded.error,
      hex: bytesToHex(parsed.bytes),
      percent: bytesToPercent(parsed.bytes),
      bytes: parsed.bytes.length,
    }
  }, [byteInput, byteEncoding])

  const textBytes = useMemo(() => {
    if (!textInput) return { hex: '', percent: '', utf8: '', bytes: 0 }
    const bytes = textToUtf8Bytes(textInput)
    return {
      hex: bytesToHex(bytes),
      percent: bytesToPercent(bytes),
      utf8: '',
      bytes: bytes.length,
    }
  }, [textInput])

  return (
    <Tabs defaultValue="html" className="gap-4">
      <TabsList className="w-full max-w-2xl">
        <TabsTrigger value="html">HTML 实体</TabsTrigger>
        <TabsTrigger value="unicode">Unicode 转义</TabsTrigger>
        <TabsTrigger value="base">进制转换</TabsTrigger>
        <TabsTrigger value="bytes">字节与文本</TabsTrigger>
      </TabsList>

      {/* ------------------------------ HTML 实体 ------------------------------ */}
      <TabsContent value="html" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl border border-border/70 bg-card/40 px-5 py-4">
          <div className="flex flex-col gap-2">
            <Label className="text-xs text-muted-foreground">方向</Label>
            <Select
              value={htmlDirection}
              onValueChange={(value) => setHtmlDirection(value as Direction)}
            >
              <SelectTrigger aria-label="方向" className="w-[150px]" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="encode">编码为实体</SelectItem>
                <SelectItem value="decode">实体还原为字符</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2 pb-1.5">
            <Switch id="encode-all" checked={encodeAll} onCheckedChange={setEncodeAll} disabled={htmlDirection === 'decode'} />
            <Label htmlFor="encode-all" className="text-xs text-muted-foreground">
              全部转为数字实体（排查乱码用）
            </Label>
          </div>
        </div>

        <div className="grid items-start gap-4 lg:grid-cols-2">
          <IoPanel
            title={htmlDirection === 'encode' ? '原始 HTML' : '含实体的文本'}
            description={htmlDirection === 'encode' ? '输入需要转义的 HTML 片段' : '粘贴包含 &amp;lt; 等实体的内容'}
            value={htmlInput}
            onValueChange={setHtmlInput}
            autoFocus
            spellCheck={false}
            placeholder={htmlDirection === 'encode' ? '<a href="?a=1&b=2">链接</a>' : '&lt;a href=&quot;x&quot;&gt;链接&lt;/a&gt;'}
            toolbar={
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setHtmlInput(htmlDirection === 'encode' ? '<a href="?a=1&b=2">中文 & 符号</a>' : '&lt;a href=&quot;?a=1&amp;b=2&quot;&gt;中文 &amp; 符号&lt;/a&gt;')}
                >
                  <SparklesIcon />
                  示例
                </Button>
                <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setHtmlInput('')}>
                  <EraserIcon />
                  清空
                </Button>
              </>
            }
          />
          <IoPanel
            title="转换结果"
            description="结果实时更新"
            value={htmlOutput}
            readOnly
            placeholder="转换结果会显示在这里"
            footer={<CopyButton value={htmlOutput} />}
          />
        </div>
      </TabsContent>

      {/* ------------------------------ Unicode 转义 ------------------------------ */}
      <TabsContent value="unicode" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl border border-border/70 bg-card/40 px-5 py-4">
          <div className="flex flex-col gap-2">
            <Label className="text-xs text-muted-foreground">方向</Label>
            <Select
              value={unicodeDirection}
              onValueChange={(value) => setUnicodeDirection(value as Direction)}
            >
              <SelectTrigger aria-label="方向" className="w-[150px]" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="encode">字符 → 转义</SelectItem>
                <SelectItem value="decode">转义 → 字符</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label className="text-xs text-muted-foreground">转义风格</Label>
            <Select
              value={unicodeStyle}
              onValueChange={(value) => setUnicodeStyle(value as UnicodeStyle)}
            >
              <SelectTrigger aria-label="转义风格" className="w-[210px]" size="sm" disabled={unicodeDirection === 'decode'}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {UNICODE_STYLES.map((style) => (
                  <SelectItem key={style.value} value={style.value}>
                    {style.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2 pb-1.5">
            <Switch id="escape-all" checked={escapeAll} onCheckedChange={setEscapeAll} disabled={unicodeDirection === 'decode'} />
            <Label htmlFor="escape-all" className="text-xs text-muted-foreground">
              连 ASCII 一起转义
            </Label>
          </div>
        </div>

        <div className="grid items-start gap-4 lg:grid-cols-2">
          <IoPanel
            title={unicodeDirection === 'encode' ? '原始文本' : '含转义的文本'}
            description={unicodeDirection === 'encode' ? '非 ASCII 字符会被转义' : '支持 \\uXXXX、\\u{XXXXX}、U+XXXX、&#x;、\\xXX'}
            value={unicodeInput}
            onValueChange={setUnicodeInput}
            spellCheck={false}
            placeholder={unicodeDirection === 'encode' ? '中文 English 🚀' : '\\u4e2d\\u6587'}
            toolbar={
              <>
                <Button variant="outline" size="sm" onClick={() => setUnicodeInput(unicodeDirection === 'encode' ? '中文 English 🚀' : '\\u4e2d\\u6587 \\u0041')}>
                  <SparklesIcon />
                  示例
                </Button>
                <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setUnicodeInput('')}>
                  <EraserIcon />
                  清空
                </Button>
              </>
            }
          />
          <IoPanel
            title="转换结果"
            description="结果实时更新"
            value={unicodeOutput}
            readOnly
            placeholder="转换结果会显示在这里"
            footer={<CopyButton value={unicodeOutput} />}
          />
        </div>
      </TabsContent>

      {/* ------------------------------ 进制转换 ------------------------------ */}
      <TabsContent value="base" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end gap-x-6 gap-y-3 rounded-xl border border-border/70 bg-card/40 px-5 py-4">
          <div className="flex flex-col gap-2">
            <Label className="text-xs text-muted-foreground">源进制</Label>
            <Select value={String(fromBase)} onValueChange={(value) => setFromBase(Number(value))}>
              <SelectTrigger aria-label="源进制" className="w-[150px]" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BASES.map((base) => (
                  <SelectItem key={base.value} value={String(base.value)}>
                    {base.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            variant="secondary"
            size="icon-sm"
            className="mb-1"
            aria-label="交换源进制与目标进制"
            onClick={() => {
              setFromBase(toBase)
              setToBase(fromBase)
              setBaseInput(baseResult.value)
            }}
          >
            <ArrowLeftRightIcon />
          </Button>
          <div className="flex flex-col gap-2">
            <Label className="text-xs text-muted-foreground">目标进制</Label>
            <Select value={String(toBase)} onValueChange={(value) => setToBase(Number(value))}>
              <SelectTrigger aria-label="目标进制" className="w-[150px]" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BASES.map((base) => (
                  <SelectItem key={base.value} value={String(base.value)}>
                    {base.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label className="text-xs text-muted-foreground">分组位数</Label>
            <Select value={String(groupSize)} onValueChange={(value) => setGroupSize(Number(value))}>
              <SelectTrigger aria-label="分组位数" className="w-[130px]" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">不分组</SelectItem>
                <SelectItem value="4">每 4 位</SelectItem>
                <SelectItem value="8">每 8 位</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid items-start gap-4 lg:grid-cols-2">
          <IoPanel
            title={`${fromBase} 进制输入`}
            description="支持 0x / 0b 前缀、下划线与空格分隔，负数与超大整数均可"
            value={baseInput}
            onValueChange={setBaseInput}
            spellCheck={false}
            placeholder={fromBase === 16 ? 'ffffffffffffffff' : '255'}
            error={baseResult.error}
            toolbar={
              <>
                <Button variant="outline" size="sm" onClick={() => setBaseInput(fromBase === 16 ? 'ffffffffffffffff' : '255')}>
                  <SparklesIcon />
                  示例
                </Button>
                <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setBaseInput('')}>
                  <EraserIcon />
                  清空
                </Button>
              </>
            }
          />
          <IoPanel
            title={`${toBase} 进制结果`}
            description={groupedBase ? `分组显示：${groupedBase}` : '结果实时更新'}
            value={baseResult.value}
            readOnly
            placeholder="转换结果会显示在这里"
            footer={
              <>
                <CopyButton value={baseResult.value} />
                {groupedBase ? <CopyButton value={groupedBase} label="复制分组形式" variant="secondary" /> : null}
              </>
            }
          />
        </div>

        {baseInput.trim() ? (
          <StatGrid>
            <Stat label="解析值（十进制）" value={baseResult.decimal || '—'} />
            <Stat label="位数" value={baseResult.value ? String(baseResult.value.length) : '—'} hint={`${toBase} 进制`} />
            <Stat label="状态" value={baseResult.error ? '输入非法' : '转换成功'} />
          </StatGrid>
        ) : null}
      </TabsContent>

      {/* ------------------------------ 字节与文本 ------------------------------ */}
      <TabsContent value="bytes" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end gap-x-6 gap-y-3 rounded-xl border border-border/70 bg-card/40 px-5 py-4">
          <div className="flex flex-col gap-2">
            <Label className="text-xs text-muted-foreground">按哪种字符集解码</Label>
            <Select value={byteEncoding} onValueChange={setByteEncoding}>
              <SelectTrigger aria-label="按哪种字符集解码" className="w-[230px]" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DECODE_ENCODINGS.map((encoding) => (
                  <SelectItem key={encoding.value} value={encoding.value}>
                    {encoding.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Badge variant="outline" className="mb-1.5 text-[11px]">
            浏览器只支持编码为 UTF-8，因此「文本 → 字节」固定输出 UTF-8
          </Badge>
        </div>

        <div className="grid items-start gap-4 lg:grid-cols-2">
          <IoPanel
            title="字节 → 文本"
            description="支持 48 65、48656c、%48%65、\x48 等写法"
            action={byteResult.bytes > 0 ? <Badge variant="secondary">{formatCount(byteResult.bytes)} 字节</Badge> : null}
            value={byteInput}
            onValueChange={setByteInput}
            spellCheck={false}
            placeholder="d6 d0 ce c4（GBK 的“中文”）"
            error={byteResult.error}
            toolbar={
              <>
                <Button variant="outline" size="sm" onClick={() => setByteInput('d6 d0 ce c4')}>
                  <SparklesIcon />
                  GBK 示例
                </Button>
                <Button variant="outline" size="sm" onClick={() => setByteInput('%E4%B8%AD%E6%96%87')}>
                  <SparklesIcon />
                  UTF-8 示例
                </Button>
                <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setByteInput('')}>
                  <EraserIcon />
                  清空
                </Button>
              </>
            }
            footer={
              <>
                <CopyButton value={byteResult.text} label="复制解码结果" />
                <CopyButton value={byteResult.hex} label="复制十六进制" variant="secondary" />
                <CopyButton value={byteResult.percent} label="复制 %XX" variant="secondary" />
              </>
            }
          />

          <IoPanel
            title="解码结果"
            description="乱码时换一个字符集试试，通常能立刻看出原文"
            value={byteResult.text}
            readOnly
            placeholder="解码结果会显示在这里"
            textareaClassName="min-h-[140px]"
          />

          <IoPanel
            title="文本 → UTF-8 字节"
            description="输入文本，得到十六进制与 %XX 两种字节表示"
            action={textBytes.bytes > 0 ? <Badge variant="secondary">{formatCount(textBytes.bytes)} 字节</Badge> : null}
            value={textInput}
            onValueChange={setTextInput}
            spellCheck={false}
            placeholder="中文 English"
            textareaClassName="min-h-[140px]"
            toolbar={
              <>
                <Button variant="outline" size="sm" onClick={() => setTextInput('中文 English 🚀')}>
                  <SparklesIcon />
                  示例
                </Button>
                <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setTextInput('')}>
                  <EraserIcon />
                  清空
                </Button>
              </>
            }
          />

          <IoPanel
            title="字节表示（UTF-8）"
            description="十六进制"
            value={`${textBytes.hex}${textBytes.percent ? `\n\n${textBytes.percent}` : ''}`}
            readOnly
            placeholder="字节表示会显示在这里"
            textareaClassName="min-h-[140px]"
            footer={
              <>
                <CopyButton value={textBytes.hex} label="复制十六进制" />
                <CopyButton value={textBytes.percent} label="复制 %XX" variant="secondary" />
              </>
            }
          />
        </div>
      </TabsContent>
    </Tabs>
  )
}
