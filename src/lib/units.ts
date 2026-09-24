/**
 * 单位换算。
 *
 * 绝大多数单位是「线性」的：value_base = value × factor。
 * 温度是「仿射」的：value_base = (value + offset) × factor，
 * 因此统一用 factor + offset 两个参数描述，避免为温度单开一套逻辑。
 */

export interface UnitDef {
  id: string
  name: string
  symbol: string
  /** 相对基准单位的倍率 */
  factor: number
  /** 换到基准单位前的偏移（温度用） */
  offset?: number
}

export interface UnitCategory {
  id: string
  name: string
  /** 基准单位 id */
  base: string
  units: UnitDef[]
}

const u = (id: string, name: string, symbol: string, factor: number, offset = 0): UnitDef => ({
  id,
  name,
  symbol,
  factor,
  offset,
})

export const UNIT_CATEGORIES: readonly UnitCategory[] = [
  {
    id: 'length',
    name: '长度',
    base: 'm',
    units: [
      u('km', '千米', 'km', 1000),
      u('m', '米', 'm', 1),
      u('dm', '分米', 'dm', 0.1),
      u('cm', '厘米', 'cm', 0.01),
      u('mm', '毫米', 'mm', 0.001),
      u('um', '微米', 'µm', 1e-6),
      u('nm', '纳米', 'nm', 1e-9),
      u('mi', '英里', 'mi', 1609.344),
      u('yd', '码', 'yd', 0.9144),
      u('ft', '英尺', 'ft', 0.3048),
      u('in', '英寸', 'in', 0.0254),
      u('nmi', '海里', 'nmi', 1852),
      u('li', '里', '里', 500),
      u('zhang', '丈', '丈', 3.3333333333),
      u('chi', '尺', '尺', 0.3333333333),
      u('cun', '寸', '寸', 0.03333333333),
    ],
  },
  {
    id: 'mass',
    name: '重量',
    base: 'kg',
    units: [
      u('t', '吨', 't', 1000),
      u('kg', '千克', 'kg', 1),
      u('g', '克', 'g', 0.001),
      u('mg', '毫克', 'mg', 1e-6),
      u('ug', '微克', 'µg', 1e-9),
      u('lb', '磅', 'lb', 0.45359237),
      u('oz', '盎司', 'oz', 0.028349523125),
      u('st', '英石', 'st', 6.35029318),
      u('jin', '斤', '斤', 0.5),
      u('liang', '两', '两', 0.05),
      u('qian', '钱', '钱', 0.005),
    ],
  },
  {
    id: 'area',
    name: '面积',
    base: 'm2',
    units: [
      u('km2', '平方千米', 'km²', 1e6),
      u('ha', '公顷', 'ha', 10000),
      u('m2', '平方米', 'm²', 1),
      u('cm2', '平方厘米', 'cm²', 1e-4),
      u('mm2', '平方毫米', 'mm²', 1e-6),
      u('acre', '英亩', 'ac', 4046.8564224),
      u('ft2', '平方英尺', 'ft²', 0.09290304),
      u('in2', '平方英寸', 'in²', 0.00064516),
      u('mu', '亩', '亩', 666.6666667),
    ],
  },
  {
    id: 'volume',
    name: '体积',
    base: 'l',
    units: [
      u('m3', '立方米', 'm³', 1000),
      u('l', '升', 'L', 1),
      u('ml', '毫升', 'mL', 0.001),
      u('cm3', '立方厘米', 'cm³', 0.001),
      u('ft3', '立方英尺', 'ft³', 28.316846592),
      u('in3', '立方英寸', 'in³', 0.016387064),
      u('galus', '美制加仑', 'gal', 3.785411784),
      u('galuk', '英制加仑', 'gal(UK)', 4.54609),
      u('qt', '美制夸脱', 'qt', 0.946352946),
      u('pt', '美制品脱', 'pt', 0.473176473),
      u('floz', '美制液盎司', 'fl oz', 0.0295735295625),
    ],
  },
  {
    id: 'temperature',
    name: '温度',
    base: 'c',
    units: [
      u('c', '摄氏度', '°C', 1),
      u('f', '华氏度', '°F', 5 / 9, -32),
      u('k', '开尔文', 'K', 1, -273.15),
      u('r', '兰氏度', '°R', 5 / 9, -491.67),
    ],
  },
  {
    id: 'speed',
    name: '速度',
    base: 'ms',
    units: [
      u('ms', '米/秒', 'm/s', 1),
      u('kmh', '千米/小时', 'km/h', 1 / 3.6),
      u('mph', '英里/小时', 'mph', 0.44704),
      u('kn', '节', 'kn', 0.514444444),
      u('fts', '英尺/秒', 'ft/s', 0.3048),
      u('mach', '马赫（海平面）', 'Ma', 340.29),
    ],
  },
  {
    id: 'data',
    name: '数据存储',
    base: 'byte',
    units: [
      u('bit', '比特', 'bit', 0.125),
      u('byte', '字节', 'B', 1),
      u('kb', '千字节（1000）', 'KB', 1000),
      u('mb', '兆字节（1000）', 'MB', 1e6),
      u('gb', '吉字节（1000）', 'GB', 1e9),
      u('tb', '太字节（1000）', 'TB', 1e12),
      u('pb', '拍字节（1000）', 'PB', 1e15),
      u('kib', 'KiB（1024）', 'KiB', 1024),
      u('mib', 'MiB（1024）', 'MiB', 1024 ** 2),
      u('gib', 'GiB（1024）', 'GiB', 1024 ** 3),
      u('tib', 'TiB（1024）', 'TiB', 1024 ** 4),
    ],
  },
  {
    id: 'time',
    name: '时间',
    base: 's',
    units: [
      u('ns', '纳秒', 'ns', 1e-9),
      u('us', '微秒', 'µs', 1e-6),
      u('ms', '毫秒', 'ms', 0.001),
      u('s', '秒', 's', 1),
      u('min', '分钟', 'min', 60),
      u('h', '小时', 'h', 3600),
      u('day', '天', 'd', 86400),
      u('week', '周', 'wk', 604800),
      u('month', '月（30 天）', 'mo', 2592000),
      u('year', '年（365 天）', 'yr', 31536000),
    ],
  },
  {
    id: 'angle',
    name: '角度',
    base: 'deg',
    units: [
      u('deg', '度', '°', 1),
      u('rad', '弧度', 'rad', 180 / Math.PI),
      u('grad', '百分度', 'grad', 0.9),
      u('turn', '圈', 'turn', 360),
      u('arcmin', '角分', '′', 1 / 60),
      u('arcsec', '角秒', '″', 1 / 3600),
    ],
  },
  {
    id: 'pressure',
    name: '压力',
    base: 'pa',
    units: [
      u('pa', '帕斯卡', 'Pa', 1),
      u('kpa', '千帕', 'kPa', 1000),
      u('mpa', '兆帕', 'MPa', 1e6),
      u('bar', '巴', 'bar', 100000),
      u('mbar', '毫巴', 'mbar', 100),
      u('atm', '标准大气压', 'atm', 101325),
      u('mmhg', '毫米汞柱', 'mmHg', 133.322387415),
      u('psi', '磅/平方英寸', 'psi', 6894.757293168),
      u('kgfcm2', '公斤力/平方厘米', 'kgf/cm²', 98066.5),
    ],
  },
  {
    id: 'energy',
    name: '能量',
    base: 'j',
    units: [
      u('j', '焦耳', 'J', 1),
      u('kj', '千焦', 'kJ', 1000),
      u('cal', '卡', 'cal', 4.184),
      u('kcal', '千卡（大卡）', 'kcal', 4184),
      u('wh', '瓦时', 'Wh', 3600),
      u('kwh', '千瓦时（度）', 'kWh', 3600000),
      u('ev', '电子伏', 'eV', 1.602176634e-19),
      u('btu', '英热单位', 'BTU', 1055.05585262),
      u('ftlb', '英尺磅', 'ft·lb', 1.3558179483314),
    ],
  },
  {
    id: 'power',
    name: '功率',
    base: 'w',
    units: [
      u('w', '瓦', 'W', 1),
      u('kw', '千瓦', 'kW', 1000),
      u('mw', '兆瓦', 'MW', 1e6),
      u('hp', '英制马力', 'hp', 745.6998715823),
      u('ps', '公制马力', 'PS', 735.49875),
      u('kcalh', '千卡/小时', 'kcal/h', 1.163),
    ],
  },
  {
    id: 'force',
    name: '力',
    base: 'n',
    units: [
      u('n', '牛顿', 'N', 1),
      u('kn', '千牛', 'kN', 1000),
      u('kgf', '千克力', 'kgf', 9.80665),
      u('gf', '克力', 'gf', 0.00980665),
      u('lbf', '磅力', 'lbf', 4.4482216152605),
      u('dyn', '达因', 'dyn', 1e-5),
    ],
  },
]

