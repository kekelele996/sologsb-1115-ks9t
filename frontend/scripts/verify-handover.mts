import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import assert from 'node:assert'
import type { Specimen } from '../src/types'
import { parseHandoverSheet, pairHandover, previewHandover, specimenMatchesFieldNo } from '../src/utils/handover'
import { suggestFieldNo, accessionLabel } from '../src/utils/codec'

let passed = 0
function check(name: string, fn: () => void): void {
  fn()
  passed++
  console.log(`  ✓ ${name}`)
}

const now = '2026-10-02T00:00:00.000Z'
const sp = (partial: Partial<Specimen> & Pick<Specimen, 'id' | 'team' | 'fieldNo'>): Specimen => ({
  fieldNoHistory: [],
  accessionNo: '',
  order: '鞘翅目',
  family: '',
  genus: '',
  species: '',
  tempName: '',
  collectDate: '2026-10-02',
  collector: '',
  sex: '未知',
  stage: '成虫',
  bodyLength: 0,
  method: '扫网',
  quantity: 1,
  status: '待鉴定',
  determiner: '',
  siteId: '',
  note: '',
  ...partial
})

// 1. 两队同号：按队名+现场号分别命中
const specimens: Specimen[] = [
  sp({ id: 'a1', team: '黔南一队', fieldNo: '0001', accessionNo: 'GB-2026-0001' }),
  sp({ id: 'a2', team: '黔南一队', fieldNo: '0002' }),
  sp({ id: 'b1', team: '黔南二队', fieldNo: '0001' }),
  sp({ id: 'b2', team: '黔南二队', fieldNo: '0003' }),
  // 队里改过号：当前 0099，旧号 0010，已配馆藏号
  sp({ id: 'a3', team: '黔南一队', fieldNo: '0099', accessionNo: 'GB-2026-0009',
       fieldNoHistory: [{ from: '0010', to: '0099', changedAt: now }] })
]

console.log('配对基础规则')
check('同号不同队各自配对成功', () => {
  const r = pairHandover('黔南二队', parseHandoverSheet('0001\n0003').lines, specimens, 'GB', 2026)
  assert.strictEqual(r.rejected.length, 0)
  assert.strictEqual(r.matched.length, 2)
  assert.deepStrictEqual(Array.from(r.matched.map((m) => m.specimenId)).sort(), ['b1', 'b2'])
  assert.ok(r.matched.every((m) => !m.alreadyPaired && m.allocated))
})

check('留空馆号自动分配，且流水号接续已有馆藏号', () => {
  const r = pairHandover('黔南二队', parseHandoverSheet('0001').lines, specimens, 'GB', 2026)
  assert.strictEqual(r.matched[0].accessionNo, 'GB-2026-0010') // 已有到 GB-2026-0009
})

check('单内多行自动分配不撞号', () => {
  const r = pairHandover('黔南二队', parseHandoverSheet('0001\n0003').lines, specimens, 'GB', 2026)
  const nos = r.matched.map((m) => m.accessionNo)
  assert.strictEqual(new Set(nos).size, 2)
})

console.log('\n退回规则（行级隔离）')
check('写错的现场号：只退该行，其他行配对成功', () => {
  const r = pairHandover('黔南二队', parseHandoverSheet('9999\n0001').lines, specimens, 'GB', 2026)
  assert.strictEqual(r.rejected.length, 1)
  assert.strictEqual(r.rejected[0].lineNo, 1)
  assert.match(r.rejected[0].reason, /找不到现场编号/)
  assert.strictEqual(r.matched.length, 1)
  assert.strictEqual(r.matched[0].specimenId, 'b1')
  assert.strictEqual(r.updates.length, 1)
})

check('队名写错：整单每行都退回并说明', () => {
  const r = pairHandover('黔南三队', parseHandoverSheet('0001').lines, specimens, 'GB', 2026)
  assert.strictEqual(r.matched.length, 0)
  assert.strictEqual(r.rejected.length, 1)
  assert.match(r.rejected[0].reason, /找不到现场编号/)
})

