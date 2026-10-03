/** 采集方式 */
export const COLLECT_METHODS = ['扫网', '灯诱', '巴氏罐诱', '马氏网', '徒手'] as const
export type CollectMethod = (typeof COLLECT_METHODS)[number]

/** 鉴定状态 */
export const DET_STATUSES = ['待鉴定', '初鉴', '已鉴定', '待复核'] as const
export type DetStatus = (typeof DET_STATUSES)[number]

/** 性别 */
export const SEXES = ['雌', '雄', '未知'] as const
export type Sex = (typeof SEXES)[number]

/** 虫态 */
export const STAGES = ['成虫', '幼虫', '蛹', '卵'] as const
export type Stage = (typeof STAGES)[number]

/** 目（常用调查类群） */
export const ORDERS = ['鞘翅目', '鳞翅目', '膜翅目', '双翅目', '半翅目', '直翅目', '蜻蜓目'] as const

/** 现场编号历次变更留痕：记录被替换掉的旧号 */
export interface FieldNoChange {
  /** 被替换的旧现场编号 */
  value: string
  /** 变更日期 YYYY-MM-DD */
  changedAt: string
}

/**
 * Specimen 标本（采集队持有的现场记录）
 *
 * 两套编号各归其主：
 * - team + fieldNo：采集队按自己规则编的现场编号，仅队内唯一，不同队可能同号；
 * - accessionNo：馆藏号，馆里统一编制，交接配号后写入，未交接为空串。
 * 已配对标本修改 fieldNo 时 accessionNo 保持不变，旧号进 fieldNoHistory 留痕。
 */
export interface Specimen {
  id: string
  /** 采集队名（现场编号的命名空间） */
  team: string
  /** 现场编号：采集队自编，仅在队内唯一 */
  fieldNo: string
  /** 现场编号历次被替换的旧号 */
  fieldNoHistory: FieldNoChange[]
  /** 馆藏号：馆方统一编号，交接配号后写入，空串表示尚未交接 */
  accessionNo: string
  order: string
  family: string
  genus: string
  species: string
  /** 暂定名 */
  tempName: string
  collectDate: string
  collector: string
  sex: Sex
  stage: Stage
  /** 体长（mm） */
  bodyLength: number
  method: CollectMethod
  /** 个体数量 */
  quantity: number
  status: DetStatus
  determiner: string
  siteId: string
  note: string
}
