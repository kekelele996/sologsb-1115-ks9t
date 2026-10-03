import type { Accession, Specimen, Storage } from '@/types'

/** 馆藏号：采集地代码-年份-流水号，如 QLB-2026-0007 */
export function buildAccessionNo(siteCode: string, year: number | string, serial: number): string {
  return `${siteCode.toUpperCase()}-${year}-${String(serial).padStart(4, '0')}`
}

/** 解析馆藏号 */
export function parseAccessionNo(code: string): { siteCode: string; year: string; serial: number } | null {
  const match = /^([A-Za-z0-9]+)-(\d{4})-(\d{3,5})$/.exec(code.trim())
  if (!match) return null
  return { siteCode: match[1].toUpperCase(), year: match[2], serial: Number(match[3]) }
}

/** 馆藏号格式是否合法（采集地代码-年份-流水号） */
export function isValidAccessionNo(code: string): boolean {
  return parseAccessionNo(code) !== null
}

/** 在已有馆藏号中查重（大小写不敏感） */
export function isDuplicateAccessionNo(code: string, existing: string[]): boolean {
  return existing.some((item) => item.trim().toUpperCase() === code.trim().toUpperCase())
}

/** 依据已有序号生成下一个流水号 */
export function nextSerial(siteCode: string, year: number | string, existingCodes: string[]): number {
  const serials = existingCodes
    .map((code) => parseAccessionNo(code))
    .filter((parsed): parsed is { siteCode: string; year: string; serial: number } => parsed !== null)
    .filter((parsed) => parsed.siteCode === siteCode.toUpperCase() && parsed.year === String(year))
    .map((parsed) => parsed.serial)
  return serials.length > 0 ? Math.max(...serials) + 1 : 1
}

/**
 * 馆方自动配号：按标本采集地与采集年份取下一流水号，
 * 不与既有馆藏号及本单已占用的预留号冲突。
 */
export function allocateAccessionNo(
  siteCode: string,
  year: number | string,
  existingCodes: string[],
  reserved: string[] = []
): string {
  const used = [...existingCodes, ...reserved]
  let serial = nextSerial(siteCode, year, used)
  let code = buildAccessionNo(siteCode, year, serial)
  while (isDuplicateAccessionNo(code, used)) {
    serial += 1
    code = buildAccessionNo(siteCode, year, serial)
  }
  return code
}

/** 现场编号比较：队名 + 现场编号构成配对键，比较时去掉首尾空白，不忽略大小写（各队规则自负） */
export function fieldKey(team: string, fieldNo: string): string {
  return `${team.trim()}||${fieldNo.trim()}`
}

/** 同一采集队内现场编号是否重复 */
export function isDuplicateFieldNo(team: string, fieldNo: string, specimens: Specimen[], excludeId = ''): boolean {
  const key = fieldKey(team, fieldNo)
  return specimens.some(
    (item) => item.id !== excludeId && fieldKey(item.team, item.fieldNo) === key
  )
}

/**
 * 为某采集队建议下一个现场编号：
 * 各队规则不一，仅当现号为纯数字（含前导零）时给出 N+1 建议；
 * 其他规则（如带前缀）不猜，由采集队自行填写。
 */
export function suggestFieldNo(team: string, specimens: Specimen[]): string {
  const numbers = specimens
    .filter((item) => item.team.trim() === team.trim())
    .map((item) => /^(\d+)$/.exec(item.fieldNo.trim()))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => match[1])
  if (numbers.length === 0) return '001'
  const widest = numbers.reduce((acc, item) => (item.length > acc.length ? item : acc), '0')
  const next = String(Number(widest) + 1)
  return next.padStart(widest.length, '0')
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

/** 馆方业务统一显示馆藏号；尚未交接的标本显示现场号兜底并加「未交接」语义由调用方处理 */
export function specimenAccessionNo(specimen: Specimen): string {
  return specimen.accessionNo || ''
}

/** 通过配对凭证集合查标本的馆藏号 */
export function accessionNoOf(specimenId: string, accessions: Accession[]): string {
  return accessions.find((item) => item.specimenId === specimenId)?.accessionNo ?? ''
}
