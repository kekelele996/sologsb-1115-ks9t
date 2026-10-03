/**
 * Accession 馆队交接配对凭证
 *
 * 交接时按「采集队名 + 现场编号」找到现场标本，
 * 配对瞬间把队名与当时的现场编号固化在凭证上：
 * 之后队里改现场编号，凭证不动，已配好的馆藏号也不动。
 * 一张交接单内的一条现场标本至多对应一条凭证（由 sheetId 链路 + specimenId 唯一保证幂等）。
 */
export interface Accession {
  id: string
  /** 配对的现场标本 */
  specimenId: string
  /** 馆藏号，馆内唯一，柜位/鉴定/导出都认它 */
  accessionNo: string
  /** 配对时的采集队名（快照） */
  team: string
  /** 配对时的现场编号（快照，旧单重送按它命中） */
  fieldNo: string
  /** 首次配号所在交接单号 */
  sheetId: string
  /** 配号日期 YYYY-MM-DD */
  pairedAt: string
}
