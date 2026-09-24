import { useMemo, useState } from 'react'
import { ArrowLeftRightIcon, DownloadIcon, EraserIcon, SparklesIcon } from 'lucide-react'
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
import { CopyButton } from '@/components/copy-button'
import { IoPanel } from '@/components/io-panel'
import { Stat, StatGrid } from '@/components/stat'
import { jsonToXml, xmlToJson } from '@/lib/xml'
import type { JsonValue } from '@/lib/xml'
import { downloadText, formatCount } from '@/lib/format'

const SAMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<catalog>
  <book id="bk101" lang="zh">
    <title>深入理解计算机系统</title>
    <price currency="CNY">128.50</price>
    <tags>
      <tag>计算机</tag>
      <tag>经典</tag>
    </tags>
  </book>
  <book id="bk102" lang="en">
    <title>Refactoring</title>
    <price currency="CNY">99.00</price>
  </book>
</catalog>`

// 与上方 XML 在默认选项下的转换结果完全一致，方便「示例」后直接对照两个方向
const SAMPLE_JSON = `{
  "catalog": {
    "book": [
      {
        "@id": "bk101",
        "@lang": "zh",
        "title": "深入理解计算机系统",
        "price": {
          "@currency": "CNY",
          "#text": "128.50"
        },
        "tags": {
          "tag": [
            "计算机",
            "经典"
          ]
        }
      },
      {
        "@id": "bk102",
        "@lang": "en",
        "title": "Refactoring",
        "price": {
          "@currency": "CNY",
          "#text": "99.00"
        }
      }
    ]
  }
}`

type Direction = 'xml2json' | 'json2xml'

/** 顶层恰好一个键时才对应一个合法根元素（XML 只允许一个根）。 */
function singleRootName(value: JsonValue | null): string {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return ''
  const keys = Object.keys(value)
  return keys.length === 1 ? (keys[0] ?? '') : ''
}

/** 取出根元素的直接子元素名：非属性前缀、非文本键的键名都是子元素。 */
function childElementNames(
  value: JsonValue | null,
  attributePrefix: string,
  textKey: string,
): string[] {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return []
  const rootName = Object.keys(value)[0] ?? ''
  if (!rootName) return []
  const rootValue = value[rootName]
  if (rootValue === null || typeof rootValue !== 'object' || Array.isArray(rootValue)) return []
  return Object.keys(rootValue).filter(
    (key) => key !== textKey && !(attributePrefix !== '' && key.startsWith(attributePrefix)),
  )
}

/**
 * 遍历 JSON 结果统计元素节点数与属性个数。
 * 每个非属性、非文本的键都是一次元素出现；数组元素按出现次数累加。
 */
function countNodes(
  value: JsonValue | null,
  attributePrefix: string,
  textKey: string,
): { elements: number; attributes: number } {
  let elements = 0
  let attributes = 0

  const walk = (node: JsonValue): void => {
    if (Array.isArray(node)) {
      for (const item of node) walk(item)
      return
    }
    if (node === null || typeof node !== 'object') return

    for (const [key, item] of Object.entries(node)) {
      if (attributePrefix !== '' && key.startsWith(attributePrefix)) {
        if (item === null || typeof item !== 'object') attributes += 1
        continue
      }
      if (key === textKey) continue
      if (Array.isArray(item)) {
        for (const child of item) {
          elements += 1
          walk(child)
        }
        continue
      }
      elements += 1
      walk(item)
    }
  }

  walk(value ?? null)
  return { elements, attributes }
}

export function XmlTool() {
  const [direction, setDirection] = useState<Direction>('xml2json')
  const [xmlInput, setXmlInput] = useState('')
  const [jsonInput, setJsonInput] = useState('')
  const [attributePrefix, setAttributePrefix] = useState('@')
  const [textKey, setTextKey] = useState('#text')
  const [alwaysArray, setAlwaysArray] = useState(false)
  const [ignoreWhitespace, setIgnoreWhitespace] = useState(true)
  const [declaration, setDeclaration] = useState(true)

  const isXmlToJson = direction === 'xml2json'

  // 选项对象写在 memo 内部：它每次渲染都会重建，放进依赖数组会让缓存失效
  const fromXml = useMemo(() => {
    const options = { attributePrefix, textKey, alwaysArray, ignoreWhitespace }
    if (!xmlInput.trim()) {
      return { ok: false, error: null, output: '', value: null as JsonValue | null }
    }
    const result = xmlToJson(xmlInput, options)
    const value = result.value
    return {
      ok: result.ok,
      error: result.error,
      output: result.ok && value !== null ? JSON.stringify(value, null, 2) : '',
      value,
    }
  }, [xmlInput, attributePrefix, textKey, alwaysArray, ignoreWhitespace])

  // jsonToXml 接收的是 JsonValue，所以这里先做一次 JSON.parse
  const parsedJson = useMemo(() => {
    if (!jsonInput.trim()) return { value: null as JsonValue | null, error: null as string | null }
    try {
      return { value: JSON.parse(jsonInput) as JsonValue, error: null }
    } catch (cause) {
      return {
        value: null,
        error: `JSON 解析失败：${cause instanceof Error ? cause.message : '未知错误'}`,
      }
    }
  }, [jsonInput])

  const toXml = useMemo(
    () =>
      jsonToXml(
        parsedJson.value,
        { attributePrefix, textKey, alwaysArray, ignoreWhitespace },
        declaration,
      ),
    [parsedJson, attributePrefix, textKey, alwaysArray, ignoreWhitespace, declaration],
  )

  const input = isXmlToJson ? xmlInput : jsonInput
  const output = isXmlToJson ? fromXml.output : toXml.xml
  const error = isXmlToJson
    ? fromXml.error
    : jsonInput.trim() === ''
      ? null
      : (parsedJson.error ?? toXml.error)

  const activeValue = isXmlToJson ? fromXml.value : parsedJson.value
  const rootName = useMemo(() => singleRootName(activeValue), [activeValue])
  const childNames = useMemo(
    () => (isXmlToJson ? childElementNames(fromXml.value, attributePrefix, textKey) : []),
    [isXmlToJson, fromXml.value, attributePrefix, textKey],
  )
  const nodeCount = useMemo(
    () => countNodes(activeValue, attributePrefix, textKey),
    [activeValue, attributePrefix, textKey],
  )

  const showStructure = isXmlToJson ? fromXml.ok : input.trim() !== ''

  const swap = () => {
    if (isXmlToJson) {
      setJsonInput(fromXml.output)
      setXmlInput('')
      setDirection('json2xml')
    } else {
      setXmlInput(toXml.xml)
      setJsonInput('')
      setDirection('xml2json')
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl border border-border/70 bg-card/40 px-5 py-4">
        <div className="flex flex-col gap-2">
          <Label className="text-xs text-muted-foreground">方向</Label>
          <Select value={direction} onValueChange={(value) => setDirection(value as Direction)}>
            <SelectTrigger className="w-[180px]" size="sm" aria-label="转换方向">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="xml2json">XML → JSON</SelectItem>
              <SelectItem value="json2xml">JSON → XML</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="attribute-prefix" className="text-xs text-muted-foreground">
            属性前缀
          </Label>
          <Input
            id="attribute-prefix"
            value={attributePrefix}
            onChange={(event) => setAttributePrefix(event.target.value)}
            spellCheck={false}
            className="w-20"
            aria-label="属性前缀"
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="text-key" className="text-xs text-muted-foreground">
            文本键名
          </Label>
          <Input
            id="text-key"
            value={textKey}
            onChange={(event) => setTextKey(event.target.value)}
            spellCheck={false}
            className="w-24"
            aria-label="文本键名"
          />
        </div>

        <div className="flex items-center gap-2 pb-1.5">
          <Switch id="always-array" checked={alwaysArray} onCheckedChange={setAlwaysArray} />
          <Label htmlFor="always-array" className="text-xs text-muted-foreground">
            同名元素始终用数组
          </Label>
        </div>

        <div className="flex items-center gap-2 pb-1.5">
          <Switch
            id="ignore-whitespace"
            checked={ignoreWhitespace}
            onCheckedChange={setIgnoreWhitespace}
          />
          <Label htmlFor="ignore-whitespace" className="text-xs text-muted-foreground">
            忽略纯空白文本
          </Label>
        </div>

        <div className="flex items-center gap-2 pb-1.5">
          {/* 该开关只影响 JSON → XML 方向，XML → JSON 时置灰 */}
          <Switch
            id="declaration"
            checked={declaration}
            onCheckedChange={setDeclaration}
            disabled={isXmlToJson}
          />
          <Label
            htmlFor="declaration"
            className={
              isXmlToJson
                ? 'text-xs text-muted-foreground opacity-50'
                : 'text-xs text-muted-foreground'
            }
          >
            输出 XML 声明
          </Label>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2 pb-0.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setXmlInput(SAMPLE_XML)
              setJsonInput(SAMPLE_JSON)
            }}
          >
            <SparklesIcon />
            示例
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            disabled={!xmlInput && !jsonInput}
            onClick={() => {
              setXmlInput('')
              setJsonInput('')
            }}
          >
            <EraserIcon />
            清空
          </Button>
        </div>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
        <IoPanel
          title={isXmlToJson ? 'XML 输入' : 'JSON 输入'}
          description={
            isXmlToJson
              ? '支持元素、属性、CDATA、注释与字符实体'
              : '顶层需要是单键对象，例如 { "catalog": { … } }'
          }
          action={
            <Badge variant="secondary" className="font-mono text-[11px]">
              {formatCount(input.length)} 字符
            </Badge>
          }
          value={input}
          onValueChange={isXmlToJson ? setXmlInput : setJsonInput}
          autoFocus
          spellCheck={false}
          placeholder={
            isXmlToJson
              ? '<root>\n  <item id="1">文本</item>\n</root>'
              : '{ "root": { "item": { "@id": "1", "#text": "文本" } } }'
          }
          textareaClassName="min-h-[220px]"
        />

        <div className="flex justify-center lg:h-full lg:flex-col lg:justify-center">
          <Button
            variant="secondary"
            size="icon"
            className="lg:size-11"
            onClick={swap}
            disabled={!output}
            aria-label="交换输入与输出"
          >
            <ArrowLeftRightIcon className="lg:rotate-90" />
          </Button>
        </div>

        <IoPanel
          title={isXmlToJson ? 'JSON 输出' : 'XML 输出'}
          description={output ? `共 ${formatCount(output.length)} 字符` : '转换结果会显示在这里'}
          value={output}
          readOnly
          placeholder="转换结果会显示在这里"
          error={error}
          textareaClassName="min-h-[220px]"
          footer={
            <>
              <CopyButton value={output} />
              <Button
                variant="outline"
                size="sm"
                disabled={!output}
                onClick={() => downloadText(output, isXmlToJson ? 'data.json' : 'data.xml')}
              >
                <DownloadIcon />
                下载
              </Button>
            </>
          }
        />
      </div>

      {showStructure ? (
        <section className="flex flex-col gap-3 rounded-xl border border-border/70 bg-card/40 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold">结构说明</h2>
            {rootName ? (
              <Badge variant="outline" className="font-mono text-[11px]">
                {`<${rootName}>`}
              </Badge>
            ) : null}
          </div>

          {isXmlToJson ? (
            <>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>根元素名：</span>
                <span className="font-mono text-sm text-foreground">{rootName || '—'}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {`直接子元素（${formatCount(childNames.length)}）：`}
                </span>
                {childNames.length > 0 ? (
                  childNames.map((name) => (
                    <span
                      key={name}
                      className="rounded-md border border-border/60 bg-muted/40 px-2 py-0.5 font-mono text-[11px]"
                    >
                      {name}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-muted-foreground">无子元素</span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {`属性以 ${attributePrefix} 前缀、文本以 ${textKey} 呈现，可在上方修改前缀。`}
              </p>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">
              顶层必须是单键对象，才会得到一个根元素。
            </p>
          )}
        </section>
      ) : null}

      <StatGrid>
        <Stat label="方向" value={isXmlToJson ? 'XML → JSON' : 'JSON → XML'} />
        <Stat label="根元素名" value={rootName || '—'} />
        <Stat label="元素节点数" value={activeValue === null ? '—' : formatCount(nodeCount.elements)} />
        <Stat label="属性个数" value={activeValue === null ? '—' : formatCount(nodeCount.attributes)} />
        <Stat label="输入字符" value={formatCount(input.length)} />
        <Stat label="输出字符" value={formatCount(output.length)} />
      </StatGrid>
    </div>
  )
}