export function findCategory(id: string): UnitCategory | undefined {
  return UNIT_CATEGORIES.find((category) => category.id === id)
}

export function findUnit(category: UnitCategory, id: string): UnitDef | undefined {
  return category.units.find((unit) => unit.id === id)
}

/** 把数值从某个单位转换到基准单位。 */
export function toBase(value: number, unit: UnitDef): number {
  return (value + (unit.offset ?? 0)) * unit.factor
}

/** 从基准单位转回某个单位。 */
export function fromBase(base: number, unit: UnitDef): number {
  return base / unit.factor - (unit.offset ?? 0)
}

export function convert(value: number, from: UnitDef, to: UnitDef): number {
  return fromBase(toBase(value, from), to)
}

/** 把一个数值换算成该分类下的所有单位。 */
export function convertAll(
  value: number,
  category: UnitCategory,
  fromId: string,
): Array<{ unit: UnitDef; value: number }> {
  const from = findUnit(category, fromId)
  if (!from) return []
  const base = toBase(value, from)
  return category.units.map((unit) => ({ unit, value: fromBase(base, unit) }))
}

/**
 * 格式化换算结果：按数量级自动选择普通小数或科学计数法，
 * 并去掉无意义的尾随 0。
 */
export function formatUnitValue(value: number): string {
  if (!Number.isFinite(value)) return '—'
  if (value === 0) return '0'

  const abs = Math.abs(value)
  if (abs >= 1e15 || abs < 1e-6) {
    const [mantissa, exponent] = value.toExponential(6).split('e')
    return `${mantissa.replace(/\.?0+$/, '')}e${exponent}`
  }

  const digits = abs >= 1000 ? 2 : abs >= 1 ? 4 : 8
  const fixed = value.toFixed(digits)
  return fixed.replace(/\.?0+$/, '')
}

/** 解析用户输入的数字，支持千分位、下划线与科学计数法。 */
export function parseNumericInput(input: string): number | null {
  const clean = input.trim().replace(/[,_\s]/g, '')
  if (!clean) return null
  if (!/^-?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(clean)) return null
  const value = Number(clean)
  return Number.isFinite(value) ? value : null
}
