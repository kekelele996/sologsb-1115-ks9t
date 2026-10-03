import type { Specimen, Storage } from '@/types'

/** 馆藏号：前缀-年份-流水号，如 GB-2026-0007（馆方编目规则，与采集队现场编号无关） */
export function buildAccessionNo(prefix: string, year: number | string, serial: number): string {
  return `${prefix.toUpperCase()}-${year}-${String(serial).padStart(4, '0')}`
}

/** 解析馆藏号 */
export function parseAccessionNo(code: string): { prefix: string; year: string; serial: number } | null {
  const match = /^([A-Za-z0-9]+)-(\d{4})-(\d{3,5})$/.exec(code.trim())
  if (!match) return null
  return { prefix: match[1].toUpperCase(), year: match[2], serial: Number(match[3]) }
}

/** 馆藏号是否符合格式 */
export function isValidAccessionNo(code: string): boolean {
  return parseAccessionNo(code) !== null
}

/** 馆藏号全局查重（大小写不敏感） */
export function isDuplicateAccessionNo(code: string, existing: string[]): boolean {
  const target = code.trim().toUpperCase()
  return existing.some((item) => item.trim().toUpperCase() === target)
}

/** 依据已有馆藏号生成某前缀+年份的下一个流水号 */
export function nextAccessionSerial(prefix: string, year: number | string, existingCodes: string[]): number {
  const serials = existingCodes
    .map((code) => parseAccessionNo(code))
    .filter((parsed): parsed is { prefix: string; year: string; serial: number } => parsed !== null)
    .filter((parsed) => parsed.prefix === prefix.toUpperCase() && parsed.year === String(year))
    .map((parsed) => parsed.serial)
  return serials.length > 0 ? Math.max(...serials) + 1 : 1
}

/** 生成不与已有馆藏号冲突的新馆藏号 */
export function allocateAccessionNo(
  prefix: string,
  year: number | string,
  existingCodes: string[],
  reserved: string[] = []
): string {
  const used = [...existingCodes, ...reserved]
  let serial = nextAccessionSerial(prefix, year, used)
  let code = buildAccessionNo(prefix, year, serial)
  while (isDuplicateAccessionNo(code, used)) {
    serial += 1
    code = buildAccessionNo(prefix, year, serial)
  }
  return code
}

/**
 * 采集登记时的现场编号建议：队名简写-年份-流水号（仅建议，采集队可改成自己那套规则）。
 * 现场编号只在队内查重，因此已有号也按队过滤。
 */
export function suggestFieldNo(
  team: string,
  year: number | string,
  specimens: Specimen[],
  extraFieldNos: string[] = []
): string {
  const teamName = team.trim()
  const short = teamName ? teamName.slice(0, 2) : 'TEMP'
  const prefix = `${short}-${year}-`
  const serials = [
    ...specimens
      .filter((item) => item.team.trim() === teamName)
      .flatMap((item) => [item.fieldNo, ...item.fieldNoHistory.map((change) => change.to)]),
    ...extraFieldNos
  ]
    .map((no) => {
      const match = new RegExp(`^${escapeRegExp(prefix)}(\\d{3,5})$`, 'i').exec(no.trim())
      return match ? Number(match[1]) : null
    })
    .filter((value): value is number => value !== null)
  const serial = serials.length > 0 ? Math.max(...serials) + 1 : 1
  return `${prefix}${String(serial).padStart(4, '0')}`
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** 经纬度格式化：116.4042°E, 39.9136°N */
export function formatLatLng(longitude: number, latitude: number): string {
  const lon = `${Math.abs(longitude).toFixed(4)}°${longitude >= 0 ? 'E' : 'W'}`
  const lat = `${Math.abs(latitude).toFixed(4)}°${latitude >= 0 ? 'N' : 'S'}`
  return `${lon}, ${lat}`
}

/** 经纬度格式校验 */
export function validateLatLng(longitude: number, latitude: number): string | null {
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return '经纬度必须是数字'
  if (longitude < -180 || longitude > 180) return '经度必须在 -180 ~ 180 之间'
  if (latitude < -90 || latitude > 90) return '纬度必须在 -90 ~ 90 之间'
  return null
}

/** 柜位字符串编解码：C03-D2-B05-S12 */
export function encodeSlot(cabinet: string, drawer: number, box: number, slot: number): string {
  return `${cabinet.toUpperCase()}-D${drawer}-B${String(box).padStart(2, '0')}-S${String(slot).padStart(2, '0')}`
}

export function decodeSlot(text: string): { cabinet: string; drawer: number; box: number; slot: number } | null {
  const match = /^([A-Za-z0-9]+)-D(\d+)-B(\d+)-S(\d+)$/.exec(text.trim())
  if (!match) return null
  return { cabinet: match[1].toUpperCase(), drawer: Number(match[2]), box: Number(match[3]), slot: Number(match[4]) }
}

/** 标本在柜中的显示位置 */
export function storageSlotText(storage: Storage): string {
  return encodeSlot(storage.cabinet, storage.drawer, storage.box, storage.slot)
}

/** 检查柜位是否已被占用 */
export function findSlotConflicts(storages: Storage[], target: Storage): Storage[] {
  const key = storageSlotText(target)
  return storages.filter((item) => item.id !== target.id && storageSlotText(item) === key)
}

/** 标本摘要文本 */
export function specimenTaxon(specimen: Specimen): string {
  const parts = [specimen.order, specimen.family, specimen.genus, specimen.species].filter(Boolean)
  return parts.length > 0 ? parts.join(' / ') : specimen.tempName || '未定名'
}

/** 标本在馆方界面（柜位/鉴定/导出）的主标识：只认馆藏号，未交接给出占位 */
export function accessionLabel(specimen: Specimen | undefined): string {
  return specimen?.accessionNo || '未交接'
}
