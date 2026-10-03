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

/** 现场编号变更留痕：队里改号后，旧号仍可追溯，已配好的馆藏号不受影响 */
export interface FieldNoChange {
  /** 旧现场编号 */
  from: string
  /** 新现场编号 */
  to: string
  /** 变更时间 ISO 字符串 */
  changedAt: string
}

/** Specimen 标本 */
export interface Specimen {
  id: string
  /** 采集队名：现场编号的命名空间，不同队允许编出同一个现场号 */
  team: string
  /** 当前现场编号（采集队自己那套规则，仅在队内要求唯一） */
  fieldNo: string
  /** 现场编号变更留痕（旧号不丢，交接时旧号也能对上） */
  fieldNoHistory: FieldNoChange[]
  /** 馆藏号：馆方交接时分配/登记，全局唯一；未交接为空串 */
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