check('馆号格式错：只退该行', () => {
  const r = pairHandover('黔南二队', parseHandoverSheet('0001 坏号\n0003').lines, specimens, 'GB', 2026)
  assert.strictEqual(r.rejected.length, 1)
  assert.match(r.rejected[0].reason, /格式不对/)
  assert.deepStrictEqual(Array.from(r.updates, (u) => u.id), ['b2'])
})

check('馆号已被其他标本占用：只退该行并指出占用', () => {
  const r = pairHandover('黔南二队', parseHandoverSheet('0001 GB-2026-0001\n0003').lines, specimens, 'GB', 2026)
  assert.strictEqual(r.rejected.length, 1)
  assert.match(r.rejected[0].reason, /已被其他标本占用/)
  assert.deepStrictEqual(Array.from(r.updates, (u) => u.id), ['b2'])
})

check('馆号大小写不敏感判占用', () => {
  const r = pairHandover('黔南二队', parseHandoverSheet('0001 gb-2026-0001').lines, specimens, 'GB', 2026)
  assert.strictEqual(r.rejected.length, 1)
})

check('单内馆号重复：后者退回', () => {
  const r = pairHandover('黔南二队', parseHandoverSheet('0001 GB-2026-0100\n0003 GB-2026-0100').lines, specimens, 'GB', 2026)
  assert.strictEqual(r.rejected.length, 1)
  assert.strictEqual(r.rejected[0].lineNo, 2)
  assert.match(r.rejected[0].reason, /重复出现/)
})

check('超过两列：解析阶段退回本行', () => {
  const { malformed } = parseHandoverSheet('0001 GB-2026-0100 多余列')
  assert.strictEqual(malformed.length, 1)
  assert.match(malformed[0].reason, /只能是/)
})

console.log('\n幂等 / 续跑')
check('已配对标本重送且馆号一致：幂等跳过，不多配号、不产生 update', () => {
  const r = pairHandover('黔南一队', parseHandoverSheet('0001').lines, specimens, 'GB', 2026)
  assert.strictEqual(r.matched.length, 1)
  assert.strictEqual(r.matched[0].alreadyPaired, true)
  assert.strictEqual(r.matched[0].accessionNo, 'GB-2026-0001')
  assert.strictEqual(r.updates.length, 0)
})

check('已配对标本单上填了不同馆号：退回且馆藏号不动', () => {
  const r = pairHandover('黔南一队', parseHandoverSheet('0001 GB-2026-0888').lines, specimens, 'GB', 2026)
  assert.strictEqual(r.rejected.length, 1)
  assert.match(r.rejected[0].reason, /已持有馆藏号/)
})

check('失败单改好后重送：此前成功的仍在，失败行这轮成功', () => {
  // 第一轮：坏行 + 好行
  const first = pairHandover('黔南二队', parseHandoverSheet('9999\n0001').lines, specimens, 'GB', 2026)
  const afterFirst = specimens.map((s) => first.updates.find((u) => u.id === s.id) ?? s)
  // 第二轮：修好 9999→0003（此时 0001 已配，跳过；0003 新配）
  const second = pairHandover('黔南二队', parseHandoverSheet('0003\n0001').lines, afterFirst, 'GB', 2026)
  assert.strictEqual(second.rejected.length, 0)
  assert.strictEqual(second.matched.find((m) => m.specimenId === 'b1')?.alreadyPaired, true)
  const b2 = second.matched.find((m) => m.specimenId === 'b2')
  assert.ok(b2 && !b2.alreadyPaired)
  // 同一张单原样重送不再多配
  const third = pairHandover('黔南二队', parseHandoverSheet('0003\n0001').lines,
    afterFirst.map((s) => second.updates.find((u) => u.id === s.id) ?? s), 'GB', 2026)
  assert.strictEqual(third.updates.length, 0)
  assert.strictEqual(third.rejected.length, 0)
})

