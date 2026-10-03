/** 交接单内一行的处理结果 */
export type HandoverLineStatus =
  | 'paired' // 本次新配号
  | 'replayed' // 之前已配对（含本单重送），原样返回馆藏号
  | 'rejected' // 校验失败，只退回这一条

/** 交接单逐行结果 */
export interface HandoverLineResult {
  /** 单内行号（从 1 开始，便于对单） */
  line: number
  /** 原始行文本（去掉行号后的内容） */
  raw: string
  team: string
  fieldNo: string
  /** 单内显式指定的馆藏号；空串表示请馆方自动配号 */
  requestedAccessionNo: string
  status: HandoverLineStatus
  /** 配对到的馆藏号（replayed / paired 时有值） */
  accessionNo?: string
  specimenId?: string
  /** rejected 时的说明 */
  reason?: string
}

/**
 * HandoverBatch 交接单（一队一单）
 *
 * sheetId 是同一张单的幂等键：交接失败后队里、馆里各自推进，
 * 重送同一张单时，已配好的行直接回放原馆藏号，自动号也不会再多发。
 */
export interface HandoverBatch {
  id: string
  /** 交接单号（队名+日期生成，可改；同一张单重送须保持一致） */
  sheetId: string
  /** 本单所属采集队 */
  team: string
  /** 最后一次提交的原始单据文本（每行：现场编号 或 现场编号,馆藏号） */
  rawText: string
  /** 最近一次交接日期 YYYY-MM-DD */
  submittedAt: string
  /** 最近一次提交结果（逐行，便于双方对账） */
  results: HandoverLineResult[]
}
