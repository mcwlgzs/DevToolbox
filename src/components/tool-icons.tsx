import {
  BinaryIcon,
  BracesIcon,
  CalculatorIcon,
  CalendarClockIcon,
  ClockIcon,
  CodeXmlIcon,
  DatabaseIcon,
  FileCodeIcon,
  FingerprintIcon,
  GitCompareIcon,
  GlobeIcon,
  HashIcon,
  ImageIcon,
  KeyRoundIcon,
  LayoutGridIcon,
  Link2Icon,
  LockIcon,
  NetworkIcon,
  PaletteIcon,
  RulerIcon,
  SearchCodeIcon,
  ShieldCheckIcon,
  TableIcon,
  TypeIcon,
} from 'lucide-react'

interface ToolIconProps {
  slug: string
  className?: string
}

/**
 * 按 slug 渲染对应图标。
 * 用显式分支而不是「查表后赋值给变量」，以免在渲染期创建组件
 * （react/static-components）。
 */
export function ToolIcon({ slug, className }: ToolIconProps) {
  if (slug === 'base64') return <BinaryIcon className={className} />
  if (slug === 'hash') return <HashIcon className={className} />
  if (slug === 'url') return <Link2Icon className={className} />
  if (slug === 'json') return <BracesIcon className={className} />
  if (slug === 'timestamp') return <ClockIcon className={className} />
  if (slug === 'uuid') return <FingerprintIcon className={className} />
  if (slug === 'jwt') return <KeyRoundIcon className={className} />
  if (slug === 'encoding') return <FileCodeIcon className={className} />
  if (slug === 'regex') return <SearchCodeIcon className={className} />
  if (slug === 'diff') return <GitCompareIcon className={className} />
  if (slug === 'text') return <TypeIcon className={className} />
  if (slug === 'image') return <ImageIcon className={className} />
  if (slug === 'color') return <PaletteIcon className={className} />
  if (slug === 'csv') return <TableIcon className={className} />
  if (slug === 'hmac') return <ShieldCheckIcon className={className} />
  if (slug === 'cron') return <CalendarClockIcon className={className} />
  if (slug === 'subnet') return <NetworkIcon className={className} />
  if (slug === 'chmod') return <LockIcon className={className} />
  if (slug === 'http') return <GlobeIcon className={className} />
  if (slug === 'xml') return <CodeXmlIcon className={className} />
  if (slug === 'sql') return <DatabaseIcon className={className} />
  if (slug === 'units') return <RulerIcon className={className} />
  if (slug === 'math') return <CalculatorIcon className={className} />
  return <LayoutGridIcon className={className} />
}