console.log('\n改号留痕')
check('旧号也能配对上（队里已改号）', () => {
  assert.ok(specimenMatchesFieldNo(specimens[4], '黔南一队', '0010'))
  const r = pairHandover('黔南一队', parseHandoverSheet('0010').lines, specimens, 'GB', 2026)
  assert.strictEqual(r.matched.length, 1)
  assert.strictEqual(r.matched[0].specimenId, 'a3')
  assert.strictEqual(r.matched[0].alreadyPaired, true)
  // 返回的是当前号而非旧号
  assert.strictEqual(r.matched[0].fieldNo, '0099')
})

console.log('\n解析')
check('支持空格/逗号/制表符分隔，忽略空行', () => {
  const { lines } = parseHandoverSheet('0001 GB-2026-0001\n\n0002,GB-2026-0002\n0003\tGB-2026-0003\n')
  assert.strictEqual(lines.length, 3)
  assert.strictEqual(lines[1].accessionNo, 'GB-2026-0002')
})

console.log('\n现场号建议（队内进度）')
check('建议号按队内流水推进，不看其他队', () => {
  // 建议号前缀取队名前两个字；构造带该前缀的队内号
  const forSuggest: Specimen[] = [
    sp({ id: 't1', team: '黔南一队', fieldNo: '黔南-2026-0099' }),
    sp({ id: 't2', team: '黔南二队', fieldNo: '黔南-2026-0003' })
  ]
  assert.strictEqual(suggestFieldNo('黔南一队', 2026, forSuggest), '黔南-2026-0100')
  assert.strictEqual(suggestFieldNo('黔南二队', 2026, forSuggest), '黔南-2026-0004')
  assert.strictEqual(suggestFieldNo('新队伍', 2026, forSuggest), '新队-2026-0001')
  // extraFieldNos 模拟批次内预留
  assert.strictEqual(suggestFieldNo('黔南二队', 2026, forSuggest, ['黔南-2026-0004']), '黔南-2026-0005')
})

check('accessionLabel 未交接给占位', () => {
  assert.strictEqual(accessionLabel(sp({ id: 'x', team: 't', fieldNo: '1' })), '未交接')
  assert.strictEqual(accessionLabel(sp({ id: 'x', team: 't', fieldNo: '1', accessionNo: 'GB-2026-0001' })), 'GB-2026-0001')
})

console.log('\n预检不落库语义（结果结构一致）')
check('preview 与配对结果一致并带格式错误行', () => {
  const p = previewHandover('黔南二队', '0001\n坏行 a b c', specimens, 'GB', 2026)
  assert.strictEqual(p.result.matched.length, 1)
  assert.strictEqual(p.result.rejected.length, 1)
})

console.log(`\n全部 ${passed} 组断言通过`)

// --- 存储层：Dexie 事务下的交接幂等与行级隔离 ---
async function storeTest(): Promise<void> {
  console.log('\n存储层（Dexie 事务）')
  const { db } = await import('../src/hooks/usePersistentStore')
  const { specimenStore } = await import('../src/stores/specimenStore')
  await db.specimens.bulkPut([
    sp({ id: 'd1', team: '黔南二队', fieldNo: 'X-2026-0001' }),
    sp({ id: 'd2', team: '黔南二队', fieldNo: 'X-2026-0002' }),
    sp({ id: 'd3', team: '黔南二队', fieldNo: 'X-2026-0003', accessionNo: 'GB-2026-0050' })
  ])

  // 第一次：一行坏（占用）+ 一行自动 + 一行已配对
  const first = await specimenStore.getState().handover(
    '黔南二队',
    'X-2026-0001 GB-2026-0050\nX-2026-0002\nX-2026-0003',
    'GB',
    2026
  )
  assert.strictEqual(first.rejected.length, 1, '坏行单独退回')
  assert.match(first.rejected[0].reason, /已被其他标本占用/)
  let d2row = await db.specimens.get('d2')
  assert.ok(d2row?.accessionNo, '好行已落馆藏号')
  const allocated = d2row!.accessionNo
  let d1row = await db.specimens.get('d1')
  assert.strictEqual(d1row?.accessionNo, '', '退回行未被写库')

  // 同一张单原样重送：不多配号
  const second = await specimenStore.getState().handover(
    '黔南二队',
    'X-2026-0001 GB-2026-0050\nX-2026-0002\nX-2026-0003',
    'GB',
    2026
  )
  assert.strictEqual(second.matched.filter((m) => !m.alreadyPaired).length, 0, '重送没有新配对')
  assert.strictEqual(second.rejected.length, 1)
  d2row = await db.specimens.get('d2')
  assert.strictEqual(d2row?.accessionNo, allocated, '已配馆藏号保持不变')

  // 失败行改好（改为自动分配）后续跑成功
  const third = await specimenStore.getState().handover('黔南二队', 'X-2026-0001', 'GB', 2026)
  assert.strictEqual(third.rejected.length, 0)
  assert.strictEqual(third.matched.length, 1)
  d1row = await db.specimens.get('d1')
  assert.ok(d1row?.accessionNo && d1row.accessionNo !== allocated && d1row.accessionNo !== 'GB-2026-0050')

  // 改现场编号：馆藏号不动，旧号留痕
  const renamed = await specimenStore.getState().renameFieldNo('d2', 'X-2026-0088')
  assert.strictEqual(renamed.accessionNo, allocated, '改现场号不动馆藏号')
  assert.strictEqual(renamed.fieldNo, 'X-2026-0088')
  assert.strictEqual(renamed.fieldNoHistory.at(-1)?.from, 'X-2026-0002')
  d2row = await db.specimens.get('d2')
  assert.strictEqual(d2row?.fieldNoHistory.length, 1)
  await db.specimens.clear()
  console.log('  ✓ 事务内配对落库；坏行隔离；重送不多配；失败行续跑；改号留痕且馆号不动')
}

await storeTest()


// --- Dexie v3 迁移验证：v2 旧库（code 字段）首次打开 ---
async function migrationTest(): Promise<void> {
  console.log('\nDexie v3 迁移')
  const indexedDB = new IDBFactory()
  globalThis.indexedDB = indexedDB as unknown as IDBFactory

  // 用原生 IndexedDB 造一个 v2 结构的旧库
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.open('gbinsectlog', 2)
    req.onupgradeneeded = (): void => {
      const dbOld = req.result
      const spStore = dbOld.createObjectStore('specimens', { keyPath: 'id' })
      spStore.createIndex('code', 'code', { unique: false })
      dbOld.createObjectStore('sites', { keyPath: 'id' })
      dbOld.createObjectStore('storages', { keyPath: 'id' })
      dbOld.createObjectStore('determinations', { keyPath: 'id' })
      dbOld.createObjectStore('meta', { keyPath: 'key' })
      spStore.put({
        id: 'legacy1',
        code: 'QLB-2026-0007',
        order: '鞘翅目',
        status: '已鉴定',
        siteId: 's1',
        method: '扫网'
      })
    }
    req.onsuccess = () => {
      req.result.close()
      resolve()
    }
    req.onerror = () => reject(req.error)
  })

  // 动态加载使用全局 indexedDB 的 db 实例
  const Dexie = (await import('dexie')).default
  const { InsectLogDb, SCHEMA_VERSION } = await import('../src/hooks/usePersistentStore')
  Dexie.dependencies.indexedDB = indexedDB as unknown as IDBFactory
  assert.strictEqual(SCHEMA_VERSION, 3)
  const db = new InsectLogDb()
  const migrated = await db.table('specimens').toArray()
  assert.strictEqual(migrated.length, 1)
  assert.strictEqual(migrated[0].accessionNo, 'QLB-2026-0007', '旧 code 应迁为馆藏号')
  assert.strictEqual(migrated[0].fieldNo, '', '现场号留空待队里补录')
  assert.strictEqual(migrated[0].team, '')
  assert.deepStrictEqual(migrated[0].fieldNoHistory, [])
  assert.strictEqual((migrated[0] as unknown as { code?: string }).code, undefined, '旧 code 字段应被删除')
  const meta = await db.meta.get('schemaVersion')
  assert.ok(!meta || meta.value !== 2)
  console.log('  ✓ 旧数据首次打开时 code 迁移为 accessionNo，现场侧字段留空')
  console.log(`\n含迁移共 ${passed + 1} 组验证通过`)
}

await migrationTest()
